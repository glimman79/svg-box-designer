import { useState } from 'react';

const svgStyle = { width: '100%', height: 260, display: 'block', border: '1px solid #64748b', background: '#fff' } as const;
const sectionStyle = { marginBlock: 28, padding: 18, border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc' } as const;

export default function EdgeCanvasRepro() {
  const [case2Count, setCase2Count] = useState(0);
  const [case6Count, setCase6Count] = useState(0);

  return (
    <main style={{ maxWidth: 900, margin: '32px auto', padding: 24, color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Microsoft Edge drawing canvas repro</h1>
      <p>This development-only page isolates six SVG canvas structures. Double-click each target and record whether Edge opens Copilot / Mini Menu.</p>

      <section style={sectionStyle} data-edge-canvas-case="1">
        <h2>Case 1 — Empty SVG</h2>
        <p>No handler, content, overlay, or selection CSS.</p>
        <svg width="800" height="500" style={svgStyle} aria-label="Case 1 empty SVG" />
      </section>

      <section style={sectionStyle} data-edge-canvas-case="2">
        <h2>Case 2 — SVG with dblclick handler</h2>
        <p>The handler only increments this counter: <output>{case2Count}</output></p>
        <svg width="800" height="500" style={svgStyle} aria-label="Case 2 SVG dblclick" onDoubleClick={() => setCase2Count((count) => count + 1)} />
      </section>

      <section style={sectionStyle} data-edge-canvas-case="3">
        <h2>Case 3 — SVG with simple line</h2>
        <p>Geometry only; no text, handler, or overlay.</p>
        <svg width="800" height="500" style={svgStyle} aria-label="Case 3 SVG geometry"><line x1="90" y1="190" x2="710" y2="70" stroke="#0f766e" strokeWidth="3" /></svg>
      </section>

      <section style={sectionStyle} data-edge-canvas-case="4">
        <h2>Case 4 — SVG with SVG text</h2>
        <p>Double-click both the number and empty space.</p>
        <svg width="800" height="500" style={svgStyle} aria-label="Case 4 SVG text"><text x="390" y="135" fontSize="28" textAnchor="middle">100</text></svg>
      </section>

      <section style={sectionStyle} data-edge-canvas-case="5">
        <h2>Case 5 — SVG + absolute HTML overlay</h2>
        <p>The non-editable HTML text participates in hit testing.</p>
        <div style={{ position: 'relative' }}>
          <svg width="800" height="500" style={svgStyle} aria-label="Case 5 SVG under HTML overlay" />
          <div data-repro-html-overlay style={{ position: 'absolute', top: 28, left: 28, zIndex: 2, padding: '10px 14px', background: '#fff', border: '1px solid #94a3b8' }}>Active Tool: Line</div>
        </div>
      </section>

      <section style={sectionStyle} data-edge-canvas-case="6">
        <h2>Case 6 — Drawing-like canvas shell</h2>
        <p>Structural shell only. Double-click counter: <output>{case6Count}</output></p>
        <div data-repro-viewport style={{ position: 'relative', overflow: 'hidden', border: '1px solid #64748b', background: '#fff' }}>
          <div style={{ position: 'absolute', zIndex: 3, top: 12, left: 72, pointerEvents: 'none' }}>Active Tool: Line</div>
          <svg width="800" height="500" style={{ width: '100%', height: 260, display: 'block' }} viewBox="0 0 800 500" aria-label="Case 6 Drawing-like SVG" onDoubleClick={() => setCase6Count((count) => count + 1)}>
            <line x1="0" y1="250" x2="800" y2="250" stroke="#64748b" />
            <line x1="400" y1="0" x2="400" y2="500" stroke="#64748b" />
          </svg>
          <svg data-repro-label-overlay style={{ position: 'absolute', inset: 0, zIndex: 2, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 800 500" aria-label="Case 6 coordinate overlay">
            <text x="410" y="240">0</text><text x="770" y="240">X</text><text x="410" y="25">Y</text>
          </svg>
        </div>
      </section>
    </main>
  );
}
