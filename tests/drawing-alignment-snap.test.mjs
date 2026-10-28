import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-alignment');
const inference = await import(pathToFileURL(path.join(root, 'drawingInference.js')));
const snapEngine = await import(pathToFileURL(path.join(root, 'drawingSnapEngine.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingProfileTool.js')));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = { id: 'line-a', type: 'line', start: { x: 100, y: 50 }, end: { x: 180, y: 80 } };
const bounds = { x: 0, y: 0, width: 500, height: 500 };
const candidates = (client, lines = [line], viewport = bounds, transform = identity) => inference.collectDrawingInferenceCandidates(client, lines, transform, viewport);
const resolve = (rawPoint, values, previousSnap = null, ctrlOverride = false) => snapEngine.resolveDrawingSnap({ rawPoint, candidates: values, previousSnap, ctrlOverride });

let result = resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }));
assert.equal(result.type, 'alignment');
assert.equal(result.effectivePoint.x, 100, 'visible remote reference supplies exact X');
assert.equal(result.effectivePoint.y, 400, 'X alignment does not alter Y');
assert.equal(result.xReference.referenceId, 'line-a:start');

result = resolve({ x: 400, y: 52 }, candidates({ x: 400, y: 52 }));
assert.equal(result.effectivePoint.y, 50, 'visible remote reference supplies exact Y');
assert.equal(result.effectivePoint.x, 400, 'Y alignment does not alter X');

for (const raw of [{ x: 102, y: 400 }, { x: 400, y: 52 }]) {
  const visibleCandidates = candidates(raw);
  const visible = resolve(raw, visibleCandidates);
  for (const viewport of [{ x: 110, y: 0, width: 400, height: 500 }, { x: 99, y: 49, width: 2, height: 2 }]) {
    const pannedCandidates = candidates(raw, [line], viewport);
    assert.deepEqual(pannedCandidates, visibleCandidates, 'viewport bounds do not cull committed semantic references');
    const panned = resolve(raw, pannedCandidates);
    assert.equal(panned.type, 'alignment');
    assert.deepEqual(panned, visible, 'panning preserves exact position and stable reference identity');
    assert.equal((panned.xReference ?? panned.yReference).referenceId, 'line-a:start');
  }
}
const scaleFour = { a: 4, b: 0, c: 0, d: 4, e: 20, f: -12 };
for (const transform of [identity, scaleFour]) {
  const atDistance = (pixels, previous = null) => {
    const raw = { x: 100 + pixels / transform.a, y: 400 };
    const client = { x: transform.e + raw.x * transform.a, y: transform.f + raw.y * transform.d };
    return resolve(raw, candidates(client, [line], bounds, transform), previous);
  };
  const captured = atDistance(4.9);
  assert.equal(captured.type, 'alignment', 'capture inside five CSS pixels is zoom invariant');
  assert.equal(captured.xReference.referenceId, 'line-a:start');
  assert.deepEqual(captured.effectivePoint, { x: 100, y: 400 });
  assert.equal(atDistance(5.1).type, 'none', 'fresh capture outside five CSS pixels is rejected');
  const retained = atDistance(6.9, captured);
  assert.equal(retained.type, 'alignment', 'acquired reference retains inside seven CSS pixels');
  assert.equal(retained.xReference.referenceId, captured.xReference.referenceId);
  assert.deepEqual(retained.effectivePoint, captured.effectivePoint);
  assert.equal(atDistance(7.1, captured).type, 'none', 'acquired reference releases beyond seven CSS pixels');
  const accepted = lineTool.applyResolvedProfileClick(lineTool.EMPTY_PROFILE_INTERACTION, retained.effectivePoint, () => 'unused', 'placed');
  assert.deepEqual(accepted.interaction.start, { x: 100, y: 400 }, 'accepted placement preserves the exact aligned coordinate');
  assert.equal(accepted.interaction.startPointId, 'placed', 'alignment does not reuse source-point topology');
}

const crossing = [line, { id: 'line-b', type: 'line', start: { x: 300, y: 250 }, end: { x: 350, y: 280 } }];
result = resolve({ x: 102, y: 252 }, candidates({ x: 102, y: 252 }, crossing));
assert.deepEqual(result.effectivePoint, { x: 100, y: 250 }, 'X and Y can resolve simultaneously from different points');
assert.equal(result.xReference.entityId, 'line-a');
assert.equal(result.yReference.entityId, 'line-b');
result = resolve({ x: 102, y: 52 }, candidates({ x: 102, y: 52 }));
assert.equal(result.type, 'endpoint', 'nearby same-reference X/Y retains endpoint priority');

const closeAxes = [
  { id: 'z-x', type: 'line', start: { x: 103, y: 20 }, end: { x: 350, y: 30 } },
  { id: 'a-x', type: 'line', start: { x: 101, y: 40 }, end: { x: 360, y: 50 } },
  { id: 'z-y', type: 'line', start: { x: 20, y: 203 }, end: { x: 30, y: 350 } },
  { id: 'a-y', type: 'line', start: { x: 40, y: 201 }, end: { x: 50, y: 360 } },
];
result = resolve({ x: 100, y: 200 }, candidates({ x: 100, y: 200 }, closeAxes));
assert.equal(result.xReference.entityId, 'a-x', 'smallest perpendicular X correction wins');
assert.equal(result.yReference.entityId, 'a-y', 'smallest perpendicular Y correction wins');
const tie = [
  { id: 'z-x', type: 'line', start: { x: 102, y: 20 }, end: { x: 300, y: 30 } },
  { id: 'a-x', type: 'line', start: { x: 98, y: 40 }, end: { x: 310, y: 50 } },
  { id: 'z-y', type: 'line', start: { x: 20, y: 202 }, end: { x: 30, y: 300 } },
  { id: 'a-y', type: 'line', start: { x: 40, y: 198 }, end: { x: 50, y: 310 } },
];
result = resolve({ x: 100, y: 200 }, candidates({ x: 100, y: 200 }, tie));
assert.equal(result.xReference.entityId, 'a-x', 'equal X correction uses stable reference identity');
assert.equal(result.yReference.entityId, 'a-y', 'equal Y correction uses stable reference identity');

