import { applyProfileOffset, applySlotClearance, applyTapClearance } from '../../src/app/manufacturingCompensation';
import { createManufacturingGeometry } from '../../src/app/manufacturingGeometry';
import { geometryServices, type GeometryServices } from '../../src/app/geometryServices';
import { projectTapClearanceMask, resolveTapClearanceElementIds } from '../../src/app/tapClearance';
import type { FinalContour } from '../../src/app/contourClassification';
import type { GeneratedProfile } from '../../src/app/generatedProfiles';

const invariant: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const path = (points: ReadonlyArray<{ x: number; y: number }>) => `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`;
const basePoints = (x = 0) => [{ x, y: 0 }, { x: x + 2, y: 0 }, { x: x + 2, y: -2 }, { x: x + 4, y: -2 }, { x: x + 4, y: 0 }, { x: x + 6, y: 0 }, { x: x + 6, y: -2 }, { x: x + 8, y: -2 }, { x: x + 8, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }];

const profile = (id: string, panelId: string, points: ReturnType<typeof basePoints>, generatorType: 'TB' | 'S' = 'TB'): GeneratedProfile => {
  const specs = [['boundary-0', 'boundary-run'], ['first-leading', 'tap-leading-wall'], ['first-tip', 'tap-tip'], ['first-trailing', 'tap-trailing-wall'], ['boundary-1', 'boundary-run'], ['last-leading', 'tap-leading-wall'], ['last-tip', 'tap-tip'], ['last-trailing', 'tap-trailing-wall'], ['boundary-2', 'boundary-run']] as const;
  const elements = specs.map(([suffix, kind], profileOrder) => ({ id: `${id}:${suffix}`, profileId: id, kind, profileOrder, geometryProjectionId: `${id}:projection:${suffix}`,
    ...(kind === 'tap-leading-wall' ? { segmentTapRole: 'tap-side-start' as const } : kind === 'tap-trailing-wall' ? { segmentTapRole: 'tap-side-end' as const } : kind === 'tap-tip' ? { segmentTapRole: 'tap-tip' as const } : {}) }));
  return {
    id, generatorType, operationId: `operation:${id}`, panelId, sourceEdgeId: `edge:${id}`,
    sourceEdgeDirection: { start: points[0], end: points[9] }, attachmentStart: points[0], attachmentEnd: points[9],
    orderedElements: elements, geometryProjections: elements.map((element, index) => ({ id: element.geometryProjectionId, profileId: id, elementId: element.id, kind: 'current-contour-segment', profileSegmentOrder: index, start: points[index], end: points[index + 1] })),
    orderedTaps: [
      { id: `${id}:tap:0`, tapIndex: 0, totalTapCount: 2, leadingWallElementId: `${id}:first-leading`, tipElementId: `${id}:first-tip`, trailingWallElementId: `${id}:first-trailing`, isFirstTap: true, isMiddleTap: false, isLastTap: false },
      { id: `${id}:tap:1`, tapIndex: 1, totalTapCount: 2, leadingWallElementId: `${id}:last-leading`, tipElementId: `${id}:last-tip`, trailingWallElementId: `${id}:last-trailing`, isFirstTap: false, isMiddleTap: false, isLastTap: true },
    ], leadingBoundaryRun: `${id}:boundary-0`, trailingBoundaryRun: `${id}:boundary-2`,
  } as unknown as GeneratedProfile;
};
const contour = (panelId: string, points: ReturnType<typeof basePoints>): FinalContour => ({ id: `final-panel:${panelId}`, panelId, ownerPanelId: panelId, source: 'final-contour', finalSource: 'applied-panel', kind: 'OUTER', geometryType: 'GENERATED_OUTER', profileMaterialSide: 'GENERATED_MATING', points, pathD: path(points), compensationProfile: points.map(() => false) });

// This synthetic fixture directly constructs independent GeneratedProfile projection
// and FinalContour coordinates. Translations of +80/+100 intentionally verify that
// Tap Clearance does not claim merely similar geometry.
const fixtures = [
  ['upper', 'upper-panel', 0, 0, 'TB', 'match'], ['lower', 'lower-panel', 20, 20, 'TB', 'match'],
  ['left', 'left-panel', 40, 140, 'TB', 'mismatch'], ['center-a', 'center-panel', 60, 160, 'TB', 'mismatch'],
  ['center-b', 'center-panel', 80, 160, 'S', 'mismatch'], ['right', 'right-panel', 100, 200, 'S', 'mismatch'],
] as const;
const profiles = fixtures.map(([id, panel, projectionX, , generator]) => profile(id, panel, basePoints(projectionX), generator));
const contours = [...new Map(fixtures.map(([, panel, , finalX]) => [panel, contour(panel, basePoints(finalX))])).values()];
const finalGeometry = { contours, diagnostics: [], generatedProfiles: profiles };
const manufacturing = createManufacturingGeometry(finalGeometry);
invariant(JSON.stringify(manufacturing.generatedProfiles) === JSON.stringify(profiles), 'Manufacturing clone changed semantic shadow data');
invariant(manufacturing.finalContourList.every((value, index) => value.id === contours[index].id && JSON.stringify(value.points) === JSON.stringify(contours[index].points)), 'Manufacturing clone changed contour identity or segment order');
const projectedMasks = new Map(profiles.map((value) => {
  const owner = manufacturing.finalContourList.find((candidate) => candidate.panelId === value.panelId)!;
  return [value.id, projectTapClearanceMask(owner, [value])] as const;
}));

