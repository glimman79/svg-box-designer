import { getBucketEdgeAssignment, toEdgeAssignmentBucket } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { ActiveWallGroup } from './wallWorkflow';
import type { EdgeAssignmentRecord, EdgeRole, SvgDocumentModel } from '../svgUtils';

export type TBPanelRole = 'NO_TB_ROLE' | 'TB_ROLE_A' | 'TB_ROLE_B' | 'AMBIGUOUS_TB_ROLE';

const assignmentsForConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) => {
  const panelByEdge = new Map(model.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  return Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    const panelId = panelByEdge.get(sourceEdgeId);
    return assignment?.connectionId === connectionId && panelId && assignment.edgeRole
      ? [{ panelId, sourceEdgeId, role: assignment.edgeRole }] : [];
  });
};

/** Resolves a panel's role from complete, typed TB authored state only. */
export const resolveTBRoleForPanel = (panelId: string, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, model: SvgDocumentModel): TBPanelRole => {
  const roles = new Set<EdgeRole>();
  for (const connection of Object.values(connections)) {
    if (connection.prefix !== 'TB') continue;
    const tb = assignmentsForConnection(model, assignments, connection.id);
    const onPanel = tb.filter((item) => item.panelId === panelId);
    if (onPanel.length === 0) continue;
    if (tb.length === 1) continue; // An unambiguously incomplete draft is not evidence.
    if (tb.length !== 2 || tb.filter((item) => item.role === 'A').length !== 1
      || tb.filter((item) => item.role === 'B').length !== 1
      || tb[0].panelId === tb[1].panelId || onPanel.length !== 1) return 'AMBIGUOUS_TB_ROLE';
    roles.add(onPanel[0].role);
  }
  return roles.size === 0 ? 'NO_TB_ROLE' : roles.size > 1 ? 'AMBIGUOUS_TB_ROLE'
    : roles.has('A') ? 'TB_ROLE_A' : 'TB_ROLE_B';
};

export const getWallAssignments = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) =>
  assignmentsForConnection(model, assignments, connectionId);

const requiredFirstWallRole = (first: TBPanelRole, second: TBPanelRole): EdgeRole | null | 'INVALID' => {
  if (first === 'AMBIGUOUS_TB_ROLE' || second === 'AMBIGUOUS_TB_ROLE') return 'INVALID';
  if (first === 'NO_TB_ROLE' && second === 'NO_TB_ROLE') return null;
  // Equal, individually resolved evidence does not determine which endpoint
  // owns the complementary Wall role. Preserve the user's valid orientation.
  if (first === second) return null;
  if (first === 'TB_ROLE_A' || second === 'TB_ROLE_B') return 'A';
  return 'B';
};

const wallRequiredRole = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, firstPanelId: string, secondPanelId: string) => requiredFirstWallRole(
  resolveTBRoleForPanel(firstPanelId, assignments, connections, model),
  resolveTBRoleForPanel(secondPanelId, assignments, connections, model));

/** Normal UI path: swap only the two role labels in this completed W connection. */
export const normalizeWallConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, connectionId: string): EdgeAssignmentRecord => {
  const wall = getWallAssignments(model, assignments, connectionId);
  if (wall.length !== 2 || wall.filter((item) => item.role === 'A').length !== 1
    || wall.filter((item) => item.role === 'B').length !== 1 || wall[0].panelId === wall[1].panelId) return assignments;
  const required = wallRequiredRole(model, assignments, connections, wall[0].panelId, wall[1].panelId);
  if (required === 'INVALID') throw new Error(`${connectionId} has ambiguous or incompatible per-panel TB role evidence.`);
  if (required === null || wall[0].role === required) return assignments;
  const next = { ...assignments };
  for (const item of wall) {
    const bucket = toEdgeAssignmentBucket(assignments[item.sourceEdgeId])!;
    next[item.sourceEdgeId] = { ...bucket, edgeAssignment: { ...bucket.edgeAssignment!, edgeRole: item.role === 'A' ? 'B' : 'A' } };
  }
  return next;
};

export const validateWallConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, connectionId: string): void => {
  if (connections[connectionId]?.prefix !== 'W') return;
  const wall = getWallAssignments(model, assignments, connectionId);
  if (wall.length !== 2 || wall.filter((item) => item.role === 'A').length !== 1
    || wall.filter((item) => item.role === 'B').length !== 1 || wall[0].panelId === wall[1].panelId) {
    throw new Error(`${connectionId} is incomplete: Wall requires exactly one W-A and one W-B assignment on two panels.`);
  }
  const required = wallRequiredRole(model, assignments, connections, wall[0].panelId, wall[1].panelId);
  if (required === 'INVALID') throw new Error(`${connectionId} has ambiguous or incompatible per-panel TB role evidence.`);
  if (required && wall[0].role !== required) throw new Error(`${connectionId} does not match its per-panel TB roles.`);
};

export const validateWallAuthoringForApply = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, activeWallGroup: ActiveWallGroup | null = null): void => {
  const walls = Object.values(connections).filter((connection) => connection.prefix === 'W');
  if (walls.length === 0) return;
  const trailing = activeWallGroup?.isActive && activeWallGroup.connectionIds.length > 1
    ? activeWallGroup.connectionIds.at(-1) : undefined;
  for (const connection of walls) {
    if (connection.id === trailing && getWallAssignments(model, assignments, connection.id).length === 0) continue;
    validateWallConnection(model, assignments, connections, connection.id);
  }
  // Complete Walls are consumed by the native Wall geometry adapter.
};

export const complementaryWallRole = (role: EdgeRole): EdgeRole => role === 'A' ? 'B' : 'A';
