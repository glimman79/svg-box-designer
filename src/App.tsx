import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import { BoxSketchLayer, previewContours, sourceHits } from './app/BoxSketchLayer';
import { appliedGeometryInputs, getBoxScope, hasImportedSource, IMPORTED_SOURCE, isSourceApproved, sourceStatus, validateDrawingApproval } from './app/boxSources';
import { flushSync } from 'react-dom';
import { exportLabeledSvg, formatImportDiagnosticMessage, getEdgeAssignmentDisplayLabels, parseSvgDocument } from './svgUtils';
import { layoutPanelLabels } from './app/labelLayout';
import { formatFixedNumericValue, parseCompleteNumericDraft } from './app/numericDraft';
import { getBucketEdgeAssignment, getBucketSlotAssignments, toEdgeAssignmentBucket } from './app/assignmentBuckets';
import { exportManufacturingGeometrySvg } from './app/exportFinalGeometrySvg';
import { buildGeneratedSGeometryItems, recalculateAutomaticSSlotLengths, resolveSSlotLengthMm, resolveSThickness } from './app/sGeometry';
import { getConnectionViewModel, resolveAssignedTBOrSConnectionIdForEdge } from './app/connectionViewModel';
import { DEFAULT_PROJECT_SETTINGS } from './app/projectDefaults';
import type { ProjectSettings } from './app/projectSettings';
import { normalizeProjectSettings } from './app/projectSettings';
import type { GeneratedProfileId } from './app/generatedProfiles';
import type { ProfileOffsetSelectionTargetId } from './app/profileOffsetSelection';
import { createGeneratedProfileOffsetTargetId, createOrdinaryProfileOffsetTargetId } from './app/profileOffsetSelection';
import { buildFinalGeometry as buildNativeFinalGeometry } from './app/finalGeometry';
import { createGeneratedGeometrySnapshot, retainEquivalentSnapshot } from './app/generatedGeometrySnapshot';
import { selectGeneratedGeometryAuthority } from './app/generatedGeometryAuthority';
import type { GeneratedGeometryAuthoritySelection } from './app/generatedGeometryAuthority';
import { downloadGeometryRuntimeDebugState, geometryContributorRegistryIdentity, probeGeometryDownstreamExceptions } from './app/geometryRuntimeDebug';
import type { GeometryRuntimeDebugCapture } from './app/geometryRuntimeDebug';
import { assembleGeneratedGeometryDiagnostics } from './app/generatedGeometryAssembly';
import { resolvePanelCompositionAuthorityMode } from './app/panelCompositionAuthorityMode';
import { deriveGeneratedCanvasEdgeRelationshipState, sourceEdgeRelationshipKey } from './app/canvasEdgeRelationships';
import type { PanelCompositionAuthorityMode } from './app/generatedGeometryAuthority';
import type { GeneratedGeometryItem, GeneratedGeometrySnapshot } from './app/generatedGeometrySnapshot';
import { validateGeometryAuthoring } from './app/authoringRelationships';
import { buildGeneratedWGeometryItems } from './app/wallGeometry';
import { shouldShowFingerJointTabControl } from './app/tabSizeControl';
import { getWallAssignments, resolveTBRoleForPanel, validateWallAuthoringForApply } from './app/wallAuthoring';
import { finishWallGroupWithTrailingCleanup, startWallGroupWorkflow } from './app/wallWorkflow';
import { finishSGroupWithTrailingCleanup, getDefaultSlotRole, manualAddSWorkflow, startSGroupWorkflow } from './app/sWorkflow';
import { buildTBDisplayLabelAliasMap, finishTBGroupWithTrailingCleanup, getSharedTBEdgeProperties, startTBGroupWorkflow } from './app/tbWorkflow';
import { applyTabsToContour, buildInsetPanelContour, buildPanelGeometry, buildTabSegmentPlansByConnectionId, getPanelEdgeOperations, buildGeneratedTBGeometryItems, recalculateAutomaticTBFingerWidths, resolveTBThickness } from './app/tbGeometry';
import { buildPanelContainmentTree, createPanelManagerStateFromModel, DEFAULT_PANEL_THICKNESS_MM, validatePanelManagerState } from './app/panelManagerModel';
import type { PanelEdgeOperation, TabSegmentPlan } from './app/tbGeometry';
import type { PanelContour } from './app/sharedGeometry';
import type { PanelGeometryBuildResult } from './app/sharedPanelGeometry';
import type { PanelManagerState, PanelTreeHoleNode, PanelTreePanelNode } from './app/panelManagerModel';
import { createTabSegmentPlan, pointsToClosedPathD, projectPointDistanceOnSide } from './app/sharedGeometry';
import { getContourEdgePoints, validateClosedPanel } from './app/sharedPanelGeometry';
import type { EdgeAssignmentBucket, EdgeRole, Point, SlotRole, SourceBounds, SvgDocumentModel, SvgEdge } from './svgUtils';
import { DrawingWorkspace, initialDrawingViewBox, type DrawingInteractionBoundary } from './app/DrawingWorkspace';
import { useCadWheelCapture } from './app/useCadWheelCapture';
import { connectionGroups, constructionGroupField, type GroupTool } from './app/connectionGroups';
import { useCadEscapeToolExit, useCadPanGesture } from './app/cadInteraction';
import { projectDataEqual } from './app/projectDataEqual';
import { createDrawingTransactionAdapter } from './app/drawingTransactionAdapter';
import { assignConstructionEdge, changeConstructionRole, defaultConnectionProperties, editConstructionProperties, removeConstructionAssignment, type ConstructionPropertyEdit } from './app/boxConstruction';
export { defaultConnectionProperties } from './app/boxConstruction';
import { createBoxTransactionAdapter, type BoxTransactionResult } from './app/boxTransactionAdapter';
import type { BoxStateSource } from './app/projectState';
import { createGlobalProjectHistory, type GlobalProjectHistory } from './app/globalProjectHistory';
import { useSvgImportLock } from './app/useSvgImportLock';
import { ClearProjectDialog } from './app/ClearProjectDialog';
import { WorkspaceTopBar } from './app/WorkspaceTopBar';
import { WorkspaceShell } from './app/WorkspaceShell';
import { readSketchDefinitions, type BoxChronologyEntry } from './app/constructionOperations';
import type { SupportedWorkspace } from './app/drawingTypes';
import { SharedHistoryRegion } from './app/SharedHistoryRegion';
import { evaluateAppliedGeometry } from './app/appliedGeometry';
import type { ActiveSGroup, ActiveTBGroup, ConnectionDefinition, ConnectionMap, ConnectionPropertiesByPrefix, TBConnectionDefinition, TBConnectionProperties } from './app/connectionTypes';
import { getNextConnectionLabel, parseConnectionLabel } from './app/connectionLabels';
export { createTabSegmentPlan, pointsToClosedPathD } from './app/sharedGeometry';
export { edgeMatchesContourSide, getContourEdgePoints, getTabSegmentsForRole, validateClosedPanel } from './app/sharedPanelGeometry';
export type { PanelValidationResult } from './app/sharedPanelGeometry';
export { exportFinalGeometrySvg, exportManufacturingGeometrySvg } from './app/exportFinalGeometrySvg';
export { getConnectionViewModel, getSConnectionViewModel, getTBConnectionViewModel, resolveAssignedTBOrSConnectionIdForEdge } from './app/connectionViewModel';
export { buildFinalGeometry } from './app/finalGeometry';
export { createGeneratedGeometrySnapshot } from './app/generatedGeometrySnapshot';
export { buildGeneratedSGeometryItems, recalculateAutomaticSSlotLengths, resolveSSlotLengthMm, resolveSThickness } from './app/sGeometry';
export { buildPanelContainmentTree, createPanelManagerStateFromModel, defaultPanelManagerState, validatePanelManagerState } from './app/panelManagerModel';
export { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, createCopiedSConnection, createStandaloneSConnection, finishSGroupWithTrailingCleanup, finishSGroupWorkflow, getDefaultSlotRole, isCompleteSConnection, manualAddSWorkflow, maybeAutoCreateNextSInGroup, startSGroupWorkflow } from './app/sWorkflow';
export { appendAutoCreatedTBToTBGroup, buildTBDisplayLabelAliasMap, buildTBCanvasLabelAliasMap, finishTBGroupWithTrailingCleanup, finishTBGroupWorkflow, getNextTBLabel, getTBGroupActionNumber, startTBGroupWorkflow } from './app/tbWorkflow';
export { classifyContoursByContainment, classifyFinalContours, classifyImportedPanelContours } from './app/contourClassification';
export { applyProfileOffset, applyProfileOffsetStage, applyTapClearance, applySlotClearance, applySlotClearanceStage, buildKerfCompensatedPreviewFromFinalContours, cleanContourPointsForOffset, compensateClassifiedContours, compensateContourPoints, getKerfCompensationMm, pathDToClosedContour, processManufacturingGeometry } from './app/manufacturingCompensation';
export { createManufacturingGeometry } from './app/manufacturingGeometry';
export { normalizeProjectSettings } from './app/projectSettings';
export { createGeneratedProfileId } from './app/generatedProfiles';
export type { GeneratedProfileGroup, GeneratedProfileId } from './app/generatedProfiles';
export { createGeneratedProfileOffsetTargetId, createOrdinaryProfileOffsetTargetId, parseProfileOffsetSelectionTarget } from './app/profileOffsetSelection';
export type { ProfileOffsetSelectionTarget, ProfileOffsetSelectionTargetId } from './app/profileOffsetSelection';
export { createGeneratedTapId } from './app/generatedTaps';
export type { GeneratedTapGroup, GeneratedTapId } from './app/generatedTaps';
export { getManufacturingPipelineForGeometryType } from './app/manufacturingMetadata';
export { getManufacturingPolicy } from './app/manufacturingPolicy';
export { NoMovementStrategy, OffsetStrategy, noMovementStrategy, offsetStrategy } from './app/compensationStrategies';

const requestedPanelCompositionAuthorityMode = resolvePanelCompositionAuthorityMode(
  import.meta.env.VITE_PANEL_COMPOSITION_AUTHORITY_MODE,
);
const reportAuthorityDownstreamDiagnostics = (authority: GeneratedGeometryAuthoritySelection) => {
  if (!import.meta.env.DEV || !authority.downstreamDiagnostics.length) return;
  console.group('[GeometryAuthority] mixed project-atomic downstream diagnostics');
  authority.downstreamDiagnostics.forEach((record) => {
    const method = record.firstFailure ? console.error : console.info;
    method('[GeometryAuthority]', record.panelId, record);
    record.clearanceProjectionTraces.forEach((trace) => console.error(
      '[GeometryAuthority] CLEARANCE_PROFILE_MISSING projection lifecycle', trace,
    ));
  });
  console.table(authority.downstreamDiagnostics.map((record) => ({ panelId: record.panelId,
    status: record.assemblyStatus, firstFailure: record.firstFailure ?? 'NONE',
    finalGeometryDiagnostics: record.finalGeometry.diagnosticCount,
    manufacturingContours: record.manufacturing.contourCount })));
  console.groupEnd();
};
const formatAuthorityBlockingDecision = (authority: GeneratedGeometryAuthoritySelection,
  decision: GeneratedGeometryAuthoritySelection['blockingDecisions'][number]) => {
  const detail = import.meta.env.DEV
    ? authority.downstreamDiagnostics.find((entry) => entry.panelId === decision.panelId)?.firstFailure : null;
  return `${decision.panelId}: ${decision.reason}${detail ? ` firstFailure=${detail}` : ''}`;
};
export { geometryServices } from './app/geometryServices';
export { collectSourceEdgeAuthoringClaims, deriveCanvasEdgeRelationshipState, deriveGeneratedCanvasEdgeRelationshipState, sourceEdgeRelationshipKey } from './app/canvasEdgeRelationships';
export type { CanvasEdgeRelationshipState } from './app/canvasEdgeRelationships';
export type { GeometryServices, ProfileDirection, ProfileOrientation } from './app/geometryServices';
export type { ClassifiedContour, ClassifiedContourSource, ContourKind } from './app/contourClassification';
export type { FinalGeometryType, ManufacturingClassification } from './app/finalGeometryTypes';
export type { ManufacturingGeometry } from './app/manufacturingGeometry';
export type { GeneratedGeometryItem, GeneratedGeometrySnapshot, GeneratedGeometrySnapshotMetadata } from './app/generatedGeometrySnapshot';
export type { GeometryOperation, OperationSourceReference, OperationValidation, SOperation, TBOperation } from './app/operationTypes';
export type { ManufacturingMetadata } from './app/manufacturingMetadata';
export type { ManufacturingCompensationStrategy, ManufacturingPolicy } from './app/manufacturingPolicy';
export type { CompensationStrategy, CompensationStrategyContext } from './app/compensationStrategies';
export { buildGeneratedWGeometryItems } from './app/wallGeometry';
export { applyTabsToContour, buildGeneratedTBGeometryItems, buildInsetPanelContour, buildPanelGeometry, buildTabSegmentPlansByConnectionId, getPanelEdgeOperations, getPanelThicknessForEdge, recalculateAutomaticTBFingerWidths, resolveTBThickness } from './app/tbGeometry';
export type { PanelEdgeOperation, TabSegmentPlan } from './app/tbGeometry';
export { getPanelThickness } from './app/panelThickness';
export type { PanelThicknessMetadata, PanelThicknessState } from './app/panelThickness';
export type { PanelContour } from './app/sharedGeometry';
export type { PanelGeometryBuildResult } from './app/sharedPanelGeometry';
export type { PanelManagerState } from './app/panelManagerModel';
export type { ActiveSGroup, ActiveTBGroup, ConnectionDefinition, ConnectionMap, TBConnectionDefinition, TBConnectionProperties } from './app/connectionTypes';

