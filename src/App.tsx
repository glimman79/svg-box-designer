import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';
import { exportLabeledSvg, formatImportDiagnosticMessage, getEdgeAssignmentDisplayLabels, getEdgeLabelPlacements, parseSvgDocument } from './svgUtils';
import { getBucketEdgeAssignment, getBucketSlotAssignments, toEdgeAssignmentBucket } from './app/assignmentBuckets';
import { exportManufacturingGeometrySvg } from './app/exportFinalGeometrySvg';
import { buildAppliedSGeometry, recalculateAutomaticSSlotLengths, resolveSSlotLengthMm, resolveSThickness } from './app/sGeometry';
import { getConnectionViewModel, resolveAssignedTBOrSConnectionIdForEdge } from './app/connectionViewModel';
import { buildKerfCompensatedPreviewFromFinalContours } from './app/manufacturingCompensation';
import { buildFinalGeometry } from './app/finalGeometry';
import { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, finishSGroupWithTrailingCleanup, finishSGroupWorkflow, getDefaultSlotRole, manualAddSWorkflow, maybeAutoCreateNextSInGroup, startSGroupWorkflow } from './app/sWorkflow';
import { buildActiveWDisplayAssignments, finishWGroupWorkflow } from './app/wWorkflow';
import { appendAutoCreatedEToTBGroup, buildTBCanvasLabelAliasMap, finishTBGroupWithTrailingCleanup, finishTBGroupWorkflow, startTBGroupWorkflow } from './app/tbWorkflow';
import { applyTabsToContour, buildInsetPanelContour, buildPanelGeometry, buildTabSegmentPlansByConnectionId, getPanelEdgeOperations, buildAppliedEPanelPaths, recalculateAutomaticTBFingerWidths, resolveTBThickness } from './app/eGeometry';
import { buildPanelContainmentTree, createPanelManagerStateFromModel, defaultPanelManagerState, validatePanelManagerState } from './app/panelManagerModel';
import type { PanelContour, PanelEdgeOperation, PanelGeometryBuildResult, TabSegmentPlan } from './app/eGeometry';
import type { PanelManagerState, PanelTreeHoleNode, PanelTreePanelNode } from './app/panelManagerModel';
import { createTabSegmentPlan, pointsToClosedPathD, projectPointDistanceOnSide } from './app/sharedGeometry';
import { getContourEdgePoints, validateClosedPanel } from './app/sharedPanelGeometry';
import type { EdgeAssignment, EdgeAssignmentBucket, EdgeAssignmentRecord, EdgeRole, Point, SlotRole, SourceBounds, SvgDocumentModel, SvgEdge } from './svgUtils';
import type { ActiveSGroup, ActiveTBGroup, ActiveWGroup, AppliedEPanelPath, AppliedSGeometry, ConnectionDefinition, ConnectionMap, ConnectionPropertiesByPrefix, CornerConnectionDefinition, CornerConnectionProperties, EdgeConnectionDefinition, EdgeConnectionProperties, PatternConnectionDefinition, PatternConnectionProperties, SlotConnectionDefinition, SlotConnectionProperties, WallConnectionDefinition, WallConnectionProperties, WallPatternType, WallReference } from './app/connectionTypes';
export { createTabSegmentPlan, pointsToClosedPathD } from './app/sharedGeometry';
export { edgeMatchesContourSide, getContourEdgePoints, getTabSegmentsForRole, validateClosedPanel } from './app/sharedPanelGeometry';
export type { PanelValidationResult } from './app/sharedPanelGeometry';
export { exportFinalGeometrySvg, exportManufacturingGeometrySvg } from './app/exportFinalGeometrySvg';
export { getConnectionViewModel, getSConnectionViewModel, getTBConnectionViewModel, resolveAssignedTBOrSConnectionIdForEdge } from './app/connectionViewModel';
export { buildFinalGeometry } from './app/finalGeometry';
export { buildAppliedSGeometry, recalculateAutomaticSSlotLengths, resolveSSlotLengthMm, resolveSThickness } from './app/sGeometry';
export { buildPanelContainmentTree, createPanelManagerStateFromModel, defaultPanelManagerState, validatePanelManagerState } from './app/panelManagerModel';
export { applyActiveSGroupSlotPropertyUpdates, applySlotPropertyUpdates, createCopiedSConnection, createStandaloneSConnection, finishSGroupWithTrailingCleanup, finishSGroupWorkflow, getDefaultSlotRole, isCompleteSConnection, manualAddSWorkflow, maybeAutoCreateNextSInGroup, startSGroupWorkflow } from './app/sWorkflow';
export { appendAutoCreatedEToTBGroup, buildTBCanvasLabelAliasMap, finishTBGroupWithTrailingCleanup, finishTBGroupWorkflow, getNextInternalELabel, getTBGroupActionNumber, startTBGroupWorkflow } from './app/tbWorkflow';
export { buildActiveWDisplayAssignments, classifyWReferencePattern, collectWReferences, finishWGroupWorkflow, generateWEdgeRoles, invertWPatternType } from './app/wWorkflow';
// classifyAppliedContours is intentionally re-exported only as a compatibility/test helper.
export { buildFinalContourList, classifyAppliedContours, classifyContoursByContainment, classifyFinalContours, classifyImportedPanelContours } from './app/contourClassification';
export { applySlotClearance, buildKerfCompensatedPreviewFromFinalContours, cleanContourPointsForOffset, compensateClassifiedContours, compensateContourPoints, getKerfCompensationMm, pathDToClosedContour } from './app/manufacturingCompensation';
export type { ClassifiedContour, ClassifiedContourSource, ContourKind } from './app/contourClassification';
export { applyTabsToContour, buildAppliedEPanelPaths, buildInsetPanelContour, buildPanelGeometry, buildTabSegmentPlansByConnectionId, getPanelEdgeOperations, getPanelThickness, getPanelThicknessForEdge, recalculateAutomaticTBFingerWidths, resolveTBThickness } from './app/eGeometry';
export type { PanelEdgeOperation, PanelGeometryBuildResult, TabSegmentPlan } from './app/eGeometry';
export type { PanelManagerState } from './app/panelManagerModel';
export type { ActiveSGroup, ActiveTBGroup, ActiveWGroup, AppliedEPanelPath, AppliedSGeometry, AppliedSPanelPath, AppliedSSlotPath, ConnectionDefinition, ConnectionMap, EdgeConnectionDefinition, EdgeConnectionProperties, WallPatternType, WallReference } from './app/connectionTypes';

type LabelPrefix = 'E' | 'S' | 'W' | 'C' | 'P';


type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

type ActiveTool = 'select' | 'PM' | 'TB' | 'W' | 'S' | 'J' | 'P' | 'manufacturing';

type ProjectSettings = {
  kerfMm: number;
  slotClearanceMm: number;
};

type HistoryState = {
  projectSettings: ProjectSettings;
  lastAppliedManufacturingSettings: ProjectSettings | null;
  edgeAssignments: Record<string, EdgeAssignmentBucket>;
  connections: ConnectionMap;
  assignmentTargetConnectionId?: string | null;
  displayConnectionId?: string | null;
  selectedLabelId?: string | null;
  selectedEdgeId: string | null;
  appliedEPanelPaths?: AppliedEPanelPath[];
  appliedSGeometry?: AppliedSGeometry[];
  activeSGroup: ActiveSGroup | null;
  activeTBGroup: ActiveTBGroup | null;
  completedTBGroups: ActiveTBGroup[];
  activeWGroup: ActiveWGroup | null;
  workflowGroupOrder: Record<string, number>;
  panelManager: PanelManagerState;
};


type WorkflowHistoryGroup = { id: string; labels: string[]; isActive: boolean; orderIndex?: number };

type WorkflowHistoryItem = {
  id: string;
  kind: 'PM' | 'TB' | 'S' | 'W' | 'manufacturing';
  name: string;
  labels: string[];
  isActive: boolean;
  childCount: number;
};

export const buildWorkflowHistoryItems = (
  tbGroups: WorkflowHistoryGroup[],
  sGroups: WorkflowHistoryGroup[],
  wGroups: WorkflowHistoryGroup[],
  connections: ConnectionMap,
  manufacturingOrderIndex?: number,
  includePanelManager = false,
): WorkflowHistoryItem[] => {
  const manufacturingItem = Number.isFinite(manufacturingOrderIndex) ? [{
      id: 'workflow-history-manufacturing',
      kind: 'manufacturing' as const,
      name: 'MFG',
      labels: [],
      isActive: false,
      childCount: 0,
      orderIndex: manufacturingOrderIndex,
    }] : [];
  const panelManagerItem = includePanelManager ? [{
      id: 'workflow-history-panel-manager',
      kind: 'PM' as const,
      name: 'PM',
      labels: [],
      isActive: false,
      childCount: 0,
      orderIndex: -1,
    }] : [];
  const orderedItems = [
    ...panelManagerItem,
    ...manufacturingItem,
    ...tbGroups.map((group, groupIndex) => ({
      id: group.id,
      kind: 'TB' as const,
      name: `TB Group ${groupIndex + 1}`,
      labels: group.labels,
      isActive: group.isActive,
      childCount: group.labels.length,
      orderIndex: group.orderIndex,
    })),
    ...sGroups.map((group, groupIndex) => ({
      id: group.id,
      kind: 'S' as const,
      name: `S Group ${groupIndex + 1}`,
      labels: group.labels,
      isActive: group.isActive,
      childCount: group.labels.length,
      orderIndex: group.orderIndex,
    })),
    ...wGroups.map((group, groupIndex) => {
      const label = group.labels[0];
      const connection = label ? connections[label] : undefined;
      const selectedEdgeCount = connection?.prefix === 'W' ? connection.properties.selectedEdgeIds.length : group.labels.length;

      return {
        id: group.id,
        kind: 'W' as const,
        name: `W Group ${groupIndex + 1}`,
        labels: group.labels,
        isActive: group.isActive,
        childCount: selectedEdgeCount,
        orderIndex: group.orderIndex,
      };
    }),
  ];

  return orderedItems
    .map((item, fallbackIndex) => ({ item, fallbackIndex }))
    .sort((first, second) => {
      const firstOrder = first.item.orderIndex ?? Number.POSITIVE_INFINITY;
      const secondOrder = second.item.orderIndex ?? Number.POSITIVE_INFINITY;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return first.fallbackIndex - second.fallbackIndex;
    })
    .map(({ item }) => {
      const { orderIndex: _orderIndex, ...historyItem } = item;
      return historyItem;
    });
};


export const getWorkflowHistoryTool = (item: WorkflowHistoryItem): ActiveTool => item.kind === 'manufacturing' ? 'manufacturing' : item.kind;

export const getToolClickGroupStartKind = (
  tool: ActiveTool,
  activeTBGroup: ActiveTBGroup | null,
  activeSGroup: ActiveSGroup | null,
  activeWGroup: ActiveWGroup | null,
): 'TB' | 'S' | 'W' | null => {
  if (tool === 'TB') {
    return activeTBGroup?.isActive ? null : 'TB';
  }

  if (tool === 'S') {
    return activeSGroup?.isActive ? null : 'S';
  }

  if (tool === 'W') {
    return activeWGroup?.isActive ? null : 'W';
  }

  return null;
};

const defaultProjectSettings: ProjectSettings = {
  kerfMm: 0.15,
  slotClearanceMm: 0,
};

const maxHistoryEntries = 10;

export const haveProjectSettingsChanged = (currentSettings: ProjectSettings, appliedSettings: ProjectSettings | null): boolean => {
  const baseline = appliedSettings ?? defaultProjectSettings;
  return currentSettings.kerfMm !== baseline.kerfMm || currentSettings.slotClearanceMm !== baseline.slotClearanceMm;
};

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

