import { getBucketEdgeAssignment, toEdgeAssignmentBucket } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { EdgeAssignmentRecord, EdgeRole, SvgDocumentModel } from '../svgUtils';

export type TBMeetingOrientation = 'NO_TB_MEETING' | 'W_A_SIDE_IS_TB_A' | 'W_A_SIDE_IS_TB_B'
  | 'AMBIGUOUS_CONTRADICTORY_TB_MEETING';

const assignmentsForConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) => {
  const panelByEdge = new Map(model.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  return Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    const panelId = panelByEdge.get(sourceEdgeId);
    return assignment?.connectionId === connectionId && panelId && assignment.edgeRole
      ? [{ panelId, sourceEdgeId, role: assignment.edgeRole }] : [];
  });
};

const areIncidentPanelEdges = (model: SvgDocumentModel, panelId: string, first: string, second: string) => {
  const edgeIds = model.panels.find((panel) => panel.id === panelId)?.edgeIds ?? [];
  const a = edgeIds.indexOf(first); const b = edgeIds.indexOf(second);
  return a >= 0 && b >= 0 && a !== b && (Math.abs(a - b) === 1 || Math.abs(a - b) === edgeIds.length - 1);
};

/**
 * Finds TB meetings by authored contour incidence: a complete TB connection is
 * relevant only when its edge on each Wall panel is incident to that panel's
 * Wall edge. IDs and contour membership are stable under every geometric
 * transform and raw segment reversal; neither record nor connection order is
 * consulted. Contradictory relevant meetings are deliberately retained as an
 * ambiguity rather than resolved by priority.
 */
export const resolveRelevantTBMeeting = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, wallConnectionId: string): TBMeetingOrientation => {
  const wall = assignmentsForConnection(model, assignments, wallConnectionId);
  if (wall.length !== 2 || wall[0].panelId === wall[1].panelId) return 'NO_TB_MEETING';
  const wallA = wall.find((item) => item.role === 'A');
  const wallB = wall.find((item) => item.role === 'B');
  if (!wallA || !wallB) return 'NO_TB_MEETING';
  const votes = new Set<'W_A_SIDE_IS_TB_A' | 'W_A_SIDE_IS_TB_B'>();
  for (const connection of Object.values(connections)) {
    if (connection.prefix !== 'TB') continue;
    const tb = assignmentsForConnection(model, assignments, connection.id);
    if (tb.length !== 2 || !tb.some((item) => item.role === 'A') || !tb.some((item) => item.role === 'B')) continue;
    const atA = tb.filter((item) => item.panelId === wallA.panelId
      && areIncidentPanelEdges(model, wallA.panelId, wallA.sourceEdgeId, item.sourceEdgeId));
    const atB = tb.filter((item) => item.panelId === wallB.panelId
      && areIncidentPanelEdges(model, wallB.panelId, wallB.sourceEdgeId, item.sourceEdgeId));
    if (atA.length === 0 || atB.length === 0) continue;
    if (atA.length !== 1 || atB.length !== 1 || atA[0].role === atB[0].role) return 'AMBIGUOUS_CONTRADICTORY_TB_MEETING';
    votes.add(atA[0].role === 'A' ? 'W_A_SIDE_IS_TB_A' : 'W_A_SIDE_IS_TB_B');
  }
  return votes.size === 0 ? 'NO_TB_MEETING' : votes.size === 1 ? [...votes][0] : 'AMBIGUOUS_CONTRADICTORY_TB_MEETING';
};

export const getWallAssignments = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) =>
  assignmentsForConnection(model, assignments, connectionId);

/** Normal UI path: swap only the two role labels in this W connection. */
export const normalizeWallConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, connectionId: string): EdgeAssignmentRecord => {
  const wall = getWallAssignments(model, assignments, connectionId);
  if (wall.length !== 2 || !wall.some((item) => item.role === 'A') || !wall.some((item) => item.role === 'B')) return assignments;
  const meeting = resolveRelevantTBMeeting(model, assignments, connections, connectionId);
  if (meeting === 'AMBIGUOUS_CONTRADICTORY_TB_MEETING') throw new Error(`${connectionId} has ambiguous or contradictory relevant TB meeting evidence.`);
  const wallA = wall.find((item) => item.role === 'A')!;
  const mustSwap = meeting === 'W_A_SIDE_IS_TB_B';
  if (!mustSwap) return assignments;
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
  const authored = getWallAssignments(model, assignments, connectionId);
  if (authored.length !== 2 || authored.filter((item) => item.role === 'A').length !== 1
    || authored.filter((item) => item.role === 'B').length !== 1) {
    throw new Error(`${connectionId} is incomplete: Wall requires exactly one W-A and one W-B assignment.`);
  }
  const meeting = resolveRelevantTBMeeting(model, assignments, connections, connectionId);
  if (meeting === 'AMBIGUOUS_CONTRADICTORY_TB_MEETING') throw new Error(`${connectionId} has ambiguous or contradictory relevant TB meeting evidence.`);
  if (meeting === 'W_A_SIDE_IS_TB_B') throw new Error(`${connectionId} does not match its relevant TB meeting orientation.`);
};

export const validateWallAuthoringForApply = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap): void => {
  const walls = Object.values(connections).filter((connection) => connection.prefix === 'W');
  if (walls.length === 0) return;
  walls.forEach((connection) => validateWallConnection(model, assignments, connections, connection.id));
  throw new Error('Wall geometry not implemented in B2.1; Wall authoring was not applied.');
};

export const complementaryWallRole = (role: EdgeRole): EdgeRole => role === 'A' ? 'B' : 'A';