type LabelPrefix = 'TB' | 'W' | 'S' | 'C' | 'P';


type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

export type ActiveTool = 'select' | 'PM' | 'TB' | 'W' | 'S' | 'J' | 'P' | 'manufacturing';

export const getToolClickGroupStartKind = (
  tool: ActiveTool,
  activeTBGroup: ActiveTBGroup | null,
  activeSGroup: ActiveSGroup | null,
): 'TB' | 'S' | null => {
  if (tool === 'TB') {
    return activeTBGroup?.isActive ? null : 'TB';
  }

  if (tool === 'S') {
    return activeSGroup?.isActive ? null : 'S';
  }

  return null;
};

export const defaultProjectSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS, selectedProfileOffsetIds: [] };

export const haveProjectSettingsChanged = (currentSettings: ProjectSettings, appliedSettings: ProjectSettings | null): boolean => {
  const baseline = appliedSettings ?? defaultProjectSettings;
  return currentSettings.kerfMm !== baseline.kerfMm
    || (currentSettings.profileOffsetMm ?? defaultProjectSettings.profileOffsetMm) !== (baseline.profileOffsetMm ?? defaultProjectSettings.profileOffsetMm)
    || currentSettings.slotClearanceMm !== baseline.slotClearanceMm
    || (currentSettings.tapClearanceMm ?? defaultProjectSettings.tapClearanceMm) !== (baseline.tapClearanceMm ?? defaultProjectSettings.tapClearanceMm)
    || currentSettings.selectedProfileOffsetIds.length !== baseline.selectedProfileOffsetIds.length
    || currentSettings.selectedProfileOffsetIds.some((id, index) => id !== baseline.selectedProfileOffsetIds[index]);
};

const recalculateBoxConnections = (box: BoxStateSource, panelManager: PanelManagerState) => {
  const { svgModel, edgeAssignments, connections } = box;
  const slots = recalculateAutomaticSSlotLengths(svgModel, edgeAssignments, connections, panelManager);
  return recalculateAutomaticTBFingerWidths(svgModel, edgeAssignments, slots, panelManager);
};

function inspectorGroups(box: BoxStateSource, tool: GroupTool) {
  const groups = connectionGroups(box, tool).map(group => ({
    id: group.groupId, labels: group.connectionIds.filter(id => box.connections[id]?.prefix === tool), isActive: group.isActive,
  })).filter(group => group.labels.length);
  const members = new Set(groups.flatMap(group => group.labels));
  for (const id of Object.keys(box.connections)) {
    if (box.connections[id].prefix === tool && !members.has(id)) groups.push({ id, labels: [id], isActive: false });
  }
  return groups.sort((a, b) => getLabelNumber(a.labels[0]) - getLabelNumber(b.labels[0]));
}

const getNextWorkflowGroupOrderIndex = (workflowGroupOrder: Record<string, number>) => {
  const orderIndexes = Object.values(workflowGroupOrder).filter((value) => Number.isFinite(value));
  return orderIndexes.length > 0 ? Math.max(...orderIndexes) + 1 : 0;
};

const getPanelDisplayName = (panelId: string): string => {
  const panelNumber = panelId.match(/^panel-(\d+)$/)?.[1];
  return panelNumber ? `P${panelNumber}` : panelId;
};

const getPanelPathD = (panel: SvgDocumentModel['panels'][number]): string => {
  if (panel.contour.length > 0) {
    return pointsToClosedPathD(panel.contour);
  }

  const { minX, maxX, minY, maxY } = panel.bounds;
  return `M ${minX} ${minY} L ${maxX} ${minY} L ${maxX} ${maxY} L ${minX} ${maxY} Z`;
};

type NumericFieldProps = {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: number) => void;
  onFocus?: () => void;
};

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};
type CanvasViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const labelGroups: LabelGroup[] = [
  { prefix: 'TB', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'W', name: 'Wall connections', description: 'Wall A/B source-edge authoring' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern connections', description: 'Reusable pattern connection IDs' },
];

const getLabelPrefix = (label: string) => parseConnectionLabel(label)?.prefix;

const getLabelNumber = (label: string) => parseConnectionLabel(label)?.number ?? Number.NaN;

const getSGroupDisplayName = (groupIndex: number) => `S Group ${groupIndex + 1}`;

const getSGroupActionNumber = (connections: ConnectionMap, activeSGroup: ActiveSGroup | null) => {
  if (activeSGroup?.isActive) {
    const firstActiveNumber = getLabelNumber(activeSGroup.connectionIds[0] ?? 'S1');
    const previousSLabels = Object.keys(connections).filter((label) => getLabelPrefix(label) === 'S' && getLabelNumber(label) < firstActiveNumber);

    return previousSLabels.length > 0 ? 2 : 1;
  }

  return Object.keys(connections).some((label) => getLabelPrefix(label) === 'S') ? 2 : 1;
};

const getNextLabel = (prefix: LabelPrefix, labels: string[]) => getNextConnectionLabel(prefix, labels);

const minZoom = 0.1;
const maxZoom = 20;
const buttonZoomFactor = 1.25;
const wheelZoomSensitivity = 0.0015;
const annotationFontSizePx = 7;
const annotationPaddingXPx = 1.25;
const annotationPaddingYPx = 0.5;
const annotationEdgeOffsetPx = 3;

const parseViewBox = (viewBox: string): CanvasViewBox => {
  const [x, y, width, height] = viewBox.split(/[\s,]+/).map(Number);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 600,
  };
};

const formatViewBox = ({ x, y, width, height }: CanvasViewBox) => `${x} ${y} ${width} ${height}`;

const zoomViewBox = (
  viewBox: CanvasViewBox,
  factor: number,
  center: { x: number; y: number },
  originalViewBox: CanvasViewBox,
): CanvasViewBox => {
  const currentZoom = originalViewBox.width / viewBox.width;
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom * factor));
  const clampedFactor = nextZoom / currentZoom;
  const nextWidth = viewBox.width / clampedFactor;
  const nextHeight = viewBox.height / clampedFactor;
  const centerXRatio = (center.x - viewBox.x) / viewBox.width;
  const centerYRatio = (center.y - viewBox.y) / viewBox.height;

  return {
    x: center.x - nextWidth * centerXRatio,
    y: center.y - nextHeight * centerYRatio,
    width: nextWidth,
    height: nextHeight,
  };
};
const getAssignedConnectionId = (assignment: EdgeAssignmentBucket | undefined) => {
  const edgeAssignment = getBucketEdgeAssignment(assignment);
  const slotAssignment = getBucketSlotAssignments(assignment)[0];
  return edgeAssignment && slotAssignment
    ? `${edgeAssignment.connectionId}, ${slotAssignment.connectionId}`
    : edgeAssignment?.connectionId ?? slotAssignment?.connectionId;
};

const formatCalculatedMm = (value: number | null | undefined) => (Number.isFinite(value) ? `${Number((value as number).toFixed(2)).toString()} mm` : 'Unknown');
const cloneDefaultProperties = <P extends LabelPrefix>(prefix: P): ConnectionPropertiesByPrefix[P] => ({
  ...defaultConnectionProperties[prefix],
});

const createConnectionDefinition = (
  id: string,
  prefix: LabelPrefix,
  edgeProperties?: TBConnectionProperties,
): ConnectionDefinition => {
  if (prefix === 'TB') {
    return { id, prefix, properties: edgeProperties ? { ...edgeProperties } : cloneDefaultProperties(prefix) };
  }

  if (prefix === 'S') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'W') return { id, prefix, properties: edgeProperties ? { ...edgeProperties } : cloneDefaultProperties(prefix) };


  if (prefix === 'C') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  return { id, prefix, properties: cloneDefaultProperties(prefix) };
};

const NumericField = ({ id, label, value, min, step = 0.1, disabled = false, placeholder, onChange, onFocus }: NumericFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <input
      id={id}
      type="number"
      min={min}
      step={step}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
    />
  </label>
);

const FixedPrecisionNumericField = ({ value, precision = 2, ...props }: NumericFieldProps & { precision?: number }) => {
  const formatValue = (numericValue: number | null) => formatFixedNumericValue(numericValue, precision);
  const [displayValue, setDisplayValue] = useState(formatValue(value));
  const editingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDisplayValue(formatValue(value));
  }, [precision, value]);

  const commitDraft = () => {
    editingRef.current = false;
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDisplayValue(formatValue(value));
      return;
    }

    const parsed = parseCompleteNumericDraft(displayValue, props.min);
    if (parsed !== null) {
      props.onChange(parsed);
      setDisplayValue(parsed.toFixed(precision));
    } else {
      setDisplayValue(formatValue(value));
    }
  };

  return (
    <label className="property-field" htmlFor={props.id}>
      <span>{props.label}</span>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        min={props.min}
        step={props.step ?? 0.01}
        value={displayValue}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onFocus={(event) => {
          editingRef.current = true;
          cancelledRef.current = false;
          props.onFocus?.();
        }}
        onBlur={commitDraft}
        onChange={(event) => setDisplayValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelledRef.current = true;
            setDisplayValue(formatValue(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
};

const CanvasAnnotation = ({ label, x, y, width, height, scale, className = '', leaderTo }: { label: string; x: number; y: number; width: number; height: number; scale: number; className?: string; leaderTo?: Point }) => (
  <g className={`canvas-annotation edge-label${className ? ` ${className}` : ''}`}>
    {leaderTo ? <line className="annotation-leader" x1={leaderTo.x} y1={leaderTo.y} x2={x} y2={y} /> : null}
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect className="edge-label-background" x={-width / 2} y={-height / 2} width={width} height={height} rx={2} />
      <text className="edge-label-text" textAnchor="middle" dominantBaseline="middle">
        {label.split('\n').map((displayLabel, index, allLabels) => (
          <tspan key={`${displayLabel}-${index}`} x={0} dy={index === 0 ? `${-0.5 * (allLabels.length - 1)}em` : '1em'}>
            {displayLabel}
          </tspan>
        ))}
      </text>
    </g>
  </g>
);

const SelectField = ({ id, label, value, options, onChange }: SelectFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option === 'A' ? 'A' : option === 'B' ? 'B' : option}
        </option>
      ))}
    </select>
  </label>
);

function App() {
  const [projectOwner] = useState(() => createGlobalProjectHistory(undefined, requestedPanelCompositionAuthorityMode));
  const position = useSyncExternalStore(projectOwner.subscribe,
    projectOwner.getPublication, projectOwner.getPublication);
  return <ProjectWorkspace key={position.session.startRevision} projectOwner={projectOwner} position={position} />;
}

