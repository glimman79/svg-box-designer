const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const build = path.join(__dirname, '../.test-build/project-state');
const boundaryPath = path.join(build, 'src/app/projectState.js');
const {
  captureDrawingState, projectDrawingState, captureBoxState, projectBoxState,
  captureProjectState, projectProjectState,
} = require(boundaryPath);
const { makeEmptyProjectState, makePopulatedProjectState } = require(path.join(build, 'tests/fixtures/project-state.js'));
const { buildFinalGeometry } = require(path.join(build, 'src/app/finalGeometry.js'));
const { processManufacturingGeometry } = require(path.join(build, 'src/app/manufacturingCompensation.js'));

// Exercise every nested container/primitive, rather than a single happy-path field.
function mutateData(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child && typeof child === 'object') mutateData(child, seen);
    else value[key] = typeof child === 'number' ? child + 123.456 : `${child}:changed`;
  }
  if (Array.isArray(value)) value.push('subsequent edit');
}

function assertFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value));
  Object.values(value).forEach((child) => assertFrozen(child, seen));
}

test('empty/default project and module captures project back without adding defaults', () => {
  const source = makeEmptyProjectState();
  const captured = captureProjectState(source);
  assert.deepEqual(projectProjectState(captured), source);
  assert.deepEqual(projectDrawingState(captureDrawingState(source.drawingDocument)), source.drawingDocument);
  assert.deepEqual(projectBoxState(captureBoxState(source.box)), source.box);
  assert.equal(captured.box.data.lastAppliedManufacturingSettings, null);
  assert.deepEqual(captured.box.data.generatedGeometrySnapshot.generatedGeometry, []);
  assert.equal(Object.isFrozen(source.drawingDocument), false);
  assert.equal(Object.isFrozen(source.box.panelManager), false);
});

test('Drawing preserves separate Sketches, all order arrays, shared references and stored coordinates', () => {
  const document = makePopulatedProjectState().drawingDocument;
  const captured = captureDrawingState(document);
  assert.deepEqual(captured, document);
  assert.deepEqual(captured.sketchOrder, ['beta', 'alpha']);
  assert.equal(captured.activeSketchId, 'alpha');
  for (const id of captured.sketchOrder) {
    const sketch = captured.sketches[id];
    assert.equal(sketch.id, id);
    assert.deepEqual(sketch.entityOrder, ['arc', 'line', 'circle']);
    assert.deepEqual(sketch.dimensionOrder, ['radius', 'length', 'diameter']);
    assert.deepEqual(sketch.geometricConstraintOrder, ['curve', 'axis']);
    assert.equal(sketch.entities.line.startPointId, sketch.entities.circle.centerPointId);
    assert.equal(sketch.entities.arc.startPointId, sketch.entities.line.endPointId);
    assert.notEqual(sketch.points.independent.id, sketch.points.center.id);
    assert.equal(sketch.dimensions.length.placement.offset, -3.125);
    assert.deepEqual(sketch.geometricConstraints.curve.references,
      [{ kind: 'sketchPoint', pointId: 'p1' }, { kind: 'entity', entityId: 'circle' }]);
  }
  assert.notEqual(captured.sketches.alpha, captured.sketches.beta);
  assert.equal(captured.schemaVersion, 2);
  assert.equal(captured.unit, 'mm');
});

test('canonical Circle/Arc records and both orientations survive without angle/bulge conversion', () => {
  for (const orientation of ['CW', 'CCW']) {
    const document = makePopulatedProjectState().drawingDocument;
    document.sketches.alpha.entities.arc = { ...document.sketches.alpha.entities.arc, orientation };
    const restored = projectDrawingState(captureDrawingState(document));
    assert.deepEqual(restored, document);
    const sketch = restored.sketches.alpha;
    assert.deepEqual(sketch.entities.circle, { id: 'circle', type: 'circle', centerPointId: 'center', radius: 10 });
    assert.deepEqual(sketch.entities.arc, { id: 'arc', type: 'arc', centerPointId: 'center', radius: 10,
      startPointId: 'p1', endPointId: 'p2', orientation });
    assert.equal(sketch.dimensions.radius.role, 'reference');
    assert.equal(sketch.dimensions.diameter.role, 'driving');
  }
});

test('BOX includes original SVG markup, root attributes, parsed panels/edges and import diagnostics', () => {
  const source = makePopulatedProjectState().box;
  const model = captureBoxState(source).data.svgModel;
  assert.deepEqual(model, source.svgModel);
  assert.notEqual(model, source.svgModel);
  assert.equal(model.edges[0].id, 'panel-a-edge-0');
  assert.equal(model.edges[0].source, 'panel-a');
  assert.equal(model.panels[0].outerEdgeIds[0], model.edges[0].id);
  // structuredClone retains aliases within the source graph, without live aliasing.
  assert.equal(model.panels[0].outerContour, model.panels[0].contour);
  assert.equal(model.panels[0].outerEdgeIds, model.panels[0].edgeIds);
  assert.equal(model.importDiagnostics.topologyPanelsCreated, 4);
});

