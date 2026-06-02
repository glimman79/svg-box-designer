import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { exportLabeledSvg, midpoint, parseSvgDocument } from './svgUtils';
import type { SvgDocumentModel } from './svgUtils';

type LabelPrefix = 'E' | 'S' | 'C' | 'P';

type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

const labelGroups: LabelGroup[] = [
  { prefix: 'E', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern zones', description: 'Reusable pattern zone IDs' },
];

const starterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
  <rect x="70" y="45" width="280" height="170" rx="0" fill="#f8fafc" stroke="#334155" stroke-width="4"/>
  <line x1="70" y1="130" x2="350" y2="130" stroke="#94a3b8" stroke-width="3" stroke-dasharray="10 8"/>
</svg>`;

const getLabelPrefix = (label: string) => label.charAt(0) as LabelPrefix;

const getNextLabel = (prefix: LabelPrefix, labels: string[]) => {
  const usedNumbers = labels
    .filter((label) => getLabelPrefix(label) === prefix)
    .map((label) => Number.parseInt(label.slice(1), 10))
    .filter((value) => Number.isFinite(value));

  return `${prefix}${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

function App() {
  const [svgModel, setSvgModel] = useState<SvgDocumentModel>(() => parseSvgDocument(starterSvg));
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const labelCounts = useMemo(() => {
    return availableLabels.reduce<Record<string, number>>((counts, label) => {
      counts[label] = Object.values(labels).filter((assignedLabel) => assignedLabel === label).length;
      return counts;
    }, {});
  }, [availableLabels, labels]);

  const labelsByGroup = useMemo(() => {
    return labelGroups.map((group) => ({
      ...group,
      labels: availableLabels.filter((label) => getLabelPrefix(label) === group.prefix),
    }));
  }, [availableLabels]);

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

  const createLabel = (prefix: LabelPrefix) => {
    const nextLabel = getNextLabel(prefix, availableLabels);
    setAvailableLabels((currentLabels) => [...currentLabels, nextLabel]);
    setSelectedLabelId(nextLabel);
    setErrorMessage('');
  };

  const assignSelectedLabelToEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);

    if (!selectedLabelId) {
      setErrorMessage('Create and select a label before clicking an edge.');
      return;
    }

    setLabels((currentLabels) => ({
      ...currentLabels,
      [edgeId]: selectedLabelId,
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
          <p className="eyebrow">Reusable connection IDs</p>
          <h1>SVG Box Designer</h1>
          <p>
            Create reusable labels, select one connection ID, click every matching edge, and export the labeled SVG.
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
          <h2>Label manager</h2>
          <p className="muted">
            Create a label, select it, then click edges. Every clicked edge receives that exact label; labels never auto-increment on edge clicks.
          </p>

          <div className="active-label-card" aria-live="polite">
            <span>Selected label</span>
            <strong>{selectedLabelId ?? 'None'}</strong>
          </div>

          <div className="label-manager">
            {labelsByGroup.map(({ prefix, name, description, labels: groupLabels }) => (
              <section className="label-group" key={prefix} aria-label={name}>
                <div className="label-group-header">
                  <div>
                    <h3>{prefix} = {name}</h3>
                    <p>{description}</p>
                  </div>
                  <button type="button" onClick={() => createLabel(prefix)}>
                    Add {getNextLabel(prefix, availableLabels)}
                  </button>
                </div>

                {groupLabels.length > 0 ? (
                  <ul className="label-list">
                    {groupLabels.map((label) => (
                      <li key={label}>
                        <button
                          type="button"
                          className={selectedLabelId === label ? 'selected-label' : ''}
                          onClick={() => {
                            setSelectedLabelId(label);
                            setErrorMessage('');
                          }}
                        >
                          <strong>{label}</strong>
                          <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-labels">No {prefix} labels yet.</p>
                )}
              </section>
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
              Clear selected edge label
            </button>
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
                        onClick={() => assignSelectedLabelToEdge(edge.id)}
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
