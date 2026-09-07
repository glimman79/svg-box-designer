import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDrawingDocumentV2, migrateDrawingDocument } from '../.test-build/drawing-perpendicular/drawingTypes.js';
import { appendEntityToActiveSketch, applyResolvedLineClick, automaticAxisConstraintKind, cancelLineInteraction, EMPTY_LINE_INTERACTION, resolveLineEffectivePoint } from '../.test-build/drawing-perpendicular/drawingLineTool.js';
import { perpendicularAndGradient } from '../.test-build/drawing-perpendicular/drawingConstraintAnalysis.js';
import { solveDrawingComponentDrag, verifyDrawingConstraints } from '../.test-build/drawing-perpendicular/drawingConstraintSolver.js';
import { deriveGeometricConstraintMarkers, deriveRightAngleMarkers, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX, RIGHT_ANGLE_MARKER_SIZE_PX } from '../.test-build/drawing-perpendicular/drawingParallelMarker.js';
import { collectDrawingInferenceCandidates } from '../.test-build/drawing-perpendicular/drawingInference.js';
import { resolveDrawingSnap } from '../.test-build/drawing-perpendicular/drawingSnapEngine.js';

const transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = (id, start, end) => ({ id, type: 'line', start, end });
const add = (document, entity, perpendicular = null, axis = null) => appendEntityToActiveSketch(document, entity, (() => { let n = 0; return () => `${entity.id}-p${++n}`; })(), axis, perpendicular);

test('accepted perpendicular inference creates one canonical first-class constraint in the Line append transaction', () => {
  let document = add(createDrawingDocumentV2(), line('b', { x: 20, y: 20 }, { x: 60, y: 40 }));
  const existing = { ...document.sketches['sketch-1'].entities.b, start: { x: 20, y: 20 }, end: { x: 60, y: 40 } };
  const candidates = collectDrawingInferenceCandidates({ x: 39, y: 62 }, [existing], transform, undefined, { x: 50, y: 40 });
  const snap = resolveDrawingSnap({ rawPoint: { x: 39, y: 62 }, candidates, previousSnap: null, ctrlOverride: false });
  assert.equal(snap.type, 'perpendicular');
  document = add(document, line('a', { x: 50, y: 40 }, snap.effectivePoint), snap.entityId);
  const [constraint] = Object.values(document.sketches['sketch-1'].geometricConstraints);
  assert.equal(constraint.kind, 'PERPENDICULAR');
  assert.deepEqual(constraint.references.map(({ entityId }) => entityId), ['a', 'b']);
  assert.equal(document.sketches['sketch-1'].geometricConstraintOrder.length, 1);
  assert.ok(perpendicularAndGradient(existing.start, existing.end, { x: 50, y: 40 }, snap.effectivePoint).residual < 1e-12);
});

test('Ctrl bypass and numerical 90 degrees alone never create perpendicular intent', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  const existing = { ...document.sketches['sketch-1'].entities.a, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
  const candidates = collectDrawingInferenceCandidates({ x: 20, y: 10 }, [existing], transform, undefined, { x: 20, y: 0 });
  assert.equal(resolveDrawingSnap({ rawPoint: { x: 20, y: 10 }, candidates, previousSnap: null, ctrlOverride: true }).type, 'none');
  document = add(document, line('b', { x: 20, y: 0 }, { x: 20, y: 10 }));
  assert.equal(Object.keys(document.sketches['sketch-1'].geometricConstraints).length, 0);
});

test('solver preserves direction-only perpendicular relation while translation, separation, and lengths remain free', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  document = add(document, line('b', { x: 30, y: 20 }, { x: 30, y: 25 }), 'a');
  const sketch = document.sketches['sketch-1'];
  const beforeDistance = Math.hypot(sketch.points['b-p1'].x - sketch.points['a-p1'].x, sketch.points['b-p1'].y - sketch.points['a-p1'].y);
  const solved = solveDrawingComponentDrag(sketch, { 'b-p2': { x: 35, y: 32 } }, { directPointIds: ['b-p2'] });
  assert.ok(solved);
  assert.ok(verifyDrawingConstraints(solved, [], sketch.geometricConstraintOrder));
  assert.notEqual(Math.hypot(solved.points['b-p2'].x - solved.points['b-p1'].x, solved.points['b-p2'].y - solved.points['b-p1'].y), 5);
  assert.notEqual(Math.hypot(solved.points['b-p1'].x - solved.points['a-p1'].x, solved.points['b-p1'].y - solved.points['a-p1'].y), beforeDistance);
});

