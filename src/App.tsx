import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { exportLabeledSvg, midpoint, parseSvgDocument } from './svgUtils';
import type { SvgDocumentModel } from './svgUtils';

type LabelPrefix = 'E' | 'S' | 'C' | 'P';

const labelPrefixes: Array<{ prefix: LabelPrefix; description: string }> = [
  { prefix: 'E', description: 'Edge labels' },
  { prefix: 'S', description: 'Slot placeholders' },
  { prefix: 'C', description: 'Connector placeholders' },
  { prefix: 'P', description: 'Pattern placeholders' },
];

const starterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
  <rect x="70" y="45" width="280" height="170" rx="0" fill="#f8fafc" stroke="#334155" stroke-width="4"/>
  <line x1="70" y1="130" x2="350" y2="130" stroke="#94a3b8" stroke-width="3" stroke-dasharray="10 8"/>
</svg>`;

function App() {
  const [svgModel, setSvgModel] = useState<SvgDocumentModel>(() => parseSvgDocument(starterSvg));
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const labelCounts = useMemo(() => {
    return Object.values(labels).reduce<Record<LabelPrefix, number>>(
      (counts, label) => {
        const prefix = label.charAt(0) as LabelPrefix;
        if (prefix in counts) {
          counts[prefix] += 1;
        }
        return counts;
      },
      { E: 0, S: 0, C: 0, P: 0 },
    );
  }, [labels]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsedSvg = parseSvgDocument(text);
    setSvgModel(parsedSvg);
    setLabels({});
    setSelectedEdgeId(null);
    setErrorMessage('');
    event.target.value = '';
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => {
    handleImport(event).catch((error: Error) => {
      setErrorMessage(error.message);
    });
  };

  const assignLabel = (prefix: LabelPrefix) => {
    if (!selectedEdgeId) {
      setErrorMessage('Select a straight edge before assigning a label.');
      return;
    }

    setLabels((currentLabels) => ({
      ...currentLabels,
      [selectedEdgeId]: `${prefix}${labelCounts[prefix] + 1}`,
    }));
    setErrorMessage('');
  };

  const clearSelectedLabel = () => {
    if (!selectedEdgeId) {
      return;
    }

    setLabels((currentLabels) => {
      const nextLabels = { ...currentLabels };
      delete nextLabels[selectedEdgeId];
      return nextLabels;
    });
  };

  const exportSvg = () => {
    const output = exportLabeledSvg(svgModel.content, labels, svgModel.edges);
    const blob = new Blob([output], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = 'svg-box-designer-labeled.svg';
      downloadRef.current.click();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Version 1 foundation</p>
          <h1>SVG Box Designer</h1>
          <p>
            Import an SVG, select straight edges, assign foundational labels, and export the labeled SVG.
          </p>
        </div>
        <div className="hero-actions">
          <label className="button primary">
            Import SVG
            <input type="file" accept=".svg,image/svg+xml" onChange={handleImportWithError} />
          </label>
          <button className="button" type="button" onClick={exportSvg} disabled={Object.keys(labels).length === 0}>
            Export SVG
          </button>
          <a ref={downloadRef} className="visually-hidden" aria-hidden="true">
            download
          </a>
        </div>
      </header>

      {errorMessage && <div className="notice">{errorMessage}</div>}

      <section className="workspace" aria-label="SVG labeling workspace">
        <aside className="panel">
          <h2>Label tools</h2>
          <p className="muted">
            Select a highlighted straight edge on the drawing, then assign one of the v1 labels.
          </p>
          <div className="label-grid">
            {labelPrefixes.map(({ prefix, description }) => (
              <button key={prefix} type="button" onClick={() => assignLabel(prefix)} disabled={!selectedEdgeId}>
                <strong>{prefix}{labelCounts[prefix] + 1}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>

          <div className="selection-card">
            <h3>Selection</h3>
            {selectedEdge ? (
              <dl>
                <dt>Edge</dt>
                <dd>{selectedEdge.id}</dd>
                <dt>Source</dt>
                <dd>{selectedEdge.source}</dd>
                <dt>Label</dt>
                <dd>{labels[selectedEdge.id] ?? 'Unlabeled'}</dd>
              </dl>
            ) : (
              <p className="muted">No edge selected.</p>
            )}
            <button type="button" onClick={clearSelectedLabel} disabled={!selectedEdgeId || !labels[selectedEdgeId]}>
              Clear selected label
            </button>
          </div>

          <div className="selection-card">
            <h3>Saved labels</h3>
            {Object.keys(labels).length > 0 ? (
              <ul className="saved-labels">
                {svgModel.edges
                  .filter((edge) => labels[edge.id])
                  .map((edge) => (
                    <li key={edge.id}>
                      <button type="button" onClick={() => setSelectedEdgeId(edge.id)}>
                        <strong>{labels[edge.id]}</strong>
                        <span>{edge.id}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted">Labels are saved in application state as you assign them.</p>
            )}
          </div>
        </aside>

        <section className="canvas-card">
          <div className="canvas-toolbar">
            <div>
              <h2>Drawing</h2>
              <p>{svgModel.edges.length} selectable straight edges detected.</p>
            </div>
          </div>

          <div className="canvas-frame">
            <svg className="design-svg" viewBox={svgModel.viewBox} role="img" aria-label="Imported SVG with selectable edges">
              <g dangerouslySetInnerHTML={{ __html: svgModel.innerMarkup }} />
              <g className="edge-overlays">
                {svgModel.edges.map((edge) => {
                  const label = labels[edge.id];
                  const center = midpoint(edge);
                  const selected = selectedEdgeId === edge.id;

                  return (
                    <g key={edge.id}>
                      <line
                        className={`edge-hitbox${selected ? ' selected' : ''}${label ? ' labeled' : ''}`}
                        x1={edge.start.x}
                        y1={edge.start.y}
                        x2={edge.end.x}
                        y2={edge.end.y}
                        onClick={() => setSelectedEdgeId(edge.id)}
                      />
                      {label && (
                        <text className="edge-label" x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
