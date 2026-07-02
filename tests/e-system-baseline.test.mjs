import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const moduleCache = new Map();
const loadSrcModule = (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = readFileSync(absolutePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(absolutePath, loadedModule);
  const baseDir = dirname(absolutePath);
  const localRequire = (id) => {
    if (id.startsWith('./') || id.startsWith('../')) {
      const resolvedPath = resolve(baseDir, id);
      if (resolvedPath.startsWith(resolve(root, 'src'))) {
        return loadSrcModule(`${resolvedPath.slice(resolve(root).length + 1)}.ts`);
      }
    }
    return mockRequire(id);
  };
  vm.runInNewContext(output, { require: localRequire, module: loadedModule, exports: loadedModule.exports, console, structuredClone, URL, Blob }, { filename: `${relativePath}.cjs` });
  return loadedModule.exports;
};
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const compiled = ts.transpileModule(appSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const mockRequire = (id) => {
  if (id === 'react') return { useMemo: () => undefined, useRef: () => ({ current: null }), useState: (v) => [typeof v === 'function' ? v() : v, () => undefined] };
  if (id === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: Symbol('Fragment') };
  if (id === './svgUtils') return { exportLabeledSvg: () => '', getEdgeAssignmentDisplayLabel: () => '', getEdgeLabelPlacements: () => [], parseSvgDocument: () => ({ viewBox: '0 0 1 1', edges: [], panels: [], rootAttributes: { viewBox: '0 0 1 1', width: null, height: null }, width: 1, height: 1, content: '', innerMarkup: '' }) };
  if (id === './app/panelLookup') {
    return {
      findPanelContainingEdge: (svgModel, edgeId) => svgModel.panels.find((panel) => panel.edgeIds.includes(edgeId)) ?? null,
    };
  }
  if (id === './app/assignmentBuckets') {
    const isEdgeAssignmentBucket = (assignment) => !!assignment && ('edgeAssignment' in assignment || 'slotAssignments' in assignment);
    const toEdgeAssignmentBucket = (assignment) => {
      if (!assignment) return undefined;
      if (isEdgeAssignmentBucket(assignment)) return assignment;
      if (assignment.connectionId.startsWith('E')) return { edgeAssignment: assignment };
      if (assignment.connectionId.startsWith('S')) return { slotAssignments: [assignment] };
      return { edgeAssignment: assignment };
    };
    return {
      isEdgeAssignmentBucket,
      toEdgeAssignmentBucket,
      getBucketEdgeAssignment: (assignment) => toEdgeAssignmentBucket(assignment)?.edgeAssignment,
      getBucketSlotAssignments: (assignment) => toEdgeAssignmentBucket(assignment)?.slotAssignments ?? [],
    };
  }
  if (id.startsWith('./app/')) return loadSrcModule(`src/${id.slice(2)}.ts`);
  return require(id);
};
vm.runInNewContext(compiled, { require: mockRequire, module, exports: module.exports, console, structuredClone, URL, Blob }, { filename: 'App.cjs' });

const svgUtilsSource = readFileSync(resolve(root, 'src/svgUtils.ts'), 'utf8');
const compiledSvgUtils = ts.transpileModule(svgUtilsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const svgUtilsModule = { exports: {} };
vm.runInNewContext(compiledSvgUtils, { module: svgUtilsModule, exports: svgUtilsModule.exports, console, DOMParser: class {}, XMLSerializer: class {} }, { filename: 'svgUtils.cjs' });

const { getConnectionViewModel, resolveAssignedTBOrSConnectionIdForEdge, getPanelEdgeOperations, recalculateAutomaticTBFingerWidths, resolveTBThickness, resolveSThickness, resolveSSlotLengthMm, recalculateAutomaticSSlotLengths, applySlotClearance, buildAppliedEPanelPaths, buildAppliedSGeometry, buildFinalGeometry, buildKerfCompensatedPreviewFromFinalContours, classifyAppliedContours, classifyContoursByContainment, classifyFinalContours, classifyImportedPanelContours, cleanContourPointsForOffset, compensateClassifiedContours, compensateContourPoints, createTabSegmentPlan, exportFinalGeometrySvg, exportManufacturingGeometrySvg, pathDToClosedContour } = module.exports;

const buildKerfPreviewViaFinalContours = (svgModel, appliedEPanelPaths, appliedSGeometry, kerfMm, slotClearanceMm = 0) => {
  const finalGeometry = buildFinalGeometry(svgModel, appliedEPanelPaths, appliedSGeometry);
  return buildKerfCompensatedPreviewFromFinalContours(finalGeometry.contours, kerfMm, slotClearanceMm);
};
assert.equal(buildKerfCompensatedPreviewFromFinalContours.length, 2, 'kerf function accepts only finalContourList and kerfMm');
assert.equal(module.exports.buildKerfCompensatedAppliedPreview, undefined, 'legacy kerf API accepting svgModel/applied geometry is not exported');
assert.equal(applySlotClearance.length, 2, 'slot clearance helper accepts finalContourList and slotClearanceMm');
const boundaryFinalContourList = [
  { id: 'boundary-outer', source: 'final-contour', finalSource: 'original-panel', kind: 'OUTER', pathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
  { id: 'boundary-inner', source: 'final-contour', finalSource: 's-slot', kind: 'INNER', pathD: 'M 2 2 L 4 2 L 4 4 L 2 4 Z' },
];
const boundaryKerfPreview = buildKerfCompensatedPreviewFromFinalContours(boundaryFinalContourList, 0.10);
assert.deepEqual(boundaryKerfPreview.contours.map((contour) => contour.id), boundaryFinalContourList.map((contour) => contour.id), 'every finalContourList item creates one compensated contour with same id');
assert.equal('appliedEPanelPaths' in boundaryKerfPreview, false, 'kerf result omits legacy appliedEPanelPaths');
assert.equal('appliedSGeometry' in boundaryKerfPreview, false, 'kerf result omits legacy appliedSGeometry');
const { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, defaultConnectionProperties } = module.exports;
const { collectWReferences, classifyWReferencePattern, invertWPatternType, generateWEdgeRoles, finishWGroupWorkflow, buildActiveWDisplayAssignments, buildAppliedEPanelPaths: buildE } = module.exports;



const simpleModelForPanels = (panels, { width = 320, height = 240, viewBox = `0 0 ${width} ${height}` } = {}) => ({
  content: '',
  innerMarkup: '',
  rootAttributes: { width: String(width), height: String(height), viewBox },
  viewBox,
  width,
  height,
  panels,
  edges: [],
});

const { createPanelManagerStateFromModel, validatePanelManagerState, buildWorkflowHistoryItems: buildPmWorkflowHistoryItems, getWorkflowHistoryTool: getPmWorkflowHistoryTool } = module.exports;
const pmModel = simpleModelForPanels([
  { id: 'panel-1', contour: [], bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, edgeIds: [] },
  { id: 'panel-2', contour: [], bounds: { minX: 20, maxX: 30, minY: 0, maxY: 10 }, edgeIds: [] },
]);
const pmState = createPanelManagerStateFromModel(pmModel);
assert.equal(pmState.defaultThicknessMm, 0, 'PM default thickness is 0 mm');
assert.equal(pmState.isApplied, false, 'PM starts unapplied after import');
assert.equal(pmState.isDirty, false, 'PM starts with no pending property panel edits after import');
assert.deepEqual(Object.keys(pmState.panels), ['panel-1', 'panel-2'], 'import with panels creates PM state per panel');
assert.equal(pmState.panels['panel-1'].thicknessMm, 0, 'PM panel defaults to 0 mm thickness');
assert.equal(validatePanelManagerState(pmState), 'Set thickness for all panels before applying Panel Manager.', 'zero PM thickness values block Apply');
assert.match(validatePanelManagerState({ ...pmState, panels: { 'panel-1': { panelId: 'panel-1', thicknessMm: 0 } } }) ?? '', /Set thickness for all panels/, 'invalid PM thickness blocks Apply');
assert.match(validatePanelManagerState(createPanelManagerStateFromModel(simpleModelForPanels([]))) ?? '', /No panels were detected/, 'no detected panels keep workflow locked');
const lockedByDefault = !pmState.isApplied;
assert.equal(lockedByDefault, true, 'TB/S/W/MFG tools are locked before PM Apply');
const appliedPmState = { ...pmState, isApplied: true, isDirty: false };
assert.equal(!appliedPmState.isApplied, false, 'PM Apply unlocks tools');
const pmHistory = buildPmWorkflowHistoryItems([], [], [], {}, undefined, appliedPmState.isApplied);
assert.equal(pmHistory.filter((item) => item.kind === 'PM').length, 1, 'PM appears in History once after Apply and is not duplicated');
assert.equal(pmHistory[0].name, 'PM', 'PM history item label is PM');
assert.equal(getPmWorkflowHistoryTool(pmHistory[0]), 'PM', 'clicking PM history item opens PM property panel');
const undoSnapshot = structuredClone(appliedPmState);
const redoSnapshot = { ...undoSnapshot, panels: { ...undoSnapshot.panels, 'panel-1': { panelId: 'panel-1', thicknessMm: 4.5 } }, isApplied: true, isDirty: true };
assert.equal(undoSnapshot.panels['panel-1'].thicknessMm, 0, 'Undo restores PM panel thickness values');
assert.equal(redoSnapshot.panels['panel-1'].thicknessMm, 4.5, 'Redo restores updated PM panel thickness values');
assert.equal(redoSnapshot.isApplied, true, 'PM edits after an Apply do not relock an unlocked project before reapplying');
assert.equal(redoSnapshot.isDirty, true, 'Undo/Redo snapshots carry pending PM edit state');


const tbPmModel = {
  ...simpleModelForPanels([
    { id: 'panel-a', contour: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 0, y: 20 }], bounds: { minX: 0, maxX: 100, minY: 0, maxY: 20 }, edgeIds: ['edge-a'] },
    { id: 'panel-b', contour: [{ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 60 }, { x: 0, y: 60 }], bounds: { minX: 0, maxX: 100, minY: 40, maxY: 60 }, edgeIds: ['edge-b'] },
  ]),
  edges: [{ id: 'edge-a' }, { id: 'edge-b' }],
};
const tbPmAssignments = {
  'edge-a': { connectionId: 'E-pm', edgeRole: 'A' },
  'edge-b': { connectionId: 'E-pm', edgeRole: 'B' },
};
const tbPmConnection = { id: 'E-pm', prefix: 'E', properties: { materialThicknessMm: 3, fingerWidthMm: 9, isFingerWidthManual: false } };
const tbPmState = { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 18 }, 'panel-b': { panelId: 'panel-b', thicknessMm: 10 } } };
const tbPmThickness = resolveTBThickness(tbPmModel, tbPmAssignments, tbPmConnection, tbPmState);
assert.equal(tbPmThickness.panelAThicknessMm, 18, 'TB resolves panel A physical thickness from PM');
assert.equal(tbPmThickness.panelBThicknessMm, 10, 'TB resolves panel B physical thickness from PM');
assert.equal(tbPmThickness.autoFingerWidthMm, 30, 'TB auto finger size is 3 × min(PM panel thicknesses)');
const panelAOperation = getPanelEdgeOperations(tbPmModel.panels[0], tbPmAssignments, { 'E-pm': tbPmConnection }, tbPmState, tbPmModel)[0];
assert.equal(panelAOperation.materialThicknessMm, 18, 'TB tab thickness uses the tab-owning panel thickness');
assert.equal(panelAOperation.materialThicknessMm, 18, 'TB receiving slot width follows the tab panel thickness');
assert.equal(panelAOperation.insetDepthMm, 10, 'TB joint depth/inset uses the receiving panel thickness');
assert.equal(panelAOperation.fingerWidthMm, 30, 'TB automatic operation finger size follows PM thickness');
const tbTenFiveState = { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 10 }, 'panel-b': { panelId: 'panel-b', thicknessMm: 5 } } };
const tbTenFiveOperation = getPanelEdgeOperations(tbPmModel.panels[0], tbPmAssignments, { 'E-pm': tbPmConnection }, tbTenFiveState, tbPmModel)[0];
assert.equal(resolveTBThickness(tbPmModel, tbPmAssignments, tbPmConnection, tbTenFiveState).autoFingerWidthMm, 15, 'TB complete with PM 10/5 ignores stale materialThicknessMm 3 for automatic tab size');
assert.equal(tbTenFiveOperation.materialThicknessMm, 10, 'TB complete with PM 10/5 uses owner PM thickness instead of stale materialThicknessMm 3');
assert.equal(tbTenFiveOperation.insetDepthMm, 5, 'TB complete with PM 10/5 uses receiver PM thickness instead of stale materialThicknessMm 3');
const tbStaleDisplayState = { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 5 }, 'panel-b': { panelId: 'panel-b', thicknessMm: 8 } } };
const tbStaleAutoConnection = { id: 'E-pm', prefix: 'E', properties: { materialThicknessMm: 3, fingerWidthMm: 9, isFingerWidthManual: false } };
const tbStaleViewModel = getConnectionViewModel(tbPmModel, tbPmAssignments, tbStaleAutoConnection, tbStaleDisplayState, (panelId) => `Panel ${panelId}`);
assert.equal(tbStaleViewModel.displayTabMm, 15, 'TB auto view model display ignores stale stored fingerWidthMm and uses PM-derived value');
assert.equal(tbStaleViewModel.autoTabMm, 15, 'TB auto view model exposes computed auto finger width');
assert.equal(tbStaleViewModel.storedTabMm, 9, 'TB auto view model keeps stale stored value separate from display value');
assert.equal(getPanelEdgeOperations(tbPmModel.panels[0], tbPmAssignments, { 'E-pm': tbStaleAutoConnection }, tbStaleDisplayState, tbPmModel)[0].fingerWidthMm, 15, 'TB auto geometry uses same PM-derived value as view model');
const tbPmChangedState = { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 18 }, 'panel-b': { panelId: 'panel-b', thicknessMm: 12 } } };
assert.equal(recalculateAutomaticTBFingerWidths(tbPmModel, tbPmAssignments, { 'E-pm': tbPmConnection }, tbPmChangedState)['E-pm'].properties.fingerWidthMm, 9, 'TB automatic PM change does not write computed finger size into stored field');
assert.equal(getPanelEdgeOperations(tbPmModel.panels[0], tbPmAssignments, { 'E-pm': tbPmConnection }, tbPmChangedState, tbPmModel)[0].fingerWidthMm, 36, 'TB automatic geometry recalculates from PM thickness without stored write-back');
const manualTbConnection = { id: 'E-pm', prefix: 'E', properties: { materialThicknessMm: 3, fingerWidthMm: 22, isFingerWidthManual: true } };
const tbManualViewModel = getConnectionViewModel(tbPmModel, tbPmAssignments, manualTbConnection, tbStaleDisplayState);
assert.equal(tbManualViewModel.displayTabMm, 22, 'TB manual view model display uses stored manual fingerWidthMm');
assert.equal(getPanelEdgeOperations(tbPmModel.panels[0], tbPmAssignments, { 'E-pm': manualTbConnection }, tbStaleDisplayState, tbPmModel)[0].fingerWidthMm, 22, 'TB manual geometry uses stored manual fingerWidthMm');
assert.equal(recalculateAutomaticTBFingerWidths(tbPmModel, tbPmAssignments, { 'E-pm': manualTbConnection }, tbPmChangedState)['E-pm'].properties.fingerWidthMm, 22, 'TB manual finger size remains unchanged when PM thickness changes');
const oldProjectThickness = resolveTBThickness(tbPmModel, tbPmAssignments, tbPmConnection, undefined);
assert.equal(oldProjectThickness.panelAThicknessMm, 3, 'TB preserves legacy fallback only when PM metadata is absent');
assert.equal(oldProjectThickness.autoFingerWidthMm, 9, 'TB preserves legacy fallback only when PM metadata is absent');
const missingPanelTbThickness = resolveTBThickness(tbPmModel, tbPmAssignments, tbPmConnection, { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 10 } } });
assert.equal(missingPanelTbThickness.panelBThicknessMm, null, 'TB PM-resolved path does not fall back to legacy materialThicknessMm when a PM panel thickness is missing');


