import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import type { SvgDocumentModel } from '../../src/svgUtils';
import { makeEvidenceRectangle, makeMixedFixture } from './helpers/mixed-evidence-fixture';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const owner = makeEvidenceRectangle('P', 20, 20, 120, 80);
const mates = [0, 1, 2, 3].map((edge) => makeEvidenceRectangle(`mate-${edge}`, 220 + edge * 160, 220, 120, 80));
const rectangles = [owner, ...mates];
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 1200 600', width: 1200, height: 600, panels: rectangles.map((x) => x.panel), edges: rectangles.flatMap((x) => x.edges) };
const thickness = { defaultThicknessMm: 3.2, panels: Object.fromEntries(rectangles.map((x) => [x.panel.id, { panelId: x.panel.id, thicknessMm: 3.2 }])) };
const panelCarriers = (items: readonly GeneratedGeometryItem[], tool: 'TB' | 'S') => items.filter((item) =>
  item.toolType === tool && item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === owner.panel.id);
const operationIds = (carrier: GeneratedGeometryItem) => new Set((carrier.generatedProfiles ?? []).map((profile) => profile.operationId));

const tbConnections: any = {};
const tbAssignments: any = {};
[0, 1].forEach((edge, index) => {
  const id = `TB${index + 1}`; tbConnections[id] = { id, prefix: 'TB', properties: { fingerWidthMm: 12, isFingerWidthManual: true } };
  tbAssignments[owner.panel.edgeIds[edge]] = { edgeAssignment: { connectionId: id, edgeRole: 'A' } };
  tbAssignments[mates[edge].panel.edgeIds[(edge + 2) % 4]] = { edgeAssignment: { connectionId: id, edgeRole: 'B' } };
});
const tb = buildGeneratedTBGeometryItems(model, tbAssignments, tbConnections, thickness);
const tbCarriers = panelCarriers(tb, 'TB'); assert(tbCarriers.length === 1, `expected one TB carrier, got ${tbCarriers.length}`);
const tbCarrier = tbCarriers[0]; assert(['operation:TB:TB1', 'operation:TB:TB2'].every((id) => operationIds(tbCarrier).has(id)), 'TB profile ownership incomplete');
assert((tbCarrier.generatedTaps ?? []).length > 0 && ['TB1', 'TB2'].every((id) => (tbCarrier.generatedTaps ?? []).some((tap) => tap.sourceEdgeId === owner.panel.edgeIds[Number(id.at(-1)) - 1])), 'TB tap metadata incomplete');
assert((tbCarrier.profileGroups ?? []).length === 2 && new Set(tbCarrier.profileGroups?.map((x) => x.sourceEdgeId)).size === 2, 'TB profile groups are not edge-local');
assert(tbCarrier.source.connectionIds.length === 2 && tbCarrier.source.operationId === tbCarrier.operationId, 'TB provenance is incoherent');
const tbAuthority = selectGeneratedGeometryAuthority(model, tb, 'single-tool'); assert(tbAuthority.ok, 'coherent TB authority failed');
assert(!buildFinalGeometry(model, tbAuthority.generatedGeometry).diagnostics.some((x) => x.severity === 'error'), 'coherent TB FinalGeometry failed');

const sConnections: any = {};
const sAssignments: any = {};
[0, 1].forEach((edge, index) => {
  const id = `S${index + 1}`; sConnections[id] = { id, prefix: 'S', properties: { slotLengthMm: 12, isSlotLengthManual: true, slotOffsetMm: 0 } };
  sAssignments[owner.panel.edgeIds[edge]] = { slotAssignments: [{ connectionId: id, slotRole: 'A' }] };
  sAssignments[mates[edge + 2].panel.edgeIds[(edge + 2) % 4]] = { slotAssignments: [{ connectionId: id, slotRole: 'B' }] };
});
const s = buildGeneratedSGeometryItems(model, sAssignments, sConnections, thickness);
const sCarriers = panelCarriers(s, 'S'); assert(sCarriers.length === 1, `expected one S carrier, got ${sCarriers.length}`);
const sCarrier = sCarriers[0]; assert(['operation:S:S1', 'operation:S:S2'].every((id) => operationIds(sCarrier).has(id)), 'S profile ownership incomplete');
assert((sCarrier.generatedTaps ?? []).length > 0 && ['operation:S:S1', 'operation:S:S2'].every((id) => (sCarrier.generatedTaps ?? []).some((tap) => tap.sourceOperationId === id)), 'S tap metadata incomplete');
assert((sCarrier.profileGroups ?? []).length === 2 && new Set(sCarrier.profileGroups?.map((x) => x.sourceEdgeId)).size === 2, 'S profile groups are not edge-local');
const slots = s.filter((item) => item.kind === 'SLOT_PATH'); assert(['S1', 'S2'].every((id) => slots.some((slot) => slot.operationId === `operation:S:${id}`)), 'S slot output incomplete');
assert(slots.every((slot) => slot.sourceRelationships?.length && slot.sourceRelationships.every((x) => x.kind === 'references')), 'S-B REFERENCES changed');
const sAuthority = selectGeneratedGeometryAuthority(model, s, 'single-tool'); assert(sAuthority.ok, 'coherent S authority failed');
assert(!buildFinalGeometry(model, sAuthority.generatedGeometry).diagnostics.some((x) => x.severity === 'error'), 'coherent S FinalGeometry failed');

