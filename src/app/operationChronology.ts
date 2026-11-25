import { newIdentityToken, type ChronologyEntry, type OperationChronology } from './constructionOperations';
import { IMPORTED_SOURCE } from './boxSources';
import { toEdgeAssignmentBucket } from './assignmentBuckets';
import type { BoxProjectData, ProjectStateSource } from './projectState';

type Definitions = Pick<ProjectStateSource, 'constructionOperations' | 'boxSources'> & { box: BoxProjectData };

/** Array position is creation order. IDs name lifetimes even when an authoring label is reused. */
export function reconcileChronology(entries: OperationChronology, next: Definitions, previous?: Definitions): OperationChronology {
  const added: ChronologyEntry[] = [];
  const removed = new Set<ChronologyEntry>();
  if (previous?.constructionOperations !== next.constructionOperations) {
    const live = new Set(next.constructionOperations.map(op => op.id));
    const known = new Set(entries.filter(e => e.kind === 'sketch').map(e => e.id));
    for (const entry of entries) {
      if (entry.sourceId !== IMPORTED_SOURCE && !live.has(entry.sourceId)) removed.add(entry);
    }
    for (const { id } of next.constructionOperations) {
      if (!known.has(id)) added.push({ kind: 'sketch', id, sourceId: id });
    }
  }

  function visit(sourceId: string, box: BoxProjectData, prior?: BoxProjectData) {
    if (box === prior) return;
    const replaced = sourceId === IMPORTED_SOURCE && prior && prior.svgModel !== box.svgModel;
    if (!replaced && box.connections === prior?.connections && box.edgeAssignments === prior.edgeAssignments
      && box.panelManager === prior.panelManager && box.workflowGroupOrder === prior.workflowGroupOrder) return;
    const known = new Set<string>();
    for (const entry of entries) {
      if (entry.sourceId !== sourceId || entry.kind === 'sketch') continue;
      if (entry.connectionId ? !Object.hasOwn(box.connections, entry.connectionId) : replaced) removed.add(entry);
      else known.add(entry.connectionId ?? entry.kind);
    }
    function append(kind: Exclude<ChronologyEntry['kind'], 'sketch'>, connectionId?: string) {
      if (!known.has(connectionId ?? kind)) {
        added.push({ kind, sourceId, id: newIdentityToken(), ...(connectionId && { connectionId }) });
        known.add(connectionId ?? kind);
      }
    }
    if (box.panelManager.isApplied || box.panelManager.approvedGeometryRevision) append('PM');
    const authored = new Set<string>();
    for (const value of Object.values(box.edgeAssignments)) {
      const bucket = toEdgeAssignmentBucket(value);
      if (bucket?.edgeAssignment) authored.add(bucket.edgeAssignment.connectionId);
      for (const slot of bucket?.slotAssignments ?? []) authored.add(slot.connectionId);
    }
    // Group starts and automatic continuations allocate empty working connections.
    // A separate Add command creates a standalone definition immediately.
    const drafts = new Set([box.activeTBGroup, box.activeWallGroup, box.activeSGroup].flatMap(group => group?.connectionIds ?? []));
    for (const { id, prefix } of Object.values(box.connections)) {
      if (prefix !== 'TB' && prefix !== 'W' && prefix !== 'S') continue;
      const standalone = prior && box.edgeAssignments === prior.edgeAssignments && !prior.connections[id] && !drafts.has(id);
      if (!previous || authored.has(id) || standalone) append(prefix, id);
    }
    if (box.workflowGroupOrder.manufacturing !== undefined) append('manufacturing');
  }

  // Legacy admission has no cross-source timestamps. Preserve Sketch order, then
  // admit imported definitions and Sketch sources in their stored order.
  visit(IMPORTED_SOURCE, next.box, previous?.box);
  if (next.boxSources?.sketches !== previous?.boxSources?.sketches) {
    for (const { id } of next.constructionOperations) {
      const box = next.boxSources?.sketches[id];
      if (box) visit(id, box, previous?.boxSources?.sketches[id]);
    }
  }
  return removed.size || added.length ? [...entries.filter(entry => !removed.has(entry)), ...added] : entries;
}
