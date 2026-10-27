import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrawingDocumentV2 } from '../.test-build/drawing-pointer-arbitration/drawingTypes.js';
import { resolveDrawingCurveProximity, resolveDrawingPointerOwner } from '../.test-build/drawing-pointer-arbitration/drawingPointerArbitration.js';

const make = () => {
  const document = createDrawingDocumentV2(), sketch = document.sketches[document.activeSketchId];
  Object.assign(sketch.points, {
    a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 10, y: 0 },
    center: { id: 'center', x: 30, y: 0 }, o: { id: 'o', x: 55, y: 3.75 }, s: { id: 's', x: 50, y: 0 }, e: { id: 'e', x: 60, y: 0 },
  });
  Object.assign(sketch.entities, {
    line: { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b' },
    circle: { id: 'circle', type: 'circle', centerPointId: 'center', radius: 10 },
    arc: { id: 'arc', type: 'arc', centerPointId: 'o', radius: 6.25, startPointId: 's', endPointId: 'e', orientation: 'CCW' },
  });
  sketch.entityOrder = ['line', 'circle', 'arc'];
  return document;
};
const point = (pointId, reference = { kind: 'sketchPoint', pointId }) => ({ kind: 'point', reference, pointId, lineId: '', point: 'start', clientPoint: { x: 0, y: 0 }, distancePx: 0 });
const curve = entityId => ({ kind: 'curve', entityId, distancePx: 6 });
const line = { kind: 'line', lineId: 'line', distancePx: 0 };
const overlay = { dimensionId: 'dimension', dimensionSurface: 'line' };

for (const [name, candidate, pointer, expectedKind] of [
  ['Circle center beneath diameter', point('center'), { x: 30, y: 0 }, 'point'],
  ['Line endpoint beneath dimension', point('a'), { x: 0, y: 0 }, 'point'],
  ['Circle body beneath diameter', curve('circle'), { x: 40, y: 0 }, 'entity-scalar'],
  ['Circle proximity candidate', curve('circle'), { x: 42, y: 0 }, 'entity-scalar'],
  ['Arc P1 beneath dimension', point('s'), { x: 50, y: 0 }, 'arc-endpoint'],
  ['Arc P2 beneath dimension', point('e'), { x: 60, y: 0 }, 'arc-endpoint'],
  ['Line body beneath dimension', line, { x: 5, y: 0 }, 'line'],
]) test(name, () => {
  const owner = resolveDrawingPointerOwner(make(), pointer, candidate, overlay);
  assert.equal(owner.kind, 'geometry'); assert.equal(owner.target.kind, expectedKind);
});

test('persistent Arc center selects the point and owns rigid translation', () => {
  const document = make(), before = Object.keys(document.sketches[document.activeSketchId].points);
  const candidate = point('o');
  const owner = resolveDrawingPointerOwner(document, { x: 55, y: 3.75 }, candidate, overlay);
  assert.equal(owner.kind, 'geometry'); assert.deepEqual(owner.target, { kind: 'arc-center', entityId: 'arc' });
  assert.deepEqual(owner.selection, { kind: 'point', pointId: 'o' });
  assert.deepEqual(Object.keys(document.sketches[document.activeSketchId].points), before);
});

test('Arc body owns radius manipulation beneath annotation corridors', () => {
  for (const evidence of [{}, overlay, {explicitArcId:'arc'}]) {
    const owner=resolveDrawingPointerOwner(make(),{x:55,y:-2.5},curve('arc'),evidence);
    assert.equal(owner.kind,'geometry');assert.deepEqual(owner.selection,{kind:'arc',arcId:'arc'});assert.equal(owner.target.kind,'arc-radius');
  }
  const owner=resolveDrawingPointerOwner(make(),{x:55,y:-2.5},curve('arc'),{dimensionId:'dimension',dimensionSurface:'value'});
  assert.equal(owner.kind,'dimension','explicit value UI retains priority');
  const source=fs.readFileSync(new URL('../src/app/DrawingWorkspace.tsx',import.meta.url),'utf8');
  assert.match(source,/if \(route\.beginDrag && owner\.target\)/,'selection-only hits cannot start manipulation');
});

