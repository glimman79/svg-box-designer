import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { createGeneratedGeometrySnapshot, restoreGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const same = (actual: unknown, expected: unknown, message: string) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);

type Rectangle = ReturnType<typeof rectangle>;
type EvidenceFixture = Readonly<{ name: string; tool: 'TB' | 'S'; model: SvgDocumentModel;
  raw: ReadonlyArray<GeneratedGeometryItem>; operatedPanelIds: ReadonlyArray<string>; }>; 

/** A native panel fixture. `reverseRecords` deliberately disagrees with contour traversal. */
const rectangle = (id: string, x: number, y = 0, winding: 'CW' | 'CCW' = 'CW', reverseRecords = false) => {
  const clockwise = [{ x, y }, { x: x + 120, y }, { x: x + 120, y: y + 80 }, { x, y: y + 80 }];
  const contour = winding === 'CW' ? clockwise : [clockwise[0], clockwise[3], clockwise[2], clockwise[1]];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, edgeIds, outerEdgeIds: edgeIds, innerContours: [], innerEdgeIds: [],
    bounds: { minX: x, maxX: x + 120, minY: y, maxY: y + 80 } };
  return { panel, edges: contour.map((start, index) => { const end = contour[(index + 1) % contour.length];
    return { id: edgeIds[index], source: id, start: reverseRecords ? end : start, end: reverseRecords ? start : end }; }) };
};

const modelOf = (rectangles: ReadonlyArray<Rectangle>): SvgDocumentModel => ({ content: '', innerMarkup: '',
  rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 1600 1000', width: 1600, height: 1000,
  panels: rectangles.map(({ panel }) => panel), edges: rectangles.flatMap(({ edges }) => edges) });

const thicknessOf = (rectangles: ReadonlyArray<Rectangle>) => ({ defaultThicknessMm: 3.2,
  panels: Object.fromEntries(rectangles.map(({ panel }, index) => [panel.id,
    { panelId: panel.id, thicknessMm: index % 3 === 0 ? 5.4 : index % 3 === 1 ? 3.2 : 4.1 }])) });

const tbFixture = (name: string, ownerSpecs: ReadonlyArray<Readonly<{ id: string; edges: ReadonlyArray<number>;
  roles?: ReadonlyArray<'A' | 'B'>; winding?: 'CW' | 'CCW'; reverse?: boolean }>>, manual: boolean): EvidenceFixture => {
  const owners = ownerSpecs.map((spec, index) => rectangle(spec.id, 20, index * 150, spec.winding, spec.reverse));
  const mates: Rectangle[] = []; const assignments: any = {}; const connections: any = {}; let ordinal = 0;
  ownerSpecs.forEach((spec, ownerIndex) => spec.edges.forEach((edgeIndex, localIndex) => {
    ordinal += 1; const id = `TB${ordinal}`; const mate = rectangle(`${id}-mate`, 240 + localIndex * 150, ownerIndex * 150, spec.winding,
      spec.reverse && localIndex % 2 === 0); mates.push(mate); const role = spec.roles?.[localIndex] ?? (ordinal % 2 ? 'A' : 'B');
    assignments[owners[ownerIndex].panel.edgeIds[edgeIndex]] = { edgeAssignment: { connectionId: id, edgeRole: role } };
    assignments[mate.panel.edgeIds[(edgeIndex + 2) % 4]] = { edgeAssignment: { connectionId: id, edgeRole: role === 'A' ? 'B' : 'A' } };
    connections[id] = { id, prefix: 'TB', properties: { fingerWidthMm: 9.75 + ordinal, isFingerWidthManual: manual } };
  }));
  const unchanged = rectangle(`${name}-unchanged`, 1200, 700); const rectangles = [...owners, ...mates, unchanged]; const model = modelOf(rectangles);
  return { name, tool: 'TB', model, raw: buildGeneratedTBGeometryItems(model, assignments, connections, thicknessOf(rectangles)),
    operatedPanelIds: [...owners, ...mates].map(({ panel }) => panel.id) };
};

