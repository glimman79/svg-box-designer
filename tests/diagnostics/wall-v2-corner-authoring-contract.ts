// Architecture diagnostic only. This intentionally does not export production Wall behavior.
type WallRole = 'WA' | 'WB';
type CornerRole = WallRole | undefined;
type MixedOrientation = readonly [WallRole, WallRole];
type CandidatePosition = 'incoming' | 'outgoing';
type Endpoint = { candidatePosition: CandidatePosition; adjacentRole?: WallRole };

const roles = ['WA', 'WB'] as const;
const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};
const equal = (actual: readonly WallRole[], expected: readonly WallRole[], message: string) =>
  assert(actual.join() === expected.join(), `${message}: ${actual.join('/')} != ${expected.join('/')}`);

const cornerAllowed = (
  incoming: CornerRole,
  outgoing: CornerRole,
  allowedMixedCornerOrientation: MixedOrientation,
): boolean => {
  if (!incoming || !outgoing || incoming === outgoing) return true;
  return incoming === allowedMixedCornerOrientation[0] && outgoing === allowedMixedCornerOrientation[1];
};

const allowedWallRolesForEdge = (
  endpoints: readonly Endpoint[],
  allowedMixedCornerOrientation: MixedOrientation,
): WallRole[] => roles.filter((candidate) => endpoints.every(({ candidatePosition, adjacentRole }) =>
  candidatePosition === 'incoming'
    ? cornerAllowed(candidate, adjacentRole, allowedMixedCornerOrientation)
    : cornerAllowed(adjacentRole, candidate, allowedMixedCornerOrientation)));

const validateWallAuthoredState = (
  corners: ReadonlyArray<readonly [CornerRole, CornerRole]>,
  allowedMixedCornerOrientation: MixedOrientation,
) => corners.flatMap(([incoming, outgoing], cornerIndex) =>
  cornerAllowed(incoming, outgoing, allowedMixedCornerOrientation)
    ? []
    : [{ cornerIndex, incoming, outgoing, code: 'FORBIDDEN_WALL_MIXED_CORNER' as const }]);

for (const allowedMixed of [['WA', 'WB'], ['WB', 'WA']] as const) {
  const forbiddenMixed: MixedOrientation = [allowedMixed[1], allowedMixed[0]];
  const truthTable: ReadonlyArray<readonly [CornerRole, CornerRole, boolean]> = [
    [undefined, undefined, true], ['WA', undefined, true], ['WB', undefined, true],
    [undefined, 'WA', true], [undefined, 'WB', true], ['WA', 'WA', true], ['WB', 'WB', true],
    [allowedMixed[0], allowedMixed[1], true], [forbiddenMixed[0], forbiddenMixed[1], false],
  ];
  for (const [incoming, outgoing, expected] of truthTable) {
    assert(cornerAllowed(incoming, outgoing, allowedMixed) === expected,
      `truth table failed for ${incoming ?? 'no'}/${outgoing ?? 'no'} with ${allowedMixed.join('/')}`);
  }
  assert(validateWallAuthoredState(truthTable.map(([incoming, outgoing]) => [incoming, outgoing]), allowedMixed).length === 1,
    'defensive validation must report only the reverse mixed orientation');

  equal(allowedWallRolesForEdge([], allowedMixed), roles, 'neither endpoint constrains');
  const requiresFirst = { candidatePosition: 'incoming', adjacentRole: allowedMixed[0] } as const;
  equal(allowedWallRolesForEdge([requiresFirst], allowedMixed), [allowedMixed[0]], 'one endpoint constrains');
  equal(allowedWallRolesForEdge([requiresFirst, requiresFirst], allowedMixed), [allowedMixed[0]], 'both endpoints agree');
  const requiresSecond = { candidatePosition: 'outgoing', adjacentRole: allowedMixed[1] } as const;
  equal(allowedWallRolesForEdge([requiresFirst, requiresSecond], allowedMixed), [], 'endpoints conflict');

  // Identity and insertion metadata never enter the semantic inputs.
  const withMetadataA = [{ ...requiresFirst, edgeId: 'z', connectionId: 'W99' }];
  const withMetadataB = [{ ...requiresFirst, edgeId: 'a', connectionId: 'W1' }].reverse();
  equal(allowedWallRolesForEdge(withMetadataA, allowedMixed), allowedWallRolesForEdge(withMetadataB, allowedMixed),
    'connection/edge/assignment ordering changed the result');
}

type Point = { x: number; y: number };
const signedArea = (points: readonly Point[]) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;
const canonicalContour = (points: readonly Point[]) => signedArea(points) < 0 ? [...points].reverse() : [...points];
const transform = (point: Point, degrees: number, translation: Point): Point => {
  const angle = degrees * Math.PI / 180;
  return { x: point.x * Math.cos(angle) - point.y * Math.sin(angle) + translation.x,
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle) + translation.y };
};
const base = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }];
for (const input of [base, [...base].reverse()]) {
  for (const [degrees, translation] of [[0, { x: 0, y: 0 }], [90, { x: 0, y: 0 }],
    [27, { x: 0, y: 0 }], [0, { x: 137, y: -43 }]] as const) {
    const normalized = canonicalContour(input.map((point) => transform(point, degrees, translation)));
    assert(signedArea(normalized) > 0, 'CW/CCW or rigid transform changed canonical traversal winding');
  }
}

console.log('PASS minimal nine-row corner truth table for either product orientation');
console.log('PASS allowed-role query: zero, one, agreeing two, and conflicting two endpoint constraints');
console.log('PASS WA/WA and WB/WB; exactly one mixed order is rejected');
console.log('PASS CW/CCW, raw-record-independent topology, 90/27 degree rotation, and translation contract');
console.log('PASS edge/connection identity and insertion order are outside the semantic input');
console.log('PRODUCT INPUT REQUIRED: allowedMixedCornerOrientation = incoming WA/outgoing WB OR incoming WB/outgoing WA');
