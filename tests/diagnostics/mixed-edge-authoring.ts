import { collectSourceEdgeAuthoringClaims, validateAuthorityModeForAuthoringClaims, validateGeometryAuthoring,
  validateSourceEdgeReplacementClaims } from '../../src/app/authoringRelationships';
import { buildGeneratedTBGeometryItems } from '../../src/app/eGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id: string, x: number) => { const contour = [{ x, y: 0 }, { x: x + 120, y: 0 }, { x: x + 120, y: 80 }, { x, y: 80 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`); const panel: SvgPanel = { id, contour, outerContour: contour, edgeIds,
    outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [], bounds: { minX: x, maxX: x + 120, minY: 0, maxY: 80 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) }; };
const owner = rectangle('owner', 0), mate = rectangle('mate', 180);
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 400 100',
  width: 400, height: 100, panels: [owner.panel, mate.panel], edges: [...owner.edges, ...mate.edges] };
const thickness = { defaultThicknessMm: 3, panels: { owner: { panelId: 'owner', thicknessMm: 5 }, mate: { panelId: 'mate', thicknessMm: 3 } } };
const connections: any = { TB1: { id: 'TB1', prefix: 'TB', properties: { materialThicknessMm: 3, fingerWidthMm: 12, isFingerWidthManual: true } },
  S1: { id: 'S1', prefix: 'S', properties: { materialThicknessMm: 3, slotWidthMm: 3, slotLengthMm: 12, isSlotLengthManual: true, slotOffsetMm: 1, kerfMm: 0 } } };
const assignments: any = {
  [owner.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
  [mate.panel.edgeIds[1]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } },
  [owner.panel.edgeIds[1]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
  [mate.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] },
};
const claims = validateGeometryAuthoring(model, assignments, connections, 'mixed');
assert(claims.filter((value) => value.kind === 'replaces').length === 3, 'different-edge owners were not retained');
assert(claims.filter((value) => value.kind === 'references').length === 1, 'S-B reference intent missing');
for (const mode of ['legacy', 'single-tool'] as const) { let blocked = false; try { validateAuthorityModeForAuthoringClaims(claims, mode); } catch (error) {
  blocked = error instanceof Error && error.message.includes('requires mixed authority mode'); } assert(blocked, `${mode} admitted mixed authoring`); }

const sharedReferenceAssignments: any = { ...assignments, [owner.panel.edgeIds[0]]: { ...assignments[owner.panel.edgeIds[0]],
  slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] }, [mate.panel.edgeIds[0]]: undefined };
validateSourceEdgeReplacementClaims(collectSourceEdgeAuthoringClaims(model, sharedReferenceAssignments, connections));

const conflictingAssignments: any = { [owner.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' },
  slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] }, [mate.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] } };
let conflict = ''; try { validateGeometryAuthoring(model, conflictingAssignments, connections, 'mixed'); } catch (error) { conflict = error instanceof Error ? error.message : ''; }
assert(conflict.includes('owner-edge-0') && conflict.includes('owner') && conflict.includes('operation:TB:TB1') && conflict.includes('operation:S:S1'), 'same-edge diagnostic lacks identity and claimants');

const generated = [...buildGeneratedTBGeometryItems(model, assignments, connections, thickness), ...buildGeneratedSGeometryItems(model, assignments, connections, thickness)];
const authority = selectGeneratedGeometryAuthority(model, generated, 'mixed'); const decision = authority.decisions.find((value) => value.panelId === 'owner');
assert(decision?.authority === 'COMPOSED' && decision.cohort === 'MIXED', 'normal authoring did not reach mixed composed authority');
assert(authority.diagnostics.relationshipIndex.sources.every((source) => source.replacementClaimants.length <= 1), 'relationship audit found conflict');
assert(authority.generatedGeometry.filter((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === 'owner').length === 1, 'authoritative boundary count differs from one');
const snapshot = createGeneratedGeometrySnapshot({ generatedGeometry: [...authority.generatedGeometry], panelCompositionModel: authority.panelCompositionModel });
assert(snapshot.metadata.panelCompositionModel === 'relationship-composed-mixed-v1', 'snapshot marker missing');
const final = buildFinalGeometry(model, [...snapshot.generatedGeometry]); assert(!final.diagnostics.some((value) => value.severity === 'error'), 'FinalGeometry invalid');
const manufactured = processManufacturingGeometry(final, .1, .1, .1, [], .1); assert(manufactured.contours.length > 0, 'manufacturing produced no contours');
console.log('mixed edge authoring: ownership=PASS references=PASS modes=PASS conflict=PASS authority=PASS snapshot=PASS manufacturing=PASS');
