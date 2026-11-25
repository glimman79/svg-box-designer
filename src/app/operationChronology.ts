import { newIdentityToken, type BoxChronologyEntry, type ChronologyEntry, type OperationChronology } from './constructionOperations';
import { IMPORTED_SOURCE } from './boxSources';
import { toEdgeAssignmentBucket } from './assignmentBuckets';
import { connectionGroups } from './connectionGroups';
import type { ConnectionGroup } from './connectionTypes';
import type { BoxProjectData, ProjectStateSource } from './projectState';

type Definitions = Pick<ProjectStateSource, 'constructionOperations' | 'boxSources' | 'chronology'> & { box: BoxProjectData };

function assignedConnections(box: BoxProjectData) {
  const assigned = new Set<string>();
  for (const value of Object.values(box.edgeAssignments)) {
    const bucket = toEdgeAssignmentBucket(value);
    if (bucket?.edgeAssignment) assigned.add(bucket.edgeAssignment.connectionId);
    for (const slot of bucket?.slotAssignments ?? []) assigned.add(slot.connectionId);
  }
  return assigned;
}

/** Array position is accepted creation order. Reconciliation also admits pre-group frames. */
export function reconcileChronology(entries: OperationChronology, next: Definitions, previous?: Definitions): OperationChronology {
  const added: ChronologyEntry[] = [];
  const removed = new Set<ChronologyEntry>();
  const migrated = new Map<ChronologyEntry, ChronologyEntry>();
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
    if (!replaced && prior && box.connections === prior.connections && box.edgeAssignments === prior.edgeAssignments
      && box.panelManager === prior.panelManager && box.workflowGroupOrder === prior.workflowGroupOrder
      && box.activeTBGroup === prior.activeTBGroup && box.activeWallGroup === prior.activeWallGroup && box.activeSGroup === prior.activeSGroup
      && box.completedTBGroups === prior.completedTBGroups && box.completedWallGroups === prior.completedWallGroups
      && box.completedSGroups === prior.completedSGroups) return;

    const assigned = assignedConnections(box);
    const previouslyAssigned = replaced ? assignedConnections(prior) : undefined;
    const byConnection = new Map<string, ConnectionGroup>();
    const liveGroups = new Set<string>();
    const meaningful = new Set<string>();
    for (const kind of ['TB', 'W', 'S'] as const) {
      for (const group of connectionGroups(box, kind)) {
        for (const id of group.connectionIds) {
          if (box.connections[id]?.prefix !== kind) continue;
          byConnection.set(id, group);
          liveGroups.add(group.groupId);
          if (assigned.has(id) || box.connections[id].hasAuthoredParameters) meaningful.add(group.groupId);
        }
      }
    }

    const known = new Set<string>();
    const key = (entry: Omit<BoxChronologyEntry, 'id' | 'sourceId'>) =>
      entry.groupId ? 'group:' + entry.groupId : entry.connectionId ?? entry.kind;
    for (const entry of entries) {
      if (entry.sourceId !== sourceId || entry.kind === 'sketch') continue;
      if (entry.groupId ? !liveGroups.has(entry.groupId)
        : entry.connectionId ? box.connections[entry.connectionId]?.prefix !== entry.kind : replaced) {
        removed.add(entry);
        continue;
      }
      const group = entry.connectionId && byConnection.get(entry.connectionId);
      if (group) {
        // Collapse legacy rows in place. The earliest member supplies both position and lifetime.
        const { connectionId, ...rest } = entry;
        const grouped = { ...rest, groupId: group.groupId };
        if (known.has(key(grouped)) || (!meaningful.has(group.groupId) && group.isActive && group.connectionIds.length === 1)) {
          removed.add(entry);
          continue;
        }
        migrated.set(entry, grouped);
        known.add(key(grouped));
      } else if (known.has(key(entry))) {
        removed.add(entry);
      } else {
        known.add(key(entry));
      }
    }
    function append(reference: Omit<BoxChronologyEntry, 'id' | 'sourceId'>) {
      if (known.has(key(reference))) return;
      added.push({ ...reference, sourceId, id: newIdentityToken() });
      known.add(key(reference));
    }
    if (box.panelManager.isApplied || box.panelManager.approvedGeometryRevision) append({ kind: 'PM' });
    for (const { id, prefix: kind } of Object.values(box.connections)) {
      if (kind !== 'TB' && kind !== 'W' && kind !== 'S') continue;
      const group = byConnection.get(id);
      if (group) {
        if (meaningful.has(group.groupId)) append({ kind, groupId: group.groupId });
      } else if (assigned.has(id) || (!previous && next.chronology === undefined)
        || (prior && box.edgeAssignments === prior.edgeAssignments && !prior.connections[id])
        || previouslyAssigned?.has(id) || box.connections[id].hasAuthoredParameters) {
        append({ kind, connectionId: id });
      }
    }
    if (box.workflowGroupOrder.manufacturing !== undefined) append({ kind: 'manufacturing' });
  }

  // Frames without a timeline have no cross-source timestamps. Use stored Sketch
  // order, then imported definitions and Sketch sources in their stored order.
  visit(IMPORTED_SOURCE, next.box, previous?.box);
  if (next.boxSources?.sketches !== previous?.boxSources?.sketches) {
    for (const { id } of next.constructionOperations) {
      const box = next.boxSources?.sketches[id];
      if (box) visit(id, box, previous?.boxSources?.sketches[id]);
    }
  }
  return removed.size || migrated.size || added.length
    ? [...entries.filter(entry => !removed.has(entry)).map(entry => migrated.get(entry) ?? entry), ...added] : entries;
}