test('persistent semantic point identity survives an empty line id', () => {
  const owner = resolveDrawingPointerOwner(make(), { x: 30, y: 0 }, point('center'), overlay);
  assert.equal(owner.kind, 'geometry'); assert.deepEqual(owner.target, { kind: 'point', pointId: 'center' });
});

test('dimension line owns empty space and value remains an explicit UI surface', () => {
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 100, y: 100 }, null, overlay), { kind: 'dimension', dimensionId: 'dimension', surface: 'line' });
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 40, y: 0 }, curve('circle'), { ...overlay, dimensionSurface: 'value' }), { kind: 'dimension', dimensionId: 'dimension', surface: 'value' });
});

test('empty canvas remains available after all semantic tiers', () => {
  assert.deepEqual(resolveDrawingPointerOwner(make(), { x: 100, y: 100 }, null, {}), { kind: 'empty' });
});

test('Circle and Arc proximity keep the established screen-space corridor', () => {
  for (const entityId of ['circle', 'arc']) {
    for (const distancePx of [0, 3, 6, 8]) assert.deepEqual(resolveDrawingCurveProximity([{ entityId, distancePx }]), { kind: 'curve', entityId, distancePx });
    assert.equal(resolveDrawingCurveProximity([{ entityId, distancePx: 8.01 }]), null);
  }
});

test('production root owns dimension pointerdown and retains selection after no-op drag', () => {
  const source = fs.readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /className="drawing-dimension-(?:hit|value-hit)[^>]*onPointerDown=/);
  assert.match(source, /resolveDrawingPointerOwner[\s\S]*owner\.kind === 'dimension'[\s\S]*beginDimensionAnnotationDrag/);
  assert.doesNotMatch(source, /if \(session\.exceeded\) setSelectedGeometry\(\[\]\)/);
});

test('Arc click and Ctrl-click use the production selection policy while empty canvas and box selection remain independent', async () => {
  const {routeDrawingGeometryPointerSelection}=await import('../.test-build/drawing-pointer-arbitration/drawingGeometrySelection.js');
  const {selectDrawingEntitiesInRect,applyDrawingBoxSelection}=await import('../.test-build/drawing-pointer-arbitration/drawingBoxSelection.js');
  const {resolveArc}=await import('../.test-build/drawing-pointer-arbitration/drawingTopology.js');
  const document=make(),sketch=document.sketches[document.activeSketchId],owner=resolveDrawingPointerOwner(document,{x:55,y:-2.5},curve('arc'),{});
  assert.equal(owner.kind,'geometry');assert.equal(owner.target.kind,'arc-radius');
  const selected=routeDrawingGeometryPointerSelection([],owner.selection,false,false);
  assert.deepEqual(selected.selection,[{kind:'arc',arcId:'arc'}]);
  assert.equal(selected.beginDrag && owner.target!==null,true);
  const removed=routeDrawingGeometryPointerSelection(selected.selection,owner.selection,true,false);assert.deepEqual(removed.selection,[]);assert.equal(removed.beginDrag,false);
  assert.deepEqual(routeDrawingGeometryPointerSelection([],owner.selection,true,false).selection,selected.selection);
  assert.equal(resolveDrawingPointerOwner(document,{x:100,y:100},null,{}).kind,'empty');
  const resolved=resolveArc(sketch,sketch.entities.arc),rect={minX:40,maxX:70,minY:-10,maxY:15};
  for(const mode of ['window','crossing']){
    const qualifying=selectDrawingEntitiesInRect([resolved],rect,mode);assert.deepEqual(qualifying,selected.selection);
    assert.deepEqual(applyDrawingBoxSelection([],qualifying,false),selected.selection);
    assert.deepEqual(applyDrawingBoxSelection(selected.selection,qualifying,true),[]);
  }
});


