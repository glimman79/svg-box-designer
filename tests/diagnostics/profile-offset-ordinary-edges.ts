import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { applyProfileOffset, resolveProfileOffsetProfileSelection } from '../../src/app/manufacturingCompensation';
import { createManufacturingGeometry } from '../../src/app/manufacturingGeometry';
import { normalizeProjectSettings } from '../../src/app/projectSettings';
import { createGeneratedProfileOffsetTargetId, createOrdinaryProfileOffsetTargetId, parseProfileOffsetSelectionTarget } from '../../src/app/profileOffsetSelection';
import type { FinalGeometry } from '../../src/app/finalGeometry';
import type { GeneratedProfileId } from '../../src/app/generatedProfiles';
import type { SvgDocumentModel } from '../../src/svgUtils';

const panel = (id: string, clockwise = true) => {
  const points = clockwise
    ? [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]
    : [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 0 }];
  const edgeIds = ['edge-0', 'edge-1', 'edge-2', 'edge-3'];
  return { id, contour: points, outerContour: points, edgeIds, innerContours: [], bounds: { minX: 0, minY: 0, maxX: 20, maxY: 10 } };
};

const model = (panels: ReturnType<typeof panel>[]) => ({ panels, edges: [], viewBox: '0 0 20 10' } as unknown as SvgDocumentModel);
const assert = {
  equal: (actual: unknown, expected: unknown, message = 'values differ') => { if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); },
  notEqual: (actual: unknown, expected: unknown, message = 'values unexpectedly match') => { if (actual === expected) throw new Error(message); },
  deepEqual: (actual: unknown, expected: unknown, message = 'values differ') => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); },
};

for (const clockwise of [true, false]) {
  const final = buildFinalGeometry(model([panel('panel-a', clockwise)]), []);
  assert.deepEqual(final.contours[0].segmentSourceEdgeIds, ['edge-0', 'edge-1', 'edge-2', 'edge-3']);
  for (const selectedIndexes of [[0], [0, 1], [0, 2]]) {
    const ids = selectedIndexes.map((index) => createOrdinaryProfileOffsetTargetId('panel-a', `edge-${index}`));
    const manufacturing = resolveProfileOffsetProfileSelection(createManufacturingGeometry(final), ids);
    assert.deepEqual(manufacturing.finalContourList[0].compensationProfile, [0, 1, 2, 3].map((index) => selectedIndexes.includes(index)));
  }
  for (const amount of [0.9, -0.9]) {
    const selected = resolveProfileOffsetProfileSelection(createManufacturingGeometry(final), [createOrdinaryProfileOffsetTargetId('panel-a', 'edge-0')]);
    assert.notEqual(applyProfileOffset(selected, amount).finalContourList[0].pathD, final.contours[0].pathD);
  }
}

const generatedId = 'generated-profile-legacy' as GeneratedProfileId;
const precedenceFinal: FinalGeometry = {
  contours: [{ ...buildFinalGeometry(model([panel('panel-a')]), []).contours[0], segmentProfileIds: [generatedId, null, null, null], segmentSourceEdgeIds: [null, 'edge-1', 'edge-2', 'edge-3'] }],
  diagnostics: [], generatedProfiles: [],
};
const both = resolveProfileOffsetProfileSelection(createManufacturingGeometry(precedenceFinal), [generatedId, createOrdinaryProfileOffsetTargetId('panel-a', 'edge-1')]);
assert.deepEqual(both.finalContourList[0].compensationProfile, [true, true, false, false], 'generated and ordinary targets union without overlapping ownership');

const panelBFinal = buildFinalGeometry(model([panel('panel-a'), panel('panel-b')]), []);
const onlyPanelA = resolveProfileOffsetProfileSelection(createManufacturingGeometry(panelBFinal), [createOrdinaryProfileOffsetTargetId('panel-a', 'edge-0')]);
assert.equal(onlyPanelA.finalContourList[0].compensationProfile?.[0], true);
assert.equal(onlyPanelA.finalContourList[1].compensationProfile?.some(Boolean), false, 'panel identity prevents source edge collisions');

const ordinaryId = createOrdinaryProfileOffsetTargetId('panel:a', 'edge/0');
const generatedTargetId = createGeneratedProfileOffsetTargetId(generatedId);
const normalized = normalizeProjectSettings({ selectedProfileOffsetIds: [ordinaryId, generatedTargetId] }).settings;
assert.deepEqual(normalized.selectedProfileOffsetIds, [ordinaryId, generatedTargetId], 'save/load normalization preserves both target kinds');
assert.deepEqual(parseProfileOffsetSelectionTarget(ordinaryId), { kind: 'ordinary-source-edge', id: ordinaryId, panelId: 'panel:a', sourceEdgeId: 'edge/0' });
assert.equal(parseProfileOffsetSelectionTarget(generatedId)?.kind, 'generated-profile', 'legacy ids normalize as generated targets');

console.log('ordinary-edge Profile Offset regression: passed');