const sFixture = (name: string, ownerSpecs: ReadonlyArray<Readonly<{ id: string; edges: ReadonlyArray<number>;
  winding?: 'CW' | 'CCW'; reverseA?: boolean; reverseB?: boolean }>>, manual: boolean,
  offsets: ReadonlyArray<number>): EvidenceFixture => {
  const owners = ownerSpecs.map((spec, index) => rectangle(spec.id, 20, index * 150, spec.winding, spec.reverseA));
  const mates: Rectangle[] = []; const assignments: any = {}; const connections: any = {}; let ordinal = 0;
  ownerSpecs.forEach((spec, ownerIndex) => spec.edges.forEach((edgeIndex, localIndex) => {
    ordinal += 1; const id = `S${ordinal}`; const mate = rectangle(`${id}-mate`, 300 + localIndex * 150, ownerIndex * 150,
      spec.winding, spec.reverseB && localIndex % 2 === 0); mates.push(mate);
    assignments[owners[ownerIndex].panel.edgeIds[edgeIndex]] = { slotAssignments: [{ connectionId: id, slotRole: 'A' }] };
    assignments[mate.panel.edgeIds[(edgeIndex + 2) % 4]] = { slotAssignments: [{ connectionId: id, slotRole: 'B' }] };
    connections[id] = { id, prefix: 'S', properties: { slotLengthMm: 10.5 + ordinal, isSlotLengthManual: manual,
      slotOffsetMm: offsets[(ordinal - 1) % offsets.length] } };
  }));
  const unchanged = rectangle(`${name}-unchanged`, 1200, 700); const rectangles = [...owners, ...mates, unchanged]; const model = modelOf(rectangles);
  return { name, tool: 'S', model, raw: buildGeneratedSGeometryItems(model, assignments, connections, thicknessOf(rectangles)),
    operatedPanelIds: owners.map(({ panel }) => panel.id) };
};

const fixtures: EvidenceFixture[] = [
  tbFixture('TB CASE 1 one operation role A automatic', [{ id: 'tb-one-a', edges: [0], roles: ['A'] }], false),
  tbFixture('TB CASE 1 one operation role B manual', [{ id: 'tb-one-b', edges: [1], roles: ['B'] }], true),
  tbFixture('TB CASE 2 adjacent AA/AB', [{ id: 'tb-adjacent', edges: [0, 1], roles: ['A', 'B'] }], false),
  tbFixture('TB CASE 3 non-adjacent BA/BB reversed', [{ id: 'tb-opposite', edges: [0, 2], roles: ['B', 'B'], reverse: true }], true),
  tbFixture('TB CASE 4 three edges CCW', [{ id: 'tb-three', edges: [0, 1, 2], roles: ['A', 'B', 'A'], winding: 'CCW' }], false),
  tbFixture('TB CASE 4 three edges CW control', [{ id: 'tb-three-cw', edges: [0, 1, 2], roles: ['A', 'B', 'A'], winding: 'CW' }], false),
  tbFixture('TB CASE 5 all four edges', [{ id: 'tb-four', edges: [0, 1, 2, 3], roles: ['A', 'A', 'B', 'B'] }], true),
  tbFixture('TB CASE 6 multiple panels', [{ id: 'tb-p1', edges: [0, 1] }, { id: 'tb-p2', edges: [1, 3], reverse: true }], false),
  sFixture('S CASE 1 one connection automatic zero offset', [{ id: 's-one', edges: [0] }], false, [0]),
  sFixture('S CASE 1 one connection manual positive offset', [{ id: 's-one-manual', edges: [1] }], true, [1.25]),
  sFixture('S adjacent CW A normal B normal', [{ id: 's-adjacent-normal', edges: [0, 1] }], false, [-1, 1]),
  sFixture('S adjacent CW A reversed B normal', [{ id: 's-adjacent-a-reversed', edges: [0, 1], reverseA: true }], false, [-1, 1]),
  sFixture('S adjacent CW A normal B reversed', [{ id: 's-adjacent-b-reversed', edges: [0, 1], reverseB: true }], false, [-1, 1]),
  sFixture('S CASE 2 adjacent reversed A/B', [{ id: 's-adjacent', edges: [0, 1], reverseA: true, reverseB: true }], false, [-1, 1]),
  sFixture('S CASE 3 non-adjacent reversed A/B', [{ id: 's-opposite', edges: [0, 2], reverseA: true, reverseB: true }], true, [0, -1.1]),
  sFixture('S adjacent CCW reversed A/B', [{ id: 's-adjacent-ccw', edges: [0, 1], winding: 'CCW', reverseA: true, reverseB: true }], false, [-1, 1]),
  sFixture('S CASE 4 three edges CCW', [{ id: 's-three', edges: [0, 1, 2], winding: 'CCW', reverseB: true }], false, [-.8, 0, .8]),
  sFixture('S CASE 5 all four edges', [{ id: 's-four', edges: [0, 1, 2, 3], reverseA: true }], true, [-1.2, 0, 1.2]),
  sFixture('S CASE 6 multiple panels', [{ id: 's-p1', edges: [0, 1] }, { id: 's-p2', edges: [1, 3], reverseA: true }], false, [-.7, .7]),
];