test('selected Line and ambiguous Arc points keep ordinary SketchPoint manipulation',()=>{
 const d=make(),s=d.sketches[d.activeSketchId];
 s.entities.attached={id:'attached',type:'line',startPointId:'s',endPointId:'a'};s.entityOrder.push('attached');
 let owner=resolveDrawingPointerOwner(d,{x:50,y:0},point('s'),overlay,['attached']);
 assert.deepEqual(owner.target,{kind:'point',pointId:'s'});
 s.entities.other={...s.entities.arc,id:'other'};s.entityOrder.push('other');
 owner=resolveDrawingPointerOwner(d,{x:50,y:0},point('s'),overlay);
 assert.deepEqual(owner.target,{kind:'point',pointId:'s'});
 owner=resolveDrawingPointerOwner(d,{x:50,y:0},point('s'),overlay,['arc']);
 assert.equal(owner.target.kind,'arc-endpoint');assert.equal(owner.target.entityId,'arc');
 owner=resolveDrawingPointerOwner(d,{x:55,y:3.75},point('o'),overlay);
 assert.deepEqual(owner.target,{kind:'point',pointId:'o'});
 owner=resolveDrawingPointerOwner(d,{x:55,y:3.75},point('o'),overlay,['arc']);
 assert.deepEqual(owner.target,{kind:'arc-center',entityId:'arc'});
});

for (const [entityId, bodyEvidence, pointer, targetKind] of [
  ['circle', { explicitCircleId: 'circle' }, { x: 40, y: 0 }, 'entity-scalar'],
  ['arc', { explicitArcId: 'arc' }, { x: 55, y: -2.5 }, 'arc-radius'],
]) {
  test(`${entityId} body resolves from DOM or proximity evidence without a point hit`, () => {
    for (const [semantic, evidence] of [[null, bodyEvidence], [curve(entityId), {}], [curve(entityId), overlay]]) {
      const owner = resolveDrawingPointerOwner(make(), pointer, semantic, evidence);
      assert.equal(owner.kind, 'geometry');
      assert.deepEqual(owner.selection, entityId === 'circle' ? { kind: 'circle', circleId: entityId } : { kind: 'arc', arcId: entityId });
      assert.equal(owner.target.kind, targetKind);
      assert.equal(owner.target.entityId, entityId);
    }
  });

  test(`${entityId} body evidence yields to explicit and semantic persistent points`, () => {
    const document = make();
    const pointIds = entityId === 'circle' ? ['center', 'a'] : ['o', 's', 'e', 'a'];
    for (const pointId of pointIds) {
      const expectedKind = pointId === 'o' ? 'arc-center' : ['s', 'e'].includes(pointId) ? 'arc-endpoint' : 'point';
      for (const [semantic, evidence] of [
        [curve(entityId), { ...bodyEvidence, explicitPointId: pointId }],
        [point(pointId), bodyEvidence],
        [point(pointId), overlay],
      ]) {
        const owner = resolveDrawingPointerOwner(document, document.sketches[document.activeSketchId].points[pointId], semantic, evidence);
        assert.equal(owner.kind, 'geometry');
        assert.deepEqual(owner.selection, { kind: 'point', pointId });
        assert.equal(owner.target.kind, expectedKind);
      }
    }
    assert.deepEqual(resolveDrawingPointerOwner(document, pointer, point(pointIds[0]), {
      ...bodyEvidence, ...overlay, explicitPointId: pointIds[0], dimensionSurface: 'value',
    }), { kind: 'dimension', dimensionId: 'dimension', surface: 'value' });
  });
}

