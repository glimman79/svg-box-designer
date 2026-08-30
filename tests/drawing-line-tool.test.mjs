import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.test-build/drawing-line');
const types = await import(pathToFileURL(path.join(root, 'drawingTypes.js')));
const lineTool = await import(pathToFileURL(path.join(root, 'drawingLineTool.js')));
const transform = await import(pathToFileURL(path.join(root, 'drawingTransform.js')));

let document = types.createDrawingDocumentV1();
const sketch = document.sketches[document.activeSketchId];
assert.deepEqual(sketch.entities, {});
assert.deepEqual(sketch.entityOrder, []);

let nextId = 0;
const createId = () => `line-test-${++nextId}`;
let interaction = lineTool.EMPTY_LINE_INTERACTION;
let result = lineTool.applyLineClick(interaction, { x: 2.25, y: 3.75 }, createId);
interaction = result.interaction;
assert.equal(result.entity, null, 'first click only captures the start');
assert.deepEqual(interaction.start, { x: 2.25, y: 3.75 });
assert.equal(document.sketches[document.activeSketchId].entityOrder.length, 0, 'preview is not document geometry');

interaction = lineTool.updateLinePreview(interaction, { x: 7.125, y: 8.625 });
assert.deepEqual(interaction.rawPointerPoint, { x: 7.125, y: 8.625 }, 'preview retains exact raw coordinates');
assert.ok(Math.abs(interaction.effectivePreviewPoint.x - 7.125) < 1e-12 && Math.abs(interaction.effectivePreviewPoint.y - 8.625) < 1e-12, 'exact 45 degree preview remains geometrically unchanged');
result = lineTool.applyLineClick(interaction, { x: 7.125, y: 8.625 }, createId);
assert.equal(result.entity.id, 'line-test-1');
assert.equal(result.entity.type, 'line');
assert.deepEqual(result.entity.start, { x: 2.25, y: 3.75 });
assert.ok(Math.abs(result.entity.end.x - 7.125) < 1e-12 && Math.abs(result.entity.end.y - 8.625) < 1e-12);
assert.equal('svg' in result.entity, false, 'entity is geometry, not SVG markup');
document = lineTool.appendEntityToActiveSketch(document, result.entity);
interaction = result.interaction;
assert.deepEqual(interaction.start, result.entity.end, 'commit continues the chain at its effective end');
assert.deepEqual(interaction.effectivePreviewPoint, interaction.start, 'old preview clears at commit');

result = lineTool.applyLineClick(interaction, { x: 11.2, y: -4.4 }, createId);
document = lineTool.appendEntityToActiveSketch(document, result.entity);
interaction = result.interaction;
const active = document.sketches[document.activeSketchId];
assert.deepEqual(active.entityOrder, ['line-test-1', 'line-test-2'], 'entities retain deterministic commit order');
assert.deepEqual(active.entities['line-test-2'].start, active.entities['line-test-1'].end, 'chained BC starts at B');
assert.ok(Object.values(active.entities).every((entity) => typeof entity.start.x === 'number' && typeof entity.end.y === 'number'));

const committedDocument = document;
interaction = lineTool.cancelLineInteraction();
assert.deepEqual(interaction, lineTool.EMPTY_LINE_INTERACTION, 'Escape/tool switch cancellation clears transient state');
assert.equal(document, committedDocument, 'cancelling cannot alter committed geometry');

interaction = lineTool.applyLineClick(interaction, { x: 5, y: 5 }, createId).interaction;
result = lineTool.applyLineClick(interaction, { x: 5, y: 5 }, createId);
assert.equal(result.entity, null, 'same-point completion is rejected');
assert.deepEqual(result.interaction.start, { x: 5, y: 5 }, 'zero-length rejection safely retains the chain start');

const invalid = { ...document, activeSketchId: 'missing' };
assert.equal(lineTool.appendEntityToActiveSketch(invalid, active.entities['line-test-1']), invalid, 'invalid active sketch is defensive no-op');

const close = (actual, expected) => {
  assert.ok(actual);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-10 && Math.abs(actual.y - expected.y) < 1e-10,
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
// CTM includes a translated client offset, 4x zoom, and model-space pan translation.
const drawingToClient = { a: 4, b: 0, c: 0, d: 4, e: 140, f: -60 };
close(transform.clientToModelPoint({ x: 190.5, y: -28.5 }, drawingToClient), { x: 12.625, y: 7.875 });
close(transform.clientToModelPoint({ x: 140, y: -60 }, drawingToClient), { x: 0, y: 0 });
assert.equal(transform.clientToModelPoint({ x: 1, y: 2 }, { ...drawingToClient, a: 0 }), null, 'singular CTM is rejected');

console.log('D2.2 persistent CAD Line tool tests passed');
