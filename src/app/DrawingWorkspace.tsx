import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from 'react';
import type { DrawingDimension, DrawingDocumentV2, DrawingPoint } from './drawingTypes';
import { applyResolvedProfileClick } from './drawingProfileTool';
import { applyResolvedLineClick } from './drawingLineTool';
import { automaticAxisConstraintKind, diagnoseLineCommonDirection, EMPTY_LINE_SEGMENT_INTERACTION,
  hasAngularPresentationTruth, resolveLineEffectivePoint, resolveLinePreviewPoint,
  selectMinimalLineSemanticConstraints, type LineSegmentInteractionState } from './drawingLineSegmentSupport';
import { appendArcToActiveSketch, appendCircleToActiveSketch, appendEntityToActiveSketch } from './drawingDocumentMutation';
import { applyResolvedCircleClick, circlePreviewRadius, EMPTY_CIRCLE_INTERACTION, updateCirclePreview, type CircleToolInteraction } from './drawingCircleTool';
import { cancelDrawingProfileCommit, flushDrawingProfileCommit, scheduleDrawingProfileCommit, type PendingDrawingProfileCommit } from './drawingProfileCommitBoundary';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisValues, zoomViewBoxAtPoint } from './drawingGrid';
import { clientToModelPoint, modelToOverlayPoint, type CoordinatePoint } from './drawingTransform';
import { collectDrawingInferenceCandidates, derivePointReferenceGuide, filterDrawingInferenceCandidatesForAuthoring } from './drawingInference';
import { resolveDrawingSnap, suppressDirectionRelations, type DrawingSnap } from './drawingSnapEngine';
import { activateDrawingTool, finishDrawingConstruction, isDrawingGeometryAuthoringTool, type DrawingActiveTool, type DrawingToolLifecycle } from './drawingToolLifecycle';
import { resolveArcFormPointSnap, resolveCircumferencePointSnap, resolvePointOnCurveSnap,
  type DrawingCircumferencePointCandidate, type DrawingCurveSnapCandidate } from './drawingCurveSnap';
import { useCadWheelCapture } from './useCadWheelCapture';
import { CAD_PRIMARY_BUTTON, useCadCtrlSnapOverride, useCadEscapeToolExit, useCadPanGesture } from './cadInteraction';
import { resolveCadToolPointerActivation, type CadToolActivationRecord } from './cadToolActivation';
import { appendDimension, chooseLineDimensionKind, choosePointDimensionKind, createDimensionId, createCircularSizeDimension, createLineDimension, createLinePairDimension, createLineToLineAngleDimension, createPointToLineDimension, createPointToPointDimension, deleteDimension, deleteEntityWithDependentDimensions, deriveLineToLineAnnotationGeometry, derivePointToLineAnnotationGeometry, dimensionEditorWidthPixels, dimensionOffset, dimensionScreenPixelsToModelUnits, DIMENSION_EDITOR_HEIGHT_PX, DIMENSION_TEXT_SIZE_PX, displayedDimensionMeasurement, formatAngleDimension, formatCircularDimension, formatDimensionEditValue, formatDimensionValue, lineToLineDimensionOffset, moveDimensionPlacement, parseLinearDimension, pointToLineDimensionOffset, preselectionReference, resolveDimensionAnnotationPlacement, resolveDimensionLineReference, resolveDimensionPreselection, resolveDimensionPreselectionForTarget, resolveDrawingPointReference, type DimensionPreselection, type DimensionToolState } from './drawingDimension';
import { candidateForSector, createLineAngleBasis, deriveLineAngleAnnotation } from './drawingLineAngle';
import { solveDrawingDimensionEdit } from './drawingConstraintSolver';
import type { HistoryControlsProps } from './HistoryControls';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from './drawingHistory';
import { deriveEntityDefiningPointIds, pointIdForLineEndpoint, removeEntityAndOrphans, resolveActiveSketchLines, resolveArc, resolveCircle, resolveLine } from './drawingTopology.js';
import { acceptArcEndpoint, commitArcForm, EMPTY_ARC_INTERACTION, resolveArcEndpointReference, resolveArcPreview, updateArcPreview, type ArcToolInteraction } from './drawingArcTool.js';
import { drawingArcPath } from './drawingArcGeometry.js';
import { circularDimensionEndpoints, resolveCircularSize } from './drawingCircularSize.js';
import { distanceToArc } from './drawingArcGeometry.js';
import { createArcCenterDragTarget, createArcEndpointDragTarget, createArcRadiusDragTarget, createCircleRadiusDragTarget, DRAWING_DRAG_THRESHOLD_PX, pointIdFromHit, resolveArcEndpointOwner, solveDrawingDragCandidate, type DrawingGeometryTarget } from './drawingDirectManipulation.js';
import { geometryConstraintVisualClass, getGeometryConstraintVisualState } from './drawingGeometryVisualState.js';
import { deleteGeometricConstraint, deriveMidpointMarkerPresentation, deriveParallelMarkers, deriveRightAngleMarkers, GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX } from './drawingParallelMarker.js';
import { deriveCoincidentMarkers, deriveSelectedCoincidentReferenceMarker, POINT_CONSTRAINT_MARKER_HIT_RADIUS_PX, POINT_CONSTRAINT_MARKER_SIZE_PX } from './drawingCoincidentConstraint.js';
import { applyDrawingConstraint, clampConstraintsPanelPosition, constraintsPanelDragPosition, constraintsPanelGrabOffset, DRAWING_CONSTRAINT_CATALOG, getDrawingConstraintApplicability, initialConstraintsPanelPosition, toggleDrawingGeometrySelection, type DrawingSelectionRef } from './drawingConstraintsTool.js';
import { deriveDrawingInferencePresentations, type DrawingInferencePresentation } from './drawingInferencePresentation.js';
import { createDrawingDirectionDiagnosticRecorder } from './drawingDirectionDiagnostic.js';
import { applyDrawingBoxSelection, drawingSelectionMode, normalizeDrawingSelectionRect, selectDrawingEntitiesInRect } from './drawingBoxSelection.js';

const preventToolChromeMouseSelection = (event: MouseEvent<HTMLElement>) => {
  if (event.button !== CAD_PRIMARY_BUTTON) return;
  event.preventDefault();
  (event.target as Element).closest<HTMLButtonElement>('.cad-tool-button')?.focus();
};

const preventToolChromePointerSelection = (event: PointerEvent<HTMLElement>) => {
  if (event.button !== CAD_PRIMARY_BUTTON) return;
  // Cancel the pointer default before Edge can synthesize its native mouse/dblclick selection sequence.
  event.preventDefault();
  (event.target as Element).closest<HTMLButtonElement>('.cad-tool-button')?.focus();
};

const preventToolChromeSelection = (event: Event) => {
  event.preventDefault();
};

export type DrawingViewBox = { x: number; y: number; width: number; height: number };
type CoordinateOverlayGeometry = {
  origin: CoordinatePoint;
  xLabels: Array<{ value: number; anchor: CoordinatePoint }>;
  yLabels: Array<{ value: number; anchor: CoordinatePoint }>;
  xIndicatorAnchor: CoordinatePoint;
  yIndicatorAnchor: CoordinatePoint;
};
export type CadCursorPresentation = Readonly<{
  anchor: CoordinatePoint;
  snap: DrawingSnap;
  xGuideReference: CoordinatePoint | null;
  yGuideReference: CoordinatePoint | null;
  sameAxisReference: CoordinatePoint | null;
  lineReference: Readonly<{ relation: 'parallel' | 'perpendicular' | 'midpoint'; targetLineId: string }> | null;
  pointReferenceGuide: Readonly<{ start: CoordinatePoint; end: CoordinatePoint }> | null;
}> | null;

export const DrawingInferenceOverlay = ({ presentations }: { presentations: readonly DrawingInferencePresentation[] }) => (
  <g className="drawing-inference-presentation" aria-hidden="true">
    {presentations.map((presentation) => {
      if (presentation.kind === 'parallel') return <g key={`${presentation.kind}:${presentation.targetLineId}`}
        className="drawing-parallel-inference-preview" data-inference-kind={presentation.kind} data-target-line-id={presentation.targetLineId}>
        {presentation.markers.flatMap((marker) => [-1, 1].map((side) => <line key={`${marker.lineId}:${side}`}
          className="drawing-parallel-marker-stroke" x1={marker.center.x + side * presentation.strokeHalfGap}
          y1={marker.center.y - presentation.strokeHalfLength} x2={marker.center.x + side * presentation.strokeHalfGap}
          y2={marker.center.y + presentation.strokeHalfLength} />))}
      </g>;
      if (presentation.kind === 'perpendicular') return <g key={`${presentation.kind}:${presentation.targetLineId}`}
        className="drawing-perpendicular-inference-preview" data-inference-kind={presentation.kind} data-target-line-id={presentation.targetLineId}>
        {[presentation.geometry.supportExtensionA, presentation.geometry.supportExtensionB]
          .filter((extension) => extension !== undefined).map((extension, index) =>
            <line key={index} className="drawing-perpendicular-support-preview" x1={extension.start.x} y1={extension.start.y} x2={extension.end.x} y2={extension.end.y} />)}
        <polyline className="drawing-line-relation-preview" data-relation="perpendicular"
          points={presentation.geometry.markerPoints.map(({ x, y }) => `${x},${y}`).join(' ')} />
      </g>;
      const halfSquare = presentation.squareSize / 2;
      return <g key={`${presentation.kind}:${presentation.targetLineId}`} className="drawing-midpoint-inference-preview"
        data-inference-kind={presentation.kind} data-target-line-id={presentation.targetLineId}>
        <line x1={presentation.start.x} y1={presentation.start.y} x2={presentation.end.x} y2={presentation.end.y} />
        <rect x={presentation.center.x - halfSquare} y={presentation.center.y - halfSquare}
          width={presentation.squareSize} height={presentation.squareSize} />
      </g>;
    })}
  </g>
);
type GeometryDragSession = Readonly<{
  pointerId: number; target: DrawingGeometryTarget; startClient: CoordinatePoint; startModel: DrawingPoint;
  startDocument: DrawingDocumentV2; candidate: DrawingDocumentV2; exceeded: boolean;
}>;
type DimensionAnnotationDragSession = Readonly<{
  pointerId: number; id: string; startClient: CoordinatePoint;
  startPlacement: DrawingDimension['placement']; previewPlacement: DrawingDimension['placement']; exceeded: boolean;
}>;
type BoxSelectionSession = Readonly<{
  pointerId: number; originClient: CoordinatePoint; originModel: DrawingPoint;
  currentClient: CoordinatePoint; currentModel: DrawingPoint; exceeded: boolean;
}>;
type DrawingPlacementResolution = Readonly<{
  rawPoint: DrawingPoint;
  effectivePoint: DrawingPoint;
  spatialSnap: DrawingSnap;
  interaction: LineSegmentInteractionState;
  position: Readonly<{ kind: 'endpoint'; point: DrawingPoint; pointId: string; entityId: string; endpoint: 'start' | 'end' }>
    | Readonly<{ kind: 'midpoint'; point: DrawingPoint; entityId: string }>
    | Readonly<{ kind: 'line-body'; point: DrawingPoint; entityId: string; segmentParameter: number }>
    | Readonly<{ kind: 'curve'; point: DrawingPoint; entityId: string }>
    | Readonly<{ kind: 'construction'; point: DrawingPoint }>
    | Readonly<{ kind: 'raw'; point: DrawingPoint }>;
  ctrlActive: boolean;
}>;

export const initialDrawingViewBox: DrawingViewBox = { x: -400, y: -300, width: 800, height: 600 };
const formatViewBox = ({ x, y, width, height }: DrawingViewBox) => `${x} ${y} ${width} ${height}`;
/** Restrained, zoom-independent radius for first-class SketchPoint picking. */
export const DRAWING_SKETCH_POINT_HIT_RADIUS_PX = 7;
/** Compact screen-space interaction marker radius; intentionally independent from the Point hit target. */
export const DRAWING_INTERACTION_POINT_RADIUS_PX = 2.5;
export const DRAWING_LINE_HOVER_MARKER_SIZE_PX = 3;
export const DRAWING_POINT_HOVER_MARKER_SIZE_PX = 5;
export const DRAWING_CURVE_HIT_TOLERANCE_PX = 7;

export const shouldRouteCircleBodyPointer = (
  explicitCircleId: string | undefined,
  explicitPointId: string | undefined,
  hasDimensionHit: boolean,
  circleHit: string | undefined,
) => Boolean(explicitCircleId || (!explicitPointId && !hasDimensionHit && circleHit));

export const shouldRouteArcBodyPointer = (
  explicitArcCenterId: string | undefined,
  explicitArcId: string | undefined,
  explicitPointId: string | undefined,
  hasDimensionHit: boolean,
  arcHit: string | undefined,
) => Boolean(explicitArcCenterId || explicitArcId || (!explicitPointId && !hasDimensionHit && arcHit));

export const drawingGeometrySelectionClass = (selection: readonly DrawingSelectionRef[], target: DrawingSelectionRef) =>
  selection.some((ref) => ref.kind === target.kind && (ref.kind === 'line'
    ? ref.lineId === (target as Extract<DrawingSelectionRef, { kind: 'line' }>).lineId
    : ref.kind === 'circle' ? ref.circleId === (target as Extract<DrawingSelectionRef, { kind: 'circle' }>).circleId
    : ref.kind === 'arc' ? ref.arcId === (target as Extract<DrawingSelectionRef, { kind: 'arc' }>).arcId
    : ref.pointId === (target as Extract<DrawingSelectionRef, { kind: 'point' }>).pointId)) ? ' is-geometry-selected' : '';

/** The selection and drag policy used by the production root pointer route. */
export const routeDrawingGeometryPointerSelection = (selection: readonly DrawingSelectionRef[], target: DrawingSelectionRef, ctrlKey: boolean, constraintsOpen: boolean) => {
  const toggle = ctrlKey || constraintsOpen;
  return { selection: toggle ? toggleDrawingGeometrySelection(selection, target) : [target], beginDrag: !toggle } as const;
};

