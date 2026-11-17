import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Presentation only. Workflow groups are not persistent construction operations. */
export type HistoryPresentation = 'workflow-navigation' | 'operations-unavailable';

/**
 * Future UI-4 input, supplied by the authoritative C.2 owner. Ref stays opaque here:
 * this neither defines a persistence schema nor maps workflow IDs to operation IDs.
 * No instances are created until persistent operations and navigation exist.
 */
export interface ConstructionOperationPresentation<OperationRef> {
  reference: OperationRef;
  module: string;
  operationType: string;
  label: string;
  iconCategory: string;
  selected: boolean;
  diagnosticSeverity?: 'warning' | 'error';
  blocked: boolean;
  editingUnavailable: boolean;
  onSelect: (reference: OperationRef) => void;
  onOpenSettings?: (reference: OperationRef) => void;
}

/** One application-level bottom row; BOX supplies its existing navigation unchanged. */
export function SharedHistoryRegion({ presentation, workflowNavigation }: {
  presentation: HistoryPresentation;
  workflowNavigation: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<HistoryPresentation, number>>({
    'workflow-navigation': 0,
    'operations-unavailable': 0,
  });
  const isWorkflow = presentation === 'workflow-navigation';

  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = scrollPositions.current[presentation];
  }, [presentation]);

  return <aside className="workflow-history-panel shared-history-region panel" aria-label="Construction history">
    <span className="workflow-history-label">History</span>
    <div
      ref={trackRef}
      className="workflow-history-items"
      role="group"
      aria-label={isWorkflow ? 'Workflow groups' : 'Construction history availability'}
      aria-description={isWorkflow ? 'BOX workflow-group navigation; persistent construction operations are not yet available.' : undefined}
      tabIndex={0}
      onScroll={(event) => { scrollPositions.current[presentation] = event.currentTarget.scrollLeft; }}
    >
      <div className="workflow-history-content" hidden={!isWorkflow} inert={!isWorkflow}>
        {workflowNavigation}
      </div>
      <p className="workflow-history-empty muted" hidden={isWorkflow}>
        Construction history will appear here when persistent operations are available.
      </p>
    </div>
  </aside>;
}
