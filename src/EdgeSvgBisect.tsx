import { useState, type ReactNode } from 'react';

type BisectCase = { id: number; label: string; content: ReactNode; direct?: boolean; countDblclick?: boolean };

const pattern = (id: string, withPath: boolean) => <defs><pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">{withPath && <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" />}</pattern></defs>;
const line = (pointerEvents?: 'none') => <line x1="50" y1="20" x2="50" y2="80" stroke="#0f766e" strokeWidth="2" pointerEvents={pointerEvents} />;

const cases: BisectCase[] = [
  { id: 0, label: 'Empty SVG', content: null },
  { id: 1, label: 'Empty SVG + dblclick', content: null, countDblclick: true },
  { id: 2, label: 'Empty g', content: <g /> },
  { id: 3, label: 'defs only', content: <defs /> },
  { id: 4, label: 'empty pattern', content: pattern('p4', false) },
  { id: 5, label: 'unused pattern path', content: pattern('p5', true) },
  { id: 6, label: 'pattern + full rect', content: <>{pattern('p6', true)}<rect width="100%" height="100%" fill="url(#p6)" /></> },
  { id: 7, label: 'solid full rect', content: <rect width="100%" height="100%" fill="#e2e8f0" /> },
  { id: 8, label: 'full rect pointer-events none', content: <rect width="100%" height="100%" fill="#e2e8f0" pointerEvents="none" /> },
  { id: 9, label: 'line', content: line(), direct: true },
  { id: 10, label: 'line pointer-events none', content: line('none'), direct: true },
  { id: 11, label: 'path', content: <path d="M 50 20 L 50 80" fill="none" stroke="#0f766e" strokeWidth="2" />, direct: true },
  { id: 12, label: 'circle', content: <circle cx="50" cy="50" r="12" fill="#99f6e4" stroke="#0f766e" />, direct: true },
  { id: 13, label: 'SVG text', content: <text x="50" y="50" textAnchor="middle" dominantBaseline="middle">100</text>, direct: true },
  { id: 14, label: 'axis group', content: <g><line x1="15" y1="50" x2="85" y2="50" stroke="#0f766e" /><line x1="50" y1="15" x2="50" y2="85" stroke="#0f766e" /></g>, direct: true },
  { id: 15, label: 'grid + axes', content: <>{pattern('p15', true)}<rect width="100%" height="100%" fill="url(#p15)" /><g><line x1="15" y1="50" x2="85" y2="50" stroke="#0f766e" /><line x1="50" y1="15" x2="50" y2="85" stroke="#0f766e" /></g></> },
];

const pageStyle = { maxWidth: 720, margin: '24px auto', padding: 16, color: '#0f172a', fontFamily: 'system-ui, sans-serif' } as const;
const caseStyle = { marginBlock: 18 } as const;
const frameStyle = { position: 'relative', marginTop: 5 } as const;
const svgStyle = { width: '100%', height: 180, display: 'block', border: '1px solid #64748b', background: '#fff' } as const;
const markerStyle = { position: 'absolute', width: 10, height: 10, margin: -5, border: '2px solid #dc2626', borderRadius: '50%', pointerEvents: 'none' } as const;

function Result({ name }: { name: string }) {
  const [result, setResult] = useState('—');
  return <label style={{ marginRight: 12, fontSize: 12 }}>{name} popup:{' '}
    <select aria-label={`${name} popup`} value={result} onChange={(event) => setResult(event.target.value)}>
      <option>—</option><option>YES</option><option>NO</option>
    </select>
  </label>;
}

function BisectCaseFrame({ testCase }: { testCase: BisectCase }) {
  const [count, setCount] = useState(0);
  return <section className="edge-bisect-case" style={caseStyle} data-edge-bisect-case={testCase.id}>
    <div className="case-label"><strong>{testCase.id} {testCase.label}</strong>{testCase.countDblclick && <> · count <output>{count}</output></>}</div>
    <div style={frameStyle}>
      <svg className="edge-bisect-svg" viewBox="0 0 100 100" style={svgStyle} onDoubleClick={testCase.countDblclick ? () => setCount((value) => value + 1) : undefined}>{testCase.content}</svg>
      <span aria-hidden="true" title="EMPTY AREA" style={{ ...markerStyle, left: '75%', top: '50%' }} />
      {testCase.direct && <span aria-hidden="true" title="DIRECT ELEMENT" style={{ ...markerStyle, left: '50%', top: '50%', borderColor: '#2563eb' }} />}
    </div>
    <Result name="Empty area" />{testCase.direct && <Result name="Direct element" />}
  </section>;
}

export default function EdgeSvgBisect() {
  return <main style={pageStyle}>
    <h1 style={{ fontSize: 20 }}>Edge SVG structure bisect</h1>
    <p style={{ fontSize: 12 }}>Red: EMPTY AREA · Blue: DIRECT ELEMENT</p>
    {cases.map((testCase) => <BisectCaseFrame key={testCase.id} testCase={testCase} />)}
  </main>;
}