export function DrawingWorkspace({
  document,
  setDocument,
  viewBox,
  setViewBox,
  constraintsPanelOpen,
  setConstraintsPanelOpen,
  onHistoryControllerChange,
}: {
  document: DrawingDocumentV2;
  setDocument: Dispatch<SetStateAction<DrawingDocumentV2>>;
  viewBox: DrawingViewBox;
  setViewBox: Dispatch<SetStateAction<DrawingViewBox>>;
  constraintsPanelOpen: boolean;
  setConstraintsPanelOpen: Dispatch<SetStateAction<boolean>>;
  onHistoryControllerChange?: (controller: HistoryControlsProps | null) => void;
}) {
  const toolSidebarRef = useRef<HTMLElement>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const constraintsPanelRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [overlayGeometry, setOverlayGeometry] = useState<CoordinateOverlayGeometry | null>(null);
  const [toolLifecycle, setToolLifecycle] = useState<DrawingToolLifecycle>(() => activateDrawingTool('select'));
  const activeTool = toolLifecycle.activeTool;
  const isSegmentTool = activeTool === 'profile' || activeTool === 'line';
  const [dimensionTool, setDimensionTool] = useState<DimensionToolState>({ phase: 'inactive' });
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null);
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null);
  const dimensionEditorInputRef = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    input.select();
  }, []);
  const [dimensionDraft, setDimensionDraft] = useState('');
  const [dimensionEditError, setDimensionEditError] = useState<string | null>(null);
  const [dimensionPreselection, setDimensionPreselection] = useState<DimensionPreselection | null>(null);
  const [hoveredDimensionId, setHoveredDimensionId] = useState<string | null>(null);
  const [dimensionDrag, setDimensionDrag] = useState<DimensionAnnotationDragSession | null>(null);
  const [geometryDrag, setGeometryDrag] = useState<GeometryDragSession | null>(null);
  const geometryDragRef = useRef<GeometryDragSession | null>(null);
  const [boxSelection, setBoxSelection] = useState<BoxSelectionSession | null>(null);
  const boxSelectionRef = useRef<BoxSelectionSession | null>(null);
  const [geometryPreselection, setGeometryPreselection] = useState<DimensionPreselection | null>(null);
  const [selectedGeometry, setSelectedGeometry] = useState<readonly DrawingSelectionRef[]>([]);
  const finishConstraintSelection = () => setSelectedGeometry([]);
  const [constraintsPanelPosition, setConstraintsPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const constraintsPanelDragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [selectedGeometricConstraintId, setSelectedGeometricConstraintId] = useState<string | null>(null);
  const [hoveredGeometricConstraintId, setHoveredGeometricConstraintId] = useState<string | null>(null);
  const documentRef = useRef(document);
  const historyRef = useRef(EMPTY_DRAWING_HISTORY);
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    const sidebar = toolSidebarRef.current;
    if (!sidebar) return;
    sidebar.addEventListener('selectionstart', preventToolChromeSelection);
    return () => sidebar.removeEventListener('selectionstart', preventToolChromeSelection);
  }, []);
  useLayoutEffect(() => {
    if (!constraintsPanelOpen || constraintsPanelPosition) return;
    const frame = canvasFrameRef.current?.getBoundingClientRect();
    const panel = constraintsPanelRef.current?.getBoundingClientRect();
    if (frame && panel) setConstraintsPanelPosition(initialConstraintsPanelPosition(frame, panel));
  }, [constraintsPanelOpen, constraintsPanelPosition]);
  const [segmentInteraction, setSegmentInteraction] = useState<LineSegmentInteractionState>(EMPTY_LINE_SEGMENT_INTERACTION);
  const [circleInteraction, setCircleInteraction] = useState<CircleToolInteraction>(EMPTY_CIRCLE_INTERACTION);
  const [arcInteraction, setArcInteraction] = useState<ArcToolInteraction>(EMPTY_ARC_INTERACTION);
  const arcInteractionRef = useRef<ArcToolInteraction>(EMPTY_ARC_INTERACTION);
  const [arcFormCandidate, setArcFormCandidate] = useState<DrawingCircumferencePointCandidate | null>(null);
  const arcFormCandidateRef = useRef<DrawingCircumferencePointCandidate | null>(null);
  const [circleCurveCandidate, setCircleCurveCandidate] = useState<DrawingCurveSnapCandidate | null>(null);
  const [circlePointCandidate, setCirclePointCandidate] = useState<DrawingCircumferencePointCandidate | null>(null);
  const circleCurveCandidateRef = useRef<DrawingCurveSnapCandidate | null>(null);
  const circlePointCandidateRef = useRef<DrawingCircumferencePointCandidate | null>(null);
  const [cadCursor, setCadCursor] = useState<CadCursorPresentation>(null);
  const segmentCursor = cadCursor;
  const [drawingSnap, setDrawingSnap] = useState<DrawingSnap | null>(null);
  const lastPointerClientRef = useRef<CoordinatePoint | null>(null);
  const pendingProfileClickRef = useRef<PendingDrawingProfileCommit | null>(null);
  const activeToolRef = useRef<DrawingActiveTool>(activeTool);
  const previousToolActivationRef = useRef<CadToolActivationRecord<DrawingActiveTool> | null>(null);
  const segmentInteractionRef = useRef(segmentInteraction);
  const drawingSnapRef = useRef<DrawingSnap | null>(drawingSnap);
  const directionDiagnosticRef = useRef(createDrawingDirectionDiagnosticRecorder());
  const directionDiagnosticSequenceRef = useRef(0);
  const resolvePlacementRef = useRef<(clientPoint: CoordinatePoint, ctrlHeld: boolean) => DrawingPlacementResolution | null>(() => null);
  const entitySequence = useRef(0);
  const pointSequence = useRef(0);
  const renderDocument = geometryDrag?.candidate ?? document;
  const activeSketch = renderDocument.sketches[renderDocument.activeSketchId];
  const resolvedLines = activeSketch?.entityOrder.flatMap((id) => {
    const entity = activeSketch.entities[id];
    const line = entity?.type === 'line' ? resolveLine(activeSketch, entity) : null;
    return line ? [line] : [];
  }) ?? [];
  const resolvedCircles = activeSketch?.entityOrder.flatMap((id) => {
    const entity = (activeSketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[id];
    const circle = entity?.type === 'circle' ? resolveCircle(activeSketch, entity) : null;
    return circle ? [circle] : [];
  }) ?? [];
  const resolvedArcs = activeSketch?.entityOrder.flatMap((id) => {
    const entity = (activeSketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[id];
    const arc = entity?.type === 'arc' ? resolveArc(activeSketch, entity) : null;
    return arc ? [arc] : [];
  }) ?? [];
  const activeArcDragId = geometryDrag?.target.kind === 'rigid-translation'
    || geometryDrag?.target.kind === 'arc-endpoint'
    || geometryDrag?.target.kind === 'arc-radius'
    ? geometryDrag.target.entityId : null;
  const activeArcBodyDragId = geometryDrag?.target.kind === 'arc-radius'
    ? geometryDrag.target.entityId : null;
  const activeArcSupportDragId = geometryDrag?.target.kind === 'arc-endpoint' ? geometryDrag.target.entityId : activeArcBodyDragId;
  const gridSpacing = getDrawingGridSpacing(viewBox.width);
  const gridHierarchy = getDrawingGridHierarchy(gridSpacing);
  segmentInteractionRef.current = segmentInteraction;
  arcInteractionRef.current = arcInteraction;
  drawingSnapRef.current = drawingSnap;
  documentRef.current = document;
  boxSelectionRef.current = boxSelection;
  geometryDragRef.current = geometryDrag;

  const cancelGeometryDrag = (pointerId?: number) => {
    if (pointerId !== undefined && geometryDragRef.current?.pointerId !== pointerId) return;
    geometryDragRef.current = null;
    setGeometryDrag(null);
  };

  const endBoxSelection = (releaseCapture = true) => {
    const session = boxSelectionRef.current;
    boxSelectionRef.current = null;
    setBoxSelection(null);
    const svg = svgRef.current;
    if (releaseCapture && session && svg?.hasPointerCapture(session.pointerId)) svg.releasePointerCapture(session.pointerId);
  };

  const transactDocument = (update: (current: DrawingDocumentV2) => DrawingDocumentV2) => {
    const result = transactDrawingDocument(historyRef.current, documentRef.current, update);
    if (!result.changed) return;
    historyRef.current = result.history;
    documentRef.current = result.document;
    setDocument(result.document);
    setHistoryRevision((revision) => revision + 1);
  };

  useEffect(() => {
    const activate = (event: Event) => {
      const detail = (event as CustomEvent<{ timestamp?: number; x?: number; y?: number }>).detail;
      if (detail?.timestamp !== undefined && detail.x !== undefined && detail.y !== undefined) {
        const resolution = resolveCadToolPointerActivation('dimension', detail.timestamp, { x: detail.x, y: detail.y }, previousToolActivationRef.current);
        previousToolActivationRef.current = resolution.record;
        selectTool('dimension', resolution.activationMode);
      } else {
        previousToolActivationRef.current = null;
        selectTool('dimension');
      }
    };
    window.addEventListener('drawing:activate-dimension', activate);
    return () => window.removeEventListener('drawing:activate-dimension', activate);
  });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('drawing:tool-state', { detail: { activeTool, activationMode: toolLifecycle.activationMode } }));
  }, [activeTool, toolLifecycle.activationMode]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setViewport({ width, height });
      setViewBox((current) => {
        const nextWidth = current.height * width / height;
        if (Math.abs(nextWidth - current.width) < 0.01) return current;
        const centerX = current.x + current.width / 2;
        return { ...current, x: centerX - nextWidth / 2, width: nextWidth };
      });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [setViewBox]);

  useCadWheelCapture(svgRef, (event) => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const xRatio = (event.clientX - bounds.left) / bounds.width;
    const yRatio = (event.clientY - bounds.top) / bounds.height;
    setViewBox((current) => zoomViewBoxAtPoint(current, Math.exp(-event.deltaY * 0.0015), {
      x: current.x + xRatio * current.width,
      y: current.y + yRatio * current.height,
    }));
  });

  const zoom = (factor: number, anchor?: { x: number; y: number }) => setViewBox((current) => zoomViewBoxAtPoint(current, factor, anchor ?? {
    x: current.x + current.width / 2,
    y: current.y + current.height / 2,
  }));

  const resolvePlacement = (clientPoint: CoordinatePoint, ctrlHeld: boolean, phase: 'hover' | 'click' = 'hover'): DrawingPlacementResolution | null => {
    const drawingTransform = svgRef.current?.getScreenCTM();
    const overlayTransform = overlaySvgRef.current?.getScreenCTM();
    if (!drawingTransform || !overlayTransform) return null;
    const rawPoint = clientToModelPoint(clientPoint, drawingTransform);
    if (!rawPoint) return null;
    // A pending Profile commit can be flushed earlier in this same browser event.
    // React has not rendered that document yet, so inference must read the
    // synchronously updated transaction snapshot rather than render closure data.
    const inferenceDocument = documentRef.current;
    const inferenceSketch = inferenceDocument.sketches[inferenceDocument.activeSketchId];
    const inferenceLines = resolveActiveSketchLines(inferenceDocument);
    const interaction = segmentInteractionRef.current;
    const angularIntent = !ctrlHeld && interaction.start ? resolveLinePreviewPoint(interaction.start, rawPoint) : null;
    const priorAuthority = !ctrlHeld ? drawingSnapRef.current?.channels.directionAuthority ?? null : null;
    const establishedDegrees = priorAuthority
      ? Math.atan2(priorAuthority.constructionDirection.y, priorAuthority.constructionDirection.x) * 180 / Math.PI : null;
    const allCandidates = collectDrawingInferenceCandidates(clientPoint, inferenceLines, drawingTransform, viewBox, interaction.start,
      establishedDegrees ?? (angularIntent?.snapActive ? angularIntent.snappedAngleDegrees : null), interaction.startPointId,
      inferenceSketch ? Object.values(inferenceSketch.points) : []);
    const circleP2 = activeToolRef.current === 'circle' && circleInteraction.center !== null;
    const arcP3 = activeToolRef.current === 'arc' && arcInteractionRef.current.end !== null;
    const candidates = filterDrawingInferenceCandidatesForAuthoring(allCandidates,
      activeToolRef.current !== 'circle' && activeToolRef.current !== 'arc' ? 'segment'
        : activeToolRef.current === 'circle' && circleP2 || arcP3 ? 'circle-p2' : 'circle-p1');
    const axisDirectionActive = angularIntent?.snapActive === true && angularIntent.snappedAngleDegrees !== null
      && [0, 90, 180, 270].includes(angularIntent.snappedAngleDegrees);
    const previousSnap = drawingSnapRef.current;
    let snap = resolveDrawingSnap({ rawPoint, candidates, previousSnap, ctrlOverride: ctrlHeld, axisDirectionActive,
      activeLineStart: interaction.start, activeLineStartPointId: interaction.startPointId });
    const snapBeforeHvSuppression = snap;
    const commonDirection = diagnoseLineCommonDirection(snap);
    const lineResolution = activeToolRef.current === 'circle' || activeToolRef.current === 'arc'
      ? { effectivePoint: snap.effectivePoint, interaction, resolvedReferences: { x: null, y: null }, diagnostic: null }
      : resolveLineEffectivePoint(interaction, rawPoint, snap, ctrlHeld);
    let placementPoint = lineResolution.effectivePoint;
    const nextInteraction = lineResolution.interaction;
    const semanticSelection = selectMinimalLineSemanticConstraints(nextInteraction);
    const automaticAxisKind = automaticAxisConstraintKind(nextInteraction);
    const suppressedDirectionRelations = automaticAxisKind !== null;
    if (suppressedDirectionRelations) snap = suppressDirectionRelations(snap);
    let circleCurve: DrawingCurveSnapCandidate | null = null;
    let circlePoint: DrawingCircumferencePointCandidate | null = null;
    if ((activeToolRef.current === 'circle' || activeToolRef.current === 'arc') && !ctrlHeld) {
      if (activeToolRef.current === 'arc' && arcInteractionRef.current.start && arcInteractionRef.current.end) {
        circlePoint = resolveArcFormPointSnap({ start: arcInteractionRef.current.start.point, end: arcInteractionRef.current.end.point,
          rawPoint, points: inferenceSketch ? Object.values(inferenceSketch.points) : [], transform: drawingTransform,
          previousPointId: arcFormCandidateRef.current?.pointId ?? null });
        placementPoint = circlePoint?.point ?? rawPoint;
        arcFormCandidateRef.current = circlePoint; setArcFormCandidate(circlePoint);
      } else if (activeToolRef.current === 'circle' && circleInteraction.center) {
        circlePoint = resolveCircumferencePointSnap({ center: circleInteraction.center, rawPoint,
          points: inferenceSketch ? Object.values(inferenceSketch.points) : [], transform: drawingTransform,
          previousPointId: circlePointCandidateRef.current?.pointId ?? null });
        if (circlePoint) {
          const dx = rawPoint.x - circleInteraction.center.x, dy = rawPoint.y - circleInteraction.center.y;
          const length = Math.hypot(dx, dy);
          placementPoint = length > 1e-12
            ? { x: circleInteraction.center.x + dx * circlePoint.radius / length,
              y: circleInteraction.center.y + dy * circlePoint.radius / length }
            : { x: circleInteraction.center.x + circlePoint.radius, y: circleInteraction.center.y };
        } else placementPoint = rawPoint;
      } else if (!snap.active || snap.type === 'alignment') {
        circleCurve = resolvePointOnCurveSnap({ rawPoint, pointerClient: clientPoint, curves: [...resolvedCircles, ...resolvedArcs],
          transform: drawingTransform, previousCurveId: circleCurveCandidateRef.current?.curveId ?? null });
        if (circleCurve) placementPoint = circleCurve.point;
      }
    }
    circleCurveCandidateRef.current = circleCurve;
    circlePointCandidateRef.current = circlePoint;
    setCircleCurveCandidate(circleCurve);
    setCirclePointCandidate(circlePoint);
    const anchor = modelToOverlayPoint(circlePoint?.point ?? placementPoint, drawingTransform, overlayTransform);
    setDrawingSnap(snap);
    drawingSnapRef.current = snap;
    setSegmentInteraction(nextInteraction);
    segmentInteractionRef.current = nextInteraction;
    const xGuideReference = lineResolution.resolvedReferences.x?.positionOwnership !== 'reference-only' && lineResolution.resolvedReferences.x
      ? modelToOverlayPoint(lineResolution.resolvedReferences.x.referencePoint ?? lineResolution.resolvedReferences.x.candidatePoint, drawingTransform, overlayTransform) : null;
    const yGuideReference = lineResolution.resolvedReferences.y?.positionOwnership !== 'reference-only' && lineResolution.resolvedReferences.y
      ? modelToOverlayPoint(lineResolution.resolvedReferences.y.referencePoint ?? lineResolution.resolvedReferences.y.candidatePoint, drawingTransform, overlayTransform) : null;
    const sameAxisReferenceCandidate = lineResolution.resolvedReferences.x?.positionOwnership === 'reference-only'
      ? lineResolution.resolvedReferences.x : lineResolution.resolvedReferences.y?.positionOwnership === 'reference-only'
        ? lineResolution.resolvedReferences.y : null;
    const sameAxisReference = sameAxisReferenceCandidate
      ? modelToOverlayPoint(sameAxisReferenceCandidate.referencePoint ?? sameAxisReferenceCandidate.candidatePoint, drawingTransform, overlayTransform) : null;
    const lineReference = nextInteraction.parallelLineId
      ? { relation: 'parallel' as const, targetLineId: nextInteraction.parallelLineId }
      : nextInteraction.perpendicularLineId
        ? { relation: 'perpendicular' as const, targetLineId: nextInteraction.perpendicularLineId }
        : snap.type === 'midpoint' ? { relation: 'midpoint' as const, targetLineId: snap.entityId } : null;
    const pointReferenceGuide = snap.type === 'point-reference' && anchor
      ? (() => {
        const source = modelToOverlayPoint(snap.supportOrigin, drawingTransform, overlayTransform);
        return source ? derivePointReferenceGuide(source, anchor) : null;
      })() : null;
    if (interaction.start) {
      const diagnosticPresentations = deriveDrawingInferencePresentations(
        snap, inferenceSketch, viewport.width / viewBox.width, drawingTransform, overlayTransform, nextInteraction,
      );
      const nearest = <T extends { screenDistance: number }>(items: readonly T[]) => items[0] ?? null;
      const summarizeDirection = ({ entityId, candidatePoint, screenDistance, lineStart, lineEnd, referenceIncidentToActiveLineStart }: {
        entityId: string; candidatePoint: DrawingPoint; screenDistance: number; lineStart?: DrawingPoint; lineEnd?: DrawingPoint;
        referenceIncidentToActiveLineStart?: boolean;
      }) =>
        ({ entityId, candidatePoint, screenDistance, lineStart, lineEnd, referenceIncidentToActiveLineStart });
      const summarizeAlignment = (candidate: { referenceId: string; entityId: string; candidatePoint: DrawingPoint;
        referencePoint?: DrawingPoint; screenDistance: number; positionOwnership: 'defines-position' | 'reference-only' } | null) => candidate && ({
        referenceId: candidate.referenceId, entityId: candidate.entityId, candidatePoint: candidate.candidatePoint,
        referencePoint: candidate.referencePoint, screenDistance: candidate.screenDistance, positionOwnership: candidate.positionOwnership,
      });
      directionDiagnosticRef.current.record({
        sequence: ++directionDiagnosticSequenceRef.current,
        phase,
        pointer: { client: clientPoint, rawModel: rawPoint, lineStart: interaction.start },
        context: {
          viewBox, pixelsPerModelUnit: viewport.width / viewBox.width, ctrlActive: ctrlHeld,
          ctm: { a: drawingTransform.a, b: drawingTransform.b, c: drawingTransform.c, d: drawingTransform.d, e: drawingTransform.e, f: drawingTransform.f },
          document: { activeSketchId: inferenceDocument.activeSketchId,
            entityOrder: inferenceSketch?.entityOrder ?? [],
            resolvedLines: inferenceLines.map(({ id, startPointId, endPointId, start, end }) =>
              ({ id, startPointId, endPointId, start, end })) },
          angularIntent: angularIntent && { snapActive: angularIntent.snapActive, snappedAngleDegrees: angularIntent.snappedAngleDegrees },
          axisDirectionActive,
          lineStart: interaction.start, startPointId: interaction.startPointId,
          startLineId: interaction.startLineId, startMidpointLineId: interaction.startMidpointLineId,
          incidentLineIds: inferenceLines.filter((line) => interaction.startPointId
            && (line.startPointId === interaction.startPointId || line.endPointId === interaction.startPointId)).map(({ id }) => id),
        },
        candidates: {
          parallel: candidates.parallels.map((candidate) => ({ ...summarizeDirection(candidate), role: 'direction-candidate' })),
          perpendicular: candidates.perpendiculars.map((candidate) => ({ ...summarizeDirection(candidate), role: 'direction-candidate' })),
          endpoints: candidates.endpoints,
          midpoints: candidates.midpoints,
          finiteLines: candidates.lines,
          pointReferences: candidates.pointReferences,
          alignmentsX: candidates.alignmentsX,
          alignmentsY: candidates.alignmentsY,
          xAlignmentNearest: summarizeAlignment(nearest(candidates.alignmentsX)), yAlignmentNearest: summarizeAlignment(nearest(candidates.alignmentsY)),
        },
        previousSnap: previousSnap && { type: previousSnap.type, effectivePoint: previousSnap.effectivePoint, channels: previousSnap.channels,
          parallelEntityId: previousSnap.channels.parallel?.entityId ?? null,
          perpendicularEntityId: previousSnap.channels.perpendicular?.entityId ?? null,
          pointReferenceIdentity: previousSnap.channels.pointReference?.constructionKey ?? null },
        snapResult: {
          type: snapBeforeHvSuppression.type, effectivePoint: snapBeforeHvSuppression.effectivePoint,
          channels: snapBeforeHvSuppression.channels,
          directionAuthority: snapBeforeHvSuppression.channels.directionAuthority,
          positionAuthority: { type: snapBeforeHvSuppression.type, reason: snapBeforeHvSuppression.active
            ? 'highest acquired positional role after direction selection' : 'raw pointer fallback' },
          rejectedRedundantDirectionRelations: snapBeforeHvSuppression.channels.rejectedRedundantDirectionRelations,
        },
        lineResolution: {
          selectedDirectionAuthority: lineResolution.diagnostic?.selectedDirectionAuthority ?? null,
          selectedPositionAuthority: { type: snapBeforeHvSuppression.type, reason: snapBeforeHvSuppression.active
            ? 'highest acquired positional role after direction selection' : 'raw pointer fallback' },
          finalGeometryCompatibleWithDirectionAuthority: lineResolution.diagnostic?.finalGeometryCompatibleWithDirectionAuthority ?? null,
          directionAuthorityRejectionReason: lineResolution.diagnostic?.directionAuthorityRejectionReason ?? null,
          before: { incomingParallelLineId: interaction.parallelLineId, incomingPerpendicularLineId: interaction.perpendicularLineId,
            snapType: snapBeforeHvSuppression.type, rawPointer: rawPoint },
          commonDirection,
          after: { effectivePoint: lineResolution.effectivePoint, parallelLineId: nextInteraction.parallelLineId,
            perpendicularLineId: nextInteraction.perpendicularLineId, snappedAngleDegrees: nextInteraction.snappedAngleDegrees,
            midpointLineId: nextInteraction.midpointLineId, lineBodyId: nextInteraction.lineBodyId },
          detectedSemanticInferences: [
            ...(nextInteraction.parallelLineId ? [{ relation: 'parallel', lineId: nextInteraction.parallelLineId }] : []),
            ...(nextInteraction.perpendicularLineId ? [{ relation: 'perpendicular', lineId: nextInteraction.perpendicularLineId }] : []),
          ],
          activeDirectionAuthorities: [
            ...(snapBeforeHvSuppression.channels.parallel ? [{ relation: 'parallel', lineId: snapBeforeHvSuppression.channels.parallel.entityId }] : []),
            ...(snapBeforeHvSuppression.channels.perpendicular ? [{ relation: 'perpendicular', lineId: snapBeforeHvSuppression.channels.perpendicular.entityId }] : []),
          ],
          acceptedSemanticTruth: { parallelLineId: nextInteraction.parallelLineId,
            perpendicularLineId: nextInteraction.perpendicularLineId },
          transientPresentationSelection: diagnosticPresentations.map(({ kind }) => kind),
          persistentSemanticSelection: semanticSelection,
          rejectedPersistentSemantics: semanticSelection.rejected,
        },
        hv: {
          automaticAxisKind, suppressionRan: suppressedDirectionRelations,
          channelsBeforeSuppression: snapBeforeHvSuppression.channels, channelsAfterSuppression: snap.channels,
          semanticIdsBeforeAxisFinalization: lineResolution.diagnostic?.directionalSemanticsBeforeAxisFinalization ?? null,
          finalAxisAngle: lineResolution.diagnostic?.finalAxisAngle ?? null,
          semanticIdsAfterFinalization: { parallelLineId: nextInteraction.parallelLineId, perpendicularLineId: nextInteraction.perpendicularLineId },
        },
        presentation: { parallel: diagnosticPresentations.some(({ kind }) => kind === 'parallel'),
          perpendicular: diagnosticPresentations.some(({ kind }) => kind === 'perpendicular'), kinds: diagnosticPresentations.map(({ kind }) => kind) },
        rawDirectionCandidates: { parallel: candidates.parallels.map(summarizeDirection), perpendicular: candidates.perpendiculars.map(summarizeDirection) },
        acquiredDirectionCandidate: snapBeforeHvSuppression.channels.acquiredDirectionCandidate,
        establishedDirectionAuthority: snapBeforeHvSuppression.channels.directionAuthority,
        establishedReferenceLineId: snapBeforeHvSuppression.channels.directionAuthority?.referenceLineId ?? null,
        establishedConstructionOrigin: snapBeforeHvSuppression.channels.directionAuthority?.constructionOrigin ?? null,
        establishedConstructionDirection: snapBeforeHvSuppression.channels.directionAuthority?.constructionDirection ?? null,
        establishedDirectionState: snapBeforeHvSuppression.channels.directionAuthority?.state ?? null,
        directionAuthorityReleaseReason: snapBeforeHvSuppression.channels.directionAuthorityReleaseReason,
        positionCandidates: { endpoint: nearest(candidates.endpoints), midpoint: nearest(candidates.midpoints), finiteLine: nearest(candidates.lines),
          pointReference: nearest(candidates.pointReferences), xAlignment: nearest(candidates.alignmentsX), yAlignment: nearest(candidates.alignmentsY) },
        selectedPositionAuthority: { type: snapBeforeHvSuppression.type, effectivePoint: snapBeforeHvSuppression.effectivePoint },
        finalGeometryCompatibleWithDirectionAuthority: lineResolution.diagnostic?.finalGeometryCompatibleWithDirectionAuthority ?? null,
        acceptedSemanticTruth: { parallelLineId: nextInteraction.parallelLineId, perpendicularLineId: nextInteraction.perpendicularLineId },
        transientPresentationSelection: diagnosticPresentations.map(({ kind }) => kind),
        persistentSemanticSelection: semanticSelection,
      });
    }
    setCadCursor(anchor ? { anchor, snap, xGuideReference, yGuideReference, sameAxisReference, lineReference, pointReferenceGuide } : null);
    const endpointPointId = snap.type === 'endpoint' ? snap.pointId : null;
    const position: DrawingPlacementResolution['position'] = ctrlHeld
      ? { kind: 'raw', point: rawPoint }
      : circlePoint
        ? { kind: 'endpoint', point: placementPoint, pointId: circlePoint.pointId, entityId: `point:${circlePoint.pointId}`, endpoint: 'start' }
      : circleCurve
        ? { kind: 'curve', point: circleCurve.point, entityId: circleCurve.curveId }
      : snap.type === 'endpoint' && endpointPointId
        ? { kind: 'endpoint', point: snap.effectivePoint, pointId: endpointPointId, entityId: snap.entityId, endpoint: snap.endpoint }
        : snap.type === 'midpoint'
          ? { kind: 'midpoint', point: placementPoint, entityId: snap.entityId }
        : snap.type === 'line'
          ? { kind: 'line-body', point: placementPoint, entityId: snap.entityId, segmentParameter: snap.segmentParameter }
          : snap.active || nextInteraction.snappedAngleDegrees !== null ? { kind: 'construction', point: placementPoint } : { kind: 'raw', point: rawPoint };
    return { rawPoint, effectivePoint: placementPoint, spatialSnap: snap, interaction: nextInteraction, position, ctrlActive: ctrlHeld };
  };
  activeToolRef.current = activeTool;
  resolvePlacementRef.current = resolvePlacement;

  const commitSegmentPlacement = (tool: 'line' | 'profile', point: DrawingPoint, reusedPointId: string | null,
    acceptedInteraction: LineSegmentInteractionState, acceptedLineBodyId = acceptedInteraction.lineBodyId,
    acceptedMidpointLineId = acceptedInteraction.midpointLineId) => {
    const pointId = reusedPointId ?? `point-${Date.now().toString(36)}-${++pointSequence.current}`;
    // The delayed click transaction must consume the inference accepted at the
    // click, not mutable hover state observed during the delay.
    const acceptedConstraintKind = automaticAxisConstraintKind(acceptedInteraction);
    const selectedSemantics = selectMinimalLineSemanticConstraints(acceptedInteraction);
    const acceptedPerpendicularLineId = acceptedConstraintKind ? null : selectedSemantics.perpendicularLineId;
    const acceptedParallelLineId = acceptedConstraintKind ? null : selectedSemantics.parallelLineId;
    const createId = () => `line-${Date.now().toString(36)}-${++entitySequence.current}`;
    const result = tool === 'profile'
      ? applyResolvedProfileClick(acceptedInteraction, point, createId, pointId, acceptedLineBodyId, acceptedMidpointLineId)
      : applyResolvedLineClick(acceptedInteraction, point, createId, pointId, acceptedLineBodyId, acceptedMidpointLineId);
    setSegmentInteraction(result.interaction);
    segmentInteractionRef.current = result.interaction;
    if (result.entity) {
      // Spatial hysteresis belongs to one segment; only the committed endpoint
      // geometry and its real SketchPoint topology enter the fresh continuation.
      setDrawingSnap(null);
      drawingSnapRef.current = null;
      transactDocument((current) => appendEntityToActiveSketch(current, result.entity!, undefined, acceptedConstraintKind,
        acceptedPerpendicularLineId, null, acceptedParallelLineId,
        acceptedInteraction.startLineId || acceptedLineBodyId
          ? { startLineId: acceptedInteraction.startLineId ?? undefined, endLineId: acceptedLineBodyId ?? undefined } : null,
        acceptedInteraction.startMidpointLineId || acceptedMidpointLineId
          ? { startLineId: acceptedInteraction.startMidpointLineId ?? undefined, endLineId: acceptedMidpointLineId ?? undefined } : null));
      if (tool === 'line') {
        setCadCursor(null);
        setToolLifecycle((current) => finishDrawingConstruction(current));
      }
    }
  };

  const resolveDimensionCandidate = (client: CoordinatePoint, target: 'any' | 'point' | 'line' = 'any'): DimensionPreselection | null => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix || !activeSketch) return null;
    const toClient = (point: DrawingPoint) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });
    const clientLines = resolvedLines.map((line) => ({ id: line.id, start: toClient(line.start), end: toClient(line.end) }));
    const origin = activeTool === 'dimension' ? toClient(DRAWING_ORIGIN) : undefined;
    const candidate = target === 'any'
      ? resolveDimensionPreselection(clientLines, client, origin)
      : resolveDimensionPreselectionForTarget(clientLines, client, target, origin);
    if (candidate) {
      if (candidate.kind !== 'point') return candidate;
      const line = activeSketch.entities[candidate.lineId];
      return line ? { ...candidate, pointId: pointIdForLineEndpoint(line, candidate.point) } : candidate;
    }
    if (target !== 'any') return null;
    const model = clientToModelPoint(client, matrix); if (!model) return null;
    const pixelsPerModel = Math.hypot(matrix.a, matrix.b);
    const curves = [...resolvedCircles.map((curve) => ({ entityId: curve.id, distancePx: Math.abs(Math.hypot(model.x - curve.center.x, model.y - curve.center.y) - curve.radius) * pixelsPerModel })), ...resolvedArcs.map((curve) => ({ entityId: curve.id, distancePx: distanceToArc(model, curve) * pixelsPerModel }))].sort((a, b) => a.distancePx - b.distancePx);
    return curves[0] && curves[0].distancePx <= 8 ? { kind: 'curve', ...curves[0] } : null;
  };

  const ctrlSnapOverride = useCadCtrlSnapOverride((held) => {
    if (lastPointerClientRef.current && (activeToolRef.current === 'profile' || activeToolRef.current === 'line' || activeToolRef.current === 'circle' || activeToolRef.current === 'arc')) {
      const placement = resolvePlacementRef.current(lastPointerClientRef.current, held);
      if (activeToolRef.current === 'circle' && placement) {
        setCircleInteraction((current) => updateCirclePreview(current, placement.position.point));
      }
      if (activeToolRef.current === 'arc' && placement) setArcInteraction((current) => { const next = updateArcPreview(current, placement.position.point); arcInteractionRef.current = next; return next; });
    }
  });
  const { isPanning, panHandlers } = useCadPanGesture({
    viewportRef: svgRef,
    onPanStart: () => { setCadCursor(null); setDrawingSnap(null); drawingSnapRef.current = null; },
    onPan: ({ dx, dy }) => {
      const matrix = svgRef.current?.getScreenCTM();
      if (!matrix) return;
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      if (scaleX === 0 || scaleY === 0) return;
      setViewBox((current) => ({ ...current, x: current.x - dx / scaleX, y: current.y - dy / scaleY }));
    },
  });

  const exitActiveTool = () => {
    if (boxSelectionRef.current) { endBoxSelection(); return; }
    if (geometryDrag) { cancelGeometryDrag(); return; }
    if (dimensionDrag) { setDimensionDrag(null); return; }
    if (editingDimensionId) { setEditingDimensionId(null); setDimensionEditError(null); return; }
    if (activeToolRef.current === 'select' && constraintsPanelOpen) {
      setConstraintsPanelOpen(false);
      setSelectedGeometry([]);
      return;
    }
    if (activeToolRef.current === 'select') return;
    cancelDrawingProfileCommit(pendingProfileClickRef, window);
    const empty = EMPTY_LINE_SEGMENT_INTERACTION;
    segmentInteractionRef.current = empty;
    setSegmentInteraction(empty);
    setCircleInteraction(EMPTY_CIRCLE_INTERACTION);
    setArcInteraction(EMPTY_ARC_INTERACTION); arcInteractionRef.current = EMPTY_ARC_INTERACTION;
    setDrawingSnap(null);
    drawingSnapRef.current = null;
    setCadCursor(null);
    setDimensionPreselection(null);
    setToolLifecycle(activateDrawingTool('select'));
    setDimensionTool({ phase: 'inactive' });
  };
  useCadEscapeToolExit(exitActiveTool);

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (panHandlers.onPointerDown(event)) return;
    if ((event.target as Element).closest('.drawing-geometric-constraint-marker')) return;
    const dimensionTarget = (event.target as Element).closest('.drawing-dimension-editor, .drawing-dimension-hit, .drawing-dimension-value-hit');
    const explicitDimensionValueTarget = (event.target as Element).closest('.drawing-dimension-editor, .drawing-dimension-value-hit');
    // In Select, let the model-space resolver arbitrate an annotation hit
    // against finite sketch geometry beneath it. The annotation's own handler
    // remains authoritative when there is no geometry candidate.
    if (dimensionTarget && (activeTool !== 'select' || explicitDimensionValueTarget)) return;
    if (event.button !== CAD_PRIMARY_BUTTON) return;
    if (activeTool === 'select') {
      const explicitPointId = (event.target as Element).closest<SVGCircleElement>('[data-sketch-point-id]')?.dataset.sketchPointId;
      const explicitLineId = (event.target as Element).closest<SVGLineElement>('[data-sketch-line-id]')?.dataset.sketchLineId;
      const explicitCircleId = (event.target as Element).closest<SVGCircleElement>('[data-sketch-circle-id]')?.dataset.sketchCircleId;
      const explicitArcCenterId = (event.target as Element).closest<SVGCircleElement>('[data-sketch-arc-center-id]')?.dataset.sketchArcCenterId;
      const explicitArcId = (event.target as Element).closest<SVGPathElement>('[data-sketch-arc-id]')?.dataset.sketchArcId;
      const hit = explicitPointId || explicitLineId ? null : resolveDimensionCandidate({ x: event.clientX, y: event.clientY });
      const matrix = svgRef.current?.getScreenCTM();
      const circleHit = !explicitPointId && !explicitLineId && matrix ? resolvedCircles.map((circle) => {
        const center = { x: matrix.a * circle.center.x + matrix.c * circle.center.y + matrix.e, y: matrix.b * circle.center.x + matrix.d * circle.center.y + matrix.f };
        const radiusPx = circle.radius * Math.hypot(matrix.a, matrix.b);
        return { id: circle.id, distance: Math.abs(Math.hypot(event.clientX - center.x, event.clientY - center.y) - radiusPx) };
      }).filter(({ distance }) => distance <= DRAWING_CURVE_HIT_TOLERANCE_PX).sort((a, b) => a.distance - b.distance)[0]?.id : undefined;
      const startModel = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      const arcHit = startModel && matrix ? resolvedArcs.map((arc) => ({ id: arc.id, distance: distanceToArc(startModel, arc) * Math.hypot(matrix.a, matrix.b) }))
        .filter(({ distance }) => distance <= DRAWING_CURVE_HIT_TOLERANCE_PX).sort((a, b) => a.distance - b.distance)[0]?.id : undefined;
      if (!hit && !explicitPointId && !explicitLineId && !explicitCircleId && !explicitArcCenterId && !explicitArcId && !circleHit && !arcHit) {
        if (!startModel) return;
        const session = { pointerId: event.pointerId, originClient: { x: event.clientX, y: event.clientY }, originModel: startModel,
          currentClient: { x: event.clientX, y: event.clientY }, currentModel: startModel, exceeded: false };
        boxSelectionRef.current = session;
        setBoxSelection(session);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (!startModel) return;
      if (shouldRouteCircleBodyPointer(explicitCircleId, explicitPointId, Boolean(hit), circleHit)) {
        const circleId = (explicitCircleId ?? circleHit)!;
        const route = routeDrawingGeometryPointerSelection(selectedGeometry, { kind: 'circle', circleId }, event.ctrlKey, constraintsPanelOpen);
        setSelectedGeometry(route.selection);
        setSelectedDimensionId(null); setSelectedGeometricConstraintId(null);
        const target = route.beginDrag ? createCircleRadiusDragTarget(documentRef.current, circleId, startModel) : null;
        if (target) {
          event.currentTarget.setPointerCapture(event.pointerId);
          const session: GeometryDragSession = { pointerId: event.pointerId, target, startClient: { x: event.clientX, y: event.clientY }, startModel, startDocument: documentRef.current, candidate: documentRef.current, exceeded: false };
          geometryDragRef.current = session; setGeometryDrag(session);
        }
        return;
      }
      if (shouldRouteArcBodyPointer(explicitArcCenterId, explicitArcId, explicitPointId, Boolean(hit), arcHit)) {
        const arcId = (explicitArcCenterId ?? explicitArcId ?? arcHit)!;
        const route = routeDrawingGeometryPointerSelection(selectedGeometry, { kind: 'arc', arcId }, event.ctrlKey, constraintsPanelOpen);
        setSelectedGeometry(route.selection);
        setSelectedDimensionId(null); setSelectedGeometricConstraintId(null);
        const target = route.beginDrag ? explicitArcCenterId
          ? createArcCenterDragTarget(documentRef.current, arcId)
          : createArcRadiusDragTarget(documentRef.current, arcId, startModel) : null;
        if (target) {
          event.currentTarget.setPointerCapture(event.pointerId);
          const session: GeometryDragSession = { pointerId: event.pointerId, target, startClient: { x: event.clientX, y: event.clientY }, startModel, startDocument: documentRef.current, candidate: documentRef.current, exceeded: false };
          geometryDragRef.current = session; setGeometryDrag(session);
        }
        return;
      }
      setDimensionDrag(null);
      const target: DrawingGeometryTarget | null = explicitPointId
        ? (() => {
          const selectedEntityIds = selectedGeometry.flatMap((reference) => reference.kind === 'arc' ? [reference.arcId]
            : reference.kind === 'line' ? [reference.lineId] : reference.kind === 'circle' ? [reference.circleId] : []);
          const arcId = resolveArcEndpointOwner(documentRef.current, explicitPointId, selectedEntityIds);
          return arcId ? createArcEndpointDragTarget(documentRef.current, arcId, explicitPointId) : { kind: 'point', pointId: explicitPointId };
        })()
        : explicitLineId ? { kind: 'line', lineId: explicitLineId }
        : hit?.kind === 'point'
        ? (() => { const pointId = pointIdFromHit(documentRef.current, hit.lineId, hit.point); return pointId ? { kind: 'point', pointId } : null; })()
        : hit?.kind === 'line' ? { kind: 'line', lineId: hit.lineId } : null;
      if (!target) return;
      const beginDrag = !event.ctrlKey && !constraintsPanelOpen;
      const selectionTarget: DrawingSelectionRef | null = target.kind === 'arc-endpoint'
        ? { kind: 'point', pointId: target.draggedPointId }
        : target.kind === 'point' || target.kind === 'line' ? target : null;
      if (!selectionTarget) return;
      setSelectedGeometry((current) => routeDrawingGeometryPointerSelection(current, selectionTarget, event.ctrlKey, constraintsPanelOpen).selection);
      setSelectedDimensionId(null); setSelectedGeometricConstraintId(null);
      if (beginDrag) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const session: GeometryDragSession = { pointerId: event.pointerId, target, startClient: { x: event.clientX, y: event.clientY }, startModel, startDocument: documentRef.current, candidate: documentRef.current, exceeded: false };
        geometryDragRef.current = session;
        setGeometryDrag(session);
      }
      return;
    }
    if (activeTool === 'dimension') {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!point || !activeSketch) return;
      if (dimensionTool.phase === 'placementPreview' || dimensionTool.phase === 'lineTargetSelected') {
        if (dimensionTool.phase === 'lineTargetSelected') {
          const secondCandidate = resolveDimensionCandidate({ x: event.clientX, y: event.clientY });
          if (secondCandidate) {
            const pointReference = preselectionReference(secondCandidate);
            if (pointReference.kind === 'entity' && pointReference.entityId !== dimensionTool.line.entityId) {
              const firstLine = resolveDimensionLineReference(activeSketch, dimensionTool.line), secondLine = resolveDimensionLineReference(activeSketch, pointReference);
              const relation = firstLine && secondLine ? createLinePairDimension(firstLine, secondLine, point, 'preview') : null;
              if (relation) { setDimensionTool({ phase: 'placementPreview', dimension: relation, cursor: point }); setDimensionPreselection(null); }
              return;
            }
            const pointValue = resolveDrawingPointReference(activeSketch, pointReference);
            const lineValue = resolveDimensionLineReference(activeSketch, dimensionTool.line);
            if (pointReference.kind !== 'entity' && pointValue && lineValue) {
              const pointToLine = createPointToLineDimension(pointReference, dimensionTool.line, pointValue, lineValue, 'line', point, 'preview');
              if (pointToLine) {
                setDimensionTool({ phase: 'placementPreview', dimension: pointToLine, cursor: point });
                setDimensionPreselection(null);
              }
            }
            return;
          }
        }
        const preview = dimensionTool.dimension;
        if (preview.kind === 'CIRCULAR_SIZE') {
          const committed = { ...preview, id: createDimensionId(), placement: { kind: 'radial' as const, anchor: point } };
          transactDocument((current) => appendDimension(current, committed));
          const nextLifecycle = finishDrawingConstruction(toolLifecycle); setToolLifecycle(nextLifecycle);
          setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' }); setDimensionPreselection(null); return;
        }
        if (preview.kind === 'LINE_TO_LINE_ANGLE') {
          const first = resolveDimensionLineReference(activeSketch, preview.references[0]), second = resolveDimensionLineReference(activeSketch, preview.references[1]);
          const refreshed = first && second ? createLineToLineAngleDimension(first, second, point, createDimensionId()) : null;
          if (!refreshed) return;
          transactDocument((current) => appendDimension(current, refreshed));
          const nextLifecycle = finishDrawingConstruction(toolLifecycle); setToolLifecycle(nextLifecycle);
          setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' }); setDimensionPreselection(null); return;
        }
        if (preview.kind === 'LINE_TO_LINE_DISTANCE') {
          const first = resolveDimensionLineReference(activeSketch, preview.references[0]), second = resolveDimensionLineReference(activeSketch, preview.references[1]);
          const refreshed = first && second ? createLinePairDimension(first, second, point, createDimensionId()) : null; if (!refreshed || refreshed.kind !== 'LINE_TO_LINE_DISTANCE') return;
          transactDocument((current) => appendDimension(current, refreshed)); const nextLifecycle = finishDrawingConstruction(toolLifecycle); setToolLifecycle(nextLifecycle); setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' }); setDimensionPreselection(null); return;
        }
        const offsetLine = preview.kind === 'POINT_TO_LINE_DISTANCE' ? resolveDimensionLineReference(activeSketch, preview.references[1]) : (() => { const a = resolveDrawingPointReference(activeSketch, preview.references[0]), b = resolveDrawingPointReference(activeSketch, preview.references[1]); return a && b ? { id: '', type: 'line' as const, startPointId: '', endPointId: '', start: a, end: b } : null; })();
        if (!offsetLine) return;
        const pointReference = preview.kind === 'POINT_TO_LINE_DISTANCE' ? resolveDrawingPointReference(activeSketch, preview.references[0]) : null;
        const offset = preview.kind === 'POINT_TO_LINE_DISTANCE' && pointReference
          ? pointToLineDimensionOffset(pointReference, offsetLine, point)
          : dimensionOffset(offsetLine, point, preview.kind);
        const committed = { ...preview, id: createDimensionId(), placement: { kind: 'linear' as const, offset } };
        transactDocument((current) => appendDimension(current, committed));
        const nextLifecycle = finishDrawingConstruction(toolLifecycle);
        setToolLifecycle(nextLifecycle);
        setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' });
        setDimensionPreselection(null);
        return;
      }
      const expectedTarget = dimensionTool.phase === 'waitingForSecondTarget'
        ? dimensionTool.first.kind === 'entity' ? 'point' : 'any'
        : 'any';
      const candidate = resolveDimensionCandidate({ x: event.clientX, y: event.clientY }, expectedTarget);
      if (candidate) {
        const reference = preselectionReference(candidate);
        if (dimensionTool.phase === 'waitingForSecondTarget') {
          const first = dimensionTool.first;
          if (JSON.stringify(first) === JSON.stringify(reference)) return;
          let preview = null;
          if (first.kind === 'entity' && reference.kind !== 'entity') {
            const p = resolveDrawingPointReference(activeSketch, reference), line = resolveDimensionLineReference(activeSketch, first);
            if (p && line) preview = createPointToLineDimension(reference, first, p, line, 'line', point, 'preview');
          } else if (first.kind !== 'entity' && reference.kind === 'entity') {
            const p = resolveDrawingPointReference(activeSketch, first), line = resolveDimensionLineReference(activeSketch, reference);
            if (p && line) preview = createPointToLineDimension(first, reference, p, line, 'point', point, 'preview');
          } else if (first.kind !== 'entity' && reference.kind !== 'entity') {
            const a = resolveDrawingPointReference(activeSketch, first), b = resolveDrawingPointReference(activeSketch, reference);
            if (a && b) preview = createPointToPointDimension([first, reference], a, b, choosePointDimensionKind(a, b, point, undefined, viewport.width / viewBox.width), point, 'preview');
          }
          if (preview) setDimensionTool({ phase: 'placementPreview', dimension: preview, cursor: point });
        } else if (reference.kind === 'entity') {
          const entity = (activeSketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[reference.entityId];
          if (entity?.type === 'circle' || entity?.type === 'arc') {
            const circular = createCircularSizeDimension(activeSketch, entity.id, point, 'preview');
            if (circular) { setDimensionTool({ phase: 'placementPreview', dimension: circular, cursor: point }); setDimensionPreselection(null); }
          } else {
            const resolved = entity?.type === 'line' ? resolveLine(activeSketch, entity) : null;
            if (resolved) setDimensionTool({ phase: 'lineTargetSelected', line: reference, dimension: createLineDimension(resolved, chooseLineDimensionKind(resolved, point, undefined, viewport.width / viewBox.width), point, 'preview'), cursor: point });
          }
        } else setDimensionTool({ phase: 'waitingForSecondTarget', first: reference });
      }
      return;
    }
    if (activeTool === 'profile') {
      if (event.detail > 1) return;
      // A subsequent primary click belongs to the continuation. Establish it
      // synchronously before resolving that click against Line state.
      flushDrawingProfileCommit(pendingProfileClickRef, window);
      // Resolve synchronously at acceptance time. The delayed commit owns this immutable point.
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride, 'click');
      if (!placement) return;
      const effectivePoint = placement.position.point;
      const endpointPointId = placement.position.kind === 'endpoint' ? placement.position.pointId : null;
      const lineBodyId = placement.position.kind === 'line-body' ? placement.position.entityId : null;
      scheduleDrawingProfileCommit(pendingProfileClickRef, window, () => {
        if (placement.position.kind === 'midpoint') commitSegmentPlacement('profile', effectivePoint, endpointPointId, placement.interaction,
          undefined, placement.position.entityId);
        else commitSegmentPlacement('profile', effectivePoint, endpointPointId, placement.interaction, lineBodyId);
      });
      return;
    }
    if (activeTool === 'line') {
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride, 'click');
      if (!placement) return;
      const endpointPointId = placement.position.kind === 'endpoint' ? placement.position.pointId : null;
      const lineBodyId = placement.position.kind === 'line-body' ? placement.position.entityId : null;
      commitSegmentPlacement('line', placement.position.point, endpointPointId, placement.interaction,
        placement.position.kind === 'midpoint' ? undefined : lineBodyId,
        placement.position.kind === 'midpoint' ? placement.position.entityId : undefined);
      return;
    }
    if (activeTool === 'circle') {
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride, 'click');
      if (!placement) return;
      const endpointPointId = placement.position.kind === 'endpoint' ? placement.position.pointId : null;
      const result = applyResolvedCircleClick(circleInteraction, placement.position.point,
        () => `circle-${Date.now().toString(36)}-${++entitySequence.current}`, endpointPointId,
        placement.position.kind === 'midpoint' ? placement.position.entityId : null,
        placement.position.kind === 'line-body' ? placement.position.entityId : null,
        placement.position.kind === 'curve' ? placement.position.entityId : null);
      setCircleInteraction(result.interaction);
      setSegmentInteraction(EMPTY_LINE_SEGMENT_INTERACTION);
      segmentInteractionRef.current = EMPTY_LINE_SEGMENT_INTERACTION;
      if (result.entity) {
        transactDocument((current) => appendCircleToActiveSketch(current, result.entity!, undefined,
          circleInteraction.midpointLineId, endpointPointId, circleInteraction.lineBodyId, circleInteraction.centerCurveId));
        setDrawingSnap(null); setCadCursor(null);
        setToolLifecycle((current) => finishDrawingConstruction(current));
      }
      return;
    }
    if (activeTool === 'arc') {
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride, 'click');
      if (!placement) return;
      const accepted = { point: placement.position.point,
        pointId: placement.position.kind === 'endpoint' ? placement.position.pointId : null,
        midpointLineId: placement.position.kind === 'midpoint' ? placement.position.entityId : null,
        lineBodyId: placement.position.kind === 'line-body' ? placement.position.entityId : null,
        curveId: placement.position.kind === 'curve' ? placement.position.entityId : null };
      if (!arcInteraction.start || !arcInteraction.end) {
        const next = acceptArcEndpoint(arcInteraction, accepted); setArcInteraction(next); arcInteractionRef.current = next;
      } else {
        const id = `arc-${Date.now().toString(36)}-${++entitySequence.current}`;
        const result = commitArcForm(arcInteraction, placement.position.point, id, arcFormCandidate?.pointId ?? null);
        setArcInteraction(result.interaction); arcInteractionRef.current = result.interaction;
        if (result.entity) {
          transactDocument((current) => appendArcToActiveSketch(current, result.entity!));
          setDrawingSnap(null); setCadCursor(null); setArcFormCandidate(null); arcFormCandidateRef.current = null;
          setToolLifecycle((current) => finishDrawingConstruction(current));
        }
      }
      return;
    }
  };

  const handleDrawingMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === CAD_PRIMARY_BUTTON) event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (panHandlers.onPointerMove(event)) return;
    if (boxSelectionRef.current?.pointerId === event.pointerId) {
      const session = boxSelectionRef.current, matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!point) return;
      const exceeded = session.exceeded || Math.hypot(event.clientX - session.originClient.x, event.clientY - session.originClient.y) >= DRAWING_DRAG_THRESHOLD_PX;
      const next = { ...session, currentClient: { x: event.clientX, y: event.clientY }, currentModel: point, exceeded };
      boxSelectionRef.current = next; setBoxSelection(next); return;
    }
    if (geometryDrag?.pointerId === event.pointerId) {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!point) return;
      const exceeded = geometryDrag.exceeded || Math.hypot(event.clientX - geometryDrag.startClient.x, event.clientY - geometryDrag.startClient.y) >= DRAWING_DRAG_THRESHOLD_PX;
      if (!exceeded) return;
      const candidate = solveDrawingDragCandidate(geometryDrag.startDocument, geometryDrag.target, { x: point.x - geometryDrag.startModel.x, y: point.y - geometryDrag.startModel.y }, geometryDrag.startModel);
      const next = { ...geometryDrag, exceeded, candidate: candidate ?? geometryDrag.candidate };
      geometryDragRef.current = next;
      setGeometryDrag(next);
      return;
    }
    if (dimensionDrag) {
      const matrix = svgRef.current?.getScreenCTM(), sketch = activeSketch;
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      const dimension = sketch?.dimensions[dimensionDrag.id];
      const placement = point && dimension && sketch ? resolveDimensionAnnotationPlacement(sketch, dimension, point) : null;
      if (placement) {
        const exceeded = dimensionDrag.exceeded || Math.hypot(event.clientX - dimensionDrag.startClient.x, event.clientY - dimensionDrag.startClient.y) >= 4;
        setDimensionDrag({ ...dimensionDrag, previewPlacement: placement, exceeded });
      }
      return;
    }
    if (activeTool === 'dimension' && (dimensionTool.phase === 'placementPreview' || dimensionTool.phase === 'lineTargetSelected')) {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (point && activeSketch) {
        const d = dimensionTool.dimension;
        if (d.kind === 'CIRCULAR_SIZE') {
          setDimensionTool({ ...dimensionTool, cursor: point, dimension: { ...d, placement: { kind: 'radial', anchor: point } } });
        } else if (d.kind === 'POINT_TO_LINE_DISTANCE') {
          const line = resolveDimensionLineReference(activeSketch, d.references[1]);
          const targetPoint = resolveDrawingPointReference(activeSketch, d.references[0]);
          if (line && targetPoint) setDimensionTool({ ...dimensionTool, cursor: point, dimension: { ...d, placement: { kind: 'linear', offset: pointToLineDimensionOffset(targetPoint, line, point) } } });
        } else if (d.kind === 'LINE_TO_LINE_ANGLE') {
          const first = resolveDimensionLineReference(activeSketch, d.references[0]), second = resolveDimensionLineReference(activeSketch, d.references[1]);
          const dimension = first && second ? createLineToLineAngleDimension(first, second, point, 'preview') : null;
          if (dimension) setDimensionTool({ ...dimensionTool, cursor: point, dimension });
        } else if (d.kind === 'LINE_TO_LINE_DISTANCE') {
          const first = resolveDimensionLineReference(activeSketch, d.references[0]), second = resolveDimensionLineReference(activeSketch, d.references[1]);
          if (first && second) setDimensionTool({ ...dimensionTool, cursor: point, dimension: { ...d, placement: { kind: 'linear', offset: lineToLineDimensionOffset(first, second, point) } } });
        } else {
          const a = resolveDrawingPointReference(activeSketch, d.references[0]), b = resolveDrawingPointReference(activeSketch, d.references[1]);
          if (a && b) {
            const kind = choosePointDimensionKind(a, b, point, d.kind, viewport.width / viewBox.width);
            const dimension = createPointToPointDimension(d.references, a, b, kind, point, 'preview');
            setDimensionTool({ ...dimensionTool, cursor: point, dimension });
          }
        }
      }
      setDimensionPreselection(dimensionTool.phase === 'lineTargetSelected'
        ? (() => { const candidate = resolveDimensionCandidate({ x: event.clientX, y: event.clientY }); return candidate?.kind === 'line' && candidate.lineId === dimensionTool.line.entityId ? null : candidate; })() : null);
      return;
    }
    if (activeTool === 'dimension') {
      const expectedTarget = dimensionTool.phase === 'waitingForSecondTarget'
        ? dimensionTool.first.kind === 'entity' ? 'point' : 'any'
        : 'any';
      setDimensionPreselection(resolveDimensionCandidate({ x: event.clientX, y: event.clientY }, expectedTarget));
      return;
    }
    if (isSegmentTool || activeTool === 'circle' || activeTool === 'arc') {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      const placement = resolvePlacement(lastPointerClientRef.current, event.ctrlKey || ctrlSnapOverride);
      if (activeTool === 'circle' && placement) {
        setCircleInteraction((current) => updateCirclePreview(current, placement.position.point));
        setSegmentInteraction(EMPTY_LINE_SEGMENT_INTERACTION); segmentInteractionRef.current = EMPTY_LINE_SEGMENT_INTERACTION;
      }
      if (activeTool === 'arc' && placement) setArcInteraction((current) => { const next = updateArcPreview(current, placement.position.point); arcInteractionRef.current = next; return next; });
      return;
    }
    if (activeTool === 'select') setGeometryPreselection(resolveDimensionCandidate({ x: event.clientX, y: event.clientY }));
  };

  useEffect(() => () => {
    cancelDrawingProfileCommit(pendingProfileClickRef, window);
    const session = boxSelectionRef.current, svg = svgRef.current;
    if (session && svg?.hasPointerCapture(session.pointerId)) svg.releasePointerCapture(session.pointerId);
    boxSelectionRef.current = null;
  }, []);

  const selectTool = (tool: DrawingActiveTool, activationMode: 'normal' | 'persistent' = 'normal') => {
    endBoxSelection();
    cancelDrawingProfileCommit(pendingProfileClickRef, window);
    setSegmentInteraction(EMPTY_LINE_SEGMENT_INTERACTION);
    setCircleInteraction(EMPTY_CIRCLE_INTERACTION);
    setArcInteraction(EMPTY_ARC_INTERACTION); arcInteractionRef.current = EMPTY_ARC_INTERACTION;
    segmentInteractionRef.current = EMPTY_LINE_SEGMENT_INTERACTION;
    setDrawingSnap(null);
    drawingSnapRef.current = null;
    setCadCursor(null);
    setToolLifecycle(activateDrawingTool(tool, activationMode));
    setDimensionTool(tool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' });
  };

  const activateToolFromPointer = (tool: DrawingActiveTool, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== CAD_PRIMARY_BUTTON) return;
    const resolution = resolveCadToolPointerActivation(
      tool,
      event.timeStamp,
      { x: event.clientX, y: event.clientY },
      previousToolActivationRef.current,
    );
    previousToolActivationRef.current = resolution.record;
    selectTool(tool, resolution.activationMode);
  };

  const activateToolFromKeyboard = (tool: DrawingActiveTool, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    previousToolActivationRef.current = null;
    selectTool(tool);
  };

  const clearCadCursor = () => { lastPointerClientRef.current = null; setCadCursor(null); setDrawingSnap(null); drawingSnapRef.current = null; setDimensionPreselection(null); if (!geometryDrag) setGeometryPreselection(null); };
  const clearSegmentCursor = clearCadCursor;

  const finishProfile = () => {
    cancelDrawingProfileCommit(pendingProfileClickRef, window);
    setSegmentInteraction(EMPTY_LINE_SEGMENT_INTERACTION);
    setDrawingSnap(null);
    drawingSnapRef.current = null;
    setCadCursor(null);
    segmentInteractionRef.current = EMPTY_LINE_SEGMENT_INTERACTION;
    setToolLifecycle((current) => finishDrawingConstruction(current));
  };

  const annotationGeometry = (dimension: DrawingDimension) => {
    if (!activeSketch) return null;
    if (dimension.kind === 'LINE_TO_LINE_ANGLE' || dimension.kind === 'CIRCULAR_SIZE' || dimension.placement.kind !== 'linear') return null;
    if (dimension.kind === 'LINE_TO_LINE_DISTANCE') {
      const a = resolveDimensionLineReference(activeSketch, dimension.references[0]), b = resolveDimensionLineReference(activeSketch, dimension.references[1]);
      return a && b ? deriveLineToLineAnnotationGeometry(a, b, dimension.placement.offset) : null;
    }
    if (dimension.kind === 'POINT_TO_LINE_DISTANCE') {
      const point = resolveDrawingPointReference(activeSketch, dimension.references[0]), line = resolveDimensionLineReference(activeSketch, dimension.references[1]);
      if (!point || !line) return null;
      return derivePointToLineAnnotationGeometry(point, line, dimension.placement.offset);
    }
    const a = resolveDrawingPointReference(activeSketch, dimension.references[0]), b = resolveDrawingPointReference(activeSketch, dimension.references[1]);
    if (!a || !b) return null;
    if (dimension.kind === 'HORIZONTAL_DISTANCE') return { a: { x: a.x, y: (a.y + b.y) / 2 + dimension.placement.offset }, b: { x: b.x, y: (a.y + b.y) / 2 + dimension.placement.offset }, sourceA: a, sourceB: b };
    if (dimension.kind === 'VERTICAL_DISTANCE') return { a: { x: (a.x + b.x) / 2 + dimension.placement.offset, y: a.y }, b: { x: (a.x + b.x) / 2 + dimension.placement.offset, y: b.y }, sourceA: a, sourceB: b };
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, ox = -dy / length * dimension.placement.offset, oy = dx / length * dimension.placement.offset;
    return { a: { x: a.x + ox, y: a.y + oy }, b: { x: b.x + ox, y: b.y + oy }, sourceA: a, sourceB: b };
  };
  const angleAnnotationGeometry = (dimension: DrawingDimension) => {
    if (!activeSketch || dimension.kind !== 'LINE_TO_LINE_ANGLE' || dimension.placement.kind !== 'angular') return null;
    const first = resolveDimensionLineReference(activeSketch, dimension.references[0]), second = resolveDimensionLineReference(activeSketch, dimension.references[1]);
    const basis = first && second ? createLineAngleBasis(first, second) : null, candidate = basis && candidateForSector(basis, dimension.angleSector);
    return basis && candidate ? deriveLineAngleAnnotation(basis, candidate, dimension.placement.anchor, 24 / (viewport.width / viewBox.width)) : null;
  };
  const previewDimension = dimensionTool.phase === 'placementPreview' || dimensionTool.phase === 'lineTargetSelected' ? dimensionTool.dimension : null;
  const displayedDimensions = activeSketch?.dimensionOrder.map((id) => {
    const dimension = activeSketch.dimensions[id];
    return dimensionDrag?.id === id ? { ...dimension, placement: dimensionDrag.previewPlacement } : dimension;
  }).filter(Boolean) ?? [];
  const editingDimension = displayedDimensions.find(({ id }) => id === editingDimensionId);
  const editingGeometry = editingDimension ? annotationGeometry(editingDimension) : null;
  const editingAngleGeometry = editingDimension?.kind === 'LINE_TO_LINE_ANGLE' ? angleAnnotationGeometry(editingDimension) : null;
  const editingMiddle = editingAngleGeometry?.label ?? (editingGeometry ? { x: (editingGeometry.a.x + editingGeometry.b.x) / 2, y: (editingGeometry.a.y + editingGeometry.b.y) / 2 } : null);
  const editorAnchor = editingMiddle && svgRef.current && overlaySvgRef.current
    ? modelToOverlayPoint(editingMiddle, svgRef.current.getScreenCTM()!, overlaySvgRef.current.getScreenCTM()!) : null;
  const editorWidth = dimensionEditorWidthPixels(dimensionDraft);

  const finishGeometryDrag = (event: PointerEvent<SVGSVGElement>) => {
    const session = geometryDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    geometryDragRef.current = null;
    setGeometryDrag(null);
    if (session.exceeded && session.candidate !== session.startDocument) transactDocument(() => session.candidate);
    // A meaningful drag owns only transient interaction emphasis. A click keeps
    // the existing persistent selection semantics for future selection tools.
    if (session.exceeded) setSelectedGeometry([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const finishBoxSelection = (event: PointerEvent<SVGSVGElement>) => {
    const session = boxSelectionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.exceeded) {
      const rect = normalizeDrawingSelectionRect(session.originModel, session.currentModel);
      const mode = drawingSelectionMode(session.originClient.x, session.currentClient.x);
      const currentDocument = documentRef.current, sketch = currentDocument.sketches[currentDocument.activeSketchId];
      const circles = sketch ? sketch.entityOrder.flatMap((id) => { const entity = (sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[id]; const circle = entity?.type === 'circle' ? resolveCircle(sketch, entity) : null; return circle ? [circle] : []; }) : [];
      const arcs = sketch ? sketch.entityOrder.flatMap((id) => { const entity = (sketch.entities as unknown as Record<string, import('./drawingTypes').DrawingEntity>)[id]; const arc = entity?.type === 'arc' ? resolveArc(sketch, entity) : null; return arc ? [arc] : []; }) : [];
      const qualifying = selectDrawingEntitiesInRect([...resolveActiveSketchLines(currentDocument), ...circles, ...arcs], rect, mode);
      setSelectedGeometry((current) => applyDrawingBoxSelection(current, qualifying, event.ctrlKey));
      if (!event.ctrlKey) { setSelectedDimensionId(null); setSelectedGeometricConstraintId(null); }
    } else if (!event.ctrlKey) {
      setSelectedGeometry([]); setSelectedDimensionId(null); setSelectedGeometricConstraintId(null);
    }
    endBoxSelection();
  };

  const finishDimensionDrag = () => {
    if (!dimensionDrag) return;
    if (dimensionDrag.exceeded) transactDocument((current) => moveDimensionPlacement(current, dimensionDrag.id, dimensionDrag.previewPlacement));
    setDimensionDrag(null);
  };

  const beginDimensionAnnotationDrag = (event: PointerEvent<SVGElement>, dimension: DrawingDimension) => {
    if (event.button !== CAD_PRIMARY_BUTTON || editingDimensionId || activeTool !== 'select') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedDimensionId(dimension.id);
    setDimensionDrag({ pointerId: event.pointerId, id: dimension.id, startClient: { x: event.clientX, y: event.clientY }, startPlacement: dimension.placement, previewPlacement: dimension.placement, exceeded: false });
  };

  const undo = () => {
    const result = undoDrawingDocument(historyRef.current, documentRef.current);
    if (!result.changed) return;
    historyRef.current = result.history;
    documentRef.current = result.document;
    setEditingDimensionId(null);
    setDimensionEditError(null);
    setSelectedDimensionId(null);
    setSelectedGeometry([]);
    setSelectedGeometricConstraintId(null);
    setDocument(result.document);
    setHistoryRevision((revision) => revision + 1);
  };

  const redo = () => {
    const result = redoDrawingDocument(historyRef.current, documentRef.current);
    if (!result.changed) return;
    historyRef.current = result.history;
    documentRef.current = result.document;
    setEditingDimensionId(null);
    setDimensionEditError(null);
    setSelectedDimensionId(null);
    setSelectedGeometry([]);
    setSelectedGeometricConstraintId(null);
    setDocument(result.document);
    setHistoryRevision((revision) => revision + 1);
  };

  useEffect(() => {
    onHistoryControllerChange?.({ canUndo: historyRef.current.undo.length > 0, canRedo: historyRef.current.redo.length > 0, onUndo: undo, onRedo: redo });
  }, [document, historyRevision, onHistoryControllerChange]);

  useEffect(() => () => onHistoryControllerChange?.(null), [onHistoryControllerChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { if (historyRef.current.undo.length > 0) { event.preventDefault(); undo(); } }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { if (historyRef.current.redo.length > 0) { event.preventDefault(); redo(); } }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && (hoveredGeometricConstraintId || selectedGeometricConstraintId)) {
        event.preventDefault();
        transactDocument((current) => deleteGeometricConstraint(current, hoveredGeometricConstraintId ?? selectedGeometricConstraintId!));
        setHoveredGeometricConstraintId(null);
        setSelectedGeometricConstraintId(null);
      }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDimensionId) { event.preventDefault(); transactDocument((current) => deleteDimension(current, selectedDimensionId)); setSelectedDimensionId(null); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGeometry.length === 1 && (selectedGeometry[0].kind === 'line' || selectedGeometry[0].kind === 'circle' || selectedGeometry[0].kind === 'arc')) {
        event.preventDefault();
        const selectedEntityId = selectedGeometry[0].kind === 'line' ? selectedGeometry[0].lineId : selectedGeometry[0].kind === 'circle' ? selectedGeometry[0].circleId : selectedGeometry[0].arcId;
        transactDocument((current) => selectedGeometry[0].kind === 'line' ? deleteEntityWithDependentDimensions(current, selectedEntityId) : ({ ...current, sketches: { ...current.sketches, [current.activeSketchId]: removeEntityAndOrphans(current.sketches[current.activeSketchId], selectedEntityId) } }));
        setSelectedGeometry([]);
      }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, hoveredGeometricConstraintId, selectedDimensionId, selectedGeometricConstraintId, selectedGeometry]);

  const pixelsPerMm = viewport.width / viewBox.width;
  const parallelMarkers = activeSketch ? deriveParallelMarkers(activeSketch, pixelsPerMm) : [];
  const rightAngleMarkers = activeSketch ? deriveRightAngleMarkers(activeSketch, pixelsPerMm) : [];
  const coincidentMarkers = activeSketch ? deriveCoincidentMarkers(activeSketch, pixelsPerMm) : [];
  const selectedCoincidentReferenceMarker = activeSketch ? deriveSelectedCoincidentReferenceMarker(activeSketch, selectedGeometricConstraintId, pixelsPerMm) : null;
  const labelInterval = getAxisLabelInterval(gridSpacing, pixelsPerMm);
  const xLabelValues = getVisibleAxisValues(viewBox.x, viewBox.x + viewBox.width, labelInterval);
  const yLabelValues = getVisibleAxisValues(viewBox.y, viewBox.y + viewBox.height, labelInterval);

  useLayoutEffect(() => {
    const drawingToClientTransform = svgRef.current?.getScreenCTM();
    const overlayToClientTransform = overlaySvgRef.current?.getScreenCTM();
    if (!drawingToClientTransform || !overlayToClientTransform) {
      setOverlayGeometry(null);
      return;
    }
    const toOverlay = (modelPoint: CoordinatePoint) => modelToOverlayPoint(modelPoint, drawingToClientTransform, overlayToClientTransform);
    const origin = toOverlay(DRAWING_ORIGIN);
    const xIndicatorAnchor = toOverlay({ x: viewBox.x + viewBox.width, y: DRAWING_ORIGIN.y });
    const yIndicatorAnchor = toOverlay({ x: DRAWING_ORIGIN.x, y: viewBox.y });
    const xLabels = xLabelValues.map((value) => ({ value, anchor: toOverlay({ x: value, y: DRAWING_ORIGIN.y }) })).filter((label): label is { value: number; anchor: CoordinatePoint } => label.anchor !== null);
    const yLabels = yLabelValues.map((value) => ({ value, anchor: toOverlay({ x: DRAWING_ORIGIN.x, y: value }) })).filter((label): label is { value: number; anchor: CoordinatePoint } => label.anchor !== null);
    setOverlayGeometry(origin && xIndicatorAnchor && yIndicatorAnchor ? { origin, xLabels, yLabels, xIndicatorAnchor, yIndicatorAnchor } : null);
  }, [viewBox, viewport.width, viewport.height, labelInterval]);
  // The accepted snap is the transient inference authority. Derive the overlay
  // in this render instead of racing a second, independently cleared state value.
  const drawingTransform = svgRef.current?.getScreenCTM();
  const overlayTransform = overlaySvgRef.current?.getScreenCTM();
  const inferencePresentations = (isSegmentTool || activeTool === 'circle' || activeTool === 'arc') && drawingSnap && drawingTransform && overlayTransform
    ? deriveDrawingInferencePresentations(drawingSnap, activeSketch, pixelsPerMm, drawingTransform, overlayTransform, segmentInteraction)
    : [];
  const entityDefiningPointIds = activeSketch ? deriveEntityDefiningPointIds(activeSketch) : new Set<string>();
  const selectedPointIds = new Set(selectedGeometry.flatMap((reference) => reference.kind === 'point' ? [reference.pointId] : []));
  const selectionBoxRect = boxSelection?.exceeded ? normalizeDrawingSelectionRect(boxSelection.originModel, boxSelection.currentModel) : null;
  const selectionBoxMode = boxSelection ? drawingSelectionMode(boxSelection.originClient.x, boxSelection.currentClient.x) : null;
  return (
    <section className="drawing-workspace workspace-shell" aria-label="2D Drawing workspace">
      <aside ref={toolSidebarRef} className="drawing-tool-sidebar" aria-label="Drawing tools" onPointerDownCapture={preventToolChromePointerSelection} onMouseDownCapture={preventToolChromeMouseSelection}>
        <button type="button" className={`cad-tool-button${activeTool === 'select' ? ' is-active' : ''}`} aria-pressed={activeTool === 'select'} onPointerDown={(event) => activateToolFromPointer('select', event)} onClick={(event) => activateToolFromKeyboard('select', event)}>Select</button>
        <button type="button" className={`cad-tool-button${activeTool === 'line' ? ' is-active' : ''}`} aria-pressed={activeTool === 'line'} onPointerDown={(event) => activateToolFromPointer('line', event)} onClick={(event) => activateToolFromKeyboard('line', event)}>Line</button>
        <button type="button" className={`cad-tool-button${activeTool === 'circle' ? ' is-active' : ''}`} aria-pressed={activeTool === 'circle'} onPointerDown={(event) => activateToolFromPointer('circle', event)} onClick={(event) => activateToolFromKeyboard('circle', event)}>Circle</button>
        <button type="button" className={`cad-tool-button${activeTool === 'arc' ? ' is-active' : ''}`} aria-pressed={activeTool === 'arc'} onPointerDown={(event) => activateToolFromPointer('arc', event)} onClick={(event) => activateToolFromKeyboard('arc', event)}>Arc</button>
        <button type="button" className={`cad-tool-button${activeTool === 'profile' ? ' is-active' : ''}`} aria-pressed={activeTool === 'profile'} onPointerDown={(event) => activateToolFromPointer('profile', event)} onClick={(event) => activateToolFromKeyboard('profile', event)}>Profile</button>
      </aside>
      <section className="canvas-card drawing-canvas-card workspace-canvas">
        <div ref={canvasFrameRef} className="canvas-frame">
          <div className="drawing-status" aria-live="polite">
            <strong>{activeSketch?.name ?? 'No active sketch'}</strong><span>Unit: {document.unit}</span><span>Grid: {gridSpacing} mm</span><span>Active Tool: {activeTool === 'line' ? 'Line' : activeTool === 'circle' ? 'Circle' : activeTool === 'arc' ? 'Arc' : activeTool === 'profile' ? 'Profile' : activeTool === 'dimension' ? 'Dimension' : 'Select'}</span>
          </div>
          <div className="canvas-zoom-controls" aria-label="Drawing canvas zoom controls">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setViewBox(initialDrawingViewBox)}>Fit</button>
          </div>
          {constraintsPanelOpen && <div ref={constraintsPanelRef} className="drawing-constraints-panel" role="dialog" aria-label="Constraints" style={{ left: constraintsPanelPosition?.x ?? 0, top: constraintsPanelPosition?.y ?? 58, visibility: constraintsPanelPosition ? 'visible' : 'hidden' }} onPointerDown={(event) => event.stopPropagation()}>
            <div className="drawing-constraints-header" onPointerDown={(event) => { if (event.button !== CAD_PRIMARY_BUTTON || (event.target as Element).closest('button')) return; const panel = constraintsPanelRef.current?.getBoundingClientRect(); if (!panel) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const grab = constraintsPanelGrabOffset({ x: event.clientX, y: event.clientY }, panel); constraintsPanelDragRef.current = { pointerId: event.pointerId, dx: grab.x, dy: grab.y }; }}
              onPointerMove={(event) => { const drag = constraintsPanelDragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const frame = canvasFrameRef.current?.getBoundingClientRect(); const panel = constraintsPanelRef.current?.getBoundingClientRect(); if (frame && panel) { const desired = constraintsPanelDragPosition({ x: event.clientX, y: event.clientY }, frame, { x: drag.dx, y: drag.dy }); setConstraintsPanelPosition(clampConstraintsPanelPosition(desired, frame, panel)); } }}
              onPointerUp={(event) => { if (constraintsPanelDragRef.current?.pointerId === event.pointerId) constraintsPanelDragRef.current = null; }}
              onPointerCancel={(event) => { if (constraintsPanelDragRef.current?.pointerId === event.pointerId) constraintsPanelDragRef.current = null; }}>
              <strong>Constraints</strong><button type="button" aria-label="Close Constraints" onPointerDown={(event) => event.stopPropagation()} onClick={() => setConstraintsPanelOpen(false)}>×</button>
            </div>
            <div className="drawing-constraints-grid">{getDrawingConstraintApplicability(selectedGeometry, document).map((item) => { const catalog = DRAWING_CONSTRAINT_CATALOG.find(({ kind }) => kind === item.kind)!; return <button key={item.kind} type="button" disabled={!item.enabled} title={item.disabledReason} onClick={() => transactDocument((current) => applyDrawingConstraint(current, item))}>{catalog.label}</button>; })}</div>
            <div className="drawing-constraints-actions"><button type="button" disabled={selectedGeometry.length === 0} onClick={finishConstraintSelection}>OK</button></div>
          </div>}
          <svg
            ref={svgRef}
            className={`design-svg cad-viewport-interaction drawing-svg${isPanning ? ' is-panning' : ''}${isDrawingGeometryAuthoringTool(activeTool) ? ' has-authoring-cursor' : ''}${activeTool === 'dimension' ? ` has-dimension-cursor is-${dimensionPreselection?.kind ?? 'normal'}-target` : ''}${activeTool === 'select' ? ` has-geometry-cursor is-${geometryPreselection?.kind ?? 'normal'}-target${geometryDrag ? ' is-geometry-dragging' : ''}` : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch?.name ?? 'Drawing'} coordinate drawing canvas`}
            onMouseDown={handleDrawingMouseDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => { if (boxSelectionRef.current) finishBoxSelection(event); else if (geometryDrag) finishGeometryDrag(event); else if (dimensionDrag) finishDimensionDrag(); else panHandlers.onPointerUp(event); }}
            onPointerCancel={(event) => { if (boxSelectionRef.current?.pointerId === event.pointerId) endBoxSelection(); else if (geometryDragRef.current?.pointerId === event.pointerId) cancelGeometryDrag(event.pointerId); else if (dimensionDrag) setDimensionDrag(null); else panHandlers.onPointerCancel(event); }}
            onLostPointerCapture={(event) => { if (boxSelectionRef.current?.pointerId === event.pointerId) endBoxSelection(false); else cancelGeometryDrag(event.pointerId); }}
            onContextMenu={panHandlers.onContextMenu}
            onPointerLeave={clearSegmentCursor}
            onDoubleClick={() => { if (activeTool === 'profile') finishProfile(); }}
          >
            <defs>
              {(['normal', 'hover', 'active'] as const).map((state) => <marker key={state} id={`dimension-arrow-${state}`} className={`drawing-dimension-arrow is-${state}`} markerWidth="7" markerHeight="7" viewBox="0 0 7 7" refX="7" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 7 3.5 L 0 0 L 0 7 Z" /></marker>)}
              <pattern id="drawing-grid" x="0" y="0" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse">
                <path className="drawing-grid-line drawing-grid-line-primary" d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`} />
              </pattern>
              {gridHierarchy.majorSpacing !== null && <pattern id="drawing-major-grid" x="0" y="0" width={gridHierarchy.majorSpacing} height={gridHierarchy.majorSpacing} patternUnits="userSpaceOnUse">
                <path className="drawing-grid-line drawing-grid-line-major" d={`M ${gridHierarchy.majorSpacing} 0 L 0 0 0 ${gridHierarchy.majorSpacing}`} />
              </pattern>}
            </defs>
            <rect className="drawing-grid-plane" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#drawing-grid)" />
            {gridHierarchy.majorSpacing !== null && <rect className="drawing-grid-plane drawing-major-grid-plane" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#drawing-major-grid)" />}
            <g className="drawing-coordinate-plane" aria-label="Drawing axes and origin">
              <line className="drawing-axis drawing-x-axis" aria-label="X axis" x1={viewBox.x} y1={DRAWING_ORIGIN.y} x2={viewBox.x + viewBox.width} y2={DRAWING_ORIGIN.y} />
              <line className="drawing-axis drawing-y-axis" aria-label="Y axis" x1={DRAWING_ORIGIN.x} y1={viewBox.y} x2={DRAWING_ORIGIN.x} y2={viewBox.y + viewBox.height} />
            </g>
            <g className="drawing-sketch-geometry" aria-label="Committed sketch geometry">
              {resolvedLines.map((entity) => (
                <line key={entity.id} data-sketch-line-id={entity.id} data-constraint-state={getGeometryConstraintVisualState(activeSketch, { kind: 'line', lineId: entity.id })} data-inference-target={segmentCursor?.lineReference?.targetLineId === entity.id ? segmentCursor.lineReference.relation : undefined} className={`drawing-geometry-entity drawing-interactive-hit ${geometryConstraintVisualClass(getGeometryConstraintVisualState(activeSketch, { kind: 'line', lineId: entity.id }))}${segmentCursor?.lineReference?.targetLineId === entity.id ? ' is-inference-target' : ''}${dimensionPreselection?.kind === 'line' && dimensionPreselection.lineId === entity.id ? ' is-dimension-preselected' : ''}${dimensionTool.phase === 'lineTargetSelected' && dimensionTool.line.entityId === entity.id ? ' is-dimension-preselected' : ''}${geometryPreselection?.kind === 'line' && geometryPreselection.lineId === entity.id ? ' is-geometry-preselected' : ''}${drawingGeometrySelectionClass(selectedGeometry, { kind: 'line', lineId: entity.id })}${geometryDrag?.target.kind === 'line' && geometryDrag.target.lineId === entity.id ? ' is-geometry-dragging' : ''}`} x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} />
              ))}
              {resolvedCircles.map((entity) => <circle key={entity.id} data-sketch-circle-id={entity.id}
                data-constraint-state={getGeometryConstraintVisualState(activeSketch, { kind: 'circle', circleId: entity.id })}
                className={`drawing-geometry-entity drawing-interactive-hit ${geometryConstraintVisualClass(getGeometryConstraintVisualState(activeSketch, { kind: 'circle', circleId: entity.id }))}${dimensionPreselection?.kind === 'curve' && dimensionPreselection.entityId === entity.id ? ' is-dimension-preselected' : ''}${drawingGeometrySelectionClass(selectedGeometry, { kind: 'circle', circleId: entity.id })}`}
                cx={entity.center.x} cy={entity.center.y} r={entity.radius} fill="none" vectorEffect="non-scaling-stroke" />)}
              {resolvedArcs.map((entity) => <path key={entity.id} data-sketch-arc-id={entity.id}
                data-constraint-state={getGeometryConstraintVisualState(activeSketch, { kind: 'arc', arcId: entity.id })}
                className={`drawing-geometry-entity drawing-interactive-hit ${geometryConstraintVisualClass(getGeometryConstraintVisualState(activeSketch, { kind: 'arc', arcId: entity.id }))}${dimensionPreselection?.kind === 'curve' && dimensionPreselection.entityId === entity.id ? ' is-dimension-preselected' : ''}${drawingGeometrySelectionClass(selectedGeometry, { kind: 'arc', arcId: entity.id })}${activeArcDragId === entity.id ? ' is-geometry-dragging' : ''}`}
                d={drawingArcPath(entity)} fill="none" vectorEffect="non-scaling-stroke" />)}
              {resolvedArcs.map((entity) => <circle key={`center:${entity.id}`} className="drawing-circular-center drawing-entity-defining-point"
                cx={entity.center.x} cy={entity.center.y} r={2.5 / pixelsPerMm} pointerEvents="none" aria-hidden="true" />)}
              {activeArcSupportDragId && resolvedArcs.flatMap((entity) => entity.id === activeArcSupportDragId
                ? [<circle key={`support:${entity.id}`} className="drawing-authoring-reference" cx={entity.center.x} cy={entity.center.y} r={entity.radius}
                  fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />] : [])}
              {activeSketch && [...entityDefiningPointIds].flatMap((pointId) => {
                const point = activeSketch.points[pointId];
                const overridden = selectedPointIds.has(pointId) || geometryPreselection?.kind === 'point' && geometryPreselection.pointId === pointId;
                return point && !overridden ? [<circle key={pointId} className="drawing-entity-defining-point"
                  data-entity-defining-point-id={pointId} cx={point.x} cy={point.y} r={2.5 / pixelsPerMm} />] : [];
              })}
              {activeTool === 'select' && resolvedArcs.map((entity) => <circle key={`center-hit:${entity.id}`}
                className="drawing-arc-center-hit drawing-interactive-hit" data-sketch-arc-center-id={entity.id}
                cx={entity.center.x} cy={entity.center.y} r={DRAWING_SKETCH_POINT_HIT_RADIUS_PX / pixelsPerMm} />)}
              {activeTool === 'select' && activeSketch && Object.values(activeSketch.points).map((point) => (
                <circle key={point.id} className="drawing-sketch-point-hit drawing-interactive-hit" data-sketch-point-id={point.id}
                  cx={point.x} cy={point.y} r={DRAWING_SKETCH_POINT_HIT_RADIUS_PX / pixelsPerMm}
                  onPointerEnter={() => setGeometryPreselection({ kind: 'point', lineId: '', point: 'start', pointId: point.id, clientPoint: point, distancePx: 0 })}
                  onPointerLeave={() => setGeometryPreselection((current) => current?.kind === 'point' && current.pointId === point.id ? null : current)} />
              ))}
              {activeSketch && selectedGeometry.flatMap((ref) => ref.kind === 'point' && activeSketch.points[ref.pointId]
                ? [<circle key={ref.pointId} className="drawing-geometry-point-selected" cx={activeSketch.points[ref.pointId].x} cy={activeSketch.points[ref.pointId].y} r={DRAWING_INTERACTION_POINT_RADIUS_PX / pixelsPerMm} />] : [])}
              {activeTool === 'select' && geometryPreselection?.kind === 'point' && activeSketch && (() => { const p = geometryPreselection.pointId ? activeSketch.points[geometryPreselection.pointId] : resolveDrawingPointReference(activeSketch, { kind: 'point', entityId: geometryPreselection.lineId, point: geometryPreselection.point }); const size = DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm; return p ? <rect className="drawing-geometry-point-preselection" x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} /> : null; })()}
              {activeTool === 'dimension' && dimensionPreselection?.kind === 'point' && activeSketch && (() => { const p = resolveDrawingPointReference(activeSketch, { kind: 'point', entityId: dimensionPreselection.lineId, point: dimensionPreselection.point }); return p ? <circle className="drawing-dimension-point-preselection" cx={p.x} cy={p.y} r={DRAWING_INTERACTION_POINT_RADIUS_PX / pixelsPerMm} /> : null; })()}
              {activeTool === 'dimension' && dimensionPreselection?.kind === 'origin' && <circle className="drawing-dimension-point-preselection drawing-origin-preselection" cx={0} cy={0} r={6 / pixelsPerMm} />}
              {dimensionTool.phase === 'waitingForSecondTarget' && activeSketch && (() => { const p = resolveDrawingPointReference(activeSketch, dimensionTool.first); return p ? <circle className="drawing-dimension-point-selected" cx={p.x} cy={p.y} r={6 / pixelsPerMm} /> : null; })()}
            </g>
            <g className="drawing-geometric-constraint-layer" aria-label="Drawing geometric constraints">
              {parallelMarkers.map((marker) => {
                const selected = marker.constraintId === selectedGeometricConstraintId;
                const hovered = marker.constraintId === hoveredGeometricConstraintId;
                const isParallel = marker.label === '∥';
                const isMidpoint = marker.label === 'MIDPOINT';
                const parallelStrokeHalfLength = GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX / 2 / pixelsPerMm;
                const parallelStrokeHalfGap = 2 / pixelsPerMm;
                const midpoint = isMidpoint ? deriveMidpointMarkerPresentation(marker, pixelsPerMm) : null;
                return <g key={marker.id} className={`drawing-geometric-constraint-marker${isParallel ? ' drawing-parallel-marker' : ''}${isMidpoint ? ' drawing-midpoint-marker' : ''}${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`} data-constraint-id={marker.constraintId} data-line-id={marker.lineId}
                  onPointerEnter={() => setHoveredGeometricConstraintId(marker.constraintId)}
                  onPointerLeave={() => setHoveredGeometricConstraintId((current) => current === marker.constraintId ? null : current)}
                  onPointerDown={(event) => { if (event.button !== CAD_PRIMARY_BUTTON || activeTool !== 'select') return; setSelectedGeometricConstraintId(marker.constraintId); setSelectedDimensionId(null); setSelectedGeometry([]); }}>
                  <circle className="drawing-geometric-constraint-marker-hit drawing-interactive-hit" cx={marker.x} cy={marker.y} r={9 / pixelsPerMm} />
                  {midpoint ? <>
                    <line className="drawing-midpoint-marker-shape" x1={midpoint.start.x} y1={midpoint.start.y} x2={midpoint.end.x} y2={midpoint.end.y} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <rect className="drawing-midpoint-marker-shape" x={midpoint.squareCenter.x - midpoint.squareSize / 2} y={midpoint.squareCenter.y - midpoint.squareSize / 2} width={midpoint.squareSize} height={midpoint.squareSize} fill="white" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  </> : isParallel ? <>
                    <line className="drawing-parallel-marker-stroke" x1={marker.x - parallelStrokeHalfGap} y1={marker.y - parallelStrokeHalfLength} x2={marker.x - parallelStrokeHalfGap} y2={marker.y + parallelStrokeHalfLength} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <line className="drawing-parallel-marker-stroke" x1={marker.x + parallelStrokeHalfGap} y1={marker.y - parallelStrokeHalfLength} x2={marker.x + parallelStrokeHalfGap} y2={marker.y + parallelStrokeHalfLength} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </> : <text x={marker.x} y={marker.y} textAnchor="middle" dominantBaseline="central" fill="currentColor" style={{ fontSize: GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX / pixelsPerMm }}>{marker.label}</text>}
                </g>;
              })}
              {rightAngleMarkers.map((marker) => {
                const selected = marker.constraintId === selectedGeometricConstraintId;
                const hovered = marker.constraintId === hoveredGeometricConstraintId;
                const path = `M ${marker.p1.x} ${marker.p1.y} L ${marker.p2.x} ${marker.p2.y} L ${marker.p3.x} ${marker.p3.y}`;
                return <g key={marker.id} className={`drawing-geometric-constraint-marker drawing-right-angle-marker${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`} data-constraint-id={marker.constraintId}
                  onPointerEnter={() => setHoveredGeometricConstraintId(marker.constraintId)}
                  onPointerLeave={() => setHoveredGeometricConstraintId((current) => current === marker.constraintId ? null : current)}
                  onPointerDown={(event) => { if (event.button !== CAD_PRIMARY_BUTTON || activeTool !== 'select') return; setSelectedGeometricConstraintId(marker.constraintId); setSelectedDimensionId(null); setSelectedGeometry([]); }}>
                  {[marker.supportExtensionA, marker.supportExtensionB].filter((extension) => extension !== undefined).map((extension, index) =>
                    <line key={index} className="drawing-perpendicular-support" x1={extension.start.x} y1={extension.start.y} x2={extension.end.x} y2={extension.end.y} />)}
                  <path className="drawing-right-angle-marker-hit drawing-interactive-hit" d={path} />
                  <path className="drawing-right-angle-marker-shape" d={path} fill="none" stroke="currentColor" />
                </g>;
              })}
              {coincidentMarkers.map((marker) => {
                const selected = marker.constraintId === selectedGeometricConstraintId;
                const hovered = marker.constraintId === hoveredGeometricConstraintId;
                const size = POINT_CONSTRAINT_MARKER_SIZE_PX / pixelsPerMm;
                return <g key={marker.id} className={`drawing-geometric-constraint-marker drawing-coincident-marker${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`} data-constraint-id={marker.constraintId}
                  onPointerEnter={() => setHoveredGeometricConstraintId(marker.constraintId)}
                  onPointerLeave={() => setHoveredGeometricConstraintId((current) => current === marker.constraintId ? null : current)}
                  onPointerDown={(event) => { if (event.button !== CAD_PRIMARY_BUTTON || activeTool !== 'select') return; setSelectedGeometricConstraintId(marker.constraintId); setSelectedDimensionId(null); setSelectedGeometry([]); }}>
                  <circle className="drawing-geometric-constraint-marker-hit drawing-interactive-hit" cx={marker.x} cy={marker.y} r={POINT_CONSTRAINT_MARKER_HIT_RADIUS_PX / pixelsPerMm} />
                  <rect className="drawing-coincident-marker-shape" x={marker.x - size / 2} y={marker.y - size / 2} width={size} height={size} />
                </g>;
              })}
              {selectedCoincidentReferenceMarker && (() => { const size = POINT_CONSTRAINT_MARKER_SIZE_PX / pixelsPerMm; return <rect className="drawing-coincident-reference-marker drawing-coincident-marker-shape" data-constraint-reference-id={selectedCoincidentReferenceMarker.constraintId} x={selectedCoincidentReferenceMarker.x - size / 2} y={selectedCoincidentReferenceMarker.y - size / 2} width={size} height={size} />; })()}
            </g>
            <g className="drawing-dimension-layer" aria-label="Drawing dimensions">
              {[...displayedDimensions, ...(previewDimension ? [previewDimension] : [])].map((dimension) => {
                if (dimension.kind === 'CIRCULAR_SIZE' && dimension.placement.kind === 'radial') {
                  const resolved = activeSketch ? resolveCircularSize(activeSketch, dimension.references[0].entityId) : null;
                  const measurement = activeSketch ? displayedDimensionMeasurement(activeSketch, dimension) : null;
                  if (!resolved || measurement === null) return null;
                  const anchor = dimension.placement.anchor, endpoints = circularDimensionEndpoints(resolved, anchor);
                  const start = endpoints.start, attachment = endpoints.end, label = formatCircularDimension(measurement, dimension.mode, dimension.role);
                  const selected = dimension.id === selectedDimensionId, editing = dimension.id === editingDimensionId;
                  const arrowState = selected || editing || dimensionDrag?.id === dimension.id ? 'active' : dimension.id === hoveredDimensionId ? 'hover' : 'normal';
                  const beginDimensionEdit = () => { setSelectedDimensionId(dimension.id); if (dimension.role === 'reference') return; setEditingDimensionId(dimension.id); setDimensionDraft(formatDimensionEditValue(dimension.value)); setDimensionEditError(null); };
                  const valueHitWidth = (label.length * 6 + 12) / pixelsPerMm;
                  return <g key={dimension.id} className={`drawing-dimension is-${dimension.role} is-circular${selected ? ' is-selected' : ''}${dimension.id === hoveredDimensionId ? ' is-hovered' : ''}${dimension.id === 'preview' ? ' is-preview' : ''}`}>
                    <line className="drawing-dimension-line" markerStart={`url(#dimension-arrow-${arrowState})`} markerEnd={`url(#dimension-arrow-${arrowState})`} x1={start.x} y1={start.y} x2={attachment.x} y2={attachment.y} />
                    <line className="drawing-dimension-line drawing-dimension-leader" x1={attachment.x} y1={attachment.y} x2={anchor.x} y2={anchor.y} />
                    <text className="drawing-dimension-value" x={anchor.x} y={anchor.y - 4 / pixelsPerMm} textAnchor="middle" style={{ fontSize: dimensionScreenPixelsToModelUnits(DIMENSION_TEXT_SIZE_PX, pixelsPerMm) }}>{label}</text>
                    {dimension.id !== 'preview' && <line className="drawing-dimension-hit drawing-interactive-hit" x1={start.x} y1={start.y} x2={anchor.x} y2={anchor.y} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} />}
                    {dimension.id !== 'preview' && <rect className="drawing-dimension-value-hit drawing-interactive-hit" x={anchor.x - valueHitWidth / 2} y={anchor.y - 16 / pixelsPerMm} width={valueHitWidth} height={18 / pixelsPerMm} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} onDoubleClick={beginDimensionEdit} />}
                  </g>;
                }
                if (dimension.kind === 'LINE_TO_LINE_ANGLE') {
                  const angleGeometry = angleAnnotationGeometry(dimension); if (!angleGeometry) return null;
                  const measurement = activeSketch ? displayedDimensionMeasurement(activeSketch, dimension) : null; if (measurement === null) return null;
                  const path = `M ${angleGeometry.start.x} ${angleGeometry.start.y} A ${angleGeometry.radius} ${angleGeometry.radius} 0 ${angleGeometry.largeArc} ${angleGeometry.sweep} ${angleGeometry.end.x} ${angleGeometry.end.y}`;
                  const selected = dimension.id === selectedDimensionId, hovered = dimension.id === hoveredDimensionId;
                  const editing = dimension.id === editingDimensionId;
                  const arrowState = selected || editing ? 'active' : hovered ? 'hover' : 'normal';
                  const arrowMarker = `url(#dimension-arrow-${arrowState})`;
                  const beginDimensionEdit = () => { setSelectedDimensionId(dimension.id); if (dimension.role === 'reference') return; setEditingDimensionId(dimension.id); setDimensionDraft(formatDimensionEditValue(dimension.value)); setDimensionEditError(null); };
                  const label = formatAngleDimension(measurement, dimension.role);
                  const valueHitWidth = (label.length * 6 + 12) / pixelsPerMm;
                  return <g key={dimension.id} className={`drawing-dimension is-${dimension.role} is-angle${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}${dimensionDrag?.id === dimension.id ? ' is-dragging' : ''}${editing ? ' is-editing' : ''}${dimension.id === 'preview' ? ' is-preview' : ''}`}>
                    {angleGeometry.supportExtensions.map((extension) => <line key={extension.lineId} className="drawing-dimension-witness drawing-dimension-lineage" x1={extension.start.x} y1={extension.start.y} x2={extension.end.x} y2={extension.end.y} />)}
                    <path className="drawing-dimension-line drawing-dimension-angle-arc" d={path} fill="none" markerStart={arrowMarker} markerEnd={arrowMarker} />
                    <text className="drawing-dimension-value" x={angleGeometry.label.x} y={angleGeometry.label.y} textAnchor="middle" style={{ fontSize: dimensionScreenPixelsToModelUnits(DIMENSION_TEXT_SIZE_PX, pixelsPerMm) }}>{label}</text>
                    {dimension.id !== 'preview' && <path className="drawing-dimension-hit drawing-interactive-hit" d={path} fill="none" onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} />}
                    {dimension.id !== 'preview' && <rect className="drawing-dimension-value-hit drawing-interactive-hit" x={angleGeometry.label.x - valueHitWidth / 2} y={angleGeometry.label.y - 16 / pixelsPerMm} width={valueHitWidth} height={18 / pixelsPerMm} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} onDoubleClick={beginDimensionEdit} />}
                    {editing && dimensionEditError && <text className="drawing-dimension-error" x={angleGeometry.label.x} y={angleGeometry.label.y + 24 / pixelsPerMm} textAnchor="middle">{dimensionEditError}</text>}
                  </g>;
                }
                const geometry = annotationGeometry(dimension); if (!geometry) return null;
                const measurement = activeSketch ? displayedDimensionMeasurement(activeSketch, dimension) : null;
                if (measurement === null) return null;
                const middle = { x: (geometry.a.x + geometry.b.x) / 2, y: (geometry.a.y + geometry.b.y) / 2 };
                const extension = (source: DrawingPoint, target: DrawingPoint) => {
                  const dx = target.x - source.x, dy = target.y - source.y, length = Math.hypot(dx, dy) || 1;
                  const ux = dx / length, uy = dy / length;
                  return { start: { x: source.x + ux * 3 / pixelsPerMm, y: source.y + uy * 3 / pixelsPerMm }, end: { x: target.x + ux * 3 / pixelsPerMm, y: target.y + uy * 3 / pixelsPerMm } };
                };
                const extensionA = extension(geometry.sourceA, geometry.a), extensionB = extension(geometry.sourceB, geometry.b);
                // The line-side Point-to-Line witness must visibly originate at
                // the exact derived projection Q. Other witnesses retain their
                // established screen-space gap at the referenced geometry.
                if (dimension.kind === 'POINT_TO_LINE_DISTANCE') extensionA.start = geometry.sourceA;
                const rawAngle = dimension.kind === 'HORIZONTAL_DISTANCE' ? 0 : dimension.kind === 'VERTICAL_DISTANCE' ? -90 : Math.atan2(geometry.b.y - geometry.a.y, geometry.b.x - geometry.a.x) * 180 / Math.PI;
                const textAngle = rawAngle > 90 || rawAngle < -90 ? rawAngle + 180 : rawAngle;
                const label = formatDimensionValue(measurement, dimension.role);
                const valueHitWidth = (label.length * 6 + 12) / pixelsPerMm;
                const beginDimensionEdit = () => {
                  setSelectedDimensionId(dimension.id);
                  if (dimension.role === 'reference') return;
                  setEditingDimensionId(dimension.id);
                  setDimensionDraft(formatDimensionEditValue(dimension.value));
                  setDimensionEditError(null);
                };
                const arrowState = dimension.id === selectedDimensionId || dimension.id === editingDimensionId || dimensionDrag?.id === dimension.id ? 'active' : dimension.id === hoveredDimensionId ? 'hover' : 'normal';
                const arrowMarker = `url(#dimension-arrow-${arrowState})`;
                return <g key={dimension.id} className={`drawing-dimension is-${dimension.role}${dimension.id === selectedDimensionId ? ' is-selected' : ''}${dimension.id === hoveredDimensionId ? ' is-hovered' : ''}${dimensionDrag?.id === dimension.id ? ' is-dragging' : ''}${editingDimensionId === dimension.id ? ' is-editing' : ''}${dimension.id === 'preview' ? ' is-preview' : ''}`}>
                  {geometry.lineExtension && <line className="drawing-dimension-witness drawing-dimension-lineage" x1={geometry.lineExtension.start.x} y1={geometry.lineExtension.start.y} x2={geometry.lineExtension.end.x} y2={geometry.lineExtension.end.y} />}
                  <line className="drawing-dimension-witness" x1={extensionA.start.x} y1={extensionA.start.y} x2={extensionA.end.x} y2={extensionA.end.y} /><line className="drawing-dimension-witness" x1={extensionB.start.x} y1={extensionB.start.y} x2={extensionB.end.x} y2={extensionB.end.y} />
                  <line className="drawing-dimension-line" markerStart={arrowMarker} markerEnd={arrowMarker} x1={geometry.a.x} y1={geometry.a.y} x2={geometry.b.x} y2={geometry.b.y} />
                  <text className="drawing-dimension-value" x={middle.x} y={middle.y - 4 / pixelsPerMm} textAnchor="middle" style={{ fontSize: dimensionScreenPixelsToModelUnits(DIMENSION_TEXT_SIZE_PX, pixelsPerMm) }} transform={`rotate(${textAngle} ${middle.x} ${middle.y})`}>{label}</text>
                  {dimension.id !== 'preview' && <line className="drawing-dimension-hit drawing-interactive-hit" x1={geometry.a.x} y1={geometry.a.y} x2={geometry.b.x} y2={geometry.b.y} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} />}
                  {dimension.id !== 'preview' && <rect className="drawing-dimension-value-hit drawing-interactive-hit" x={middle.x - valueHitWidth / 2} y={middle.y - 16 / pixelsPerMm} width={valueHitWidth} height={18 / pixelsPerMm} transform={`rotate(${textAngle} ${middle.x} ${middle.y})`} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => beginDimensionAnnotationDrag(event, dimension)} onDoubleClick={beginDimensionEdit} />}
                  {editingDimensionId === dimension.id && dimensionEditError && <text className="drawing-dimension-error" x={middle.x} y={middle.y + 24 / pixelsPerMm} textAnchor="middle">{dimensionEditError}</text>}
                </g>;
              })}
            </g>
            {isSegmentTool && segmentInteraction.start && segmentInteraction.effectivePreviewPoint && (
              <line className={`drawing-authoring-preview${hasAngularPresentationTruth(segmentInteraction) ? ' is-angular-snapped' : ''}`} x1={segmentInteraction.start.x} y1={segmentInteraction.start.y} x2={segmentInteraction.effectivePreviewPoint.x} y2={segmentInteraction.effectivePreviewPoint.y} />
            )}
            {activeTool === 'circle' && circleInteraction.center && circlePreviewRadius(circleInteraction) !== null && <circle
              className="drawing-authoring-preview" cx={circleInteraction.center.x} cy={circleInteraction.center.y}
              r={circlePreviewRadius(circleInteraction)!} fill="none" vectorEffect="non-scaling-stroke" />}
            {activeTool === 'arc' && (() => { const arc = resolveArcPreview(arcInteraction); return arc ? <>
              <circle className="drawing-authoring-reference" cx={arc.center.x} cy={arc.center.y} r={arc.radius} fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <path className="drawing-authoring-preview" d={drawingArcPath(arc)} fill="none" vectorEffect="non-scaling-stroke" />
            </> : null; })()}
            {activeTool === 'arc' && (() => { const reference = resolveArcEndpointReference(arcInteraction); return reference ? <>
              <line className="drawing-authoring-reference" x1={reference.start.x} y1={reference.start.y} x2={reference.end.x} y2={reference.end.y} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <circle className="drawing-entity-defining-point" cx={reference.start.x} cy={reference.start.y} r={2.5 / pixelsPerMm} pointerEvents="none" />
            </> : null; })()}
            {activeTool === 'circle' && circlePointCandidate && <circle className="drawing-entity-defining-point"
              cx={circlePointCandidate.point.x} cy={circlePointCandidate.point.y} r={DRAWING_INTERACTION_POINT_RADIUS_PX / pixelsPerMm} />}
            {activeTool === 'circle' && circleCurveCandidate && <rect className="drawing-geometry-point-preselection"
              x={circleCurveCandidate.point.x - DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm / 2}
              y={circleCurveCandidate.point.y - DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm / 2}
              width={DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm} height={DRAWING_POINT_HOVER_MARKER_SIZE_PX / pixelsPerMm} />}
            {selectionBoxRect && selectionBoxMode && <rect className={`drawing-selection-box is-${selectionBoxMode}`}
              data-selection-mode={selectionBoxMode} x={selectionBoxRect.minX} y={selectionBoxRect.minY}
              width={selectionBoxRect.maxX - selectionBoxRect.minX} height={selectionBoxRect.maxY - selectionBoxRect.minY} />}
          </svg>
          <svg ref={overlaySvgRef} className="drawing-label-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="Model coordinate scale">
            {editingDimension && editorAnchor && <foreignObject className="drawing-dimension-editor-frame" x={editorAnchor.x - editorWidth / 2} y={editorAnchor.y - DIMENSION_EDITOR_HEIGHT_PX + 2} width={editorWidth} height={DIMENSION_EDITOR_HEIGHT_PX}><input ref={dimensionEditorInputRef} className="drawing-dimension-editor" value={dimensionDraft} aria-label={editingDimension.kind === 'LINE_TO_LINE_ANGLE' ? 'Dimension value in degrees' : 'Dimension value in millimetres'} onChange={(event) => { setDimensionDraft(event.target.value); setDimensionEditError(null); }} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingDimensionId(null); setDimensionEditError(null); } if (event.key === 'Enter') { const parsed = parseLinearDimension(dimensionDraft); if (parsed === null) { setDimensionEditError(editingDimension.kind === 'LINE_TO_LINE_ANGLE' ? 'Angle must be greater than 0° and less than 180°.' : 'Dimension must be 0 mm or greater.'); return; } const result = solveDrawingDimensionEdit({ document, dimensionId: editingDimension.id, targetValue: parsed }); if (!result.ok) { setDimensionEditError(result.message); return; } transactDocument(() => result.document); setEditingDimensionId(null); setDimensionEditError(null); } }} /></foreignObject>}
            {overlayGeometry && overlayGeometry.origin.y >= 0 && overlayGeometry.origin.y <= viewport.height && overlayGeometry.xLabels.filter(({ value }) => value !== 0).map((label) => (
              <text className="drawing-coordinate-label drawing-x-coordinate" data-label-side="below" key={`x-${label.value}`} x={label.anchor.x} y={label.anchor.y + 15} textAnchor="middle">{label.value}</text>
            ))}
            {overlayGeometry && overlayGeometry.origin.x >= 0 && overlayGeometry.origin.x <= viewport.width && overlayGeometry.yLabels.filter(({ value }) => value !== 0).map((label) => (
              <text className="drawing-coordinate-label drawing-y-coordinate" data-label-side="right" key={`y-${label.value}`} x={label.anchor.x + 6} y={label.anchor.y + 4}>{label.value}</text>
            ))}
            {overlayGeometry && overlayGeometry.origin.x >= 0 && overlayGeometry.origin.x <= viewport.width && overlayGeometry.origin.y >= 0 && overlayGeometry.origin.y <= viewport.height && <>
              <circle className="drawing-origin-screen" cx={overlayGeometry.origin.x} cy={overlayGeometry.origin.y} r="3.5" />
              <text className="drawing-origin-label" x={overlayGeometry.origin.x + 7} y={overlayGeometry.origin.y - 7}>0</text>
            </>}
            {activeTool === 'dimension' && dimensionPreselection?.kind === 'origin' && overlayGeometry && <text className="drawing-origin-preselection-label" x={overlayGeometry.origin.x + 10} y={overlayGeometry.origin.y - 10}>Origin · X0 Y0</text>}
            {overlayGeometry && overlayGeometry.origin.y >= 0 && overlayGeometry.origin.y <= viewport.height && <text className="drawing-axis-letter drawing-x-indicator" x={overlayGeometry.xIndicatorAnchor.x - 15} y={overlayGeometry.xIndicatorAnchor.y - 7}>X</text>}
            {overlayGeometry && overlayGeometry.origin.x >= 0 && overlayGeometry.origin.x <= viewport.width && <text className="drawing-axis-letter drawing-y-indicator" x={overlayGeometry.yIndicatorAnchor.x + 7} y={overlayGeometry.yIndicatorAnchor.y + 15}>Y</text>}
            {(isSegmentTool || activeTool === 'circle' || activeTool === 'arc') && <DrawingInferenceOverlay presentations={inferencePresentations} />}
            {(isSegmentTool || activeTool === 'circle' || activeTool === 'arc') && segmentCursor && (
              <g className="drawing-alignment-presentation" aria-hidden="true">
                {segmentCursor.pointReferenceGuide && <line className="drawing-point-reference-guide"
                  data-source-point-id={segmentCursor.snap.type === 'point-reference' ? segmentCursor.snap.sourcePointId : undefined}
                  data-incident-line-id={segmentCursor.snap.type === 'point-reference' ? segmentCursor.snap.incidentLineId : undefined}
                  x1={segmentCursor.pointReferenceGuide.start.x} y1={segmentCursor.pointReferenceGuide.start.y}
                  x2={segmentCursor.pointReferenceGuide.end.x} y2={segmentCursor.pointReferenceGuide.end.y} />}
                {segmentCursor.xGuideReference && <line className="drawing-alignment-guide" data-axis="x" x1={segmentCursor.xGuideReference.x} y1={segmentCursor.xGuideReference.y} x2={segmentCursor.anchor.x} y2={segmentCursor.anchor.y} />}
                {segmentCursor.yGuideReference && <line className="drawing-alignment-guide" data-axis="y" x1={segmentCursor.yGuideReference.x} y1={segmentCursor.yGuideReference.y} x2={segmentCursor.anchor.x} y2={segmentCursor.anchor.y} />}
                {segmentCursor.sameAxisReference && <circle className="drawing-same-axis-reference-highlight" cx={segmentCursor.sameAxisReference.x} cy={segmentCursor.sameAxisReference.y} r="7" />}
              <g className="drawing-segment-cursor drawing-cad-cursor" data-inference={segmentCursor.snap.type} transform={`translate(${segmentCursor.anchor.x} ${segmentCursor.anchor.y})`} aria-hidden="true">
                <line className="drawing-segment-cursor-arm" data-arm="left" x1="-22" y1="0" x2="-7" y2="0" />
                <line className="drawing-segment-cursor-arm" data-arm="right" x1="7" y1="0" x2="22" y2="0" />
                <line className="drawing-segment-cursor-arm" data-arm="top" x1="0" y1="-22" x2="0" y2="-7" />
                <line className="drawing-segment-cursor-arm" data-arm="bottom" x1="0" y1="7" x2="0" y2="22" />
                {segmentCursor.snap.type === 'none' && <circle className="drawing-segment-cursor-dot" cx="0" cy="0" r="2.5" />}
                {segmentCursor.snap.type === 'endpoint' && <rect className="drawing-segment-cursor-endpoint" x={-DRAWING_POINT_HOVER_MARKER_SIZE_PX / 2} y={-DRAWING_POINT_HOVER_MARKER_SIZE_PX / 2} width={DRAWING_POINT_HOVER_MARKER_SIZE_PX} height={DRAWING_POINT_HOVER_MARKER_SIZE_PX} />}
                {segmentCursor.snap.type === 'line' && <rect className="drawing-segment-cursor-line" x={-DRAWING_LINE_HOVER_MARKER_SIZE_PX / 2} y={-DRAWING_LINE_HOVER_MARKER_SIZE_PX / 2} width={DRAWING_LINE_HOVER_MARKER_SIZE_PX} height={DRAWING_LINE_HOVER_MARKER_SIZE_PX} />}
                {segmentCursor.snap.type === 'alignment' && <rect className="drawing-segment-cursor-alignment" x="-5" y="-5" width="10" height="10" />}
                {segmentCursor.lineReference?.relation === 'parallel' && <path className="drawing-segment-cursor-parallel" d="M -6 -3 L 6 -3 M -6 3 L 6 3" />}
              </g>
              </g>
            )}
          </svg>
        </div>
      </section>
      <aside className="workflow-history-panel drawing-history panel" aria-label="Drawing history">
        <div className="workflow-history-items"><span className="workflow-history-label">History</span><p className="workflow-history-empty muted">Dimension create/delete supports Ctrl+Z / Ctrl+Y.</p></div>
      </aside>
    </section>
  );
}
