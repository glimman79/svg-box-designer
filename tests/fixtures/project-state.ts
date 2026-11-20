import { createBoxDocumentV1 } from '../../src/app/boxDocument';
import { createDrawingDocumentV2, type DrawingEntity, type DrawingSketchV2 } from '../../src/app/drawingTypes';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { operationFromConnection } from '../../src/app/operationTypes';
import { defaultPanelManagerState } from '../../src/app/panelManagerModel';
import { DEFAULT_PROJECT_SETTINGS } from '../../src/app/projectDefaults';
import { createOrdinaryProfileOffsetTargetId } from '../../src/app/profileOffsetSelection';
import { initializeSketchOperations } from '../../src/app/constructionOperations';
import type { ProjectStateSource } from '../../src/app/projectState';
import { makeEvidenceRectangle } from '../diagnostics/helpers/mixed-evidence-fixture';

export const makeEmptyProjectState = (drawingDocument = createDrawingDocumentV2()): ProjectStateSource => ({
  drawingDocument, constructionOperations: initializeSketchOperations(drawingDocument),
  box: {
    svgModel: createBoxDocumentV1(),
    edgeAssignments: {}, connections: {},
    panelManager: structuredClone(defaultPanelManagerState),
    projectSettings: { ...DEFAULT_PROJECT_SETTINGS, selectedProfileOffsetIds: [] },
    lastAppliedManufacturingSettings: null,
    generatedGeometrySnapshot: createGeneratedGeometrySnapshot({ generatedGeometry: [] }),
    activeSGroup: null, activeTBGroup: null, completedTBGroups: [],
    activeWallGroup: null, completedWallGroups: [], workflowGroupOrder: {},
    assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null,
  },
});

const makeSketch = (id: string): DrawingSketchV2 => ({
  id, name: `Stored ${id}`,
  points: {
    center: { id: 'center', x: 0, y: 0 },
    p1: { id: 'p1', x: 10, y: 0 },
    p2: { id: 'p2', x: 0, y: 10 },
    // Equal coordinates are not equal topological identity.
    independent: { id: 'independent', x: 0, y: 0 },
  },
  // Drawing's existing intersection type exposes historical Line-only lookups.
  entities: ({
    line: { id: 'line', type: 'line', startPointId: 'center', endPointId: 'p1' },
    circle: { id: 'circle', type: 'circle', centerPointId: 'center', radius: 10 },
    arc: { id: 'arc', type: 'arc', centerPointId: 'center', radius: 10,
      startPointId: 'p1', endPointId: 'p2', orientation: 'CW' },
  } satisfies Record<string, DrawingEntity>) as unknown as DrawingSketchV2['entities'],
  entityOrder: ['arc', 'line', 'circle'],
  dimensions: {
    diameter: { id: 'diameter', kind: 'CIRCULAR_SIZE', mode: 'diameter', role: 'driving', value: 20,
      references: [{ kind: 'entity', entityId: 'circle' }], placement: { kind: 'radial', anchor: { x: 14.125, y: 2 } } },
    radius: { id: 'radius', kind: 'CIRCULAR_SIZE', mode: 'radius', role: 'reference', value: 10,
      references: [{ kind: 'entity', entityId: 'arc' }], placement: { kind: 'radial', anchor: { x: 13, y: 14 } } },
    length: { id: 'length', kind: 'ALIGNED_DISTANCE', role: 'driving', value: 10,
      references: [{ kind: 'point', entityId: 'line', point: 'start' }, { kind: 'sketchPoint', pointId: 'p1' }],
      placement: { kind: 'linear', offset: -3.125 } },
  },
  dimensionOrder: ['radius', 'length', 'diameter'],
  geometricConstraints: {
    axis: { id: 'axis', kind: 'HORIZONTAL', references: [{ kind: 'entity', entityId: 'line' }] },
    curve: { id: 'curve', kind: 'COINCIDENT', variant: 'point-curve',
      references: [{ kind: 'sketchPoint', pointId: 'p1' }, { kind: 'entity', entityId: 'circle' }] },
  },
  geometricConstraintOrder: ['curve', 'axis'],
});

