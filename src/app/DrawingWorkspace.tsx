import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from 'react';
import type { DrawingDimension, DrawingDocumentV2, DrawingLineEntity, DrawingPoint } from './drawingTypes';
import { appendEntityToActiveSketch, applyResolvedLineClick, cancelLineInteraction, EMPTY_LINE_INTERACTION, resolveLinePreviewPoint, updateLinePreviewAtSpatialPoint, type LineToolInteraction } from './drawingLineTool';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisValues, zoomViewBoxAtPoint } from './drawingGrid';
import { clientToModelPoint, modelToOverlayPoint, type CoordinatePoint } from './drawingTransform';
import { collectDrawingInferenceCandidates } from './drawingInference';
import { resolveDrawingSnap, type DrawingSnap } from './drawingSnapEngine';
import { activateDrawingTool, finishDrawingConstruction, type DrawingActiveTool, type DrawingToolLifecycle } from './drawingToolLifecycle';
import { useCadWheelCapture } from './useCadWheelCapture';
import { CAD_PRIMARY_BUTTON, useCadCtrlSnapOverride, useCadEscapeToolExit, useCadPanGesture } from './cadInteraction';
import { resolveCadToolPointerActivation, type CadToolActivationRecord } from './cadToolActivation';
import { appendDimension, chooseLineDimensionKind, createDimensionId, createLineDimension, deleteDimension, dimensionEditorWidthPixels, dimensionOffset, dimensionScreenPixelsToModelUnits, DIMENSION_COLORS, DIMENSION_EDITOR_HEIGHT_PX, DIMENSION_TEXT_SIZE_PX, displayedDimensionMeasurement, formatDimensionEditValue, formatDimensionValue, moveDimensionPlacement, parseLinearDimension, resolveDimensionPreselection, resolveDrawingPointReference, type DimensionPreselection, type DimensionToolState } from './drawingDimension';
import { solveDrawingDimensionEdit } from './drawingConstraintSolver';
import type { HistoryControlsProps } from './HistoryControls';
import { EMPTY_DRAWING_HISTORY, redoDrawingDocument, transactDrawingDocument, undoDrawingDocument } from './drawingHistory';

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
  const [dimensionDraft, setDimensionDraft] = useState('');
  const [dimensionEditError, setDimensionEditError] = useState<string | null>(null);
  const [dimensionPreselection, setDimensionPreselection] = useState<DimensionPreselection | null>(null);
  const [hoveredDimensionId, setHoveredDimensionId] = useState<string | null>(null);
  const [dimensionDrag, setDimensionDrag] = useState<null | { id: string; startClient: CoordinatePoint; startOffset: number; previewOffset: number; exceeded: boolean }>(null);
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
  const activeSketch = document.sketches[document.activeSketchId];
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
    const committedLines = activeSketch?.entityOrder.map((id) => activeSketch.entities[id]).filter((entity) => entity?.type === 'line') ?? [];
    const candidates = collectDrawingInferenceCandidates(clientPoint, committedLines, drawingTransform, viewBox);
    const interaction = lineInteractionRef.current;
    const snap = resolveDrawingSnap({ rawPoint, candidates, previousSnap: drawingSnapRef.current, ctrlOverride: ctrlHeld });
    const toolPoint = snap.active || !interaction.start
      ? snap.effectivePoint
      : resolveLinePreviewPoint(interaction.start, rawPoint).effectivePreviewPoint;
    // D2.2b equivalent was: placementPoint = nextInteraction.effectivePreviewPoint ?? point.
    const placementPoint = toolPoint;
    const nextInteraction = snap.active
      ? updateLinePreviewAtSpatialPoint(interaction, rawPoint, toolPoint)
      : interaction.start ? { ...interaction, ...resolveLinePreviewPoint(interaction.start, rawPoint) } : interaction;
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

  const commitLinePoint = (point: DrawingPoint) => {
    const result = applyResolvedLineClick(lineInteractionRef.current, point, () => `line-${Date.now().toString(36)}-${++entitySequence.current}`);
    setLineInteraction(result.interaction);
    lineInteractionRef.current = result.interaction;
    if (result.entity) transactDocument((current) => appendEntityToActiveSketch(current, result.entity!));
  };

  const resolveDimensionCandidate = (client: CoordinatePoint): DimensionPreselection | null => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix || !activeSketch) return null;
    const toClient = (point: DrawingPoint) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });
    return resolveDimensionPreselection(activeSketch.entityOrder.map((id) => activeSketch.entities[id]).filter((entity): entity is DrawingLineEntity => entity?.type === 'line').map((line) => ({ id: line.id, start: toClient(line.start), end: toClient(line.end) })), client);
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
    if ((event.target as Element).closest('.drawing-dimension-editor, .drawing-dimension-hit, .drawing-dimension-value-hit')) return;
    if (event.button !== CAD_PRIMARY_BUTTON) return;
    if (activeTool === 'dimension') {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      if (!point || !activeSketch) return;
      if (dimensionTool.phase === 'placementPreview') {
        const line = activeSketch.entities[dimensionTool.lineId];
        if (line?.type !== 'line') return;
        transactDocument((current) => appendDimension(current, createLineDimension(line, dimensionTool.kind, point, createDimensionId())));
        const nextLifecycle = finishDrawingConstruction(toolLifecycle);
        setToolLifecycle(nextLifecycle);
        setDimensionTool(nextLifecycle.activeTool === 'dimension' ? { phase: 'acquiringReference' } : { phase: 'inactive' });
        setDimensionPreselection(null);
        return;
      }
      const candidate = resolveDimensionCandidate({ x: event.clientX, y: event.clientY });
      if (candidate?.kind === 'point') {
        setDimensionTool({ phase: 'acquiringReference', reference: { kind: 'point', entityId: candidate.lineId, point: candidate.point } });
      } else if (candidate?.kind === 'line') {
        const line = activeSketch.entities[candidate.lineId];
        if (line?.type === 'line') setDimensionTool({ phase: 'placementPreview', lineId: line.id, cursor: point, kind: chooseLineDimensionKind(line, point, undefined, viewport.width / viewBox.width) });
      }
      return;
    }
    if (activeTool === 'line') {
      if (event.detail > 1) return;
      // Resolve synchronously at acceptance time. The delayed commit owns this immutable point.
      const placement = resolvePlacement({ x: event.clientX, y: event.clientY }, event.ctrlKey || ctrlSnapOverride);
      if (!placement) return;
      const effectivePoint = placement.effectivePoint;
      if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
      pendingLineClickRef.current = window.setTimeout(() => {
        pendingLineClickRef.current = null;
        commitLinePoint(effectivePoint);
      }, 220);
      return;
    }
  };

  const handleDrawingMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button === CAD_PRIMARY_BUTTON) event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (panHandlers.onPointerMove(event)) return;
    if (dimensionDrag) {
      const matrix = svgRef.current?.getScreenCTM(), sketch = activeSketch;
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      const dimension = sketch?.dimensions[dimensionDrag.id];
      const source = dimension && sketch ? sketch.entities[dimension.references[0].entityId] : null;
      if (point && dimension && source?.type === 'line') {
        const offset = dimensionOffset(source, point, dimension.kind);
        const exceeded = dimensionDrag.exceeded || Math.hypot(event.clientX - dimensionDrag.startClient.x, event.clientY - dimensionDrag.startClient.y) >= 4;
        setDimensionDrag({ ...dimensionDrag, previewOffset: offset, exceeded });
      }
      return;
    }
    if (activeTool === 'dimension' && dimensionTool.phase === 'placementPreview') {
      const matrix = svgRef.current?.getScreenCTM();
      const point = matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
      const line = activeSketch?.entities[dimensionTool.lineId];
      if (point && line?.type === 'line') setDimensionTool({ ...dimensionTool, cursor: point, kind: chooseLineDimensionKind(line, point, dimensionTool.kind, viewport.width / viewBox.width) });
      return;
    }
    if (activeTool === 'dimension') { setDimensionPreselection(resolveDimensionCandidate({ x: event.clientX, y: event.clientY })); return; }
    if (activeTool === 'line') {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      resolvePlacement(lastPointerClientRef.current, event.ctrlKey || ctrlSnapOverride);
      return;
    }
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
    setDimensionTool(tool === 'dimension' ? { phase: 'acquiringReference' } : { phase: 'inactive' });
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

  const clearCadCursor = () => { lastPointerClientRef.current = null; setCadCursor(null); setDrawingSnap(null); setDimensionPreselection(null); };
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
    const a = resolveDrawingPointReference(activeSketch, dimension.references[0]), b = resolveDrawingPointReference(activeSketch, dimension.references[1]);
    if (!a || !b) return null;
    if (dimension.kind === 'HORIZONTAL_DISTANCE') return { a: { x: a.x, y: (a.y + b.y) / 2 + dimension.placement.offset }, b: { x: b.x, y: (a.y + b.y) / 2 + dimension.placement.offset }, sourceA: a, sourceB: b };
    if (dimension.kind === 'VERTICAL_DISTANCE') return { a: { x: (a.x + b.x) / 2 + dimension.placement.offset, y: a.y }, b: { x: (a.x + b.x) / 2 + dimension.placement.offset, y: b.y }, sourceA: a, sourceB: b };
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, ox = -dy / length * dimension.placement.offset, oy = dx / length * dimension.placement.offset;
    return { a: { x: a.x + ox, y: a.y + oy }, b: { x: b.x + ox, y: b.y + oy }, sourceA: a, sourceB: b };
  };
  const previewDimension = dimensionTool.phase === 'placementPreview' && activeSketch?.entities[dimensionTool.lineId]?.type === 'line'
    ? createLineDimension(activeSketch.entities[dimensionTool.lineId], dimensionTool.kind, dimensionTool.cursor, 'preview') : null;
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
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, selectedDimensionId]);

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
            className={`design-svg cad-viewport-interaction drawing-svg${isPanning ? ' is-panning' : ''}${activeTool === 'line' ? ' has-line-cursor' : ''}${activeTool === 'dimension' ? ` has-dimension-cursor is-${dimensionPreselection?.kind ?? 'normal'}-target` : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch?.name ?? 'Drawing'} coordinate drawing canvas`}
            onMouseDown={handleDrawingMouseDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => { if (dimensionDrag) finishDimensionDrag(); else panHandlers.onPointerUp(event); }}
            onPointerCancel={(event) => { if (dimensionDrag) setDimensionDrag(null); else panHandlers.onPointerCancel(event); }}
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
              {activeSketch?.entityOrder.map((entityId) => activeSketch.entities[entityId]).filter((entity) => entity?.type === 'line').map((entity) => (
                <line key={entity.id} className={`drawing-line-entity${dimensionPreselection?.kind === 'line' && dimensionPreselection.lineId === entity.id ? ' is-dimension-preselected' : ''}`} x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} />
              ))}
              {activeTool === 'dimension' && dimensionPreselection?.kind === 'point' && <circle className="drawing-dimension-point-preselection" cx={activeSketch?.entities[dimensionPreselection.lineId]?.type === 'line' ? activeSketch.entities[dimensionPreselection.lineId][dimensionPreselection.point].x : 0} cy={activeSketch?.entities[dimensionPreselection.lineId]?.type === 'line' ? activeSketch.entities[dimensionPreselection.lineId][dimensionPreselection.point].y : 0} r={5 / pixelsPerMm} />}
              {dimensionTool.phase === 'acquiringReference' && dimensionTool.reference && activeSketch?.entities[dimensionTool.reference.entityId]?.type === 'line' && <circle className="drawing-dimension-point-selected" cx={activeSketch.entities[dimensionTool.reference.entityId][dimensionTool.reference.point].x} cy={activeSketch.entities[dimensionTool.reference.entityId][dimensionTool.reference.point].y} r={6 / pixelsPerMm} />}
            </g>
            <g className="drawing-dimension-layer" aria-label="Drawing dimensions">
              {[...displayedDimensions, ...(previewDimension ? [previewDimension] : [])].map((dimension) => {
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
            {editingDimension && editorAnchor && <foreignObject className="drawing-dimension-editor-frame" x={editorAnchor.x - editorWidth / 2} y={editorAnchor.y - DIMENSION_EDITOR_HEIGHT_PX + 2} width={editorWidth} height={DIMENSION_EDITOR_HEIGHT_PX}><input autoFocus className="drawing-dimension-editor" value={dimensionDraft} aria-label="Dimension value in millimetres" onChange={(event) => { setDimensionDraft(event.target.value); setDimensionEditError(null); }} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingDimensionId(null); setDimensionEditError(null); } if (event.key === 'Enter') { const parsed = parseLinearDimension(dimensionDraft); if (parsed === null) { setDimensionEditError('Dimension must be 0 mm or greater.'); return; } const result = solveDrawingDimensionEdit({ document, dimensionId: editingDimension.id, targetValue: parsed }); if (!result.ok) { setDimensionEditError(result.message); return; } transactDocument(() => result.document); setEditingDimensionId(null); setDimensionEditError(null); } }} /></foreignObject>}
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