test('BOX inventory includes editable TB/W/S, Panel Manager, manufacturing and distinct editing context', () => {
  const source = makePopulatedProjectState().box;
  const captured = captureBoxState(source);
  assert.deepEqual(Object.keys({ ...captured.data, ...captured.context }).sort(), Object.keys(source).sort());
  assert.deepEqual(projectBoxState(captured), source);
  assert.equal(captured.data.connections.W1.prefix, 'W');
  assert.equal(captured.data.panelManager.panels['panel-b'].thicknessMm, source.panelManager.panels['panel-b'].thicknessMm);
  assert.equal(captured.data.panelManager.isApplied, true);
  assert.equal(captured.data.panelManager.isDirty, true);
  assert.equal(captured.context.assignmentTargetConnectionId, 'S1');
  assert.equal(captured.context.displayConnectionId, 'W1');
  assert.equal(captured.context.selectedEdgeId, 'panel-a-edge-1');
  assert.deepEqual(captured.data.workflowGroupOrder, source.workflowGroupOrder);
  assert.deepEqual(captured.data.completedTBGroups, source.completedTBGroups);
  assert.deepEqual(captured.data.completedWallGroups, source.completedWallGroups);
  assert.deepEqual(captured.data.activeSGroup, source.activeSGroup);
  assert.deepEqual(captured.data.activeTBGroup, source.activeTBGroup);
  assert.deepEqual(captured.data.activeWallGroup, source.activeWallGroup);
  assert.deepEqual(captured.data.projectSettings.selectedProfileOffsetIds, source.projectSettings.selectedProfileOffsetIds);
});

test('draft definitions/settings and accepted output remain distinct, without implicit Apply', () => {
  const source = makePopulatedProjectState();
  const result = projectProjectState(captureProjectState(source));
  assert.notDeepEqual(result.box.projectSettings, result.box.lastAppliedManufacturingSettings);
  const snapshot = result.box.generatedGeometrySnapshot;
  assert.equal(snapshot.operations[0].resolvedParameters.fingerWidthMm, 11.3);
  assert.equal(result.box.connections.TB1.properties.fingerWidthMm, 12.75);
  assert.equal(snapshot.metadata.revision, 7);
  assert.equal(snapshot.metadata.importedGeometryRevision, 2);
  assert.equal(snapshot.metadata.assignmentRevision, 4);
  assert.equal(snapshot.metadata.operationRevision, 6);
  assert.equal(snapshot.metadata.panelCompositionModel, 'relationship-composed-mixed-v1');
  assert.deepEqual(snapshot, source.box.generatedGeometrySnapshot);
  assert.ok(snapshot.generatedGeometry.some((item) => item.sourceRelationships?.length));
  for (const type of ['TB', 'W', 'S']) {
    assert.ok(snapshot.generatedGeometry.some((item) => item.generatedProfiles?.some((profile) => profile.generatorType === type)));
  }
});

test('pending Panel Manager, nested source holes and simultaneous assignment bucket members are retained', () => {
  const source = makePopulatedProjectState().box;
  source.panelManager.isApplied = false;
  source.panelManager.isDirty = true;
  source.panelManager.defaultThicknessMm = 4.125;
  source.svgModel.panels[0].innerContours = [[{ x: 20, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 40 }]];
  source.svgModel.panels[0].innerEdgeIds = [['hole-edge-1', 'hole-edge-2', 'hole-edge-3']];
  source.svgModel.panels[1].parentPanelId = 'panel-a';
  source.edgeAssignments['panel-a-edge-0'].slotAssignments = [{ connectionId: 'S1', slotRole: 'A' }];
  // This capture test intentionally retains the pending source/definition edits
  // beside the older output. The boundary cannot silently regenerate or repair it.
  assert.deepEqual(projectBoxState(captureBoxState(source)), source);
});

test('all currently typed C/P material-thickness and property fields are preserved without a new material model', () => {
  const source = makeEmptyProjectState().box;
  source.connections = {
    C1: { id: 'C1', prefix: 'C', properties: { cornerDepthMm: 2.5, isCornerDepthManual: true,
      materialThicknessMm: 4.5, kerfMm: .17, playMm: -.08, cornerType: 'stored-corner' } },
    P1: { id: 'P1', prefix: 'P', properties: { patternType: 'stored-pattern', patternWidthMm: 18,
      materialThicknessMm: 5.5, lineSpacingMm: 2.2, rowOffsetMm: 1.1, marginMm: 3.4 } },
  };
  assert.deepEqual(projectBoxState(captureBoxState(source)), source);
});

