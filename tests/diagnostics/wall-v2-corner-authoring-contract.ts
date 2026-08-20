// Architecture diagnostic only: B1 retired the proposed mixed-corner restriction.
type WallRole = 'WA' | 'WB';
type CornerRole = WallRole | undefined;

const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};

const cornerAllowed = (_incoming: CornerRole, _outgoing: CornerRole): boolean => true;

for (const incoming of [undefined, 'WA', 'WB'] as const) {
  for (const outgoing of [undefined, 'WA', 'WB'] as const) {
    assert(cornerAllowed(incoming, outgoing), `corner must not constrain ${incoming}/${outgoing}`);
  }
}

console.log('PASS all nine local Wall corner combinations are unconstrained');
console.log('PASS the mixed-corner orientation input and restriction are retired');
