import {
  ESLintUtils, type TSESTree, type TSESLint, AST_NODE_TYPES,
} from '@typescript-eslint/utils';

function* templateLiteralConverter(
  expressions: TSESTree.Expression[],
  quasis: TSESTree.TemplateElement[],
  sourceCode: TSESLint.SourceCode,
): Generator<string> {
  let qIndex = 0;
  let q: TSESTree.TemplateElement | null = quasis[qIndex];
  let eIndex = 0;
  let e: TSESTree.Identifier | null = expressions[eIndex] as TSESTree.Identifier;
  while (e || q) {
    q = quasis[qIndex] ?? null;
    e = expressions[eIndex] as TSESTree.Identifier ?? null;
    if ((!q && e) || (q && e && e.range[0] < q.range[0])) {
      yield `[${sourceCode.getText(e)}]`; // make it a dynamic key reference
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

type NonNullArrayExpressionElements = Array<Exclude<TSESTree.ArrayExpression['elements'][number], null>>;
const removeNullElements = (eles: TSESTree.ArrayExpression['elements']): NonNullArrayExpressionElements => eles.filter((ele) => ele !== null) as NonNullArrayExpressionElements;
const isValidDotNotationProperty = (property: string): boolean => /^[^\d][_\w\d$]*$/.test(property);
const joinBracketedProperties = (str: string): string => {
  // If only one bracketed property
  if (str.indexOf('[') === str.lastIndexOf('[')) {
    return `?.${str}`;
  }
  return str.split('[').join('?.['); // spit removes the [, add back in with ?.
};
const getPathFromLiteral = (path: TSESTree.Literal): string => {
  // Replace array index inline, but if they start with an index accessor it will
  // put ?. to begin, which is accounted for in the caller of this function
  if (path.value === null) {
    return '';
  }
  if (typeof path.value === 'number') {
    return `[${path.value}]`;
  }
  const pathSegments = (path.value as string).split('.');
  const joinedSegments = pathSegments.reduce((acc, segment) => {
    const firstBracket = segment.indexOf('[');
    let segmentValue = '';
    // if the segment is a bracketed property, then there is no rest to worry about as the
    // whole segment must be a set of bracketed properties and can be dropped into the acc
    if (firstBracket === 0) {
      segmentValue = joinBracketedProperties(segment);
    } else {
      // if no bracket, 0 to undefined is the whole string
      const upToBracket = segment.substring(0, firstBracket === -1 ? undefined : firstBracket);
      const rest = firstBracket === -1 ? '' : segment.substring(firstBracket);
      const joinedWithChaining = rest && joinBracketedProperties(rest);
      if (isValidDotNotationProperty(upToBracket)) {
        segmentValue = upToBracket + joinedWithChaining;
      // Index properties
      } else if (/^\d/.test(upToBracket)) {
        segmentValue = `[${upToBracket}]${joinedWithChaining}`;
      // Properties that require quotes (i.e. x-header-value)
      } else {
        segmentValue = `['${upToBracket}']${joinedWithChaining}`;
      }
    }
    if (acc) {
      return `${acc}?.${segmentValue}`;
    }
    return segmentValue;
  }, '');
  return joinedSegments.replace(/^\?\./, '');
};
const isNodeAlsoAGet = (getName: string, parent?: TSESTree.Node): boolean => {
  if (!parent) return false;
  if (parent.type !== 'CallExpression') return false;
  if (parent.callee.type !== 'Identifier') return false;
  if (parent.callee.name !== getName) return false;
  return true;
};
const getPathReplacementString = (
  path: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
  namedVariable: string,
): string => {
  switch (path.type) {
    case AST_NODE_TYPES.Literal:
      return getPathFromLiteral(path);
    case AST_NODE_TYPES.ArrayExpression:
      return removeNullElements(path.elements)
        .map((element) => {
          if (element.type === AST_NODE_TYPES.Literal) {
            return getPathFromLiteral(element);
          }
          return `[${sourceCode.getText(element)}]`;
        })
        .join('?.');
    case AST_NODE_TYPES.TemplateLiteral: {
      return Array.from(templateLiteralConverter(path.expressions, path.quasis, sourceCode)).join('?.').replace(/^\?\./, '');
    }
    case AST_NODE_TYPES.MemberExpression: {
      return `[${(path.object as TSESTree.Identifier).name}.${(path.property as TSESTree.Identifier).name}]`;
    }
    case AST_NODE_TYPES.CallExpression: {
      if (isNodeAlsoAGet(namedVariable, path)) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return `[${getReplacementStringForGetCallExpression(path, sourceCode, namedVariable)}]`;
      }
      return `[${sourceCode.getText(path)}]`;
    }
    default:
      return `[${sourceCode.getText(path)}]`;
  }
};
const getReplacementStringForGetCallExpression = (
  getNode: TSESTree.CallExpression,
  sourceCode: TSESLint.SourceCode,
  getName: string,
): string => {
  const { arguments: args } = getNode;
  const targetObj = args[0] as TSESTree.Node;
  const path = args[1] as TSESTree.Node;
  const fallback = args[2] as TSESTree.Node;
  return `${sourceCode.getText(targetObj)}?.${getPathReplacementString(path, sourceCode, getName)}${fallback ? ` ?? ${sourceCode.getText(fallback)}` : ''}`;
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
    if (type === 'Identifier' && value === namedVariable && tokenParentNode?.type === 'CallExpression' && !isNodeAlsoAGet(namedVariable, tokenParentNode.parent)) {
      context.report({
        messageId: 'usage',
        node: tokenParentNode,
      });
      const tokenParentNodeType = tokenParentNode.parent?.type;
      const shouldWrapInParenthesis = tokenParentNodeType === 'MemberExpression' || tokenParentNodeType === 'LogicalExpression' || tokenParentNodeType === 'BinaryExpression';
      const replacement = getReplacementStringForGetCallExpression(
        tokenParentNode,
        sourceCode,
        namedVariable,
      );
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
            try {
              const fixes = [fixer.removeRange(getRemoveRangeOfImportStatement(parent))];
              return [...fixes, ...removeUsages({
                context, node, fixer,
              })];
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e, context.getSourceCode().getText(parent));
              return [];
            }
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
            try {
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
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e, context.getSourceCode().getText(parent));
              return [];
            }
          },
        });
      }
      return null;
    },
  }),
});
