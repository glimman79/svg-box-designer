import { collectSourceEdgeAuthoringClaims } from '../../src/app/authoringRelationships';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { getWallAssignments, normalizeWallConnection, resolveTBOrientationForPanelPair, validateWallConnection,
  validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import { getEdgeAssignmentDisplayLabels, type EdgeAssignmentRecord, type SvgDocumentModel } from '../../src/svgUtils';

const assert: (v: unknown, m: string) => asserts v = (v, m) => { if (!v) throw new Error(m); };
const equal = <T>(a: T, b: T, m: string) => assert(a === b, `${m}: ${String(a)} != ${String(b)}`);
const panel = (id: string) => ({ id, edgeIds: Array.from({ length: 12 }, (_, i) => `${id.toLowerCase()}${i}`), contour: [], holes: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
const model = { panels: [panel('P'), panel('Q'), panel('R')], edges: [] } as unknown as SvgDocumentModel;
const wall = (id: string) => ({ id, prefix: 'W' as const, properties: {} });
const tb = (id: string) => ({ id, prefix: 'TB' as const, properties: { fingerWidthMm: 9, isFingerWidthManual: false } });
const edge = (id: string, role: 'A' | 'B') => ({ edgeAssignment: { connectionId: id, edgeRole: role } });

for (const wallId of ['W1', 'W7']) {
  const connections: ConnectionMap = { [wallId]: wall(wallId), TB4: tb('TB4') };
  const reversed: EdgeAssignmentRecord = { p0: edge(wallId, 'B'), q0: edge(wallId, 'A'), p1: edge('TB4', 'A'), q1: edge('TB4', 'B') };
  equal(resolveTBOrientationForPanelPair('P', 'Q', reversed, connections, model), 'FIRST_A_SECOND_B', `${wallId} TB orientation`);
  const normalized = normalizeWallConnection(model, reversed, connections, wallId);
  equal(getWallAssignments(model, normalized, wallId).find(x => x.sourceEdgeId === 'p0')?.role, 'A', `${wallId} p role`);
  equal(getWallAssignments(model, normalized, wallId).find(x => x.sourceEdgeId === 'q0')?.role, 'B', `${wallId} q role`);
  equal(getWallAssignments(model, normalized, 'TB4').find(x => x.sourceEdgeId === 'p1')?.role, 'A', `${wallId} TB untouched`);
  validateWallConnection(model, normalized, connections, wallId);
}

const connections: ConnectionMap = { W1: wall('W1'), TB4: tb('TB4'), TBunrelated: tb('TBunrelated') };
const correct: EdgeAssignmentRecord = { p0: edge('W1', 'A'), q0: edge('W1', 'B'), p1: edge('TB4', 'A'), q1: edge('TB4', 'B') };
equal(normalizeWallConnection(model, correct, connections, 'W1'), correct, 'correct orientation is an identity-preserving no-op');
const free: EdgeAssignmentRecord = { p0: edge('W1', 'B'), q0: edge('W1', 'A'), p6: edge('TBunrelated', 'A'), r6: edge('TBunrelated', 'B') };
equal(resolveTBOrientationForPanelPair('P', 'Q', free, connections, model), 'NO_TB_ORIENTATION', 'other-panel TB unrelated');
equal(normalizeWallConnection(model, free, connections, 'W1'), free, 'free reverse orientation preserved');

const ambiguousConnections: ConnectionMap = { W1: wall('W1'), TBa: tb('TBa'), TBb: tb('TBb') };
const ambiguous: EdgeAssignmentRecord = { p0: edge('W1', 'A'), q0: edge('W1', 'B'), p1: edge('TBa', 'A'), q1: edge('TBa', 'B'), p11: edge('TBb', 'B'), q11: edge('TBb', 'A') };
equal(resolveTBOrientationForPanelPair('P', 'Q', ambiguous, ambiguousConnections, model), 'AMBIGUOUS_TB_ORIENTATION', 'contradictory panel-pair TB');
try { validateWallConnection(model, ambiguous, ambiguousConnections, 'W1'); assert(false, 'ambiguity accepted'); } catch { /* fail closed */ }
try { validateWallConnection(model, { p0: edge('W1', 'A'), q0: edge('W1', 'A') }, { W1: wall('W1') }, 'W1'); assert(false, 'malformed accepted'); } catch { /* fail closed */ }

const multiConnections: ConnectionMap = { W1: wall('W1'), W2: wall('W2'), W3: wall('W3') };
const multi: EdgeAssignmentRecord = { p2: edge('W1', 'A'), q2: edge('W1', 'B'), p4: edge('W2', 'A'), q4: edge('W2', 'B'), p8: edge('W3', 'A'), q8: edge('W3', 'B') };
for (const id of ['W1', 'W2', 'W3']) {
  const authored = getWallAssignments(model, multi, id); equal(authored.length, 2, `${id} retained`); validateWallConnection(model, multi, multiConnections, id);
  equal(new Set(authored.map(x => x.role)).size, 2, `${id} A/B`);
  const claims = collectSourceEdgeAuthoringClaims(model, multi, multiConnections).filter(x => x.operationId === `operation:W:${id}`);
  equal(claims.length, 2, `${id} claims`); assert(claims.every(x => x.kind === 'replaces'), `${id} REPLACES`);
}
equal(getEdgeAssignmentDisplayLabels(multi.p2)[0], 'W1-A', 'W1 canvas label');
equal(getEdgeAssignmentDisplayLabels(multi.q8)[0], 'W3-B', 'W3 canvas label');
const restored = structuredClone({ assignments: multi, connections: multiConnections });
for (const id of ['W1', 'W2', 'W3']) validateWallConnection(model, restored.assignments, restored.connections, id);
try { validateWallAuthoringForApply(model, multi, multiConnections); assert(false, 'Wall geometry applied'); }
catch (error) { assert((error as Error).message.includes('not implemented in B2.2'), 'explicit non-generatable Apply'); }

console.log('PASS W1/W7 panel-pair TB reverse normalization, correct/no-TB controls, ambiguity and malformed fail-closed');
console.log('PASS W1/W2/W3 authoring, stable IDs/labels/REPLACES, clone restore, and B2.2 non-generation');
