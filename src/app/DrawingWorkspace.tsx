import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction, type WheelEvent } from 'react';
import type { DrawingDocumentV1 } from './drawingTypes';
import { DRAWING_ORIGIN, getDrawingGridSpacing } from './drawingGrid';

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
  const activeSketch = document.sketches[document.activeSketchId];
  const gridSpacing = getDrawingGridSpacing(viewBox.width);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
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

  const zoom = (factor: number) => setViewBox((current) => {
    const width = Math.min(8000, Math.max(40, current.width / factor));
    const height = Math.min(6000, Math.max(30, current.height / factor));
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  });

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
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(Math.exp(-event.deltaY * 0.0015));
  };

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
                <path className="drawing-grid-line" d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`} />
              </pattern>
            </defs>
            <rect className="drawing-grid-plane" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#drawing-grid)" />
            <g className="drawing-coordinate-plane" aria-label="Drawing axes and origin">
              <line className="drawing-axis" x1={viewBox.x} y1={DRAWING_ORIGIN.y} x2={viewBox.x + viewBox.width} y2={DRAWING_ORIGIN.y} />
              <line className="drawing-axis" x1={DRAWING_ORIGIN.x} y1={viewBox.y} x2={DRAWING_ORIGIN.x} y2={viewBox.y + viewBox.height} />
              <circle className="drawing-origin" cx={DRAWING_ORIGIN.x} cy={DRAWING_ORIGIN.y} r={4} vectorEffect="non-scaling-stroke" />
              <text className="drawing-origin-label" x={DRAWING_ORIGIN.x + 7} y={DRAWING_ORIGIN.y - 7}>0</text>
              <text className="drawing-axis-label" x={viewBox.x + viewBox.width - 20} y={DRAWING_ORIGIN.y - 8}>X</text>
              <text className="drawing-axis-label" x={DRAWING_ORIGIN.x + 8} y={viewBox.y + 18}>Y</text>
            </g>
          </svg>
        </div>
      </section>
      <aside className="workflow-history-panel drawing-history panel" aria-label="Drawing history">
        <div className="workflow-history-items"><span className="workflow-history-label">History</span><p className="workflow-history-empty muted">Drawing history is not implemented.</p></div>
      </aside>
    </section>
  );
}
