import { clipAndRebaseDistanceIntervalsToProjectedSide } from '../../src/app/sharedGeometry';

const assertDeepEqual = (actual: unknown, expected: unknown, message = 'Projected interval result differed from expected') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
};

const horizontalSource = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
const horizontalTarget = { start: { x: 2, y: 4 }, end: { x: 8, y: 4 } };

assertDeepEqual(
  clipAndRebaseDistanceIntervalsToProjectedSide(horizontalSource, horizontalTarget, [
    { startDistance: 0, endDistance: 3 }, // Partly before.
    { startDistance: 3, endDistance: 6 }, // Completely inside.
    { startDistance: 7, endDistance: 10 }, // Partly after.
    { startDistance: 9, endDistance: 11 }, // Completely outside.
    { startDistance: 0, endDistance: 2 }, // Exact boundary touch.
    { startDistance: 5, endDistance: 5 }, // Zero length.
  ]),
  [
    { startDistance: 0, endDistance: 1 },
    { startDistance: 1, endDistance: 4 },
    { startDistance: 5, endDistance: 6 },
  ],
);

// Survivors retain input order rather than being sorted.
assertDeepEqual(
  clipAndRebaseDistanceIntervalsToProjectedSide(horizontalSource, horizontalTarget, [
    { startDistance: 5, endDistance: 7 },
    { startDistance: 2, endDistance: 4 },
  ]),
  [
    { startDistance: 3, endDistance: 5 },
    { startDistance: 0, endDistance: 2 },
  ],
);

const verticalSource = { start: { x: 1, y: 0 }, end: { x: 1, y: 10 } };
const verticalTarget = { start: { x: 6, y: 2 }, end: { x: 6, y: 8 } };
assertDeepEqual(
  clipAndRebaseDistanceIntervalsToProjectedSide(verticalSource, verticalTarget, [{ startDistance: 1, endDistance: 9 }]),
  [{ startDistance: 0, endDistance: 6 }],
);

const reversedSource = { start: { x: 10, y: 0 }, end: { x: 0, y: 0 } };
const reversedTarget = { start: { x: 8, y: 4 }, end: { x: 2, y: 4 } };
assertDeepEqual(
  clipAndRebaseDistanceIntervalsToProjectedSide(reversedSource, reversedTarget, [{ startDistance: 1, endDistance: 9 }]),
  [{ startDistance: 0, endDistance: 6 }],
);

// A target reversed relative to its source violates the contract. The current
// unnormalized arithmetic therefore produces no survivors, and remains unchanged.
assertDeepEqual(
  clipAndRebaseDistanceIntervalsToProjectedSide(horizontalSource, reversedTarget, [{ startDistance: 0, endDistance: 10 }]),
  [],
);

console.log('Projected distance interval clipping/rebasing checks passed.');
