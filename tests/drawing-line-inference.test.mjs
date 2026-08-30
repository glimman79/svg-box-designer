import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-inference');
const inference = await import(pathToFileURL(path.join(root, 'drawingInference.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const types = await import(pathToFileURL(path.join(root, 'drawingTypes.js')));
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = { id: 'line-a', type: 'line', start: { x: 10, y: 10 }, end: { x: 110, y: 10 } };

assert.equal(inference.DRAWING_ENDPOINT_INFERENCE_TOLERANCE_PX, 9);
assert.equal(inference.DRAWING_LINE_INFERENCE_TOLERANCE_PX, 8);
assert.deepEqual(inference.resolveDrawingInference({ x: 18.9, y: 10 }, [line], identity), {
  type: 'endpoint', entityId: 'line-a', endpoint: 'start', candidatePoint: line.start, screenDistance: 8.899999999999999,
}, 'line start is detected inside endpoint tolerance');
assert.equal(inference.resolveDrawingInference({ x: 101.1, y: 10 }, [line], identity).endpoint, 'end', 'line end is detected');
assert.equal(inference.resolveDrawingInference({ x: 60, y: 17.9 }, [line], identity).type, 'line', 'finite body is detected');
assert.equal(inference.resolveDrawingInference({ x: 60, y: 18.1 }, [line], identity).type, 'none', 'line outside tolerance is not detected');
assert.equal(inference.resolveDrawingInference({ x: 120, y: 10 }, [line], identity).type, 'none', 'projection beyond finite segment is not a line hit');
assert.equal(inference.resolveDrawingInference({ x: 17, y: 10 }, [line], identity).type, 'endpoint', 'endpoint has priority over line body');

const scaleFour = { a: 4, b: 0, c: 0, d: 4, e: 20, f: -12 };
assert.equal(inference.resolveDrawingInference({ x: 20 + 60 * 4, y: -12 + 10 * 4 + 7.9 }, [line], scaleFour).type, 'line', 'pixel tolerance is invariant at 4x CTM scale');
assert.equal(inference.resolveDrawingInference({ x: 20 + 60 * 4, y: -12 + 10 * 4 + 8.1 }, [line], scaleFour).type, 'none', '4x model zoom does not enlarge pixel tolerance');
assert.deepEqual(inference.distancePointToSegment({ x: 120, y: 10 }, line.start, line.end), { distance: 10, parameter: 1 });

let document = types.createDrawingDocumentV1();
document = { ...document, activeSketchId: 'sketch-2', sketches: { ...document.sketches, 'sketch-2': { id: 'sketch-2', name: 'Sketch 2', entities: { 'line-a': line }, entityOrder: ['line-a'] } }, sketchOrder: [...document.sketchOrder, 'sketch-2'] };
const activeSketch = document.sketches[document.activeSketchId];
const activeLines = activeSketch.entityOrder.map((id) => activeSketch.entities[id]);
assert.equal(inference.resolveDrawingInference({ x: 60, y: 12 }, activeLines, identity).entityId, 'line-a', 'caller can resolve the document active sketch without hardcoding Sketch 1');

let interaction = lineTool.applyLineClick(lineTool.EMPTY_LINE_INTERACTION, { x: 0, y: 0 }, () => 'new-line').interaction;
const raw = { x: 19, y: 18 };
interaction = lineTool.updateLinePreview(interaction, raw);
assert.equal(interaction.snapActive, true, 'D2.2a remains authoritative near 45 degrees');
assert.ok(Math.abs(interaction.effectivePreviewPoint.x - interaction.effectivePreviewPoint.y) < 1e-10, 'effective preview retains exact 45 degree geometry');
const beforeInference = structuredClone(interaction);
assert.equal(inference.resolveDrawingInference({ x: 10, y: 10 }, [line], identity).type, 'endpoint');
assert.deepEqual(interaction, beforeInference, 'visual inference does not mutate effective Line geometry');
const committed = lineTool.applyLineClick(interaction, raw, () => 'new-line');
assert.deepEqual(committed.entity.end, interaction.effectivePreviewPoint, 'commit uses angular effective point, never inference candidate');

const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
assert.match(workspace, /className=\{activeTool === 'line' \? 'is-active' : ''\} aria-pressed=\{activeTool === 'line'\}/, 'Line button active presentation derives from sole activeTool state');
assert.match(workspace, /className=\{activeTool === 'select' \? 'is-active' : ''\} aria-pressed=\{activeTool === 'select'\}/, 'Select has mutually exclusive tool-state presentation');
assert.match(workspace, /activeTool === 'line' && lineCursor/, 'custom cursor only renders for active Line');
assert.match(workspace, /data-arm="left"[\s\S]*data-arm="right"[\s\S]*data-arm="top"[\s\S]*data-arm="bottom"/, 'four separate arms structurally preserve the centre gap');
assert.match(workspace, /drawing-line-cursor-dot[\s\S]*drawing-line-cursor-endpoint[\s\S]*drawing-line-cursor-line/, 'normal dot, endpoint ring, and line triangle are distinct marker states');
assert.match(workspace, /placementPoint = nextInteraction\.effectivePreviewPoint \?\? point/, 'placement marker follows effective preview when angular snap applies');
assert.match(workspace, /onPointerLeave=\{clearLineCursor\}/, 'pointer leave clears cursor presentation without cancelling chain state');
assert.match(workspace, /activeSketch\?\.entityOrder/, 'inference reads committed entities from the active sketch');
assert.match(css, /\.drawing-svg\.has-line-cursor,[\s\S]*cursor:\s*none;/, 'system cursor hides only in active Drawing SVG scope');
assert.doesNotMatch(css, /body[^}]*cursor:\s*none/s, 'system cursor is not hidden globally');
assert.match(css, /\.drawing-label-overlay[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s, 'cursor uses the accepted screen-space overlay');

console.log('D2.2b CAD cursor and visual inference tests passed');
