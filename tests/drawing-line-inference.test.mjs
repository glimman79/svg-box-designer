import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-inference');
const inference = await import(pathToFileURL(path.join(root, 'drawingInference.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingProfileTool.js')));
const types = await import(pathToFileURL(path.join(root, 'drawingTypes.js')));
const topology = await import(pathToFileURL(path.join(root, 'drawingTopology.js')));
const demandSource = fs.readFileSync('src/app/drawingGeometricDemand.ts', 'utf8');
const snapSource = fs.readFileSync('src/app/drawingSnapEngine.ts', 'utf8');
const executable = (source) => stripTypeScriptTypes(source.replace(/^import .*\n/gm, '').replace(/^export /gm, ''));
const resolveDrawingSnap = vm.runInNewContext(executable(demandSource) + '\n' + executable(snapSource) + '\nresolveDrawingSnap',
  { DRAWING_MODEL_SPACE_TOLERANCE: types.DRAWING_MODEL_SPACE_TOLERANCE });
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = { id: 'line-a', type: 'line', startPointId: 'a', endPointId: 'b', start: { x: 10, y: 10 }, end: { x: 110, y: 10 } };

assert.equal(inference.DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX, 9);
assert.equal(inference.DRAWING_LINE_INFERENCE_TOLERANCE_PX, 8);
assert.deepEqual(inference.resolveDrawingInference({ x: 18.9, y: 10 }, [line], identity), {
  type: 'endpoint', entityId: 'line-a', endpoint: 'start', pointId: 'a', reference: { kind: 'sketchPoint', pointId: 'a' }, candidatePoint: line.start, screenDistance: 8.899999999999999,
}, 'line start is detected inside endpoint tolerance');
assert.equal(inference.resolveDrawingInference({ x: 101.1, y: 10 }, [line], identity).endpoint, 'end', 'line end is detected');
assert.equal(inference.resolveDrawingInference({ x: 60, y: 10 }, [line], identity).type, 'midpoint', 'exact Midpoint is a distinct semantic candidate');
assert.equal(inference.resolveDrawingInference({ x: 40, y: 17.9 }, [line], identity).type, 'line', 'finite body is detected');
assert.equal(inference.resolveDrawingInference({ x: 60, y: 18.1 }, [line], identity).type, 'none', 'line outside tolerance is not detected');
assert.equal(inference.resolveDrawingInference({ x: 120, y: 10 }, [line], identity).type, 'none', 'projection beyond finite segment is not a line hit');
assert.equal(inference.resolveDrawingInference({ x: 17, y: 10 }, [line], identity).type, 'endpoint', 'endpoint has priority over line body');

const scaleFour = { a: 4, b: 0, c: 0, d: 4, e: 20, f: -12 };
assert.equal(inference.resolveDrawingInference({ x: 20 + 40 * 4, y: -12 + 10 * 4 + 7.9 }, [line], scaleFour).type, 'line', 'pixel tolerance is invariant at 4x CTM scale');
assert.equal(inference.resolveDrawingInference({ x: 20 + 40 * 4, y: -12 + 10 * 4 + 8.1 }, [line], scaleFour).type, 'none', '4x model zoom does not enlarge pixel tolerance');
assert.deepEqual(inference.distancePointToSegment({ x: 120, y: 10 }, line.start, line.end), { distance: 10, parameter: 1 });

let document = types.createDrawingDocumentV2();
document = { ...document, activeSketchId: 'sketch-2', sketches: { ...document.sketches, 'sketch-2': { ...document.sketches[document.activeSketchId], id: 'sketch-2', name: 'Sketch 2', points: { a: { id: 'a', ...line.start }, b: { id: 'b', ...line.end } }, entities: { 'line-a': { id: 'line-a', type: 'line', startPointId: 'a', endPointId: 'b' } }, entityOrder: ['line-a'] } }, sketchOrder: [...document.sketchOrder, 'sketch-2'] };
const activeSketch = document.sketches[document.activeSketchId];
const activeLines = topology.resolveActiveSketchLines(document);
assert.equal(inference.resolveDrawingInference({ x: 60, y: 12 }, activeLines, identity).entityId, 'line-a', 'caller can resolve the document active sketch without hardcoding Sketch 1');

let interaction = lineTool.applyProfileClick(lineTool.EMPTY_PROFILE_INTERACTION, { x: 0, y: 0 }, () => 'new-line').interaction;
const raw = { x: 19, y: 18 };
interaction = lineTool.updateProfilePreview(interaction, raw);
assert.equal(lineTool.hasAngularPresentationTruth(interaction), true, 'D2.2a remains authoritative near 45 degrees');
assert.ok(Math.abs(interaction.effectivePreviewPoint.x - interaction.effectivePreviewPoint.y) < 1e-10, 'effective preview retains exact 45 degree geometry');
const beforeInference = structuredClone(interaction);
assert.equal(inference.resolveDrawingInference({ x: 10, y: 10 }, [line], identity).type, 'endpoint');
assert.deepEqual(interaction, beforeInference, 'candidate discovery is pure and cannot itself accept a placement');
const committed = lineTool.applyProfileClick(interaction, raw, () => 'new-line');
assert.deepEqual(committed.entity.end, interaction.effectivePreviewPoint, 'the angular-only helper commits its own effective preview');

