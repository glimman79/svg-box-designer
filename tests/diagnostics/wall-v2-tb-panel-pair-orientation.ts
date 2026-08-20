// Domain-contract diagnostic only. This intentionally does not export production Wall behavior.
type PanelId = string & { readonly __panelId: unique symbol };
type ConnectionId = string & { readonly __connectionId: unique symbol };
type SourceEdgeId = string & { readonly __sourceEdgeId: unique symbol };
type TBRole = 'A' | 'B';
type OrientationKind =
  | 'NO_TB_ORIENTATION'
  | 'P_A_Q_B'
  | 'P_B_Q_A'
  | 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
type WallOrientation = 'P_WA_Q_WB' | 'P_WB_Q_WA';
type TBConnection = Readonly<{ id: ConnectionId; prefix: 'TB' }>;
type TBAssignment = Readonly<{
  connectionId: ConnectionId;
  panelId: PanelId;
  sourceEdgeId: SourceEdgeId;
  role: TBRole;
  // Geometry is deliberately evidence that must not affect the resolver.
  rawStart?: Readonly<{ x: number; y: number }>;
  rawEnd?: Readonly<{ x: number; y: number }>;
}>;

const panel = (id: string) => id as PanelId;
const connection = (id: string): TBConnection => ({ id: id as ConnectionId, prefix: 'TB' });
const edge = (id: string) => id as SourceEdgeId;
const assignment = (connectionId: string, panelId: PanelId, role: TBRole, sourceEdgeId: string): TBAssignment => ({
  connectionId: connectionId as ConnectionId, panelId, role, sourceEdgeId: edge(sourceEdgeId),
});
const assert: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(message);
};
const equal = <T>(actual: T, expected: T, message: string) =>
  assert(actual === expected, `${message}: ${String(actual)} != ${String(expected)}`);

const resolveTBPanelPairOrientation = (
  panelP: PanelId,
  panelQ: PanelId,
  tbConnections: readonly TBConnection[],
  assignments: readonly TBAssignment[],
): OrientationKind => {
  if (panelP === panelQ) return 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
  const votes = new Set<Exclude<OrientationKind, 'NO_TB_ORIENTATION' | 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION'>>();

  for (const { id } of tbConnections) {
    const authored = assignments.filter((candidate) => candidate.connectionId === id);
    const roles = new Set(authored.map(({ role }) => role));
    if (!(roles.has('A') && roles.has('B'))) continue; // Incomplete draft: no oracle.

    const relevant = authored.filter(({ panelId }) => panelId === panelP || panelId === panelQ);
    const exactlyTwo = authored.length === 2 && relevant.length === 2;
    const pAssignments = relevant.filter(({ panelId }) => panelId === panelP);
    const qAssignments = relevant.filter(({ panelId }) => panelId === panelQ);
    const unambiguous = exactlyTwo && pAssignments.length === 1 && qAssignments.length === 1
      && pAssignments[0].role !== qAssignments[0].role;
    if (!unambiguous) {
      // Only malformed complete evidence involving both candidate panels is relevant.
      if (pAssignments.length > 0 && qAssignments.length > 0) return 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
      continue;
    }
    votes.add(pAssignments[0].role === 'A' ? 'P_A_Q_B' : 'P_B_Q_A');
  }
  if (votes.size === 0) return 'NO_TB_ORIENTATION';
  if (votes.size > 1) return 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
  return [...votes][0];
};

const availableWallOrientationsForPanelPair = (orientation: OrientationKind): readonly WallOrientation[] => {
  if (orientation === 'NO_TB_ORIENTATION') return ['P_WA_Q_WB', 'P_WB_Q_WA'];
  if (orientation === 'P_A_Q_B') return ['P_WA_Q_WB'];
  if (orientation === 'P_B_Q_A') return ['P_WB_Q_WA'];
  return [];
};

const P = panel('P'); const Q = panel('Q'); const R = panel('R'); const S = panel('S');
const ab = [assignment('TB7', P, 'A', 'p-top'), assignment('TB7', Q, 'B', 'q-top')];
const ba = [assignment('TB8', P, 'B', 'p-bottom'), assignment('TB8', Q, 'A', 'q-bottom')];
const resolve = (connections: readonly TBConnection[], authored: readonly TBAssignment[]) =>
  resolveTBPanelPairOrientation(P, Q, connections, authored);

