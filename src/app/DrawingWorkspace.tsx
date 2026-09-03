import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from 'react';
import type { DrawingDimension, DrawingDocumentV2, DrawingPoint } from './drawingTypes';
import { appendEntityToActiveSketch, applyResolvedLineClick, cancelLineInteraction, EMPTY_LINE_INTERACTION, resolveLineEffectivePoint, type LineToolInteraction } from './drawingLineTool';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisValues, zoomViewBoxAtPoint } from './drawingGrid';
import { clientToModelPoint, modelToOverlayPoint, type CoordinatePoint } from './drawingTransform';
import { collectDrawingInferenceCandidates } from './drawingInference';
import { resolveDrawingSnap, type DrawingSnap } from './drawingSnapEngine';
import { activateDrawingTool, finishDrawingConstruction, type DrawingActiveTool, type DrawingToolLifecycle } from './drawingToolLifecycle';
import { useCadWheelCapture } from './useCadWheelCapture';
import { CAD_PRIMARY_BUTTON, useCadCtrlSnapOverride, useCadEscapeToolExit, useCadPanGesture } from './cadInteraction';
import { resolveCadToolPointerActivation, type CadToolActivationRecord } from './cadToolActivation';
import { appendDimension, chooseLineDimensionKind, choosePointDimensionKind, createDimensionId, createLineDimension, createLineToLineAngleDimension, createPointToLineDimension, createPointToPointDimension, deleteDimension, deleteEntityWithDependentDimensions, derivePointToLineAnnotationGeometry, dimensionEditorWidthPixels, dimensionOffset, dimensionScreenPixelsToModelUnits, DIMENSION_COLORS, DIMENSION_EDITOR_HEIGHT_PX, DIMENSION_TEXT_SIZE_PX, displayedDimensionMeasurement, formatAngleDimension, formatDimensionEditValue, formatDimensionValue, moveDimensionPlacement, parseLinearDimension, pointToLineDimensionOffset, preselectionReference, resolveDimensionLineReference, resolveDimensionPreselection, resolveDimensionPreselectionForTarget, resolveDrawingPointReference, type DimensionPreselection, type DimensionToolState } from './drawingDimension';
import { candidateForSector, createLineAngleBasis, deriveLineAngleAnnotation } from './drawingLineAngle';
import { solveDrawingDimensionEdit } from './drawingConstraintSolver';
import type { HistoryControlsProps } from './HistoryControls';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from './drawingHistory';
import { pointIdForLineEndpoint, resolveLine } from './drawingTopology.js';
import { DRAWING_DRAG_THRESHOLD_PX, pointIdFromHit, solveDrawingDragCandidate, type DrawingGeometryTarget } from './drawingDirectManipulation.js';
import { geometryConstraintVisualClass, getGeometryConstraintVisualState } from './drawingGeometryVisualState.js';

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
type CadCursorPresentation = Readonly<{
  anchor: CoordinatePoint;
  snap: DrawingSnap;
  xGuideReference: CoordinatePoint | null;
  yGuideReference: CoordinatePoint | null;
}> | null;
type GeometryDragSession = Readonly<{
  pointerId: number; target: DrawingGeometryTarget; startClient: CoordinatePoint; startModel: DrawingPoint;
  startDocument: DrawingDocumentV2; candidate: DrawingDocumentV2; exceeded: boolean;
}>;
type DrawingPlacementResolution = Readonly<{
  rawPoint: DrawingPoint;
  effectivePoint: DrawingPoint;
  spatialSnap: DrawingSnap;
  interaction: LineToolInteraction;
}>;

export const initialDrawingViewBox: DrawingViewBox = { x: -400, y: -300, width: 800, height: 600 };
const formatViewBox = ({ x, y, width, height }: DrawingViewBox) => `${x} ${y} ${width} ${height}`;

