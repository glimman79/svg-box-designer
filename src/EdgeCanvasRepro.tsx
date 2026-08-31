import { useEffect, useRef, useState, type ReactNode } from 'react';

const svgStyle = { width: '100%', height: 220, display: 'block', border: '1px solid #64748b', background: '#fff' } as const;
const sectionStyle = { marginBlock: 24, padding: 18, border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc' } as const;
const selectionRegionStyle = { padding: 18, border: '2px solid #94a3b8', borderRadius: 8, background: '#fff' } as const;
const nonSelectableRegionStyle = { ...selectionRegionStyle, WebkitUserSelect: 'none', userSelect: 'none' } as const;
const eventNames = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'selectionstart'] as const;

const describeNode = (node: Node | null) => {
  if (!node) return 'null';
  if (node.nodeType === Node.TEXT_NODE) return '#text';
  if (!(node instanceof Element)) return node.nodeName.toLowerCase();
  return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.classList.length ? `.${Array.from(node.classList).join('.')}` : ''}`;
};

type Readout = { target: string; elementFromPoint: string; path: string; selection: string; details: string };
const initialReadout: Readout = { target: '—', elementFromPoint: '—', path: '—', selection: 'collapsed; text: ""', details: 'Interact with this case.' };

function HitTargetCase({ id, title, description, children }: { id: string; title: string; description: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [readout, setReadout] = useState(initialReadout);
  const active = useRef(false);
  const update = (event?: Event) => {
    const selection = document.getSelection();
    const mouse = event instanceof MouseEvent ? event : null;
    const target = event?.target as Node | null;
    const elementAtPoint = mouse ? document.elementFromPoint(mouse.clientX, mouse.clientY) : null;
    setReadout({
      target: event ? describeNode(target) : readout.target,
      elementFromPoint: mouse ? describeNode(elementAtPoint) : readout.elementFromPoint,
      path: event ? event.composedPath().map((item) => item instanceof Node ? describeNode(item) : String(item)).join(' > ') : readout.path,
      selection: `${selection?.isCollapsed === false ? 'non-collapsed' : 'collapsed'}; ranges: ${selection?.rangeCount ?? 0}; text: ${JSON.stringify(selection?.toString() ?? '')}; anchor: ${describeNode(selection?.anchorNode ?? null)}:${selection?.anchorOffset ?? 0}; focus: ${describeNode(selection?.focusNode ?? null)}:${selection?.focusOffset ?? 0}`,
      details: event ? `${event.type}; x: ${mouse?.clientX ?? '—'}; y: ${mouse?.clientY ?? '—'}; button: ${mouse?.button ?? '—'}; detail: ${mouse?.detail ?? '—'}; defaultPrevented: ${event.defaultPrevented}` : 'selectionchange',
    });
  };
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const record = (event: Event) => { active.current = true; update(event); };
    const selectionChange = () => { if (active.current) update(); };
    eventNames.forEach((name) => root.addEventListener(name, record, true));
    document.addEventListener('selectionchange', selectionChange, true);
    return () => {
      eventNames.forEach((name) => root.removeEventListener(name, record, true));
      document.removeEventListener('selectionchange', selectionChange, true);
    };
  });
  return <section ref={ref} style={sectionStyle} data-edge-canvas-case={id}>
    <h2>{title}</h2><p>{description}</p>{children}
    <dl data-hit-target-readout style={{ marginTop: 10, padding: 10, background: '#e2e8f0', font: '12px/1.45 ui-monospace, monospace', overflowWrap: 'anywhere' }}>
      <dt>Last target:</dt><dd>{readout.target}</dd>
      <dt>Last elementFromPoint:</dt><dd>{readout.elementFromPoint}</dd>
      <dt>Selection:</dt><dd>{readout.selection}</dd>
      <dt>Composed path:</dt><dd>{readout.path}</dd>
      <dt>Event:</dt><dd>{readout.details}</dd>
    </dl>
  </section>;
}

function SelectionCase({ id, suppressed }: { id: 'selection-current' | 'selection-local-none'; suppressed: boolean }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [readout, setReadout] = useState(initialReadout);
  const [popup, setPopup] = useState('UNVERIFIED');
  const update = (event?: Event) => {
    const selection = document.getSelection();
    const mouse = event instanceof MouseEvent ? event : null;
    setReadout((previous) => ({
      target: event ? describeNode(event.target as Node | null) : previous.target,
      elementFromPoint: mouse ? describeNode(document.elementFromPoint(mouse.clientX, mouse.clientY)) : previous.elementFromPoint,
      path: event ? event.composedPath().map((item) => item instanceof Node ? describeNode(item) : String(item)).join(' > ') : previous.path,
      selection: `${selection?.isCollapsed === false ? 'non-collapsed' : 'collapsed'}; ranges: ${selection?.rangeCount ?? 0}; text: ${JSON.stringify(selection?.toString() ?? '')}; anchor: ${describeNode(selection?.anchorNode ?? null)}:${selection?.anchorOffset ?? 0}; focus: ${describeNode(selection?.focusNode ?? null)}:${selection?.focusOffset ?? 0}`,
      details: event ? `${event.type}; defaultPrevented: ${event.defaultPrevented}` : 'selectionchange',
    }));
  };
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    let active = false;
    const record = (event: Event) => { active = true; update(event); };
    const selectionChange = () => { if (active) update(); };
    eventNames.forEach((name) => region.addEventListener(name, record, true));
    document.addEventListener('selectionchange', selectionChange, true);
    return () => {
      eventNames.forEach((name) => region.removeEventListener(name, record, true));
      document.removeEventListener('selectionchange', selectionChange, true);
    };
  }, []);
  const title = suppressed ? 'Case B — Local non-selectable CAD viewport' : 'Case A — Current selectable viewport';
  return <section style={sectionStyle} data-edge-selection-case={id}>
    <div ref={regionRef} data-selection-test-region style={suppressed ? nonSelectableRegionStyle : selectionRegionStyle}>
      <h2>{title}</h2>
      <p>Nearby viewport text: CAD canvas selection baseline. Double-click empty SVG space.</p>
      <SimpleSvg label={title} />
    </div>
    <aside data-selection-diagnostics aria-label={`${title} diagnostics`} style={{ marginTop: 12, padding: 10, background: '#e2e8f0', font: '12px/1.45 ui-monospace, monospace', overflowWrap: 'anywhere' }}>
      <strong>Diagnostic readout (outside selection-test region)</strong>
      <dl data-hit-target-readout>
        <dt>Last target:</dt><dd>{readout.target}</dd>
        <dt>Last elementFromPoint:</dt><dd>{readout.elementFromPoint}</dd>
        <dt>Selection:</dt><dd>{readout.selection}</dd>
        <dt>Composed path:</dt><dd>{readout.path}</dd>
        <dt>Event:</dt><dd>{readout.details}</dd>
        <dt>Popup observed by user:</dt><dd><select value={popup} onChange={(event) => setPopup(event.target.value)} aria-label={`${title} popup result`}><option>UNVERIFIED</option><option>YES</option><option>NO</option></select></dd>
      </dl>
    </aside>
  </section>;
}

const SimpleSvg = ({ label, children }: { label: string; children?: ReactNode }) => <svg width="800" height="400" viewBox="0 0 800 400" style={svgStyle} aria-label={label}>{children}</svg>;
const line = <line x1="100" y1="190" x2="700" y2="70" stroke="#0f766e" strokeWidth="5" />;

export default function EdgeCanvasRepro() {
  const [caseBCount, setCaseBCount] = useState(0);
  return <main style={{ maxWidth: 900, margin: '32px auto', padding: 24, color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
    <h1>Microsoft Edge CAD canvas selection repro</h1>
    <p>Development-only A/B cases test browser text selection as the leading hypothesis. The older hit-target cases remain below as secondary diagnostics.</p>

    <SelectionCase id="selection-current" suppressed={false} />
    <SelectionCase id="selection-local-none" suppressed />

    <HitTargetCase id="A" title="Case A — Empty root SVG" description="Baseline: no child and no dblclick handler."><SimpleSvg label="Case A empty root SVG" /></HitTargetCase>
    <HitTargetCase id="B" title="Case B — Root SVG + dblclick" description={<>Baseline handler count: <output>{caseBCount}</output>.</>}><svg width="800" height="400" viewBox="0 0 800 400" style={svgStyle} aria-label="Case B root SVG dblclick" onDoubleClick={() => setCaseBCount((count) => count + 1)} /></HitTargetCase>
    <HitTargetCase id="C1-C2" title="Cases C1/C2 — SVG line: empty area vs direct hit" description="Use the same SVG: double-click beside the line, then directly on its painted stroke."><SimpleSvg label="Cases C1 and C2 SVG line comparison">{line}</SimpleSvg></HitTargetCase>
    <HitTargetCase id="C3" title="Case C3 — Line pointer-events none" description="The visible line cannot become the hit target."><SimpleSvg label="Case C3 pointer transparent SVG line"><line x1="100" y1="190" x2="700" y2="70" stroke="#0f766e" strokeWidth="5" pointerEvents="none" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="C4-transparent-stroke" title="Case C4a — Transparent stroke hit line" description="A visible pointer-transparent line is paired with a wider transparent-stroke hit line."><SimpleSvg label="Case C4 transparent stroke hit line"><g pointerEvents="none">{line}</g><line data-hit-line="transparent-stroke" x1="100" y1="190" x2="700" y2="70" stroke="transparent" strokeWidth="24" pointerEvents="stroke" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="C4-stroke-opacity" title="Case C4b — stroke-opacity zero hit line" description="The wide line has stroke-opacity 0 and pointer-events stroke."><SimpleSvg label="Case C4 stroke opacity hit line"><g pointerEvents="none">{line}</g><line data-hit-line="stroke-opacity" x1="100" y1="190" x2="700" y2="70" stroke="#0f766e" strokeOpacity="0" strokeWidth="24" pointerEvents="stroke" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="C4-opacity" title="Case C4c — opacity zero hit line" description="The wide line has opacity 0 and pointer-events stroke."><SimpleSvg label="Case C4 opacity hit line"><g pointerEvents="none">{line}</g><line data-hit-line="opacity" x1="100" y1="190" x2="700" y2="70" stroke="#0f766e" opacity="0" strokeWidth="24" pointerEvents="stroke" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="C4-none" title="Case C4d — Invisible hit line pointer-events none" description="Control: the same invisible wide line is not hit-testable."><SimpleSvg label="Case C4 pointer transparent invisible line">{line}<line data-hit-line="none" x1="100" y1="190" x2="700" y2="70" stroke="transparent" strokeWidth="24" pointerEvents="none" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="D1" title="Case D1 — SVG rect" description="Compare empty area with the filled rectangle."><SimpleSvg label="Case D1 SVG rect"><rect x="270" y="70" width="260" height="150" fill="#bfdbfe" stroke="#2563eb" strokeWidth="4" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="D2" title="Case D2 — SVG circle" description="Compare empty area with the circle."><SimpleSvg label="Case D2 SVG circle"><circle cx="400" cy="145" r="80" fill="#ccfbf1" stroke="#0f766e" strokeWidth="4" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="D3" title="Case D3 — SVG path" description="The path paints the same diagonal as the line case."><SimpleSvg label="Case D3 SVG path"><path d="M 100 190 L 700 70" fill="none" stroke="#7c3aed" strokeWidth="5" /></SimpleSvg></HitTargetCase>
    <HitTargetCase id="E1" title="Case E1 — SVG text pointer-active" description="Double-click 100 directly."><SimpleSvg label="Case E1 pointer active SVG text"><text x="400" y="155" fontSize="42" textAnchor="middle">100</text></SimpleSvg></HitTargetCase>
    <HitTargetCase id="E2" title="Case E2 — SVG text pointer-events none" description="The same visible text passes hit testing to the root SVG."><SimpleSvg label="Case E2 pointer transparent SVG text"><text x="400" y="155" fontSize="42" textAnchor="middle" pointerEvents="none">100</text></SimpleSvg></HitTargetCase>
    <HitTargetCase id="F1" title="Case F1 — HTML overlay pointer-active" description="Double-click the overlay text directly."><div style={{ position: 'relative' }}><SimpleSvg label="Case F1 SVG under HTML overlay" /><div data-repro-html-overlay="active" style={{ position: 'absolute', top: 65, left: 320, padding: 14, background: '#fff', border: '1px solid #94a3b8' }}>Active Tool: Line</div></div></HitTargetCase>
    <HitTargetCase id="F2" title="Case F2 — HTML overlay pointer-events none" description="The same visual overlay passes hit testing through to the SVG."><div style={{ position: 'relative' }}><SimpleSvg label="Case F2 SVG under pointer transparent HTML overlay" /><div data-repro-html-overlay="none" style={{ position: 'absolute', top: 65, left: 320, padding: 14, background: '#fff', border: '1px solid #94a3b8', pointerEvents: 'none' }}>Active Tool: Line</div></div></HitTargetCase>
  </main>;
}