test('explicit point identity disambiguates an Arc center overlapping a distinct Line endpoint', () => {
  const document = make(), sketch = document.sketches[document.activeSketchId];
  sketch.points.a = { ...sketch.points.o, id: 'a' };
  for (const [explicitPointId, semanticId, expected] of [
    ['o', 'a', { kind: 'arc-center', entityId: 'arc' }],
    ['a', 'o', { kind: 'point', pointId: 'a' }],
  ]) {
    const owner = resolveDrawingPointerOwner(document, sketch.points.o, point(semanticId), {
      explicitPointId, explicitArcId: 'arc', explicitLineId: 'line', ...overlay,
    }, ['arc']);
    assert.deepEqual(owner.selection, { kind: 'point', pointId: explicitPointId });
    assert.deepEqual(owner.target, expected);
  }
});

test('shared persistent Arc center retains selected-owner and ambiguous-owner policy', () => {
  const document = make(), sketch = document.sketches[document.activeSketchId];
  sketch.entities.line.startPointId = 'o';
  sketch.entities.circle.centerPointId = 'o';
  const resolve = selected => resolveDrawingPointerOwner(document, sketch.points.o, curve('circle'), {
    explicitPointId: 'o', explicitLineId: 'line', explicitCircleId: 'circle',
  }, selected);
  for (const selected of [[], ['arc']]) assert.deepEqual(resolve(selected).target, { kind: 'arc-center', entityId: 'arc' });
  for (const selected of [['line'], ['circle']]) assert.deepEqual(resolve(selected).target, { kind: 'point', pointId: 'o' });
  sketch.entities.other = { ...sketch.entities.arc, id: 'other' };
  sketch.entityOrder.push('other');
  for (const selected of [[], ['arc', 'other']]) assert.deepEqual(resolve(selected).target, { kind: 'point', pointId: 'o' });
  for (const entityId of ['arc', 'other']) {
    assert.deepEqual(resolve([entityId]).target, { kind: 'arc-center', entityId });
    assert.deepEqual(resolve([entityId]).selection, { kind: 'point', pointId: 'o' });
  }
});

test('shared Arc/Line endpoint keeps the selected grip when bodies also qualify', () => {
  const document = make(), sketch = document.sketches[document.activeSketchId];
  sketch.entities.line.startPointId = 's';
  for (const [selected, expected] of [
    [[], { kind: 'arc-endpoint', entityId: 'arc', draggedPointId: 's', pivotPointId: 'e' }],
    [['arc'], { kind: 'arc-endpoint', entityId: 'arc', draggedPointId: 's', pivotPointId: 'e' }],
    [['line'], { kind: 'point', pointId: 's' }],
  ]) {
    const owner = resolveDrawingPointerOwner(document, sketch.points.s, curve('arc'), {
      explicitPointId: 's', explicitLineId: 'line', explicitArcId: 'arc',
    }, selected);
    assert.deepEqual(owner.selection, { kind: 'point', pointId: 's' });
    assert.deepEqual(owner.target, expected);
  }
});

test('multiple body candidates retain explicit geometry precedence and stable proximity ties', () => {
  const document = make();
  const owner = evidence => resolveDrawingPointerOwner(document, { x: 40, y: 0 }, curve('arc'), evidence);
  assert.deepEqual(owner({ explicitCircleId: 'circle', explicitArcId: 'arc' }).selection, { kind: 'circle', circleId: 'circle' });
  assert.deepEqual(owner({ explicitLineId: 'line', explicitCircleId: 'circle', explicitArcId: 'arc' }).selection, { kind: 'line', lineId: 'line' });
  for (const candidates of [
    [{ entityId: 'circle', distancePx: 4 }, { entityId: 'arc', distancePx: 4 }],
    [{ entityId: 'arc', distancePx: 4 }, { entityId: 'circle', distancePx: 4 }],
  ]) assert.deepEqual(resolveDrawingCurveProximity(candidates), { kind: 'curve', entityId: 'arc', distancePx: 4 });
});