const calls = new Map<string, { mask: boolean[]; result: boolean }>();
const services: GeometryServices = {
  parallelProfile: (...args) => geometryServices.parallelProfile(...args), offset: (...args) => geometryServices.offset(...args),
  orientation: (...args) => geometryServices.orientation(...args), signedArea: (...args) => geometryServices.signedArea(...args),
  clone: (...args) => geometryServices.clone(...args), replace: (...args) => geometryServices.replace(...args),
  compensateProfile(value, distance, direction) { const result = geometryServices.compensateProfile(value, distance, direction); calls.set(value.id, { mask: [...(value.compensationProfile ?? [])], result: result !== null }); return result; },
};
const profileOffsetSnapshot = JSON.stringify(applyProfileOffset(createManufacturingGeometry(finalGeometry), 0).finalContourList);
applyTapClearance(manufacturing, -0.90, services);
const tapSnapshot = JSON.stringify(manufacturing.finalContourList);
const slotSnapshot = JSON.stringify(applySlotClearance(manufacturing.finalContourList, 0));
invariant(tapSnapshot === slotSnapshot, 'zero Slot Clearance replaced Tap Clearance output');

let eligibleProfiles = 0; let validLocalProjections = 0; let maskProfiles = 0; let serviceProfiles = 0; let changedProfiles = 0;
console.log('Profile | Eligible | Projected | Expected relation | Result | Added to mask | Sent to Geometry Services | Coordinates changed');
for (const value of profiles) {
  const owner = manufacturing.finalContourList.find((candidate) => candidate.panelId === value.panelId)!;
  const eligible = resolveTapClearanceElementIds(value); eligibleProfiles += eligible.size > 0 ? 1 : 0;
  const local = value.geometryProjections.filter((projection) => eligible.has(projection.elementId)); validLocalProjections += local.length === eligible.size ? 1 : 0;
  const projectedMask = projectedMasks.get(value.id)!; const projected = projectedMask.filter(Boolean).length;
  const contributed = projected; if (contributed) maskProfiles += 1;
  const call = calls.get(owner.id); const sent = call ? projectedMask.filter((selected, index) => selected && call.mask[index]).length : 0; if (sent) serviceProfiles += 1;
  const source = contours.find((candidate) => candidate.id === owner.id)!; const changed = source.pathD === owner.pathD ? 0 : contributed; if (changed) changedProfiles += 1;
  const expected = fixtures.find(([id]) => id === value.id)![5];
  invariant(eligible.size > 0, `${value.id}: expected eligible tap-side-start/tap-side-end elements`);
  if (expected === 'mismatch') invariant(projected === 0, `${value.id}: translated lookalike geometry was incorrectly claimed`);
  else invariant(projected === eligible.size, `${value.id}: matching projection did not map every eligible element`);
  const result = expected === 'mismatch'
    ? 'EXPECTED_MISMATCH'
    : call?.result && changed ? 'PASS' : 'GEOMETRY_SERVICES_SAFE_FALLBACK';
  console.log(`${value.id} | ${eligible.size} | ${projected} | ${expected} | ${result} | ${contributed} | ${sent} | ${changed}`);
}
invariant(eligibleProfiles === 6 && validLocalProjections === 6, 'semantic or item-local projection baseline changed');
invariant(maskProfiles === 2 && serviceProfiles === 2 && changedProfiles === 2, 'synthetic match/mismatch signature changed');
invariant(JSON.stringify(finalGeometry) === JSON.stringify({ contours, diagnostics: [], generatedProfiles: profiles }), 'diagnostic mutated FinalGeometry');
invariant(profileOffsetSnapshot !== tapSnapshot, 'Tap Clearance did not create its isolated change');

// Independent accumulation audit: two identities contributing the same contour
// must be unioned, never reset or replaced. Shift B onto the second notch.
const accumulationPoints = basePoints(300);
const a = profile('accumulation-a', 'accumulation-panel', accumulationPoints);
const b = profile('accumulation-b', 'accumulation-panel', accumulationPoints);
const bProjections = b.geometryProjections.map((projection) => {
  if (projection.elementId.endsWith('first-trailing')) return { ...projection, start: accumulationPoints[7], end: accumulationPoints[8] };
  if (projection.elementId.endsWith('last-leading')) return { ...projection, start: accumulationPoints[1], end: accumulationPoints[2] };
  return projection;
});
const accumulated = projectTapClearanceMask(contour('accumulation-panel', accumulationPoints), [a, { ...b, geometryProjections: bProjections }]);
invariant([1, 2, 3, 5, 6, 7].filter((index) => accumulated[index]).length === 4, 'multi-profile union lost a contribution');

console.log(`\nTOTALS\nProfiles present: 6\nSemantically eligible profiles: ${eligibleProfiles}\nProfiles with valid item-local projections: ${validLocalProjections}\nProfiles contributing projected masks: ${maskProfiles}\nProfiles reaching Geometry Services: ${serviceProfiles}\nProfiles producing changed coordinates: ${changedProfiles}`);
console.log('Translated controls (left, center-a, center-b, right) are intentionally rejected because their projection coordinates do not occur in the independently constructed synthetic final contours.');
console.log('Matching controls (upper/lower) project every eligible element; Geometry Services safe-fallback coverage remains observable if compensation cannot reconstruct a contour.');
console.log('This diagnostic directly creates a FinalGeometry-shaped fixture; it does not exercise generator-to-FinalGeometry assembly or production provenance construction.');