test('H/V intent is exclusive and has priority over a simultaneous perpendicular candidate in every axis direction', () => {
  for (const end of [{ x: 20, y: 0 }, { x: -20, y: 0 }, { x: 0, y: 20 }, { x: 0, y: -20 }]) {
    const interaction = { ...EMPTY_LINE_INTERACTION, start: { x: 0, y: 0 } };
    const resolution = resolveLineEffectivePoint(interaction, end, { active: true, type: 'perpendicular', entityId: 'existing', effectivePoint: end });
    const axis = automaticAxisConstraintKind(resolution.interaction);
    assert.ok(axis === 'HORIZONTAL' || axis === 'VERTICAL');
    assert.equal(resolution.interaction.perpendicularLineId, null);
    let document = add(createDrawingDocumentV2(), line('existing', { x: 0, y: 0 }, { x: 10, y: 10 }));
    document = add(document, line('new', { x: 0, y: 0 }, resolution.effectivePoint), 'existing', axis);
    assert.deepEqual(Object.values(document.sketches['sketch-1'].geometricConstraints).map(({ kind }) => kind), [axis]);
  }
});

test('a chained perpendicular to the previous axis Line maps to exact opposite-axis intent outside the angular window', () => {
  const cases = [
    { previousAxis: 'HORIZONTAL', raw: { x: 2, y: 30 }, perpendicularPoint: { x: 0, y: 30 }, expected: 'VERTICAL', coordinate: ['x', 0] },
    { previousAxis: 'VERTICAL', raw: { x: -30, y: 2 }, perpendicularPoint: { x: -30, y: 0 }, expected: 'HORIZONTAL', coordinate: ['y', 0] },
  ];
  for (const { previousAxis, raw, perpendicularPoint, expected, coordinate } of cases) {
    const interaction = { ...EMPTY_LINE_INTERACTION, start: { x: 0, y: 0 }, previousChainedLineId: 'previous' };
    assert.equal(resolveLineEffectivePoint(interaction, raw, { active: false, type: 'none', effectivePoint: raw }).interaction.snapActive, false,
      'raw pointer is deliberately outside the independent three-degree axis window');
    const accepted = resolveLineEffectivePoint(interaction, raw,
      { active: true, type: 'perpendicular', entityId: 'previous', effectivePoint: perpendicularPoint }, previousAxis);
    assert.equal(automaticAxisConstraintKind(accepted.interaction), expected);
    assert.equal(accepted.interaction.perpendicularLineId, null);
    assert.equal(accepted.effectivePoint[coordinate[0]], coordinate[1]);
    assert.equal(accepted.interaction.effectivePreviewPoint, accepted.effectivePoint, 'preview and accepted point share one authority');
  }
});

test('continuous axis chains advance stable Line identity, preserve topology, and create no perpendicular constraints', () => {
  for (const [firstAxis, firstEnd, directions] of [
    ['VERTICAL', { x: 0, y: 20 }, [{ x: 30, y: 2 }, { x: 28, y: 32 }, { x: -5, y: 30 }]],
    ['HORIZONTAL', { x: -20, y: 0 }, [{ x: -18, y: -30 }, { x: -48, y: -28 }, { x: -46, y: 2 }]],
  ]) {
    let document = createDrawingDocumentV2();
    let interaction = { ...EMPTY_LINE_INTERACTION, start: { x: 0, y: 0 }, startPointId: 'origin' };
    let accepted = resolveLineEffectivePoint(interaction, firstEnd, { active: false, type: 'none', effectivePoint: firstEnd });
    let click = applyResolvedLineClick(accepted.interaction, accepted.effectivePoint, () => 'line-1', 'joint-1');
    document = add(document, click.entity, null, firstAxis);
    interaction = click.interaction;
    let priorAxis = firstAxis;
    for (let index = 0; index < directions.length; index += 1) {
      const id = `line-${index + 2}`;
      const expectedAxis = priorAxis === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL';
      const raw = directions[index];
      const perpendicularPoint = expectedAxis === 'VERTICAL'
        ? { x: interaction.start.x, y: raw.y }
        : { x: raw.x, y: interaction.start.y };
      accepted = resolveLineEffectivePoint(interaction, raw,
        { active: true, type: 'perpendicular', entityId: interaction.previousChainedLineId, effectivePoint: perpendicularPoint }, priorAxis);
      click = applyResolvedLineClick(accepted.interaction, accepted.effectivePoint, () => id, `joint-${index + 2}`);
      document = add(document, click.entity, accepted.interaction.perpendicularLineId, automaticAxisConstraintKind(accepted.interaction));
      interaction = click.interaction;
      assert.equal(interaction.previousChainedLineId, id);
      priorAxis = expectedAxis;
    }
    const sketch = document.sketches['sketch-1'];
    assert.deepEqual(sketch.geometricConstraintOrder.map((id) => sketch.geometricConstraints[id].kind),
      firstAxis === 'VERTICAL' ? ['VERTICAL', 'HORIZONTAL', 'VERTICAL', 'HORIZONTAL'] : ['HORIZONTAL', 'VERTICAL', 'HORIZONTAL', 'VERTICAL']);
    assert.equal(Object.values(sketch.geometricConstraints).filter(({ kind }) => kind === 'PERPENDICULAR').length, 0);
    assert.equal(Object.values(sketch.geometricConstraints).filter(({ kind }) => kind === 'COINCIDENT').length, 0);
    for (let index = 1; index < sketch.entityOrder.length; index += 1) {
      assert.equal(sketch.entities[sketch.entityOrder[index - 1]].endPointId, sketch.entities[sketch.entityOrder[index]].startPointId);
    }
  }
});

