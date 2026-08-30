import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import type { DrawingDocumentV1, DrawingPoint } from './drawingTypes';
import { appendEntityToActiveSketch, applyResolvedLineClick, cancelLineInteraction, EMPTY_LINE_INTERACTION, resolveLinePreviewPoint, updateLinePreviewAtEffectivePoint, type LineToolInteraction } from './drawingLineTool';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisValues, zoomViewBoxAtPoint } from './drawingGrid';
import { clientToModelPoint, modelToOverlayPoint, type CoordinatePoint } from './drawingTransform';
import { collectDrawingInferenceCandidates } from './drawingInference';
import { resolveDrawingSnap, type DrawingSnap } from './drawingSnapEngine';
import { nextDrawingTool, type DrawingActiveTool } from './drawingToolLifecycle';
import { useCadWheelCapture } from './useCadWheelCapture';

export type DrawingViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; clientX: number; clientY: number };
type CoordinateOverlayGeometry = {
  origin: CoordinatePoint;
  xLabels: Array<{ value: number; anchor: CoordinatePoint }>;
  yLabels: Array<{ value: number; anchor: CoordinatePoint }>;
  xIndicatorAnchor: CoordinatePoint;
  yIndicatorAnchor: CoordinatePoint;
};
type CadCursorPresentation = Readonly<{ anchor: CoordinatePoint; snap: DrawingSnap }> | null;

export const initialDrawingViewBox: DrawingViewBox = { x: -400, y: -300, width: 800, height: 600 };
const formatViewBox = ({ x, y, width, height }: DrawingViewBox) => `${x} ${y} ${width} ${height}`;

