import type { EdgeAssignmentBucket, SvgDocumentModel } from '../svgUtils';
import type { ActiveSGroup, ActiveTBGroup, ConnectionMap } from './connectionTypes';
import type { ConstructionOperations, OperationChronology } from './constructionOperations';
import type { ProjectDrawingDocument } from './drawingTypes';
import type { GeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { PanelManagerState } from './panelManagerModel';
import type { ProjectSettings } from './projectSettings';
import type { ActiveWallGroup } from './wallWorkflow';

/** Read-only data at this in-memory boundary, not a native file schema. */
export type CapturedData<T> = { readonly [Key in keyof T]: CapturedData<T[Key]> };

/** Existing BOX authorities, including source state absent from local HistoryState. */
export type BoxProjectData = {
  svgModel: SvgDocumentModel;
  edgeAssignments: Record<string, EdgeAssignmentBucket>;
  connections: ConnectionMap;
  panelManager: PanelManagerState;
  projectSettings: ProjectSettings;
  lastAppliedManufacturingSettings: ProjectSettings | null;
  /** Already selected/applied output and composition marker; never regenerate it. */
  generatedGeometrySnapshot: GeneratedGeometrySnapshot;
  activeSGroup: ActiveSGroup | null;
  completedSGroups?: ActiveSGroup[];
  activeTBGroup: ActiveTBGroup | null;
  completedTBGroups: ActiveTBGroup[];
  activeWallGroup: ActiveWallGroup | null;
  completedWallGroups: ActiveWallGroup[];
  workflowGroupOrder: Record<string, number>;
  dependencyDiagnostics?: ReadonlyArray<{
    code: 'DRAWING_TOPOLOGY_CHANGED' | 'BOX_REGENERATION_FAILED';
    severity: 'error'; sourceId: string; groupId?: string; connectionId?: string;
    panelIds: readonly string[]; edgeIds: readonly string[]; message: string;
  }>;
};

/** Retained for current BOX authoring parity, without promoting selection to content. */
export type BoxRestorationContext = {
  assignmentTargetConnectionId: string | null;
  displayConnectionId: string | null;
  selectedEdgeId: string | null;
};

/** Values supplied together by the current owner; no React setters or UI handles. */
export type BoxStateSource = BoxProjectData & BoxRestorationContext;

export type BoxStateCapture = CapturedData<{
  data: BoxProjectData;
  context: BoxRestorationContext;
}>;

export type DrawingStateCapture = CapturedData<ProjectDrawingDocument>;

export type BoxSources = {
  sketches: Record<string, BoxStateSource>;
  selection?: { id: string };
};

export type ProjectStateSource = {
  boxSources?: BoxSources;
  chronology?: OperationChronology;
  constructionOperations: ConstructionOperations;
  drawingDocument: ProjectDrawingDocument;
  box: BoxStateSource;
};

/** Complete existing editable data, not an execution-history frame or runtime owner. */
export type ProjectStateCapture = Readonly<{
  boxSources?: CapturedData<BoxSources>;
  chronology?: OperationChronology;
  constructionOperations: ConstructionOperations;
  drawingDocument: DrawingStateCapture;
  box: BoxStateCapture;
}>;

// Current domain records are structured-cloneable plain objects/arrays/primitives.
// Clone only at an explicit boundary: their mutable containers cannot safely be shared.
// Freeze the detached graph (including nested arrays), never the caller's live objects.
const captureData = <T>(source: T): CapturedData<T> => {
  const copy = structuredClone(source);
  const visited = new WeakSet<object>();
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  freeze(copy);
  return copy as CapturedData<T>;
};

/** Preserve all Sketches, local IDs, references, metadata and stored solver results. */
export const captureDrawingState = (document: ProjectDrawingDocument): DrawingStateCapture => captureData(document);

/** Detached model data only: no migration, normalization, solving or live publication. */
export const projectDrawingState = (capture: DrawingStateCapture): ProjectDrawingDocument => (
  structuredClone(capture) as ProjectDrawingDocument
);

/** Group existing authority and restoration fields without projecting or cloning their values. */
export const boxStateFields = (source: BoxStateSource) => ({
  data: {
    svgModel: source.svgModel,
    edgeAssignments: source.edgeAssignments,
    connections: source.connections,
    panelManager: source.panelManager,
    projectSettings: source.projectSettings,
    lastAppliedManufacturingSettings: source.lastAppliedManufacturingSettings,
    generatedGeometrySnapshot: source.generatedGeometrySnapshot,
    activeSGroup: source.activeSGroup,
    ...(source.completedSGroups && { completedSGroups: source.completedSGroups }),
    activeTBGroup: source.activeTBGroup,
    completedTBGroups: source.completedTBGroups,
    activeWallGroup: source.activeWallGroup,
    completedWallGroups: source.completedWallGroups,
    workflowGroupOrder: source.workflowGroupOrder,
    ...(source.dependencyDiagnostics && { dependencyDiagnostics: source.dependencyDiagnostics }),
  },
  context: {
    assignmentTargetConnectionId: source.assignmentTargetConnectionId,
    displayConnectionId: source.displayConnectionId,
    selectedEdgeId: source.selectedEdgeId,
  },
});

export const captureBoxState = (source: BoxStateSource): BoxStateCapture => captureData(boxStateFields(source));

/**
 * Project back to owner-facing values. The snapshot is retained whole, including
 * operations/metadata. An eventual App adapter can read its generatedGeometry and
 * metadata.panelCompositionModel (absent means legacy); this helper calls no setters.
 */
export const projectBoxState = (capture: BoxStateCapture): BoxStateSource => (
  structuredClone({ ...capture.data, ...capture.context }) as BoxStateSource
);

export const captureProjectState = (source: ProjectStateSource): ProjectStateCapture => Object.freeze({
  ...(source.chronology && { chronology: captureData(source.chronology) }),
  ...(source.boxSources && { boxSources: captureData(source.boxSources) }),
  constructionOperations: captureData(source.constructionOperations),
  drawingDocument: captureDrawingState(source.drawingDocument),
  box: captureBoxState(source.box),
});

/** Projection returns independent data; lifecycle/atomic React restoration is deferred. */
export const projectProjectState = (capture: ProjectStateCapture): ProjectStateSource => ({
  ...(capture.chronology && { chronology: structuredClone(capture.chronology) }),
  ...(capture.boxSources && { boxSources: structuredClone(capture.boxSources) as BoxSources }),
  constructionOperations: structuredClone(capture.constructionOperations),
  drawingDocument: projectDrawingState(capture.drawingDocument),
  box: projectBoxState(capture.box),
});