test('chain mapping requires exact previous target identity and an axis constraint', () => {
  const interaction = { ...EMPTY_LINE_INTERACTION, start: { x: 0, y: 0 }, previousChainedLineId: 'previous' };
  const rotated = resolveLineEffectivePoint(interaction, { x: -13, y: 28 },
    { active: true, type: 'perpendicular', entityId: 'previous', effectivePoint: { x: -13, y: 28 } }, null);
  assert.equal(automaticAxisConstraintKind(rotated.interaction), null);
  assert.equal(rotated.interaction.perpendicularLineId, 'previous');
  const unrelated = resolveLineEffectivePoint(interaction, { x: -13, y: 28 },
    { active: true, type: 'perpendicular', entityId: 'unrelated', effectivePoint: { x: -13, y: 28 } }, 'HORIZONTAL');
  assert.equal(automaticAxisConstraintKind(unrelated.interaction), null);
  assert.equal(unrelated.interaction.perpendicularLineId, 'unrelated');
});

test('cancel and new-chain lifecycle clear previous identity while zero-length rejection preserves it', () => {
  const chained = { ...EMPTY_LINE_INTERACTION, start: { x: 1, y: 1 }, previousChainedLineId: 'line-1' };
  assert.equal(applyResolvedLineClick(chained, { x: 1, y: 1 }, () => 'must-not-run').interaction.previousChainedLineId, 'line-1');
  assert.equal(cancelLineInteraction().previousChainedLineId, null);
});

test('generic storage remains capable of explicit axis plus perpendicular constraints', () => {
  for (const axis of ['HORIZONTAL', 'VERTICAL']) {
    let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, axis === 'HORIZONTAL' ? { x: 10, y: 0 } : { x: 0, y: 10 }), null, axis);
    document = add(document, line('b', { x: 20, y: 20 }, axis === 'HORIZONTAL' ? { x: 20, y: 30 } : { x: 30, y: 20 }), 'a');
    assert.deepEqual(Object.values(document.sketches['sketch-1'].geometricConstraints).map(({ kind }) => kind), [axis, 'PERPENDICULAR']);
  }
});

test('horizontal/vertical corner creation is order-independent and never adds redundant perpendicular', () => {
  for (const [firstAxis, secondAxis, firstEnd, secondEnd] of [
    ['VERTICAL', 'HORIZONTAL', { x: 0, y: 20 }, { x: 20, y: 20 }],
    ['HORIZONTAL', 'VERTICAL', { x: -20, y: 0 }, { x: -20, y: -20 }],
  ]) {
    let document = add(createDrawingDocumentV2(), { ...line('first', { x: 0, y: 0 }, firstEnd), endPointId: 'joint' }, null, firstAxis);
    document = add(document, { ...line('second', firstEnd, secondEnd), startPointId: 'joint' }, 'first', secondAxis);
    assert.deepEqual(Object.values(document.sketches['sketch-1'].geometricConstraints).map(({ kind }) => kind), [firstAxis, secondAxis]);
  }
});