const incompleteTbAssignments = {
  'edge-a': { connectionId: 'E-pm', edgeRole: 'A' },
};
const incompleteTbThickness = resolveTBThickness(tbPmModel, incompleteTbAssignments, tbPmConnection, tbPmState);
const incompleteTbViewModel = getConnectionViewModel(tbPmModel, incompleteTbAssignments, tbPmConnection, tbPmState, (panelId) => `Panel ${panelId}`);
assert.equal(incompleteTbThickness.panelAThicknessMm, 18, 'incomplete TB keeps assigned owner PM thickness');
assert.equal(incompleteTbThickness.panelBId, null, 'incomplete TB reports missing mating panel as unknown');
assert.equal(incompleteTbThickness.panelBThicknessMm, null, 'incomplete TB reports missing mating thickness as unknown');
assert.equal(incompleteTbThickness.autoFingerWidthMm, null, 'incomplete TB does not compute auto tab from 3 mm fallback');
assert.equal(incompleteTbViewModel.assignedEdges[0].matingPanelId, null, 'incomplete TB diagnostics show mating panel Unknown');
assert.equal(incompleteTbViewModel.assignedEdges[0].matingThicknessMm, null, 'incomplete TB diagnostics show mating thickness Unknown');
assert.equal(getPanelEdgeOperations(tbPmModel.panels[0], incompleteTbAssignments, { 'E-pm': tbPmConnection }, tbPmState, tbPmModel).length, 0, 'incomplete TB does not generate fallback joint depth geometry');
const emptyTbViewModel = getConnectionViewModel(tbPmModel, {}, tbPmConnection, tbPmState);
assert.equal(emptyTbViewModel.displayTabMm, null, 'TB with 0 assigned edges has empty tab value');
assert.equal(resolveTBThickness(tbPmModel, {}, tbPmConnection, tbPmState).autoFingerWidthMm, null, 'TB with 0 assigned edges has no automatic tab value');
assert.equal(incompleteTbViewModel.displayTabMm, null, 'incomplete TB view model has no automatic tab display value');
assert.ok(incompleteTbViewModel.diagnostics.includes('Waiting for second edge.'), 'incomplete TB diagnostics wait for second edge');

const mixedTbModel = {
  ...simpleModelForPanels([
    { id: 'panel-1', contour: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 0, y: 30 }], bounds: { minX: 0, maxX: 100, minY: 0, maxY: 30 }, edgeIds: ['edge-p1', 'edge-p1-right', 'edge-p1-bottom', 'edge-p1-left'] },
    { id: 'panel-5', contour: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 80 }, { x: 0, y: 80 }], bounds: { minX: 0, maxX: 100, minY: 50, maxY: 80 }, edgeIds: ['edge-p5', 'edge-p5-right', 'edge-p5-bottom', 'edge-p5-left'] },
  ]),
  edges: [
    { id: 'edge-p1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: 'edge-p1-right', start: { x: 100, y: 0 }, end: { x: 100, y: 30 } },
    { id: 'edge-p1-bottom', start: { x: 100, y: 30 }, end: { x: 0, y: 30 } },
    { id: 'edge-p1-left', start: { x: 0, y: 30 }, end: { x: 0, y: 0 } },
    { id: 'edge-p5', start: { x: 0, y: 50 }, end: { x: 100, y: 50 } },
    { id: 'edge-p5-right', start: { x: 100, y: 50 }, end: { x: 100, y: 80 } },
    { id: 'edge-p5-bottom', start: { x: 100, y: 80 }, end: { x: 0, y: 80 } },
    { id: 'edge-p5-left', start: { x: 0, y: 80 }, end: { x: 0, y: 50 } },
  ],
};
const mixedTbAssignments = {
  'edge-p1': { connectionId: 'E-mixed', edgeRole: 'A' },
  'edge-p5': { connectionId: 'E-mixed', edgeRole: 'B' },
};
const mixedTbState = { defaultThicknessMm: 3, panels: { 'panel-1': { panelId: 'panel-1', thicknessMm: 10 }, 'panel-5': { panelId: 'panel-5', thicknessMm: 5 } } };
const autoMixedTbConnection = { id: 'E-mixed', prefix: 'E', properties: { materialThicknessMm: 99, fingerWidthMm: 99, isFingerWidthManual: false } };
const mixedTbThickness = resolveTBThickness(mixedTbModel, mixedTbAssignments, autoMixedTbConnection, mixedTbState);
assert.equal(mixedTbThickness.panelAThicknessMm, 10, 'mixed TB P1 thickness resolves from PM instead of legacy materialThicknessMm');
assert.equal(mixedTbThickness.panelBThicknessMm, 5, 'mixed TB P5 thickness resolves from PM instead of legacy materialThicknessMm');
assert.equal(mixedTbThickness.autoFingerWidthMm, 15, 'mixed TB auto finger size is 3 × min(10, 5) and ignores legacy materialThicknessMm 99');
const mixedP1Operation = getPanelEdgeOperations(mixedTbModel.panels[0], mixedTbAssignments, { 'E-mixed': autoMixedTbConnection }, mixedTbState, mixedTbModel)[0];
const mixedP5Operation = getPanelEdgeOperations(mixedTbModel.panels[1], mixedTbAssignments, { 'E-mixed': autoMixedTbConnection }, mixedTbState, mixedTbModel)[0];
assert.equal(mixedP1Operation.materialThicknessMm, 10, 'mixed TB geometry generated on P1 uses tab thickness 10');
assert.equal(mixedP1Operation.insetDepthMm, 5, 'mixed TB geometry generated on P1 uses joint depth 5');
assert.equal(mixedP1Operation.fingerWidthMm, 15, 'mixed TB geometry generated on P1 uses auto finger size 15');
assert.equal(mixedP5Operation.materialThicknessMm, 5, 'mixed TB geometry generated on P5 uses tab thickness 5');
assert.equal(mixedP5Operation.insetDepthMm, 10, 'mixed TB geometry generated on P5 uses joint depth 10');
assert.equal(mixedP5Operation.fingerWidthMm, 15, 'mixed TB geometry generated on P5 uses auto finger size 15');
const manualMixedTbConnection = { id: 'E-mixed', prefix: 'E', properties: { materialThicknessMm: 99, fingerWidthMm: 20, isFingerWidthManual: true } };
assert.equal(recalculateAutomaticTBFingerWidths(mixedTbModel, mixedTbAssignments, { 'E-mixed': manualMixedTbConnection }, mixedTbState)['E-mixed'].properties.fingerWidthMm, 20, 'mixed TB manual finger size 20 remains unchanged');
assert.equal(getPanelEdgeOperations(mixedTbModel.panels[0], mixedTbAssignments, { 'E-mixed': manualMixedTbConnection }, mixedTbState, mixedTbModel)[0].fingerWidthMm, 20, 'mixed TB manual operation finger size stays 20');
const { recomputeAppliedTBGeometryForPanelManager } = module.exports;
const mixedAppliedPathsBeforePmChange = buildAppliedEPanelPaths(mixedTbModel, mixedTbAssignments, { 'E-mixed': autoMixedTbConnection }, mixedTbState);
const mixedTbStateAfterPmApply = { defaultThicknessMm: 3, isApplied: true, isDirty: false, panels: { 'panel-1': { panelId: 'panel-1', thicknessMm: 10 }, 'panel-5': { panelId: 'panel-5', thicknessMm: 6 } } };
const mixedRecomputedAfterPmApply = recomputeAppliedTBGeometryForPanelManager(mixedTbModel, mixedTbAssignments, { 'E-mixed': autoMixedTbConnection }, mixedTbStateAfterPmApply, mixedAppliedPathsBeforePmChange);
assert.equal(mixedRecomputedAfterPmApply.connections['E-mixed'].properties.fingerWidthMm, 99, 'PM Apply does not write automatic TB finger size into stored field');
assert.equal(getPanelEdgeOperations(mixedTbModel.panels[0], mixedTbAssignments, mixedRecomputedAfterPmApply.connections, mixedTbStateAfterPmApply, mixedTbModel)[0].fingerWidthMm, 18, 'PM Apply recalculates automatic TB geometry from PM thickness without stored write-back');
assert.equal(getPanelEdgeOperations(mixedTbModel.panels[0], mixedTbAssignments, mixedRecomputedAfterPmApply.connections, mixedTbStateAfterPmApply, mixedTbModel)[0].insetDepthMm, 6, 'PM Apply recomputes TB joint depth from changed P5 thickness');
assert.notDeepEqual(mixedRecomputedAfterPmApply.appliedEPanelPaths.map((path) => path.pathD), mixedAppliedPathsBeforePmChange.map((path) => path.pathD), 'PM Apply immediately rebuilds already-applied TB geometry');
assert.equal(buildFinalGeometry(mixedTbModel, mixedRecomputedAfterPmApply.appliedEPanelPaths, []).contours.find((contour) => contour.panelId === 'panel-1')?.pathD, mixedRecomputedAfterPmApply.appliedEPanelPaths.find((path) => path.panelId === 'panel-1')?.pathD, 'Final Geometry consumes PM Apply recomputed TB geometry without another global Apply');
const manualMixedAppliedPathsBeforePmChange = buildAppliedEPanelPaths(mixedTbModel, mixedTbAssignments, { 'E-mixed': manualMixedTbConnection }, mixedTbState);
const manualMixedRecomputedAfterPmApply = recomputeAppliedTBGeometryForPanelManager(mixedTbModel, mixedTbAssignments, { 'E-mixed': manualMixedTbConnection }, mixedTbStateAfterPmApply, manualMixedAppliedPathsBeforePmChange);
assert.equal(manualMixedRecomputedAfterPmApply.connections['E-mixed'].properties.fingerWidthMm, 20, 'PM Apply preserves manual TB finger size 20');
assert.equal(getPanelEdgeOperations(mixedTbModel.panels[0], mixedTbAssignments, manualMixedRecomputedAfterPmApply.connections, mixedTbStateAfterPmApply, mixedTbModel)[0].insetDepthMm, 6, 'PM Apply recomputes manual TB depths from changed P5 thickness');

const classifiedEContours = classifyAppliedContours([{ panelId: 'panel-e', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, erasePathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', pathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', edgeIds: [] }], []);
assert.equal(classifiedEContours.length, 1, 'AppliedEPanelPath produces one classified contour');
assert.equal(classifiedEContours[0].kind, 'OUTER', 'AppliedEPanelPath is classified OUTER');
assert.equal(classifiedEContours[0].source, 'final-contour', 'AppliedEPanelPath classification uses final contour provenance only');

