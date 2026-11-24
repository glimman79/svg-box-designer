const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SharedHistoryRegion } = require('../.test-build/shared-history/SharedHistoryRegion.js');
const { createEmptySketch } = require('../.test-build/shared-history/drawingTypes.js');
const { initializeSketchOperations, readSketchDefinitions } = require('../.test-build/shared-history/constructionOperations.js');
const { neutralSketchColor } = require('../.test-build/shared-history/sketchPresentation.js');

function fixture(count) {
  const sketchOrder = Array.from({ length: count }, (_, i) => 'sketch-' + (i + 1));
  const drawingDocument = { schemaVersion: 2, unit: 'mm', sketchOrder, activeSketchId: sketchOrder[0] ?? null,
    sketches: Object.fromEntries(sketchOrder.map((id, i) => [id, createEmptySketch(id, 'Sketch ' + (i + 1))])) };
  return readSketchDefinitions({ drawingDocument, constructionOperations: initializeSketchOperations(drawingDocument) });
}

const sketchEntries = definitions => definitions.map(({operation:{id}}) => ({kind:'sketch',id,sourceId:id}));
const render = (workspace, definitions, editingSketchId = null, chronology = sketchEntries(definitions)) =>
  renderToStaticMarkup(React.createElement(SharedHistoryRegion, {workspace, definitions, chronology, editingSketchId}));

test('one row uses project order across modules and sources', () => {
  const defs = fixture(2), [first, second] = sketchEntries(defs);
  const order = [first, {kind:'PM',id:'approval',sourceId:first.id}, second,
    {kind:'TB',id:'connection',sourceId:first.id,connectionId:'TB1'}];
  for (const workspace of ['construction','drawing']) {
    const html = render(workspace, defs, null, order);
    assert.equal((html.match(/<aside/g) || []).length, 1);
    assert.deepEqual([...html.matchAll(/data-operation-id="([^"]+)"/g)].map(m=>m[1]),order.map(e=>e.id));
    assert.match(html,/TB1 \(Sketch 1\)/);
  }
});

test('empty History is keyboard reachable', () => {
  const html = render('drawing', []);
  assert.match(html, /No operations yet/);
  assert.match(html, /tabindex="0"/);
});

test('ordered permanent entries are keyed by each lifetime, including beyond the Undo limit', t => {
  for (const count of [0, 1, 3, 30, 120]) {
    const definitions = fixture(count);
    const start = performance.now();
    const html = render('drawing', definitions, definitions[1]?.sketch.id);
    const elapsed = performance.now() - start;
    assert.deepEqual([...html.matchAll(/data-operation-id="([^"]+)"/g)].map(m => m[1]), definitions.map(d => d.operation.id));
    if (count >= 3) {
      assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
      assert.equal((html.match(/<button[^>]+disabled=""/g) ?? []).length, count);
      assert.equal(new Set(definitions.slice(0, 3).map(d => neutralSketchColor(d.operation))).size, 3);
    }
    if (count === 120) t.diagnostic('Render 120 permanent entries to HTML: ' + elapsed.toFixed(2) + ' ms');
  }
});

test('neutral hits resolve finite members, scale the tolerance and return each operation once', () => {
  const { findSketchOwners } = require('../.test-build/shared-history/sketchPresentation.js');
  const defs = fixture(3);
  const [line, circle, arc] = defs.map(d => d.sketch);
  const points = { c: { id: 'c', x: 0, y: 0 }, a: { id: 'a', x: 40, y: 0 }, b: { id: 'b', x: 0, y: 40 } };
  for (const sketch of [line, circle, arc]) sketch.points = points;
  function add(sketch, entity) {
    sketch.entityOrder.push(entity.id);
    sketch.entities[entity.id] = entity;
  }
  for (const id of ['line', 'coincident-line']) add(line, { id, type: 'line', startPointId: 'c', endPointId: 'a' });
  add(circle, { id: 'circle', type: 'circle', centerPointId: 'c', radius: 40 });
  add(arc, { id: 'arc', type: 'arc', centerPointId: 'c', startPointId: 'a', endPointId: 'b', radius: 40, orientation: 'CCW' });
  const owners = (x, y, scale = 1) => findSketchOwners(defs, { x, y }, scale).map(d => d.operation.id);
  const [l, c, a] = defs.map(d => d.operation.id);
  assert.deepEqual(owners(40, 0), [l, c, a]);
  assert.deepEqual(owners(-40, 0), [c]);
  assert.deepEqual(owners(70, 0), []);
  assert.deepEqual(owners(20, 6), [l]);
  assert.deepEqual(owners(20, 6, 2), []);
  assert.deepEqual(owners(0, 0), [l]);
});