const cloneHistoryState = (state: HistoryState): HistoryState => ({
  projectSettings: structuredClone(state.projectSettings ?? defaultProjectSettings),
  lastAppliedManufacturingSettings: state.lastAppliedManufacturingSettings ? structuredClone(state.lastAppliedManufacturingSettings) : null,
  edgeAssignments: structuredClone(state.edgeAssignments),
  connections: structuredClone(state.connections),
  assignmentTargetConnectionId: state.assignmentTargetConnectionId ?? state.selectedLabelId ?? null,
  displayConnectionId: state.displayConnectionId ?? state.selectedLabelId ?? null,
  selectedLabelId: state.displayConnectionId ?? state.selectedLabelId ?? null,
  selectedEdgeId: state.selectedEdgeId,
  ...(state.appliedEPanelPaths ? { appliedEPanelPaths: structuredClone(state.appliedEPanelPaths) } : {}),
  ...(state.appliedSGeometry ? { appliedSGeometry: structuredClone(state.appliedSGeometry) } : {}),
  activeSGroup: state.activeSGroup ? structuredClone(state.activeSGroup) : null,
  activeTBGroup: state.activeTBGroup ? structuredClone(state.activeTBGroup) : null,
  completedTBGroups: structuredClone(state.completedTBGroups ?? []),
  activeWGroup: state.activeWGroup ? structuredClone(state.activeWGroup) : null,
  workflowGroupOrder: structuredClone(state.workflowGroupOrder ?? {}),
  panelManager: structuredClone(state.panelManager ?? defaultPanelManagerState),
});

export const recomputeAppliedTBGeometryForPanelManager = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelManager: PanelManagerState,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[] = [],
) => {
  const nextConnections = recalculateAutomaticTBFingerWidths(
    svgModel,
    assignments,
    recalculateAutomaticSSlotLengths(svgModel, assignments, connectionMap, panelManager),
    panelManager,
  );
  const hasAppliedTBGeometry = appliedEPanelPaths.length > 0;
  const hasTBAssignments = Object.values(assignments).some((bucket) => {
    const assignment = getBucketEdgeAssignment(bucket);
    return assignment ? nextConnections[assignment.connectionId]?.prefix === 'E' : false;
  });

  const hasAppliedSGeometry = appliedSGeometry.length > 0;

  return {
    connections: nextConnections,
    appliedEPanelPaths: hasAppliedTBGeometry || hasTBAssignments
      ? buildAppliedEPanelPaths(svgModel, assignments, nextConnections, panelManager)
      : appliedEPanelPaths,
    appliedSGeometry: hasAppliedSGeometry
      ? buildAppliedSGeometry(svgModel, assignments, nextConnections, panelManager)
      : appliedSGeometry,
  };
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

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
};



const emptySvgModel: SvgDocumentModel = {
  content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>',
  innerMarkup: '',
  rootAttributes: {
    width: null,
    height: null,
    viewBox: '0 0 800 600',
  },
  viewBox: '0 0 800 600',
  width: 800,
  height: 600,
  edges: [],
  panels: [],
};

const labelGroups: LabelGroup[] = [
  { prefix: 'E', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'W', name: 'Wall connections', description: 'Reusable wall connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern connections', description: 'Reusable pattern connection IDs' },
];

export const defaultConnectionProperties: ConnectionPropertiesByPrefix = {
  E: {
    materialThicknessMm: 3,
    fingerWidthMm: 9,
    isFingerWidthManual: false,
  },
  S: {
    slotOffsetMm: 0,
    slotWidthMm: getDefaultSlotWidth(3),
    slotLengthMm: getDefaultSlotLength(3),
    isSlotLengthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
  },
  W: {
    wallHeightMm: 30,
    materialThicknessMm: 3,
    fingerWidthMm: 9,
    kerfMm: 0.15,
    playMm: 0,
    selectedEdgeIds: [],
    references: [],
    referencePatternType: null,
    generatedPatternType: null,
    generatedConnectionIds: [],
  },
  C: {
    cornerDepthMm: getDefaultCornerDepth(3),
    isCornerDepthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
    cornerType: 'finger',
  },
  P: {
    patternType: 'line-fill',
    patternWidthMm: 20,
    materialThicknessMm: 3,
    lineSpacingMm: 5,
    rowOffsetMm: 0,
    marginMm: 2,
  },
};

const starterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
  <rect x="70" y="45" width="280" height="170" rx="0" fill="none" stroke="#000000" stroke-width="1"/>
  <line x1="70" y1="130" x2="350" y2="130" stroke="#000000" stroke-width="1"/>
</svg>`;

const getLabelPrefix = (label: string) => label.charAt(0) as LabelPrefix;

const getLabelNumber = (label: string) => Number.parseInt(label.slice(1), 10);

const getSGroupDisplayName = (groupIndex: number) => `S Group ${groupIndex + 1}`;

const getSGroupActionNumber = (connections: ConnectionMap, activeSGroup: ActiveSGroup | null) => {
  if (activeSGroup?.isActive) {
    const firstActiveNumber = getLabelNumber(activeSGroup.connectionIds[0] ?? 'S1');
    const previousSLabels = Object.keys(connections).filter((label) => getLabelPrefix(label) === 'S' && getLabelNumber(label) < firstActiveNumber);

    return previousSLabels.length > 0 ? 2 : 1;
  }

  return Object.keys(connections).some((label) => getLabelPrefix(label) === 'S') ? 2 : 1;
};

const getNextLabel = (prefix: LabelPrefix, labels: string[]) => {
  const usedNumbers = labels
    .filter((label) => getLabelPrefix(label) === prefix)
    .map((label) => Number.parseInt(label.slice(1), 10))
    .filter((value) => Number.isFinite(value));

  return `${prefix}${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

const getFollowingEdgeLabel = (label: string) => {
  const labelNumber = Number.parseInt(label.slice(1), 10);

  if (getLabelPrefix(label) !== 'E' || !Number.isFinite(labelNumber)) {
    return null;
  }

  return `E${labelNumber + 1}`;
};

const minZoom = 0.1;
const maxZoom = 20;
const buttonZoomFactor = 1.25;
const wheelZoomSensitivity = 0.0015;
const labelFontSizePx = 13;
const minLabelFontSizePx = 13;
const labelPaddingXPx = 6;
const labelPaddingYPx = 3;
const labelEdgeOffsetPx = 6;

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
function getDefaultSlotLength(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

function getDefaultSlotWidth(materialThicknessMm: number) {
  return materialThicknessMm;
}

function getDefaultCornerDepth(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

const getFollowingSlotLabel = (label: string) => {
  const labelNumber = Number.parseInt(label.slice(1), 10);

  if (getLabelPrefix(label) !== 'S' || !Number.isFinite(labelNumber)) {
    return null;
  }

  return `S${labelNumber + 1}`;
};

const getAssignedConnectionId = (assignment: EdgeAssignmentBucket | undefined) => {
  const edgeAssignment = getBucketEdgeAssignment(assignment);
  const slotAssignment = getBucketSlotAssignments(assignment)[0];
  return edgeAssignment && slotAssignment
    ? `${edgeAssignment.connectionId}, ${slotAssignment.connectionId}`
    : edgeAssignment?.connectionId ?? slotAssignment?.connectionId;
};

const getDefaultEdgeRole = (assignments: EdgeAssignmentRecord, connectionId: string): EdgeRole => {
  const assignedRoles = Object.values(assignments)
    .map((assignment) => getBucketEdgeAssignment(assignment))
    .filter((assignment): assignment is EdgeAssignment => assignment?.connectionId === connectionId)
    .map((assignment) => assignment.edgeRole);
  const hasOuter = assignedRoles.includes('A');
  const hasInner = assignedRoles.includes('B');

  if (hasOuter && !hasInner) {
    return 'B';
  }

  return 'A';
};

export const getWGroupActionNumber = (connections: ConnectionMap, activeWGroup: ActiveWGroup | null) => {
  if (activeWGroup?.isActive) {
    return getLabelNumber(activeWGroup.connectionId);
  }

  const wNumbers = Object.keys(connections)
    .filter((label) => getLabelPrefix(label) === 'W')
    .map(getLabelNumber)
    .filter((value) => Number.isFinite(value));

  return wNumbers.length > 0 ? Math.max(...wNumbers) + 1 : 1;
};

const createStandaloneWConnection = (id: string): WallConnectionDefinition => ({
  id,
  prefix: 'W',
  properties: cloneDefaultProperties('W'),
});

export const startWGroupWorkflow = (connections: ConnectionMap) => {
  const connectionId = getNextLabel('W', Object.keys(connections));

  return {
    connections: { ...connections, [connectionId]: createStandaloneWConnection(connectionId) },
    selectedLabelId: connectionId,
    activeWGroup: { groupId: `w-group-${connectionId}`, connectionId, isActive: true } satisfies ActiveWGroup,
  };
};

const formatEdgeRoleLabel = (role: EdgeRole | undefined) => {
  if (role === 'A') {
    return 'A';
  }

  if (role === 'B') {
    return 'B';
  }

  return 'No role';
};

const formatCalculatedMm = (value: number | null | undefined) => (Number.isFinite(value) ? `${Number((value as number).toFixed(2)).toString()} mm` : 'Unknown');
const cloneDefaultProperties = <P extends LabelPrefix>(prefix: P): ConnectionPropertiesByPrefix[P] => ({
  ...defaultConnectionProperties[prefix],
});

const createConnectionDefinition = (
  id: string,
  prefix: LabelPrefix,
  edgeProperties?: EdgeConnectionProperties,
): ConnectionDefinition => {
  if (prefix === 'E') {
    return { id, prefix, properties: edgeProperties ? { ...edgeProperties } : cloneDefaultProperties(prefix) };
  }

  if (prefix === 'S') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'W') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'C') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  return { id, prefix, properties: cloneDefaultProperties(prefix) };
};

const getSharedEdgeProperties = (connections: ConnectionMap): EdgeConnectionProperties => {
  const sharedConnection = Object.values(connections).find(
    (connection): connection is EdgeConnectionDefinition => connection.prefix === 'E',
  );

  return sharedConnection ? { ...sharedConnection.properties } : cloneDefaultProperties('E');
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
      onChange={(event) => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)}
    />
  </label>
);