const stableIds = (items: ReadonlyArray<GeneratedGeometryItem>, field: 'generatedProfiles' | 'generatedTaps') =>
  items.flatMap((item) => (item[field] ?? []) as ReadonlyArray<{ id: string }>).map((value) => value.id).sort();

const verify = (fixture: EvidenceFixture) => {
  const originalRaw = JSON.stringify(fixture.raw);
  assert(fixture.raw.some((item) => item.kind === 'PANEL_PATH'), `${fixture.name}: legacy PANEL_PATH oracle missing`);
  const legacy = selectGeneratedGeometryAuthority(fixture.model, fixture.raw, 'legacy');
  const composed = selectGeneratedGeometryAuthority(fixture.model, fixture.raw, 'single-tool');
  assert(legacy.ok, `${fixture.name}: legacy selection failed`);
  assert(composed.ok, `${fixture.name}: single-tool selection failed (${composed.blockingDecisions.map((x) => x.reason).join(', ')})`);
  assert(composed.blockingDecisions.length === 0, `${fixture.name}: blocking decision present`);
  assert(composed.panelCompositionModel === 'relationship-composed-single-tool-v1', `${fixture.name}: marker missing`);
  fixture.operatedPanelIds.forEach((panelId) => {
    const decision = composed.decisions.find((value) => value.panelId === panelId);
    assert(decision?.authority === 'COMPOSED', `${fixture.name}/${panelId}: silent legacy authority`);
    assert(decision.reason === 'SINGLE_TOOL_APPROVED' && decision.cohort === `${fixture.tool}_ONLY`,
      `${fixture.name}/${panelId}: wrong authority decision`);
    assert(decision.relationshipOwners.length >= 1, `${fixture.name}/${panelId}: relationship ownership absent`);
    const oracle = fixture.raw.find((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId)!;
    const selected = composed.generatedGeometry.find((item) => item.kind === 'PANEL_PATH' && item.behaviour.replacesPanelId === panelId)!;
    assert(selected.id === `composed:panel:${panelId}`, `${fixture.name}/${panelId}: composed packaging absent`);
    // Physical geometry is compared structurally through FinalGeometry below;
    // composed traversal may choose a different, equivalent path start point.
    same(stableIds([selected], 'generatedProfiles'), stableIds([oracle], 'generatedProfiles'), `${fixture.name}/${panelId}: profile lineage differs`);
    same(stableIds([selected], 'generatedTaps'), stableIds([oracle], 'generatedTaps'), `${fixture.name}/${panelId}: tap lineage differs`);
    (selected.generatedProfiles ?? []).forEach((profile) => {
      const original = oracle.generatedProfiles?.find((value) => value.id === profile.id);
      same(profile.orderedElements, original?.orderedElements, `${fixture.name}/${panelId}: generated profile elements differ`);
      assert(profile.geometryProjections.every((projection) => original?.geometryProjections.some((value) => value.id === projection.id)),
        `${fixture.name}/${panelId}: packaged projection lacks original provenance`);
    });
    same(selected.generatedTaps, oracle.generatedTaps, `${fixture.name}/${panelId}: generated taps differ`);
    same(selected.profileGroups, oracle.profileGroups, `${fixture.name}/${panelId}: profile groups/attachments differ`);
    if (fixture.name === 'TB CASE 4 three edges CCW' && panelId === 'tb-three') {
      const profile = selected.generatedProfiles?.find((value) => value.id
        === 'profile:TB:TB2:tb-three:tb-three-edge-1:boundary-profile');
      const projection = profile?.geometryProjections.find((value) => value.id.endsWith(
        ':element:tap-0-tip:projection:current-contour-segment'));
      same(projection?.start, { x: 23.2, y: 80 }, `${fixture.name}: generator-authored TB2 projection coordinate was rewritten`);
    }
  });
  same(stableIds(composed.generatedGeometry, 'generatedProfiles'), stableIds(fixture.raw, 'generatedProfiles'), `${fixture.name}: profile IDs differ`);
  same(stableIds(composed.generatedGeometry, 'generatedTaps'), stableIds(fixture.raw, 'generatedTaps'), `${fixture.name}: tap IDs differ`);
  const rawSlots = fixture.raw.filter((item) => item.kind === 'SLOT_PATH');
  same(composed.generatedGeometry.filter((item) => item.kind === 'SLOT_PATH'), rawSlots, `${fixture.name}: created slots changed before manufacturing`);

  const legacyFinal = buildFinalGeometry(fixture.model, legacy.generatedGeometry);
  const composedFinal = buildFinalGeometry(fixture.model, composed.generatedGeometry);
  same(composedFinal.contours, legacyFinal.contours, `${fixture.name}: FinalGeometry physical contours differ`);
  assert(!composedFinal.diagnostics.some((entry) => entry.code === 'CLEARANCE_PROFILE_MISSING'),
    `${fixture.name}: composed FinalGeometry retained a nonphysical projection`);
  const profileIds = stableIds(fixture.raw, 'generatedProfiles');
  for (const selectedIds of [profileIds.slice(0, 1), profileIds]) {
    const legacyManufacturing = processManufacturingGeometry(legacyFinal, .16, .10, -.045, selectedIds as any, .065);
    const composedManufacturing = processManufacturingGeometry(composedFinal, .16, .10, -.045, selectedIds as any, .065);
    same(composedManufacturing.contours, legacyManufacturing.contours, `${fixture.name}: combined manufacturing contours differ`);
  }

  const snapshot = createGeneratedGeometrySnapshot({ generatedGeometry: [...composed.generatedGeometry],
    panelCompositionModel: composed.panelCompositionModel });
  const restored = restoreGeneratedGeometrySnapshot(structuredClone(snapshot));
  same(restored.generatedGeometry, composed.generatedGeometry, `${fixture.name}: snapshot restore changed authoritative geometry`);
  same(buildFinalGeometry(fixture.model, restored.generatedGeometry), composedFinal, `${fixture.name}: restored FinalGeometry differs`);
  same(processManufacturingGeometry(buildFinalGeometry(fixture.model, restored.generatedGeometry), .16, .10, -.045, profileIds as any, .065),
    processManufacturingGeometry(composedFinal, .16, .10, -.045, profileIds as any, .065), `${fixture.name}: restored manufacturing differs`);

  // Generated-item order is deliberately perturbed without changing source-edge traversal.
  const reordered = selectGeneratedGeometryAuthority(fixture.model, [...fixture.raw].reverse(), 'single-tool');
  assert(reordered.ok, `${fixture.name}: reordered selection failed`);
  same(buildFinalGeometry(fixture.model, reordered.generatedGeometry), composedFinal, `${fixture.name}: item-order output differs`);
  same(JSON.stringify(fixture.raw), originalRaw, `${fixture.name}: original generated provenance mutated`);
  console.log(`PASS | ${fixture.name} | ${fixture.tool}_ONLY | FinalGeometry | Profile Offset | Tap Clearance | Slot Clearance | Kerf | restore | order`);
};

const failures: string[] = [];
fixtures.forEach((fixture) => {
  try { verify(fixture); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${fixture.name}: ${message}`);
    console.error(`FAIL — AUTHORITY | ${fixture.name} | ${message}`);
  }
});
if (failures.length) throw new Error(`Authority Step B evidence found ${failures.length} failure(s):\n${failures.join('\n')}`);
console.log(`Authority Step B single-tool evidence: PASS (${fixtures.filter((x) => x.tool === 'TB').length} TB, ${fixtures.filter((x) => x.tool === 'S').length} S fixtures)`);