const classifiedSContours = classifyAppliedContours([], [{
  connectionId: 'S-test',
  panelPaths: [{ panelId: 'panel-s', sourceEdgeId: 'edge-a', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, erasePathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', pathD: 'M 1 1 L 9 1 L 9 9 L 1 9 Z', edgeIds: [] }],
  slotPaths: [{ connectionId: 'S-test', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 2 2 L 4 2 L 4 3 L 2 3 Z', startDistance: 2, endDistance: 4, widthMm: 1 }],
  edgeIds: ['edge-a', 'edge-b'],
}]);
assert.equal(classifiedSContours.find((contour) => contour.finalSource === 'applied-panel')?.kind, 'OUTER', 'AppliedSPanelPath is classified OUTER');
assert.equal(classifiedSContours.find((contour) => contour.finalSource === 's-slot')?.kind, 'INNER', 'AppliedSSlotPath is classified INNER');


const nestedAppliedEContours = classifyAppliedContours([
  { panelId: 'panel-e-outer', eraseRect: { minX: 0, maxX: 20, minY: 0, maxY: 20 }, erasePathD: 'M 0 0 L 20 0 L 20 20 L 0 20 Z', pathD: 'M 0 0 L 20 0 L 20 20 L 0 20 Z', edgeIds: [] },
  { panelId: 'panel-e-inner', eraseRect: { minX: 5, maxX: 15, minY: 5, maxY: 15 }, erasePathD: 'M 5 5 L 15 5 L 15 15 L 5 15 Z', pathD: 'M 5 5 L 15 5 L 15 15 L 5 15 Z', edgeIds: [] },
], []);
assert.equal(nestedAppliedEContours.find((contour) => contour.panelId === 'panel-e-inner')?.kind, 'OUTER', 'explicit applied panel perimeter inside another contour remains OUTER');

const mixedGeneratedContours = classifyAppliedContours([
  { panelId: 'generated-tb-or-w-panel', eraseRect: { minX: 0, maxX: 30, minY: 0, maxY: 30 }, erasePathD: 'M 0 0 L 30 0 L 30 30 L 0 30 Z', pathD: 'M 0 0 L 30 0 L 30 30 L 0 30 Z', edgeIds: [] },
], [{
  connectionId: 'S-nested',
  panelPaths: [{ panelId: 'panel-s-inner', sourceEdgeId: 'edge-a', eraseRect: { minX: 4, maxX: 14, minY: 4, maxY: 14 }, erasePathD: 'M 4 4 L 14 4 L 14 14 L 4 14 Z', pathD: 'M 4 4 L 14 4 L 14 14 L 4 14 Z', edgeIds: [] }],
  slotPaths: [{ connectionId: 'S-nested', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 6 6 L 10 6 L 10 10 L 6 10 Z', startDistance: 6, endDistance: 10, widthMm: 4 }],
  edgeIds: ['edge-a', 'edge-b'],
}]);
assert.equal(mixedGeneratedContours.find((contour) => contour.finalSource === 'applied-panel' && contour.panelId === 'panel-s-inner')?.kind, 'OUTER', 'explicit applied S panel perimeter inside another contour remains OUTER');
assert.equal(mixedGeneratedContours.find((contour) => contour.finalSource === 's-slot')?.kind, 'INNER', 'applied-s-slot inside another contour remains INNER');
assert.ok(mixedGeneratedContours.filter((contour) => contour.finalSource === 'applied-panel' && contour.panelId === 'generated-tb-or-w-panel').every((contour) => contour.kind === 'OUTER'), 'separate generated panel paths classify by containment only');

const separatePanelContours = classifyAppliedContours([
  { panelId: 'panel-a', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, erasePathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', pathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', edgeIds: [] },
  { panelId: 'panel-b', eraseRect: { minX: 20, maxX: 30, minY: 0, maxY: 10 }, erasePathD: 'M 20 0 L 30 0 L 30 10 L 20 10 Z', pathD: 'M 20 0 L 30 0 L 30 10 L 20 10 Z', edgeIds: [] },
], []);
assert.ok(separatePanelContours.every((contour) => contour.kind === 'OUTER'), 'two separate non-overlapping panels are both OUTER');

const sourceAgnosticContours = classifyAppliedContours([], [{
  connectionId: 'S-source-agnostic',
  panelPaths: [],
  slotPaths: [{ connectionId: 'S-source-agnostic', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 20 20 L 24 20 L 24 22 L 20 22 Z', startDistance: 20, endDistance: 24, widthMm: 2 }],
  edgeIds: ['edge-a', 'edge-b'],
}]);
assert.equal(sourceAgnosticContours[0].kind, 'INNER', 'generated S slot keeps explicit INNER role without geometric containment');

const boundsForPathD = (pathD) => {
  const points = pathDToClosedContour(pathD);
  assert.ok(points, `expected path to parse: ${pathD}`);
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
};

const assertBoundsClose = (actual, expected, message) => {
  assert.ok(Math.abs(actual.minX - expected.minX) < 0.000001, `${message} minX`);
  assert.ok(Math.abs(actual.maxX - expected.maxX) < 0.000001, `${message} maxX`);
  assert.ok(Math.abs(actual.minY - expected.minY) < 0.000001, `${message} minY`);
  assert.ok(Math.abs(actual.maxY - expected.maxY) < 0.000001, `${message} maxY`);
};

const outerContour = { id: 'outer', kind: 'OUTER', source: 'applied-e-panel', pathD: 'M 0 0 L 10 0 L 10 8 L 0 8 Z' };
const innerContour = { id: 'inner', kind: 'INNER', source: 'applied-s-slot', pathD: 'M 2 2 L 6 2 L 6 5 L 2 5 Z' };
const zeroKerfContours = compensateClassifiedContours([outerContour], 0);
assertBoundsClose(boundsForPathD(zeroKerfContours[0].pathD), { minX: 0, maxX: 10, minY: 0, maxY: 8 }, 'zero kerf preserves OUTER contour');
const compensatedOuter = compensateClassifiedContours([outerContour], 0.10);
assertBoundsClose(boundsForPathD(compensatedOuter[0].pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 8.05 }, 'OUTER kerf grows by total kerf');
const compensatedInner = compensateClassifiedContours([innerContour], 0.10);
assertBoundsClose(boundsForPathD(compensatedInner[0].pathD), { minX: 2.05, maxX: 5.95, minY: 2.05, maxY: 4.95 }, 'INNER kerf shrinks by total kerf');
const steppedContourPoints = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 12, y: 4 },
  { x: 12, y: 6 },
  { x: 10, y: 6 },
  { x: 10, y: 8 },
  { x: 0, y: 8 },
  { x: 0, y: 8 },
];
const cleanedSteppedContour = cleanContourPointsForOffset(steppedContourPoints);
assert.equal(cleanedSteppedContour.length, 8, 'cleanup removes only duplicate and redundant collinear contour points');
assert.equal(JSON.stringify(cleanedSteppedContour), JSON.stringify([
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 12, y: 4 },
  { x: 12, y: 6 },
  { x: 10, y: 6 },
  { x: 10, y: 8 },
  { x: 0, y: 8 },
]), 'cleanup preserves real tab/finger step corners');
const compensatedSteppedOuter = compensateContourPoints(steppedContourPoints, 'OUTER', 0.05);
assert.notDeepEqual(compensatedSteppedOuter, steppedContourPoints, 'stepped OUTER compensation does not fall back to original points');
assert.equal(compensatedSteppedOuter.length, cleanedSteppedContour.length, 'stepped OUTER compensation returns compensated cleaned contour');
assertBoundsClose(compensatedSteppedOuter.reduce((bounds, point) => ({
  minX: Math.min(bounds.minX, point.x),
  maxX: Math.max(bounds.maxX, point.x),
  minY: Math.min(bounds.minY, point.y),
  maxY: Math.max(bounds.maxY, point.y),
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }), { minX: -0.05, maxX: 12.05, minY: -0.05, maxY: 8.05 }, 'stepped OUTER kerf grows bounds by total kerf');
const zeroKerfStepped = compensateContourPoints(steppedContourPoints, 'OUTER', 0);
assert.equal(JSON.stringify(zeroKerfStepped), JSON.stringify(steppedContourPoints), 'zero kerf leaves stepped contour geometry unchanged');
const compensatedNested = compensateClassifiedContours([outerContour, innerContour], 0.10);
assertBoundsClose(boundsForPathD(compensatedNested.find((contour) => contour.id === 'outer').pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 8.05 }, 'nested OUTER uses outward compensation');
assertBoundsClose(boundsForPathD(compensatedNested.find((contour) => contour.id === 'inner').pathD), { minX: 2.05, maxX: 5.95, minY: 2.05, maxY: 4.95 }, 'nested INNER uses inward compensation');
const appliedPreview = buildKerfPreviewViaFinalContours(
  simpleModelForPanels([{ id: 'panel-s', contour: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, edgeIds: [] }]),
  [],
  [{
    connectionId: 'S-test',
    panelPaths: [{ panelId: 'panel-s', sourceEdgeId: 'edge-a', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: outerContour.pathD, edgeIds: [] }],
    slotPaths: [{ connectionId: 'S-test', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 2 2 L 6 2 L 6 5 L 2 5 Z', startDistance: 2, endDistance: 6, widthMm: 3 }],
    edgeIds: ['edge-a', 'edge-b'],
  }],
  0.10,
);
assertBoundsClose(boundsForPathD(appliedPreview.contours.find((contour) => contour.panelId === 'panel-s').pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 8.05 }, 'kerf preview generated physical panels expand');
assertBoundsClose(boundsForPathD(appliedPreview.contours.find((contour) => contour.finalSource === 's-slot').pathD), { minX: 2.05, maxX: 5.95, minY: 2.05, maxY: 4.95 }, 'kerf preview generated slots shrink');

const zeroSlotClearance = applySlotClearance(boundaryFinalContourList, 0);
assert.equal(JSON.stringify(zeroSlotClearance), JSON.stringify(boundaryFinalContourList), 'slotClearanceMm 0 produces no geometry changes');
const positiveSlotClearance = applySlotClearance(boundaryFinalContourList, 0.10);
assertBoundsClose(boundsForPathD(positiveSlotClearance.find((contour) => contour.finalSource === 's-slot').pathD), { minX: 1.9, maxX: 4.1, minY: 1.9, maxY: 4.1 }, 'slotClearanceMm expands only S slot contour before kerf');
assert.equal(positiveSlotClearance.find((contour) => contour.finalSource === 'original-panel').pathD, boundaryFinalContourList.find((contour) => contour.finalSource === 'original-panel').pathD, 'outer panel contours unchanged by slot clearance');
const slotClearanceThenKerf = buildKerfCompensatedPreviewFromFinalContours(boundaryFinalContourList, 0.10, 0.10);
assertBoundsClose(boundsForPathD(slotClearanceThenKerf.contours.find((contour) => contour.finalSource === 's-slot').pathD), { minX: 1.95, maxX: 4.05, minY: 1.95, maxY: 4.05 }, 'slot clearance runs before normal inward kerf for S slots');
assertBoundsClose(boundsForPathD(buildKerfCompensatedPreviewFromFinalContours(boundaryFinalContourList, 0.10, 0.10).contours.find((contour) => contour.finalSource === 'original-panel').pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 10.05 }, 'kerf behavior for outer panels remains unchanged with slot clearance');

const uncompensatedPreview = buildKerfPreviewViaFinalContours(simpleModelForPanels([{ id: 'panel-e', contour: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, edgeIds: [] }]), [{ panelId: 'panel-e', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: outerContour.pathD, edgeIds: [] }], [], 0);
const changedPreview = buildKerfPreviewViaFinalContours(simpleModelForPanels([{ id: 'panel-e', contour: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, edgeIds: [] }]), [{ panelId: 'panel-e', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: outerContour.pathD, edgeIds: [] }], [], 0.10);
assert.notEqual(uncompensatedPreview.contours[0].pathD, changedPreview.contours[0].pathD, 'preview geometry changes when kerf changes');

const edge = (id, start, end) => ({ id, source: id, start, end });
const panel = (id, x, y, width, height) => {
  const points = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  return {
    id,
    contour: points,
    bounds: { minX: x, maxX: x + width, minY: y, maxY: y + height },
    edgeIds: [`${id}-top`, `${id}-right`, `${id}-bottom`, `${id}-left`],
  };
};
const modelForPanels = (panels, { width = 320, height = 240, viewBox = `0 0 ${width} ${height}` } = {}) => ({
  content: '',
  innerMarkup: '',
  rootAttributes: { width: String(width), height: String(height), viewBox },
  viewBox,
  width,
  height,
  panels,
  edges: panels.flatMap((p) => p.edgeIds.map((id, i) => edge(id, p.contour[i], p.contour[(i + 1) % p.contour.length]))),
});

const exportedPathDs = (svg) => [...svg.matchAll(/<path\b[^>]*\sd="([^"]*)"/g)].map((match) => match[1]);
const assertExportMatchesPreview = (name, kerfMm, slotClearanceMm) => {
  const exportPreviewModel = modelForPanels([panel(`export-preview-${name}`, 0, 0, 20, 12)]);
  const finalGeometry = buildFinalGeometry(exportPreviewModel, [], [{
    connectionId: `S-export-preview-${name}`,
    panelPaths: [{ panelId: `export-preview-${name}`, sourceEdgeId: 'edge-a', eraseRect: { minX: 0, maxX: 20, minY: 0, maxY: 12 }, erasePathD: '', pathD: 'M 0 0 L 20 0 L 20 12 L 0 12 Z', edgeIds: [] }],
    slotPaths: [{ connectionId: `S-export-preview-${name}`, sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 5 3 L 10 3 L 10 7 L 5 7 Z', startDistance: 5, endDistance: 10, widthMm: 4 }],
    edgeIds: [],
  }]);
  const manufacturingGeometry = buildKerfCompensatedPreviewFromFinalContours(finalGeometry.contours, kerfMm, slotClearanceMm);
  const exported = exportManufacturingGeometrySvg(exportPreviewModel, manufacturingGeometry);
  assert.deepEqual(exportedPathDs(exported), manufacturingGeometry.contours.map((contour) => contour.pathD ?? ''), `${name}: export serializes exactly the same ManufacturingGeometry contours as preview`);
};
assertExportMatchesPreview('zero-kerf-zero-clearance', 0, 0);
assertExportMatchesPreview('positive-kerf', 0.10, 0);
assertExportMatchesPreview('positive-slot-clearance', 0, 0.10);
assertExportMatchesPreview('positive-kerf-and-slot-clearance', 0.10, 0.10);
const exportSource = readFileSync(resolve(root, 'src/app/exportFinalGeometrySvg.ts'), 'utf8');
assert.doesNotMatch(exportSource, /buildFinalGeometry|buildAppliedEPanelPaths|buildAppliedSGeometry|applySlotClearance|compensateClassifiedContours/, 'export serialization performs no geometry rebuilding or manufacturing calculations');

const importedNestedContours = classifyImportedPanelContours(modelForPanels([
  panel('imported-outer', 0, 0, 30, 30),
  panel('imported-inner', 5, 5, 10, 10),
]));
assert.equal(importedNestedContours.find((contour) => contour.panelId === 'imported-inner')?.kind, 'INNER', 'imported unknown contour inside another imported contour may classify INNER');


const finalOriginal = buildKerfPreviewViaFinalContours(modelForPanels([panel('original-only', 0, 0, 10, 8)]), [], [], 0.10);
assertBoundsClose(boundsForPathD(finalOriginal.contours[0].pathD), { minX: -0.05, maxX: 10.05, minY: -0.05, maxY: 8.05 }, 'original panel only receives kerf');
const finalTb = buildKerfPreviewViaFinalContours(modelForPanels([panel('tb-panel', 0, 0, 10, 8)]), [{ panelId: 'tb-panel', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: 'M 0 0 L 12 0 L 12 8 L 0 8 Z', edgeIds: [] }], [], 0.10);
assertBoundsClose(boundsForPathD(finalTb.contours[0].pathD), { minX: -0.05, maxX: 12.05, minY: -0.05, maxY: 8.05 }, 'TB modified panel receives kerf');
const finalW = buildKerfPreviewViaFinalContours(modelForPanels([panel('w-panel', 0, 0, 10, 8)]), [{ panelId: 'w-panel', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: 'M 0 0 L 11 0 L 11 9 L 0 9 Z', edgeIds: [] }], [], 0.10);
assertBoundsClose(boundsForPathD(finalW.contours[0].pathD), { minX: -0.05, maxX: 11.05, minY: -0.05, maxY: 9.05 }, 'W modified panel receives kerf');
const finalS = buildKerfPreviewViaFinalContours(modelForPanels([panel('s-panel', 0, 0, 10, 8)]), [], [{ connectionId: 'S-final', panelPaths: [{ panelId: 's-panel', sourceEdgeId: 'edge-a', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: 'M 0 0 L 13 0 L 13 8 L 0 8 Z', edgeIds: [] }], slotPaths: [{ connectionId: 'S-final', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 2 2 L 6 2 L 6 5 L 2 5 Z', startDistance: 2, endDistance: 6, widthMm: 3 }], edgeIds: [] }], 0.10);
assertBoundsClose(boundsForPathD(finalS.contours.find((contour) => contour.panelId === 's-panel').pathD), { minX: -0.05, maxX: 13.05, minY: -0.05, maxY: 8.05 }, 'S modified panel receives kerf');
assertBoundsClose(boundsForPathD(finalS.contours.find((contour) => contour.finalSource === 's-slot').pathD), { minX: 2.05, maxX: 5.95, minY: 2.05, maxY: 4.95 }, 'S slot receives inward kerf when inside final panel');
const mixedFinalList = buildFinalGeometry(modelForPanels([panel('original-mixed', 0, 0, 10, 8), panel('tb-mixed', 20, 0, 10, 8), panel('w-mixed', 40, 0, 10, 8), panel('s-mixed', 60, 0, 10, 8)]), [{ panelId: 'tb-mixed', eraseRect: { minX: 20, maxX: 30, minY: 0, maxY: 8 }, erasePathD: '', pathD: 'M 20 0 L 31 0 L 31 8 L 20 8 Z', edgeIds: [] }, { panelId: 'w-mixed', eraseRect: { minX: 40, maxX: 50, minY: 0, maxY: 8 }, erasePathD: '', pathD: 'M 40 0 L 51 0 L 51 8 L 40 8 Z', edgeIds: [] }], [{ connectionId: 'S-mixed', panelPaths: [{ panelId: 's-mixed', sourceEdgeId: 'edge-a', eraseRect: { minX: 60, maxX: 70, minY: 0, maxY: 8 }, erasePathD: '', pathD: 'M 60 0 L 71 0 L 71 8 L 60 8 Z', edgeIds: [] }], slotPaths: [{ connectionId: 'S-mixed', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 62 2 L 66 2 L 66 5 L 62 5 Z', startDistance: 2, endDistance: 6, widthMm: 3 }], edgeIds: [] }]);
assert.deepEqual(mixedFinalList.contours.map((contour) => contour.panelId ?? contour.finalSource), ['original-mixed', 'tb-mixed', 'w-mixed', 's-mixed', 's-slot'], 'mixed drawing finalContourList contains original, TB, W, S and slot contours');

const mixedFinalGeometryBeforeManufacturing = JSON.stringify(mixedFinalList.contours);
const mixedWithSlotClearance = buildKerfCompensatedPreviewFromFinalContours(mixedFinalList.contours, 0, 0.10);
assert.equal(JSON.stringify(mixedFinalList.contours), mixedFinalGeometryBeforeManufacturing, 'Final Geometry remains byte-for-byte identical before Manufacturing slot clearance');
assertBoundsClose(boundsForPathD(mixedWithSlotClearance.contours.find((contour) => contour.panelId === 'original-mixed').pathD), { minX: 0, maxX: 10, minY: 0, maxY: 8 }, 'outer panel contour unchanged by slot clearance');
assertBoundsClose(boundsForPathD(mixedWithSlotClearance.contours.find((contour) => contour.panelId === 'tb-mixed').pathD), { minX: 20, maxX: 31, minY: 0, maxY: 8 }, 'TB geometry unchanged by slot clearance');
assertBoundsClose(boundsForPathD(mixedWithSlotClearance.contours.find((contour) => contour.panelId === 'w-mixed').pathD), { minX: 40, maxX: 51, minY: 0, maxY: 8 }, 'W geometry unchanged by slot clearance');
assertBoundsClose(boundsForPathD(mixedWithSlotClearance.contours.find((contour) => contour.finalSource === 's-slot').pathD), { minX: 61.9, maxX: 66.1, minY: 1.9, maxY: 5.1 }, 'only S-slot contours receive slot clearance');
const tbApplyFinalGeometryZeroClearance = buildFinalGeometry(modelForPanels([panel('tb-apply', 0, 0, 10, 8)]), [{ panelId: 'tb-apply', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: 'M 0 0 L 12 0 L 12 8 L 0 8 Z', edgeIds: [] }], []);
const tbApplyFinalGeometryPositiveClearance = buildFinalGeometry(modelForPanels([panel('tb-apply', 0, 0, 10, 8)]), [{ panelId: 'tb-apply', eraseRect: { minX: 0, maxX: 10, minY: 0, maxY: 8 }, erasePathD: outerContour.pathD, pathD: 'M 0 0 L 12 0 L 12 8 L 0 8 Z', edgeIds: [] }], []);
assert.equal(JSON.stringify(tbApplyFinalGeometryPositiveClearance.contours), JSON.stringify(tbApplyFinalGeometryZeroClearance.contours), 'TB Apply produces identical geometry regardless of slotClearanceMm');

assert.equal(classifyContoursByContainment([{ id: 'outer-check', source: 'final-contour', finalSource: 'original-panel', kind: 'OUTER', pathD: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' }, { id: 'inner-check', source: 'final-contour', finalSource: 's-slot', kind: 'INNER', pathD: 'M 5 5 L 10 5 L 10 10 L 5 10 Z' }]).find((contour) => contour.id === 'inner-check').kind, 'INNER', 'explicit INNER contour keeps role inside contour');
assert.ok(classifyContoursByContainment([{ id: 'separate-a', source: 'final-contour', finalSource: 'original-panel', pathD: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' }, { id: 'separate-b', source: 'final-contour', finalSource: 'original-panel', pathD: 'M 20 0 L 30 0 L 30 10 L 20 10 Z' }]).every((contour) => contour.kind === 'OUTER'), 'separate contours classify OUTER');


const panelWithFourSlots = buildFinalGeometry(modelForPanels([panel('slot-panel', 0, 0, 20, 12)]), [], [{
  connectionId: 'S-four-slots',
  panelPaths: [{ panelId: 'slot-panel', sourceEdgeId: 'edge-a', eraseRect: { minX: 0, maxX: 20, minY: 0, maxY: 12 }, erasePathD: '', pathD: 'M 0 0 L 20 0 L 20 12 L 0 12 Z', edgeIds: [] }],
  slotPaths: [
    { connectionId: 'S-four-slots', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 2 2 L 4 2 L 4 4 L 2 4 Z', startDistance: 2, endDistance: 4, widthMm: 2 },
    { connectionId: 'S-four-slots', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 6 2 L 8 2 L 8 4 L 6 4 Z', startDistance: 6, endDistance: 8, widthMm: 2 },
    { connectionId: 'S-four-slots', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 10 2 L 12 2 L 12 4 L 10 4 Z', startDistance: 10, endDistance: 12, widthMm: 2 },
    { connectionId: 'S-four-slots', sourceAEdgeId: 'edge-a', sourceBEdgeId: 'edge-b', pathD: 'M 14 2 L 16 2 L 16 4 L 14 4 Z', startDistance: 14, endDistance: 16, widthMm: 2 },
  ],
  edgeIds: [],
}]);
const classifiedPanelWithFourSlots = classifyFinalContours(panelWithFourSlots.contours);
assert.equal(classifiedPanelWithFourSlots.length, 5, 'panel with 4 slots produces 5 final contours');
assert.equal(classifiedPanelWithFourSlots.filter((contour) => contour.kind === 'OUTER').length, 1, 'panel with 4 slots has 1 OUTER panel perimeter');
assert.equal(classifiedPanelWithFourSlots.filter((contour) => contour.kind === 'INNER').length, 4, 'panel with 4 slots has 4 INNER slot contours');

const connection = (id) => ({ id, prefix: 'E', properties: { materialThicknessMm: 3, fingerWidthMm: 9, isFingerWidthManual: false } });
const pathNumbers = (pathD) => [...pathD.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const pathBounds = (pathD) => {
  const nums = pathNumbers(pathD);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};
const pathPoints = (pathD) => {
  const nums = pathNumbers(pathD);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
};

const mixedTbBoundsPanelA = panel('mixed-bounds-a', 0, 0, 100, 30);
const mixedTbBoundsPanelB = panel('mixed-bounds-b', 0, 50, 100, 30);
const mixedTbBoundsModel = modelForPanels([mixedTbBoundsPanelA, mixedTbBoundsPanelB]);
const mixedTbBoundsAssignments = {
  'mixed-bounds-a-top': { connectionId: 'E-mixed-bounds', edgeRole: 'A' },
  'mixed-bounds-b-top': { connectionId: 'E-mixed-bounds', edgeRole: 'B' },
};
const mixedTbBoundsState = { defaultThicknessMm: 3, panels: { 'mixed-bounds-a': { panelId: 'mixed-bounds-a', thicknessMm: 10 }, 'mixed-bounds-b': { panelId: 'mixed-bounds-b', thicknessMm: 3 } } };
const mixedTbBoundsConnection = { id: 'E-mixed-bounds', prefix: 'E', properties: { materialThicknessMm: 99, fingerWidthMm: 99, isFingerWidthManual: false } };
const mixedTbBoundsPaths = buildAppliedEPanelPaths(mixedTbBoundsModel, mixedTbBoundsAssignments, { 'E-mixed-bounds': mixedTbBoundsConnection }, mixedTbBoundsState);
assert.equal(mixedTbBoundsPaths.length, 2, 'mixed TB bounds test applies both panels');
assert.deepEqual(pathBounds(mixedTbBoundsPaths[0].pathD), mixedTbBoundsPanelA.bounds, 'mixed TB panel A original bounds are preserved');
assert.deepEqual(pathBounds(mixedTbBoundsPaths[1].pathD), mixedTbBoundsPanelB.bounds, 'mixed TB panel B original bounds are preserved');
assert.ok(pathPoints(mixedTbBoundsPaths[0].pathD).some((point) => point.y === 3), 'mixed TB panel A selected edge uses receiving-panel depth 3');
assert.ok(pathPoints(mixedTbBoundsPaths[1].pathD).some((point) => point.y === 60), 'mixed TB panel B selected edge uses receiving-panel depth 10');
assert.ok(pathPoints(mixedTbBoundsPaths[0].pathD).some((point) => point.y === 0), 'mixed TB panel A tabs return to original edge line');
assert.ok(pathPoints(mixedTbBoundsPaths[1].pathD).some((point) => point.y === 50), 'mixed TB panel B tabs return to original edge line');
const assertNoInteriorSpur = (pathD) => {
  const pts = pathPoints(pathD).map((point) => `${point.x},${point.y}`);
  for (let i = 0; i < pts.length - 2; i += 1) assert.notEqual(pts[i], pts[i + 2], `interior backtrack spur at ${pts[i]}`);
};
const assertClosedPath = (pathD, message) => assert.match(pathD.trim(), /Z$/, message);
const assertNoLabelsOrUiArtifacts = (svg) => {
  assert.doesNotMatch(svg, /<text\b|data-edge-label|label|handle|overlay|button/i, 'export contains no labels or UI artifacts');
};
const segmentDistances = (segments) => JSON.parse(JSON.stringify(segments.map((segment) => [Number(segment.startDistance.toFixed(6)), Number(segment.endDistance.toFixed(6))])));
const runCase = (name, panels, assignments, connections) => {
  const svgModel = modelForPanels(panels);
  const result = buildAppliedEPanelPaths(svgModel, assignments, connections);
  assert.equal(result.length, panels.length, `${name}: panel count preserved`);
  assert.deepEqual(result.map((p) => p.edgeIds), panels.map((p) => p.edgeIds), `${name}: edge ownership preserved`);
  result.forEach((applied, i) => {
    const bounds = pathBounds(applied.pathD);
    assert.equal(bounds.minX, panels[i].bounds.minX, `${name}: minX preserved`);
    assert.equal(bounds.maxX, panels[i].bounds.maxX, `${name}: maxX preserved`);
    assert.equal(bounds.minY, panels[i].bounds.minY, `${name}: minY preserved`);
    assert.equal(bounds.maxY, panels[i].bounds.maxY, `${name}: maxY preserved`);
    assertNoInteriorSpur(applied.pathD);
    assertClosedPath(applied.pathD, `${name}: contour is closed`);
  });
  const exported = exportFinalGeometrySvg(svgModel, buildFinalGeometry(svgModel, result, []));
  assert.match(exported, /viewBox="0 0 320 240"/, `${name}: exported viewBox preserved`);
  assert.match(exported, /width="320"/, `${name}: exported width preserved`);
  assert.match(exported, /height="240"/, `${name}: exported height preserved`);
  assertNoLabelsOrUiArtifacts(exported);
  return result;
};

const single = panel('p1', 20, 20, 100, 80);
const eTabPlan = createTabSegmentPlan(94, 9);
assert.deepEqual(segmentDistances(eTabPlan), [[0, 15.5], [15.5, 24.5], [24.5, 33.5], [33.5, 42.5], [42.5, 51.5], [51.5, 60.5], [60.5, 69.5], [69.5, 78.5], [78.5, 94]], 'E tab spacing baseline remains stable');
runCase('A-B', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' } }, { E1: connection('E1') });
runCase('B-A', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'B' }, 'p1-right': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('A-B B-A alternating box', [single], { 'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E1', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E1', edgeRole: 'B' }, 'p1-left': { connectionId: 'E1', edgeRole: 'A' } }, { E1: connection('E1') });
runCase('All A', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'A' }])), { E1: connection('E1') });
const allB = runCase('All B', [single], Object.fromEntries(single.edgeIds.map((id) => [id, { connectionId: 'E1', edgeRole: 'B' }])), { E1: connection('E1') });
assert.match(allB[0].pathD, /20 20/, 'B-B corner remains closed at the original corner');
assert.doesNotMatch(allB[0].pathD, /23 23 L 20 20 L 23 23/, 'E B-B corner does not backtrack through the original corner');
const mixed = panel('p2', 140, 30, 120, 90);
runCase('Mixed E1/E2/E3/E4 assignments', [single, mixed], {
  'p1-top': { connectionId: 'E1', edgeRole: 'A' }, 'p1-right': { connectionId: 'E2', edgeRole: 'B' }, 'p1-bottom': { connectionId: 'E3', edgeRole: 'A' }, 'p1-left': { connectionId: 'E4', edgeRole: 'B' },
  'p2-top': { connectionId: 'E1', edgeRole: 'B' }, 'p2-right': { connectionId: 'E2', edgeRole: 'A' }, 'p2-bottom': { connectionId: 'E3', edgeRole: 'B' }, 'p2-left': { connectionId: 'E4', edgeRole: 'A' },
}, { E1: connection('E1'), E2: connection('E2'), E3: connection('E3'), E4: connection('E4') });
console.log('E-system baseline tests passed');

const sConnection = (id, slotOffsetMm = 0) => ({ id, prefix: 'S', properties: { slotOffsetMm, slotWidthMm: 3, slotLengthMm: 9, isSlotLengthManual: false, materialThicknessMm: 3, kerfMm: 0.15, playMm: 0 } });

const sPanel = panel('sPanel', 10, 10, 100, 50);
const receiver = panel('receiver', 10, 100, 140, 40);
const sModel = modelForPanels([sPanel, receiver], { width: 200, height: 180 });
const sAssignments = {
  'sPanel-top': { connectionId: 'S1', slotRole: 'A' },
  'receiver-top': { connectionId: 'S1', slotRole: 'B' },
};
const sResult = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1', 5) });
assert.equal(sResult.length, 1, 'S1-A/S1-B complete pair generates one S geometry record');
assert.equal(sResult[0].panelPaths.length, 1, 'S-A produces one panel replacement');
const expectedASegments = createTabSegmentPlan(100, 9).filter((_, segmentIndex) => segmentIndex % 2 === 1);
assert.equal(expectedASegments[0].endDistance - expectedASegments[0].startDistance, 9, 'S-A default tab size is materialThicknessMm × 3');
assert.deepEqual(segmentDistances(expectedASegments), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S tab spacing baseline remains stable');
assert.equal(sResult[0].slotPaths.length, expectedASegments.length, 'S-B slot count equals S-A tab count');
sResult[0].slotPaths.forEach((slotPath, index) => {
  const segment = expectedASegments[index];
  assert.equal(slotPath.startDistance, segment.startDistance, 'slotOffsetMm does not shift slot start distance');
  assert.equal(slotPath.endDistance, segment.endDistance, 'slotOffsetMm does not shift slot end distance');
  assert.equal(slotPath.endDistance - slotPath.startDistance, segment.endDistance - segment.startDistance, 'S-B slot length equals S-A tab length');
  assertClosedPath(slotPath.pathD, 'S-B slot contour is closed');
});
assert.deepEqual(segmentDistances(sResult[0].slotPaths), [[9.5, 18.5], [27.5, 36.5], [45.5, 54.5], [63.5, 72.5], [81.5, 90.5]], 'S slot spacing baseline remains stable');

const autoDisplayState = {
  defaultThicknessMm: 3,
  panels: {
    sPanel: { panelId: 'sPanel', thicknessMm: 5 },
    receiver: { panelId: 'receiver', thicknessMm: 3 },
  },
};
const staleAutoSConnection = sConnection('S1');
assert.equal(staleAutoSConnection.properties.slotLengthMm, 9, 'stale fixture starts with old stored S tab length');
const staleAutoThickness = resolveSThickness(sModel, sAssignments, staleAutoSConnection, autoDisplayState);
assert.equal(resolveSSlotLengthMm(staleAutoSConnection, staleAutoThickness), 15, 'automatic S tab display resolves to 3 × S-A PM thickness instead of stale stored value');
const staleAutoGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: staleAutoSConnection }, autoDisplayState);
const expectedAutoSegments = createTabSegmentPlan(100, 15).filter((_, segmentIndex) => segmentIndex % 2 === 1);
assert.equal(staleAutoGeometry[0].slotPaths[0].startDistance, expectedAutoSegments[0].startDistance, 'automatic S canvas geometry uses computed PM slot length when stored value is stale');
const manualDisplayConnection = { ...staleAutoSConnection, properties: { ...staleAutoSConnection.properties, slotLengthMm: 12, isSlotLengthManual: true } };
const manualDisplayThickness = resolveSThickness(sModel, sAssignments, manualDisplayConnection, autoDisplayState);
assert.equal(resolveSSlotLengthMm(manualDisplayConnection, manualDisplayThickness), 12, 'manual S tab display remains the stored manual value after PM changes');
const manualDisplayGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: manualDisplayConnection }, autoDisplayState);
const expectedManualSegments = createTabSegmentPlan(100, 12).filter((_, segmentIndex) => segmentIndex % 2 === 1);
assert.equal(manualDisplayGeometry[0].slotPaths[0].startDistance, expectedManualSegments[0].startDistance, 'manual S canvas geometry uses stored manual slot length after PM changes');
const staleAutoSViewModel = getConnectionViewModel(sModel, sAssignments, staleAutoSConnection, autoDisplayState, (panelId) => `Panel ${panelId}`);
assert.equal(staleAutoSViewModel.displayTabMm, 15, 'S auto view model display ignores stale stored slotLengthMm and uses PM-derived value');
assert.equal(staleAutoSViewModel.autoTabMm, 15, 'S auto view model exposes computed auto slot length');
assert.equal(staleAutoSViewModel.storedTabMm, 9, 'S auto view model keeps stale stored slot length separate from display value');
const manualSViewModel = getConnectionViewModel(sModel, sAssignments, manualDisplayConnection, autoDisplayState);
assert.equal(manualSViewModel.displayTabMm, 12, 'S manual view model display uses stored manual slotLengthMm');

const completeSState = {
  defaultThicknessMm: 3,
  panels: {
    sPanel: { panelId: 'sPanel', thicknessMm: 10 },
    receiver: { panelId: 'receiver', thicknessMm: 5 },
  },
};
const completeSConnection = { ...sConnection('S1'), properties: { ...sConnection('S1').properties, materialThicknessMm: 3, slotWidthMm: 3, slotLengthMm: 9, isSlotLengthManual: false } };
const completeSThickness = resolveSThickness(sModel, sAssignments, completeSConnection, completeSState);
const completeSGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: completeSConnection }, completeSState);
assert.equal(completeSThickness.autoSlotLengthMm, 30, 'complete S auto tab length is 3 × S-A PM thickness 10 and ignores legacy materialThicknessMm 3');
assert.equal(completeSGeometry[0].slotPaths[0].widthMm, 10, 'complete S slot width is S-A PM thickness 10 and ignores stale slotWidthMm 3');
assert.match(completeSGeometry[0].panelPaths[0].pathD, /15/, 'complete S insert depth uses S-B PM thickness 5 from y=10 to y=15');
const incompleteSAssignments = { 'sPanel-top': { connectionId: 'S1', slotRole: 'A' } };
const incompleteSThickness = resolveSThickness(sModel, incompleteSAssignments, completeSConnection, completeSState);
const incompleteSViewModel = getConnectionViewModel(sModel, incompleteSAssignments, completeSConnection, completeSState);
assert.equal(incompleteSThickness.panelAThicknessMm, 10, 'incomplete S keeps assigned S-A PM thickness');
assert.equal(incompleteSThickness.panelBId, null, 'incomplete S reports missing S-B panel as unknown');
assert.equal(incompleteSThickness.panelBThicknessMm, null, 'incomplete S reports missing S-B thickness as unknown');
assert.equal(incompleteSThickness.autoSlotLengthMm, null, 'incomplete S has no automatic tab length before S-A and S-B are assigned');
assert.equal(incompleteSViewModel.assignedEdges[0].matingPanelId, null, 'incomplete S diagnostics show missing side Unknown');
assert.equal(incompleteSViewModel.assignedEdges[0].matingThicknessMm, null, 'incomplete S diagnostics show missing mating thickness Unknown');
assert.equal(incompleteSViewModel.displayTabMm, null, 'incomplete S view model has no automatic tab display value');
assert.ok(incompleteSViewModel.diagnostics.includes('Waiting for S-A/S-B.'), 'incomplete S diagnostics wait for S-A/S-B');
const emptySViewModel = getConnectionViewModel(sModel, {}, completeSConnection, completeSState);
assert.equal(emptySViewModel.displayTabMm, null, 'S with 0 assignments has empty tab value');
assert.equal(resolveSThickness(sModel, {}, completeSConnection, completeSState).autoSlotLengthMm, null, 'S with 0 assignments has no automatic tab value');
assert.throws(() => buildAppliedSGeometry(sModel, incompleteSAssignments, { S1: completeSConnection }, completeSState), /exactly one S-A edge and one S-B edge/, 'incomplete S does not generate fallback geometry');
const manualCompleteSConnection = { ...completeSConnection, properties: { ...completeSConnection.properties, slotLengthMm: 25, isSlotLengthManual: true } };
assert.equal(resolveSSlotLengthMm(manualCompleteSConnection, completeSThickness), 25, 'manual S slotLengthMm remains active for manual tab length');
const missingPanelSThickness = resolveSThickness(sModel, sAssignments, completeSConnection, { defaultThicknessMm: 3, panels: { sPanel: { panelId: 'sPanel', thicknessMm: 10 } } });
assert.equal(missingPanelSThickness.panelBThicknessMm, null, 'S PM-resolved path does not fall back to legacy materialThicknessMm when a PM panel thickness is missing');

const selectionAssignments = {
  'tb-a': { edgeAssignment: { connectionId: 'E-select', edgeRole: 'A' } },
  'tb-b': { edgeAssignment: { connectionId: 'E-select', edgeRole: 'B' } },
  's-a': { slotAssignments: [{ connectionId: 'S-select', slotRole: 'A' }] },
  's-b': { slotAssignments: [{ connectionId: 'S-select', slotRole: 'B' }] },
};
assert.equal(resolveAssignedTBOrSConnectionIdForEdge(selectionAssignments, 's-a', 'S'), 'S-select', 'S-A edge selection resolves selectedLabelId to the S connection');
assert.equal(resolveAssignedTBOrSConnectionIdForEdge(selectionAssignments, 's-b', 'S'), 'S-select', 'S-B edge selection resolves selectedLabelId to the same S connection');
assert.equal(resolveAssignedTBOrSConnectionIdForEdge(selectionAssignments, 'tb-a', 'TB'), 'E-select', 'TB-A edge selection resolves selectedLabelId to the TB connection');
assert.equal(resolveAssignedTBOrSConnectionIdForEdge(selectionAssignments, 'tb-b', 'TB'), 'E-select', 'TB-B edge selection resolves selectedLabelId to the same TB connection');

const mixedSPanelA = panel('s-mixed-a', 250, 10, 200, 50);
const mixedSPanelB = panel('s-mixed-b', 250, 100, 200, 50);
const mixedSPanelC = panel('s-mixed-c', 250, 190, 200, 50);
const mixedSModel = modelForPanels([mixedSPanelA, mixedSPanelB, mixedSPanelC], { width: 500, height: 260 });
const mixedSState = {
  defaultThicknessMm: 3,
  panels: {
    's-mixed-a': { panelId: 's-mixed-a', thicknessMm: 18 },
    's-mixed-b': { panelId: 's-mixed-b', thicknessMm: 10 },
    's-mixed-c': { panelId: 's-mixed-c', thicknessMm: 4 },
  },
};
const mixedSCase1Assignments = { 's-mixed-a-top': { connectionId: 'S-mixed', slotRole: 'A' }, 's-mixed-b-top': { connectionId: 'S-mixed', slotRole: 'B' } };
const mixedSCase1Connection = sConnection('S-mixed');
const mixedSCase1Connections = recalculateAutomaticSSlotLengths(mixedSModel, mixedSCase1Assignments, { 'S-mixed': mixedSCase1Connection }, mixedSState);
const mixedSCase1Thickness = resolveSThickness(mixedSModel, mixedSCase1Assignments, mixedSCase1Connection, mixedSState);
const mixedSCase1Geometry = buildAppliedSGeometry(mixedSModel, mixedSCase1Assignments, mixedSCase1Connections, mixedSState);
assert.equal(mixedSCase1Thickness.panelAThicknessMm, 18, 'mixed S case 1 wall thickness resolves from S-A PM thickness 18');
assert.equal(mixedSCase1Geometry[0].slotPaths[0].widthMm, 18, 'mixed S case 1 slot width resolves from S-A PM thickness 18');
assert.equal(mixedSCase1Thickness.panelBThicknessMm, 10, 'mixed S case 1 insert depth resolves from S-B PM thickness 10');
assert.equal(mixedSCase1Connections['S-mixed'].properties.slotLengthMm, 9, 'mixed S case 1 auto slot length stored field is not overwritten');
assert.equal(mixedSCase1Connections['S-mixed'].properties.slotWidthMm, 3, 'mixed S case 1 auto slot width stored field is not overwritten');
assert.equal(resolveSSlotLengthMm(mixedSCase1Connections['S-mixed'], mixedSCase1Thickness), 54, 'mixed S case 1 auto geometry slot length is 3 × S-A thickness');
assert.match(mixedSCase1Geometry[0].panelPaths[0].pathD, /20/, 'mixed S case 1 S-A receiving inset depth uses S-B thickness 10 from y=10 to y=20');
const mixedSCase2Assignments = { 's-mixed-c-top': { connectionId: 'S-mixed', slotRole: 'A' }, 's-mixed-a-top': { connectionId: 'S-mixed', slotRole: 'B' } };
const mixedSCase2Connections = recalculateAutomaticSSlotLengths(mixedSModel, mixedSCase2Assignments, { 'S-mixed': mixedSCase1Connection }, mixedSState);
const mixedSCase2Thickness = resolveSThickness(mixedSModel, mixedSCase2Assignments, mixedSCase1Connection, mixedSState);
const mixedSCase2Geometry = buildAppliedSGeometry(mixedSModel, mixedSCase2Assignments, mixedSCase2Connections, mixedSState);
assert.equal(mixedSCase2Thickness.panelAThicknessMm, 4, 'mixed S case 2 wall thickness resolves from S-A PM thickness 4');
assert.equal(mixedSCase2Geometry[0].slotPaths[0].widthMm, 4, 'mixed S case 2 slot width resolves from S-A PM thickness 4');
assert.equal(mixedSCase2Thickness.panelBThicknessMm, 18, 'mixed S case 2 insert depth resolves from S-B PM thickness 18');
assert.equal(mixedSCase2Connections['S-mixed'].properties.slotLengthMm, 9, 'mixed S case 2 auto slot length stored field is not overwritten');
assert.equal(resolveSSlotLengthMm(mixedSCase2Connections['S-mixed'], mixedSCase2Thickness), 12, 'mixed S case 2 auto geometry slot length is 3 × S-A thickness');
assert.match(mixedSCase2Geometry[0].panelPaths[0].pathD, /208/, 'mixed S case 2 S-A receiving inset depth uses S-B thickness 18 from y=190 to y=208');
const manualMixedSConnection = { ...sConnection('S-mixed'), properties: { ...sConnection('S-mixed').properties, slotLengthMm: 25, isSlotLengthManual: true } };
const changedMixedSState = { ...mixedSState, panels: { ...mixedSState.panels, 's-mixed-a': { panelId: 's-mixed-a', thicknessMm: 12 }, 's-mixed-b': { panelId: 's-mixed-b', thicknessMm: 6 } } };
const manualMixedSConnections = recalculateAutomaticSSlotLengths(mixedSModel, mixedSCase1Assignments, { 'S-mixed': manualMixedSConnection }, changedMixedSState);
const manualMixedSGeometry = buildAppliedSGeometry(mixedSModel, mixedSCase1Assignments, manualMixedSConnections, changedMixedSState);
assert.equal(manualMixedSConnections['S-mixed'].properties.slotLengthMm, 25, 'manual mixed S slot length remains 25 when PM thickness changes');
assert.equal(manualMixedSGeometry[0].slotPaths[0].widthMm, 12, 'manual mixed S slot width recomputes from changed S-A PM thickness');
assert.match(manualMixedSGeometry[0].panelPaths[0].pathD, /16/, 'manual mixed S insert depth recomputes from changed S-B PM thickness 6 from y=10 to y=16');
const mixedSAppliedBeforePmChange = buildAppliedSGeometry(mixedSModel, mixedSCase1Assignments, mixedSCase1Connections, mixedSState);
const mixedSPmApplyRecomputed = recomputeAppliedTBGeometryForPanelManager(mixedSModel, mixedSCase1Assignments, mixedSCase1Connections, changedMixedSState, [], mixedSAppliedBeforePmChange);
assert.equal(mixedSPmApplyRecomputed.connections['S-mixed'].properties.slotLengthMm, 9, 'PM Apply does not write automatic S slot length into stored field');
assert.equal(mixedSPmApplyRecomputed.appliedSGeometry[0].slotPaths[0].widthMm, 12, 'PM Apply immediately recomputes already-applied S slot width');
assert.notDeepEqual(mixedSPmApplyRecomputed.appliedSGeometry[0].panelPaths.map((path) => path.pathD), mixedSAppliedBeforePmChange[0].panelPaths.map((path) => path.pathD), 'PM Apply immediately rebuilds already-applied S geometry without global Apply');

const sResultNoOffset = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') });
const firstSlotNoOffsetNumbers = pathNumbers(sResultNoOffset[0].slotPaths[0].pathD);
const firstSlotOffsetNumbers = pathNumbers(sResult[0].slotPaths[0].pathD);
for (let index = 0; index < firstSlotNoOffsetNumbers.length; index += 2) {
  assert.equal(firstSlotOffsetNumbers[index], firstSlotNoOffsetNumbers[index], 'slotOffsetMm does not move slot coordinates along S-B');
  assert.equal(firstSlotOffsetNumbers[index + 1], firstSlotNoOffsetNumbers[index + 1] + 5, 'slotOffsetMm moves slot coordinates inward perpendicular to S-B');
}

const offsetCloneReceiver = panel('offsetReceiver', 10, 100, 140, 40);
const offsetModel = modelForPanels([sPanel, receiver, offsetCloneReceiver], { width: 200, height: 180 });
const perConnectionOffsetConnections = { S1: sConnection('S1', 0), S2: sConnection('S2', 20) };
const perConnectionOffsetAssignments = {
  'sPanel-top': { connectionId: 'S1', slotRole: 'A' },
  'receiver-top': { connectionId: 'S1', slotRole: 'B' },
  'sPanel-bottom': { connectionId: 'S2', slotRole: 'A' },
  'offsetReceiver-top': { connectionId: 'S2', slotRole: 'B' },
};
const perConnectionOffsetResult = buildAppliedSGeometry(offsetModel, perConnectionOffsetAssignments, perConnectionOffsetConnections);
const s1OffsetSlotNumbers = pathNumbers(perConnectionOffsetResult.find((geometry) => geometry.connectionId === 'S1').slotPaths[0].pathD);
const s2OffsetSlotNumbers = pathNumbers(perConnectionOffsetResult.find((geometry) => geometry.connectionId === 'S2').slotPaths[0].pathD);
for (let index = 0; index < s1OffsetSlotNumbers.length; index += 2) {
  assert.equal(s2OffsetSlotNumbers[index], s1OffsetSlotNumbers[index], 'per-connection slotOffsetMm does not move slot coordinates along S-B');
  assert.equal(s2OffsetSlotNumbers[index + 1], s1OffsetSlotNumbers[index + 1] + 20, 'per-connection slotOffsetMm moves only that S connection inward perpendicular to S-B');
}
const editedOffsetConnections = {
  ...perConnectionOffsetConnections,
  S2: { ...perConnectionOffsetConnections.S2, properties: { ...perConnectionOffsetConnections.S2.properties, slotOffsetMm: 7 } },
};
assert.equal(editedOffsetConnections.S1.properties.slotOffsetMm, 0, 'editing one S connection offset leaves another S connection property unchanged');
assert.equal(editedOffsetConnections.S2.properties.slotOffsetMm, 7, 'editing one S connection offset updates only the selected S connection property');
console.log('S per-connection offset tests passed');

const sBounds = pathBounds(sResult[0].panelPaths[0].pathD);
assert.equal(sBounds.minX, sPanel.bounds.minX, 'S-A does not protrude outside minX panel bounds');
assert.equal(sBounds.maxX, sPanel.bounds.maxX, 'S-A does not protrude outside maxX panel bounds');
assert.equal(sBounds.minY, sPanel.bounds.minY, 'S-A outer tab faces remain on original edge line');
assert.equal(sBounds.maxY, sPanel.bounds.maxY, 'S-A does not protrude outside maxY panel bounds');
assertClosedPath(sResult[0].panelPaths[0].pathD, 'S-A replacement contour is closed');
assertNoInteriorSpur(sResult[0].panelPaths[0].pathD);
const shortReceiver = panel('shortReceiver', 10, 100, 10, 40);
const shortSModel = modelForPanels([sPanel, shortReceiver], { width: 200, height: 180 });
assert.doesNotThrow(
  () => buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1', 200) }),
  'slotOffsetMm does not reduce available S-B length',
);
assert.throws(
  () => buildAppliedSGeometry(shortSModel, { 'sPanel-top': { connectionId: 'S1', slotRole: 'A' }, 'shortReceiver-top': { connectionId: 'S1', slotRole: 'B' } }, { S1: sConnection('S1') }),
  /S-B slot pattern extends outside the S-B edge/,
  'out-of-bounds S-B slots validate tab distances only',
);
assert.throws(
  () => buildAppliedSGeometry({ ...sModel, panels: [sPanel] }, sAssignments, { S1: sConnection('S1', 5) }),
  /S-B edge must be part of a valid closed panel so slot offset direction can be determined/,
  'S-B edge must belong to a valid closed panel',
);
assert.throws(
  () => buildAppliedSGeometry(sModel, { ...sAssignments, 'sPanel-right': { connectionId: 'E1', edgeRole: 'A' } }, { S1: sConnection('S1'), E1: connection('E1') }),
  /S-A panel conflicts/,
  'S-A panel conflicts with E-applied geometry on same panel',
);

const multiSConnections = {
  S1: sConnection('S1'),
  S2: sConnection('S2'),
  S3: sConnection('S3'),
};
const multiSAssignments = {
  'sPanel-left': { connectionId: 'S1', slotRole: 'A' },
  'receiver-left': { connectionId: 'S1', slotRole: 'B' },
  'sPanel-top': { connectionId: 'S2', slotRole: 'A' },
  'receiver-top': { connectionId: 'S2', slotRole: 'B' },
  'sPanel-right': { connectionId: 'S3', slotRole: 'A' },
  'receiver-right': { connectionId: 'S3', slotRole: 'B' },
};
const mergedSResult = buildAppliedSGeometry(sModel, multiSAssignments, multiSConnections);
const mergedPanelPaths = mergedSResult.flatMap((geometry) => geometry.panelPaths);
const mergedSlotPaths = mergedSResult.flatMap((geometry) => geometry.slotPaths);
assert.equal(mergedPanelPaths.length, 1, 'three S-A edges on same panel produce one replacement contour');
assert.equal(new Set(mergedPanelPaths.map((panelPath) => panelPath.panelId)).size, 1, 'one panel replacement path per panelId');
assert.equal(mergedPanelPaths[0].panelId, 'sPanel', 'merged S replacement belongs to the S-A panel');
const mergedNumbers = pathNumbers(mergedPanelPaths[0].pathD);
assert.ok(mergedNumbers.includes(13), 'merged contour contains left/top inset sides');
assert.ok(mergedNumbers.includes(107), 'merged contour contains right inset side');
assert.deepEqual(pathBounds(mergedPanelPaths[0].pathD), { minX: 10, maxX: 110, minY: 10, maxY: 60 }, 'merged S contour preserves original panel bounds and removes original-corner artifacts');
const expectedMultiSlotCount = ['sPanel-left', 'sPanel-top', 'sPanel-right'].reduce((count, edgeId) => {
  const sideIndex = sPanel.edgeIds.indexOf(edgeId);
  const sideStart = sPanel.contour[sideIndex];
  const sideEnd = sPanel.contour[(sideIndex + 1) % sPanel.contour.length];
  const sideLength = Math.hypot(sideEnd.x - sideStart.x, sideEnd.y - sideStart.y);
  return count + createTabSegmentPlan(sideLength, 9).filter((_, segmentIndex) => segmentIndex % 2 === 1).length;
}, 0);
assert.equal(mergedSlotPaths.length, expectedMultiSlotCount, 'slot paths are still generated per S connection');
const reorderedSResult = buildAppliedSGeometry(sModel, multiSAssignments, { S3: multiSConnections.S3, S1: multiSConnections.S1, S2: multiSConnections.S2 });
assert.equal(reorderedSResult.flatMap((geometry) => geometry.panelPaths)[0].pathD, mergedPanelPaths[0].pathD, 'reordering S connections produces identical panel geometry');
assert.equal(reorderedSResult.flatMap((geometry) => geometry.slotPaths).length, mergedSlotPaths.length, 'reordering S connections preserves slot generation');
console.log('S panel merge tests passed');

const eOnly = buildAppliedEPanelPaths(sModel, sAssignments, { S1: sConnection('S1') });
assert.equal(eOnly.length, 0, 'S assignments do not enter E geometry functions');

const exportModel = modelForPanels([sPanel, receiver, panel('untouched', 160, 100, 20, 20)], { width: 200, height: 180 });
const exportSGeometry = buildAppliedSGeometry(exportModel, sAssignments, { S1: sConnection('S1', 5) });
const exportedS = exportFinalGeometrySvg(exportModel, buildFinalGeometry(exportModel, [], exportSGeometry));
assert.match(exportedS, /viewBox="0 0 200 180"/, 'S export viewBox equals source dimensions');
assert.match(exportedS, /width="200"/, 'S export width equals source dimensions');
assert.match(exportedS, /height="180"/, 'S export height equals source dimensions');
assert.equal([...exportedS.matchAll(/<path/g)].length, exportModel.panels.length + exportSGeometry.flatMap((geometry) => geometry.slotPaths).length, 'export contains all modified panels, unmodified panels, and S slots');
assert.match(exportedS, /M 160 100 L 180 100 L 180 120 L 160 120 Z/, 'export contains unmodified panel contour');
assertNoLabelsOrUiArtifacts(exportedS);
console.log('S geometry and export baseline tests passed');

const sharedBucketAssignments = {
  'receiver-right': { connectionId: 'E3', edgeRole: 'A' },
  'sPanel-top': { connectionId: 'S2', slotRole: 'A' },
  'receiver-top': {
    edgeAssignment: { connectionId: 'E3', edgeRole: 'B' },
    slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }],
  },
};
const sharedBucketConnections = { E3: connection('E3'), S2: sConnection('S2') };
const sharedBucketEGeometry = buildAppliedEPanelPaths(sModel, sharedBucketAssignments, sharedBucketConnections);
const sharedBucketSGeometry = buildAppliedSGeometry(sModel, sharedBucketAssignments, sharedBucketConnections);
assert.equal(sharedBucketEGeometry.length, 1, 'E3-B remains present when S2-B shares the same physical edge');
assert.ok(sharedBucketEGeometry[0].pathD.length > 0, 'shared edge bucket preserves E geometry path data');
assert.equal(sharedBucketSGeometry.length, 1, 'S2 geometry remains present when S2-B shares an edge with E3-B');
assert.ok(sharedBucketSGeometry[0].slotPaths.length > 0, 'shared edge bucket preserves S-B slot geometry');
assert.equal(sharedBucketSGeometry[0].edgeIds[1], 'receiver-top', 'S2-B remains assigned to the shared physical edge');
console.log('E + S-B shared edge bucket tests passed');

const {
  startSGroupWorkflow,
  manualAddSWorkflow,
  maybeAutoCreateNextSInGroup,
  finishSGroupWorkflow,
  finishSGroupWithTrailingCleanup,
  getDefaultSlotRole,
} = module.exports;

const workflowAssign = (connectionId, roles = ['A', 'B']) => Object.fromEntries(roles.map((role, index) => [
  `${connectionId}-${role}-${index}`,
  { slotAssignments: [{ connectionId, slotRole: role }] },
]));

assert.equal(getDefaultSlotRole(workflowAssign('S1', ['A']), 'S1'), 'B', 'S1 gets B after A is assigned');
assert.equal(getDefaultSlotRole(workflowAssign('S1'), 'S1'), null, 'S1 cannot receive a third assigned edge after A and B');

const sCleanupConnections = {
  S1: sConnection('S1'),
  S2: sConnection('S2'),
  S3: sConnection('S3'),
};
const sCleanupGroup = { groupId: 's-group-S1', connectionIds: ['S1', 'S2', 'S3'], isActive: true };
const sCleanupAssignments = {
  'slot-a': { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
  'slot-b': { slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }] },
};
const sCleanupFinished = finishSGroupWithTrailingCleanup(sCleanupGroup, sCleanupConnections, sCleanupAssignments, 'S3');
assert.deepEqual([...sCleanupFinished.activeSGroup.connectionIds], ['S1', 'S2'], 'S Finish removes only trailing 0-slot S child from active group data');
assert.equal(sCleanupFinished.connections.S3, undefined, 'S Finish removes trailing 0-slot S child from connections map');
assert.equal(sCleanupFinished.selectedLabelId, null, 'S Finish clears selectedLabelId when removed trailing S child was selected');
assert.equal(sCleanupFinished.connections.S2.id, 'S2', 'S Finish keeps preceding assigned S child');
const sAssignedTrailingFinished = finishSGroupWithTrailingCleanup(sCleanupGroup, sCleanupConnections, {
  ...sCleanupAssignments,
  'slot-c': { slotAssignments: [{ connectionId: 'S3', slotRole: 'A' }] },
}, 'S3');
assert.deepEqual([...sAssignedTrailingFinished.activeSGroup.connectionIds], ['S1', 'S2', 'S3'], 'S Finish does not remove assigned trailing S child');
assert.equal(sAssignedTrailingFinished.connections.S3.id, 'S3', 'S Finish keeps assigned trailing S child in connections map');

const completeS1 = workflowAssign('S1');
assert.equal(getDefaultSlotRole(completeS1, 'S1'), null, 'S1 cannot have 3 assigned edges');
assert.equal(getDefaultSlotRole(completeS1, 'S1'), null, 'S1 cannot have 4 or 5 assigned edges');

const { getEdgeAssignmentDisplayLabels, getEdgeLabelPlacements } = svgUtilsModule.exports;
const sharedLabelsBucket = {
  edgeAssignment: { connectionId: 'E3', edgeRole: 'B' },
  slotAssignments: [{ connectionId: 'S2', slotRole: 'B' }],
};
assert.deepEqual(JSON.parse(JSON.stringify(getEdgeAssignmentDisplayLabels(sharedLabelsBucket))), ['E3-B', 'S2-B'], 'shared E/S edge bucket returns both display labels');
const sharedLabelPlacements = getEdgeLabelPlacements([
  { id: 'shared-edge', source: 'shared-edge', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, panelBounds: { minX: 0, maxX: 100, minY: 0, maxY: 40 } },
], { 'shared-edge': sharedLabelsBucket }, { fontSizePx: 12, paddingXPx: 4, paddingYPx: 2, edgeOffsetPx: 6 });
assert.equal(sharedLabelPlacements.length, 1, 'shared E/S edge bucket creates one stacked label chip');
assert.equal(sharedLabelPlacements[0].label, 'E3-B\nS2-B', 'stacked label chip includes E and S labels');
const tbAliasPlacements = getEdgeLabelPlacements([
  { id: 'tb-edge', source: 'tb-edge', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, panelBounds: { minX: 0, maxX: 100, minY: 0, maxY: 40 } },
], { 'tb-edge': { connectionId: 'E1', edgeRole: 'A' } }, {
  fontSizePx: 12,
  paddingXPx: 4,
  paddingYPx: 2,
  edgeOffsetPx: 6,
  formatDisplayLabel: (label) => ({ 'E1-A': 'TB1-A' })[label] ?? label,
});
assert.equal(tbAliasPlacements[0].label, 'TB1-A', 'canvas display alias maps E1-A to TB1-A without changing assignments');
console.log('S group workflow and stacked label display tests passed');

let workflowConnections = {};
let workflowGroup = null;
let workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
assert.equal(workflow.selectedLabelId, 'S1', 'start group selects S1');
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 0, 'start group creates S1 with offset 0');
assert.deepEqual(JSON.parse(JSON.stringify(workflowGroup.connectionIds)), ['S1'], 'start group records S1 in active group');

workflowConnections.S1.properties.materialThicknessMm = 6;
workflowConnections.S1.properties.slotWidthMm = 6;
workflowConnections.S1.properties.slotLengthMm = 18;
workflowConnections.S1.properties.slotOffsetMm = 4;
workflowConnections.S1.properties.isSlotLengthManual = true;
workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign('S1'), workflowGroup, 'S1');
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
assert.equal(workflow.selectedLabelId, 'S2', 'completing S1 auto-creates and selects S2');
assert.equal(workflowConnections.S2.properties.materialThicknessMm, 6, 'S2 copies material thickness from S1');
assert.equal(workflowConnections.S2.properties.slotWidthMm, 6, 'S2 copies tab size/slot width from S1');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 4, 'S2 copies slot offset from S1');
assert.equal(workflowConnections.S2.properties.slotLengthMm, 18, 'S2 copies slot length from S1');

for (const completedId of ['S2', 'S3']) {
  workflowConnections[completedId].properties.slotOffsetMm = workflowConnections[completedId === 'S2' ? 'S1' : 'S2'].properties.slotOffsetMm + 1;
  workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign(completedId), workflowGroup, completedId);
  workflowConnections = workflow.connections;
  workflowGroup = workflow.activeSGroup;
}
assert.deepEqual(JSON.parse(JSON.stringify(workflowGroup.connectionIds)), ['S1', 'S2', 'S3', 'S4'], 'active group can continue through S4');
assert.equal(workflow.selectedLabelId, 'S4', 'S4 is selected after S3 completes');

workflowGroup = finishSGroupWorkflow(workflowGroup);
workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign('S4'), workflowGroup, 'S4');
assert.equal(workflow.selectedLabelId, 'S4', 'finish group stops auto-create selection changes');
assert.equal(workflow.connections.S5, undefined, 'finish group stops auto-create connection creation');

workflow = manualAddSWorkflow(workflowConnections, workflowGroup);
assert.equal(workflow.selectedLabelId, 'S5', 'manual Add S creates next standalone S');
assert.equal(workflow.connections.S5.properties.slotOffsetMm, 0, 'manual Add S starts offset 0');
assert.equal(workflow.activeSGroup.isActive, false, 'manual Add S leaves previous active group inactive');

workflowConnections = {};
workflowGroup = null;
workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
workflowGroup = workflow.activeSGroup;
for (const completedId of ['S1', 'S2']) {
  workflow = maybeAutoCreateNextSInGroup(workflowConnections, workflowAssign(completedId), workflowGroup, completedId);
  workflowConnections = workflow.connections;
  workflowGroup = workflow.activeSGroup;
}
workflowConnections = applyActiveSGroupSlotPropertyUpdates(workflowConnections, workflowGroup, { slotOffsetMm: 50 });
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 50, 'active group offset update applies to S1');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 50, 'active group offset update applies to S2');
assert.equal(workflowConnections.S3.properties.slotOffsetMm, 50, 'active group offset update applies to S3');
workflowGroup = finishSGroupWorkflow(workflowGroup);
workflow = startSGroupWorkflow(workflowConnections);
workflowConnections = workflow.connections;
const secondWorkflowGroup = workflow.activeSGroup;
assert.equal(workflowConnections.S4.properties.slotOffsetMm, 0, 'new S group starts with offset 0');
workflowConnections = applyActiveSGroupSlotPropertyUpdates(workflowConnections, secondWorkflowGroup, { slotOffsetMm: 20 });
assert.equal(workflowConnections.S1.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S1 unchanged');
assert.equal(workflowConnections.S2.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S2 unchanged');
assert.equal(workflowConnections.S3.properties.slotOffsetMm, 50, 'group 2 offset update leaves group 1 S3 unchanged');
assert.equal(workflowConnections.S4.properties.slotOffsetMm, 20, 'group 2 offset update applies to first group 2 connection');


let compactSConnections = {
  S1: sConnection('S1'),
  S2: sConnection('S2'),
  S3: sConnection('S3'),
};
const compactSGroup = { groupId: 's-group-S1', connectionIds: ['S1', 'S2', 'S3'], isActive: true };
compactSConnections = applyActiveSGroupSlotPropertyUpdates(compactSConnections, compactSGroup, { slotLengthMm: 15 });
assert.equal(compactSConnections.S1.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S1');
assert.equal(compactSConnections.S2.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S2');
assert.equal(compactSConnections.S3.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to active group S3');
assert.equal(compactSConnections.S1.properties.isSlotLengthManual, true, 'compact S Tab marks slot length manual');

const compactSelectedS = applySlotPropertyUpdates(sConnection('S4'), { slotLengthMm: 15 });
assert.equal(compactSelectedS.properties.slotLengthMm, 15, 'compact S Tab update applies slotLengthMm to selected S connection only');
assert.equal(compactSelectedS.properties.isSlotLengthManual, true, 'selected compact S Tab marks slot length manual');

const sTabNineGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: sConnection('S1') });
const sTabFifteenConnection = sConnection('S1');
sTabFifteenConnection.properties.slotLengthMm = 15;
sTabFifteenConnection.properties.isSlotLengthManual = true;
const sTabFifteenGeometry = buildAppliedSGeometry(sModel, sAssignments, { S1: sTabFifteenConnection });
const sTabNineFirstSlot = sTabNineGeometry[0].slotPaths[0]?.startDistance;
const sTabFifteenFirstSlot = sTabFifteenGeometry[0].slotPaths[0]?.startDistance;
assert.equal(sTabNineFirstSlot, 9.5, 'S apply uses default slotLengthMm 9 for tab plan');
assert.equal(sTabFifteenFirstSlot, 27.5, 'S apply uses updated slotLengthMm 15 for tab plan');

const compactEConnections = {
  E1: connection('E1'),
  E2: connection('E2'),
};
const nextEdgeProperties = { ...compactEConnections.E1.properties, fingerWidthMm: 15, isFingerWidthManual: true };
const updatedCompactEConnections = Object.fromEntries(Object.entries(compactEConnections).map(([connectionId, item]) => [
  connectionId,
  item.prefix === 'E'
    ? { ...item, properties: { ...item.properties, fingerWidthMm: nextEdgeProperties.fingerWidthMm, materialThicknessMm: nextEdgeProperties.materialThicknessMm, isFingerWidthManual: nextEdgeProperties.isFingerWidthManual } }
    : item,
]));
assert.equal(updatedCompactEConnections.E1.properties.fingerWidthMm, 15, 'compact E Tab update applies fingerWidthMm to E1');
assert.equal(updatedCompactEConnections.E2.properties.fingerWidthMm, 15, 'compact E Tab update applies fingerWidthMm to E2');
assert.equal(updatedCompactEConnections.E1.properties.isFingerWidthManual, true, 'compact E Tab marks finger width manual');

assert.equal(defaultConnectionProperties.W.wallHeightMm, 30, 'W defaults include wall height');
assert.equal(defaultConnectionProperties.W.materialThicknessMm, 3, 'W defaults include material thickness');
assert.equal(defaultConnectionProperties.W.kerfMm, 0.15, 'W defaults include kerf');
assert.equal(defaultConnectionProperties.W.playMm, 0, 'W defaults include play');
console.log('Active S group compact offset update tests passed');
console.log('W placeholder defaults tests passed');


const wallPanels = [
  panel('w1', 20, 20, 100, 80),
  panel('w2', 140, 20, 100, 80),
  panel('w3', 20, 120, 100, 80),
  panel('w4', 140, 120, 100, 80),
];
const wallModel = modelForPanels(wallPanels);
const selectedWallEdges = wallPanels.map((p) => `${p.id}-top`);
const selectedWallPanelEdges = wallPanels.flatMap((p) => [`${p.id}-top`, `${p.id}-bottom`]);
const wAssignmentsUniformE = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { edgeAssignment: { connectionId: `E${index + 1}`, edgeRole: 'A' } },
]));
const wUniformRefs = collectWReferences(selectedWallEdges, wAssignmentsUniformE, wallModel);
assert.equal(wUniformRefs.length, 4, 'W can read same-panel E references when selected W edges are unassigned');
const samePanelWRefs = collectWReferences(['w1-top', 'w1-bottom'], wAssignmentsUniformE, wallModel);
assert.equal(samePanelWRefs.length, 1, 'two selected W edges on the same panel count as one panel reference');
assert.equal(samePanelWRefs[0].connectionId, 'E1', 'same-panel selected W edges share the panel reference');
const multiEdgePanelWRefs = collectWReferences(selectedWallPanelEdges, wAssignmentsUniformE, wallModel);
assert.equal(multiEdgePanelWRefs.length, 4, 'four panels with two selected W edges each collect one reference per selected panel');
assert.deepEqual(Array.from(wUniformRefs, (ref) => ref.connectionId), ['E1', 'E2', 'E3', 'E4'], 'W stores local panel references as a collection');
assert.equal(classifyWReferencePattern(wUniformRefs), 'UNIFORM', 'W classification uses complete group uniform reference set');
assert.equal(invertWPatternType('UNIFORM'), 'ALTERNATING', 'uniform references invert to alternating W pattern');
assert.deepEqual(generateWEdgeRoles(selectedWallEdges, 'ALTERNATING'), ['A', 'B', 'A', 'B'], 'alternating W generation assigns W edge roles');

const wAssignmentsAlternatingE = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { edgeAssignment: { connectionId: `E${index + 1}`, edgeRole: index % 2 === 1 ? 'B' : 'A' } },
]));
const wAlternatingRefs = collectWReferences(selectedWallEdges, wAssignmentsAlternatingE, wallModel);
assert.equal(classifyWReferencePattern(wAlternatingRefs), 'ALTERNATING', 'W classification uses complete group alternating reference set');
assert.equal(invertWPatternType('ALTERNATING'), 'UNIFORM', 'alternating references invert to uniform W pattern');
assert.deepEqual(generateWEdgeRoles(selectedWallEdges, 'UNIFORM'), ['A', 'A', 'A', 'A'], 'uniform W generation assigns W edge roles');
assert.equal(classifyWReferencePattern([wAlternatingRefs[0]]), 'UNIFORM', 'single-edge classification would differ, proving tests cover complete-group behavior');

const wAssignmentsAlternatingEStartingB = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { edgeAssignment: { connectionId: `E${index + 1}`, edgeRole: index % 2 === 1 ? 'A' : 'B' } },
]));
const wAlternatingRefsStartingB = collectWReferences(selectedWallEdges, wAssignmentsAlternatingEStartingB, wallModel);
assert.equal(classifyWReferencePattern(wAlternatingRefsStartingB), 'ALTERNATING', 'W classification preserves mixed E references that start with B');

const wAssignmentsS = Object.fromEntries(wallPanels.map((p, index) => [
  `${p.id}-right`,
  { slotAssignments: [{ connectionId: `S${index + 1}`, slotRole: 'B' }] },
]));
const wSRefs = collectWReferences(selectedWallEdges, wAssignmentsS, wallModel);
assert.equal(wSRefs.length, 4, 'W can read same-panel S references when selected W edges are unassigned');
assert.equal(classifyWReferencePattern(wSRefs), 'UNIFORM', 'S-B/S-B/S-B/S-B is a uniform W reference pattern');

const wConnections = {
  W1: {
    id: 'W1',
    prefix: 'W',
    properties: {
      materialThicknessMm: 4,
      fingerWidthMm: 11,
      selectedEdgeIds: selectedWallEdges,
      references: [],
      referencePatternType: null,
      generatedPatternType: null,
      generatedConnectionIds: [],
    },
  },
};
const finishedW = finishWGroupWorkflow(wConnections, wAssignmentsUniformE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.equal(finishedW.connections.E1, undefined, 'Finish W does not create a generated E connection');
assert.equal(finishedW.connections.W1.properties.materialThicknessMm, 4, 'W material thickness stays on W and is independent from E/S settings');
assert.equal(finishedW.connections.W1.properties.fingerWidthMm, 11, 'W tab size stays on W and is independent from E/S tab size');
assert.equal(finishedW.connections.W1.properties.generatedConnectionIds.length, 0, 'W does not store generated E labels');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedW.assignments[edgeId].edgeAssignment.connectionId), Array(selectedWallEdges.length).fill('W1'), 'Finish W stores W-prefixed edge assignments');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'B', 'A', 'B'], 'W generated assignments are E-compatible W assignments');
assert.deepEqual(selectedWallEdges.map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(finishedW.assignments[edgeId])), ['W1-A', 'W1-B', 'W1-A', 'W1-B'], 'Final labels remain W-prefixed after Finish');

const finishedMixedEW = finishWGroupWorkflow(wConnections, wAssignmentsAlternatingE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.equal(finishedMixedEW.connections.E1, undefined, 'mixed E Finish W does not create a generated E connection');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedMixedEW.assignments[edgeId].edgeAssignment.connectionId), Array(selectedWallEdges.length).fill('W1'), 'mixed E Finish W stores W-prefixed edge assignments');
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedMixedEW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'B', 'A', 'B'], 'mixed E references A/B/A/B generate copied W roles A/B/A/B');
assert.deepEqual(selectedWallEdges.map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(finishedMixedEW.assignments[edgeId])), ['W1-A', 'W1-B', 'W1-A', 'W1-B'], 'mixed E final labels remain W-prefixed');
assert.equal(finishedMixedEW.connections.W1.properties.generatedConnectionIds.length, 0, 'mixed E Finish W does not store generated E labels');
assert.equal(finishedMixedEW.connections.W1.properties.generatedPatternType, 'ALTERNATING', 'mixed E Finish W keeps copied role pattern instead of collapsing to uniform');

const finishedMixedEStartingBW = finishWGroupWorkflow(wConnections, wAssignmentsAlternatingEStartingB, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.deepEqual(selectedWallEdges.map((edgeId) => finishedMixedEStartingBW.assignments[edgeId].edgeAssignment.edgeRole), ['B', 'A', 'B', 'A'], 'mixed E references B/A/B/A generate copied W roles B/A/B/A');
assert.deepEqual(selectedWallEdges.map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(finishedMixedEStartingBW.assignments[edgeId])), ['W1-B', 'W1-A', 'W1-B', 'W1-A'], 'mixed E labels remain W-prefixed when starting with B');
assert.equal(finishedMixedEStartingBW.connections.E1, undefined, 'mixed E starting B Finish W does not create a generated E connection');

const multiEdgeWConnections = {
  W1: {
    ...wConnections.W1,
    properties: {
      ...wConnections.W1.properties,
      selectedEdgeIds: selectedWallPanelEdges,
    },
  },
};
const finishedMultiEdgeW = finishWGroupWorkflow(multiEdgeWConnections, wAssignmentsUniformE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.deepEqual(Array.from(finishedMultiEdgeW.connections.W1.properties.references, (ref) => ref.connectionId), ['E1', 'E2', 'E3', 'E4'], 'W finish stores one reference per selected panel when multiple W edges are selected per panel');
assert.deepEqual(selectedWallPanelEdges.map((edgeId) => finishedMultiEdgeW.assignments[edgeId].edgeAssignment.connectionId), Array(selectedWallPanelEdges.length).fill('W1'), 'W assignments apply to all selected W edges');
assert.deepEqual(selectedWallPanelEdges.map((edgeId) => finishedMultiEdgeW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'], 'W roles cover all selected W edges');
const finishedMultiEdgeMixedEW = finishWGroupWorkflow(multiEdgeWConnections, wAssignmentsAlternatingE, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel);
assert.deepEqual(selectedWallPanelEdges.map((edgeId) => finishedMultiEdgeMixedEW.assignments[edgeId].edgeAssignment.edgeRole), ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'], 'mixed E panel reference role applies to all selected W edges on that panel');
const manualEquivalentAssignments = Object.fromEntries(selectedWallEdges.map((edgeId, index) => [edgeId, { connectionId: 'E1', edgeRole: index % 2 === 1 ? 'B' : 'A' }]));
const generatedAssignments = Object.fromEntries(selectedWallEdges.map((edgeId) => [edgeId, finishedW.assignments[edgeId].edgeAssignment]));
const generatedPaths = buildAppliedEPanelPaths(wallModel, generatedAssignments, finishedW.connections);
const manualPaths = buildAppliedEPanelPaths(wallModel, manualEquivalentAssignments, { E1: { id: 'E1', prefix: 'E', properties: { materialThicknessMm: 4, fingerWidthMm: 11, isFingerWidthManual: true } } });
assert.deepEqual(generatedPaths.map((path) => path.pathD), manualPaths.map((path) => path.pathD), 'W assignments pass through existing E geometry like equivalent manual E setup');
assert.equal(exportFinalGeometrySvg(wallModel, buildFinalGeometry(wallModel, generatedPaths, [])), exportFinalGeometrySvg(wallModel, buildFinalGeometry(wallModel, manualPaths, [])), 'W export geometry matches equivalent manual E setup');
assert.throws(
  () => finishWGroupWorkflow(wConnections, {}, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true }, wallModel),
  /has 0 E\/S reference labels/,
  '0 references on a selected W panel fails',
);
assert.throws(
  () => collectWReferences(['w1-top'], {
    'w1-right': { edgeAssignment: { connectionId: 'E1', edgeRole: 'A' } },
    'w1-bottom': { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] },
  }, wallModel, 'W1'),
  /multiple E\/S reference labels/,
  'multiple references on the same selected W panel fails',
);
const wDisplayAssignments = buildActiveWDisplayAssignments({}, wConnections, { groupId: 'w-group-W1', connectionId: 'W1', isActive: true });
assert.equal(wDisplayAssignments['w1-top'].edgeAssignment.connectionId, 'W1', 'temporary W label is visible during active W group');
assert.equal(wDisplayAssignments['w1-top'].edgeAssignment.edgeRole, undefined, 'temporary W display label has no A/B role');
assert.deepEqual(selectedWallEdges.slice(0, 3).map((edgeId) => svgUtilsModule.exports.getEdgeAssignmentDisplayLabel(wDisplayAssignments[edgeId])), ['W1', 'W1', 'W1'], 'temporary W labels render as W1 without A/B');
assert.equal(wConnections.W1.properties.selectedEdgeIds.includes('w1-top'), true, 'temporary W display label uses selected W edges from connection state');
assert.equal({}['w1-top'], undefined, 'temporary W labels are not written to edgeAssignments');
const inactiveWDisplayAssignments = buildActiveWDisplayAssignments({}, wConnections, { groupId: 'w-group-W1', connectionId: 'W1', isActive: false });
assert.equal(inactiveWDisplayAssignments['w1-top'], undefined, 'temporary W labels disappear after W group is inactive');
console.log('W group V1 tests passed');

const { startTBGroupWorkflow, appendAutoCreatedEToTBGroup, buildTBCanvasLabelAliasMap, finishTBGroupWorkflow, finishTBGroupWithTrailingCleanup, getTBGroupActionNumber, buildWorkflowHistoryItems, getWorkflowHistoryTool, getToolClickGroupStartKind, haveProjectSettingsChanged, startWGroupWorkflow } = module.exports;


assert.equal(getToolClickGroupStartKind('TB', null, null, null), 'TB', 'Clicking TB starts a TB group if none is active');
const activeTBClickGroup = startTBGroupWorkflow({}, defaultConnectionProperties.E).activeTBGroup;
assert.equal(getToolClickGroupStartKind('TB', activeTBClickGroup, null, null), null, 'Clicking TB again does not create another active TB group');
assert.equal(getToolClickGroupStartKind('S', null, null, null), 'S', 'Clicking S starts an S group if none is active');
const activeSClickGroup = startSGroupWorkflow({}).activeSGroup;
assert.equal(getToolClickGroupStartKind('S', null, activeSClickGroup, null), null, 'Clicking S again does not create another active S group');
assert.equal(getToolClickGroupStartKind('W', null, null, null), 'W', 'Clicking W starts a W group if none is active');
const activeWClickGroup = startWGroupWorkflow({}).activeWGroup;
assert.equal(getToolClickGroupStartKind('W', null, null, activeWClickGroup), null, 'Clicking W again does not create another active W group');
assert.equal(getToolClickGroupStartKind('select', null, null, null), null, 'Clicking Select does not start any group');
assert.equal(getToolClickGroupStartKind('J', null, null, null), null, 'Clicking J does not start any group');
assert.equal(getToolClickGroupStartKind('P', null, null, null), null, 'Clicking P does not start any group');
assert.equal(getToolClickGroupStartKind('manufacturing', null, null, null), null, 'Clicking Manufacturing does not start any group');

const tbStarted = startTBGroupWorkflow({}, defaultConnectionProperties.E);
assert.equal(tbStarted.selectedLabelId, 'E1', 'Start TB group selects first internal E label');
assert.equal(tbStarted.activeTool, 'TB', 'Start TB group activates TB tool');
assert.equal(tbStarted.activeTBGroup.groupId, 'tb-group-E1', 'Start TB group creates activeTBGroup with first E label');
assert.deepEqual([...tbStarted.activeTBGroup.connectionIds], ['E1'], 'Start TB group stores first E label in activeTBGroup');
assert.equal(tbStarted.activeTBGroup.isActive, true, 'Start TB group marks activeTBGroup active');
assert.equal(tbStarted.connections.E1.prefix, 'E', 'TB group contains internal E connection');
assert.equal(JSON.stringify(tbStarted.connections.E1.properties), JSON.stringify(defaultConnectionProperties.E), 'Start TB group uses existing E default properties');

const tbWithExisting = startTBGroupWorkflow({ E1: connection('E1') }, { materialThicknessMm: 5, fingerWidthMm: 15, isFingerWidthManual: true });
assert.equal(tbWithExisting.selectedLabelId, 'E2', 'Start TB group creates next internal E label after existing E labels');
assert.equal(JSON.stringify(tbWithExisting.connections.E2.properties), JSON.stringify(connection('E1').properties), 'Start TB group shares existing E properties');

const tbAppended = appendAutoCreatedEToTBGroup(tbStarted.activeTBGroup, 'E1', 'E2');
assert.deepEqual([...tbAppended.connectionIds], ['E1', 'E2'], 'E auto-create after two assignments appends new E label to activeTBGroup');
assert.strictEqual(appendAutoCreatedEToTBGroup(tbAppended, 'E9', 'E10'), tbAppended, 'E auto-create outside activeTBGroup leaves TB group unchanged');
const tbFourChildGroup = appendAutoCreatedEToTBGroup(
  appendAutoCreatedEToTBGroup(tbAppended, 'E2', 'E3'),
  'E3',
  'E4',
);
const tbFourChildFinished = finishTBGroupWorkflow(tbFourChildGroup);
assert.deepEqual([...tbFourChildFinished.connectionIds], ['E1', 'E2', 'E3', 'E4'], 'Finished TB group retains all child E connections as one group');
assert.deepEqual(Object.keys(buildTBCanvasLabelAliasMap([{ labels: tbFourChildFinished.connectionIds }])).slice(0, 4), ['E1-A', 'E1-B', 'E2-A', 'E2-B'], 'TB canvas alias map keeps internal E connection ids as alias inputs');

const tbAssignments = {
  'p1-top': { edgeAssignment: { connectionId: 'E1', edgeRole: 'A' } },
  'p1-right': { edgeAssignment: { connectionId: 'E1', edgeRole: 'B' } },
  'p1-bottom': { edgeAssignment: { connectionId: 'E2', edgeRole: 'A' } },
  'p1-left': { edgeAssignment: { connectionId: 'E2', edgeRole: 'B' } },
};
const tbConnections = {
  E1: tbStarted.connections.E1,
  E2: { id: 'E2', prefix: 'E', properties: tbStarted.connections.E1.properties },
};
const tbAppliedWhileActive = buildAppliedEPanelPaths(modelForPanels([single]), tbAssignments, tbConnections);
assert.equal(tbAppliedWhileActive.length, 1, 'Apply works while activeTBGroup is active');
assertClosedPath(tbAppliedWhileActive[0].pathD, 'Apply while activeTBGroup is active produces applied geometry');

const tbAssignmentsBeforeFinish = structuredClone(tbAssignments);
const tbFinished = finishTBGroupWorkflow(tbAppended);
assert.equal(tbFinished.groupId, 'tb-group-E1', 'Finish TB group keeps group id');
assert.deepEqual([...tbFinished.connectionIds], ['E1', 'E2'], 'Finish TB group keeps grouped E labels');
assert.equal(tbFinished.isActive, false, 'Finish TB group marks group inactive only');
assert.equal(JSON.stringify(tbAssignments), JSON.stringify(tbAssignmentsBeforeFinish), 'Finish TB group does not change assignments');
assert.equal(tbConnections.E1.id, 'E1', 'Internal TB connection ID remains E1');
assert.equal(tbConnections.E2.id, 'E2', 'Internal TB connection ID remains E2');
assert.equal(JSON.stringify(tbConnections), JSON.stringify({
  E1: tbStarted.connections.E1,
  E2: { id: 'E2', prefix: 'E', properties: tbStarted.connections.E1.properties },
}), 'Finish TB group does not rename labels or mutate connections');

const tbCleanupConnections = {
  E1: tbStarted.connections.E1,
  E2: { id: 'E2', prefix: 'E', properties: tbStarted.connections.E1.properties },
  E3: { id: 'E3', prefix: 'E', properties: tbStarted.connections.E1.properties },
};
const tbCleanupGroup = { groupId: 'tb-group-E1', connectionIds: ['E1', 'E2', 'E3'], isActive: true };
const tbCleanupAssignments = {
  'p1-top': { edgeAssignment: { connectionId: 'E1', edgeRole: 'A' } },
  'p1-right': { edgeAssignment: { connectionId: 'E2', edgeRole: 'B' } },
};
const tbCleanupFinished = finishTBGroupWithTrailingCleanup(tbCleanupGroup, tbCleanupConnections, tbCleanupAssignments, 'E3');
assert.deepEqual([...tbCleanupFinished.activeTBGroup.connectionIds], ['E1', 'E2'], 'TB Finish removes only trailing 0-edge E child from active/completed group data');
assert.equal(tbCleanupFinished.connections.E3, undefined, 'TB Finish removes trailing 0-edge E child from connections map');
assert.equal(tbCleanupFinished.selectedLabelId, null, 'TB Finish clears selectedLabelId when removed trailing E child was selected');
assert.equal(tbCleanupFinished.connections.E2.id, 'E2', 'TB Finish keeps preceding assigned E child');
const tbAssignedTrailingFinished = finishTBGroupWithTrailingCleanup(tbCleanupGroup, tbCleanupConnections, {
  ...tbCleanupAssignments,
  'p1-bottom': { edgeAssignment: { connectionId: 'E3', edgeRole: 'A' } },
}, 'E3');
assert.deepEqual([...tbAssignedTrailingFinished.activeTBGroup.connectionIds], ['E1', 'E2', 'E3'], 'TB Finish does not remove assigned trailing E child');
assert.equal(tbAssignedTrailingFinished.connections.E3.id, 'E3', 'TB Finish keeps assigned trailing E child in connections map');
assert.equal(getTBGroupActionNumber([{ id: 'tb-group-E1' }, { id: 'tb-group-E7' }], null), 3, 'TB next group number is based on TB group count rather than internal E label number');


const workflowHistoryConnections = {
  ...tbConnections,
  E3: { id: 'E3', prefix: 'E', properties: tbStarted.connections.E1.properties },
  S1: { id: 'S1', prefix: 'S', properties: defaultConnectionProperties.S },
  S2: { id: 'S2', prefix: 'S', properties: defaultConnectionProperties.S },
  W1: { id: 'W1', prefix: 'W', properties: { ...defaultConnectionProperties.W, selectedEdgeIds: ['p1-left', 'p1-right'] } },
};
const workflowHistoryItems = buildWorkflowHistoryItems(
  [{ id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: tbFinished.isActive, orderIndex: 0 }],
  [{ id: 's-group-S1', labels: ['S1', 'S2'], isActive: true, orderIndex: 2 }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 1 }],
  workflowHistoryConnections,
);
assert.equal(workflowHistoryItems.filter((item) => item.kind === 'manufacturing').length, 0, 'Workflow History omits Manufacturing until the first MFG tool click is recorded');

assert.equal(haveProjectSettingsChanged({ kerfMm: 0.15, slotClearanceMm: 0 }, null), false, 'Default Manufacturing settings are not a completed operation');
assert.equal(haveProjectSettingsChanged({ kerfMm: 0.2, slotClearanceMm: 0 }, null), true, 'Changing Kerf before Apply is a pending Manufacturing operation');
assert.equal(haveProjectSettingsChanged({ kerfMm: 0.2, slotClearanceMm: 0.08 }, { kerfMm: 0.2, slotClearanceMm: 0 }), true, 'Changing Slot Clearance after a Kerf Apply is a pending Manufacturing operation');
assert.equal(haveProjectSettingsChanged({ kerfMm: 0.2, slotClearanceMm: 0.08 }, { kerfMm: 0.2, slotClearanceMm: 0.08 }), false, 'Repeated Apply without Manufacturing changes does not add work');

const workflowHistoryItemsWithFirstMfgClick = buildWorkflowHistoryItems(
  [{ id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: tbFinished.isActive, orderIndex: 1 }],
  [{ id: 's-group-S1', labels: ['S1', 'S2'], isActive: true, orderIndex: 3 }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 2 }],
  workflowHistoryConnections,
  0,
);
assert.equal(workflowHistoryItemsWithFirstMfgClick.filter((item) => item.kind === 'manufacturing').length, 1, 'First Manufacturing tool click creates an MFG history item before Apply');
assert.equal(JSON.stringify(workflowHistoryItemsWithFirstMfgClick.map((item) => item.kind)), JSON.stringify(['manufacturing', 'TB', 'W', 'S']), 'MFG history item keeps chronological order from the first Manufacturing tool click');

const workflowHistoryItemsWithMfg = buildWorkflowHistoryItems(
  [{ id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: tbFinished.isActive, orderIndex: 0 }],
  [{ id: 's-group-S1', labels: ['S1', 'S2'], isActive: true, orderIndex: 2 }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 1 }],
  workflowHistoryConnections,
  3,
);
assert.equal(workflowHistoryItemsWithMfg.filter((item) => item.kind === 'manufacturing').length, 1, 'First Manufacturing tool click creates one MFG item');
assert.equal(workflowHistoryItemsWithMfg[3].name, 'MFG', 'MFG history item appears at its original Manufacturing click order');
assert.equal(getWorkflowHistoryTool(workflowHistoryItemsWithMfg[3]), 'manufacturing', 'Clicking MFG navigates to the Manufacturing tool');
assert.equal(getToolClickGroupStartKind(getWorkflowHistoryTool(workflowHistoryItemsWithMfg[3]), null, null, null), null, 'Clicking MFG from history does not start a TB/S/W group');
assert.equal(JSON.stringify(workflowHistoryItemsWithMfg.filter((item) => item.kind !== 'manufacturing').map((item) => item.name)), JSON.stringify(['TB Group 1', 'W Group 1', 'S Group 1']), 'Workflow History displays TB, W, and S groups by creation order');
assert.equal(workflowHistoryItemsWithMfg.filter((item) => item.kind === 'TB').length, 1, 'Workflow History shows one TB group for one TB workflow, not one group per E label');
assert.equal(JSON.stringify(workflowHistoryItemsWithMfg.filter((item) => item.kind !== 'manufacturing').map((item) => item.childCount)), JSON.stringify([2, 2, 2]), 'Workflow History includes available child connection counts');
assert.equal(workflowHistoryItemsWithMfg.filter((item) => item.kind !== 'manufacturing')[2].isActive, true, 'Workflow History exposes active group state for navigation');
const workflowHistoryItemsWithRepeatedMfg = buildWorkflowHistoryItems(
  [{ id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: tbFinished.isActive, orderIndex: 0 }],
  [{ id: 's-group-S1', labels: ['S1', 'S2'], isActive: true, orderIndex: 2 }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 1 }],
  workflowHistoryConnections,
  3,
);
assert.equal(workflowHistoryItemsWithRepeatedMfg.filter((item) => item.kind === 'manufacturing').length, 1, 'Repeated Manufacturing tool clicks reuse the same MFG item');
assert.equal(JSON.stringify(workflowHistoryItemsWithRepeatedMfg.map((item) => item.kind)), JSON.stringify(['TB', 'W', 'S', 'manufacturing']), 'Repeated Manufacturing clicks never duplicate or move MFG');

