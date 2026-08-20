import { collectSourceEdgeAuthoringClaims, validateSourceEdgeReplacementClaims } from '../../src/app/authoringRelationships';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { availableWallOrientationsForPanelPair, resolveTBPanelPairOrientation, validateWallConnection,
  validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../../src/svgUtils';
import { getEdgeAssignmentDisplayLabels } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const equal = <T>(actual: T, expected: T, message: string) => assert(actual === expected, `${message}: ${actual} != ${expected}`);
const panel = (id: string, edgeIds: string[]) => ({ id, edgeIds, contour: [], holes: [], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } });
const model = { panels: [panel('P', ['p1', 'p2', 'p3']), panel('Q', ['q1', 'q2', 'q3']), panel('R', ['r1'])], edges: [] } as unknown as SvgDocumentModel;
const tb = (id: string) => ({ id, prefix: 'TB' as const, properties: { fingerWidthMm: 9, isFingerWidthManual: false } });
const wall = (id: string) => ({ id, prefix: 'W' as const, properties: {} });
const slot = (id: string) => ({ id, prefix: 'S' as const, properties: { slotOffsetMm: 0, slotLengthMm: 9, isSlotLengthManual: false, kerfMm: 0 } });
const edge = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
const slotEdge = (connectionId: string, slotRole: 'A' | 'B') => ({ slotAssignments: [{ connectionId, slotRole }] });

const freeConnections: ConnectionMap = { W1: wall('W1'), W2: wall('W2') };
equal(resolveTBPanelPairOrientation('P', 'Q', model, {}, freeConnections), 'NO_TB_ORIENTATION', 'no TB');
equal(availableWallOrientationsForPanelPair('P', 'Q', model, {}, freeConnections).length, 2, 'free orientations');
validateWallConnection(model, { p1: edge('W1', 'A'), q1: edge('W1', 'B') }, freeConnections, 'W1');
validateWallConnection(model, { p1: edge('W1', 'B'), q1: edge('W1', 'A') }, freeConnections, 'W1');
for (const role of ['A', 'B'] as const) {
  try { validateWallConnection(model, { p1: edge('W1', role), q1: edge('W1', role) }, freeConnections, 'W1'); assert(false, `duplicate ${role} accepted`); }
  catch (error) { assert((error as Error).message.includes('exactly one'), `duplicate ${role} diagnostic`); }
}

const abConnections: ConnectionMap = { ...freeConnections, TB99: tb('TB99') };
const ab: EdgeAssignmentRecord = { p2: edge('TB99', 'A'), q2: edge('TB99', 'B') };
equal(resolveTBPanelPairOrientation('P', 'Q', model, ab, abConnections), 'P_A_Q_B', 'different-edge AB');
equal(availableWallOrientationsForPanelPair('P', 'Q', model, ab, abConnections)[0], 'P_WA_Q_WB', 'constrained AB');
try { validateWallConnection(model, { ...ab, p1: edge('W1', 'B'), q1: edge('W1', 'A') }, abConnections, 'W1'); assert(false, 'reversed Wall accepted'); }
catch (error) { assert((error as Error).message.includes('conflicts'), 'reversed diagnostic'); }

const contradictoryConnections: ConnectionMap = { ...abConnections, TB2: tb('TB2') };
const contradictory = { ...ab, p3: edge('TB2', 'B'), q3: edge('TB2', 'A') };
equal(resolveTBPanelPairOrientation('P', 'Q', model, contradictory, contradictoryConnections), 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION', 'contradictory');
equal(availableWallOrientationsForPanelPair('P', 'Q', model, contradictory, contradictoryConnections).length, 0, 'fail closed');
equal(resolveTBPanelPairOrientation('P', 'Q', model, { p2: edge('TB99', 'A') }, abConnections), 'NO_TB_ORIENTATION', 'incomplete TB');
equal(resolveTBPanelPairOrientation('P', 'Q', model, { p2: edge('TB99', 'A'), r1: edge('TB99', 'B') }, abConnections), 'NO_TB_ORIENTATION', 'unrelated TB');

const authored = { p1: edge('W1', 'A'), q1: edge('W1', 'B') };
const claims = collectSourceEdgeAuthoringClaims(model, authored, freeConnections);
equal(getEdgeAssignmentDisplayLabels(authored.p1)[0], 'W1-A', 'canvas W-A label');
equal(getEdgeAssignmentDisplayLabels(authored.q1)[0], 'W1-B', 'canvas W-B label');
equal(claims.length, 2, 'Wall claims');
assert(claims.every((claim) => claim.kind === 'replaces' && claim.contributorId === 'W' && claim.operationId === 'operation:W:W1'), 'canonical Wall claims');
validateSourceEdgeReplacementClaims(collectSourceEdgeAuthoringClaims(model,
  { p1: { ...edge('W1', 'A'), ...slotEdge('S1', 'B') }, q1: edge('W1', 'B') }, { ...freeConnections, S1: slot('S1') }));
try { validateSourceEdgeReplacementClaims(collectSourceEdgeAuthoringClaims(model, { p1: edge('W1', 'A'), q1: edge('W2', 'B') }, freeConnections)); assert(false, 'W/W replacement accepted'); }
catch { /* expected */ }
try { validateSourceEdgeReplacementClaims(collectSourceEdgeAuthoringClaims(model, { p1: edge('W1', 'A') }, { ...freeConnections, TB1: tb('TB1') })); } catch { /* bucket cannot hold two replacers by design */ }
try { validateWallAuthoringForApply(model, authored, { W1: wall('W1') }); assert(false, 'Wall silently applied'); }
catch (error) { assert((error as Error).message.includes('not implemented in B2'), 'explicit Apply diagnostic'); }

const restoredAssignments = structuredClone(authored); const restoredConnections = structuredClone(freeConnections);
validateWallConnection(model, restoredAssignments, restoredConnections, 'W1');
equal(restoredAssignments.p1.edgeAssignment?.connectionId, 'W1', 'restore id');
equal(restoredAssignments.p1.edgeAssignment?.edgeRole, 'A', 'restore role');

console.log('PASS Wall native model, W1/W2 persistence, cardinality, free and TB-constrained orientation');
console.log('PASS canonical W REPLACES claims, S-B sharing, restore, and explicit not-generatable Apply');