result = resolve({ x: 140, y: 65 }, candidates({ x: 140, y: 65 }));
assert.equal(result.type, 'midpoint', 'the exact Midpoint has priority over its finite line body');
assert.deepEqual(result.effectivePoint, { x: 140, y: 65 });
result = resolve({ x: 120, y: 57.5 }, candidates({ x: 120, y: 57.5 }));
assert.equal(result.type, 'line', 'finite line-body snap retains priority');
assert.deepEqual(result.effectivePoint, { x: 120, y: 57.5 });
const aligned = resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }));
assert.equal(resolve({ x: 106.9, y: 400 }, candidates({ x: 106.9, y: 400 }), aligned).type, 'alignment', 'alignment retains through release tolerance');
assert.equal(resolve({ x: 102, y: 400 }, candidates({ x: 102, y: 400 }), aligned, true).type, 'none', 'Ctrl releases alignment');
const angular = lineTool.resolveLinePreviewPoint({ x: 0, y: 0 }, { x: 100, y: 39 });
assert.equal(angular.snapActive, true, 'Line angular fallback remains available');

const refs = inference.collectDrawingReferencePoints([line, { id: 'shared', type: 'line', start: line.end, end: { x: 220, y: 100 } }]);
assert.equal(refs.length, 3, 'shared vertices are deduplicated');
assert.equal(inference.isPointInDrawingBounds({ x: 0, y: 0 }, bounds), true, 'viewport edges are inclusive');

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');
const cssRule = (selector) => {
  const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some((value) => value.trim() === selector));
  assert.ok(rules.length, `${selector} has a style rule`);
  return rules.map(([, , declarations]) => declarations).join('\n');
};
assert.match(workspace, /snap\.type === 'alignment'[\s\S]*drawing-segment-cursor-alignment/);
assert.match(workspace, /<rect className="drawing-segment-cursor-alignment"/, 'alignment marker is a square');
assert.match(workspace, /drawing-alignment-guide[\s\S]*data-axis="x"[\s\S]*drawing-alignment-guide[\s\S]*data-axis="y"/, 'both transient guide axes render');
assert.match(styles, /--drawing-inference:\s*#38bdf8;[\s\S]*\.drawing-alignment-guide\s*\{[^}]*stroke:\s*var\(--drawing-inference\);[^}]*stroke-dasharray:\s*5 4;[^}]*pointer-events:\s*none;/s, 'H/V guides use the shared CAD-blue inference token and remain dashed and pointer-safe');
assert.match(styles, /--drawing-authoring-preview:\s*#38bdf8;/, 'Authoring Preview currently shares CAD blue through its own semantic token');
assert.match(workspace, /className=\{`drawing-authoring-preview\$\{hasAngularPresentationTruth\(segmentInteraction\)/,
  'the actual straight-segment preview uses the shared authoring role and angular modifier');
assert.match(cssRule('.drawing-authoring-preview'), /stroke:\s*var\(--drawing-authoring-preview\);/, 'preview paint preserves its separate semantic role');
assert.match(cssRule('.drawing-authoring-preview.is-angular-snapped'), /stroke-width:\s*1\.7;[\s\S]*stroke-dasharray:\s*none;/,
  'angular authority retains its solid preview modifier');
assert.match(styles, /\.drawing-geometry-entity\.is-inference-target\s*\{[^}]*stroke:\s*var\(--drawing-inference\);/s, 'Parallel and Perpendicular target previews use CAD blue');
for (const selector of ['.drawing-segment-cursor-perpendicular', '.drawing-segment-cursor-parallel']) {
  assert.match(cssRule(selector), /stroke:\s*var\(--drawing-inference\);/, 'transient relation cursor glyphs use CAD blue');
}
assert.match(styles, /\.drawing-same-axis-reference-highlight\s*\{[^}]*stroke:\s*var\(--drawing-inference\);/s, 'reference-only point halo uses CAD blue');
assert.doesNotMatch(styles, /--drawing-alignment-guide|#c084fc/, 'the retired purple preview styling is absent');
assert.match(workspace, /snap\.type === 'endpoint' && <rect/, 'endpoint marker is the larger Point square');
assert.match(workspace, /snap\.type === 'line' && <rect/, 'line marker is a square');
assert.match(workspace, /if \(panHandlers\.onPointerMove\(event\)\) return;[\s\S]*resolvePlacement/, 'right-pan exits before inference');
assert.match(workspace, /const effectivePoint = placement\.position\.point;[\s\S]*commitSegmentPlacement\('profile', effectivePoint, endpointPointId, placement\.interaction,/, 'commit closes over the immutable authoritative position and its accepted inference through shared segment support');
assert.match(workspace, /if \(event\.button === CAD_PRIMARY_BUTTON\) event\.preventDefault\(\);/, 'accepted Drawing-local primary mousedown fix remains');
assert.doesNotMatch(workspace, /setDocument[\s\S]{0,120}drawing-alignment-guide/, 'guides never enter DrawingDocument');

console.log('D2.4 global Drawing X/Y alignment snap tests passed');