/** Real TB/S mixed composition plus native W output, prepared before capture. */
export const makePopulatedProjectState = (): ProjectStateSource => {
  const source = makeEmptyProjectState({
    schemaVersion: 2, unit: 'mm', activeSketchId: 'alpha', sketchOrder: ['beta', 'alpha'],
    sketches: { alpha: makeSketch('alpha'), beta: makeSketch('beta') },
  });
  const rectangles = ['panel-a', 'panel-b', 'panel-c', 'panel-d'].map((id, i) => makeEvidenceRectangle(id, i * 220, 20, 120, 80));
  const box = source.box;
  const innerMarkup = '<!-- original source -->' + rectangles.map(({ panel }) =>
    `<polygon id="${panel.id}" points="${panel.outerContour.map((p) => `${p.x},${p.y}`).join(' ')}"/>`).join('');
  box.svgModel = {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" viewBox="0 0 1000 150">${innerMarkup}</svg>`,
    innerMarkup,
    rootAttributes: { width: '1000mm', height: null, viewBox: '0 0 1000 150' },
    viewBox: '0 0 1000 150', width: 1000, height: 150,
    edges: rectangles.flatMap((r) => r.edges), panels: rectangles.map((r) => r.panel),
    importDiagnostics: {
      toleranceMm: .01, touchingLoopsFound: 0, overlappingLoopsFound: 0, closedContoursFound: 4,
      looseEdgesFound: 0, openChainsFound: 0, endpointGaps: [], possibleRepairCandidates: 0,
      unrepairedOpenContours: 0, closedLoopsFound: 4, branchingChainsFound: 0,
      isolatedSegmentsFound: 0, selfIntersectionsFound: 0, chains: [], topologyPanelsCreated: 4,
      topology: { toleranceMm: .01, segments: [], nodes: [], components: [], chains: [] },
    },
  };
  box.panelManager = { defaultThicknessMm: 3.2, isApplied: true, isDirty: false,
    panels: Object.fromEntries(rectangles.map((r, i) => [r.panel.id, { panelId: r.panel.id, thicknessMm: 3.2 + i / 10 }])) };
  box.connections = {
    TB1: { id: 'TB1', prefix: 'TB', properties: { fingerWidthMm: 11.3, isFingerWidthManual: true } },
    S1: { id: 'S1', prefix: 'S', properties: { slotLengthMm: 14.2, isSlotLengthManual: true, slotOffsetMm: 0, kerfMm: .15 } },
    W1: { id: 'W1', prefix: 'W', properties: { fingerWidthMm: 10, isFingerWidthManual: false } },
  };
  box.edgeAssignments = {
    'panel-a-edge-0': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
    'panel-b-edge-2': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } },
    'panel-a-edge-1': { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
    'panel-b-edge-3': { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] },
    'panel-c-edge-0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' } },
    'panel-d-edge-0': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' } },
  };
  const raw = [
    ...buildGeneratedTBGeometryItems(box.svgModel, box.edgeAssignments, box.connections, box.panelManager),
    ...buildGeneratedSGeometryItems(box.svgModel, box.edgeAssignments, box.connections, box.panelManager),
    ...buildGeneratedWGeometryItems(box.svgModel, box.edgeAssignments, box.connections, box.panelManager),
  ];
  const authority = selectGeneratedGeometryAuthority(box.svgModel, raw, 'mixed');
  if (!authority.ok) throw new Error(`Fixture authority failed: ${JSON.stringify(authority.blockingDecisions)}`);
  const operation = operationFromConnection(box.connections.TB1,
    { connectionId: 'TB1', panelIds: ['panel-a', 'panel-b'], edgeIds: ['panel-a-edge-0', 'panel-b-edge-2'] }, ['A', 'B']);
  box.generatedGeometrySnapshot = createGeneratedGeometrySnapshot({
    generatedGeometry: [...authority.generatedGeometry], panelCompositionModel: authority.panelCompositionModel,
    operations: operation ? [operation] : [], revision: 7, importedGeometryRevision: 2, assignmentRevision: 4, operationRevision: 6,
  });
  box.lastAppliedManufacturingSettings = { ...box.projectSettings, selectedProfileOffsetIds: [] };
  box.projectSettings = { kerfMm: .17, slotClearanceMm: .08, profileOffsetMm: -.025, tapClearanceMm: .04,
    selectedProfileOffsetIds: [createOrdinaryProfileOffsetTargetId('panel-a', 'panel-a-edge-3')] };
  box.activeTBGroup = { groupId: 'tb-current', connectionIds: ['TB1'], isActive: true };
  box.completedTBGroups = [{ groupId: 'tb-prior', connectionIds: [], isActive: false }];
  box.activeSGroup = { groupId: 's-current', connectionIds: ['S1'], isActive: true };
  box.activeWallGroup = { groupId: 'w-current', connectionIds: ['W1'], isActive: true };
  box.completedWallGroups = [{ groupId: 'w-prior', connectionIds: [], isActive: false }];
  box.workflowGroupOrder = { 'tb-prior': 0, 'w-prior': 1, 'tb-current': 2, 'w-current': 3, 's-current': 4, manufacturing: 5 };
  box.assignmentTargetConnectionId = 'S1';
  box.displayConnectionId = 'W1';
  box.selectedEdgeId = 'panel-a-edge-1';
  // Model a pending edit after Apply; accepted output must remain exactly as stored.
  box.panelManager.isDirty = true;
  if (box.connections.TB1.prefix === 'TB') box.connections.TB1.properties.fingerWidthMm = 12.75;
  return structuredClone(source);
};