equal(resolve([], []), 'NO_TB_ORIENTATION', 'no TB');
assert(availableWallOrientationsForPanelPair(resolve([], [])).length === 2, 'no TB must offer both Wall orientations');
equal(resolve([connection('TB7')], ab), 'P_A_Q_B', 'one P=A/Q=B');
equal(availableWallOrientationsForPanelPair(resolve([connection('TB7')], ab))[0], 'P_WA_Q_WB', 'AB Wall availability');
equal(resolve([connection('TB8')], ba), 'P_B_Q_A', 'one P=B/Q=A');
equal(availableWallOrientationsForPanelPair(resolve([connection('TB8')], ba))[0], 'P_WB_Q_WA', 'BA Wall availability');

const ab2 = [assignment('TB9', P, 'A', 'p-other-edge'), assignment('TB9', Q, 'B', 'q-other-edge')];
const ba2 = [assignment('TB9', P, 'B', 'p-other-edge'), assignment('TB9', Q, 'A', 'q-other-edge')];
equal(resolve([connection('TB7'), connection('TB9')], [...ab, ...ab2]), 'P_A_Q_B', 'two consistent AB');
equal(resolve([connection('TB8'), connection('TB9')], [...ba, ...ba2]), 'P_B_Q_A', 'two consistent BA');
const contradictoryConnections = [connection('TB7'), connection('TB8')];
equal(resolve(contradictoryConnections, [...ab, ...ba]), 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION', 'contradictory TB');
assert(availableWallOrientationsForPanelPair(resolve(contradictoryConnections, [...ab, ...ba])).length === 0,
  'contradiction must fail closed');

equal(resolve([...contradictoryConnections].reverse(), [...ab, ...ba]), 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION',
  'connection insertion order');
equal(resolve(contradictoryConnections, [...ab, ...ba].reverse()), 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION',
  'assignment insertion order');
const renamed = [assignment('alpha', P, 'A', 'x'), assignment('alpha', Q, 'B', 'y')];
equal(resolve([connection('alpha')], renamed), 'P_A_Q_B', 'connection IDs');

const unrelated = [
  assignment('TB-PR', P, 'B', 'p-r'), assignment('TB-PR', R, 'A', 'r-p'),
  assignment('TB-QS', Q, 'A', 'q-s'), assignment('TB-QS', S, 'B', 's-q'),
];
equal(resolve([connection('TB-PR'), connection('TB-QS')], unrelated), 'NO_TB_ORIENTATION', 'unrelated TB');
equal(resolve([connection('TB7')], [assignment('TB7', P, 'A', 'draft')]), 'NO_TB_ORIENTATION', 'incomplete A draft');
equal(resolve([connection('TB7')], [assignment('TB7', Q, 'B', 'draft')]), 'NO_TB_ORIENTATION', 'incomplete B draft');
const malformed = [...ab, assignment('TB7', P, 'B', 'duplicate')];
equal(resolve([connection('TB7')], malformed), 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION', 'malformed complete TB');

const transform = (item: TBAssignment, degrees: number, dx: number, dy: number, reverse: boolean): TBAssignment => {
  const rotate = ({ x, y }: { x: number; y: number }) => {
    const radians = degrees * Math.PI / 180;
    return { x: x * Math.cos(radians) - y * Math.sin(radians) + dx,
      y: x * Math.sin(radians) + y * Math.cos(radians) + dy };
  };
  const start = rotate({ x: 0, y: 0 }); const end = rotate({ x: 10, y: 0 });
  return { ...item, rawStart: reverse ? end : start, rawEnd: reverse ? start : end };
};
for (const [label, degrees, dx, dy] of [
  ['base', 0, 0, 0], ['90 degrees', 90, 0, 0], ['27 degrees', 27, 0, 0], ['translation', 0, 137, -43],
] as const) {
  for (const reverse of [false, true]) {
    const transformed = ab.map((item) => transform(item, degrees, dx, dy, reverse));
    equal(resolve([connection('TB7')], transformed), 'P_A_Q_B', `${label}, ${reverse ? 'CW/reversed raw edges' : 'CCW'}`);
  }
}

console.log('PASS no/one/consistent/contradictory TB panel-pair orientations and Wall availability');
console.log('PASS connection/assignment order, IDs, unrelated panels, and different source edges');
console.log('PASS incomplete drafts ignored; malformed complete candidate-pair evidence fails closed');
console.log('PASS raw edge reversal, CW/CCW, 90/27 degree rotation, and translation independence');
