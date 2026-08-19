import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const same = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const rectangle = (id: string, x: number) => { const contour = [{ x, y: 0 }, { x: x + 120, y: 0 }, { x: x + 120, y: 80 }, { x, y: 80 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`); const panel: SvgPanel = { id, contour, outerContour: contour, edgeIds,
    outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [], bounds: { minX: x, maxX: x + 120, minY: 0, maxY: 80 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) }; };
const owner = rectangle('owner', 0); const mate = rectangle('mate', 180);
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 400 100',
  width: 400, height: 100, panels: [owner.panel, mate.panel], edges: [...owner.edges, ...mate.edges] };
const thickness = { defaultThicknessMm: 3.25, panels: { owner: { panelId: 'owner', thicknessMm: 5 }, mate: { panelId: 'mate', thicknessMm: 3.25 } } };
const tb = buildGeneratedTBGeometryItems(model, { [owner.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
  [mate.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } } } as any,
{ TB1: { id: 'TB1', prefix: 'TB', properties: { fingerWidthMm: 12, isFingerWidthManual: true } } } as any, thickness)
  .filter((item) => item.behaviour.replacesPanelId === 'owner');
const s = buildGeneratedSGeometryItems(model, { [owner.panel.edgeIds[1]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
  [mate.panel.edgeIds[1]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] } } as any,
{ S1: { id: 'S1', prefix: 'S', properties: { slotLengthMm: 13, isSlotLengthManual: true, slotOffsetMm: 1 } } } as any, thickness);

for (const [name, raw, mode, marker] of [
  ['TB', tb, 'single-tool', 'relationship-composed-single-tool-v1'],
  ['S', s, 'single-tool', 'relationship-composed-single-tool-v1'],
  ['mixed', [...tb, ...s], 'mixed', 'relationship-composed-mixed-v1'],
] as const) {
  const selected = selectGeneratedGeometryAuthority(model, raw, mode); assert(selected.ok, `${name} selection failed`);
  const snapshot = createGeneratedGeometrySnapshot({ generatedGeometry: [...selected.generatedGeometry], panelCompositionModel: selected.panelCompositionModel });
  const restored = restoreGeneratedGeometrySnapshot(structuredClone(snapshot));
  same(restored.generatedGeometry, selected.generatedGeometry, `${name} authoritative items changed on restore`);
  assert(restored.panelCompositionModel === marker, `${name} authority marker changed`);
  assert(restored.generatedGeometry.some((item) => item.operationId === 'composed:owner'), `${name} composed boundary missing`);
  same(buildFinalGeometry(model, snapshot), buildFinalGeometry(model, restored.generatedGeometry), `${name} FinalGeometry changed`);
  same(processManufacturingGeometry(buildFinalGeometry(model, snapshot), .1, .08, .04, [], .06),
    processManufacturingGeometry(buildFinalGeometry(model, restored.generatedGeometry), .1, .08, .04, [], .06), `${name} manufacturing changed`);
  if (name !== 'TB') {
    const slots = selected.generatedGeometry.filter((item) => item.kind === 'SLOT_PATH');
    same(slots, restored.generatedGeometry.filter((item) => item.kind === 'SLOT_PATH'), `${name} slots were regenerated`);
    assert(restored.generatedGeometry.some((item) => item.sourceRelationships?.some((relationship) => relationship.kind === 'references')), `${name} references lost`);
  }
  // This is the App history contract: metadata dispatches directly to restore, never back to selection.
  assert(restored.panelCompositionModel === marker, `${name} restore was mistaken for raw generator output`);
}

const conflictS = buildGeneratedSGeometryItems(model, { [owner.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S2', slotRole: 'A' }] },
  [mate.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }] } } as any,
{ S2: { id: 'S2', prefix: 'S', properties: { slotLengthMm: 13, isSlotLengthManual: true, slotOffsetMm: 1 } } } as any, thickness);
const conflict = selectGeneratedGeometryAuthority(model, [...tb, ...conflictS], 'mixed');
assert(!conflict.ok && conflict.generatedGeometry.length === 0 && conflict.blockingDecisions[0]?.reason === 'REPLACEMENT_CONFLICT', 'conflict selected a legacy winner');

const diagnostics = assembleGeneratedGeometryDiagnostics(model, tb); const panel = diagnostics.panelDiagnostics[0];
for (const [status, reason] of [['BLOCKED_MISSING_CONTRIBUTION', 'MISSING_CONTRIBUTION'], ['BLOCKED_INVALID_JUNCTION', 'INVALID_JUNCTION']] as const) {
  const synthetic = { ...diagnostics, panelCandidates: [], panelDiagnostics: [{ ...panel, status }] };
  const blocked = selectGeneratedGeometryAuthority(model, tb, 'single-tool', synthetic);
  assert(!blocked.ok && blocked.generatedGeometry.length === 0 && blocked.blockingDecisions[0]?.reason === reason, `${reason} did not fail closed`);
}

console.log('authority restore: TB=PASS S=PASS mixed=PASS slots=PASS references=PASS FinalGeometry=PASS manufacturing=PASS conflict=FAIL_CLOSED missing=FAIL_CLOSED invalid=FAIL_CLOSED');
