import { getBucketEdgeAssignment, toEdgeAssignmentBucket } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { EdgeAssignmentRecord, EdgeRole, SvgDocumentModel } from '../svgUtils';

export type TBPanelPairOrientation = 'NO_TB_ORIENTATION' | 'FIRST_A_SECOND_B' | 'FIRST_B_SECOND_A'
  | 'AMBIGUOUS_TB_ORIENTATION';

const assignmentsForConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) => {
  const panelByEdge = new Map(model.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  return Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    const panelId = panelByEdge.get(sourceEdgeId);
    return assignment?.connectionId === connectionId && panelId && assignment.edgeRole
      ? [{ panelId, sourceEdgeId, role: assignment.edgeRole }] : [];
  });
};

/**
 * Resolves complete typed TB relationships for exactly the supplied panel pair.
 * Source-edge position and all geometric/topological properties are deliberately
 * absent: orientation is relative to the order of the panel arguments.
 */
export const resolveTBOrientationForPanelPair = (firstPanelId: string, secondPanelId: string,
  assignments: EdgeAssignmentRecord, connections: ConnectionMap,
  model: SvgDocumentModel): TBPanelPairOrientation => {
  if (firstPanelId === secondPanelId) return 'AMBIGUOUS_TB_ORIENTATION';
  const votes = new Set<'FIRST_A_SECOND_B' | 'FIRST_B_SECOND_A'>();
  for (const connection of Object.values(connections)) {
    if (connection.prefix !== 'TB') continue;
    const tb = assignmentsForConnection(model, assignments, connection.id);
    const touchesFirst = tb.some((item) => item.panelId === firstPanelId);
    const touchesSecond = tb.some((item) => item.panelId === secondPanelId);
    if (!touchesFirst || !touchesSecond) continue;
    if (tb.length !== 2 || tb.filter((item) => item.role === 'A').length !== 1
      || tb.filter((item) => item.role === 'B').length !== 1
      || tb.filter((item) => item.panelId === firstPanelId).length !== 1
      || tb.filter((item) => item.panelId === secondPanelId).length !== 1) {
      return 'AMBIGUOUS_TB_ORIENTATION';
    }
    votes.add(tb.find((item) => item.panelId === firstPanelId)!.role === 'A'
      ? 'FIRST_A_SECOND_B' : 'FIRST_B_SECOND_A');
  }
  return votes.size === 0 ? 'NO_TB_ORIENTATION' : votes.size === 1 ? [...votes][0]
    : 'AMBIGUOUS_TB_ORIENTATION';
};

export const getWallAssignments = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) =>
  assignmentsForConnection(model, assignments, connectionId);

/** Normal UI path: swap only the two role labels in this completed W connection. */
export const normalizeWallConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, connectionId: string): EdgeAssignmentRecord => {
  const wall = getWallAssignments(model, assignments, connectionId);
  if (wall.length !== 2 || wall.filter((item) => item.role === 'A').length !== 1
    || wall.filter((item) => item.role === 'B').length !== 1 || wall[0].panelId === wall[1].panelId) return assignments;
  const orientation = resolveTBOrientationForPanelPair(wall[0].panelId, wall[1].panelId, assignments, connections, model);
  if (orientation === 'AMBIGUOUS_TB_ORIENTATION') throw new Error(`${connectionId} has ambiguous or malformed TB panel-pair orientation evidence.`);
  if (orientation === 'NO_TB_ORIENTATION') return assignments;
  const firstRequiredRole = orientation === 'FIRST_A_SECOND_B' ? 'A' : 'B';
  if (wall[0].role === firstRequiredRole) return assignments;
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
  const orientation = resolveTBOrientationForPanelPair(wall[0].panelId, wall[1].panelId, assignments, connections, model);
  if (orientation === 'AMBIGUOUS_TB_ORIENTATION') throw new Error(`${connectionId} has ambiguous or malformed TB panel-pair orientation evidence.`);
  const required = orientation === 'FIRST_A_SECOND_B' ? 'A' : orientation === 'FIRST_B_SECOND_A' ? 'B' : null;
  if (required && wall[0].role !== required) throw new Error(`${connectionId} does not match its TB panel-pair orientation.`);
};

export const validateWallAuthoringForApply = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap): void => {
  const walls = Object.values(connections).filter((connection) => connection.prefix === 'W');
  if (walls.length === 0) return;
  walls.forEach((connection) => validateWallConnection(model, assignments, connections, connection.id));
  throw new Error('Wall geometry not implemented in B2.2; Wall authoring was not applied.');
};

export const complementaryWallRole = (role: EdgeRole): EdgeRole => role === 'A' ? 'B' : 'A';
