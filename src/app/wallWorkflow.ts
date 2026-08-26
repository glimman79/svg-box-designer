import { getBucketEdgeAssignment, toEdgeAssignmentBucket } from './assignmentBuckets';
import { getNextConnectionLabel, parseConnectionLabel } from './connectionLabels';
import type { ConnectionMap, TBConnectionProperties } from './connectionTypes';
import { complementaryWallRole, getWallAssignments, normalizeWallConnection } from './wallAuthoring';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../svgUtils';

export type ActiveWallGroup = { groupId: string; connectionIds: string[]; isActive: boolean };
export const buildWallWorkflowGroups = (connections: ConnectionMap, active: ActiveWallGroup | null,
  completed: ActiveWallGroup[], order: Record<string, number>) => {
  const finished = completed.map((group) => ({ id: group.groupId,
    labels: group.connectionIds.filter((id) => connections[id]?.prefix === 'W'), isActive: false,
    orderIndex: order[group.groupId] })).filter((group) => group.labels.length);
  if (!active?.isActive) return finished;
  const labels = active.connectionIds.filter((id) => connections[id]?.prefix === 'W');
  return labels.length ? [...finished, { id: active.groupId, labels, isActive: true, orderIndex: order[active.groupId] }] : finished;
};
const defaultFingerWidthProperties: TBConnectionProperties = { fingerWidthMm: 9, isFingerWidthManual: false };
const getSharedFingerWidthProperties = (connections: ConnectionMap, fallback = defaultFingerWidthProperties): TBConnectionProperties => {
  const shared = Object.values(connections).find((connection) => connection.prefix === 'TB' || connection.prefix === 'W');
  return {
    fingerWidthMm: shared?.properties.fingerWidthMm ?? fallback.fingerWidthMm,
    isFingerWidthManual: shared?.properties.isFingerWidthManual ?? fallback.isFingerWidthManual,
  };
};
const createWall = (id: string, properties: TBConnectionProperties) => ({ id, prefix: 'W' as const, properties: { ...properties } });
const following = (id: string) => { const parsed = parseConnectionLabel(id); return parsed ? `${parsed.prefix}${parsed.number + 1}` : null; };

export const startWallGroupWorkflow = (connections: ConnectionMap) => {
  const connectionId = getNextConnectionLabel('W', Object.keys(connections));
  return {
    connections: { ...connections, [connectionId]: createWall(connectionId, getSharedFingerWidthProperties(connections)) },
    selectedLabelId: connectionId,
    activeWallGroup: { groupId: `w-group-${connectionId}`, connectionIds: [connectionId], isActive: true } as ActiveWallGroup,
  };
};

/** The production Wall edge-click command. Tests use this same command rather than recreating UI behavior. */
export const authorWallEdge = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, group: ActiveWallGroup, connectionId: string, edgeId: string) => {
  const authored = getWallAssignments(model, assignments, connectionId);
  if (authored.length >= 2) throw new Error(`${connectionId} is complete.`);
  const bucket = toEdgeAssignmentBucket(assignments[edgeId]) ?? {};
  if (bucket.edgeAssignment) throw new Error('This edge already has a TB assignment.');
  const role = authored.length === 0 ? 'A' : complementaryWallRole(authored[0].role);
  const nextAssignments = normalizeWallConnection(model, {
    ...assignments,
    [edgeId]: { ...bucket, edgeAssignment: { connectionId, edgeRole: role } },
  }, connections, connectionId);
  const complete = getWallAssignments(model, nextAssignments, connectionId).length === 2;
  if (!complete) return { assignments: nextAssignments, connections, activeWallGroup: group, selectedLabelId: connectionId };
  const nextId = following(connectionId)!;
  const nextConnections = connections[nextId] ? connections : {
    ...connections, [nextId]: createWall(nextId, getSharedFingerWidthProperties(connections)),
  };
  return {
    assignments: nextAssignments,
    connections: nextConnections,
    activeWallGroup: group.connectionIds.includes(nextId) ? group : { ...group, connectionIds: [...group.connectionIds, nextId] },
    selectedLabelId: nextId,
  };
};

export const finishWallGroupWithTrailingCleanup = (group: ActiveWallGroup, connections: ConnectionMap,
  assignments: EdgeAssignmentRecord) => {
  const trailing = group.connectionIds.at(-1);
  const empty = !!trailing && !Object.values(assignments).some((bucket) => getBucketEdgeAssignment(bucket)?.connectionId === trailing);
  return {
    connections: empty ? Object.fromEntries(Object.entries(connections).filter(([id]) => id !== trailing)) as ConnectionMap : connections,
    activeWallGroup: { ...group, connectionIds: empty ? group.connectionIds.slice(0, -1) : group.connectionIds, isActive: false },
  };
};
