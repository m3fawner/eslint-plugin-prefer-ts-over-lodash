# No Get

## Justification

Lodash get was a great addition to the Javascript eco system in the days of ES5 where
the language was substantially more limited. However, at this point, Lodash get has 
been summarily replaced with optional chaining syntax. As a result, we should not opt
for an external library to perform iterations & logical checks on path segments that
can now be done effectively by the Javascript engine itself.

The default value is applied with a nullish coalescing operator (??). 


## Limitations

Of note: optional chaining paired with nullish coalescing isn't a 100% 1:1 replacement,
as Lodash's get only applies the default when the value located at the defined path is
explicitly undefined. In order to replace the code with 100% behavioral coverage it would
require using the same lengthy expression on both the left & right of a ternary operator.

i.e.

```javascript
const example = get(object, 'nested.path.really.deep', '');
const inlineWithLodash = object?.nested?.path?.really?.deep === undefined ? '' : object?.nested?.path?.really?.deep;
```
## Example use cases

Get with a simple nested path:

```javascript
const example = get(object, 'nested.path.really.deep', '');
const result = object?.nested?.path?.really?.deep ?? '';
```

Get with array syntax for path segments and an expression:

```javascript
const example = get(object, ['nested', 'value', 1 === 2 ? 'never' : 'deeper'], '');
const result = object?.nested?.value?.[1 === 2 ? 'never' : 'deeper'] ?? '';
```