const CanvasAnnotation = ({ label, x, y, width, height, scale, className = '' }: { label: string; x: number; y: number; width: number; height: number; scale: number; className?: string }) => (
  <g className={`canvas-annotation edge-label${className ? ` ${className}` : ''}`} transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect className="edge-label-background" x={-width / 2} y={-height / 2} width={width} height={height} rx={5} />
    <text className="edge-label-text" textAnchor="middle" dominantBaseline="middle">
      {label.split('\n').map((displayLabel, index, allLabels) => (
        <tspan key={`${displayLabel}-${index}`} x={0} dy={index === 0 ? `${-0.5 * (allLabels.length - 1)}em` : '1em'}>
          {displayLabel}
        </tspan>
      ))}
    </text>
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
  const [svgModel, setSvgModel] = useState<SvgDocumentModel>(() => parseSvgDocument(starterSvg));
  const [edgeAssignments, setEdgeAssignments] = useState<Record<string, EdgeAssignmentBucket>>({});
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(defaultProjectSettings);
  const [lastAppliedManufacturingSettings, setLastAppliedManufacturingSettings] = useState<ProjectSettings | null>(null);
  const [assignmentTargetConnectionId, setAssignmentTargetConnectionId] = useState<string | null>(null);
  const [displayConnectionId, setDisplayConnectionId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [appliedEPanelPaths, setAppliedEPanelPaths] = useState<AppliedEPanelPath[]>([]);
  const [appliedSGeometry, setAppliedSGeometry] = useState<AppliedSGeometry[]>([]);
  const [activeSGroup, setActiveSGroup] = useState<ActiveSGroup | null>(null);
  const [activeTBGroup, setActiveTBGroup] = useState<ActiveTBGroup | null>(null);
  const [completedTBGroups, setCompletedTBGroups] = useState<ActiveTBGroup[]>([]);
  const [activeWGroup, setActiveWGroup] = useState<ActiveWGroup | null>(null);
  const [workflowGroupOrder, setWorkflowGroupOrder] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const suppressEdgeClickRef = useRef(false);
  const [canvasViewBox, setCanvasViewBox] = useState<CanvasViewBox>(() => parseViewBox(svgModel.viewBox));
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [expandedSGroups, setExpandedSGroups] = useState<Record<string, boolean>>({});
  const [expandedTBGroups, setExpandedTBGroups] = useState<Record<string, boolean>>({});
  const [expandedWGroups, setExpandedWGroups] = useState<Record<string, boolean>>({});
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [panelManager, setPanelManager] = useState<PanelManagerState>(() => ({ ...createPanelManagerStateFromModel(parseSvgDocument(starterSvg)), isApplied: true }));
  const [isPanelManagerModalOpen, setIsPanelManagerModalOpen] = useState(false);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activeHoleId, setActiveHoleId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  const availableLabels = useMemo(() => Object.keys(connections), [connections]);
  const selectedLabelId = displayConnectionId;
  const selectedConnection = displayConnectionId ? connections[displayConnectionId] ?? null : null;
  const selectConnectionForDisplayAndAssignment = (connectionId: string | null) => {
    setAssignmentTargetConnectionId(connectionId);
    setDisplayConnectionId(connectionId);
  };
  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  useEffect(() => {
    setConnections((currentConnections) => {
      const synchronizedConnections = recalculateAutomaticTBFingerWidths(
        svgModel,
        edgeAssignments,
        recalculateAutomaticSSlotLengths(svgModel, edgeAssignments, currentConnections, panelManager),
        panelManager,
      );

      const hasAutomaticPropertyChange = Object.keys(currentConnections).some((connectionId) => {
        const currentConnection = currentConnections[connectionId];
        const synchronizedConnection = synchronizedConnections[connectionId];

        if (!currentConnection || !synchronizedConnection || currentConnection.prefix !== synchronizedConnection.prefix) {
          return currentConnection !== synchronizedConnection;
        }

        if (currentConnection.prefix === 'E' && synchronizedConnection.prefix === 'E') {
          return currentConnection.properties.fingerWidthMm !== synchronizedConnection.properties.fingerWidthMm;
        }

        if (currentConnection.prefix === 'S' && synchronizedConnection.prefix === 'S') {
          return currentConnection.properties.slotLengthMm !== synchronizedConnection.properties.slotLengthMm
            || currentConnection.properties.slotWidthMm !== synchronizedConnection.properties.slotWidthMm;
        }

        return false;
      });

      return hasAutomaticPropertyChange ? synchronizedConnections : currentConnections;
    });
  }, [connections, edgeAssignments, panelManager, svgModel]);

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

  const wLabelGroups = useMemo(() => {
    const wLabels = availableLabels
      .filter((label) => getLabelPrefix(label) === 'W')
      .sort((first, second) => getLabelNumber(first) - getLabelNumber(second));

    return wLabels.map((label) => ({
      id: `w-group-${label}`,
      labels: [label],
      isActive: activeWGroup?.connectionId === label && activeWGroup.isActive,
      orderIndex: workflowGroupOrder[`w-group-${label}`],
    }));
  }, [activeWGroup, availableLabels, workflowGroupOrder]);

  const sLabelGroups = useMemo(() => {
    const sLabels = availableLabels
      .filter((label) => getLabelPrefix(label) === 'S')
      .sort((first, second) => getLabelNumber(first) - getLabelNumber(second));

    if (sLabels.length === 0) {
      return [];
    }

    const groups: WorkflowHistoryGroup[] = [];
    const activeIds = activeSGroup?.connectionIds ?? [];
    const firstActiveId = activeIds[0];
    const firstActiveNumber = firstActiveId ? getLabelNumber(firstActiveId) : Number.POSITIVE_INFINITY;
    const previousLabels = sLabels.filter((label) => getLabelNumber(label) < firstActiveNumber);
    const activeLabels = activeIds.filter((label) => sLabels.includes(label));
    const laterLabels = sLabels.filter((label) => getLabelNumber(label) > getLabelNumber(activeIds.at(-1) ?? 'S0'));

    if (previousLabels.length > 0) {
      groups.push({ id: `s-group-${previousLabels[0]}`, labels: previousLabels, isActive: false, orderIndex: workflowGroupOrder[`s-group-${previousLabels[0]}`] });
    }

    if (activeLabels.length > 0) {
      const id = activeSGroup?.groupId ?? `s-group-${activeLabels[0]}`;
      groups.push({ id, labels: activeLabels, isActive: activeSGroup?.isActive ?? false, orderIndex: workflowGroupOrder[id] });
    } else if (previousLabels.length === 0) {
      groups.push({ id: `s-group-${sLabels[0]}`, labels: sLabels, isActive: activeSGroup?.isActive ?? false, orderIndex: workflowGroupOrder[`s-group-${sLabels[0]}`] });
    }

    if (laterLabels.length > 0 && activeLabels.length > 0) {
      groups.push({ id: `s-group-${laterLabels[0]}`, labels: laterLabels, isActive: false, orderIndex: workflowGroupOrder[`s-group-${laterLabels[0]}`] });
    }

    return groups;
  }, [activeSGroup, availableLabels, workflowGroupOrder]);

  const tbLabelGroups = useMemo(() => {
    const eLabels = availableLabels
      .filter((label) => getLabelPrefix(label) === 'E')
      .sort((first, second) => getLabelNumber(first) - getLabelNumber(second));

    if (eLabels.length === 0) {
      return [];
    }

    const finishedGroups = completedTBGroups.map((group) => ({
      id: group.groupId,
      labels: group.connectionIds.filter((label) => eLabels.includes(label)),
      isActive: false,
      orderIndex: workflowGroupOrder[group.groupId],
    })).filter((group) => group.labels.length > 0);
    const shouldUseActiveTBGroup = !!activeTBGroup && (activeTBGroup.isActive || !finishedGroups.some((group) => group.id === activeTBGroup.groupId));
    const activeIds = shouldUseActiveTBGroup ? activeTBGroup.connectionIds : [];
    const activeLabels = activeIds.filter((label) => eLabels.includes(label));
    const groupedActive = new Set([...finishedGroups.flatMap((group) => group.labels), ...activeLabels]);
    const standaloneLabels = eLabels.filter((label) => !groupedActive.has(label));
    const groups = [
      ...finishedGroups,
      ...standaloneLabels.map((label) => ({ id: `tb-group-${label}`, labels: [label], isActive: false, orderIndex: workflowGroupOrder[`tb-group-${label}`] })),
    ];

    if (activeLabels.length > 0) {
      const id = activeTBGroup?.groupId ?? `tb-group-${activeLabels[0]}`;
      groups.push({ id, labels: activeLabels, isActive: activeTBGroup?.isActive ?? false, orderIndex: workflowGroupOrder[id] });
    }

    return groups.sort((first, second) => getLabelNumber(first.labels[0] ?? 'E0') - getLabelNumber(second.labels[0] ?? 'E0'));
  }, [activeTBGroup, availableLabels, completedTBGroups, workflowGroupOrder]);

  const tbDisplayLabelAliases = useMemo(() => Object.fromEntries(
    tbLabelGroups.flatMap((group) => group.labels).map((label, index) => [label, `TB${index + 1}`]),
  ), [tbLabelGroups]);
  const formatTBDisplayLabel = (label: string | null | undefined) => (label ? tbDisplayLabelAliases[label] ?? label : 'None');



  const finalGeometry = useMemo(
    () => buildFinalGeometry(svgModel, appliedEPanelPaths, appliedSGeometry),
    [appliedEPanelPaths, appliedSGeometry, svgModel],
  );

  const kerfCompensatedAppliedPreview = useMemo(
    () => buildKerfCompensatedPreviewFromFinalContours(finalGeometry.contours, projectSettings.kerfMm, projectSettings.slotClearanceMm),
    [finalGeometry.contours, projectSettings.kerfMm, projectSettings.slotClearanceMm],
  );

  const isProjectLocked = !panelManager.isApplied;
  const isPanelManagerVisible = activeTool === 'PM';
  const panelDisplayItems = useMemo(() => svgModel.panels.map((panel) => ({
    panelId: panel.id,
    name: getPanelDisplayName(panel.id),
    pathD: getPanelPathD(panel),
    centerX: (panel.bounds.minX + panel.bounds.maxX) / 2,
    centerY: (panel.bounds.minY + panel.bounds.maxY) / 2,
  })), [svgModel]);
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
  const workflowHistoryItems = useMemo(() => buildWorkflowHistoryItems(tbLabelGroups, sLabelGroups, wLabelGroups, connections, workflowGroupOrder.manufacturing, panelManager.isApplied), [connections, panelManager.isApplied, sLabelGroups, tbLabelGroups, wLabelGroups, workflowGroupOrder]);
  const activeWConnection = activeWGroup?.isActive ? connections[activeWGroup.connectionId] : undefined;
  const hasPendingManufacturingSettings = haveProjectSettingsChanged(projectSettings, lastAppliedManufacturingSettings);
  const hasApplyInputs = hasPendingManufacturingSettings
    || Object.keys(edgeAssignments).length > 0
    || (activeWConnection?.prefix === 'W' && activeWConnection.properties.selectedEdgeIds.length > 0);
  const navigateToWorkflowHistoryItem = (item: WorkflowHistoryItem) => {
    const firstLabel = item.labels[0] ?? null;
    setActiveTool(getWorkflowHistoryTool(item));
    setAssignmentTargetConnectionId(firstLabel);
    setDisplayConnectionId(firstLabel);
    setErrorMessage('');

    if (item.kind === 'PM') {
      setAssignmentTargetConnectionId(null);
      setDisplayConnectionId(null);
      return;
    }

    if (item.kind === 'manufacturing') {
      setAssignmentTargetConnectionId(null);
      setDisplayConnectionId(null);
      return;
    }

    if (item.kind === 'TB') {
      setExpandedTBGroups((currentGroups) => ({ ...currentGroups, [item.id]: true }));
      return;
    }

    if (item.kind === 'S') {
      setExpandedSGroups((currentGroups) => ({ ...currentGroups, [item.id]: true }));
      return;
    }

    setExpandedWGroups((currentGroups) => ({ ...currentGroups, [item.id]: true }));
  };

  const hasAssignedEEdges = useMemo(() => {
    return Object.values(edgeAssignments).some((assignment) => getBucketEdgeAssignment(assignment)?.connectionId.startsWith('E'));
  }, [edgeAssignments]);

  const getCurrentHistoryState = (): HistoryState => cloneHistoryState({
    projectSettings,
    lastAppliedManufacturingSettings,
    edgeAssignments,
    connections,
    assignmentTargetConnectionId,
    displayConnectionId,
    selectedLabelId: displayConnectionId,
    selectedEdgeId,
    appliedEPanelPaths,
    appliedSGeometry,
    activeSGroup,
    activeTBGroup,
    completedTBGroups,
    activeWGroup,
    workflowGroupOrder,
    panelManager,
  });

  const restoreHistoryState = (state: HistoryState) => {
    const snapshot = cloneHistoryState(state);
    setProjectSettings(snapshot.projectSettings);
    setLastAppliedManufacturingSettings(snapshot.lastAppliedManufacturingSettings);
    setEdgeAssignments(Object.fromEntries(Object.entries(snapshot.edgeAssignments).map(([edgeId, assignment]) => [edgeId, toEdgeAssignmentBucket(assignment) ?? {}])));
    setConnections(snapshot.connections);
    setAssignmentTargetConnectionId(snapshot.assignmentTargetConnectionId ?? snapshot.selectedLabelId ?? null);
    setDisplayConnectionId(snapshot.displayConnectionId ?? snapshot.selectedLabelId ?? null);
    setSelectedEdgeId(snapshot.selectedEdgeId);
    setAppliedEPanelPaths(snapshot.appliedEPanelPaths ?? []);
    setAppliedSGeometry(snapshot.appliedSGeometry ?? []);
    setActiveSGroup(snapshot.activeSGroup);
    setActiveTBGroup(snapshot.activeTBGroup);
    setCompletedTBGroups(snapshot.completedTBGroups);
    setActiveWGroup(snapshot.activeWGroup);
    setWorkflowGroupOrder(snapshot.workflowGroupOrder);
    setPanelManager(snapshot.panelManager);
    setIsPanelManagerModalOpen(!snapshot.panelManager.isApplied && Object.keys(snapshot.panelManager.panels).length > 0);
  };

  const pushUndoState = () => {
    const snapshot = getCurrentHistoryState();
    setUndoStack((currentStack) => [...currentStack, snapshot].slice(-maxHistoryEntries));
    setRedoStack([]);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsedSvg = parseSvgDocument(text);
    setSvgModel(parsedSvg);
    setCanvasViewBox(parseViewBox(parsedSvg.viewBox));
    setEdgeAssignments({});
    setProjectSettings(defaultProjectSettings);
    setLastAppliedManufacturingSettings(null);
    setAssignmentTargetConnectionId(null);
    setDisplayConnectionId(null);
    setSelectedEdgeId(null);
    setActivePanelId(null);
    setActiveHoleId(null);
    setAppliedEPanelPaths([]);
    setAppliedSGeometry([]);
    setActiveSGroup(null);
    setActiveTBGroup(null);
    setCompletedTBGroups([]);
    setActiveWGroup(null);
    setWorkflowGroupOrder({});
    const nextPanelManager = createPanelManagerStateFromModel(parsedSvg);
    setPanelManager(nextPanelManager);
    setIsPanelManagerModalOpen(parsedSvg.panels.length > 0);
    setActiveTool('select');
    setUndoStack([]);
    setRedoStack([]);
    setExpandedTBGroups({});
    setExpandedSGroups({});
    setExpandedWGroups({});
    setErrorMessage(formatImportDiagnosticMessage(parsedSvg));
    event.target.value = '';
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => {
    handleImport(event).catch((error: Error) => {
      setErrorMessage(error.message);
    });
  };

  const createLabel = (prefix: LabelPrefix) => {
    if (isProjectLocked) {
      setErrorMessage('Apply Panel Manager before using workflow tools.');
      return;
    }
    pushUndoState();

    if (prefix === 'S') {
      const nextWorkflow = manualAddSWorkflow(connections, activeSGroup);
      setConnections(nextWorkflow.connections);
      setActiveSGroup(nextWorkflow.activeSGroup);
      selectConnectionForDisplayAndAssignment(nextWorkflow.selectedLabelId);
      setErrorMessage('');
      return;
    }

    const nextLabel = getNextLabel(prefix, availableLabels);
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextLabel]: createConnectionDefinition(
        nextLabel,
        prefix,
        prefix === 'E' ? getSharedEdgeProperties(currentConnections) : undefined,
      ),
    }));
    selectConnectionForDisplayAndAssignment(nextLabel);
    setErrorMessage('');
  };

  const startTBGroup = () => {
    pushUndoState();
    const nextWorkflow = startTBGroupWorkflow(connections, defaultConnectionProperties.E);
    setConnections(nextWorkflow.connections);
    selectConnectionForDisplayAndAssignment(nextWorkflow.selectedLabelId);
    setActiveTool(nextWorkflow.activeTool);
    setActiveTBGroup(nextWorkflow.activeTBGroup);
    setWorkflowGroupOrder((currentOrder) => ({
      ...currentOrder,
      [nextWorkflow.activeTBGroup.groupId]: currentOrder[nextWorkflow.activeTBGroup.groupId] ?? getNextWorkflowGroupOrderIndex(currentOrder),
    }));
    setExpandedTBGroups((currentGroups) => ({ ...currentGroups, [nextWorkflow.activeTBGroup.groupId]: true }));
    setErrorMessage('');
  };

  const finishTBGroup = () => {
    if (!activeTBGroup?.isActive) {
      return;
    }

    pushUndoState();
    const nextWorkflow = finishTBGroupWithTrailingCleanup(activeTBGroup, connections, edgeAssignments, assignmentTargetConnectionId);
    const finishedGroup = nextWorkflow.activeTBGroup;
    setConnections(nextWorkflow.connections);
    setActiveTBGroup(finishedGroup);
    setCompletedTBGroups((currentGroups) => [
      ...currentGroups.filter((group) => group.groupId !== finishedGroup.groupId),
      finishedGroup,
    ]);
    setAssignmentTargetConnectionId(nextWorkflow.selectedLabelId);
    setDisplayConnectionId(nextWorkflow.removedConnectionId === displayConnectionId ? null : displayConnectionId);
    setErrorMessage('');
  };

  const startSGroup = () => {
    pushUndoState();
    const nextWorkflow = startSGroupWorkflow(connections);
    setConnections(nextWorkflow.connections);
    selectConnectionForDisplayAndAssignment(nextWorkflow.selectedLabelId);
    setActiveSGroup(nextWorkflow.activeSGroup);
    setWorkflowGroupOrder((currentOrder) => ({
      ...currentOrder,
      [nextWorkflow.activeSGroup.groupId]: currentOrder[nextWorkflow.activeSGroup.groupId] ?? getNextWorkflowGroupOrderIndex(currentOrder),
    }));
    setErrorMessage('');
  };

  const startWGroup = () => {
    pushUndoState();
    const nextWorkflow = startWGroupWorkflow(connections);
    setConnections(nextWorkflow.connections);
    selectConnectionForDisplayAndAssignment(nextWorkflow.selectedLabelId);
    setActiveWGroup(nextWorkflow.activeWGroup);
    setWorkflowGroupOrder((currentOrder) => ({
      ...currentOrder,
      [nextWorkflow.activeWGroup.groupId]: currentOrder[nextWorkflow.activeWGroup.groupId] ?? getNextWorkflowGroupOrderIndex(currentOrder),
    }));
    setExpandedWGroups((currentGroups) => ({ ...currentGroups, [nextWorkflow.activeWGroup.groupId]: true }));
    setErrorMessage('');
  };

  const handleToolClick = (tool: ActiveTool) => {
    if (isProjectLocked && !['select', 'PM'].includes(tool)) {
      setErrorMessage('Apply Panel Manager before using workflow tools.');
      return;
    }
    setActiveTool(tool);

    if (tool === 'manufacturing') {
      setWorkflowGroupOrder((currentOrder) => currentOrder.manufacturing !== undefined
        ? currentOrder
        : { ...currentOrder, manufacturing: getNextWorkflowGroupOrderIndex(currentOrder) });
    }

    const groupStartKind = getToolClickGroupStartKind(tool, activeTBGroup, activeSGroup, activeWGroup);

    if (groupStartKind === 'TB') {
      startTBGroup();
      return;
    }

    if (groupStartKind === 'S') {
      startSGroup();
      return;
    }

    if (groupStartKind === 'W') {
      startWGroup();
      return;
    }

    if (tool === 'TB' && activeTBGroup?.isActive) {
      selectConnectionForDisplayAndAssignment(activeTBGroup.connectionIds[activeTBGroup.connectionIds.length - 1] ?? null);
      setExpandedTBGroups((currentGroups) => ({ ...currentGroups, [activeTBGroup.groupId]: true }));
      setErrorMessage('');
      return;
    }

    if (tool === 'S' && activeSGroup?.isActive) {
      selectConnectionForDisplayAndAssignment(activeSGroup.connectionIds[activeSGroup.connectionIds.length - 1] ?? null);
      setErrorMessage('');
      return;
    }

    if (tool === 'W' && activeWGroup?.isActive) {
      selectConnectionForDisplayAndAssignment(activeWGroup.connectionId);
      setExpandedWGroups((currentGroups) => ({ ...currentGroups, [activeWGroup.groupId]: true }));
      setErrorMessage('');
    }
  };

  const finishWGroup = () => {
    if (!activeWGroup?.isActive) {
      return;
    }

    try {
      pushUndoState();
      const nextWorkflow = finishWGroupWorkflow(connections, edgeAssignments, activeWGroup, svgModel);
      setConnections(nextWorkflow.connections);
      setEdgeAssignments(nextWorkflow.assignments as Record<string, EdgeAssignmentBucket>);
      selectConnectionForDisplayAndAssignment(nextWorkflow.selectedLabelId);
      setActiveWGroup(nextWorkflow.activeWGroup);
      setExpandedWGroups((currentGroups) => ({ ...currentGroups, [activeWGroup.groupId]: false }));
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finish W group.');
    }
  };

  const finishSGroup = () => {
    if (!activeSGroup?.isActive) {
      return;
    }

    pushUndoState();
    const nextWorkflow = finishSGroupWithTrailingCleanup(activeSGroup, connections, edgeAssignments, assignmentTargetConnectionId);
    setConnections(nextWorkflow.connections);
    setActiveSGroup(nextWorkflow.activeSGroup);
    setAssignmentTargetConnectionId(nextWorkflow.selectedLabelId);
    setDisplayConnectionId(nextWorkflow.removedConnectionId === displayConnectionId ? null : displayConnectionId);
    setErrorMessage('');
  };

  const activeToolbarFinish = activeTool === 'TB' && activeTBGroup?.isActive
    ? { label: 'Finish TB', onClick: finishTBGroup }
    : activeTool === 'S' && activeSGroup?.isActive
      ? { label: 'Finish S', onClick: finishSGroup }
      : activeTool === 'W' && activeWGroup?.isActive
        ? { label: 'Finish W', onClick: finishWGroup }
        : null;

  const clearEdgeLabel = (edgeId: string) => {
    if (!edgeAssignments[edgeId]) {
      return;
    }

    pushUndoState();
    setEdgeAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      delete nextAssignments[edgeId];
      return nextAssignments;
    });
    setErrorMessage('');
  };

  const assignSelectedLabelToEdge = (edgeId: string) => {
    const assignmentConnectionId = assignmentTargetConnectionId;
    const assignedConnectionId = resolveAssignedTBOrSConnectionIdForEdge(edgeAssignments, edgeId, activeTool === 'S' ? 'S' : activeTool === 'TB' ? 'TB' : undefined);
    setSelectedEdgeId(edgeId);

    if (assignedConnectionId && connections[assignedConnectionId]?.prefix !== 'W') {
      setDisplayConnectionId(assignedConnectionId);
      setErrorMessage('');
      return;
    }

    if (isProjectLocked) {
      setErrorMessage('Apply Panel Manager before assigning edges.');
      return;
    }

    if (!assignmentConnectionId) {
      setErrorMessage('Create and select a connection before clicking an edge.');
      return;
    }

    const connection = connections[assignmentConnectionId];
    if (!connection) {
      setErrorMessage('Select a valid connection before clicking an edge.');
      return;
    }

    if (connection.prefix === 'W') {
      if (!activeWGroup?.isActive || activeWGroup.connectionId !== connection.id) {
        setErrorMessage('Start a W group before selecting wall edges.');
        return;
      }

      pushUndoState();
      setConnections((currentConnections) => {
        const currentConnection = currentConnections[connection.id];
        if (!currentConnection || currentConnection.prefix !== 'W') {
          return currentConnections;
        }
        const selectedEdgeIds = currentConnection.properties.selectedEdgeIds.includes(edgeId)
          ? currentConnection.properties.selectedEdgeIds.filter((selectedEdgeId) => selectedEdgeId !== edgeId)
          : [...currentConnection.properties.selectedEdgeIds, edgeId];
        return {
          ...currentConnections,
          [connection.id]: {
            ...currentConnection,
            properties: {
              ...currentConnection.properties,
              selectedEdgeIds,
            },
          },
        };
      });
      setErrorMessage('');
      return;
    }

    const nextSlotRole = connection.prefix === 'S' ? getDefaultSlotRole(edgeAssignments, assignmentConnectionId) : null;

    if (connection.prefix === 'S' && !nextSlotRole) {
      if (activeSGroup?.isActive && activeSGroup.connectionIds.includes(assignmentConnectionId)) {
        const nextWorkflow = maybeAutoCreateNextSInGroup(connections, edgeAssignments, activeSGroup, assignmentConnectionId);
        setConnections(nextWorkflow.connections);
        setAssignmentTargetConnectionId(nextWorkflow.selectedLabelId);
        setDisplayConnectionId(assignmentConnectionId);
        setActiveSGroup(nextWorkflow.activeSGroup);
        setErrorMessage(`${assignmentConnectionId} is complete. Select the next S connection before assigning another edge.`);
        return;
      }

      setErrorMessage(`${assignmentConnectionId} is complete. Start S Group or select another S connection before assigning another edge.`);
      return;
    }

    pushUndoState();

    const currentBucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]) ?? {};
    const nextAssignment: EdgeAssignment = {
      connectionId: assignmentConnectionId,
      ...(connection.prefix === 'E' ? { edgeRole: getDefaultEdgeRole(edgeAssignments, assignmentConnectionId) } : {}),
      ...(connection.prefix === 'S' && nextSlotRole ? { slotRole: nextSlotRole } : {}),
    };

    if (connection.prefix === 'E') {
      if (currentBucket.edgeAssignment) {
        setErrorMessage('This edge already has a TB assignment.');
        return;
      }
    } else if (connection.prefix === 'S') {
      if (nextAssignment.slotRole === 'A' && (currentBucket.edgeAssignment || (currentBucket.slotAssignments?.length ?? 0) > 0)) {
        setErrorMessage('S-A cannot share an edge with another assignment.');
        return;
      }

      if (nextAssignment.slotRole === 'B' && (currentBucket.slotAssignments?.length ?? 0) > 0) {
        setErrorMessage('This edge already has an S assignment.');
        return;
      }
    }

    const nextAssignments = {
      ...edgeAssignments,
      [edgeId]: connection.prefix === 'E'
        ? { ...currentBucket, edgeAssignment: nextAssignment }
        : { ...currentBucket, slotAssignments: [...(currentBucket.slotAssignments ?? []), nextAssignment] },
    };
    setEdgeAssignments(nextAssignments);
    setDisplayConnectionId(assignmentConnectionId);


    const selectedLabelAssignmentCount = Object.values(nextAssignments).reduce((count, assignment) => (
      count
      + (getBucketEdgeAssignment(assignment)?.connectionId === assignmentConnectionId ? 1 : 0)
      + getBucketSlotAssignments(assignment).filter((slotAssignment) => slotAssignment.connectionId === assignmentConnectionId).length
    ), 0);
    const nextEdgeLabel = selectedLabelAssignmentCount === 2 ? getFollowingEdgeLabel(assignmentConnectionId) : null;

    if (connection.prefix === 'E' && nextEdgeLabel) {
      setConnections((currentConnections) => {
        if (currentConnections[nextEdgeLabel]) {
          return currentConnections;
        }

        return {
          ...currentConnections,
          [nextEdgeLabel]: createConnectionDefinition(
            nextEdgeLabel,
            'E',
            getSharedEdgeProperties(currentConnections),
          ),
        };
      });
      setAssignmentTargetConnectionId(nextEdgeLabel);
      setDisplayConnectionId(assignmentConnectionId);
      setActiveTBGroup((currentGroup) => appendAutoCreatedEToTBGroup(currentGroup, assignmentConnectionId, nextEdgeLabel));
      setExpandedTBGroups((currentGroups) => activeTBGroup?.connectionIds.includes(assignmentConnectionId) ? { ...currentGroups, [activeTBGroup.groupId]: true } : currentGroups);
    }

    const selectedSlotRoles = Object.values(nextAssignments)
      .flatMap((assignment) => getBucketSlotAssignments(assignment))
      .filter((assignment) => assignment.connectionId === assignmentConnectionId)
      .map((assignment) => assignment.slotRole);
    const nextSlotLabel = selectedSlotRoles.includes('A') && selectedSlotRoles.includes('B')
      ? getFollowingSlotLabel(assignmentConnectionId)
      : null;

    if (connection.prefix === 'S' && nextSlotLabel) {
      const nextWorkflow = maybeAutoCreateNextSInGroup(connections, nextAssignments, activeSGroup, assignmentConnectionId);
      setConnections(nextWorkflow.connections);
      setAssignmentTargetConnectionId(nextWorkflow.selectedLabelId);
      setDisplayConnectionId(assignmentConnectionId);
      setActiveSGroup(nextWorkflow.activeSGroup);
    }

    setErrorMessage('');
  };

  const updateAssignedEdgeRole = (edgeId: string, edgeRole: EdgeRole) => {
    const bucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]);
    const assignment = bucket?.edgeAssignment;
    const connection = assignment ? connections[assignment.connectionId] : undefined;

    if (!bucket || !assignment || connection?.prefix !== 'E' || assignment.edgeRole === edgeRole) {
      return;
    }

    pushUndoState();
    setEdgeAssignments((currentAssignments) => ({
      ...currentAssignments,
      [edgeId]: {
        ...bucket,
        edgeAssignment: {
          ...assignment,
          edgeRole,
        },
      },
    }));
    setErrorMessage('');
  };

  const updateAssignedSlotRole = (edgeId: string, slotRole: SlotRole) => {
    const bucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]);
    const assignment = bucket?.slotAssignments?.[0];
    const connection = assignment ? connections[assignment.connectionId] : undefined;

    if (!bucket || !assignment || connection?.prefix !== 'S' || assignment.slotRole === slotRole) {
      return;
    }

    pushUndoState();
    setEdgeAssignments((currentAssignments) => ({
      ...currentAssignments,
      [edgeId]: {
        ...bucket,
        slotAssignments: [{
          ...assignment,
          slotRole,
        }],
      },
    }));
    setErrorMessage('');
  };

  const clearSelectedLabel = () => {
    if (!selectedEdgeId) {
      return;
    }

    clearEdgeLabel(selectedEdgeId);
  };

  const applyPanelPaths = () => {
    if (isProjectLocked) {
      setErrorMessage('Apply Panel Manager before applying or exporting workflow geometry.');
      return;
    }
    try {
      const applyInputs = activeWGroup?.isActive
        ? finishWGroupWorkflow(connections, edgeAssignments, activeWGroup, svgModel)
        : { connections, assignments: edgeAssignments };
      const nextConnections = recalculateAutomaticTBFingerWidths(svgModel, applyInputs.assignments, recalculateAutomaticSSlotLengths(svgModel, applyInputs.assignments, applyInputs.connections, panelManager), panelManager);
      const nextAppliedEPanelPaths = buildAppliedEPanelPaths(svgModel, applyInputs.assignments, nextConnections, panelManager);
      const nextAppliedSGeometry = buildAppliedSGeometry(svgModel, applyInputs.assignments, nextConnections, panelManager);
      const shouldRecordManufacturing = haveProjectSettingsChanged(projectSettings, lastAppliedManufacturingSettings);
      if (shouldRecordManufacturing) {
        setLastAppliedManufacturingSettings(structuredClone(projectSettings));
      }
      setConnections(nextConnections);
      setAppliedEPanelPaths(nextAppliedEPanelPaths);
      setAppliedSGeometry(nextAppliedSGeometry);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to apply geometry.');
    }
  };

  const undoLastEdit = () => {
    const previousState = undoStack[undoStack.length - 1];

    if (!previousState) {
      return;
    }

    setRedoStack((currentStack) => [...currentStack, getCurrentHistoryState()].slice(-maxHistoryEntries));
    setUndoStack((currentStack) => currentStack.slice(0, -1));
    restoreHistoryState(previousState);
    setErrorMessage('');
  };

  const redoLastEdit = () => {
    const nextState = redoStack[redoStack.length - 1];

    if (!nextState) {
      return;
    }

    setUndoStack((currentStack) => [...currentStack, getCurrentHistoryState()].slice(-maxHistoryEntries));
    setRedoStack((currentStack) => currentStack.slice(0, -1));
    restoreHistoryState(nextState);
    setErrorMessage('');
  };

  const clearProject = () => {
    setSvgModel(emptySvgModel);
    setEdgeAssignments({});
    setConnections({});
    setProjectSettings(defaultProjectSettings);
    setLastAppliedManufacturingSettings(null);
    setAssignmentTargetConnectionId(null);
    setDisplayConnectionId(null);
    setSelectedEdgeId(null);
    setAppliedEPanelPaths([]);
    setAppliedSGeometry([]);
    setActiveSGroup(null);
    setActiveTBGroup(null);
    setCompletedTBGroups([]);
    setActiveWGroup(null);
    setWorkflowGroupOrder({});
    setPanelManager(defaultPanelManagerState);
    setIsPanelManagerModalOpen(false);
    setActiveTool('select');
    setErrorMessage('');
    setUndoStack([]);
    setRedoStack([]);
    setExpandedTBGroups({});
    setExpandedSGroups({});
    setExpandedWGroups({});
    setCanvasViewBox(parseViewBox(emptySvgModel.viewBox));
    setIsClearDialogOpen(false);
  };

  const requestClearProject = () => {
    setIsClearDialogOpen(true);
  };

  const cancelClearProject = () => {
    setIsClearDialogOpen(false);
  };

  const updatePanelThickness = (panelId: string, thicknessMm: number) => {
    setActivePanelId(panelId);
    setActiveHoleId(null);
    setPanelManager((current) => {
      const currentThickness = current.panels[panelId]?.thicknessMm;
      return {
        ...current,
        isApplied: currentThickness === thicknessMm ? current.isApplied : false,
        isDirty: currentThickness === thicknessMm ? current.isDirty : true,
        panels: {
          ...current.panels,
          [panelId]: { panelId, thicknessMm },
        },
      };
    });
  };

  const acceptDefaultPanelThickness = () => {
    const defaultThicknessMm = panelManager.defaultThicknessMm > 0
      ? panelManager.defaultThicknessMm
      : defaultConnectionProperties.E.materialThicknessMm;
    setPanelManager((current) => ({
      ...current,
      defaultThicknessMm,
      isApplied: false,
      isDirty: true,
      panels: Object.fromEntries(Object.keys(current.panels).map((panelId) => [panelId, { panelId, thicknessMm: defaultThicknessMm }])),
    }));
    setActivePanelId(null);
    setActiveHoleId(null);
    setErrorMessage('');
  };

  const finishPanelManager = () => {
    setActiveTool('select');
    setAssignmentTargetConnectionId(null);
    setDisplayConnectionId(null);
    setSelectedEdgeId(null);
    setActivePanelId(null);
    setActiveHoleId(null);
    setIsPanelManagerModalOpen(false);
    setErrorMessage('');
  };

  const applyPanelManager = () => {
    const validationError = validatePanelManagerState(panelManager);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    pushUndoState();
    const appliedPanelManager = { ...panelManager, isApplied: true, isDirty: false };
    const recomputedTBGeometry = recomputeAppliedTBGeometryForPanelManager(svgModel, edgeAssignments, connections, appliedPanelManager, appliedEPanelPaths, appliedSGeometry);
    setConnections(recomputedTBGeometry.connections);
    setAppliedEPanelPaths(recomputedTBGeometry.appliedEPanelPaths);
    setAppliedSGeometry(recomputedTBGeometry.appliedSGeometry);
    setPanelManager(appliedPanelManager);
    setIsPanelManagerModalOpen(false);
    setActivePanelId(null);
    setActiveHoleId(null);
    setErrorMessage('');
  };

  const updateProjectSettings = (updates: Partial<ProjectSettings>) => {
    pushUndoState();
    setProjectSettings((currentSettings) => ({ ...currentSettings, ...updates }));
    setErrorMessage('');
  };

  const updateEdgeProperties = (updates: Partial<EdgeConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'E') {
      return;
    }

    pushUndoState();
    setConnections((currentConnections) => {
      const currentSelectedConnection = currentConnections[selectedConnection.id];

      if (!currentSelectedConnection || currentSelectedConnection.prefix !== 'E') {
        return currentConnections;
      }

      const nextProperties: EdgeConnectionProperties = {
        ...currentSelectedConnection.properties,
        ...updates,
      };

      if (updates.fingerWidthMm !== undefined) {
        nextProperties.isFingerWidthManual = true;
      }

      return Object.fromEntries(
        Object.entries(currentConnections).map(([connectionId, connection]) => [
          connectionId,
          connection.prefix === 'E'
            ? {
                ...connection,
                properties: {
                  ...connection.properties,
                  fingerWidthMm: nextProperties.fingerWidthMm,
                  materialThicknessMm: nextProperties.materialThicknessMm,
                  isFingerWidthManual: nextProperties.isFingerWidthManual,
                },
              }
            : connection,
        ]),
      );
    });
  };

  const updateSlotProperties = (updates: Partial<SlotConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'S') {
      return;
    }
    pushUndoState();
    setConnections((currentConnections) => {
      if (activeSGroup?.isActive && activeSGroup.connectionIds.includes(selectedConnection.id)) {
        return applyActiveSGroupSlotPropertyUpdates(currentConnections, activeSGroup, updates);
      }

      const currentSelectedConnection = currentConnections[selectedConnection.id];

      if (!currentSelectedConnection || currentSelectedConnection.prefix !== 'S') {
        return currentConnections;
      }

      return {
        ...currentConnections,
        [currentSelectedConnection.id]: applySlotPropertyUpdates(currentSelectedConnection, updates),
      };
    });
  };

  const updateWallProperties = (updates: Partial<WallConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'W') {
      return;
    }

    pushUndoState();
    setConnections((currentConnections) => ({
      ...currentConnections,
      [selectedConnection.id]: {
        ...selectedConnection,
        properties: {
          ...selectedConnection.properties,
          ...updates,
        },
      },
    }));
  };

  const updateCornerProperties = (updates: Partial<CornerConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'C') {
      return;
    }

    const nextProperties: CornerConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined && !selectedConnection.properties.isCornerDepthManual) {
      nextProperties.cornerDepthMm = getDefaultCornerDepth(updates.materialThicknessMm);
    }

    if (updates.cornerDepthMm !== undefined) {
      nextProperties.isCornerDepthManual = true;
    }

    const nextConnection: CornerConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    pushUndoState();
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updatePatternProperties = (updates: Partial<PatternConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'P') {
      return;
    }

    const nextConnection: PatternConnectionDefinition = {
      ...selectedConnection,
      properties: { ...selectedConnection.properties, ...updates },
    };
    pushUndoState();
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const exportSvg = () => {
    // Export after Apply is clean laser geometry; export before Apply remains label/reference export.
    const hasAppliedGeometry = appliedEPanelPaths.length > 0 || appliedSGeometry.length > 0;
    if (isProjectLocked) {
      setErrorMessage('Apply Panel Manager before exporting applied or manufacturing output.');
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

  const getFittedCanvasViewBox = () => {
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
    const canvasAspectRatio = viewportSize.width / viewportSize.height;
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
      width: Math.max(fittedWidth, 1),
      height: Math.max(fittedHeight, 1),
    };
  };

  const fitCanvasToScreen = () => {
    setCanvasViewBox(getFittedCanvasViewBox());
  };

  useLayoutEffect(() => {
    setCanvasViewBox(getFittedCanvasViewBox());
  }, [svgModel]);

  const handleCanvasWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const center = getSvgPointFromClient(event.clientX, event.clientY);
    zoomCanvas(Math.exp(-event.deltaY * wheelZoomSensitivity), center);
  };

  const handleCanvasPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
    suppressEdgeClickRef.current = false;
    setIsCanvasPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current;
    const screenMatrix = svgRef.current?.getScreenCTM();

    if (!panState || panState.pointerId !== event.pointerId || !screenMatrix) {
      return;
    }

    const totalDx = event.clientX - panState.startClientX;
    const totalDy = event.clientY - panState.startClientY;
    const dx = event.clientX - panState.lastClientX;
    const dy = event.clientY - panState.lastClientY;
    const scaleX = Math.hypot(screenMatrix.a, screenMatrix.b);
    const scaleY = Math.hypot(screenMatrix.c, screenMatrix.d);

    if (Math.hypot(totalDx, totalDy) > 3) {
      panState.moved = true;
    }

    panState.lastClientX = event.clientX;
    panState.lastClientY = event.clientY;

    if (scaleX === 0 || scaleY === 0) {
      return;
    }

    setCanvasViewBox((currentViewBox) => ({
      ...currentViewBox,
      x: currentViewBox.x - dx / scaleX,
      y: currentViewBox.y - dy / scaleY,
    }));
  };

  const handleCanvasPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current;

    if (panState?.pointerId === event.pointerId) {
      suppressEdgeClickRef.current = panState.moved;
      panStateRef.current = null;
      setIsCanvasPanning(false);
      window.setTimeout(() => {
        suppressEdgeClickRef.current = false;
      }, 0);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCanvasPointerLeave = (event: PointerEvent<SVGSVGElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsCanvasPanning(false);
    }
  };

  const renderPropertiesPanel = () => {
    const activeConnectionPrefix = activeTool === 'TB' ? 'E' : activeTool;

    if (!selectedConnection || selectedConnection.prefix !== activeConnectionPrefix) {
      return <p className="muted">Select a {activeTool === 'TB' ? 'TB / Top Bottom' : activeTool} connection to inspect this tool.</p>;
    }

    if (selectedConnection.prefix === 'E') {
      const assignedEEdges = svgModel.edges.filter((edge) => getBucketEdgeAssignment(edgeAssignments[edge.id])?.connectionId === selectedConnection.id);
      const tbViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const tbThickness = {
        panelAId: tbViewModel.panelIds.panelAId,
        panelBId: tbViewModel.panelIds.panelBId,
        panelAThicknessMm: tbViewModel.panelThicknesses.panelAThicknessMm,
        panelBThicknessMm: tbViewModel.panelThicknesses.panelBThicknessMm,
        autoFingerWidthMm: tbViewModel.autoTabMm,
      };
      const tbPanelByRole = {
        A: { panelId: tbThickness.panelAId, ownerThicknessMm: tbThickness.panelAThicknessMm, matingPanelId: tbThickness.panelBId, matingThicknessMm: tbThickness.panelBThicknessMm },
        B: { panelId: tbThickness.panelBId, ownerThicknessMm: tbThickness.panelBThicknessMm, matingPanelId: tbThickness.panelAId, matingThicknessMm: tbThickness.panelAThicknessMm },
      };
      const tbMode = tbViewModel.isTabManual ? 'Manual' : 'Auto';
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="edge-diagnostics">
            <h4 id="edge-diagnostics">{formatTBDisplayLabel(selectedConnection.id)} diagnostics</h4>
            {assignedEEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedEEdges.map((edge) => {
                  const role = getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole ?? 'A';
                  const diagnostic = tbPanelByRole[role];
                  return (
                    <li key={`${edge.id}-diagnostics`}>
                      <strong>Edge {role}</strong>
                      <dl>
                        <div><dt>Edge id</dt><dd>{edge.id}</dd></div>
                        <div><dt>Owner panel</dt><dd>{diagnostic.panelId ? getPanelDisplayName(diagnostic.panelId) : 'Unknown'}</dd></div>
                        <div><dt>Owner thickness</dt><dd>{formatCalculatedMm(diagnostic.ownerThicknessMm)}</dd></div>
                        <div><dt>Mating panel</dt><dd>{diagnostic.matingPanelId ? getPanelDisplayName(diagnostic.matingPanelId) : 'Unknown'}</dd></div>
                        <div><dt>Mating thickness</dt><dd>{formatCalculatedMm(diagnostic.matingThicknessMm)}</dd></div>
                        <div><dt>Tab thickness</dt><dd>{formatCalculatedMm(diagnostic.ownerThicknessMm)}</dd></div>
                        {diagnostic.matingThicknessMm !== null ? <div><dt>Joint depth</dt><dd>{formatCalculatedMm(diagnostic.matingThicknessMm)}</dd></div> : null}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this TB / Top Bottom label yet.</p>
            )}
            {tbViewModel.diagnostics.includes('Waiting for second edge.') ? <p className="muted">Waiting for second edge.</p> : null}
            <dl>
              <div><dt>Mode</dt><dd>{tbMode}</dd></div>
              <div><dt>Stored value</dt><dd>{formatCalculatedMm(tbViewModel.storedTabMm)}</dd></div>
              <div><dt>Computed auto value</dt><dd>{formatCalculatedMm(tbViewModel.autoTabMm)}</dd></div>
              <div><dt>Display value</dt><dd>{formatCalculatedMm(tbViewModel.displayTabMm)}</dd></div>
            </dl>
          </section>

          <section className="property-section" aria-labelledby="edge-assigned-edges">
            <h4 id="edge-assigned-edges">Assigned edges</h4>
            {assignedEEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedEEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.id}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{edge.source}</dd>
                      </div>
                      <div>
                        <dt>Edge length</dt>
                        <dd>{formatCalculatedMm(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y))}</dd>
                      </div>
                      <div>
                        <dt>Current role</dt>
                        <dd>{formatEdgeRoleLabel(getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole)}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-edge-role`}
                      label="Role"
                      value={getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole ?? 'A'}
                      options={['A', 'B']}
                      onChange={(edgeRole) => updateAssignedEdgeRole(edge.id, edgeRole as EdgeRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this TB / Top Bottom label yet. Select this label, then click edges in the drawing.</p>
            )}
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'S') {
      const properties = selectedConnection.properties;
      const sViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);
      const sThickness = {
        panelAId: sViewModel.panelIds.panelAId,
        panelBId: sViewModel.panelIds.panelBId,
        panelAThicknessMm: sViewModel.panelThicknesses.panelAThicknessMm,
        panelBThicknessMm: sViewModel.panelThicknesses.panelBThicknessMm,
        autoSlotLengthMm: sViewModel.autoTabMm,
      };
      const displayedSlotLengthMm = sViewModel.displayTabMm;
      const sMode = sViewModel.isTabManual ? 'Manual' : 'Auto';
      const assignedSEdges = svgModel.edges.filter((edge) => getBucketSlotAssignments(edgeAssignments[edge.id]).some((assignment) => assignment.connectionId === selectedConnection.id));

      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="slot-pm-thickness">
            <h4 id="slot-pm-thickness">PM thickness</h4>
            <dl>
              <div><dt>S-A panel</dt><dd>{sThickness.panelAId ? `${getPanelDisplayName(sThickness.panelAId)} = ${formatCalculatedMm(sThickness.panelAThicknessMm)}` : formatCalculatedMm(sThickness.panelAThicknessMm)}</dd></div>
              <div><dt>S-B panel</dt><dd>{sThickness.panelBId ? `${getPanelDisplayName(sThickness.panelBId)} = ${formatCalculatedMm(sThickness.panelBThicknessMm)}` : formatCalculatedMm(sThickness.panelBThicknessMm)}</dd></div>
              <div><dt>Wall thickness</dt><dd>{formatCalculatedMm(sThickness.panelAThicknessMm)}</dd></div>
              <div><dt>Slot width</dt><dd>{formatCalculatedMm(sThickness.panelAThicknessMm)}</dd></div>
              {sThickness.panelBThicknessMm !== null ? <div><dt>Insert depth</dt><dd>{formatCalculatedMm(sThickness.panelBThicknessMm)}</dd></div> : null}
            </dl>
          </section>

          <section className="property-section" aria-labelledby="slot-assigned-edges">
            <h4 id="slot-assigned-edges">Assigned edges</h4>
            {assignedSEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedSEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.id}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{edge.source}</dd>
                      </div>
                      <div>
                        <dt>Edge length</dt>
                        <dd>{formatCalculatedMm(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y))}</dd>
                      </div>
                      <div>
                        <dt>Current role</dt>
                        <dd>{formatEdgeRoleLabel(getBucketSlotAssignments(edgeAssignments[edge.id]).find((assignment) => assignment.connectionId === selectedConnection.id)?.slotRole)}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-slot-role`}
                      label="Role"
                      value={getBucketSlotAssignments(edgeAssignments[edge.id]).find((assignment) => assignment.connectionId === selectedConnection.id)?.slotRole ?? 'A'}
                      options={['A', 'B']}
                      onChange={(slotRole) => updateAssignedSlotRole(edge.id, slotRole as SlotRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this S label yet. Select this label, then click the S-A and S-B edges in the drawing.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="slot-diagnostics">
            <h4 id="slot-diagnostics">{selectedConnection.id} diagnostics</h4>
            {sViewModel.diagnostics.includes('Waiting for S-A/S-B.') ? <p className="muted">Waiting for S-A/S-B.</p> : null}
            <dl>
              <div><dt>Mode</dt><dd>{sMode}</dd></div>
              <div><dt>Stored value</dt><dd>{formatCalculatedMm(sViewModel.storedTabMm)}</dd></div>
              <div><dt>Computed auto value</dt><dd>{formatCalculatedMm(sViewModel.autoTabMm)}</dd></div>
              <div><dt>Display value</dt><dd>{formatCalculatedMm(sViewModel.displayTabMm)}</dd></div>
            </dl>
          </section>

          <section className="property-section" aria-labelledby="slot-basic-properties">
            <h4 id="slot-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="slot-offset" label="Slot offset inward from selected S-B edge (mm)" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
              <NumericField id="slot-length" label="Slot length (mm)" min={0} value={displayedSlotLengthMm} disabled={displayedSlotLengthMm === null} placeholder="Complete S connection" onChange={(slotLengthMm) => updateSlotProperties({ slotLengthMm })} />
            </div>
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'W') {
      const properties = selectedConnection.properties;
      const selectedEdges = svgModel.edges.filter((edge) => properties.selectedEdgeIds.includes(edge.id));
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="wall-assigned-edges">
            <h4 id="wall-assigned-edges">W group metadata</h4>
            {selectedEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {selectedEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.id}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{edge.source}</dd>
                      </div>
                      <div>
                        <dt>References</dt>
                        <dd>{getEdgeAssignmentDisplayLabels(edgeAssignments[edge.id]).join(', ') || 'None'}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Start this W group, then click wall edges that already carry E or S references.</p>
            )}
            {properties.referencePatternType && properties.generatedPatternType && (
              <p className="muted">Reference pattern: {properties.referencePatternType}; W role pattern: {properties.generatedPatternType}.</p>
            )}
          </section>
        </div>
      );
    }


    return null;

  };

  const renderCompactControls = () => {
    if (selectedConnection?.prefix === 'E') {
      const properties = selectedConnection.properties;
      const tbViewModel = getConnectionViewModel(svgModel, edgeAssignments, selectedConnection, panelManager, getPanelDisplayName);

      return (
        <div className="compact-property-controls" aria-label="Compact E controls">
          <span className="muted">PM thickness</span>
          <NumericField id="compact-edge-tab-size" label="Tab" min={0} value={tbViewModel.displayTabMm} disabled={tbViewModel.displayTabMm === null} placeholder="Complete TB connection" onChange={(fingerWidthMm) => updateEdgeProperties({ fingerWidthMm })} />
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
          <NumericField id="compact-slot-tab-size" label="Tab" min={0} value={displayedSlotLengthMm} disabled={displayedSlotLengthMm === null} placeholder="Complete S connection" onChange={(slotLengthMm) => updateSlotProperties({ slotLengthMm })} />
          <NumericField id="compact-slot-offset" label="Offset" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
        </div>
      );
    }

    if (activeTool === 'W' && selectedConnection?.prefix === 'W') {
      const properties = selectedConnection.properties;
      const controlsLabel = activeWGroup?.isActive && activeWGroup.connectionId === selectedConnection.id
        ? 'Compact active W group controls'
        : 'Compact selected W controls';

      return (
        <div className="compact-property-controls" aria-label={controlsLabel}>
          <NumericField id="compact-wall-material-thickness" label="Thickness" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateWallProperties({ materialThicknessMm })} />
          <NumericField id="compact-wall-tab-size" label="Tab" min={0} value={properties.fingerWidthMm} onChange={(fingerWidthMm) => updateWallProperties({ fingerWidthMm })} />
        </div>
      );
    }

    return null;
  };

  const baseViewBox = parseViewBox(svgModel.viewBox);
  const labelZoom = Math.max(minZoom, baseViewBox.width / canvasViewBox.width);
  const labelScreenFontSize = Math.max(minLabelFontSizePx, labelFontSizePx);
  const labelScale = labelScreenFontSize / labelZoom / labelFontSizePx;
  const labelEdgeOffset = labelEdgeOffsetPx / labelZoom;
  const displayEdgeAssignments = useMemo(
    () => buildActiveWDisplayAssignments(edgeAssignments, connections, activeWGroup),
    [activeWGroup, connections, edgeAssignments],
  );
  const tbCanvasLabelAliases = useMemo(() => buildTBCanvasLabelAliasMap(tbLabelGroups), [tbLabelGroups]);
  const labelPlacements = getEdgeLabelPlacements(svgModel.edges, displayEdgeAssignments, {
    fontSizePx: labelFontSizePx,
    paddingXPx: labelPaddingXPx,
    paddingYPx: labelPaddingYPx,
    edgeOffsetPx: labelEdgeOffset,
    labelScale,
    formatDisplayLabel: (label) => tbCanvasLabelAliases[label] ?? label,
  });
  const labelPlacementsByEdgeId = labelPlacements.reduce((placementsByEdgeId, placement) => {
    placementsByEdgeId.set(placement.edgeId, [...(placementsByEdgeId.get(placement.edgeId) ?? []), placement]);
    return placementsByEdgeId;
  }, new Map<string, typeof labelPlacements>());
  const appliedEEdgeIds = useMemo(
    () => new Set(appliedEPanelPaths.flatMap((panelPath) => panelPath.edgeIds)),
    [appliedEPanelPaths],
  );
  const appliedSPanelEdgeIds = useMemo(
    () => new Set(appliedSGeometry.flatMap((geometry) => geometry.panelPaths.flatMap((panelPath) => panelPath.edgeIds))),
    [appliedSGeometry],
  );

  const renderPanelTree = (nodes: PanelTreePanelNode[]) => (
    <ul className="pm-tree">
      {nodes.map((node) => (
        <li key={node.id} className="pm-tree-item">
          <div className={`pm-tree-row pm-tree-panel-row${activePanelId === node.id ? ' active' : ''}`}>
            <button
              type="button"
              className="pm-tree-node-button"
              onClick={() => {
                setActivePanelId(node.id);
                setActiveHoleId(null);
              }}
            >
              <strong>{node.label}</strong>
              <span>{node.parentPanelId ? `Child of ${getPanelDisplayName(node.parentPanelId)}` : 'Root'}</span>
            </button>
            <NumericField
              id={`pm-tree-thickness-${node.id}`}
              label="Thickness"
              min={0}
              step={0.01}
              value={panelManager.panels[node.id]?.thicknessMm ?? 0}
              onFocus={() => {
                setActivePanelId(node.id);
                setActiveHoleId(null);
              }}
              onChange={(thicknessMm) => updatePanelThickness(node.id, thicknessMm)}
            />
          </div>
          <ul className="pm-tree pm-tree-contours">
            <li className="pm-tree-item pm-tree-static">Outer contour</li>
            {node.holes.map((hole) => (
              <li key={hole.id} className="pm-tree-item">
                <button
                  type="button"
                  className={`pm-tree-row pm-tree-hole-row${activeHoleId === hole.id ? ' active' : ''}`}
                  onClick={() => {
                    setActivePanelId(null);
                    setActiveHoleId(hole.id);
                  }}
                >
                  <span>{hole.label}</span>
                </button>
                {hole.childPanels.length > 0 ? renderPanelTree(hole.childPanels) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="app-shell">
      <header className="top-toolbar" aria-label="Primary actions">
        <div className="brand-lockup" aria-label="SVG Box Designer">
          <span className="brand-mark" aria-hidden="true">SBD</span>
          <h1>SVG BOX DESIGNER</h1>
        </div>
        <div className="toolbar-actions">
          <label className="toolbar-button primary" title="Import SVG">
            Import
            <input type="file" accept=".svg,image/svg+xml" onChange={handleImportWithError} />
          </label>
          <button className="toolbar-button" type="button" disabled title="Save placeholder">Save</button>
          <button className="toolbar-button" type="button" onClick={exportSvg} disabled={isProjectLocked || Object.keys(edgeAssignments).length === 0} title="Export SVG">Export</button>
          <button className="toolbar-button" type="button" onClick={requestClearProject}>Clear</button>
          <button className="toolbar-button" type="button" onClick={fitCanvasToScreen}>Fit to screen</button>
          <button className="toolbar-button icon-button" type="button" onClick={undoLastEdit} disabled={undoStack.length === 0} aria-label="Undo" title="Undo">↶</button>
          <button className="toolbar-button icon-button" type="button" onClick={redoLastEdit} disabled={redoStack.length === 0} aria-label="Redo" title="Redo">↷</button>
          <button className="toolbar-button" type="button" onClick={applyPanelPaths} disabled={isProjectLocked || !hasApplyInputs}>Apply</button>
          <button
            className="toolbar-button"
            type="button"
            onClick={activeToolbarFinish?.onClick}
            disabled={isProjectLocked || !activeToolbarFinish}
            title={activeToolbarFinish ? `${activeToolbarFinish.label} Group` : 'No active group for current tool'}
          >
            {activeToolbarFinish?.label ?? 'Finish Group'}
          </button>
          <a ref={downloadRef} className="visually-hidden" aria-hidden="true">
            download
          </a>
        </div>
      </header>

      {isClearDialogOpen && (
        <div className="clear-dialog-backdrop" role="presentation">
          <div className="clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-dialog-title">
            <h2 id="clear-dialog-title">Clear current project?</h2>
            <div className="clear-dialog-actions">
              <button className="toolbar-button" type="button" onClick={cancelClearProject}>Cancel</button>
              <button className="toolbar-button primary" type="button" onClick={clearProject}>Clear</button>
            </div>
          </div>
        </div>
      )}

      {isPanelManagerModalOpen && (
        <div className="clear-dialog-backdrop" role="presentation">
          <div className="clear-dialog panel-manager-modal" role="dialog" aria-modal="true" aria-labelledby="panel-manager-title">
            <h2 id="panel-manager-title">Panel Manager</h2>
            <div className="panel-manager-modal-content">
              <h3>Import summary</h3>
              <p>Panel count: {svgModel.panels.length}</p>
              <p>Hole count: {svgModel.panels.reduce((total, panel) => total + panel.innerContours.length, 0)}</p>
              {formatImportDiagnosticMessage(svgModel).split('\n').map((line) => <p key={line}>{line}</p>)}
              <h3>Containment tree preview</h3>
              {panelContainmentTree.length > 0 ? renderPanelTree(panelContainmentTree) : <p>No panels detected.</p>}
              <p>Please assign panel thickness before continuing, or accept the project default thickness.</p>
            </div>
            <div className="clear-dialog-actions">
              <button className="toolbar-button primary" type="button" onClick={() => { setIsPanelManagerModalOpen(false); setActiveTool('PM'); }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && <div className="notice">{errorMessage}</div>}

      <section className="workspace" aria-label="SVG connection workspace">
        <aside className="tool-sidebar" aria-label="Tool sidebar">
          {([
            ['select', 'Select', 'Select and inspect existing edges'],
            ['TB', 'TB', 'Tab/box edge tool alias for Top/Bottom connections'],
            ['W', 'W', 'Wall connection workflow'],
            ['S', 'S', 'Slot connection workflow'],
            ['J', 'J', 'Future joint tool placeholder'],
            ['P', 'P', 'Future pattern tool placeholder'],
            ['manufacturing', 'MFG', 'Global manufacturing settings'],
          ] as const).map(([tool, label, title]) => (
            <button
              key={tool}
              type="button"
              className={`tool-button${activeTool === tool ? ' active' : ''}`}
              title={title}
              aria-pressed={activeTool === tool}
              onClick={() => handleToolClick(tool)}
              disabled={isProjectLocked && !['select', 'PM'].includes(tool)}
            >
              {label}
            </button>
          ))}
        </aside>

        <aside className="active-tool-panel panel">
          <div className="panel-heading">
            <p className="eyebrow">Active tool</p>
            <h2>{activeTool === 'TB' ? 'TB / Top Bottom' : activeTool === 'manufacturing' ? 'Manufacturing' : activeTool}</h2>
          </div>

          {activeTool === 'PM' && (
            <div className="active-tool-card">
              <h3>Panel containment tree</h3>
              <p className="muted">Only real panels have thickness inputs. Holes are listed as inner contours and never receive P labels or thickness inputs.</p>
              <p>Panels: {svgModel.panels.length}</p>
              {panelContainmentTree.length > 0 ? renderPanelTree(panelContainmentTree) : <p className="muted">No panels detected.</p>}
              {panelManagerValidationMessage ? <p className="notice inline-notice">{panelManagerValidationMessage}</p> : null}
              <div className="pm-actions">
                <button className="toolbar-button" type="button" onClick={acceptDefaultPanelThickness}>Accept default thickness</button>
                <button className="toolbar-button primary" type="button" onClick={applyPanelManager} disabled={!canApplyPanelManager}>Apply</button>
                <button className="toolbar-button" type="button" onClick={finishPanelManager} disabled={!panelManager.isApplied}>Finish PM</button>
              </div>
            </div>
          )}

          {activeTool === 'select' && (
            <div className="selection-card active-tool-card">
              <h3>Selection</h3>
              <p className="muted">Inspect the selected edge and its assigned connection. Use the left toolbar to switch tools.</p>
              {selectedEdge ? (
                <dl>
                  <dt>Edge</dt>
                  <dd>{selectedEdge.id}</dd>
                  <dt>Source</dt>
                  <dd>{selectedEdge.source}</dd>
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
              <p className="muted">Apply Panel Manager before using TB, S, W, Manufacturing, edge assignment, export, or future tools.</p>
            </div>
          )}

          {!isProjectLocked && activeTool === 'manufacturing' && (
            <div className="active-tool-card manufacturing-card">
              <h3>Manufacturing settings</h3>
              <div className="property-grid">
                <NumericField id="manufacturing-kerf" label="Kerf" min={0} value={projectSettings.kerfMm} onChange={(kerfMm) => updateProjectSettings({ kerfMm })} />
                <NumericField id="manufacturing-slot-clearance" label="Slot clearance" min={0} value={projectSettings.slotClearanceMm} onChange={(slotClearanceMm) => updateProjectSettings({ slotClearanceMm })} />
              </div>
              <p className="muted">Kerf applies globally to the whole generated output.</p>
              <p className="muted">Slot clearance applies only to S-generated slot contours before Kerf.</p>
            </div>
          )}

          {!isProjectLocked && (activeTool === 'J' || activeTool === 'P') && (
            <div className="active-tool-card placeholder-card">
              <h3>{activeTool === 'J' ? 'Join coming soon' : 'Pattern coming soon'}</h3>
              <p className="muted">This tool is a placeholder and has no actions yet.</p>
            </div>
          )}

          {!isProjectLocked && (activeTool === 'TB' || activeTool === 'S' || activeTool === 'W') && (
            <>
              <div className="active-label-card" aria-live="polite">
                <span>Selected connection</span>
                <strong>{activeTool === 'TB' ? formatTBDisplayLabel(selectedLabelId) : selectedLabelId ?? 'None'}</strong>
              </div>

              <div className="label-manager">
                {labelsByGroup
                  .filter(({ prefix }) => (activeTool === 'TB' ? prefix === 'E' : prefix === activeTool))
                  .map(({ prefix, name, description, labels: groupLabels }) => (
              <section className="label-group" key={prefix} aria-label={name}>
                <div className="label-group-header">
                  <div>
                    <h3>{prefix === 'E' ? 'TB / Top Bottom' : `${prefix} = ${name}`}</h3>
                    <p>{prefix === 'E' ? 'Top/Bottom connections' : description}</p>
                  </div>
                  {prefix !== 'E' && prefix !== 'S' && prefix !== 'W' && (
                    <div className="label-actions">
                      <button type="button" onClick={() => createLabel(prefix)}>
                        Add {getNextLabel(prefix, availableLabels)}
                      </button>
                    </div>
                  )}
                </div>

                {groupLabels.length > 0 ? (
                  prefix === 'E' ? (
                    <ul className="label-list s-group-list">
                      {tbLabelGroups.map((tbGroup, groupIndex) => {
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
                  ) : prefix === 'W' ? (
                    <ul className="label-list s-group-list">
                      {wLabelGroups.map((wGroup, groupIndex) => {
                        const label = wGroup.labels[0];
                        const isExpanded = wGroup.isActive || expandedWGroups[wGroup.id] === true;
                        const connection = connections[label];
                        const selectedCount = connection?.prefix === 'W' ? connection.properties.selectedEdgeIds.length : 0;
                        return (
                          <li key={wGroup.id}>
                            <button
                              type="button"
                              className={`s-group-toggle${selectedLabelId === label ? ' selected-label' : ''}`}
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedWGroups((currentGroups) => ({ ...currentGroups, [wGroup.id]: !isExpanded }))}
                            >
                              <strong>W Group {groupIndex + 1} ({selectedCount})</strong>
                              <span>{isExpanded ? 'Hide' : 'Show'}</span>
                            </button>
                            {isExpanded && (
                              <ul className="s-group-connection-list">
                                <li>
                                  <button
                                    type="button"
                                    className={selectedLabelId === label ? 'selected-label' : ''}
                                    onClick={() => {
                                      selectConnectionForDisplayAndAssignment(label);
                                      setErrorMessage('');
                                    }}
                                  >
                                    <strong>{label}</strong>
                                    <span>{selectedCount} {selectedCount === 1 ? 'wall edge' : 'wall edges'}</span>
                                  </button>
                                </li>
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="label-list">
                      {groupLabels.map((label) => (
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
                  <p className="empty-labels">No {prefix === 'E' ? 'TB / Top Bottom' : prefix} connections yet.</p>
                )}
              </section>
            ))}
              </div>

              <div className="properties-card">
                <div>
                  <p className="eyebrow">Properties</p>
                  <h3>{selectedConnection ? `${activeTool === 'TB' ? formatTBDisplayLabel(selectedConnection.id) : selectedConnection.id} details` : 'No connection selected'}</h3>
                </div>
                {renderPropertiesPanel()}
              </div>
            </>
          )}

        </aside>

        <section className="canvas-card">
          <div className="canvas-frame" ref={canvasFrameRef}>
            <div className="canvas-history-controls" aria-label="Canvas compact property controls">
              {renderCompactControls()}
            </div>
            <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
              <button type="button" onClick={() => zoomCanvas(buttonZoomFactor)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => zoomCanvas(1 / buttonZoomFactor)} aria-label="Zoom out">−</button>
            </div>
            <svg
              ref={svgRef}
              className={`design-svg${isCanvasPanning ? ' is-panning' : ''}`}
              viewBox={formatViewBox(canvasViewBox)}
              role="img"
              aria-label="Imported SVG with selectable edges"
              onWheel={handleCanvasWheel}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerLeave}
            >
              <g className="final-contour-kerf-layer">
                {kerfCompensatedAppliedPreview.contours.map((contour) => (
                  <path
                    key={contour.id}
                    className={contour.kind === 'INNER' ? 'final-slot-path' : 'final-panel-path'}
                    d={contour.pathD}
                  />
                ))}
              </g>
              {isPanelManagerVisible && (
                <g className="panel-manager-overlays" aria-hidden="true">
                  {panelTreeHoleItems.map((hole) => (
                    <path key={hole.id} className={`panel-manager-hole-highlight${activeHoleId === hole.id ? ' active' : ''}`} d={hole.pathD} />
                  ))}
                  {panelDisplayItems.map((panel) => (
                    <g key={panel.panelId}>
                      <path className={`panel-manager-panel-highlight${activePanelId === panel.panelId ? ' active' : ''}`} d={panel.pathD} />
                      <CanvasAnnotation className="panel-manager-label" label={panel.name} x={panel.centerX} y={panel.centerY} width={30} height={20} scale={labelScale} />
                    </g>
                  ))}
                </g>
              )}
              <g className="edge-overlays">
                  {svgModel.edges.map((edge) => {
                  const assignment = displayEdgeAssignments[edge.id];
                  const labels = getEdgeAssignmentDisplayLabels(assignment);
                  const label = labels[0];
                  const selected = selectedEdgeId === edge.id;
                  const edgeLabelPlacements = labelPlacementsByEdgeId.get(edge.id) ?? [];
                  const showHighlight = (label || selected) && !appliedEEdgeIds.has(edge.id) && !appliedSPanelEdgeIds.has(edge.id);

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
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressEdgeClickRef.current) {
                            event.preventDefault();
                            return;
                          }
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
                        />
                      ))}
                    </g>
                  );
                  })}
                </g>
            </svg>
          </div>
        </section>
        <aside className="workflow-history-panel panel" aria-label="Workflow history">
          <div className="workflow-history-items" aria-label="Workflow groups">
            <span className="workflow-history-label">History</span>
            {workflowHistoryItems.length > 0 ? workflowHistoryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`workflow-history-item${item.isActive ? ' active' : ''}`}
                aria-label={item.kind === 'PM' ? 'PM, opens Panel Manager panel' : item.kind === 'manufacturing' ? 'MFG, opens Manufacturing panel' : `${item.name}, ${item.isActive ? 'active' : 'inactive'}, ${item.childCount} ${item.childCount === 1 ? 'child connection' : 'child connections'}`}
                aria-pressed={item.kind === 'PM' ? activeTool === 'PM' : item.kind === 'manufacturing' ? activeTool === 'manufacturing' : item.labels.includes(selectedLabelId ?? '')}
                title={item.kind === 'PM' ? 'PM · Panel Manager' : item.kind === 'manufacturing' ? 'MFG · Manufacturing' : `${item.name} · ${item.isActive ? 'Active' : 'Inactive'} · ${item.childCount} ${item.childCount === 1 ? 'child' : 'children'}`}
                onClick={() => navigateToWorkflowHistoryItem(item)}
              >
                <span className="history-item-icon" aria-hidden="true">{item.kind === 'manufacturing' ? 'MFG' : item.kind}</span>
              </button>
            )) : (
              <p className="workflow-history-empty muted">No workflow groups yet.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