// Project-scoped tools, editors, viewports and asynchronous UI handles share this lifetime.
function ProjectWorkspace({ projectOwner, position }: {
  projectOwner: GlobalProjectHistory;
  position: ReturnType<GlobalProjectHistory['getPublication']>;
}) {
  const importLock = useSvgImportLock(projectOwner);
  const { project, history, activeWorkspace, editingSketchId, epoch: renderEpoch, session } = position;
  const drawingTransactions = useMemo(() => createDrawingTransactionAdapter(projectOwner), [projectOwner, renderEpoch]);
  const { drawingDocument, constructionOperations, boxSources } = project;
  const { box, id: sourceId, working } = getBoxScope(project);
  const sourceName = project.drawingDocument.sketches[box.svgModel.drawingSource?.sketchId ?? '']?.name ?? 'Imported SVG';
  const sketchDefinitions = useMemo(() => readSketchDefinitions({ drawingDocument, constructionOperations }),
    [drawingDocument, constructionOperations]);
  const boxTransactions = useMemo(() => createBoxTransactionAdapter(projectOwner, renderEpoch), [projectOwner, renderEpoch]);
  const drawingInteraction = useRef<DrawingInteractionBoundary | null>(null);
  const [pendingProfileSegment, setPendingProfileSegment] = useState(false);
  const [hoverSources, setHoverSources] = useState<string[]>([]);
  const [sourceChoices, setSourceChoices] = useState<string[]>([]);
  const cameraInitialized = useRef(false);
  const [drawingViewBox, setDrawingViewBox] = useState(initialDrawingViewBox);
  const [drawingConstraintsPanelOpen, setDrawingConstraintsPanelOpen] = useState(false);
  const [drawingToolsHost, setDrawingToolsHost] = useState<HTMLDivElement | null>(null);
  const { svgModel, edgeAssignments, connections, projectSettings, lastAppliedManufacturingSettings,
    assignmentTargetConnectionId, displayConnectionId, selectedEdgeId, activeSGroup, activeTBGroup,
    activeWallGroup, panelManager,
    generatedGeometrySnapshot } = box;
  const needsGeometryApply = panelManager.needsGeometryApply === true;
  const generatedGeometryItems = needsGeometryApply ? [] : generatedGeometrySnapshot.generatedGeometry;
  // Debug evidence expires with its source frame, even when the user never applies again.
  const [debugCaptures] = useState(() => new WeakMap<BoxStateSource, GeometryRuntimeDebugCapture>());
  const geometryRuntimeDebugCaptureRef = useRef<WeakRef<BoxStateSource> | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const pointerEpoch = useRef(renderEpoch);
  const [canvasViewBox, setCanvasViewBox] = useState<CanvasViewBox>(() => parseViewBox(svgModel.viewBox));
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 1, height: 1 });
  const [expandedSGroups, setExpandedSGroups] = useState<Record<string, boolean>>({});
  const [expandedTBGroups, setExpandedTBGroups] = useState<Record<string, boolean>>({});
  const [inspectedEntryId, setInspectedEntryId] = useState<string | null>(null);
  const [revealConnection, setRevealConnection] = useState<string | null>(null);
  const [requestedTool, setActiveTool] = useState<ActiveTool>('select');
  const activeTool = working || requestedTool === 'PM' ? requestedTool : 'select';
  const [isPanelManagerModalOpen, setIsPanelManagerModalOpen] = useState(false);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activeHoleId, setActiveHoleId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const resumeProfile = useRef<(() => void) | undefined>(undefined);
  const [isProfileOffsetProfileSelectionActive, setIsProfileOffsetProfileSelectionActive] = useState(false);
  const [hoveredProfileOffsetProfileId, setHoveredProfileOffsetProfileId] = useState<ProfileOffsetSelectionTargetId | null>(null);

  const availableLabels = useMemo(() => Object.keys(connections), [connections]);
  const selectedLabelId = displayConnectionId;
  const selectedConnection = displayConnectionId ? connections[displayConnectionId] ?? null : null;
  const selectConnectionForDisplayAndAssignment = (connectionId: string | null) => {
    projectOwner.setBoxContext({ assignmentTargetConnectionId: connectionId, displayConnectionId: connectionId });
  };
  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debugWindow = window as typeof window & { __exportGeometryDebugState?: () => string | null };
    debugWindow.__exportGeometryDebugState = () => {
      const key = geometryRuntimeDebugCaptureRef.current?.deref();
      const capture = key && debugCaptures.get(key);
      return capture ? downloadGeometryRuntimeDebugState(capture) : null;
    };
    return () => { delete debugWindow.__exportGeometryDebugState; };
  }, []);

  useLayoutEffect(() => {
    if (activeWorkspace !== 'construction') return;
    const updateCanvasViewportSize = () => {
      const svgElement = svgRef.current;
      const fallbackViewBox = parseViewBox(svgModel.viewBox);
      const nextSize = getCanvasViewportSize(fallbackViewBox);
      setCanvasViewportSize((currentSize) => (
        Math.abs(currentSize.width - nextSize.width) < 0.5 && Math.abs(currentSize.height - nextSize.height) < 0.5
          ? currentSize
          : nextSize
      ));
    };

    updateCanvasViewportSize();
    const svgElement = svgRef.current;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateCanvasViewportSize);
    if (canvasFrameRef.current) resizeObserver?.observe(canvasFrameRef.current);
    if (svgElement) resizeObserver?.observe(svgElement);
    window.addEventListener('resize', updateCanvasViewportSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateCanvasViewportSize);
    };
  }, [activeWorkspace, svgModel.viewBox]);

  // Legacy recalculateAutomaticSSlotLengths/TBFingerWidths are identity helpers.
  // Automatic sizes derive from Panel Manager in domain readers/generators;
  // no effect writes a second project publication after a completed update.
  const labelCounts = useMemo(() => {
    return availableLabels.reduce<Record<string, number>>((counts, label) => {
      counts[label] = Object.values(edgeAssignments).reduce((count, assignment) => (
        count
        + (getBucketEdgeAssignment(assignment)?.connectionId === label ? 1 : 0)
        + getBucketSlotAssignments(assignment).filter((slotAssignment) => slotAssignment.connectionId === label).length
      ), 0);
      return counts;
    }, {});
  }, [availableLabels, edgeAssignments]);

  const labelsByGroup = useMemo(() => {
    return labelGroups.map((group) => ({
      ...group,
      labels: availableLabels.filter((label) => getLabelPrefix(label) === group.prefix),
    }));
  }, [availableLabels]);


  const sLabelGroups = useMemo(() => inspectorGroups(box, 'S'), [box]);
  const tbLabelGroups = useMemo(() => inspectorGroups(box, 'TB'), [box]);

  useLayoutEffect(() => {
    if (!revealConnection) return;
    const slot = revealConnection.startsWith('S');
    const group = (slot ? sLabelGroups : tbLabelGroups).find(g => g.labels.includes(revealConnection));
    if (group) {
      const expand = slot ? setExpandedSGroups : setExpandedTBGroups;
      expand(current => ({ ...current, [group.id]: true }));
    }
    setRevealConnection(null);
  }, [revealConnection, sLabelGroups, tbLabelGroups]);

  const tbDisplayLabelAliases = useMemo(() => buildTBDisplayLabelAliasMap(tbLabelGroups), [tbLabelGroups]);
  const formatTBDisplayLabel = (label: string | null | undefined) => (label ? tbDisplayLabelAliases[label] ?? label : 'None');



  const panelCompositionAuthorityMode: PanelCompositionAuthorityMode = requestedPanelCompositionAuthorityMode;
  const finalGeometry = useMemo(
    () => buildNativeFinalGeometry(svgModel, needsGeometryApply ? [] : generatedGeometrySnapshot),
    [generatedGeometrySnapshot, svgModel, needsGeometryApply],
  );

  const kerfCompensatedAppliedPreview = useMemo(
    () => previewContours(finalGeometry, projectSettings),
    [finalGeometry, projectSettings],
  );
  const selectableProfileOffsetProfiles = useMemo(() => {
    const selected = new Set(projectSettings.selectedProfileOffsetIds);
    return finalGeometry.contours.flatMap((contour) => {
      const paths = new Map<ProfileOffsetSelectionTargetId, string[]>();
      contour.segmentProfileIds?.forEach((id, index) => {
        if (!id || !contour.points) return;
        const targetId = createGeneratedProfileOffsetTargetId(id);
        const start = contour.points[index];
        const end = contour.points[(index + 1) % contour.points.length];
        const values = paths.get(targetId) ?? [];
        values.push(`M ${start.x} ${start.y} L ${end.x} ${end.y}`);
        paths.set(targetId, values);
      });
      contour.segmentSourceEdgeIds?.forEach((sourceEdgeId, index) => {
        if (!sourceEdgeId || !contour.panelId || !contour.points || contour.segmentProfileIds?.[index]) return;
        const targetId = createOrdinaryProfileOffsetTargetId(contour.panelId, sourceEdgeId);
        const start = contour.points[index];
        const end = contour.points[(index + 1) % contour.points.length];
        const values = paths.get(targetId) ?? [];
        values.push(`M ${start.x} ${start.y} L ${end.x} ${end.y}`);
        paths.set(targetId, values);
      });
      return [...paths].map(([id, parts]) => ({ id, contourId: contour.id, pathD: parts.join(' '), selected: selected.has(id), available: true }));
    });
  }, [finalGeometry, projectSettings.selectedProfileOffsetIds]);

  const toggleProfileOffsetProfile = (id: ProfileOffsetSelectionTargetId) => {
    updateProjectSettings(({ selectedProfileOffsetIds: selected }) => ({
      selectedProfileOffsetIds: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id],
    }));
  };

  const isProjectLocked = !working;
  const isPanelManagerVisible = activeTool === 'PM';
  const panelDisplayItems = useMemo(() => svgModel.panels.map((panel, index) => ({
    panelId: panel.id,
    name: svgModel.drawingSource ? `P${index + 1}` : getPanelDisplayName(panel.id),
    pathD: getPanelPathD(panel),
    labelX: (panel.bounds.minX + panel.bounds.maxX) / 2,
    labelY: panel.bounds.minY,
  })), [svgModel]);
  const drawingEdgeNames = useMemo(() => {
    const names = new Map<string, string>();
    if (svgModel.drawingSource) svgModel.panels.forEach((panel, panelIndex) => {
      panel.edgeIds.forEach((id, edgeIndex) => names.set(id, `P${panelIndex + 1} · Edge ${edgeIndex + 1}`));
    });
    return names;
  }, [svgModel]);
  const edgeName = (id: string) => drawingEdgeNames.get(id) ?? id;
  const panelContainmentTree = useMemo(() => buildPanelContainmentTree(svgModel), [svgModel]);
  const panelTreeHoleItems = useMemo(() => {
    const collectHoles = (nodes: PanelTreePanelNode[]): PanelTreeHoleNode[] => nodes.flatMap((node) => [
      ...node.holes,
      ...node.holes.flatMap((hole) => collectHoles(hole.childPanels)),
    ]);
    return collectHoles(panelContainmentTree);
  }, [panelContainmentTree]);
  const panelManagerValidationMessage = validatePanelManagerState(panelManager);
  const canApplyPanelManager = !panelManager.isApplied && panelManagerValidationMessage === null;
  const hasPendingManufacturingSettings = haveProjectSettingsChanged(projectSettings, lastAppliedManufacturingSettings);
  const hasApplyInputs = needsGeometryApply || hasPendingManufacturingSettings || Object.keys(edgeAssignments).length > 0;
  const hasAssignedTBEdges = useMemo(() => {
    return Object.values(edgeAssignments).some((assignment) => getBucketEdgeAssignment(assignment)?.connectionId.startsWith('TB'));
  }, [edgeAssignments]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    // Capture first, reset immediately: every outcome permits the same file again,
    // and late cleanup cannot clear the selection belonging to a newer import.
    input.value = '';
    if (!file || projectOwner.getPublication().activeWorkspace !== 'construction') return;
    const token = importLock.acquire();
    if (!token) return;
    try {
      const text = await file.text();
      if (!importLock.isCurrent(token)) return;
      const parsedSvg = parseSvgDocument(text);
      const nextPanelManager = createPanelManagerStateFromModel(parsedSvg);
      const diagnosticMessage = formatImportDiagnosticMessage(parsedSvg);
      const result = boxTransactions.replaceSource(token, parsedSvg, nextPanelManager);
      if (result.outcome === 'rejected') {
        if (importLock.isCurrent(token)) setErrorMessage(result.error instanceof Error ? result.error.message : 'Unable to replace the SVG source.');
        return;
      }
      geometryRuntimeDebugCaptureRef.current = null;
      setActivePanelId(null);
      setActiveHoleId(null);
      setIsPanelManagerModalOpen(parsedSvg.panels.length > 0);
      setActiveTool('select');
      setExpandedTBGroups({});
      setExpandedSGroups({});
      setErrorMessage(diagnosticMessage);
    } catch (error) {
      if (importLock.isCurrent(token)) setErrorMessage(error instanceof Error ? error.message : 'Unable to import SVG.');
    } finally {
      importLock.release(token);
    }
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => { void handleImport(event); };

  const commitConstruction = (label: string, prepare: (before: BoxStateSource) => BoxStateSource) => {
    const result = boxTransactions.transact(label, before => {
      if (before.svgModel !== svgModel) throw new Error('Select a current SVG source.');
      if (!projectOwner.getBoxScope().working) throw new Error('Apply Panel Manager and choose an approved source before using workflow tools.');
      return prepare(before);
    });
    reportBoxResult(result, `Unable to complete ${label}.`);
    return result.outcome === 'accepted';
  };

  const createLabel = (prefix: LabelPrefix) => commitConstruction(`Add ${prefix} connection`, before => {
    if (prefix === 'S') {
      const next = manualAddSWorkflow(before.connections, before.activeSGroup);
      return { ...before, connections: next.connections, activeSGroup: next.activeSGroup,
        assignmentTargetConnectionId: next.selectedLabelId, displayConnectionId: next.selectedLabelId };
    }
    const id = getNextLabel(prefix, Object.keys(before.connections));
    const properties = prefix === 'TB' ? getSharedTBEdgeProperties(before.connections, defaultConnectionProperties.TB) : undefined;
    return { ...before, connections: { ...before.connections, [id]: createConnectionDefinition(id, prefix, properties) },
      assignmentTargetConnectionId: id, displayConnectionId: id };
  });

  const startGroup = (tool: 'TB' | 'W' | 'S') => {
    const accepted = commitConstruction(`Start ${tool} group`, before => {
      const field = constructionGroupField[tool];
      if (before[field]?.isActive) return before;
      const next = tool === 'TB' ? startTBGroupWorkflow(before.connections, defaultConnectionProperties.TB)
        : tool === 'S' ? startSGroupWorkflow(before.connections) : startWallGroupWorkflow(before.connections);
      const group = 'activeTBGroup' in next ? next.activeTBGroup : 'activeWallGroup' in next ? next.activeWallGroup : next.activeSGroup;
      const previousS = before.activeSGroup;
      const completedSGroups = tool === 'S' && previousS?.connectionIds.length
        ? [...(before.completedSGroups ?? []).filter(g => g.groupId !== previousS.groupId), previousS] : before.completedSGroups;
      return { ...before, ...(completedSGroups && { completedSGroups }), [field]: group, connections: next.connections,
        displayConnectionId: next.selectedLabelId, assignmentTargetConnectionId: next.selectedLabelId,
        workflowGroupOrder: { ...before.workflowGroupOrder,
          [group.groupId]: before.workflowGroupOrder[group.groupId] ?? getNextWorkflowGroupOrderIndex(before.workflowGroupOrder) },
      };
    });
    if (!accepted) return;
    setActiveTool(tool);
    const group = projectOwner.getBoxScope().box.activeTBGroup;
    if (tool === 'TB' && group) setExpandedTBGroups(current => ({ ...current, [group.groupId]: true }));
  };

  const finishGroup = (tool: 'TB' | 'W' | 'S') => {
    const accepted = commitConstruction(`Finish ${tool} group`, before => {
      const { connections, edgeAssignments, assignmentTargetConnectionId } = before;
      const cleared = { assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null };
      if (tool === 'W') {
        if (!before.activeWallGroup?.isActive) return before;
        const next = finishWallGroupWithTrailingCleanup(before.activeWallGroup, connections, edgeAssignments);
        return { ...before, ...cleared, ...next, completedWallGroups: [
          ...before.completedWallGroups.filter(group => group.groupId !== next.activeWallGroup.groupId), next.activeWallGroup] };
      }
      if (tool === 'TB') {
        if (!before.activeTBGroup?.isActive) return before;
        const next = finishTBGroupWithTrailingCleanup(before.activeTBGroup, connections, edgeAssignments, assignmentTargetConnectionId);
        return { ...before, ...cleared, connections: next.connections, activeTBGroup: next.activeTBGroup,
          completedTBGroups: [...before.completedTBGroups.filter(group => group.groupId !== next.activeTBGroup.groupId), next.activeTBGroup] };
      }
      if (!before.activeSGroup?.isActive) return before;
      const next = finishSGroupWithTrailingCleanup(before.activeSGroup, connections, edgeAssignments, assignmentTargetConnectionId);
      return { ...before, ...cleared, connections: next.connections, activeSGroup: next.activeSGroup };
    });
    if (accepted) setActiveTool('select');
  };

  const openManufacturing = () => {
    const { panelManager } = projectOwner.getBoxScope().box;
    if (!panelManager.isApplied) {
      setErrorMessage('Apply Panel Manager before using workflow tools.');
      return;
    }
    setActiveTool('manufacturing');
  };

  const handleToolClick = (tool: ActiveTool) => {
    setInspectedEntryId(null);
    const current = projectOwner.getBoxScope().box;
    if (!current.panelManager.isApplied && !['select', 'PM'].includes(tool)) {
      setErrorMessage('Apply Panel Manager before using workflow tools.');
      return;
    }
    if (tool === 'TB' || tool === 'S' || tool === 'W') {
      const group = current[constructionGroupField[tool]];
      if (!group?.isActive) {
        startGroup(tool);
        return;
      }
      selectConnectionForDisplayAndAssignment(group.connectionIds.at(-1) ?? null);
      if (tool === 'TB') setExpandedTBGroups(current => ({ ...current, [group.groupId]: true }));
      setErrorMessage('');
    }
    setActiveTool(tool);
  };

  const closeBoxTool = () => {
    pointerEpoch.current = -1;
    cancelCanvasPan();
    setInspectedEntryId(null);
    setActiveTool('select');
    projectOwner.setBoxContext({ assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null });
    setActivePanelId(null);
    setActiveHoleId(null);
    setHoveredProfileOffsetProfileId(null);
    setIsProfileOffsetProfileSelectionActive(false);
    setHoverSources([]);
    setErrorMessage('');
  };

  useCadEscapeToolExit(activeWorkspace === 'construction' && !importLock.isImporting && !isClearDialogOpen, () => {
    if (isPanelManagerModalOpen) { setIsPanelManagerModalOpen(false); setActiveTool('PM'); return; }
    if (sourceChoices.length) { setSourceChoices([]); setHoverSources([]); return; }
    closeBoxTool();
  });

  const groupTool = activeTool === 'TB' || activeTool === 'W' || activeTool === 'S' ? activeTool : null;
  const displayedGroup = groupTool && displayConnectionId
    ? connectionGroups(box, groupTool).find(group => group.connectionIds.includes(displayConnectionId)) : undefined;
  const selectedBoxEntry = project.chronology?.find(entry => entry.kind === activeTool && entry.sourceId === sourceId
    && (entry.groupId ? entry.groupId === displayedGroup?.groupId : !entry.connectionId || entry.connectionId === displayConnectionId));
  const inspecting = selectedBoxEntry && inspectedEntryId === selectedBoxEntry.id && groupTool ? selectedBoxEntry : undefined;
  const inspectorMembers = inspecting ? new Set(displayedGroup?.connectionIds ?? [displayConnectionId]) : null;
  // Outside History, standalone Add may be selected while a session is still open.
  const finishAuthoring = displayedGroup ? displayedGroup.isActive : !inspecting && groupTool && box[constructionGroupField[groupTool]]?.isActive;
  const activeWorkflowFinish = groupTool && finishAuthoring
    ? { label: 'OK', onClick: () => finishGroup(groupTool) }
    : groupTool && (inspecting || displayedGroup) ? { label: 'OK', onClick: closeBoxTool } : null;

  // Placement only: keep the existing command availability and acceptance boundaries.
  const hasContextualGeometryActions = activeTool === 'TB' || activeTool === 'W'
    || activeTool === 'S' || activeTool === 'manufacturing';

  const clearEdgeLabel = (edgeId: string, id?: string) => commitConstruction('Remove edge assignment',
    before => removeConstructionAssignment(before, edgeId, id));

  const assignSelectedLabelToEdge = (edgeId: string) => {
    const current = projectOwner.getBoxScope().box;
    if (svgModel !== current.svgModel || !current.svgModel.edges.some(edge => edge.id === edgeId)) {
      setErrorMessage('Select a current source edge.');
      return;
    }
    const id = current.svgModel.drawingSource && (activeTool === 'select' || activeTool === 'PM')
      ? null : current.assignmentTargetConnectionId;
    const assigned = activeTool === 'W' ? getBucketEdgeAssignment(current.edgeAssignments[edgeId])?.connectionId
      : resolveAssignedTBOrSConnectionIdForEdge(current.edgeAssignments, edgeId, activeTool === 'S' ? 'S' : activeTool === 'TB' ? 'TB' : undefined);
    if (id && !current.connections[id]) {
      setErrorMessage('Select a valid connection before clicking an edge.');
      return;
    }
    const inspect = id && assigned === id && (activeTool !== 'W' || id.startsWith('W'));
    if (inspect || !id || !current.panelManager.isApplied) {
      projectOwner.setBoxContext({ selectedEdgeId: edgeId, ...(inspect ? { displayConnectionId: id } : {}) });
      setErrorMessage(inspect ? '' : !current.panelManager.isApplied ? 'Apply Panel Manager before assigning edges.'
        : 'Create and select a connection before clicking an edge.');
      return;
    }
    const completedSlot = current.connections[id]?.prefix === 'S' && !getDefaultSlotRole(current.edgeAssignments, id);
    const label = completedSlot ? `Continue ${id} group` : `Assign edge to ${id}`;
    if (!commitConstruction(label, box => assignConstructionEdge(box, edgeId, id))) return;
    if (completedSlot) setErrorMessage(`${id} is complete. Select the next S connection before assigning another edge.`);
    const next = projectOwner.getBoxScope().box;
    if (current.connections[id]?.prefix === 'TB' && next.assignmentTargetConnectionId !== id && next.activeTBGroup?.connectionIds.includes(id)) {
      const groupId = next.activeTBGroup.groupId;
      setExpandedTBGroups(groups => ({ ...groups, [groupId]: true }));
    }
  };

  const updateAssignedRole = (edgeId: string, id: string, role: EdgeRole | SlotRole) =>
    commitConstruction(`Change ${id} role`, before => changeConstructionRole(before, edgeId, id, role));

  const reportBoxResult = (result: BoxTransactionResult, fallback: string) => {
    if (result.outcome === 'rejected') {
      setErrorMessage(result.error instanceof Error ? result.error.message : fallback);
      return false;
    }
    setErrorMessage('');
    return true;
  };

  const selectAppliedSnapshot = (model: SvgDocumentModel, items: GeneratedGeometryItem[], previous: GeneratedGeometrySnapshot) => {
    const authority = selectGeneratedGeometryAuthority(model, items, panelCompositionAuthorityMode);
    reportAuthorityDownstreamDiagnostics(authority);
    if (!authority.ok) {
      const reasons = authority.blockingDecisions.map(decision => formatAuthorityBlockingDecision(authority, decision)).join('; ');
      throw new Error(`Unable to compose panel geometry: ${reasons}`);
    }
    return retainEquivalentSnapshot(previous, createGeneratedGeometrySnapshot({
      generatedGeometry: [...authority.generatedGeometry], panelCompositionModel: authority.panelCompositionModel,
    }));
  };

  const applyPanelPaths = () => {
    const result = boxTransactions.transact('Apply geometry', before => {
      const { svgModel, edgeAssignments, panelManager, activeTBGroup, completedTBGroups, activeWallGroup, completedWallGroups,
        activeSGroup, assignmentTargetConnectionId, displayConnectionId, selectedEdgeId, workflowGroupOrder,
        projectSettings, lastAppliedManufacturingSettings } = before;
      if (!panelManager.isApplied) throw new Error('Apply Panel Manager before applying or exporting workflow geometry.');
      const generated = evaluateAppliedGeometry(before, panelCompositionAuthorityMode, selectAppliedSnapshot);
      const { connections: nextConnections, tbGeneratedItems, wGeneratedItems, sGeneratedItems,
        items: nextGeneratedGeometryItems } = generated;
      const panelCompositionModel = before.generatedGeometrySnapshot.metadata.panelCompositionModel ?? 'legacy';
      if (import.meta.env.DEV) {
        geometryRuntimeDebugCaptureRef.current = new WeakRef(before);
        debugCaptures.set(before, {
          schema: 'wall-v2-runtime-debug-b3.7', capturedAt: new Date().toISOString(),
          authoredState: { svgModel, edgeAssignments, connections: nextConnections, panelManager,
            activeTBGroup, completedTBGroups, activeWallGroup, completedWallGroups, activeSGroup,
            assignmentTargetConnectionId, displayConnectionId, selectedEdgeId, activePanelId, activeHoleId,
            workflowGroupOrder, projectSettings, lastAppliedManufacturingSettings,
            panelCompositionModel, existingGeneratedGeometryItems: before.generatedGeometrySnapshot.generatedGeometry },
          applyInput: { tbGeneratedItems, wGeneratedItems, sGeneratedItems, combinedGeneratedItems: nextGeneratedGeometryItems },
          authorityContext: { mode: panelCompositionAuthorityMode, panelCompositionModel,
            contributorRegistryIdentity: geometryContributorRegistryIdentity(),
            assemblyDiagnostics: assembleGeneratedGeometryDiagnostics(svgModel, nextGeneratedGeometryItems) },
          downstreamExceptions: probeGeometryDownstreamExceptions(svgModel, nextGeneratedGeometryItems),
        });
      }
      const snapshot = generated.snapshot;
      const appliedInputs = appliedGeometryInputs(before, nextConnections);
      const settings = haveProjectSettingsChanged(projectSettings, lastAppliedManufacturingSettings)
        ? projectSettings : lastAppliedManufacturingSettings;
      if (!panelManager.needsGeometryApply && !before.dependencyDiagnostics?.length && before.appliedGeometryInputs
        && projectDataEqual(appliedInputs, before.appliedGeometryInputs)
        && snapshot === before.generatedGeometrySnapshot && settings === lastAppliedManufacturingSettings
        && projectDataEqual(nextConnections, before.connections)) return before;
      return { ...before, connections: nextConnections, generatedGeometrySnapshot: snapshot, lastAppliedManufacturingSettings: settings,
        appliedGeometryInputs: appliedInputs,
        dependencyDiagnostics: [],
        ...(panelManager.needsGeometryApply && { panelManager: { ...panelManager, needsGeometryApply: false } }) };
    });
    reportBoxResult(result, 'Unable to apply geometry.');
  };

  const invalidateInteractions = () => {
    setHoverSources([]);
    setSourceChoices([]);
    cancelCanvasPan();
    drawingInteraction.current?.invalidate();
    setActivePanelId(null);
    setActiveHoleId(null);
    setIsProfileOffsetProfileSelectionActive(false);
    setHoveredProfileOffsetProfileId(null);
    setErrorMessage('');
    geometryRuntimeDebugCaptureRef.current = null;
  };

  const traverse = (direction: 'undo' | 'redo') => {
    if (isClearDialogOpen || importLock.isImporting) return;
    drawingInteraction.current?.settle();
    const source = projectOwner.getBoxScope().box.svgModel;
    const priorSketch = projectOwner.getPublication().editingSketchId;
    if (!projectOwner.traverse(direction)) return;
    if (priorSketch !== projectOwner.getPublication().editingSketchId) setDrawingConstraintsPanelOpen(false);
    invalidateInteractions();
    const restored = projectOwner.getBoxScope().box;
    if (source !== restored.svgModel) {
      setActiveTool(restored.panelManager.isApplied || !restored.svgModel.panels.length ? 'select' : 'PM');
    }
    setIsPanelManagerModalOpen(false);
  };

  // The next input in the same browser task can target a newly enabled command
  // or editor. Install its DOM and handlers before returning from this command.
  const runHistoryCommand = (direction: 'undo' | 'redo') => flushSync(() => traverse(direction));
  const historyCommand = useRef(runHistoryCommand);
  useLayoutEffect(() => { historyCommand.current = runHistoryCommand; });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('input, textarea, select, [role="textbox"]')
        || (target as HTMLElement).isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      historyCommand.current(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearProject = () => {
    drawingInteraction.current?.invalidate();
    cancelCanvasPan();
    projectOwner.clearProject(session);
  };

  const requestClearProject = () => {
    if (isClearDialogOpen) return;
    resumeProfile.current = drawingInteraction.current?.pauseProfile();
    flushSync(() => setIsClearDialogOpen(true));
  };

  const cancelClearProject = () => {
    setIsClearDialogOpen(false);
    resumeProfile.current?.();
    resumeProfile.current = undefined;
  };

  const updatePanelThickness = (panelId: string, thicknessMm: number) => {
    setActivePanelId(panelId);
    setActiveHoleId(null);
    const result = boxTransactions.transact('Edit panel thickness', before => {
      const { panelManager } = before;
      if (!Object.hasOwn(panelManager.panels, panelId)) throw new Error('Select a current panel.');
      if (panelManager.panels[panelId].thicknessMm === thicknessMm) return before;
      const panels = { ...panelManager.panels, [panelId]: { panelId, thicknessMm } };
      return { ...before, panelManager: { ...panelManager, panels, isApplied: false, isDirty: true } };
    });
    if (result.outcome === 'rejected') reportBoxResult(result, 'Unable to update panel thickness.');
  };

  const acceptDefaultPanelThickness = () => {
    const result = boxTransactions.transact('Accept default panel thickness', before => {
      const pm = before.panelManager;
      const defaultThicknessMm = pm.defaultThicknessMm > 0 ? pm.defaultThicknessMm : DEFAULT_PANEL_THICKNESS_MM;
      if (!pm.isApplied && pm.isDirty && pm.defaultThicknessMm === defaultThicknessMm
        && Object.values(pm.panels).every(panel => panel.thicknessMm === defaultThicknessMm)) return before;
      const panels = Object.fromEntries(Object.keys(pm.panels).map(panelId => [panelId, { panelId, thicknessMm: defaultThicknessMm }]));
      return { ...before, panelManager: { ...pm, defaultThicknessMm, panels, isApplied: false, isDirty: true } };
    });
    if (!reportBoxResult(result, 'Unable to accept default panel thickness.')) return;
    setActivePanelId(null);
    setActiveHoleId(null);
  };

  const finishPanelManager = () => {
    setActiveTool('select');
    projectOwner.setBoxContext({ assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null });
    setActivePanelId(null);
    setActiveHoleId(null);
    setIsPanelManagerModalOpen(false);
    setErrorMessage('');
  };

  const applyPanelManager = () => {
    const result = boxTransactions.transact('Apply Panel Manager', before => {
      const { panelManager, svgModel, edgeAssignments } = before;
      const validationError = validatePanelManagerState(panelManager);
      if (validationError) throw new Error(validationError);
      const applied = { ...panelManager, isApplied: true, isDirty: false };
      if (svgModel.drawingSource) {
        if (isSourceApproved(before) && !panelManager.isDirty) return before;
        validateDrawingApproval(before);
        return { ...before, panelManager: { ...applied, approvedGeometryRevision: svgModel.drawingSource.geometryRevision,
          needsGeometryApply: Boolean(panelManager.needsGeometryApply || before.generatedGeometrySnapshot.generatedGeometry.length) } };
      }
      const connections = recalculateBoxConnections(before, applied);
      const toolsToRebuild = new Set(before.generatedGeometrySnapshot.generatedGeometry.map(item => item.toolType));
      for (const bucket of Object.values(edgeAssignments)) {
        const edge = getBucketEdgeAssignment(bucket);
        const prefix = edge && connections[edge.connectionId]?.prefix;
        if (prefix === 'TB' || prefix === 'W') toolsToRebuild.add(prefix);
      }
      const items = [
        ...(toolsToRebuild.has('TB') ? buildGeneratedTBGeometryItems(svgModel, edgeAssignments, connections, applied) : []),
        ...(toolsToRebuild.has('W') ? buildGeneratedWGeometryItems(svgModel, edgeAssignments, connections, applied) : []),
        ...(toolsToRebuild.has('S') ? buildGeneratedSGeometryItems(svgModel, edgeAssignments, connections, applied) : []),
      ];
      const snapshot = selectAppliedSnapshot(svgModel, items, before.generatedGeometrySnapshot);
      if (panelManager.isApplied && !panelManager.isDirty && snapshot === before.generatedGeometrySnapshot
        && projectDataEqual(connections, before.connections)) return before;
      return { ...before, connections, panelManager: applied, generatedGeometrySnapshot: snapshot };
    });
    if (!reportBoxResult(result, 'Unable to apply Panel Manager.')) return;
    setIsPanelManagerModalOpen(false);
    setActivePanelId(null);
    setActiveHoleId(null);
  };

  const updateProjectSettings = (updates: Partial<ProjectSettings> | ((current: ProjectSettings) => Partial<ProjectSettings>)) => {
    const result = boxTransactions.transact('Edit manufacturing settings', before => {
      const current = before.projectSettings;
      const patch = typeof updates === 'function' ? updates(current) : updates;
      const { settings } = normalizeProjectSettings({ ...current, ...patch });
      if (!haveProjectSettingsChanged(settings, current)) return before;
      const order = before.workflowGroupOrder;
      const workflowGroupOrder = order.manufacturing !== undefined ? order
        : { ...order, manufacturing: getNextWorkflowGroupOrderIndex(order) };
      return { ...before, projectSettings: settings, workflowGroupOrder };
    });
    reportBoxResult(result, 'Unable to update manufacturing settings.');
  };

  const updateConnectionProperties = (id: string, edit: ConstructionPropertyEdit) =>
    commitConstruction(`Edit ${id} properties`, before => editConstructionProperties(before, id, edit));

  const exportSvg = () => {
    // Export after Apply is clean laser geometry; export before Apply remains label/reference export.
    const hasAppliedGeometry = generatedGeometryItems.length > 0;
    const current = projectOwner.getBoxScope();
    if (current.box !== box || !current.working) {
      setErrorMessage('Choose an approved source in Panel Manager before exporting.');
      return;
    }
    if (box.panelManager.needsGeometryApply) {
      setErrorMessage('Apply geometry for the current Sketch before exporting.');
      return;
    }
    if (box.dependencyDiagnostics?.some(d => d.severity === 'error')) {
      setErrorMessage('Repair blocked BOX geometry before exporting.');
      return;
    }
    const output = hasAppliedGeometry
      ? exportManufacturingGeometrySvg(svgModel, kerfCompensatedAppliedPreview)
      : exportLabeledSvg(svgModel.content, edgeAssignments, svgModel.edges);
    const blob = new Blob([output], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = hasAppliedGeometry
        ? 'svg-box-designer-applied.svg'
        : 'svg-box-designer-labeled.svg';
      downloadRef.current.click();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getSvgPointFromClient = (clientX: number, clientY: number) => {
    const svgElement = svgRef.current;
    const screenMatrix = svgElement?.getScreenCTM();

    if (!svgElement || !screenMatrix) {
      return {
        x: canvasViewBox.x + canvasViewBox.width / 2,
        y: canvasViewBox.y + canvasViewBox.height / 2,
      };
    }

    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    return point.matrixTransform(screenMatrix.inverse());
  };

  const zoomCanvas = (factor: number, center = {
    x: canvasViewBox.x + canvasViewBox.width / 2,
    y: canvasViewBox.y + canvasViewBox.height / 2,
  }) => {
    cameraInitialized.current = true;
    const originalViewBox = parseViewBox(svgModel.viewBox);
    setCanvasViewBox((currentViewBox) => zoomViewBox(currentViewBox, factor, center, originalViewBox));
  };

  const getCanvasViewportSize = (fallbackViewBox: CanvasViewBox) => {
    const svgElement = svgRef.current;
    const canvasFrameElement = canvasFrameRef.current;
    let viewportWidth = svgElement?.clientWidth ?? 0;
    let viewportHeight = svgElement?.clientHeight ?? 0;

    if (canvasFrameElement) {
      const frameStyles = window.getComputedStyle(canvasFrameElement);
      const horizontalPadding = (parseFloat(frameStyles.paddingLeft) || 0) + (parseFloat(frameStyles.paddingRight) || 0);
      const verticalPadding = (parseFloat(frameStyles.paddingTop) || 0) + (parseFloat(frameStyles.paddingBottom) || 0);
      viewportWidth = Math.max(canvasFrameElement.clientWidth - horizontalPadding, 0);
      viewportHeight = Math.max(canvasFrameElement.clientHeight - verticalPadding, 0);
    }

    return {
      width: viewportWidth > 0 ? viewportWidth : fallbackViewBox.width,
      height: viewportHeight > 0 ? viewportHeight : fallbackViewBox.height,
    };
  };

  const getFittedCanvasViewBox = (includeReferences = Boolean(svgModel.drawingSource)) => {
    const fallbackViewBox = parseViewBox(svgModel.viewBox);
    let contentBounds: SourceBounds | null = null;
    const includePointInBounds = (point: Point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }

      contentBounds = contentBounds
        ? {
          minX: Math.min(contentBounds.minX, point.x),
          maxX: Math.max(contentBounds.maxX, point.x),
          minY: Math.min(contentBounds.minY, point.y),
          maxY: Math.max(contentBounds.maxY, point.y),
        }
        : { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
    };
    const includeBounds = (bounds: SourceBounds) => {
      includePointInBounds({ x: bounds.minX, y: bounds.minY });
      includePointInBounds({ x: bounds.maxX, y: bounds.maxY });
    };

    for (const { sketch } of includeReferences ? sketchDefinitions : []) {
      Object.values(sketch.points).forEach(includePointInBounds);
    }
    if (boxSources && hasImportedSource(project.box)) project.box.svgModel.panels.forEach(panel => includeBounds(panel.bounds));
    svgModel.edges.forEach((edge) => {
      includePointInBounds(edge.start);
      includePointInBounds(edge.end);
    });
    svgModel.panels.forEach((panel) => {
      includeBounds(panel.bounds);
    });
    if (!contentBounds) {
      return fallbackViewBox;
    }

    const fittedContentBounds = contentBounds as SourceBounds;
    const contentWidth = Math.max(fittedContentBounds.maxX - fittedContentBounds.minX, fallbackViewBox.width * 0.01, 1);
    const contentHeight = Math.max(fittedContentBounds.maxY - fittedContentBounds.minY, fallbackViewBox.height * 0.01, 1);
    const paddedWidth = contentWidth * 1.2;
    const paddedHeight = contentHeight * 1.2;
    const viewportSize = getCanvasViewportSize(fallbackViewBox);
    const inspector = sketchDefinitions.length > 0 && canvasFrameRef.current?.closest('.workspace')?.querySelector('.active-tool-panel');
    const inspectorWidth = inspector ? Math.min(viewportSize.width / 2, inspector.getBoundingClientRect().width + 24) : 0;
    const visibleWidth = viewportSize.width - inspectorWidth;
    const canvasAspectRatio = visibleWidth / viewportSize.height;
    const safeCanvasAspectRatio = Number.isFinite(canvasAspectRatio) && canvasAspectRatio > 0
      ? canvasAspectRatio
      : 1;
    const contentAspectRatio = paddedWidth / paddedHeight;
    const fittedWidth = contentAspectRatio > safeCanvasAspectRatio
      ? paddedWidth
      : paddedHeight * safeCanvasAspectRatio;
    const fittedHeight = contentAspectRatio > safeCanvasAspectRatio
      ? paddedWidth / safeCanvasAspectRatio
      : paddedHeight;
    const centerX = (fittedContentBounds.minX + fittedContentBounds.maxX) / 2;
    const centerY = (fittedContentBounds.minY + fittedContentBounds.maxY) / 2;

    return {
      x: centerX - fittedWidth / 2,
      y: centerY - fittedHeight / 2,
      width: Math.max(fittedWidth * viewportSize.width / visibleWidth, 1),
      height: Math.max(fittedHeight, 1),
    };
  };

  const fitCanvasToScreen = () => {
    cameraInitialized.current = true;
    setCanvasViewBox(getFittedCanvasViewBox(true));
  };

  // Frame the first visible content once, unless the user already moved the empty canvas.
  const hasBoxContent = hasImportedSource(project.box) || sketchDefinitions.some(d => d.sketch.entityOrder.length);
  useLayoutEffect(() => {
    if (activeWorkspace === 'construction' && hasBoxContent && !cameraInitialized.current) fitCanvasToScreen();
  }, [activeWorkspace, hasBoxContent]);

  useCadWheelCapture(svgRef, (event) => {
    const center = getSvgPointFromClient(event.clientX, event.clientY);
    zoomCanvas(Math.exp(-event.deltaY * wheelZoomSensitivity), center);
  });

  const { isPanning: isCanvasPanning, panHandlers: canvasPanHandlers, cancelPan: cancelCanvasPan } = useCadPanGesture({
    viewportRef: svgRef,
    onPan: ({ dx, dy }) => {
      cameraInitialized.current = true;
      const screenMatrix = svgRef.current?.getScreenCTM();
      if (!screenMatrix) return;
      const scaleX = Math.hypot(screenMatrix.a, screenMatrix.b);
      const scaleY = Math.hypot(screenMatrix.c, screenMatrix.d);
      if (scaleX === 0 || scaleY === 0) return;
      setCanvasViewBox((currentViewBox) => ({
        ...currentViewBox,
        x: currentViewBox.x - dx / scaleX,
        y: currentViewBox.y - dy / scaleY,
      }));
    },
  });

  const renderPropertiesPanel = () => {
    const activeConnectionPrefix = activeTool === 'TB' ? 'TB' : activeTool;

    if (!selectedConnection || selectedConnection.prefix !== activeConnectionPrefix) {
      return <p className="muted">Select a {activeTool === 'PM' ? 'Panel Manager' : activeTool === 'TB' ? 'TB / Top Bottom' : activeTool} connection to inspect this tool.</p>;
    }

    if (selectedConnection.prefix === 'TB') {
      const assignedTBEdges = svgModel.edges.filter((edge) => getBucketEdgeAssignment(edgeAssignments[edge.id])?.connectionId === selectedConnection.id);
      const tbViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const ownerPanelId = tbViewModel.panelIds.panelAId;
      const matingPanelId = tbViewModel.panelIds.panelBId;
      const ownerThicknessMm = tbViewModel.panelThicknesses.panelAThicknessMm;
      const matingThicknessMm = tbViewModel.panelThicknesses.panelBThicknessMm;

      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="edge-assigned-edges">
            <h4 id="edge-assigned-edges">Assigned edges</h4>
            {assignedTBEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedTBEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edgeName(edge.id)}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{svgModel.drawingSource ? sourceName : edge.source}</dd>
                      </div>
                      <div>
                        <dt>Edge length</dt>
                        <dd>{formatCalculatedMm(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y))}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-edge-role`}
                      label="Role"
                      value={getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole ?? 'A'}
                      options={['A', 'B']}
                      onChange={(edgeRole) => updateAssignedRole(edge.id, selectedConnection.id, edgeRole as EdgeRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id, selectedConnection.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this TB / Top Bottom label yet. Select this label, then click edges in the drawing.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="edge-connection">
            <h4 id="edge-connection">Connection</h4>
            <dl>
              <div><dt>Owner panel</dt><dd>{ownerPanelId ? getPanelDisplayName(ownerPanelId) : 'Unknown'}</dd></div>
              <div><dt>Mating panel</dt><dd>{matingPanelId ? getPanelDisplayName(matingPanelId) : 'Unknown'}</dd></div>
              <div><dt>Owner thickness</dt><dd>{formatCalculatedMm(ownerThicknessMm)}</dd></div>
              <div><dt>Mating thickness</dt><dd>{formatCalculatedMm(matingThicknessMm)}</dd></div>
              <div><dt>Joint depth</dt><dd>{formatCalculatedMm(matingThicknessMm)}</dd></div>
            </dl>
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'W') {
      const assigned = getWallAssignments(svgModel, edgeAssignments, selectedConnection.id);
      const complete = assigned.length === 2 && assigned.some((item) => item.role === 'A') && assigned.some((item) => item.role === 'B');
      const panelRoles = assigned.length === 2
        ? assigned.map((item) => resolveTBRoleForPanel(item.panelId, edgeAssignments, connections, svgModel)) : null;
      return <div className="property-sections">
        <section className="property-section" aria-labelledby="wall-assigned-edges">
          <h4 id="wall-assigned-edges">Wall assignments</h4>
          <p><strong>{complete ? 'Complete' : 'Incomplete'}</strong> — exactly one W-A and one W-B are required.</p>
          {assigned.length ? <ul className="calculated-edge-list">{assigned.map((item) => <li key={item.sourceEdgeId}>
            <strong>{selectedConnection.id}-{item.role}</strong><span>{svgModel.drawingSource ? edgeName(item.sourceEdgeId) : getPanelDisplayName(item.panelId) + ' · ' + item.sourceEdgeId}</span>
            <SelectField id={`${item.sourceEdgeId}-wall-role`} label="Role" value={item.role} options={['A', 'B']}
              onChange={(role) => updateAssignedRole(item.sourceEdgeId, selectedConnection.id, role as EdgeRole)} />
            <button type="button" onClick={() => clearEdgeLabel(item.sourceEdgeId, selectedConnection.id)}>Remove</button>
          </li>)}</ul> : <p className="muted">Click a source edge for W-A, then its mate for W-B. Change the first role to reverse a free Wall.</p>}
        </section>
        <section className="property-section" aria-labelledby="wall-orientation">
          <h4 id="wall-orientation">Per-panel TB guidance</h4>
          <p>{panelRoles === null ? 'Choose a second panel to resolve TB guidance.'
            : panelRoles.some((role) => role === 'AMBIGUOUS_TB_ROLE') ? 'Conflict: ambiguous TB panel role; Wall fails closed.'
            : panelRoles.every((role) => role === 'NO_TB_ROLE') ? 'No TB constraint — either Wall orientation is available.'
            : 'TB constrained: each Wall panel independently inherits its complete TB role.'}</p>
          <p className="muted">Wall uses TB-equivalent finger-joint geometry with Wall-safe A/B authoring.</p>
        </section>
      </div>;
    }

    if (selectedConnection.prefix === 'S') {
      const sViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const sThickness = {
        panelAId: sViewModel.panelIds.panelAId,
        panelBId: sViewModel.panelIds.panelBId,
        panelAThicknessMm: sViewModel.panelThicknesses.panelAThicknessMm,
        panelBThicknessMm: sViewModel.panelThicknesses.panelBThicknessMm,
      };
      const assignedSEdges = svgModel.edges.filter((edge) => getBucketSlotAssignments(edgeAssignments[edge.id]).some((assignment) => assignment.connectionId === selectedConnection.id));

      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="slot-assigned-edges">
            <h4 id="slot-assigned-edges">Assigned edges</h4>
            {assignedSEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedSEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edgeName(edge.id)}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{svgModel.drawingSource ? sourceName : edge.source}</dd>
                      </div>
                      <div>
                        <dt>Edge length</dt>
                        <dd>{formatCalculatedMm(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y))}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-slot-role`}
                      label="Role"
                      value={getBucketSlotAssignments(edgeAssignments[edge.id]).find((assignment) => assignment.connectionId === selectedConnection.id)?.slotRole ?? 'A'}
                      options={['A', 'B']}
                      onChange={(slotRole) => updateAssignedRole(edge.id, selectedConnection.id, slotRole as SlotRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id, selectedConnection.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this S label yet. Select this label, then click the S-A and S-B edges in the drawing.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="slot-connection">
            <h4 id="slot-connection">Connection</h4>
            <dl>
              <div><dt>S-A panel</dt><dd>{sThickness.panelAId ? getPanelDisplayName(sThickness.panelAId) : 'Unknown'}</dd></div>
              <div><dt>S-B panel</dt><dd>{sThickness.panelBId ? getPanelDisplayName(sThickness.panelBId) : 'Unknown'}</dd></div>
              <div><dt>Wall thickness</dt><dd>{formatCalculatedMm(sThickness.panelAThicknessMm)}</dd></div>
              <div><dt>Insert depth</dt><dd>{formatCalculatedMm(sThickness.panelBThicknessMm)}</dd></div>
            </dl>
          </section>
        </div>
      );
    }



    return null;

  };

  const renderCompactControls = () => {
    if (selectedConnection && (selectedConnection.prefix === 'TB' || selectedConnection.prefix === 'W')
      && shouldShowFingerJointTabControl(activeTool, selectedConnection.prefix)) {
      const tbViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const toolLabel = selectedConnection.prefix;

      return (
        <div className="compact-property-controls" aria-label={`Compact ${toolLabel} controls`}>
          <span className="muted">Panel Manager thickness</span>
          <NumericField id="compact-edge-tab-size" label="Tab" min={0} value={tbViewModel.displayTabMm} disabled={tbViewModel.displayTabMm === null} placeholder={`Complete ${toolLabel} connection`} onChange={(fingerWidthMm) => updateConnectionProperties(selectedConnection.id, { prefix: selectedConnection.prefix, updates: { fingerWidthMm } })} />
        </div>
      );
    }

    if (selectedConnection?.prefix === 'S' && (activeSGroup?.isActive || selectedConnection)) {
      const properties = selectedConnection.properties;
      const sViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const displayedSlotLengthMm = sViewModel.displayTabMm;
      const controlsLabel = activeSGroup?.isActive && activeSGroup.connectionIds.includes(selectedConnection.id)
        ? 'Compact active S group controls'
        : 'Compact selected S controls';

      return (
        <div className="compact-property-controls" aria-label={controlsLabel}>
          <NumericField id="compact-slot-tab-size" label="Tab" min={0} value={displayedSlotLengthMm} disabled={displayedSlotLengthMm === null} placeholder="Complete S connection" onChange={(slotLengthMm) => updateConnectionProperties(selectedConnection.id, { prefix: 'S', updates: { slotLengthMm } })} />
          <NumericField id="compact-slot-offset" label="Offset" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateConnectionProperties(selectedConnection.id, { prefix: 'S', updates: { slotOffsetMm } })} />
        </div>
      );
    }



    return null;
  };

  const labelScale = Math.max(canvasViewBox.width / Math.max(canvasViewportSize.width, 1), minZoom);
  const labelEdgeOffset = annotationEdgeOffsetPx * labelScale;
  const displayEdgeAssignments = useMemo(() => {
    if (activeTool !== 'TB' && activeTool !== 'W' && activeTool !== 'S') {
      return {};
    }

    return Object.fromEntries(Object.entries(edgeAssignments).flatMap(([edgeId, assignment]) => {
      const bucket = toEdgeAssignmentBucket(assignment);
      const displayBucket = activeTool === 'TB' || activeTool === 'W'
        ? bucket?.edgeAssignment?.connectionId.startsWith(activeTool) ? { edgeAssignment: bucket.edgeAssignment } : undefined
        : bucket?.slotAssignments?.some((slotAssignment) => slotAssignment.connectionId.startsWith('S'))
          ? { slotAssignments: bucket.slotAssignments.filter((slotAssignment) => slotAssignment.connectionId.startsWith('S')) }
          : undefined;

      return displayBucket ? [[edgeId, displayBucket]] : [];
    }));
  }, [activeTool, edgeAssignments]);
  const tbCanvasLabelAliases = tbDisplayLabelAliases;
  const labelPlacements = layoutPanelLabels(svgModel.edges.flatMap((edge) => (
    getEdgeAssignmentDisplayLabels(displayEdgeAssignments[edge.id]).map((label) => ({
      edge,
      label: tbCanvasLabelAliases[label] ?? label,
    }))
  )), svgModel.panels, {
    edgeOffset: labelEdgeOffset,
    labelScale,
    measureLabel: (label) => {
      const context = document.createElement('canvas').getContext('2d');
      if (context) context.font = `700 ${annotationFontSizePx}px Inter, Arial, sans-serif`;
      return {
        width: (context?.measureText(label).width ?? label.length * annotationFontSizePx * 0.62) + annotationPaddingXPx * 2,
        height: annotationFontSizePx + annotationPaddingYPx * 2,
      };
    },
  });
  const labelPlacementsByEdgeId = labelPlacements.reduce((placementsByEdgeId, placement) => {
    placementsByEdgeId.set(placement.edgeId, [...(placementsByEdgeId.get(placement.edgeId) ?? []), placement]);
    return placementsByEdgeId;
  }, new Map<string, typeof labelPlacements>());
  const generatedCanvasEdgeRelationships = useMemo(
    () => deriveGeneratedCanvasEdgeRelationshipState(generatedGeometryItems),
    [generatedGeometryItems],
  );
  const panelIdByEdgeId = useMemo(
    () => new Map(svgModel.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const))),
    [svgModel],
  );

  const renderPanelList = () => (
    <div className="pm-panel-list" aria-label={`Panels (${svgModel.panels.length})`}>
      <h3>Panels ({svgModel.panels.length})</h3>
      {svgModel.panels.length > 0 ? (
        <ul>
          {svgModel.panels.map((panel) => {
            const panelName = panelDisplayItems.find(p => p.panelId === panel.id)!.name;
            const parentName = panelDisplayItems.find(p => p.panelId === panel.parentPanelId)?.name;
            return (
              <li key={panel.id} className={activePanelId === panel.id ? 'active' : ''}>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanelId(panel.id);
                    setActiveHoleId(null);
                  }}
                >
                  <span>
                    <strong>{panelName}</strong>
                    {parentName ? <small>{panelName} in {parentName}</small> : null}
                  </span>
                </button>
                <NumericField
                  id={`pm-panel-thickness-${panel.id}`}
                  label="Thickness"
                  min={0}
                  step={0.01}
                  value={panelManager.panels[panel.id]?.thicknessMm ?? 0}
                  onFocus={() => {
                    setActivePanelId(panel.id);
                    setActiveHoleId(null);
                  }}
                  onChange={(thicknessMm) => updatePanelThickness(panel.id, Number.isFinite(thicknessMm) ? thicknessMm : 0)}
                />
              </li>
            );
          })}
        </ul>
      ) : <p className="muted">No panels detected.</p>}
    </div>
  );

  const inspectSource = (id: string) => {
    if (!projectOwner.selectBoxSource(id)) return;
    invalidateInteractions();
    setActiveTool(projectOwner.getBoxScope().working ? 'select' : 'PM');
  };
  const sourceLabel = (id: string) => sketchDefinitions.find(d => d.operation.id === id)?.sketch.name ?? 'Imported SVG';
  const openBoxEntry = (requested: BoxChronologyEntry) => {
    const entry = projectOwner.getSnapshot().chronology?.find(e => e.id === requested.id);
    if (!entry || entry.kind === 'sketch' || !canNavigate()) return;
    if (activeWorkspace !== 'construction' && !projectOwner.navigate('construction', leaveWorkspace)) return;
    if (!projectOwner.selectBoxSource(entry.sourceId)) return;
    invalidateInteractions();
    setInspectedEntryId(entry.id);
    const scope = projectOwner.getBoxScope();
    setActiveTool(scope.working ? entry.kind : 'PM');
    if (!scope.working) return;
    const group = (entry.kind === 'TB' || entry.kind === 'W' || entry.kind === 'S')
      && connectionGroups(scope.box, entry.kind).find(g => g.groupId === entry.groupId);
    const member = group ? group.connectionIds.find(id => scope.box.connections[id]) : entry.connectionId;
    projectOwner.setBoxContext({ assignmentTargetConnectionId: member ?? null, displayConnectionId: member ?? null, selectedEdgeId: null });
    setInspectedEntryId(entry.id);
    if (entry.kind === 'TB' || entry.kind === 'S') setRevealConnection(member ?? null);
  };

  const canNavigate = () => !isClearDialogOpen && !importLock.isImporting && session === projectOwner.getPublication().session;
  const leaveWorkspace = (source: SupportedWorkspace) => {
    setHoverSources([]);
    setSourceChoices([]);
    if (source === 'drawing') drawingInteraction.current?.leaveWorkspace();
    else {
      cancelCanvasPan();
      pointerEpoch.current = -1;
    }
  };
  const openSketchOperation = (id: string) => {
    if (canNavigate()) flushSync(() => projectOwner.openSketchOperation(id, leaveWorkspace));
  };

  return (
    <>
    <dialog ref={importLock.dialogRef} className="svg-import-dialog" aria-modal="true"
      aria-labelledby="svg-import-title" aria-describedby="svg-import-description" tabIndex={-1}
      onCancel={(event) => event.preventDefault()}>
      <h2 id="svg-import-title">Importing SVG…</h2>
      <p id="svg-import-description">Please wait while the file is being imported.</p>
    </dialog>
    {isClearDialogOpen && <ClearProjectDialog onCancel={cancelClearProject} onConfirm={clearProject} />}
    <main className="app-shell" inert={importLock.isImporting} aria-busy={importLock.isImporting}>
      <WorkspaceTopBar
        activeWorkspace={activeWorkspace} editingSketch={editingSketchId !== null}
        onSelectWorkspace={(workspace) => {
          if (canNavigate()) flushSync(() => projectOwner.navigate(workspace, leaveWorkspace));
        }}
        onImport={handleImportWithError}
        onExport={exportSvg}
        onClear={requestClearProject}
        focusClearOnMount={session.startRevision > 0}
        onDrawingToolsHostChange={setDrawingToolsHost}
        canExport={!isProjectLocked && !needsGeometryApply && !box.dependencyDiagnostics?.length && Object.keys(edgeAssignments).length > 0}
        history={{ canUndo: history.undo.length > 0 || pendingProfileSegment, canRedo: history.redo.length > 0,
          onUndo: () => runHistoryCommand('undo'), onRedo: () => runHistoryCommand('redo') }}
      />
      <a ref={downloadRef} className="visually-hidden" aria-hidden="true">download</a>

      {isPanelManagerModalOpen && (
        <div className="clear-dialog-backdrop" role="presentation">
          <div className="clear-dialog panel-manager-modal" role="dialog" aria-modal="true" aria-labelledby="panel-manager-title">
            <h2 id="panel-manager-title">Panel Manager</h2>
            <div className="panel-manager-modal-content">
              <h3>Import summary</h3>
              <p>Panel count: {svgModel.panels.length}</p>
              <p>Hole count: {svgModel.panels.reduce((total, panel) => total + panel.innerContours.length, 0)}</p>
              {formatImportDiagnosticMessage(svgModel).split('\n').map((line) => <p key={line}>{line}</p>)}
              <p>Please assign panel thickness in Panel Manager before continuing, or accept the project default thickness.</p>
            </div>
            <div className="clear-dialog-actions">
              <button className="toolbar-button primary" type="button" onClick={() => { setIsPanelManagerModalOpen(false); setActiveTool('PM'); }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && <div className="notice">{errorMessage}</div>}

      <DrawingWorkspace editingSketchId={editingSketchId}
        definitions={sketchDefinitions} onNewSketch={() => projectOwner.newSketch()} onOpenSketch={openSketchOperation}
        onFinishSketch={() => {
          drawingInteraction.current?.leaveWorkspace();
          setDrawingConstraintsPanelOpen(false);
          projectOwner.finishSketch();
        }}
        isActive={activeWorkspace === 'drawing'} document={drawingDocument} viewBox={drawingViewBox} publishDrawingEdit={drawingTransactions.transact} ownedDocumentRef={drawingTransactions.documentRef} setViewBox={setDrawingViewBox} constraintsPanelOpen={drawingConstraintsPanelOpen} setConstraintsPanelOpen={setDrawingConstraintsPanelOpen} interactionRef={drawingInteraction} onPendingSegment={setPendingProfileSegment} getEpoch={projectOwner.getEpoch} headerToolsHost={drawingToolsHost} />
      <WorkspaceShell active={activeWorkspace === 'construction'} className="workspace" label="SVG connection workspace">
        <aside className="tool-sidebar" aria-label="Tool sidebar">
          {([
            ['PM', 'PM', 'Panel Manager'],
            ['select', 'Select', 'Select and inspect existing edges'],
            ['TB', 'TB', 'Tab/box edge tool alias for Top/Bottom connections'],
            ['W', 'W', 'Wall connection authoring'],
            ['S', 'S', 'Slot connection workflow'],
            ['J', 'J', 'Future joint tool placeholder'],
            ['P', 'P', 'Future pattern tool placeholder'],
            ['manufacturing', 'MFG', 'Global manufacturing settings'],
          ] as const).filter(([tool]) => !isProjectLocked || tool === 'PM').map(([tool, label, title]) => (
            <button
              key={tool}
              type="button"
              className={`tool-button cad-tool-button${activeTool === tool ? ' active' : ''}`}
              title={title}
              aria-pressed={activeTool === tool}
              aria-label={tool === 'PM' ? 'Panel Manager' : undefined}
              onClick={tool === 'manufacturing' ? openManufacturing : () => handleToolClick(tool)}
              disabled={isProjectLocked && !['select', 'PM'].includes(tool)}
            >
              {label}
            </button>
          ))}
        </aside>

        {(activeTool !== 'select' || selectedEdge) && <aside key={renderEpoch} className="active-tool-panel panel" aria-label="Active Tool overlay">
          <div className="panel-heading">
            <p className="eyebrow">Active tool</p>
            <h2>{activeTool === 'PM' ? 'Panel Manager' : activeTool === 'TB' ? 'TB / Top Bottom' : activeTool === 'manufacturing' ? 'Manufacturing' : activeTool}</h2>
          </div>

          {activeTool === 'PM' && boxSources && <div className="box-source-selector">
            <label>Panel source <select aria-label="Panel source" value={sourceId}
              onChange={event => inspectSource(event.target.value)}>
              {(sourceId === IMPORTED_SOURCE || hasImportedSource(project.box)) && <option value={IMPORTED_SOURCE}>Imported SVG</option>}
              {sketchDefinitions.map(({ operation, sketch }) => <option key={operation.id} value={operation.id}>{sketch.name}</option>)}
            </select></label>
            <span>{sourceStatus(box)}</span>
            {svgModel.drawingSource?.excludedMembers ? <small>{svgModel.drawingSource.excludedMembers} open, invalid or unsupported members excluded. Panels require closed Line contours.</small> : null}
          </div>}
          {(activeTool === 'PM' || hasContextualGeometryActions) && (
            <div className="contextual-tool-actions" role="group" aria-label="Active workflow actions">
              {activeTool === 'PM' ? <>
                <button className="toolbar-button primary" type="button" onClick={applyPanelManager} disabled={!canApplyPanelManager}>Apply</button>
                <button className="toolbar-button" type="button" onClick={finishPanelManager} disabled={!panelManager.isApplied}>OK</button>
              </> : <>
                <button className="toolbar-button primary" type="button" onClick={applyPanelPaths} disabled={isProjectLocked || !hasApplyInputs}>Apply</button>
                {activeWorkflowFinish && <button className="toolbar-button" type="button"
                  onClick={activeWorkflowFinish.onClick} disabled={isProjectLocked}
                  title={`OK · ${activeTool} Group`}>{activeWorkflowFinish.label}</button>}
              </>}
            </div>
          )}

          {activeTool === 'PM' && (
            <div className="active-tool-card">
              <div className="pm-actions">
                <button className="toolbar-button" type="button" onClick={acceptDefaultPanelThickness}>Accept default thickness</button>
              </div>
              {panelManagerValidationMessage ? <p className="notice inline-notice">{panelManagerValidationMessage}</p> : null}
              {renderPanelList()}
            </div>
          )}

          {activeTool === 'select' && (
            <div className="selection-card active-tool-card">
              <h3>Selection</h3>
              <p className="muted">Inspect the selected edge and its assigned connection. Use the left toolbar to switch tools.</p>
              {selectedEdge ? (
                <dl>
                  <dt>Edge</dt>
                  <dd>{edgeName(selectedEdge.id)}</dd>
                  <dt>Source</dt>
                  <dd>{svgModel.drawingSource ? sourceName : selectedEdge.source}</dd>
                  <dt>Connection</dt>
                  <dd>{getAssignedConnectionId(edgeAssignments[selectedEdge.id]) ?? 'Unassigned'}</dd>
                </dl>
              ) : (
                <p className="muted">No edge selected.</p>
              )}
            </div>
          )}


          {isProjectLocked && activeTool !== 'PM' && (
            <div className="active-tool-card">
              <h3>Project locked</h3>
              <p className="muted">Apply Panel Manager before using TB, S, Manufacturing, edge assignment, export, or future tools.</p>
            </div>
          )}

          {!isProjectLocked && activeTool === 'manufacturing' && (
            <div className="active-tool-card manufacturing-card">
              <h3>Manufacturing settings</h3>
              <div className="property-grid">
                <FixedPrecisionNumericField id="manufacturing-kerf" label="Kerf" min={0} value={projectSettings.kerfMm} onChange={(kerfMm) => updateProjectSettings({ kerfMm })} />
                <FixedPrecisionNumericField id="manufacturing-tap-clearance" label="Tap Clearance" value={projectSettings.tapClearanceMm} onChange={(tapClearanceMm) => updateProjectSettings({ tapClearanceMm })} />
                <FixedPrecisionNumericField id="manufacturing-slot-clearance" label="Slot Clearance" value={projectSettings.slotClearanceMm} onChange={(slotClearanceMm) => updateProjectSettings({ slotClearanceMm })} />
              </div>
              <p className="muted">Kerf applies globally to the whole generated output.</p>
              <p className="muted">Tap Clearance applies automatically to all generator-authored male taps.</p>
              <p className="muted">Slot clearance applies only to S-generated slot contours before Kerf.</p>
              <section className="profile-offset-group" aria-labelledby="profile-offset-heading">
                <div className="profile-offset-heading">
                  <div><h4 id="profile-offset-heading">Profile Offset</h4><p>Apply an offset to selected profiles.</p></div>
                  <span>{projectSettings.selectedProfileOffsetIds.length} selected</span>
                </div>
                <FixedPrecisionNumericField id="manufacturing-profile-offset" label="Offset" value={projectSettings.profileOffsetMm} onChange={(profileOffsetMm) => updateProjectSettings({ profileOffsetMm })} />
                <div className="profile-offset-profile-actions">
                  <button className={`toolbar-button${isProfileOffsetProfileSelectionActive ? ' primary' : ''}`} type="button" aria-pressed={isProfileOffsetProfileSelectionActive} onClick={() => setIsProfileOffsetProfileSelectionActive((active) => !active)}>Select Profiles</button>
                  <button className="toolbar-button" type="button" disabled={projectSettings.selectedProfileOffsetIds.length === 0} onClick={() => updateProjectSettings({ selectedProfileOffsetIds: [] })}>Clear Selection</button>
                </div>
                <div className="profile-offset-list"><span>Available Profiles</span><strong>{selectableProfileOffsetProfiles.length}</strong></div>
                <div className="selected-profile-list">
                  <span>Selected Profiles</span>
                  {projectSettings.selectedProfileOffsetIds.length > 0
                    ? <ul>{projectSettings.selectedProfileOffsetIds.map((id) => <li key={id}>{id}</li>)}</ul>
                    : <p>None selected</p>}
                </div>
              </section>
              {kerfCompensatedAppliedPreview.diagnostics.map((diagnostic, index) => (
                <p className="notice inline-notice" key={`${diagnostic.id}:${diagnostic.code ?? index}`}>{diagnostic.message}</p>
              ))}
            </div>
          )}

          {!isProjectLocked && (activeTool === 'J' || activeTool === 'P') && (
            <div className="active-tool-card placeholder-card">
              <h3>{activeTool === 'J' ? 'Join coming soon' : 'Pattern coming soon'}</h3>
              <p className="muted">This tool is a placeholder and has no actions yet.</p>
            </div>
          )}

          {!isProjectLocked && (activeTool === 'TB' || activeTool === 'W' || activeTool === 'S') && (
            <>
              <div className="active-label-card" aria-live="polite">
                <span>Selected connection</span>
                <strong>{activeTool === 'TB' ? formatTBDisplayLabel(selectedLabelId) : selectedLabelId ?? 'None'}</strong>
              </div>

              <div className="label-manager">
                {labelsByGroup
                  .filter(({ prefix }) => (activeTool === 'TB' ? prefix === 'TB' : prefix === activeTool))
                  .map(({ prefix, name, description, labels: groupLabels }) => (
              <section className="label-group" key={prefix} aria-label={name}>
                <div className="label-group-header">
                  <div>
                    <h3>{prefix === 'TB' ? 'TB / Top Bottom' : `${prefix} = ${name}`}</h3>
                    <p>{prefix === 'TB' ? 'Top/Bottom connections' : description}</p>
                  </div>
                  {prefix !== 'TB' && prefix !== 'S' && (
                    <div className="label-actions">
                      <button type="button" onClick={() => createLabel(prefix)}>
                        Add {getNextLabel(prefix, availableLabels)}
                      </button>
                    </div>
                  )}
                </div>

                {groupLabels.length > 0 ? (
                  prefix === 'TB' ? (
                    <ul className="label-list s-group-list">
                      {tbLabelGroups.map((tbGroup, groupIndex) => {
                        if (inspectorMembers && !tbGroup.labels.some(id => inspectorMembers.has(id))) return null;
                        const isExpanded = tbGroup.isActive || expandedTBGroups[tbGroup.id] === true;
                        const groupCount = tbGroup.labels.length;

                        return (
                          <li key={tbGroup.id}>
                            <button
                              type="button"
                              className={`s-group-toggle${tbGroup.labels.includes(selectedLabelId ?? '') ? ' selected-label' : ''}`}
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedTBGroups((currentGroups) => ({ ...currentGroups, [tbGroup.id]: !isExpanded }))}
                            >
                              <strong>TB Group {groupIndex + 1} ({groupCount})</strong>
                              <span>{isExpanded ? 'Hide' : 'Show'}</span>
                            </button>
                            {isExpanded && (
                              <ul className="s-group-connection-list">
                                {tbGroup.labels.map((label) => (
                                  <li key={label}>
                                    <button
                                      type="button"
                                      className={selectedLabelId === label ? 'selected-label' : ''}
                                      onClick={() => {
                                        selectConnectionForDisplayAndAssignment(label);
                                        setErrorMessage('');
                                      }}
                                    >
                                      <strong>{formatTBDisplayLabel(label)}</strong>
                                      <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : prefix === 'S' ? (
                    <ul className="label-list s-group-list">
                      {sLabelGroups.map((sGroup, groupIndex) => {
                        if (inspectorMembers && !sGroup.labels.some(id => inspectorMembers.has(id))) return null;
                        const isExpanded = sGroup.isActive || expandedSGroups[sGroup.id] === true;
                        const groupName = getSGroupDisplayName(groupIndex);
                        const groupCount = sGroup.labels.length;

                        return (
                          <li key={sGroup.id}>
                            <button
                              type="button"
                              className={`s-group-toggle${sGroup.labels.includes(selectedLabelId ?? '') ? ' selected-label' : ''}`}
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedSGroups((currentGroups) => ({ ...currentGroups, [sGroup.id]: !isExpanded }))}
                            >
                              <strong>{groupName} ({groupCount})</strong>
                              <span>{isExpanded ? 'Hide' : 'Show'}</span>
                            </button>
                            {isExpanded && (
                              <ul className="s-group-connection-list">
                                {sGroup.labels.map((label) => (
                                  <li key={label}>
                                    <button
                                      type="button"
                                      className={selectedLabelId === label ? 'selected-label' : ''}
                                      onClick={() => {
                                        selectConnectionForDisplayAndAssignment(label);
                                        setErrorMessage('');
                                      }}
                                    >
                                      <strong>{label}</strong>
                                      <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="label-list">
                      {groupLabels.filter(id => !inspectorMembers || inspectorMembers.has(id)).map((label) => (
                        <li key={label}>
                          <button
                            type="button"
                            className={selectedLabelId === label ? 'selected-label' : ''}
                            onClick={() => {
                              selectConnectionForDisplayAndAssignment(label);
                              setErrorMessage('');
                            }}
                          >
                            <strong>{label}</strong>
                            <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <p className="empty-labels">No {prefix === 'TB' ? 'TB / Top Bottom' : prefix} connections yet.</p>
                )}
              </section>
            ))}
              </div>

              <div className="properties-card">
                <div>
                  <p className="eyebrow">Connection</p>
                  <h3>{selectedConnection ? `${activeTool === 'TB' ? formatTBDisplayLabel(selectedConnection.id) : selectedConnection.id} details` : 'No connection selected'}</h3>
                </div>
                {renderPropertiesPanel()}
              </div>
            </>
          )}

        </aside>}

        <section className="canvas-card workspace-canvas">
          <div className="canvas-frame" ref={canvasFrameRef}>
            <div key={renderEpoch} className="canvas-history-controls" aria-label="Canvas compact property controls">
              {renderCompactControls()}
            </div>
            <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
              <button type="button" onClick={() => zoomCanvas(buttonZoomFactor)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => zoomCanvas(1 / buttonZoomFactor)} aria-label="Zoom out">−</button>
              <button type="button" onClick={fitCanvasToScreen}>Fit</button>
            </div>
            {boxSources && <div className="box-source-indicator" role="status">{working ? 'Working on ' + sourceName : 'Panel Manager review'}
              {needsGeometryApply && working && ' · Apply geometry before export'}</div>}
            {hoverSources.length > 0 && <div className="box-hover-label" role="tooltip">{hoverSources.map(sourceLabel).join(' · ')}</div>}
            {sourceChoices.length > 1 && <div className="sketch-overlap-choices panel" role="group" aria-label="Choose a BOX source">
              {sourceChoices.map(id => <button key={id} type="button" onClick={() => inspectSource(id)}>{sourceLabel(id)}</button>)}
            </div>}
            <svg
              ref={svgRef}
              className={`design-svg cad-viewport-interaction${isCanvasPanning ? ' is-panning' : ''}`}
              viewBox={formatViewBox(canvasViewBox)}
              role="img"
              aria-label="Imported SVG with selectable edges"
              onPointerDownCapture={() => { pointerEpoch.current = projectOwner.getEpoch(); }}
              onClickCapture={(event) => {
                if (event.detail && pointerEpoch.current !== projectOwner.getEpoch()) { event.stopPropagation(); return; }
                if (!boxSources) return;
                const target = event.target as Element;
                if (target.closest('.profile-offset-profile-hitbox') || (hasContextualGeometryActions && target.closest('.edge-hitbox'))) return;
                const hits = sourceHits(event.clientX, event.clientY);
                setSourceChoices(hits.length > 1 ? hits : []);
                if (hits.length > 1) { event.stopPropagation(); return; }
                if (hits.length && (hits[0] !== sourceId || !working)) {
                  event.stopPropagation();
                  inspectSource(hits[0]);
                }
              }}
              onPointerDown={canvasPanHandlers.onPointerDown}
              onPointerLeave={() => setHoverSources([])}
              onPointerMove={event => {
                if (canvasPanHandlers.onPointerMove(event) || !boxSources || event.buttons) return;
                const edge = (event.target as Element).closest('.edge-hitbox,.profile-offset-profile-hitbox');
                const hits = edge && hasContextualGeometryActions ? [] : sourceHits(event.clientX, event.clientY);
                const hovered = hits.filter(id => !working || id !== sourceId);
                setHoverSources(current => current.length === hovered.length && current.every((id, i) => id === hovered[i]) ? current : hovered);
              }}
              onPointerUp={canvasPanHandlers.onPointerUp}
              onPointerCancel={canvasPanHandlers.onPointerCancel}
              onContextMenu={canvasPanHandlers.onContextMenu}
            >
              {activeWorkspace === 'construction' && boxSources && <>
                {hasImportedSource(project.box) && <g data-source-id={IMPORTED_SOURCE}>
                  {project.box.svgModel.panels.map(panel => <path key={panel.id} className="box-import-reference"
                    style={{ stroke: sourceId === IMPORTED_SOURCE ? 'transparent' : '#71828c' }} d={getPanelPathD(panel)} />)}
                </g>}
                {sketchDefinitions.map(definition => <BoxSketchLayer key={definition.operation.id}
                  definition={definition} box={boxSources.sketches[definition.operation.id]}
                  activePreview={working && sourceId === definition.operation.id ? kerfCompensatedAppliedPreview : undefined}
                  highlighted={hoverSources.includes(definition.operation.id)} />)}
              </>}
              {isProfileOffsetProfileSelectionActive && (
                <g className="profile-offset-profile-underlays" aria-hidden="true">
                  {selectableProfileOffsetProfiles.map((profile) => (
                    <path
                      key={`${profile.contourId}:${profile.id}`}
                      className={`profile-offset-profile-underlay${profile.selected ? ' selected' : ''}${hoveredProfileOffsetProfileId === profile.id ? ' hovered' : ''}`}
                      d={profile.pathD}
                    />
                  ))}
                </g>
              )}
              {!svgModel.drawingSource && <g className="final-contour-kerf-layer">
                {kerfCompensatedAppliedPreview.contours.map((contour) => (
                  <path
                    key={contour.id}
                    className={contour.kind === 'INNER' ? 'final-slot-path' : 'final-panel-path'}
                    d={contour.pathD}
                  />
                ))}
              </g>}
              {isPanelManagerVisible && (
                <g className="panel-manager-overlays" aria-hidden="true">
                  {panelTreeHoleItems.map((hole) => (
                    <path key={hole.id} className={`panel-manager-hole-highlight${activeHoleId === hole.id ? ' active' : ''}`} d={hole.pathD} />
                  ))}
                  {panelDisplayItems.map((panel) => (
                    <g key={panel.panelId}>
                      {activePanelId === panel.panelId ? <path className="panel-manager-panel-highlight active" d={panel.pathD} /> : null}
                      <CanvasAnnotation className="panel-manager-label" label={panel.name} x={panel.labelX} y={panel.labelY - (12 * labelScale)} width={24} height={15} scale={labelScale} leaderTo={{ x: panel.labelX, y: panel.labelY }} />
                    </g>
                  ))}
                </g>
              )}
              {(!svgModel.drawingSource || working) && <g className="edge-overlays" data-source-id={sourceId}>
                  {svgModel.edges.map((edge) => {
                  const assignment = displayEdgeAssignments[edge.id];
                  const labels = getEdgeAssignmentDisplayLabels(assignment);
                  const label = labels[0];
                  const selected = selectedEdgeId === edge.id;
                  const edgeLabelPlacements = labelPlacementsByEdgeId.get(edge.id) ?? [];
                  const panelId = panelIdByEdgeId.get(edge.id);
                  const generatedRelationship = panelId
                    ? generatedCanvasEdgeRelationships.bySource.get(sourceEdgeRelationshipKey(panelId, edge.id))
                    : undefined;
                  // Selection styling policy remains unchanged: an applied replacement hides the authoring overlay.
                  // References are deliberately independent and never masquerade as replacement ownership.
                  const showHighlight = (label || selected) && !generatedRelationship?.replacementOwner;

                  return (
                    <g key={edge.id}>
                      {showHighlight && (
                        <line
                          className={`edge-highlight${label ? ' labeled' : ''}${selected ? ' selected' : ''}`}
                          x1={edge.start.x}
                          y1={edge.start.y}
                          x2={edge.end.x}
                          y2={edge.end.y}
                        />
                      )}
                      <line
                        className="edge-hitbox"
                        x1={edge.start.x}
                        y1={edge.start.y}
                        x2={edge.end.x}
                        y2={edge.end.y}
                        onPointerDown={(event) => {
                          if (event.button === 0) event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          assignSelectedLabelToEdge(edge.id);
                        }}
                      />
                      {edgeLabelPlacements.map((labelPlacement) => (
                        <CanvasAnnotation
                          key={`${edge.id}-${labelPlacement.label}`}
                          label={labelPlacement.label}
                          x={labelPlacement.x}
                          y={labelPlacement.y}
                          width={labelPlacement.width}
                          height={labelPlacement.height}
                          scale={labelScale}
                          leaderTo={labelPlacement.leaderTo}
                        />
                      ))}
                    </g>
                  );
                  })}
                </g>}
              {isProfileOffsetProfileSelectionActive && (
                <g className="profile-offset-profile-hit-targets">
                  {selectableProfileOffsetProfiles.map((profile) => (
                    <path
                      key={`${profile.contourId}:${profile.id}`}
                      className="profile-offset-profile-hitbox"
                      d={profile.pathD}
                      onPointerEnter={() => setHoveredProfileOffsetProfileId(profile.id)}
                      onPointerLeave={() => setHoveredProfileOffsetProfileId((id) => id === profile.id ? null : id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); toggleProfileOffsetProfile(profile.id); }}
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>
        </section>
      </WorkspaceShell>
      <SharedHistoryRegion
        workspace={activeWorkspace} definitions={sketchDefinitions} editingSketchId={editingSketchId} onOpenSketch={openSketchOperation}
        chronology={project.chronology!} onOpenBox={openBoxEntry} selectedBoxEntry={selectedBoxEntry?.id}
        sources={project.boxSources} imported={project.box} inspectedEntryId={inspectedEntryId}
      />
    </main>
    </>
  );
}

export default App;