// Candidate semantics flow through the actual global resolver and shared
// effective-point authority before an accepted Profile click is committed.
const rawEndpoint = { x: 10.3, y: 10 };
const candidates = inference.collectDrawingInferenceCandidates(rawEndpoint, activeLines, identity, undefined,
  null, null, null, Object.values(activeSketch.points), topology.collectDrawingAuthoringPoints(activeSketch));
const endpointCandidate = candidates.endpoints.find(({ pointId }) => pointId === 'a');
assert.equal(endpointCandidate.entityId, 'line-a');
assert.deepEqual(endpointCandidate.reference, { kind: 'sketchPoint', pointId: 'a' });
assert.deepEqual(endpointCandidate.candidatePoint, { x: 10, y: 10 });
const snap = resolveDrawingSnap({ rawPoint: rawEndpoint, candidates, previousSnap: null, ctrlOverride: false });
assert.equal(snap.type, 'endpoint');
assert.equal(snap.pointId, 'a');
assert.deepEqual(structuredClone(snap.reference), endpointCandidate.reference);
const placement = lineTool.resolveLineEffectivePoint(lineTool.initializeProfileSegmentAt({ x: 0, y: 0 }, 'origin'), rawEndpoint, snap);
assert.deepEqual(placement.effectivePoint, { x: 10, y: 10 }, 'hard Endpoint owns exact placement');
assert.equal(placement.interaction.snappedAngleDegrees, 45, 'compatible angular presentation survives exact position');
const accepted = lineTool.applyResolvedProfileClick(placement.interaction, placement.effectivePoint, () => 'placed', snap.pointId);
assert.equal(accepted.entity.endPointId, 'a', 'persistent topology survives production resolution and commit');
assert.deepEqual(accepted.entity.end, { x: 10, y: 10 });

// A shared persistent point is one candidate; equal coordinates with distinct
// IDs are two topology candidates. Owning entity order cannot invent identity.
const sharing = { ...line, id: 'line-b', startPointId: 'a', endPointId: 'c', end: { x: 10, y: 110 } };
const separate = { ...sharing, id: 'line-c', startPointId: 'same-coordinate', endPointId: 'd' };
for (const scene of [[line, sharing, separate], [separate, sharing, line]]) {
  const values = inference.collectDrawingInferenceCandidates(line.start, scene, identity);
  assert.equal(values.endpoints.filter(({ pointId }) => pointId === 'a').length, 1);
  const coincident = values.endpoints.filter(({ candidatePoint }) => candidatePoint.x === 10 && candidatePoint.y === 10);
  assert.deepEqual(coincident.map(({ pointId }) => pointId).sort(), ['a', 'same-coordinate']);
  const resolved = resolveDrawingSnap({ rawPoint: line.start, candidates: values, previousSnap: null, ctrlOverride: false });
  assert.equal(resolved.pointId, 'a', 'deterministic ties use semantic point identity');
}

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /className=\{`cad-tool-button\$\{activeTool === 'profile' \? ' is-active' : ''\}`\} aria-pressed=\{activeTool === 'profile'\}/, 'Profile button active presentation derives from sole activeTool state');
assert.match(workspace, /className=\{`cad-tool-button\$\{activeTool === 'select' \? ' is-active' : ''\}`\} aria-pressed=\{activeTool === 'select'\}/, 'Select has mutually exclusive tool-state presentation');
assert.match(workspace, /\(isSegmentTool \|\| activeTool === 'circle' \|\| activeTool === 'arc'\) && segmentCursor/, 'shared cursor renders only for geometry authoring');
assert.match(workspace, /data-arm="left"[\s\S]*data-arm="right"[\s\S]*data-arm="top"[\s\S]*data-arm="bottom"/, 'four separate arms structurally preserve the centre gap');
assert.match(workspace, /drawing-segment-cursor-dot[\s\S]*drawing-segment-cursor-endpoint[\s\S]*drawing-segment-cursor-line/, 'normal dot, Point square, and smaller Line square are distinct marker states');
assert.match(workspace, /resolveLineEffectivePoint\(interaction, rawPoint, snap, ctrlHeld\);[\s\S]*let placementPoint = lineResolution\.effectivePoint;/, 'placement marker follows the authoritative resolved endpoint and final Ctrl guard');
assert.match(workspace, /onPointerLeave=\{clearSegmentCursor\}/, 'pointer leave clears cursor presentation without cancelling chain state');
assert.match(workspace, /activeSketch\?\.entityOrder/, 'inference reads committed entities from the active sketch');
assert.match(css, /\.drawing-svg\.has-authoring-cursor,[\s\S]*cursor:\s*none;/, 'system cursor hides only in active Drawing SVG scope');
assert.doesNotMatch(css, /body[^}]*cursor:\s*none/s, 'system cursor is not hidden globally');
assert.match(css, /\.drawing-label-overlay[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s, 'cursor uses the accepted screen-space overlay');

console.log('D2.2b CAD cursor and visual inference tests passed');