test('restarted Line inference keeps H/V intent, exact geometry, and shared endpoint topology ahead of lower-error perpendicular', () => {
  const cases = [
    { firstAxis: 'HORIZONTAL', firstStart: { x: 0, y: 0 }, joint: { x: 20, y: 0 }, rawEnd: { x: 20.1, y: 30 }, secondAxis: 'VERTICAL', exactCoordinate: ['x', 20] },
    { firstAxis: 'HORIZONTAL', firstStart: { x: 20, y: 0 }, joint: { x: 0, y: 0 }, rawEnd: { x: -0.1, y: -30 }, secondAxis: 'VERTICAL', exactCoordinate: ['x', 0] },
    { firstAxis: 'VERTICAL', firstStart: { x: 0, y: 0 }, joint: { x: 0, y: 20 }, rawEnd: { x: 30, y: 20.1 }, secondAxis: 'HORIZONTAL', exactCoordinate: ['y', 20] },
    { firstAxis: 'VERTICAL', firstStart: { x: 0, y: 20 }, joint: { x: 0, y: 0 }, rawEnd: { x: -30, y: -0.1 }, secondAxis: 'HORIZONTAL', exactCoordinate: ['y', 0] },
  ];

  for (const { firstAxis, firstStart, joint, rawEnd, secondAxis, exactCoordinate } of cases) {
    let document = add(createDrawingDocumentV2(), { ...line('first', firstStart, joint), endPointId: 'joint' }, null, firstAxis);
    const existing = { id: 'first', type: 'line', start: firstStart, end: joint };
    const candidates = collectDrawingInferenceCandidates(rawEnd, [existing], transform, undefined, joint);
    const perpendicular = candidates.perpendiculars[0];
    const angularPoint = resolveLineEffectivePoint(
      { ...EMPTY_LINE_INTERACTION, start: joint, startPointId: 'joint' },
      rawEnd,
      { active: false, type: 'none', effectivePoint: rawEnd },
    ).effectivePoint;
    const angularError = Math.hypot(rawEnd.x - angularPoint.x, rawEnd.y - angularPoint.y);
    assert.ok(perpendicular.screenDistance < angularError, 'perpendicular candidate has the smaller numerical pixel error');

    const snap = resolveDrawingSnap({ rawPoint: rawEnd, candidates, previousSnap: null, ctrlOverride: false });
    assert.equal(snap.type, 'perpendicular', 'spatial inference exposes the competing perpendicular candidate');
    const accepted = resolveLineEffectivePoint({ ...EMPTY_LINE_INTERACTION, start: joint, startPointId: 'joint' }, rawEnd, snap);
    assert.equal(automaticAxisConstraintKind(accepted.interaction), secondAxis);
    assert.equal(accepted.interaction.perpendicularLineId, null);
    assert.equal(accepted.effectivePoint[exactCoordinate[0]], exactCoordinate[1], `${secondAxis} effective point is exact`);

    document = add(document, { ...line('second', joint, accepted.effectivePoint), startPointId: 'joint' }, accepted.interaction.perpendicularLineId, secondAxis);
    const sketch = document.sketches['sketch-1'];
    assert.deepEqual(Object.values(sketch.geometricConstraints).map(({ kind }) => kind), [firstAxis, secondAxis]);
    assert.equal(sketch.entities.first.endPointId, sketch.entities.second.startPointId, 'tool restart reuses the shared SketchPoint');
    assert.equal(Object.values(sketch.geometricConstraints).filter(({ kind }) => kind === 'COINCIDENT').length, 0, 'shared topology needs no duplicate Coincident');
    assert.equal(deriveRightAngleMarkers(sketch).length, 0, 'axis corner has no Perpendicular marker');
  }
});

test('delayed workspace commit captures click-time inference instead of later hover state', () => {
  const workspace = readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /commitLinePoint\(effectivePoint, endpointPointId, placement\.interaction\)/);
  assert.match(workspace, /automaticAxisConstraintKind\(acceptedInteraction\)/);
  assert.doesNotMatch(workspace, /automaticAxisConstraintKind\(lineInteractionRef\.current\)/);
  assert.match(workspace, /setDrawingSnap\(null\);\s*drawingSnapRef\.current = null;\s*transactDocument/, 'successful segment boundary clears state and ref hysteresis before append');
});

