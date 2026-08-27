import { useRef, useState, type Dispatch, type PointerEvent, type SetStateAction, type WheelEvent } from 'react';
import type { DrawingDocumentV1 } from './drawingTypes';

export type DrawingViewBox = { x: number; y: number; width: number; height: number };
type PanState = { pointerId: number; clientX: number; clientY: number };

export const initialDrawingViewBox: DrawingViewBox = { x: 0, y: 0, width: 800, height: 600 };
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
    <section className="drawing-workspace" aria-label="2D Drawing workspace">
      <aside className="drawing-tool-sidebar" aria-label="Drawing tools">
        <span className="drawing-tool-placeholder">Tools</span>
      </aside>
      <aside className="drawing-info-panel panel">
        <p className="eyebrow">2D Drawing</p>
        <h2>{activeSketch.name}</h2>
        <p className="muted">Drawing tools will be added in the next step.</p>
        <dl className="drawing-document-summary">
          <dt>Unit</dt><dd>{document.unit}</dd>
          <dt>Sketches</dt><dd>{document.sketchOrder.length}</dd>
        </dl>
      </aside>
      <section className="canvas-card drawing-canvas-card">
        <div className="canvas-frame">
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
            aria-label={`Empty ${activeSketch.name} drawing canvas`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          />
        </div>
      </section>
    </section>
  );
}
