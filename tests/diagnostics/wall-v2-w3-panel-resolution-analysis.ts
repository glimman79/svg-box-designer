import { getBucketEdgeAssignment } from '../../src/app/assignmentBuckets';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import { getWallAssignments, resolveTBRoleForPanel } from '../../src/app/wallAuthoring';
import { authorWallEdge, startWallGroupWorkflow } from '../../src/app/wallWorkflow';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const panel = (id: string, edgeIds: string[]): SvgPanel => ({ id, edgeIds, outerEdgeIds: edgeIds, contour: [], outerContour: [],
  innerContours: [], innerEdgeIds: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
const model = { panels: [panel('center', ['c-top', 'c-left', 'c-right', 'c-lower']), panel('top', ['top-tb', 'top-left', 'top-right']),
  panel('left', ['left-tb', 'left-top', 'left-lower']), panel('right', ['right-tb', 'right-top']),
  panel('lower', ['lower-tb', 'lower-left'])], edges: [] } as unknown as SvgDocumentModel;
const tb = (id: string) => ({ id, prefix: 'TB' as const, properties: { fingerWidthMm: 9, isFingerWidthManual: false } });
const edge = (connectionId: string, edgeRole: 'A' | 'B') => ({ edgeAssignment: { connectionId, edgeRole } });
let connections: ConnectionMap = { TB1: tb('TB1'), TB2: tb('TB2'), TB3: tb('TB3'), TB4: tb('TB4') };
let assignments: EdgeAssignmentRecord = { 'top-tb': edge('TB1', 'A'), 'c-top': edge('TB1', 'B'),
  'left-tb': edge('TB2', 'B'), 'c-left': edge('TB2', 'A'), 'right-tb': edge('TB3', 'B'), 'c-right': edge('TB3', 'A'),
  'lower-tb': edge('TB4', 'B'), 'c-lower': edge('TB4', 'A') };
let workflow = startWallGroupWorkflow(connections); connections = workflow.connections;
let result = authorWallEdge(model, assignments, connections, workflow.activeWallGroup, 'W1', 'top-left');
result = authorWallEdge(model, result.assignments, result.connections, result.activeWallGroup, 'W1', 'left-top');
result = authorWallEdge(model, result.assignments, result.connections, result.activeWallGroup, 'W2', 'top-right');
result = authorWallEdge(model, result.assignments, result.connections, result.activeWallGroup, 'W2', 'right-top');
result = authorWallEdge(model, result.assignments, result.connections, result.activeWallGroup, 'W3', 'left-lower');
assignments = result.assignments; connections = result.connections;
let observed = '';
try { authorWallEdge(model, assignments, connections, result.activeWallGroup, 'W3', 'lower-left'); } catch (error) { observed = (error as Error).message; }
if (observed !== 'W3 has ambiguous or incompatible per-panel TB role evidence.') throw new Error(`Expected W3 ambiguity, received: ${observed}`);
const panelByEdge = new Map(model.panels.flatMap((item) => item.edgeIds.map((id) => [id, item.id] as const)));
const evidence = Object.values(connections).filter((item) => item.prefix === 'TB').map((connection) => {
  const authored = Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket); return assignment?.connectionId === connection.id
      ? [{ sourceEdgeId, edgeRole: assignment.edgeRole, panelId: panelByEdge.get(sourceEdgeId) }] : [];
  });
  return { connectionId: connection.id, complete: authored.length === 2, authored,
    countedForLower: authored.length === 2 && authored.some((item) => item.panelId === 'lower') };
});
console.log('W3 LOWER PANEL EVIDENCE', JSON.stringify({ clickedSourceEdgeId: 'lower-left', resolvedPanelId: panelByEdge.get('lower-left'),
  expectedVisualPanelId: 'lower', selectedConnectionId: 'W3', w3BeforeSecondClick: getWallAssignments(model, assignments, 'W3'),
  roles: { left: resolveTBRoleForPanel('left', assignments, connections, model), lower: resolveTBRoleForPanel('lower', assignments, connections, model) },
  evidence, duplicateOwners: model.panels.filter((item) => item.edgeIds.includes('lower-left')).map((item) => item.id), error: observed }, null, 2));
console.log('PASS lower click resolves correctly; same-role B/B panel evidence reproduces incompatible W3 normalization');
