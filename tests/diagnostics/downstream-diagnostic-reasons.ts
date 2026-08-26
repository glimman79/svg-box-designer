import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { makeMixedFixture } from './helpers/mixed-evidence-fixture';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const fixture = makeMixedFixture({ name: 'downstream reasons', tbEdges: [0], sEdges: [1] });
const base = { packagePanel: packageComposedPanelGeometry, buildFinal: buildFinalGeometry,
  manufacture: processManufacturingGeometry };
const run = (services: typeof base) => selectGeneratedGeometryAuthority(fixture.model, fixture.raw, 'mixed', undefined, undefined, services);

const success = run(base);
assert(success.ok, 'successful mixed candidate was rejected');
assert(success.downstreamDiagnostics.length > 0 && success.downstreamDiagnostics.every((entry) => entry.firstFailure === null),
  'successful mixed candidate lacks a passing diagnostic');

const finalFailure = run({ ...base, buildFinal: (model, items) => {
  const inputItems = 'generatedGeometry' in items ? items.generatedGeometry : items;
  const malformed = inputItems.map((item) => ({ ...item, generatedProfiles: item.generatedProfiles?.map((profile) => ({ ...profile,
    geometryProjections: profile.geometryProjections.map((projection, index) => index === 0 ? { ...projection,
      end: { x: projection.end.x + 12345, y: projection.end.y + 12345 } } : projection),
  })) }));
  return buildFinalGeometry(model, malformed);
} });
assert(!finalFailure.ok, 'non-throwing FinalGeometry error was accepted');
assert(finalFailure.downstreamDiagnostics.every((entry) => entry.firstFailure === 'FINAL_GEOMETRY_ERROR_DIAGNOSTIC'),
  'FinalGeometry error predicate was not identified');
assert(finalFailure.downstreamDiagnostics.every((entry) => entry.finalGeometry.error === null
  && entry.finalGeometry.diagnostics.some((diagnostic) => diagnostic.code === 'CLEARANCE_PROFILE_MISSING')),
  'FinalGeometry non-throwing detail was lost');
const trace = finalFailure.downstreamDiagnostics.flatMap((entry) => entry.clearanceProjectionTraces)[0];
assert(trace?.profile?.panelId === fixture.ownerPanelId && trace.projection?.id === trace.diagnosticId
  && trace.element && trace.matchCount === 0 && trace.candidateSegments.length > 0 && trace.finalContourSegments.length > 0,
  'CLEARANCE_PROFILE_MISSING lifecycle trace lacks semantic/candidate/final-contour evidence');
finalFailure.downstreamDiagnostics.forEach((entry) => assert(
  entry.finalGeometry.diagnostics.filter((diagnostic) => diagnostic.code === 'CLEARANCE_PROFILE_MISSING').length
    === entry.clearanceProjectionTraces.length,
  `missing diagnostic/trace count differs for ${entry.panelId}`,
));

const manufacturingFailure = run({ ...base, manufacture: (final, kerf, slot, offset, ids, tap) => ({
  ...processManufacturingGeometry(final, kerf, slot, offset, ids, tap), contours: [],
}) });
assert(!manufacturingFailure.ok, 'non-throwing zero-contour result was accepted');
assert(manufacturingFailure.downstreamDiagnostics.every((entry) => entry.firstFailure === 'MANUFACTURING_ZERO_CONTOURS'
  && entry.manufacturing.error === null && entry.manufacturing.contourCount === 0),
  'zero-contour predicate was not identified');

console.log('Downstream diagnostic reasons: PASS (success, FinalGeometry result diagnostic, manufacturing empty output)');
