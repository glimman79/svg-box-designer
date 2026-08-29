import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction, type WheelEvent } from 'react';
import type { DrawingDocumentV1 } from './drawingTypes';
import { DRAWING_ORIGIN, getAxisLabelInterval, getDrawingGridHierarchy, getDrawingGridSpacing, getVisibleAxisLabels, zoomViewBoxAtPoint } from './drawingGrid';

export type DrawingViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; clientX: number; clientY: number };

export const initialDrawingViewBox: DrawingViewBox = { x: -400, y: -300, width: 800, height: 600 };
const formatViewBox = ({ x, y, width, height }: DrawingViewBox) => `${x} ${y} ${width} ${height}`;

export function DrawingWorkspace({
  document,
  viewBox,
  setViewBox,
}: {
  document: DrawingDocumentV1;
  viewBox: DrawingViewBox;
  setViewBox: Dispatch<SetStateAction<DrawingViewBox>>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
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

  const zoom = (factor: number, anchor?: { x: number; y: number }) => setViewBox((current) => zoomViewBoxAtPoint(current, factor, anchor ?? {
    x: current.x + current.width / 2,
    y: current.y + current.height / 2,
  }));

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
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

  const endPan = (event: PointerEvent<SVGSVGElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: viewBox.x + (event.clientX - bounds.left) / bounds.width * viewBox.width,
      y: viewBox.y + (event.clientY - bounds.top) / bounds.height * viewBox.height,
    };
    zoom(Math.exp(-event.deltaY * 0.0015), anchor);
  };

  const pixelsPerMm = viewport.width / viewBox.width;
  const labelInterval = getAxisLabelInterval(gridSpacing, pixelsPerMm);
  const xLabels = getVisibleAxisLabels(viewBox.x, viewBox.x + viewBox.width, labelInterval, viewport.width);
  const yLabels = getVisibleAxisLabels(viewBox.y, viewBox.y + viewBox.height, labelInterval, viewport.height);
  const originScreenX = (DRAWING_ORIGIN.x - viewBox.x) / viewBox.width * viewport.width;
  const originScreenY = (DRAWING_ORIGIN.y - viewBox.y) / viewBox.height * viewport.height;
  return (
    <section className="drawing-workspace workspace-shell" aria-label="2D Drawing workspace">
      <aside className="drawing-tool-sidebar" aria-label="Drawing tools">
        <span className="drawing-tool-placeholder">Tools</span>
      </aside>
      <section className="canvas-card drawing-canvas-card workspace-canvas">
        <div className="canvas-frame">
          <div className="drawing-status" aria-live="polite">
            <strong>{activeSketch.name}</strong><span>Unit: {document.unit}</span><span>Grid: {gridSpacing} mm</span>
          </div>
          <div className="canvas-zoom-controls" aria-label="Drawing canvas zoom controls">
            <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setViewBox(initialDrawingViewBox)}>Fit</button>
          </div>
          <svg
            ref={svgRef}
            className={`design-svg drawing-svg${isPanning ? ' is-panning' : ''}`}
            viewBox={formatViewBox(viewBox)}
            role="img"
            aria-label={`${activeSketch.name} coordinate drawing canvas`}
            onWheel={handleWheel}
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
          </svg>
          <svg className="drawing-label-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="Model coordinate scale">
            {originScreenY >= 0 && originScreenY <= viewport.height && xLabels.filter(({ value }) => value !== 0).map((label) => (
              <text className="drawing-coordinate-label drawing-x-coordinate" data-label-side="below" key={`x-${label.value}`} x={label.screenPosition} y={originScreenY + 15} textAnchor="middle">{label.value}</text>
            ))}
            {originScreenX >= 0 && originScreenX <= viewport.width && yLabels.filter(({ value }) => value !== 0).map((label) => (
              <text className="drawing-coordinate-label drawing-y-coordinate" data-label-side="right" key={`y-${label.value}`} x={originScreenX + 6} y={label.screenPosition + 4}>{label.value}</text>
            ))}
            {originScreenX >= 0 && originScreenX <= viewport.width && originScreenY >= 0 && originScreenY <= viewport.height && <>
              <circle className="drawing-origin-screen" cx={originScreenX} cy={originScreenY} r="3.5" />
              <text className="drawing-origin-label" x={originScreenX + 7} y={originScreenY - 7}>0</text>
            </>}
            {originScreenY >= 0 && originScreenY <= viewport.height && <text className="drawing-axis-letter drawing-x-indicator" x={viewport.width - 15} y={originScreenY - 7}>X</text>}
            {originScreenX >= 0 && originScreenX <= viewport.width && <text className="drawing-axis-letter drawing-y-indicator" x={originScreenX + 7} y="15">Y</text>}
          </svg>
        </div>
      </section>
      <aside className="workflow-history-panel drawing-history panel" aria-label="Drawing history">
        <div className="workflow-history-items"><span className="workflow-history-label">History</span><p className="workflow-history-empty muted">Drawing history is not implemented.</p></div>
      </aside>
    </section>
  );
}
