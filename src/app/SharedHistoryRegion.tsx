import { useLayoutEffect, useRef } from 'react';
import type { BoxChronologyEntry, OperationChronology, SketchDefinition } from './constructionOperations';
import { neutralSketchColor } from './sketchPresentation';
import type { SupportedWorkspace } from './drawingTypes';

export function SharedHistoryRegion({ workspace, definitions, chronology, editingSketchId, onOpenSketch, onOpenBox, selectedBoxEntry }: {
  workspace: SupportedWorkspace;
  definitions: readonly SketchDefinition[];
  chronology: OperationChronology;
  editingSketchId: string | null;
  onOpenSketch: (operationId: string) => void;
  onOpenBox: (entry: BoxChronologyEntry) => void;
  selectedBoxEntry?: string;
}) {
  const byId = new Map(definitions.map(definition => [definition.operation.id, definition]));
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ drawing: 0, construction: 0 });

  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = scrollPositions.current[workspace];
  }, [workspace]);

  const groupCounts = new Map<string, number>();
  return <aside className="workflow-history-panel shared-history-region panel" aria-label="Construction history">
    <span className="workflow-history-label">History</span>
    <div ref={trackRef} className="workflow-history-items" role="group" aria-label="History entries" tabIndex={0}
      onScroll={event => { scrollPositions.current[workspace] = event.currentTarget.scrollLeft; }}>
      {chronology.length ? chronology.map(entry => {
        const definition = byId.get(entry.sourceId);
        if (entry.kind !== 'sketch') {
          const key = entry.sourceId + '/' + entry.kind;
          const number = (groupCounts.get(key) ?? 0) + 1;
          if (entry.groupId) groupCounts.set(key, number);
          const label = entry.groupId ? `${entry.kind} Group ${number}` : entry.connectionId ?? (entry.kind === 'PM' ? 'Panel Manager' : 'MFG');
          const name = definition ? label + ' (' + definition.sketch.name + ')' : label;
          return <button key={entry.id} className="workflow-history-item" type="button" data-operation-id={entry.id}
            disabled={editingSketchId !== null} aria-pressed={workspace === 'construction' && entry.id === selectedBoxEntry}
            aria-label={!definition && entry.kind === 'PM' ? 'Panel Manager, opens Panel Manager panel' : undefined}
            title={name} onClick={() => onOpenBox(entry)}>{name}</button>;
        }
        if (!definition) return null;
        const { operation, sketch } = definition;
        const editing = editingSketchId === sketch.id;
        const unavailable = editingSketchId !== null;
        const hint = editing ? 'Currently editing' : unavailable ? 'Finish the active Sketch first' : 'Double-click or press Enter to edit';
        return <button key={operation.id} type="button" className="workflow-history-item sketch-history-item"
          data-operation-id={operation.id} aria-current={editing || undefined} disabled={unavailable}
          title={sketch.name + ' · ' + hint} aria-description={hint}
          onDoubleClick={() => onOpenSketch(operation.id)}
          onClick={event => { if (event.detail === 0) onOpenSketch(operation.id); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" strokeWidth="1.7" stroke={neutralSketchColor(operation)}>
            <path d="M2 13h12M3 10l1-3 6-6 2 2-6 6z" />
          </svg>
          {sketch.name}
        </button>;
      }) : <p className="workflow-history-empty muted">No operations yet.</p>}
    </div>
  </aside>;
}