const subset = (assignments: any, connections: any, id: string): { assignments: any; connections: any } => ({
  assignments: Object.fromEntries(Object.entries(assignments).filter(([, bucket]: any) =>
    bucket.edgeAssignment?.connectionId === id || bucket.slotAssignments?.some((x: any) => x.connectionId === id))),
  connections: { [id]: connections[id] },
});
const tb1 = subset(tbAssignments, tbConnections, 'TB1'); const tb2 = subset(tbAssignments, tbConnections, 'TB2');
const malformedTb = [...buildGeneratedTBGeometryItems(model, tb1.assignments, tb1.connections, thickness), ...buildGeneratedTBGeometryItems(model, tb2.assignments, tb2.connections, thickness)];
const badTb = selectGeneratedGeometryAuthority(model, malformedTb, 'single-tool'); assert(!badTb.ok && badTb.generatedGeometry.length === 0, 'partial TB batches were accepted');
const tbCandidate = badTb.diagnostics.panelCandidates.find((x) => x.panelId === owner.panel.id); assert(tbCandidate, 'TB diagnostic candidate missing');
let packagingRejected = false; try { packageComposedPanelGeometry(malformedTb, tbCandidate, badTb.decisions.find((x) => x.panelId === owner.panel.id)?.relationshipOwners ?? []); } catch { packagingRejected = true; }
assert(packagingRejected, 'conflicting duplicate TB carrier did not reject packaging');

const s1 = subset(sAssignments, sConnections, 'S1'); const s2 = subset(sAssignments, sConnections, 'S2');
const malformedS = [...buildGeneratedSGeometryItems(model, s1.assignments, s1.connections, thickness), ...buildGeneratedSGeometryItems(model, s2.assignments, s2.connections, thickness)];
assert(new Set(panelCarriers(malformedS, 'S').map((x) => x.id)).size === 2, 'S partial carrier IDs should differ');
const badS = selectGeneratedGeometryAuthority(model, malformedS, 'single-tool'); assert(!badS.ok && badS.generatedGeometry.length === 0, 'partial S batches were accepted');

const mixedFixture = makeMixedFixture({ name: 'coherent-mixed-control', tbEdges: [2], sEdges: [0] });
const mixed = selectGeneratedGeometryAuthority(mixedFixture.model, mixedFixture.raw, 'mixed'); assert(mixed.ok, 'coherent TB+S mixed carriers became invalid');
console.log(`PASS | TB coherent carrier=${tbCarriers.length} profiles=${tbCarrier.generatedProfiles?.length} taps=${tbCarrier.generatedTaps?.length} groups=${tbCarrier.profileGroups?.length}`);
console.log(`PASS | S coherent carrier=${sCarriers.length} profiles=${sCarrier.generatedProfiles?.length} taps=${sCarrier.generatedTaps?.length} groups=${sCarrier.profileGroups?.length} slots=${slots.length} REFERENCES=unchanged`);
console.log(`PASS | malformed TB fail-closed=${!badTb.ok} packaging-conflict=${packagingRejected}`);
console.log(`PASS | malformed S distinct-carriers=${panelCarriers(malformedS, 'S').length} fail-closed=${!badS.ok}`);
console.log('Coherent generator batch contract: PASS');
