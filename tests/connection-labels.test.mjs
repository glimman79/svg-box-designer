import assert from 'node:assert/strict';

import {
  getNextConnectionLabel,
  hasConnectionLabelPrefix,
  parseConnectionLabel,
} from '../.test-build/connectionLabels.js';

assert.deepEqual(parseConnectionLabel('E1'), { prefix: 'E', number: 1 });
assert.deepEqual(parseConnectionLabel('TB1'), { prefix: 'TB', number: 1 });
assert.deepEqual(parseConnectionLabel('TB12'), { prefix: 'TB', number: 12 });
assert.deepEqual(parseConnectionLabel('S3'), { prefix: 'S', number: 3 });
assert.deepEqual(parseConnectionLabel('C4'), { prefix: 'C', number: 4 });
assert.deepEqual(parseConnectionLabel('P5'), { prefix: 'P', number: 5 });
assert.equal(parseConnectionLabel('TB'), null);
assert.equal(parseConnectionLabel('TB1-A'), null);
assert.equal(parseConnectionLabel('T B1'), null);
assert.equal(hasConnectionLabelPrefix('TB1', 'E', 'TB'), true);
assert.equal(hasConnectionLabelPrefix('E1', 'E', 'TB'), true);
assert.equal(hasConnectionLabelPrefix('S1', 'E', 'TB'), false);

assert.equal(getNextConnectionLabel('E', []), 'E1');
assert.equal(getNextConnectionLabel('E', ['E1', 'E9', 'TB10', 'S20']), 'E10');
assert.equal(getNextConnectionLabel('TB', ['E9', 'TB1', 'TB2', 'S3']), 'TB3');
assert.equal(getNextConnectionLabel('S', ['S1', 'S9', 'C10', 'P11']), 'S10');
assert.equal(getNextConnectionLabel('C', ['C1', 'C4', 'P5']), 'C5');
assert.equal(getNextConnectionLabel('P', ['P1', 'P5', 'C4']), 'P6');

console.log('connection label parser and allocator checks passed');