export function DrawingWorkspace({
  document,
  setDocument,
  viewBox,
  setViewBox,
}: {
  document: DrawingDocumentV1;
  setDocument: Dispatch<SetStateAction<DrawingDocumentV1>>;
  viewBox: DrawingViewBox;
  setViewBox: Dispatch<SetStateAction<DrawingViewBox>>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [overlayGeometry, setOverlayGeometry] = useState<CoordinateOverlayGeometry | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingActiveTool>('select');
  const [lineInteraction, setLineInteraction] = useState<LineToolInteraction>(EMPTY_LINE_INTERACTION);
  const [cadCursor, setCadCursor] = useState<CadCursorPresentation>(null);
  const lineCursor = cadCursor; // Line is currently the sole consumer of the shared CAD cursor.
  const [drawingSnap, setDrawingSnap] = useState<DrawingSnap | null>(null);
  const [ctrlOverride, setCtrlOverride] = useState(false);
  const lastPointerClientRef = useRef<CoordinatePoint | null>(null);
  const pendingLineClickRef = useRef<number | null>(null);
  const activeToolRef = useRef<DrawingActiveTool>(activeTool);
  const resolvePlacementRef = useRef<(clientPoint: CoordinatePoint, ctrlHeld: boolean) => void>(() => undefined);
  const entitySequence = useRef(0);
  const activeSketch = document.sketches[document.activeSketchId];
  const gridSpacing = getDrawingGridSpacing(viewBox.width);
  const gridHierarchy = getDrawingGridHierarchy(gridSpacing);

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

  const modelPointFromPointer = (event: PointerEvent<SVGSVGElement>): DrawingPoint | null => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? clientToModelPoint({ x: event.clientX, y: event.clientY }, matrix) : null;
  };

  const resolvePlacement = (clientPoint: CoordinatePoint, ctrlHeld: boolean) => {
    const drawingTransform = svgRef.current?.getScreenCTM();
    const overlayTransform = overlaySvgRef.current?.getScreenCTM();
    if (!drawingTransform || !overlayTransform) return;
    const rawPoint = clientToModelPoint(clientPoint, drawingTransform);
    if (!rawPoint) return;
    const committedLines = activeSketch?.entityOrder.map((id) => activeSketch.entities[id]).filter((entity) => entity?.type === 'line') ?? [];
    const candidates = collectDrawingInferenceCandidates(clientPoint, committedLines, drawingTransform);
    const snap = resolveDrawingSnap({ rawPoint, candidates, previousSnap: drawingSnap, ctrlOverride: ctrlHeld });
    const toolPoint = snap.active || !lineInteraction.start
      ? snap.effectivePoint
      : resolveLinePreviewPoint(lineInteraction.start, rawPoint).effectivePreviewPoint;
    // D2.2b equivalent was: placementPoint = nextInteraction.effectivePreviewPoint ?? point.
    const placementPoint = toolPoint;
    const nextInteraction = snap.active
      ? updateLinePreviewAtEffectivePoint(lineInteraction, rawPoint, toolPoint)
      : lineInteraction.start ? { ...lineInteraction, ...resolveLinePreviewPoint(lineInteraction.start, rawPoint) } : lineInteraction;
    const anchor = modelToOverlayPoint(placementPoint, drawingTransform, overlayTransform);
    setDrawingSnap(snap);
    setLineInteraction(nextInteraction);
    setCadCursor(anchor ? { anchor, snap } : null);
  };
  activeToolRef.current = activeTool;
  resolvePlacementRef.current = resolvePlacement;

  const commitLinePoint = (point: DrawingPoint) => {
    const result = applyResolvedLineClick(lineInteraction, point, () => `line-${Date.now().toString(36)}-${++entitySequence.current}`);
    setLineInteraction(result.interaction);
    if (result.entity) setDocument((current) => appendEntityToActiveSketch(current, result.entity!));
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (activeTool === 'line') {
      const point = modelPointFromPointer(event);
      if (!point) return;
      if (event.detail > 1) return;
      const effectivePoint = drawingSnap?.effectivePoint ?? point;
      if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
      pendingLineClickRef.current = window.setTimeout(() => {
        pendingLineClickRef.current = null;
        commitLinePoint(effectivePoint);
      }, 220);
      return;
    }
    panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (activeTool === 'line') {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      resolvePlacement(lastPointerClientRef.current, event.ctrlKey || ctrlOverride);
      return;
    }
    const pan = panStateRef.current;
    const matrix = svgRef.current?.getScreenCTM();
    if (!pan || pan.pointerId !== event.pointerId || !matrix) return;
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    if (scaleX === 0 || scaleY === 0) return;
    const dx = event.clientX - pan.clientX;
    const dy = event.clientY - pan.clientY;
    pan.clientX = event.clientX;
    pan.clientY = event.clientY;
    setViewBox((current) => ({ ...current, x: current.x - dx / scaleX, y: current.y - dy / scaleY }));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control') {
        setCtrlOverride(true);
        if (lastPointerClientRef.current) resolvePlacementRef.current(lastPointerClientRef.current, true);
      }
      if (event.key !== 'Escape' || activeToolRef.current !== 'line') return;
      if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
      pendingLineClickRef.current = null;
      setLineInteraction(cancelLineInteraction());
      setDrawingSnap(null);
      setCadCursor(null);
      setActiveTool((current) => nextDrawingTool(current, 'deactivate'));
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control') return;
      setCtrlOverride(false);
      if (lastPointerClientRef.current && activeToolRef.current === 'line') resolvePlacementRef.current(lastPointerClientRef.current, false);
    };
    const handleBlur = () => { setCtrlOverride(false); if (lastPointerClientRef.current && activeToolRef.current === 'line') resolvePlacementRef.current(lastPointerClientRef.current, false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
    };
  }, []);

  const selectTool = (tool: DrawingActiveTool) => {
    if (tool === activeTool) return;
    setLineInteraction(cancelLineInteraction());
    setDrawingSnap(null);
    setCadCursor(null);
    setActiveTool((current) => nextDrawingTool(current, 'activate', tool));
  };

  const clearCadCursor = () => { lastPointerClientRef.current = null; setCadCursor(null); setDrawingSnap(null); };
  const clearLineCursor = clearCadCursor;

  const finishLine = (deactivate: boolean) => {
    if (pendingLineClickRef.current !== null) window.clearTimeout(pendingLineClickRef.current);
    pendingLineClickRef.current = null;
    setLineInteraction(cancelLineInteraction());
    setDrawingSnap(null);
    setCadCursor(null);
    if (deactivate) setActiveTool((current) => nextDrawingTool(current, 'deactivate'));
  };

  const endPan = (event: PointerEvent<SVGSVGElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

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
      <aside className="drawing-tool-sidebar" aria-label="Drawing tools">
        <span className="drawing-tool-placeholder">Tools</span>
        <button type="button" className={activeTool === 'line' ? 'is-active' : ''} aria-pressed={activeTool === 'line'} onClick={() => selectTool('line')} onDoubleClick={() => activeTool === 'line' ? finishLine(false) : selectTool('line')}>Line</button>
        <button type="button" className={activeTool === 'select' ? 'is-active' : ''} aria-pressed={activeTool === 'select'} onClick={() => selectTool('select')}>Select</button>
      </aside>
      <section className="canvas-card drawing-canvas-card workspace-canvas">
        <div className="canvas-frame">
          <div className="drawing-status" aria-live="polite">
            <strong>{activeSketch?.name ?? 'No active sketch'}</strong><span>Unit: {document.unit}</span><span>Grid: {gridSpacing} mm</span><span>Active Tool: {activeTool === 'line' ? 'Line' : 'Select'}</span>
          </div>
          <div className="canvas-zoom-controls" aria-label="Drawing canvas zoom controls">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setViewBox(initialDrawingViewBox)}>Fit</button>
          </div>
          <svg
            ref={svgRef}
            className={`design-svg cad-viewport-interaction drawing-svg${isPanning ? ' is-panning' : ''}${activeTool === 'line' ? ' has-line-cursor' : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch?.name ?? 'Drawing'} coordinate drawing canvas`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onPointerLeave={clearLineCursor}
            onDoubleClick={() => { if (activeTool === 'line') finishLine(true); }}
          >
            <defs>
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
                <line key={entity.id} className="drawing-line-entity" x1={entity.start.x} y1={entity.start.y} x2={entity.end.x} y2={entity.end.y} />
              ))}
            </g>
            {activeTool === 'line' && lineInteraction.start && lineInteraction.effectivePreviewPoint && (
              <line className={`drawing-line-preview${lineInteraction.snapActive ? ' is-angular-snapped' : ''}`} x1={lineInteraction.start.x} y1={lineInteraction.start.y} x2={lineInteraction.effectivePreviewPoint.x} y2={lineInteraction.effectivePreviewPoint.y} />
            )}
          </svg>
          <svg ref={overlaySvgRef} className="drawing-label-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="Model coordinate scale">
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
              <g className="drawing-line-cursor drawing-cad-cursor" data-inference={lineCursor.snap.type} transform={`translate(${lineCursor.anchor.x} ${lineCursor.anchor.y})`} aria-hidden="true">
                <line className="drawing-line-cursor-arm" data-arm="left" x1="-22" y1="0" x2="-7" y2="0" />
                <line className="drawing-line-cursor-arm" data-arm="right" x1="7" y1="0" x2="22" y2="0" />
                <line className="drawing-line-cursor-arm" data-arm="top" x1="0" y1="-22" x2="0" y2="-7" />
                <line className="drawing-line-cursor-arm" data-arm="bottom" x1="0" y1="7" x2="0" y2="22" />
                {lineCursor.snap.type === 'none' && <circle className="drawing-line-cursor-dot" cx="0" cy="0" r="2.5" />}
                {lineCursor.snap.type === 'endpoint' && <circle className="drawing-line-cursor-endpoint" cx="0" cy="0" r="5.5" />}
                {lineCursor.snap.type === 'line' && <path className="drawing-line-cursor-line" d="M 0 -6 L 6 5 L -6 5 Z" />}
              </g>
            )}
          </svg>
        </div>
      </section>
      <aside className="workflow-history-panel drawing-history panel" aria-label="Drawing history">
        <div className="workflow-history-items"><span className="workflow-history-label">History</span><p className="workflow-history-empty muted">Drawing history is not implemented.</p></div>
      </aside>
    </section>
  );
}
