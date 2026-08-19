import { validateAuthorityModeForAuthoringClaims } from '../../src/app/authoringRelationships';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { resolvePanelCompositionAuthorityMode } from '../../src/app/panelCompositionAuthorityMode';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const rectangle = (id: string, x: number, y = 0) => { const contour = [{ x, y }, { x: x + 120, y }, { x: x + 120, y: y + 80 }, { x, y: y + 80 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`); const panel: SvgPanel = { id, contour, outerContour: contour, edgeIds,
    outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [], bounds: { minX: x, maxX: x + 120, minY: y, maxY: y + 80 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % 4] })) }; };
const owner = rectangle('owner', 0); const mates = [0, 1, 2].map((index) => rectangle(`mate-${index}`, 200 + index * 150));
const rectangles = [owner, ...mates];
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 800 200',
  width: 800, height: 200, panels: rectangles.map((value) => value.panel), edges: rectangles.flatMap((value) => value.edges) };
const thickness = { defaultThicknessMm: 3, panels: Object.fromEntries(rectangles.map(({ panel }, index) => [panel.id,
  { panelId: panel.id, thicknessMm: index ? 3 : 5 }])) };
const tbAssignments: any = {}; const tbConnections: any = {}; const sAssignments: any = {}; const sConnections: any = {};
[0, 1, 2].forEach((edge, index) => { const tb = `TB${index + 1}`; const s = `S${index + 1}`; const mateEdge = (edge + 2) % 4;
  tbAssignments[owner.panel.edgeIds[edge]] = { edgeAssignment: { connectionId: tb, edgeRole: 'A' } };
  tbAssignments[mates[index].panel.edgeIds[mateEdge]] = { edgeAssignment: { connectionId: tb, edgeRole: 'B' } };
  tbConnections[tb] = { id: tb, prefix: 'TB', properties: { fingerWidthMm: 11 + index, isFingerWidthManual: true } };
  sAssignments[owner.panel.edgeIds[edge]] = { slotAssignments: [{ connectionId: s, slotRole: 'A' }] };
  sAssignments[mates[index].panel.edgeIds[mateEdge]] = { slotAssignments: [{ connectionId: s, slotRole: 'B' }] };
  sConnections[s] = { id: s, prefix: 'S', properties: { slotLengthMm: 12 + index, isSlotLengthManual: true, slotOffsetMm: index - 1 } };
});
const tbRaw = buildGeneratedTBGeometryItems(model, tbAssignments, tbConnections, thickness);
const sRaw = buildGeneratedSGeometryItems(model, sAssignments, sConnections, thickness);

for (const [raw, expected] of [[undefined, 'single-tool'], [null, 'single-tool'], ['', 'single-tool'], ['  \t', 'single-tool'],
  ['legacy', 'legacy'], ['single-tool', 'single-tool'], ['mixed', 'mixed']] as const) {
  let diagnostics = 0; assert(resolvePanelCompositionAuthorityMode(raw, () => { diagnostics += 1; }) === expected, `${String(raw)} resolved incorrectly`);
  assert(diagnostics === 0, `${String(raw)} emitted a diagnostic`);
}
for (const invalid of ['singel-tool', 'MIXED', 'banana', 'single_tool']) { const messages: string[] = [];
  assert(resolvePanelCompositionAuthorityMode(invalid, (message) => messages.push(message)) === 'legacy', `${invalid} did not fall back`);
  assert(messages.length === 1 && messages[0].includes('VITE_PANEL_COMPOSITION_AUTHORITY_MODE')
    && messages[0].includes(invalid) && messages[0].includes('legacy'), `${invalid} diagnostic incomplete`); }
const defaultMode = resolvePanelCompositionAuthorityMode(undefined, () => { throw new Error('missing env warned'); });
const freshApply = (raw: typeof tbRaw) => selectGeneratedGeometryAuthority(model, raw, defaultMode);
for (const [name, raw, cohort] of [['TB', tbRaw, 'TB_ONLY'], ['S', sRaw, 'S_ONLY']] as const) { const applied = freshApply(raw);
  assert(applied.ok && applied.panelCompositionModel === 'relationship-composed-single-tool-v1', `${name} default Apply not composed`);
  const ownerDecision = applied.decisions.find((value) => value.panelId === 'owner');
  assert(ownerDecision?.authority === 'COMPOSED' && ownerDecision.cohort === cohort && ownerDecision.relationshipOwners.length === 3,
    `${name} three-operation Apply was not ${cohort}/COMPOSED`); }
const empty = freshApply([]); assert(empty.ok && empty.decisions.length === 0 && empty.panelCompositionModel === 'legacy'
  && empty.generatedGeometry.length === 0, 'no-replacement project changed');
const mixedClaims: any = [{ kind: 'replaces', operationId: 'operation:TB:TB1', contributorId: 'TB', panelId: 'owner', sourceEdgeId: 'owner-edge-0', provenance: 'native-generator-intent', provenanceId: 'tb' },
  { kind: 'replaces', operationId: 'operation:S:S1', contributorId: 'S', panelId: 'owner', sourceEdgeId: 'owner-edge-1', provenance: 'native-generator-intent', provenanceId: 's' }];
let mixedBlocked = false; try { validateAuthorityModeForAuthoringClaims(mixedClaims, defaultMode); } catch { mixedBlocked = true; }
assert(mixedBlocked, 'default ordinary Apply admitted mixed authoring');
const mixedTbAssignments: any = { [owner.panel.edgeIds[0]]: tbAssignments[owner.panel.edgeIds[0]],
  [mates[0].panel.edgeIds[2]]: tbAssignments[mates[0].panel.edgeIds[2]] };
const mixedSAssignments: any = { [owner.panel.edgeIds[1]]: sAssignments[owner.panel.edgeIds[1]],
  [mates[1].panel.edgeIds[3]]: sAssignments[mates[1].panel.edgeIds[3]] };
const mixedRaw = [...buildGeneratedTBGeometryItems(model, mixedTbAssignments, tbConnections, thickness)
  .filter((item) => item.behaviour.replacesPanelId === 'owner'),
  ...buildGeneratedSGeometryItems(model, mixedSAssignments, sConnections, thickness)];
const directMixed = selectGeneratedGeometryAuthority(model, mixedRaw, defaultMode);
assert(directMixed.ok && directMixed.decisions.find((value) => value.panelId === 'owner')?.reason === 'MIXED_NOT_ENABLED'
  && directMixed.panelCompositionModel === 'legacy', 'direct selector mixed legacy retention changed');
const oldSnapshot = structuredClone(createGeneratedGeometrySnapshot({ generatedGeometry: [...tbRaw] }));
delete (oldSnapshot.metadata as any).panelCompositionModel;
const oldRestored = restoreGeneratedGeometrySnapshot(oldSnapshot); assert(oldRestored.panelCompositionModel === 'legacy', 'old snapshot was reselected');
const migrated = freshApply(tbRaw); assert(migrated.panelCompositionModel === 'relationship-composed-single-tool-v1', 'fresh Apply did not lazily migrate');
const composedSnapshot = createGeneratedGeometrySnapshot({ generatedGeometry: [...migrated.generatedGeometry], panelCompositionModel: migrated.panelCompositionModel });
const restoredComposed = restoreGeneratedGeometrySnapshot(composedSnapshot);
assert(restoredComposed.panelCompositionModel === 'relationship-composed-single-tool-v1'
  && JSON.stringify(restoredComposed.generatedGeometry) === JSON.stringify(migrated.generatedGeometry), 'legacy runtime could not preserve composed snapshot');
assert(oldRestored.panelCompositionModel === 'legacy' && JSON.stringify(oldRestored.generatedGeometry) === JSON.stringify(tbRaw), 'default runtime changed legacy restore');
const diagnostics = assembleGeneratedGeometryDiagnostics(model, tbRaw); const panel = diagnostics.panelDiagnostics[0];
const blocked = selectGeneratedGeometryAuthority(model, tbRaw, defaultMode,
  { ...diagnostics, panelCandidates: [], panelDiagnostics: [{ ...panel, status: 'BLOCKED_INVALID_JUNCTION' }] });
assert(!blocked.ok && blocked.generatedGeometry.length === 0 && blocked.panelCompositionModel === 'legacy'
  && blocked.blockingDecisions[0]?.reason === 'INVALID_JUNCTION', 'default eligible invalid composition did not fail closed');
console.log('panel composition authority default: resolver=PASS TB=COMPOSED S=COMPOSED multiple=PASS empty=PASS mixed-authoring=BLOCKED restore=PASS lazy-migration=PASS fail-closed=PASS');