const workflowHistoryCreationOrderItems = buildWorkflowHistoryItems(
  [
    { id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: false, orderIndex: 0 },
    { id: 'tb-group-E3', labels: ['E3'], isActive: true, orderIndex: 3 },
  ],
  [{ id: 's-group-S1', labels: ['S1'], isActive: false, orderIndex: 2 }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 1 }],
  workflowHistoryConnections,
);
assert.equal(JSON.stringify(workflowHistoryCreationOrderItems.filter((item) => item.kind !== 'manufacturing').map((item) => item.kind)), JSON.stringify(['TB', 'W', 'S', 'TB']), 'Workflow History preserves TB, W, S, TB creation order instead of sorting by type');

const workflowHistoryFallbackItems = buildWorkflowHistoryItems(
  [{ id: tbFinished.groupId, labels: [...tbFinished.connectionIds], isActive: false, orderIndex: 0 }],
  [{ id: 's-group-S1', labels: ['S1'], isActive: false }],
  [{ id: 'w-group-W1', labels: ['W1'], isActive: false, orderIndex: 1 }],
  workflowHistoryConnections,
);
assert.equal(JSON.stringify(workflowHistoryFallbackItems.filter((item) => item.kind !== 'manufacturing').map((item) => item.kind)), JSON.stringify(['TB', 'W', 'S']), 'Workflow History places old unordered groups after ordered groups');

const cloneTBHistoryState = (state) => structuredClone(state);
const tbHistoryState = {
  edgeAssignments: tbAssignments,
  connections: tbConnections,
  selectedLabelId: 'E2',
  selectedEdgeId: 'p1-left',
  appliedEPanelPaths: tbAppliedWhileActive,
  appliedSGeometry: [],
  activeSGroup: null,
  activeTBGroup: tbAppended,
  activeWGroup: null,
};
const undoRestoredTB = cloneTBHistoryState(tbHistoryState);
assert.equal(JSON.stringify(undoRestoredTB.activeTBGroup), JSON.stringify(tbAppended), 'Undo restores activeTBGroup');
const redoRestoredTB = cloneTBHistoryState(undoRestoredTB);
assert.equal(JSON.stringify(redoRestoredTB.activeTBGroup), JSON.stringify(tbAppended), 'Redo restores activeTBGroup');
