import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../../../rules/no-get';

const ruleTester = new ESLintUtils.RuleTester({ parser: '@typescript-eslint/parser' });

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
  ],
  invalid: [
    {
      code: 'import get from \'lodash/get\';',
      errors: [{ messageId: 'default' }],
      output: '',
    },
    {
      code: 'import { get } from \'lodash\';',
      errors: [{ messageId: 'destructured' }],
      output: '',
    },
    {
      code: 'import { get as _get } from \'lodash\';',
      errors: [{ messageId: 'destructured' }],
      output: '',
    },
    {
      code: 'import { merge, get } from \'lodash\';',
      errors: [{ messageId: 'destructured' }],
      output: 'import { merge } from \'lodash\';',
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const value = get(object, 'nested.one', '');
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const value = object?.nested?.one ?? '';
      `,
    },
    {
      code: `
        import _get from 'lodash/get';
        const object = {};
        const value = _get(object, 'nested.two', '');
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const value = object?.nested?.two ?? '';
      `,
    },
    {
      code: `
        import { get } from 'lodash';
        const object = {};
        const value = get(object, 'nested.three', '');
      `,
      errors: [{ messageId: 'destructured' }],
      output: `
        const object = {};
        const value = object?.nested?.three ?? '';
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const fallback = {};
        const value = get(object, 'nested', fallback);
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const fallback = {};
        const value = object?.nested ?? fallback;
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const value = get(object, 'nested', {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const value = object?.nested ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const value = get(object, ['nested','second'], {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const value = object?.nested?.second ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const value = get(object, 'test[0]', {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const value = object?.test?.[0] ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const path = window.location;
        const value = get(object, path, {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const path = window.location;
        const value = object?.[path] ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const path = 'test';
        const value = get(object, \`nested.\${path}\`, {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const path = 'test';
        const value = object?.nested?.[path] ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const object = {};
        const path = 'test';
        const value = get(object, \`nested.\${path}.deeper\`, {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const object = {};
        const path = 'test';
        const value = object?.nested?.[path]?.deeper ?? {};
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const t = (state, action) => ({
          ...state,[stateKey]: {
            ...successMaybeState,
            data: get(action, \`payload.\${payloadName}\`, {})
          }
        });
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const t = (state, action) => ({
          ...state,[stateKey]: {
            ...successMaybeState,
            data: action?.payload?.[payloadName] ?? {}
          }
        });
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        const obj = {};
        const other = {
          nested: {
            prop: 'test'
          }
        };
        const t = get( obj, nested.prop, {});
      `,
      errors: [{ messageId: 'default' }],
      output: `
        const obj = {};
        const other = {
          nested: {
            prop: 'test'
          }
        };
        const t = obj?.[nested.prop] ?? {};
      `,
    },
    {
      code: `
        import test from './other';
        import get from 'lodash/get';
        import otherFile from './module';
      `,
      errors: [{ messageId: 'default' }],
      output: `
        import test from './other';
        import otherFile from './module';
      `,
    },
    {
      code: `
        import get from 'lodash/get';
        import otherFile from './module';
      `,
      errors: [{ messageId: 'default' }],
      output: `
        import otherFile from './module';
      `,
    },
    {
      code: `
        import otherFile from './module';
        import get from 'lodash/get';
      `,
      errors: [{ messageId: 'default' }],
      output: `
        import otherFile from './module';
      `,
    },
  ],
});

export default {};
