import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import type { DrawingDocumentV1, DrawingPoint } from './drawingTypes';
import { appendEntityToActiveSketch, applyLineClick, cancelLineInteraction, EMPTY_LINE_INTERACTION, updateLinePreview, type LineToolInteraction } from './drawingLineTool';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisValues, zoomViewBoxAtPoint } from './drawingGrid';
import { clientToModelPoint, modelToOverlayPoint, type CoordinatePoint } from './drawingTransform';
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
  const [activeTool, setActiveTool] = useState<'select' | 'line'>('select');
  const [lineInteraction, setLineInteraction] = useState<LineToolInteraction>(EMPTY_LINE_INTERACTION);
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

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (activeTool === 'line') {
      const point = modelPointFromPointer(event);
      if (!point) return;
      const result = applyLineClick(lineInteraction, point, () => `line-${Date.now().toString(36)}-${++entitySequence.current}`);
      setLineInteraction(result.interaction);
      if (result.entity) setDocument((current) => appendEntityToActiveSketch(current, result.entity!));
      return;
    }
    if (event.target !== event.currentTarget) return;
    panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (activeTool === 'line') {
      const point = modelPointFromPointer(event);
      if (point) setLineInteraction((current) => updateLinePreview(current, point));
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
      if (event.key !== 'Escape' || activeTool !== 'line') return;
      if (lineInteraction.start) setLineInteraction(cancelLineInteraction());
      else setActiveTool('select');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, lineInteraction.start]);

  const selectTool = (tool: 'select' | 'line') => {
    setLineInteraction(cancelLineInteraction());
    setActiveTool(tool);
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
        <button type="button" className={activeTool === 'line' ? 'is-active' : ''} aria-pressed={activeTool === 'line'} onClick={() => selectTool('line')}>Line</button>
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
            className={`design-svg cad-viewport-interaction drawing-svg${isPanning ? ' is-panning' : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch?.name ?? 'Drawing'} coordinate drawing canvas`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
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
          </svg>
        </div>
      </section>
      <aside className="workflow-history-panel drawing-history panel" aria-label="Drawing history">
        <div className="workflow-history-items"><span className="workflow-history-label">History</span><p className="workflow-history-empty muted">Drawing history is not implemented.</p></div>
      </aside>
    </section>
  );
}