test('all existing composition markers and absent legacy marker round-trip exactly', () => {
  for (const marker of [undefined, 'legacy', 'relationship-composed-single-tool-v1', 'relationship-composed-mixed-v1']) {
    const source = makePopulatedProjectState().box;
    if (marker === undefined) delete source.generatedGeometrySnapshot.metadata.panelCompositionModel;
    else source.generatedGeometrySnapshot.metadata.panelCompositionModel = marker;
    assert.deepEqual(projectBoxState(captureBoxState(source)), source);
  }
});

test('populated project round-trip is lossless and repeatable', () => {
  const source = makePopulatedProjectState();
  const captured = captureProjectState(source);
  const projected = projectProjectState(captured);
  assert.deepEqual(projected, source);
  assert.deepEqual(captureProjectState(projected), captured);
  assert.deepEqual(projectProjectState(captureProjectState(projected)), source);
});

test('later mutations of every live container leave captured module/project data unchanged', () => {
  const source = makePopulatedProjectState();
  const expected = structuredClone(source);
  const project = captureProjectState(source);
  const drawing = captureDrawingState(source.drawingDocument);
  const box = captureBoxState(source.box);
  mutateData(source);
  assert.deepEqual(projectProjectState(project), expected);
  assert.deepEqual(projectDrawingState(drawing), expected.drawingDocument);
  assert.deepEqual(projectBoxState(box), expected.box);
});

test('projections are independent, editable copies and cannot mutate captured or live data', () => {
  const source = makePopulatedProjectState();
  const expected = structuredClone(source);
  const captured = captureProjectState(source);
  const first = projectProjectState(captured);
  const second = projectProjectState(captured);
  mutateData(first);
  assert.deepEqual(second, expected);
  assert.deepEqual(source, expected);
  assert.deepEqual(projectProjectState(captured), expected);
});

test('captures freeze the complete detached graph', () => {
  const captured = captureProjectState(makePopulatedProjectState());
  assertFrozen(captured);
  assert.throws(() => captured.drawingDocument.sketchOrder.push('extra'), TypeError);
  assert.throws(() => captured.box.data.generatedGeometrySnapshot.generatedGeometry[0].diagnostics.push('changed'), TypeError);
});

test('runtime/UI fields supplied beside the explicit source fields are not captured', () => {
  const source = makeEmptyProjectState();
  source.activeWorkspace = 'drawing';
  source.box.activeTool = 'TB';
  source.box.hoveredProfileOffsetProfileId = 'hover';
  source.box.timer = () => { throw new Error('runtime handle must not be cloned'); };
  source.box.selectedLabelId = 'legacy alias';
  const restored = projectProjectState(captureProjectState(source));
  assert.deepEqual(restored, makeEmptyProjectWithSnapshot(source.box.generatedGeometrySnapshot));
});

function makeEmptyProjectWithSnapshot(snapshot) {
  const source = makeEmptyProjectState();
  source.box.generatedGeometrySnapshot = snapshot;
  return source;
}

test('capture/projection execute with all runtime imports, clocks and generators unavailable', () => {
  const forbidden = () => { throw new Error('capture/projection invoked an external service'); };
  // Run the emitted production boundary with require forbidden. Any solver,
  // generator, normalizer or snapshot-factory runtime dependency fails this test.
  const exports = new Function('exports', 'require', 'structuredClone', 'Date', 'crypto', 'setTimeout',
    `${readFileSync(boundaryPath, 'utf8')}\nreturn exports;`)({}, forbidden, structuredClone, forbidden, forbidden, forbidden);
  const source = makePopulatedProjectState();
  assert.deepEqual(exports.projectProjectState(exports.captureProjectState(source)), source);
  assert.deepEqual(exports.projectDrawingState(exports.captureDrawingState(source.drawingDocument)), source.drawingDocument);
  assert.deepEqual(exports.projectBoxState(exports.captureBoxState(source.box)), source.box);
});

test('restored source and stored mixed TB/S/W authority produce identical FinalGeometry and manufacturing', () => {
  const source = makePopulatedProjectState();
  const restored = projectProjectState(captureProjectState(source));
  const final = (box) => buildFinalGeometry(box.svgModel, box.generatedGeometrySnapshot);
  const manufacturing = (box) => {
    const settings = box.projectSettings;
    return processManufacturingGeometry(final(box), settings.kerfMm, settings.slotClearanceMm,
      settings.profileOffsetMm, settings.selectedProfileOffsetIds, settings.tapClearanceMm);
  };
  const before = final(source.box);
  assert.ok(before.contours.length > 0);
  assert.equal(before.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.deepEqual(final(restored.box), before);
  const output = manufacturing(source.box);
  assert.ok(output.contours.length > 0);
  assert.deepEqual(manufacturing(restored.box), output);
});
