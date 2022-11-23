import {
  ESLintUtils, type TSESTree, type TSESLint, AST_NODE_TYPES,
} from '@typescript-eslint/utils';

type PathNode =
  TSESTree.ArrayExpression
  | TSESTree.StringLiteral
  | TSESTree.Identifier
  | TSESTree.TemplateLiteral
  | TSESTree.MemberExpression
  | TSESTree.LogicalExpression
  | TSESTree.ConditionalExpression;
function* templateLiteralConverter(
  expressions: TSESTree.Expression[],
  quasis: TSESTree.TemplateElement[],
): Generator<string> {
  let qIndex = 0;
  let q: TSESTree.TemplateElement | null = quasis[qIndex];
  let eIndex = 0;
  let e: TSESTree.Identifier | null = expressions[eIndex] as TSESTree.Identifier;
  while (e || q) {
    q = quasis[qIndex] ?? null;
    e = expressions[eIndex] as TSESTree.Identifier ?? null;
    if ((!q && e) || (q && e && e.range[0] < q.range[0])) {
      yield `[${e.name}]`; // make it a dynamic key reference
      eIndex += 1;
    } else if (((!e && q) || (q && e && q.range[0] < e.range[0]))) {
      if (qIndex === quasis.length - 1 && q.value.raw === '') {
        return;
      }
      yield q.value.raw.replace(/\.$/, '').replace(/^\./, ''); // remove leading/trailing period
      qIndex += 1;
    }
  }
}

const getPathReplacementString = (path: PathNode, sourceCode: TSESLint.SourceCode): string => {
  switch (path.type) {
    case AST_NODE_TYPES.Literal:
      // Replace array index inline, but if they start with an index accessor it will
      // put ?. to begin, which is accounted for in the caller of this function
      return path.value.split('.').join('?.').replaceAll(/\[([^\]]+)\]/g, '?.[$1]').replace(/^\?\./, '');
    case AST_NODE_TYPES.ArrayExpression:
      return (path.elements as TSESTree.Literal[]).map(({ value }) => value).join('?.');
    case AST_NODE_TYPES.TemplateLiteral: {
      return Array.from(templateLiteralConverter(path.expressions, path.quasis)).join('?.');
    }
    case AST_NODE_TYPES.MemberExpression: {
      return `[${(path.object as TSESTree.Identifier).name}.${(path.property as TSESTree.Identifier).name}]`;
    }
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.ConditionalExpression: {
      return `[${sourceCode.getText(path)}]`;
    }
    default:
      return '';
  }
};
type UsagesArg = {
  context: Parameters<ESLintUtils.RuleCreateAndOptions<any, any, any>['create']>[0];
  node: TSESTree.ImportSpecifier | TSESTree.ImportDefaultSpecifier;
  fixer: TSESLint.RuleFixer;
};
const getProgramFromNode = (node: TSESTree.Node): TSESTree.Program => {
  let program = node.parent;
  while (program?.type !== 'Program') {
    program = program?.parent;
  }
  return program;
};
const addParenthesis = (str: string): string => `(${str})`;
const removeUsages = ({
  context, node, fixer,
}: UsagesArg): TSESLint.RuleFix[] => {
  const fixes: TSESLint.RuleFix[] = [];
  const sourceCode = context.getSourceCode();
  const namedVariable = node.local.name;
  const tokens = sourceCode.getTokens(getProgramFromNode(node));
  tokens.forEach(({ type, value, range }) => {
    const tokenParentNode = sourceCode.getNodeByRangeIndex(range[0])?.parent;
    if (type === 'Identifier' && value === namedVariable && tokenParentNode?.type === 'CallExpression') {
      context.report({
        messageId: 'usage',
        node: tokenParentNode,
      });
      const { arguments: args, parent } = tokenParentNode;
      const targetObj = args[0] as TSESTree.Node;
      const path = args[1] as PathNode;
      const fallback = args[2] as TSESTree.Node;
      const shouldWrapInParenthesis = parent?.type === 'MemberExpression' || parent?.type === 'LogicalExpression';
      const replacement = `${sourceCode.getText(targetObj)}?.${getPathReplacementString(path, sourceCode)}${fallback ? ` ?? ${sourceCode.getText(fallback)}` : ''}`;
      fixes.push(fixer.insertTextAfter(
        tokenParentNode,
        shouldWrapInParenthesis ? addParenthesis(replacement) : replacement,
      ));
      fixes.push(fixer.remove(tokenParentNode));
    }
  });
  return fixes;
};
const getRemoveRangeOfImportStatement = (node: TSESTree.Node): TSESTree.Range => {
  const program = getProgramFromNode(node);
  const currentNodeIndex = program.body.findIndex((n) => n === node);
  if (currentNodeIndex === 0) {
    return [node.range[0], program.body[1]?.range[0] ?? node.range[1]];
  }
  return [program.body[currentNodeIndex - 1]?.range[1] ?? node.range[0], node.range[1]];
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
      usage: 'Using lodash/get prevents strong type inference and therefore is less effective than optional chaining, a native language feature. Remove its usage by replacing with optional chaining.',
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
            const fixes = [fixer.removeRange(getRemoveRangeOfImportStatement(parent))];
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
              fixes = [fixer.removeRange(getRemoveRangeOfImportStatement(parent))];
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
