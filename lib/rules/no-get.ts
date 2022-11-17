import { ESLintUtils, type TSESTree, type TSESLint } from '@typescript-eslint/utils';

type UsagesArg = {
  context: Parameters<ESLintUtils.RuleCreateAndOptions<any, any, any>['create']>[0];
  node: TSESTree.ImportSpecifier | TSESTree.ImportDefaultSpecifier;
  fixer: TSESLint.RuleFixer;
};
const removeUsages = ({
  context, node, fixer,
}: UsagesArg): TSESLint.RuleFix[] => {
  const fixes: TSESLint.RuleFix[] = [];
  const sourceCode = context.getSourceCode();
  const namedVariable = node.local.name;
  let program = node.parent;
  while (program?.type !== 'Program') {
    program = program?.parent;
  }
  const tokens = sourceCode.getTokens(program);
  tokens.forEach(({ type, value, range }) => {
    const tokenParentNode = sourceCode.getNodeByRangeIndex(range[0])?.parent;
    if (type === 'Identifier' && value === namedVariable && tokenParentNode?.type === 'CallExpression') {
      const { arguments: args } = tokenParentNode;
      const targetObj = args[0] as TSESTree.Identifier;
      const path = args[1] as TSESTree.Literal;
      const fallback = args[2] as (TSESTree.Literal | TSESTree.Identifier);
      const chainedPath = (path.value as string).split('.').join('?.');
      fixes.push(fixer.insertTextAfter(tokenParentNode, `${targetObj.name}?.${chainedPath}${fallback ? ` ?? ${(fallback as TSESTree.Literal).raw ?? (fallback as TSESTree.Identifier).name}` : ''}`));
      fixes.push(fixer.remove(tokenParentNode));
    }
  });
  return fixes;
};
export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent the usage of lodash/get in favor of optional chaining to ensure stronger Typescript type safety',
      recommended: 'error',
    },
    messages: {
      default: 'Importing lodash/get is not allowed, use optional chaining.',
      destructured: 'Importing get from lodash is not allowed, use optional chaining.',
    },
    fixable: 'code',
    schema: [],
  },
  defaultOptions: [],
  create: (context) => ({
    ImportDefaultSpecifier: (node) => {
      if (!node.parent) { return null; }
      const parent = node.parent as TSESTree.ImportDeclaration;
      if (parent.source.value === 'lodash/get') {
        context.report({
          messageId: 'default',
          node,
          fix: (fixer) => {
            const fixes = [fixer.remove(parent)];
            return [...fixes, ...removeUsages({
              context, node, fixer,
            })];
          },
        });
      }
      return null;
    },
    ImportSpecifier: (node) => {
      if (!node.parent) { return null; }
      const parent = node.parent as TSESTree.ImportDeclaration;
      if (node.imported.name === 'get' && parent.source.value === 'lodash') {
        context.report({
          messageId: 'destructured',
          node,
          fix: (fixer) => {
            let fixes = [];
            if (parent.specifiers.length === 1) {
              fixes = [fixer.remove(parent)];
            } else {
              const sourceCode = context.getSourceCode();
              const [before, curr, after] = sourceCode.getTokens(node, 1, 1);
              if (before === null) {
                return null;
              }
              const beforeIsComma = before.type === 'Punctuator' && before.value === ',';
              fixes = (beforeIsComma ? [fixer.remove(before)] : [])
                .concat(fixer.remove(node))
                .concat(sourceCode.isSpaceBetweenTokens(curr, after)
                  ? fixer.removeRange([curr.range[1], curr.range[1] + 1]) : []);
            }
            return [...fixes, ...removeUsages({
              context, node, fixer,
            })];
          },
        });
      }
      return null;
    },
  }),
});