export function DrawingWorkspace({
  document,
  setDocument,
  viewBox,
  setViewBox,
  onHistoryControllerChange,
}: {
  document: DrawingDocumentV2;
  setDocument: Dispatch<SetStateAction<DrawingDocumentV2>>;
  viewBox: DrawingViewBox;
  setViewBox: Dispatch<SetStateAction<DrawingViewBox>>;
  onHistoryControllerChange?: (controller: HistoryControlsProps | null) => void;
}) {
  const toolSidebarRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [overlayGeometry, setOverlayGeometry] = useState<CoordinateOverlayGeometry | null>(null);
  const [toolLifecycle, setToolLifecycle] = useState<DrawingToolLifecycle>(() => activateDrawingTool('select'));
  const activeTool = toolLifecycle.activeTool;
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
  const [dimensionDrag, setDimensionDrag] = useState<null | { id: string; startClient: CoordinatePoint; startOffset: number; previewOffset: number; exceeded: boolean }>(null);
  const [geometryDrag, setGeometryDrag] = useState<GeometryDragSession | null>(null);
  const [geometryPreselection, setGeometryPreselection] = useState<DimensionPreselection | null>(null);
  const [selectedGeometry, setSelectedGeometry] = useState<DrawingGeometryTarget | null>(null);
  const documentRef = useRef(document);
  const historyRef = useRef(EMPTY_DRAWING_HISTORY);
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    const sidebar = toolSidebarRef.current;
    if (!sidebar) return;
    sidebar.addEventListener('selectionstart', preventToolChromeSelection);
    return () => sidebar.removeEventListener('selectionstart', preventToolChromeSelection);
  }, []);
  const [lineInteraction, setLineInteraction] = useState<LineToolInteraction>(EMPTY_LINE_INTERACTION);
  const [cadCursor, setCadCursor] = useState<CadCursorPresentation>(null);
  const lineCursor = cadCursor; // Line is currently the sole consumer of the shared CAD cursor.
  const [drawingSnap, setDrawingSnap] = useState<DrawingSnap | null>(null);
  const lastPointerClientRef = useRef<CoordinatePoint | null>(null);
  const pendingLineClickRef = useRef<number | null>(null);
  const activeToolRef = useRef<DrawingActiveTool>(activeTool);
  const previousToolActivationRef = useRef<CadToolActivationRecord<DrawingActiveTool> | null>(null);
  const lineInteractionRef = useRef(lineInteraction);
  const drawingSnapRef = useRef<DrawingSnap | null>(drawingSnap);
  const resolvePlacementRef = useRef<(clientPoint: CoordinatePoint, ctrlHeld: boolean) => void>(() => undefined);
  const entitySequence = useRef(0);
  const pointSequence = useRef(0);
  const renderDocument = geometryDrag?.candidate ?? document;
  const activeSketch = renderDocument.sketches[renderDocument.activeSketchId];
  const resolvedLines = activeSketch?.entityOrder.flatMap((id) => {
    const entity = activeSketch.entities[id];
    const line = entity?.type === 'line' ? resolveLine(activeSketch, entity) : null;
    return line ? [line] : [];
  }) ?? [];
  const gridSpacing = getDrawingGridSpacing(viewBox.width);
  const gridHierarchy = getDrawingGridHierarchy(gridSpacing);
  lineInteractionRef.current = lineInteraction;
  drawingSnapRef.current = drawingSnap;
  documentRef.current = document;

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

  const resolvePlacement = (clientPoint: CoordinatePoint, ctrlHeld: boolean): DrawingPlacementResolution | null => {
    const drawingTransform = svgRef.current?.getScreenCTM();
    const overlayTransform = overlaySvgRef.current?.getScreenCTM();
    if (!drawingTransform || !overlayTransform) return null;
    const rawPoint = clientToModelPoint(clientPoint, drawingTransform);
    if (!rawPoint) return null;
    const candidates = collectDrawingInferenceCandidates(clientPoint, resolvedLines, drawingTransform, viewBox);
    const interaction = lineInteractionRef.current;
    const snap = resolveDrawingSnap({ rawPoint, candidates, previousSnap: drawingSnapRef.current, ctrlOverride: ctrlHeld });
    const lineResolution = resolveLineEffectivePoint(interaction, rawPoint, snap);
    const placementPoint = lineResolution.effectivePoint;
    const nextInteraction = lineResolution.interaction;
    const anchor = modelToOverlayPoint(placementPoint, drawingTransform, overlayTransform);
    setDrawingSnap(snap);
    drawingSnapRef.current = snap;
    setLineInteraction(nextInteraction);
    lineInteractionRef.current = nextInteraction;
    const xGuideReference = snap.type === 'alignment' && snap.xReference
      ? modelToOverlayPoint(snap.xReference.candidatePoint, drawingTransform, overlayTransform) : null;
    const yGuideReference = snap.type === 'alignment' && snap.yReference
      ? modelToOverlayPoint(snap.yReference.candidatePoint, drawingTransform, overlayTransform) : null;
    setCadCursor(anchor ? { anchor, snap, xGuideReference, yGuideReference } : null);
    return { rawPoint, effectivePoint: placementPoint, spatialSnap: snap, interaction: nextInteraction };
  };
  activeToolRef.current = activeTool;
  resolvePlacementRef.current = resolvePlacement;

  const commitLinePoint = (point: DrawingPoint, reusedPointId: string | null) => {
    const pointId = reusedPointId ?? `point-${Date.now().toString(36)}-${++pointSequence.current}`;
    const result = applyResolvedLineClick(lineInteractionRef.current, point, () => `line-${Date.now().toString(36)}-${++entitySequence.current}`, pointId);
    setLineInteraction(result.interaction);
    lineInteractionRef.current = result.interaction;
    if (result.entity) transactDocument((current) => appendEntityToActiveSketch(current, result.entity!));
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
    if (candidate?.kind !== 'point') return candidate;
    const line = activeSketch.entities[candidate.lineId];
    return line ? { ...candidate, pointId: pointIdForLineEndpoint(line, candidate.point) } : candidate;
  };

  const ctrlSnapOverride = useCadCtrlSnapOverride((held) => {
    if (lastPointerClientRef.current && activeToolRef.current === 'line') resolvePlacementRef.current(lastPointerClientRef.current, held);
  });
  const { isPanning, panHandlers } = useCadPanGesture({
    viewportRef: svgRef,
    onPanStart: () => { setCadCursor(null); setDrawingSnap(null); },
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
    if (geometryDrag) { setGeometryDrag(null); return; }
    if (dimensionDrag) { setDimensionDrag(null); return; }
    if (editingDimensionId) { setEditingDimensionId(null); setDimensionEditError(null); return; }
    if (activeToolRef.current === 'select') return;
    if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
    pendingLineClickRef.current = null;
    const empty = cancelLineInteraction();
    lineInteractionRef.current = empty;
    setLineInteraction(empty);
    setDrawingSnap(null);
    setCadCursor(null);
    setToolLifecycle(activateDrawingTool('select'));
    setDimensionTool({ phase: 'inactive' });
  };
  useCadEscapeToolExit(exitActiveTool);

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (panHandlers.onPointerDown(event)) return;
    const dimensionTarget = (event.target as Element).closest('.drawing-dimension-editor, .drawing-dimension-hit, .drawing-dimension-value-hit');
    // In Select, let the model-space resolver arbitrate an annotation hit
    // against finite sketch geometry beneath it. The annotation's own handler
    // remains authoritative when there is no geometry candidate.
    if (dimensionTarget && activeTool !== 'select') return;
    if (event.button !== CAD_PRIMARY_BUTTON) return;
    if (activeTool === 'select') {
      const hit = resolveDimensionCandidate({ x: event.clientX, y: event.clientY });
      const matrix = svgRef.current?.getScreenCTM();
      const startModel = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!hit || !startModel) { setSelectedGeometry(null); return; }
      const target: DrawingGeometryTarget | null = hit.kind === 'point'
        ? (() => { const pointId = pointIdFromHit(documentRef.current, hit.lineId, hit.point); return pointId ? { kind: 'point', pointId } : null; })()
        : hit.kind === 'line' ? { kind: 'line', lineId: hit.lineId } : null;
      if (!target) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedGeometry(target);
      setSelectedDimensionId(null);
      setGeometryDrag({ pointerId: event.pointerId, target, startClient: { x: event.clientX, y: event.clientY }, startModel, startDocument: documentRef.current, candidate: documentRef.current, exceeded: false });
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
              const angle = firstLine && secondLine ? createLineToLineAngleDimension(firstLine, secondLine, point, 'preview') : null;
              if (angle) { setDimensionTool({ phase: 'placementPreview', dimension: angle, cursor: point }); setDimensionPreselection(null); }
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
        if (preview.kind === 'LINE_TO_LINE_ANGLE') {
          const first = resolveDimensionLineReference(activeSketch, preview.references[0]), second = resolveDimensionLineReference(activeSketch, preview.references[1]);
          const refreshed = first && second ? createLineToLineAngleDimension(first, second, point, createDimensionId()) : null;
          if (!refreshed) return;
          transactDocument((current) => appendDimension(current, refreshed));
          const nextLifecycle = finishDrawingConstruction(toolLifecycle); setToolLifecycle(nextLifecycle);
          setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'waitingForFirstTarget' } : { phase: 'inactive' }); setDimensionPreselection(null); return;
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
          const lineEntity = activeSketch.entities[reference.entityId], resolved = lineEntity ? resolveLine(activeSketch, lineEntity) : null;
          if (resolved) setDimensionTool({ phase: 'lineTargetSelected', line: reference, dimension: createLineDimension(resolved, chooseLineDimensionKind(resolved, point, undefined, viewport.width / viewBox.width), point, 'preview'), cursor: point });
        } else setDimensionTool({ phase: 'waitingForSecondTarget', first: reference });
      }
      return;
    }
    if (activeTool === 'line') {
      if (event.detail > 1) return;
      // Resolve synchronously at acceptance time. The delayed commit owns this immutable point.
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride);
      if (!placement) return;
      const effectivePoint = placement.effectivePoint;
      const endpointPointId = placement.spatialSnap.type === 'endpoint' && activeSketch
        ? pointIdForLineEndpoint(activeSketch.entities[placement.spatialSnap.entityId], placement.spatialSnap.endpoint) : null;
      if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
      pendingLineClickRef.current = window.setTimeout(() => {
        pendingLineClickRef.current = null;
        commitLinePoint(effectivePoint, endpointPointId);
      }, 220);
      return;
    }
  };

  const handleDrawingMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === CAD_PRIMARY_BUTTON) event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (panHandlers.onPointerMove(event)) return;
    if (geometryDrag?.pointerId === event.pointerId) {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!point) return;
      const exceeded = geometryDrag.exceeded || Math.hypot(event.clientX - geometryDrag.startClient.x, event.clientY - geometryDrag.startClient.y) >= DRAWING_DRAG_THRESHOLD_PX;
      if (!exceeded) return;
      const candidate = solveDrawingDragCandidate(geometryDrag.startDocument, geometryDrag.target, { x: point.x - geometryDrag.startModel.x, y: point.y - geometryDrag.startModel.y });
      setGeometryDrag({ ...geometryDrag, exceeded, candidate: candidate ?? geometryDrag.candidate });
      return;
    }
    if (dimensionDrag) {
      const matrix = svgRef.current?.getScreenCTM(), sketch = activeSketch;
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      const dimension = sketch?.dimensions[dimensionDrag.id];
      const resolved = dimension && sketch && dimension.kind === 'POINT_TO_LINE_DISTANCE' ? resolveDimensionLineReference(sketch, dimension.references[1]) : dimension && sketch ? (() => { const a = resolveDrawingPointReference(sketch, dimension.references[0]), b = resolveDrawingPointReference(sketch, dimension.references[1]); return a && b ? { id: '', type: 'line' as const, startPointId: '', endPointId: '', start: a, end: b } : null; })() : null;
      if (point && dimension && resolved) {
        const targetPoint = dimension.kind === 'POINT_TO_LINE_DISTANCE' && sketch
          ? resolveDrawingPointReference(sketch, dimension.references[0]) : null;
        const offset = dimension.kind === 'POINT_TO_LINE_DISTANCE' && targetPoint
          ? pointToLineDimensionOffset(targetPoint, resolved, point)
          : dimensionOffset(resolved, point, dimension.kind);
        const exceeded = dimensionDrag.exceeded || Math.hypot(event.clientX - dimensionDrag.startClient.x, event.clientY - dimensionDrag.startClient.y) >= 4;
        setDimensionDrag({ ...dimensionDrag, previewOffset: offset, exceeded });
      }
      return;
    }
    if (activeTool === 'dimension' && (dimensionTool.phase === 'placementPreview' || dimensionTool.phase === 'lineTargetSelected')) {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (point && activeSketch) {
        const d = dimensionTool.dimension;
        if (d.kind === 'POINT_TO_LINE_DISTANCE') {
          const line = resolveDimensionLineReference(activeSketch, d.references[1]);
          const targetPoint = resolveDrawingPointReference(activeSketch, d.references[0]);
          if (line && targetPoint) setDimensionTool({ ...dimensionTool, cursor: point, dimension: { ...d, placement: { kind: 'linear', offset: pointToLineDimensionOffset(targetPoint, line, point) } } });
        } else if (d.kind === 'LINE_TO_LINE_ANGLE') {
          const first = resolveDimensionLineReference(activeSketch, d.references[0]), second = resolveDimensionLineReference(activeSketch, d.references[1]);
          const dimension = first && second ? createLineToLineAngleDimension(first, second, point, 'preview') : null;
          if (dimension) setDimensionTool({ ...dimensionTool, cursor: point, dimension });
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
    if (activeTool === 'line') {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      resolvePlacement(lastPointerClientRef.current, event.ctrlKey || ctrlSnapOverride);
      return;
    }
    if (activeTool === 'select') setGeometryPreselection(resolveDimensionCandidate({ x: event.clientX, y: event.clientY }));
  };

  useEffect(() => () => { if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current); }, []);

  const selectTool = (tool: DrawingActiveTool, activationMode: 'normal' | 'persistent' = 'normal') => {
    if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
    pendingLineClickRef.current = null;
    setLineInteraction(cancelLineInteraction());
    lineInteractionRef.current = cancelLineInteraction();
    setDrawingSnap(null);
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

  const clearCadCursor = () => { lastPointerClientRef.current = null; setCadCursor(null); setDrawingSnap(null); setDimensionPreselection(null); if (!geometryDrag) setGeometryPreselection(null); };
  const clearLineCursor = clearCadCursor;

  const finishLine = () => {
    if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
    pendingLineClickRef.current = null;
    setLineInteraction(cancelLineInteraction());
    setDrawingSnap(null);
    setCadCursor(null);
    lineInteractionRef.current = cancelLineInteraction();
    setToolLifecycle((current) => finishDrawingConstruction(current));
  };

  const annotationGeometry = (dimension: DrawingDimension) => {
    if (!activeSketch) return null;
    if (dimension.kind === 'LINE_TO_LINE_ANGLE') return null;
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
    return dimensionDrag?.id === id ? { ...dimension, placement: { ...dimension.placement, offset: dimensionDrag.previewOffset } } : dimension;
  }).filter(Boolean) ?? [];
  const editingDimension = displayedDimensions.find(({ id }) => id === editingDimensionId);
  const editingGeometry = editingDimension ? annotationGeometry(editingDimension) : null;
  const editingMiddle = editingGeometry ? { x: (editingGeometry.a.x + editingGeometry.b.x) / 2, y: (editingGeometry.a.y + editingGeometry.b.y) / 2 } : null;
  const editorAnchor = editingMiddle && svgRef.current && overlaySvgRef.current
    ? modelToOverlayPoint(editingMiddle, svgRef.current.getScreenCTM()!, overlaySvgRef.current.getScreenCTM()!) : null;
  const editorWidth = dimensionEditorWidthPixels(dimensionDraft);

  const finishGeometryDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!geometryDrag || geometryDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (geometryDrag.exceeded && geometryDrag.candidate !== geometryDrag.startDocument) transactDocument(() => geometryDrag.candidate);
    // A meaningful drag owns only transient interaction emphasis. A click keeps
    // the existing persistent selection semantics for future selection tools.
    if (geometryDrag.exceeded) setSelectedGeometry(null);
    setGeometryDrag(null);
  };

  const finishDimensionDrag = () => {
    if (!dimensionDrag) return;
    if (dimensionDrag.exceeded) transactDocument((current) => moveDimensionPlacement(current, dimensionDrag.id, dimensionDrag.previewOffset));
    setDimensionDrag(null);
  };

  const undo = () => {
    const result = undoDrawingDocument(historyRef.current, documentRef.current);
    if (!result.changed) return;
    historyRef.current = result.history;
    documentRef.current = result.document;
    setEditingDimensionId(null);
    setDimensionEditError(null);
    setSelectedDimensionId(null);
    setSelectedGeometry(null);
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
    setSelectedGeometry(null);
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
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDimensionId) { event.preventDefault(); transactDocument((current) => deleteDimension(current, selectedDimensionId)); setSelectedDimensionId(null); }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGeometry?.kind === 'line') {
        event.preventDefault();
        transactDocument((current) => deleteEntityWithDependentDimensions(current, selectedGeometry.lineId));
        setSelectedGeometry(null);
      }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, selectedDimensionId, selectedGeometry]);

  const pixelsPerMm = viewport.width / viewBox.width;
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
  return (
    <section className="drawing-workspace workspace-shell" aria-label="2D Drawing workspace">
      <aside ref={toolSidebarRef} className="drawing-tool-sidebar" aria-label="Drawing tools" onPointerDownCapture={preventToolChromePointerSelection} onMouseDownCapture={preventToolChromeMouseSelection}>
        <button type="button" className={`cad-tool-button${activeTool === 'select' ? ' is-active' : ''}`} aria-pressed={activeTool === 'select'} onPointerDown={(event) => activateToolFromPointer('select', event)} onClick={(event) => activateToolFromKeyboard('select', event)}>Select</button>
        <button type="button" className={`cad-tool-button${activeTool === 'line' ? ' is-active' : ''}`} aria-pressed={activeTool === 'line'} onPointerDown={(event) => activateToolFromPointer('line', event)} onClick={(event) => activateToolFromKeyboard('line', event)}>Line</button>
      </aside>
      <section className="canvas-card drawing-canvas-card workspace-canvas">
        <div className="canvas-frame">
          <div className="drawing-status" aria-live="polite">
            <strong>{activeSketch?.name ?? 'No active sketch'}</strong><span>Unit: {document.unit}</span><span>Grid: {gridSpacing} mm</span><span>Active Tool: {activeTool === 'line' ? 'Line' : activeTool === 'dimension' ? 'Dimension' : 'Select'}</span>
          </div>
          <div className="canvas-zoom-controls" aria-label="Drawing canvas zoom controls">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setViewBox(initialDrawingViewBox)}>Fit</button>
          </div>
          <svg
            ref={svgRef}
            className={`design-svg cad-viewport-interaction drawing-svg${isPanning ? ' is-panning' : ''}${activeTool === 'line' ? ' has-line-cursor' : ''}${activeTool === 'dimension' ? ` has-dimension-cursor is-${dimensionPreselection?.kind ?? 'normal'}-target` : ''}${activeTool === 'select' ? ` has-geometry-cursor is-${geometryPreselection?.kind ?? 'normal'}-target${geometryDrag ? ' is-geometry-dragging' : ''}` : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch?.name ?? 'Drawing'} coordinate drawing canvas`}
            onMouseDown={handleDrawingMouseDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => { if (geometryDrag) finishGeometryDrag(event); else if (dimensionDrag) finishDimensionDrag(); else panHandlers.onPointerUp(event); }}
            onPointerCancel={(event) => { if (geometryDrag) setGeometryDrag(null); else if (dimensionDrag) setDimensionDrag(null); else panHandlers.onPointerCancel(event); }}
            onContextMenu={panHandlers.onContextMenu}
            onPointerLeave={clearLineCursor}
            onDoubleClick={() => { if (activeTool === 'line') finishLine(); }}
          >
            <defs>
              {Object.entries(DIMENSION_COLORS).map(([state, color]) => <marker key={state} id={`dimension-arrow-${state}`} markerWidth="7" markerHeight="7" viewBox="0 0 7 7" refX="7" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 7 3.5 L 0 0 L 0 7 Z" fill={color} stroke="none" /></marker>)}
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
                <line key={entity.id} data-constraint-state={getGeometryConstraintVisualState(activeSketch, { kind: 'line', lineId: entity.id })} className={`drawing-line-entity ${geometryConstraintVisualClass(getGeometryConstraintVisualState(activeSketch, { kind: 'line', lineId: entity.id }))}${dimensionPreselection?.kind === 'line' && dimensionPreselection.lineId === entity.id ? ' is-dimension-preselected' : ''}${dimensionTool.phase === 'lineTargetSelected' && dimensionTool.line.entityId === entity.id ? ' is-dimension-preselected' : ''}${geometryPreselection?.kind === 'line' && geometryPreselection.lineId === entity.id ? ' is-geometry-preselected' : ''}${selectedGeometry?.kind === 'line' && selectedGeometry.lineId === entity.id ? ' is-geometry-selected' : ''}${geometryDrag?.target.kind === 'line' && geometryDrag.target.lineId === entity.id ? ' is-geometry-dragging' : ''}`} x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} />
              ))}
              {activeTool === 'select' && geometryPreselection?.kind === 'point' && activeSketch && (() => { const p = resolveDrawingPointReference(activeSketch, { kind: 'point', entityId: geometryPreselection.lineId, point: geometryPreselection.point }); return p ? <circle className="drawing-geometry-point-preselection" cx={p.x} cy={p.y} r={5 / pixelsPerMm} /> : null; })()}
              {activeTool === 'select' && selectedGeometry?.kind === 'point' && activeSketch?.points[selectedGeometry.pointId] && <circle className={`drawing-geometry-point-selected${geometryDrag?.target.kind === 'point' && geometryDrag.target.pointId === selectedGeometry.pointId ? ' is-geometry-dragging' : ''}`} cx={activeSketch.points[selectedGeometry.pointId].x} cy={activeSketch.points[selectedGeometry.pointId].y} r={6 / pixelsPerMm} />}
              {activeTool === 'dimension' && dimensionPreselection?.kind === 'point' && activeSketch && (() => { const p = resolveDrawingPointReference(activeSketch, { kind: 'point', entityId: dimensionPreselection.lineId, point: dimensionPreselection.point }); return p ? <circle className="drawing-dimension-point-preselection" cx={p.x} cy={p.y} r={5 / pixelsPerMm} /> : null; })()}
              {activeTool === 'dimension' && dimensionPreselection?.kind === 'origin' && <circle className="drawing-dimension-point-preselection drawing-origin-preselection" cx={0} cy={0} r={6 / pixelsPerMm} />}
              {dimensionTool.phase === 'waitingForSecondTarget' && activeSketch && (() => { const p = resolveDrawingPointReference(activeSketch, dimensionTool.first); return p ? <circle className="drawing-dimension-point-selected" cx={p.x} cy={p.y} r={6 / pixelsPerMm} /> : null; })()}
            </g>
            <g className="drawing-dimension-layer" aria-label="Drawing dimensions">
              {[...displayedDimensions, ...(previewDimension ? [previewDimension] : [])].map((dimension) => {
                if (dimension.kind === 'LINE_TO_LINE_ANGLE') {
                  const angleGeometry = angleAnnotationGeometry(dimension); if (!angleGeometry) return null;
                  const measurement = activeSketch ? displayedDimensionMeasurement(activeSketch, dimension) : null; if (measurement === null) return null;
                  const path = `M ${angleGeometry.start.x} ${angleGeometry.start.y} A ${angleGeometry.radius} ${angleGeometry.radius} 0 ${angleGeometry.largeArc} ${angleGeometry.sweep} ${angleGeometry.end.x} ${angleGeometry.end.y}`;
                  const selected = dimension.id === selectedDimensionId, hovered = dimension.id === hoveredDimensionId;
                  const arrowState = selected ? 'active' : hovered ? 'hover' : 'normal';
                  const arrowMarker = `url(#dimension-arrow-${arrowState})`;
                  return <g key={dimension.id} className={`drawing-dimension is-reference is-angle${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}${dimension.id === 'preview' ? ' is-preview' : ''}`}>
                    {angleGeometry.supportExtensions.map((extension) => <line key={extension.lineId} className="drawing-dimension-extension drawing-dimension-lineage drawing-dimension-support-extension" x1={extension.start.x} y1={extension.start.y} x2={extension.end.x} y2={extension.end.y} />)}
                    <line className="drawing-dimension-extension drawing-dimension-lineage" x1={angleGeometry.supportA.start.x} y1={angleGeometry.supportA.start.y} x2={angleGeometry.supportA.end.x} y2={angleGeometry.supportA.end.y} />
                    <line className="drawing-dimension-extension drawing-dimension-lineage" x1={angleGeometry.supportB.start.x} y1={angleGeometry.supportB.start.y} x2={angleGeometry.supportB.end.x} y2={angleGeometry.supportB.end.y} />
                    <path className="drawing-dimension-line drawing-dimension-angle-arc" d={path} fill="none" markerStart={arrowMarker} markerEnd={arrowMarker} />
                    <text className="drawing-dimension-value" x={angleGeometry.label.x} y={angleGeometry.label.y} textAnchor="middle" style={{ fontSize: dimensionScreenPixelsToModelUnits(DIMENSION_TEXT_SIZE_PX, pixelsPerMm) }}>{formatAngleDimension(measurement)}</text>
                    {dimension.id !== 'preview' && <path className="drawing-dimension-hit" d={path} fill="none" onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => { if (event.button === CAD_PRIMARY_BUTTON) setSelectedDimensionId(dimension.id); }} />}
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
                  {geometry.lineExtension && <line className="drawing-dimension-extension drawing-dimension-lineage" x1={geometry.lineExtension.start.x} y1={geometry.lineExtension.start.y} x2={geometry.lineExtension.end.x} y2={geometry.lineExtension.end.y} />}
                  <line className="drawing-dimension-extension" x1={extensionA.start.x} y1={extensionA.start.y} x2={extensionA.end.x} y2={extensionA.end.y} /><line className="drawing-dimension-extension" x1={extensionB.start.x} y1={extensionB.start.y} x2={extensionB.end.x} y2={extensionB.end.y} />
                  <line className="drawing-dimension-line" markerStart={arrowMarker} markerEnd={arrowMarker} x1={geometry.a.x} y1={geometry.a.y} x2={geometry.b.x} y2={geometry.b.y} />
                  <text className="drawing-dimension-value" x={middle.x} y={middle.y - 4 / pixelsPerMm} textAnchor="middle" style={{ fontSize: dimensionScreenPixelsToModelUnits(DIMENSION_TEXT_SIZE_PX, pixelsPerMm) }} transform={`rotate(${textAngle} ${middle.x} ${middle.y})`}>{label}</text>
                  {dimension.id !== 'preview' && <line className="drawing-dimension-hit" x1={geometry.a.x} y1={geometry.a.y} x2={geometry.b.x} y2={geometry.b.y} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => { if (event.button !== CAD_PRIMARY_BUTTON || editingDimensionId) return; event.currentTarget.setPointerCapture(event.pointerId); setSelectedDimensionId(dimension.id); setDimensionDrag({ id: dimension.id, startClient: { x: event.clientX, y: event.clientY }, startOffset: dimension.placement.offset, previewOffset: dimension.placement.offset, exceeded: false }); }} />}
                  {dimension.id !== 'preview' && <rect className={`drawing-dimension-value-hit${dimension.role === 'driving' ? ' is-editable' : ''}`} x={middle.x - valueHitWidth / 2} y={middle.y - 16 / pixelsPerMm} width={valueHitWidth} height={18 / pixelsPerMm} transform={`rotate(${textAngle} ${middle.x} ${middle.y})`} onPointerEnter={() => setHoveredDimensionId(dimension.id)} onPointerLeave={() => setHoveredDimensionId(null)} onPointerDown={(event) => { if (event.button === CAD_PRIMARY_BUTTON) setSelectedDimensionId(dimension.id); }} onDoubleClick={beginDimensionEdit} />}
                  {editingDimensionId === dimension.id && dimensionEditError && <text className="drawing-dimension-error" x={middle.x} y={middle.y + 24 / pixelsPerMm} textAnchor="middle">{dimensionEditError}</text>}
                </g>;
              })}
            </g>
            {activeTool === 'line' && lineInteraction.start && lineInteraction.effectivePreviewPoint && (
              <line className={`drawing-line-preview${lineInteraction.snapActive ? ' is-angular-snapped' : ''}`} x1={lineInteraction.start.x} y1={lineInteraction.start.y} x2={lineInteraction.effectivePreviewPoint.x} y2={lineInteraction.effectivePreviewPoint.y} />
            )}
          </svg>
          <svg ref={overlaySvgRef} className="drawing-label-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="Model coordinate scale">
            {editingDimension && editorAnchor && <foreignObject className="drawing-dimension-editor-frame" x={editorAnchor.x - editorWidth / 2} y={editorAnchor.y - DIMENSION_EDITOR_HEIGHT_PX + 2} width={editorWidth} height={DIMENSION_EDITOR_HEIGHT_PX}><input ref={dimensionEditorInputRef} className="drawing-dimension-editor" value={dimensionDraft} aria-label="Dimension value in millimetres" onChange={(event) => { setDimensionDraft(event.target.value); setDimensionEditError(null); }} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingDimensionId(null); setDimensionEditError(null); } if (event.key === 'Enter') { const parsed = parseLinearDimension(dimensionDraft); if (parsed === null) { setDimensionEditError('Dimension must be 0 mm or greater.'); return; } const result = solveDrawingDimensionEdit({ document, dimensionId: editingDimension.id, targetValue: parsed }); if (!result.ok) { setDimensionEditError(result.message); return; } transactDocument(() => result.document); setEditingDimensionId(null); setDimensionEditError(null); } }} /></foreignObject>}
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
            {activeTool === 'line' && lineCursor && (
              <g className="drawing-alignment-presentation" aria-hidden="true">
                {lineCursor.snap.type === 'alignment' && lineCursor.xGuideReference && <line className="drawing-alignment-guide" data-axis="x" x1={lineCursor.xGuideReference.x} y1={lineCursor.xGuideReference.y} x2={lineCursor.anchor.x} y2={lineCursor.anchor.y} />}
                {lineCursor.snap.type === 'alignment' && lineCursor.yGuideReference && <line className="drawing-alignment-guide" data-axis="y" x1={lineCursor.yGuideReference.x} y1={lineCursor.yGuideReference.y} x2={lineCursor.anchor.x} y2={lineCursor.anchor.y} />}
              <g className="drawing-line-cursor drawing-cad-cursor" data-inference={lineCursor.snap.type} transform={`translate(${lineCursor.anchor.x} ${lineCursor.anchor.y})`} aria-hidden="true">
                <line className="drawing-line-cursor-arm" data-arm="left" x1="-22" y1="0" x2="-7" y2="0" />
                <line className="drawing-line-cursor-arm" data-arm="right" x1="7" y1="0" x2="22" y2="0" />
                <line className="drawing-line-cursor-arm" data-arm="top" x1="0" y1="-22" x2="0" y2="-7" />
                <line className="drawing-line-cursor-arm" data-arm="bottom" x1="0" y1="7" x2="0" y2="22" />
                {lineCursor.snap.type === 'none' && <circle className="drawing-line-cursor-dot" cx="0" cy="0" r="2.5" />}
                {lineCursor.snap.type === 'endpoint' && <circle className="drawing-line-cursor-endpoint" cx="0" cy="0" r="5.5" />}
                {lineCursor.snap.type === 'line' && <path className="drawing-line-cursor-line" d="M 0 -6 L 6 5 L -6 5 Z" />}
                {lineCursor.snap.type === 'alignment' && <rect className="drawing-line-cursor-alignment" x="-5" y="-5" width="10" height="10" />}
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
