import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../../../rules/no-get';

const ruleTester = new ESLintUtils.RuleTester({ parser: '@typescript-eslint/parser' });

const defaultImport = 'import get from \'lodash/get\';';
const destructuredGetOnly = 'import { get } from \'lodash\';';
const destructuredGetWithOther = 'import { merge, get } from \'lodash\';';
const renamedDefaultImport = 'import _get from \'lodash/get\';';
const shouldRemoveImportCases: string[] = [
  defaultImport,
  destructuredGetOnly,
  renamedDefaultImport,
];
const errors = {
  [defaultImport]: 'default',
  [renamedDefaultImport]: 'default',
  [destructuredGetOnly]: 'destructured',
  [destructuredGetWithOther]: 'destructured',
} as const;
const importStatements = [
  defaultImport,
  destructuredGetOnly,
  destructuredGetWithOther,
  renamedDefaultImport,
] as const;
const replacementImport = {
  [destructuredGetWithOther]: 'import { merge } from \'lodash\';',
} as const;

type InvalidTestCase = ESLintUtils.InvalidTestCase<'default' | 'destructured' | 'usage', never[]>;
type TestCaseArgument = {
  name: string,
  commonCode?: string;
  getStatement: string;
  outputBody: string;
  prefix?: string;
};

const buildTestCasesWithFixes = ({
  name,
  commonCode,
  getStatement,
  outputBody,
  prefix,
}: TestCaseArgument): InvalidTestCase[] => importStatements
  .map<InvalidTestCase>((importStatement) => ({
  name: `${name} - ${importStatement}`,
  code: `
      ${prefix ?? ''}
      ${importStatement}
      ${commonCode ?? ''}
      const object = {};
      const value = ${getStatement.replaceAll('get(', importStatement === renamedDefaultImport ? '_get(' : 'get(')};
    `.trim(),
  output: `
      ${prefix ?? ''}${shouldRemoveImportCases.includes(importStatement) ? '' : `
      ${replacementImport[importStatement as typeof destructuredGetWithOther]}`}
      ${commonCode ?? ''}
      const object = {};
      const value = ${outputBody};
    `.trim(),
  errors: [{ messageId: errors[importStatement] }, ...Array.from(
    new Array(getStatement.match(/get\(/g)?.length ?? 0),
    (): { messageId: 'usage' } => ({ messageId: 'usage' }),
  )],
}));
ruleTester.run('no-get rule', rule, {
  valid: [
    {
      code: 'import {chuck} from \'./norris\';',
    },
    {
      code: 'import { get } from \'other-module\';',
    },
    {
      code: 'import get from \'other-module\';',
    },
    {
      code: 'otherProperty.get(object, \'path\', \'\')',
    },
  ],
  invalid: [
    ...buildTestCasesWithFixes({
      name: 'Doubly nested property with string literal fallback',
      getStatement: 'get(object, \'nested.one\', \'\')',
      outputBody: 'object?.nested?.one ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'More deeply nested than one property',
      getStatement: 'get(object, \'nested.three\', \'\')',
      outputBody: 'object?.nested?.three ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'With variable reference in fallback expression',
      commonCode: `
        const fallback = 'test';
      `,
      getStatement: 'get(object, \'nested\', fallback)',
      outputBody: 'object?.nested ?? fallback',
    }),
    ...buildTestCasesWithFixes({
      name: 'With fallback literal',
      getStatement: 'get(object, \'nested\', {})',
      outputBody: 'object?.nested ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Array of path segments',
      getStatement: 'get(object, [\'nested\', \'second\'], {})',
      outputBody: 'object?.nested?.second ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Array references',
      commonCode: `
        const test = {
          test: ['string']
        };
      `,
      getStatement: 'get(test, \'test[0]\', {})',
      outputBody: 'test?.test?.[0] ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Template string with nesting on both left & right side of interpolation',
      commonCode: `
        const path = 'test';
      `,
      // eslint-disable-next-line no-template-curly-in-string
      getStatement: 'get(object, `nested.${path}.deeper`, {})',
      outputBody: 'object?.nested?.[path]?.deeper ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Template string path including an interpolation',
      commonCode: `
        const payloadName = 'payloadName';
      `,
      // eslint-disable-next-line no-template-curly-in-string
      getStatement: 'get(object, `payload.${payloadName}`, {})',
      outputBody: 'object?.payload?.[payloadName] ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Import statement between two imports',
      prefix: 'import test from \'./other\';',
      commonCode: 'import otherFile from \'./module\';',
      getStatement: 'get(a, \'b\')',
      outputBody: 'a?.b',
    }),
    ...buildTestCasesWithFixes({
      name: 'Variable reference for path',
      commonCode: `
        const other = {
          nested: {
            prop: 'test'
          }
        };
      `,
      getStatement: 'get(obj, nested.prop, {})',
      outputBody: 'obj?.[nested.prop] ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Keeps other import',
      commonCode: 'import otherFile from \'./module\';',
      getStatement: 'get(a, \'b\')',
      outputBody: 'a?.b',
    }),
    ...buildTestCasesWithFixes({
      name: 'Starting with an index of an array',
      commonCode: 'const arr = [];',
      getStatement: 'get(arr, \'[0].nested\', {})',
      outputBody: 'arr?.[0]?.nested ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Starting with an index of an array',
      commonCode: 'const arr = [];',
      getStatement: 'get(arr, \'[0][1]\', {})',
      outputBody: 'arr?.[0]?.[1] ?? {}',
    }),
    ...buildTestCasesWithFixes({
      name: 'Array indexes next to dynamic properties',
      commonCode: 'const arr = [];',
      getStatement: 'get(arr, "[0][\'test\']", {})',
      outputBody: 'arr?.[0]?.[\'test\'] ?? {}', // Arguably could be [0]?.test but the path was stylistic before, should be after
    }),
    ...buildTestCasesWithFixes({
      name: 'Invoking a function on the result of the get call',
      getStatement: 'get(window, \'location.href\', \'\').toUpperCase()',
      outputBody: '(window?.location?.href ?? \'\').toUpperCase()',
    }),
    ...buildTestCasesWithFixes({
      name: 'As a logical expression',
      getStatement: 'get(object, \'test\', \'\') || get(object, \'test2\', \'\')',
      outputBody: '(object?.test ?? \'\') || (object?.test2 ?? \'\')',
    }),
    ...buildTestCasesWithFixes({
      name: 'With a conditional expression in the path',
      getStatement: 'get(object, true ? \'left\' : \'right\', \'\')',
      outputBody: 'object?.[true ? \'left\' : \'right\'] ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'With a logical expression in the path',
      getStatement: 'get(object, \'left\' || \'right\', \'\')',
      outputBody: 'object?.[\'left\' || \'right\'] ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'With a function expression in the path',
      commonCode: 'const getPathForTest = () => \'path\';',
      getStatement: 'get(object, getPathForTest(), \'\')',
      outputBody: 'object?.[getPathForTest()] ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'Template string with leading interpolation',
      commonCode: 'const path = \'path\'',
      // eslint-disable-next-line no-template-curly-in-string
      getStatement: 'get(object, `${path}.nested`, \'\')',
      outputBody: 'object?.[path]?.nested ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'With array syntax for paths with variables',
      commonCode: 'const path = \'path\'',
      getStatement: 'get(object, [path, \'nested\'])',
      outputBody: 'object?.[path]?.nested',
    }),
    ...buildTestCasesWithFixes({
      name: 'With array syntax for paths with function expressions',
      commonCode: 'const getPath = () => \'path\'',
      getStatement: 'get(object, [getPath(), \'nested\'])',
      outputBody: 'object?.[getPath()]?.nested',
    }),
    ...buildTestCasesWithFixes({
      name: 'With array syntax where string literal in array is dot notation',
      getStatement: 'get(object, [\'nested.literal\', \'another\'])',
      outputBody: 'object?.nested?.literal?.another',
    }),
    ...buildTestCasesWithFixes({
      name: 'With number literal path',
      getStatement: 'get(object, 0)',
      outputBody: 'object?.[0]',
    }),
    ...buildTestCasesWithFixes({
      name: 'With integer based indexes as dot notation properties in the path',
      getStatement: 'get(object, \'nested.0\')',
      outputBody: 'object?.nested?.[0]',
    }),
    ...buildTestCasesWithFixes({
      name: 'With property names that require strings as keys',
      getStatement: 'get(object, \'x-property\')',
      outputBody: 'object?.[\'x-property\']',
    }),
    ...buildTestCasesWithFixes({
      name: 'With a path that has a template string referencing a nested property',
      // eslint-disable-next-line no-template-curly-in-string
      getStatement: 'get(object, `${props.object}.nested`, \'\')',
      outputBody: 'object?.[props.object]?.nested ?? \'\'',
    }),
    ...buildTestCasesWithFixes({
      name: 'Using the result as a part of a logic expression with fallback',
      getStatement: 'get(object, \'path\', 5) === 5',
      outputBody: '(object?.path ?? 5) === 5',
    }),
    ...buildTestCasesWithFixes({
      name: 'Within a ternary expression',
      getStatement: 'get(object, \'path\', false) ? get(object, \'other\') : get(object, \'third\')',
      outputBody: 'object?.path ?? false ? object?.other : object?.third',
    }),
    // ...buildTestCasesWithFixes({
    //   name: 'Nested get calls',
    //   getStatement: 'get(object, get(object, \'test\', \'\'), \'test\')',
    //   outputBody: 'object?.[object?.test ?? \'\'] ?? \'test\'',
    // }),
  ],
});
export default {};