test('one semantic relationship derives one screen-stable geometric right-angle marker and no glyph markers', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 20, y: 0 }), null, 'HORIZONTAL');
  document = add(document, { ...line('b', { x: 0, y: 0 }, { x: 0, y: 20 }), startPointId: 'a-p1' }, 'a');
  const markers = deriveGeometricConstraintMarkers(document.sketches['sketch-1']);
  assert.deepEqual(markers.map(({ label }) => label), ['H']);
  const [corner] = deriveRightAngleMarkers(document.sketches['sketch-1'], 2);
  assert.equal(deriveRightAngleMarkers(document.sketches['sketch-1'], 2).length, 1);
  assert.deepEqual(corner.corner, document.sketches['sketch-1'].points['a-p1']);
  assert.equal(Math.hypot(corner.p1.x - corner.corner.x, corner.p1.y - corner.corner.y) * 2, RIGHT_ANGLE_MARKER_SIZE_PX);
  assert.equal(Math.hypot(corner.p3.x - corner.corner.x, corner.p3.y - corner.corner.y) * 2, RIGHT_ANGLE_MARKER_SIZE_PX);
  assert.deepEqual([GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX, GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX, GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX], [12, 12, 22]);
});

test('right-angle marker follows shared endpoint for reversed arbitrary rotated lines and supports intersection fallback', () => {
  const root = Math.SQRT1_2;
  let document = add(createDrawingDocumentV2(), { ...line('z', { x: 10 - 20 * root, y: 10 - 20 * root }, { x: 10, y: 10 }), endPointId: 'joint' });
  document = add(document, { ...line('a', { x: 10 - 20 * root, y: 10 + 20 * root }, { x: 10, y: 10 }), endPointId: 'joint' }, 'z');
  const [marker] = deriveRightAngleMarkers(document.sketches['sketch-1']);
  assert.equal(marker.corner.id, 'joint');
  const u = { x: marker.p1.x - marker.corner.x, y: marker.p1.y - marker.corner.y };
  const v = { x: marker.p3.x - marker.corner.x, y: marker.p3.y - marker.corner.y };
  assert.ok(Math.abs(u.x * v.x + u.y * v.y) < 1e-10);

  let separate = add(createDrawingDocumentV2(), line('x', { x: 0, y: 0 }, { x: 10, y: 0 }));
  separate = add(separate, line('y', { x: 5, y: 5 }, { x: 5, y: 15 }), 'x');
  assert.deepEqual(deriveRightAngleMarkers(separate.sketches['sketch-1'])[0].corner, { x: 5, y: 0 });
});

test('workspace renders geometric paths with blue styling and contains no perpendicular text glyph', () => {
  const workspace = readFileSync(new URL('../src/app/DrawingWorkspace.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /⟂/);
  assert.match(workspace, /drawing-right-angle-marker-hit/);
  assert.match(workspace, /drawing-right-angle-marker-shape/);
  assert.match(css, /\.drawing-right-angle-marker-shape \{[^}]*stroke: var\(--drawing-geometric-constraint\)/);
  assert.match(css, /\.drawing-right-angle-marker-hit \{[^}]*stroke: transparent;[^}]*pointer-events: stroke;/);
});

test('restore rejects self/duplicates and canonicalizes reversed line pairs', () => {
  let document = add(createDrawingDocumentV2(), line('a', { x: 0, y: 0 }, { x: 10, y: 0 }));
  document = add(document, line('b', { x: 0, y: 5 }, { x: 0, y: 10 }));
  const sketch = document.sketches['sketch-1'];
  const refs = (a, b) => [{ kind: 'entity', entityId: a }, { kind: 'entity', entityId: b }];
  const restored = migrateDrawingDocument({ ...document, sketches: { 'sketch-1': { ...sketch,
    geometricConstraints: { reversed: { id: 'reversed', kind: 'PERPENDICULAR', references: refs('b', 'a') }, duplicate: { id: 'duplicate', kind: 'PERPENDICULAR', references: refs('a', 'b') }, self: { id: 'self', kind: 'PERPENDICULAR', references: refs('a', 'a') } },
    geometricConstraintOrder: ['reversed', 'duplicate', 'self'] } } });
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraintOrder, ['reversed']);
  assert.deepEqual(restored.sketches['sketch-1'].geometricConstraints.reversed.references.map(({ entityId }) => entityId), ['a', 'b']);
});
