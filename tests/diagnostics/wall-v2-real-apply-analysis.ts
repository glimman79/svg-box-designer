import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const rectangle = (id: string, x: number) => {
  const contour = [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 40 }, { x, y: 40 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: x, minY: 0, maxX: x + 80, maxY: 40 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] })) };
};
const a = rectangle('panel-3', 0); const b = rectangle('panel-4', 100);
const model = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 200 50',
  width: 200, height: 50, panels: [a.panel, b.panel], edges: [...a.edges, ...b.edges] } as SvgDocumentModel;
const connections: ConnectionMap = { W1: { id: 'W1', prefix: 'W', properties: { fingerWidthMm: 9, isFingerWidthManual: false } } };
const assignments: EdgeAssignmentRecord = {
  'panel-3-edge-0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' } },
  'panel-4-edge-0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' } },
};
const thickness = { panels: { 'panel-3': { panelId: 'panel-3', thicknessMm: 3 }, 'panel-4': { panelId: 'panel-4', thicknessMm: 3 } } };

validateWallAuthoringForApply(model, assignments, connections);
const generated = buildGeneratedWGeometryItems(model, assignments, connections, thickness);
const profile = generated.flatMap((item) => item.generatedProfiles ?? [])[0];
if (!profile || profile.generatorType !== 'W') throw new Error('Fixture failed to produce a native W profile.');
let observed = '';
try { selectGeneratedGeometryAuthority(model, generated, 'mixed'); } catch (error) { observed = (error as Error).message; }
if (!/^Profile profile:W:W1:.* is not a TB profile\.$/.test(observed)) throw new Error(`Expected TB-only adapter failure, received: ${observed}`);
console.log('REAL APPLY PATH EVIDENCE', JSON.stringify({ validation: 'passed', generatedItemCount: generated.length,
  profile: { id: profile.id, generatorType: profile.generatorType, operationId: profile.operationId, panelId: profile.panelId,
    sourceEdgeId: profile.sourceEdgeId, attachmentStart: profile.attachmentStart, attachmentEnd: profile.attachmentEnd,
    elementKinds: profile.orderedElements.map((item) => item.kind) }, authorityCommitted: false, error: observed }, null, 2));
console.log('PASS current production failure reproduced and asserted before authority commit');
