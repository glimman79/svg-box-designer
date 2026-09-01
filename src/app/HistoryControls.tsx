export type HistoryControlsProps = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}>;

/** Presentation-only history controls. The owning workspace supplies the history commands. */
export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }: HistoryControlsProps) {
  return <>
    <button className="toolbar-button icon-button" type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">↶</button>
    <button className="toolbar-button icon-button" type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)">↷</button>
  </>;
}
