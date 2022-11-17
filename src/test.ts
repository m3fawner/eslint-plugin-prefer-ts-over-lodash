import { ESLintUtils } from '@typescript-eslint/utils';
import rule from './no-get';

const ruleTester = new ESLintUtils.RuleTester({ parser: '@typescript-eslint/parser' });

ruleTester.run('no-get rule', rule, {
  valid: [
    {
      code: 'import {chuck} from \'./norris\'',
    },
    {
      code: 'import { get } from \'other-module\'',
    },
    {
      code: 'import get from \'other-module\'',
    },
  ],
  invalid: [
    {
      code: 'import get from \'lodash/get\'',
      errors: [{ messageId: 'default' }],
      output: '',
    },
    {
      code: 'import { get } from \'lodash\'',
      errors: [{ messageId: 'destructured' }],
      output: '',
    },
    {
      code: 'import { get as _get } from \'lodash\'',
      errors: [{ messageId: 'destructured' }],
      output: '',
    },
    {
      code: 'import { merge, get } from \'lodash\'',
      errors: [{ messageId: 'destructured' }],
      output: 'import { merge } from \'lodash\'',
    },
    {
      code: 'import get from \'lodash/get\';const object = {};const value = get(object, \'nested.one\', \'\');',
      errors: [{ messageId: 'default' }],
      output: 'const object = {};const value = object?.nested?.one ?? \'\';',
    },
    {
      code: 'import _get from \'lodash/get\';const object = {};const value = _get(object, \'nested.two\', \'\');',
      errors: [{ messageId: 'default' }],
      output: 'const object = {};const value = object?.nested?.two ?? \'\';',
    },
    {
      code: 'import { get } from \'lodash\';const object = {};const value = get(object, \'nested.three\', \'\');',
      errors: [{ messageId: 'destructured' }],
      output: 'const object = {};const value = object?.nested?.three ?? \'\';',
    },
  ],
});
