import type { ChangeEvent, ReactNode } from 'react';
import type { WorkspaceId } from './drawingTypes';
import { HistoryControls, type HistoryControlsProps } from './HistoryControls';

const modules: ReadonlyArray<{ id: WorkspaceId; label: string; available: boolean }> = [
  { id: 'drawing', label: '2D Drawing', available: true },
  { id: 'construction', label: 'Box / Construction', available: true },
  { id: 'puzzle', label: 'Puzzle', available: false },
];

/** Placement only: commands and history retain their existing module owners. */
export function WorkspaceTopBar({ activeWorkspace, onSelectWorkspace, onImport, onExport, onClear, canExport, history, children }: {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (workspace: WorkspaceId) => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onClear: () => void;
  canExport: boolean;
  history: HistoryControlsProps;
  children?: ReactNode;
}) {
  const isConstruction = activeWorkspace === 'construction';
  return <header className="top-toolbar" aria-label="Primary actions">
    <div className="brand-lockup" aria-label="SVG Box Designer">
      <span className="brand-mark" aria-hidden="true">SBD</span>
      <h1>SVG BOX DESIGNER</h1>
    </div>
    <nav className="workspace-selector" aria-label="Main workspaces">
      {modules.map(({ id, label, available }) => <button key={id} type="button"
        className={activeWorkspace === id ? 'active' : ''} aria-pressed={activeWorkspace === id}
        disabled={!available} title={available ? undefined : `${label} is not implemented`}
        onClick={() => onSelectWorkspace(id)}>
        {label}{!available && <span>Not implemented</span>}
      </button>)}
    </nav>
    <div className="toolbar-actions project-commands" role="group" aria-label="Project commands">
      <span className="command-scope" title="These existing commands belong to BOX / Construction">BOX</span>
      <label className={`toolbar-button${isConstruction ? ' primary' : ''}`} aria-disabled={!isConstruction} title="Import SVG into BOX / Construction">
        Import
        <input aria-label="Import SVG into BOX / Construction" type="file" accept=".svg,image/svg+xml" disabled={!isConstruction} onChange={onImport} />
      </label>
      <button className="toolbar-button" type="button" disabled title="Native Open Project is not implemented">Open</button>
      <button className="toolbar-button" type="button" disabled title="Native Save Project is not implemented">Save</button>
      <button className="toolbar-button" type="button" onClick={onExport} disabled={!isConstruction || !canExport} title="Export SVG from BOX / Construction">Export</button>
      <button className="toolbar-button" type="button" onClick={onClear} disabled={!isConstruction} title="Clear BOX / Construction only; Drawing is preserved">Clear</button>
    </div>
    <div className="toolbar-actions history-commands" role="group" aria-label={`${isConstruction ? 'BOX / Construction' : 'Drawing'} Undo/Redo`} title="Active module history; shared project Undo/Redo is not implemented">
      <HistoryControls {...history} />
    </div>
    <div className="toolbar-actions module-actions" role="group" aria-label="Active module actions">{children}</div>
  </header>;
}
