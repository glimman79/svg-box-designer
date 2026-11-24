import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { SketchDefinition } from './constructionOperations';
import { neutralSketchColor } from './sketchPresentation';
import type { SupportedWorkspace } from './drawingTypes';

/** Both groups share one scroll track. Only Sketch entries carry operation identities. */
export function SharedHistoryRegion({ workspace, definitions, editingSketchId, onOpenSketch, workflowNavigation }: {
  workspace: SupportedWorkspace;
  definitions: readonly SketchDefinition[];
  editingSketchId: string | null;
  onOpenSketch: (operationId: string) => void;
  workflowNavigation: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ drawing: 0, construction: 0 });
  const isBox = workspace === 'construction';

  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = scrollPositions.current[workspace];
  }, [workspace]);

  return <aside className="workflow-history-panel shared-history-region panel" aria-label="Construction history">
    <span className="workflow-history-label">History</span>
    <div ref={trackRef} className="workflow-history-items" role="group" aria-label="History entries" tabIndex={0}
      onScroll={event => { scrollPositions.current[workspace] = event.currentTarget.scrollLeft; }}>
      <div className="workflow-history-content" hidden={!isBox} inert={!isBox} role="group" aria-label="BOX workflow groups">
        {workflowNavigation}
      </div>
      {definitions.length > 0 ? <div className="sketch-history-items" role="group" aria-label="Sketch operations">
        {definitions.map(({ operation, sketch }) => {
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
        })}
      </div> : !isBox && <p className="workflow-history-empty muted">No sketches yet.</p>}
    </div>
  </aside>;
}
