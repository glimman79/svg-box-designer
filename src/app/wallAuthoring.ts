import { getBucketEdgeAssignment } from './assignmentBuckets';
import type { ConnectionMap } from './connectionTypes';
import type { EdgeAssignmentRecord, EdgeRole, SvgDocumentModel } from '../svgUtils';

export type TBPanelPairOrientation =
  | 'NO_TB_ORIENTATION'
  | 'P_A_Q_B'
  | 'P_B_Q_A'
  | 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
export type WallOrientation = 'P_WA_Q_WB' | 'P_WB_Q_WA';

const assignmentsForConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) => {
  const panelByEdge = new Map(model.panels.flatMap((panel) => panel.edgeIds.map((edgeId) => [edgeId, panel.id] as const)));
  return Object.entries(assignments).flatMap(([sourceEdgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    const panelId = panelByEdge.get(sourceEdgeId);
    return assignment?.connectionId === connectionId && panelId && assignment.edgeRole
      ? [{ panelId, sourceEdgeId, role: assignment.edgeRole }] : [];
  });
};

/** Resolves only complete, typed TB authoring between the same two panels. */
export const resolveTBPanelPairOrientation = (panelP: string, panelQ: string, model: SvgDocumentModel,
  assignments: EdgeAssignmentRecord, connections: ConnectionMap): TBPanelPairOrientation => {
  if (panelP === panelQ) return 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
  const votes = new Set<'P_A_Q_B' | 'P_B_Q_A'>();
  for (const connection of Object.values(connections)) {
    if (connection.prefix !== 'TB') continue;
    const authored = assignmentsForConnection(model, assignments, connection.id);
    const p = authored.filter((item) => item.panelId === panelP);
    const q = authored.filter((item) => item.panelId === panelQ);
    if (authored.length < 2 || !authored.some((item) => item.role === 'A') || !authored.some((item) => item.role === 'B')) continue;
    if (p.length === 0 || q.length === 0) continue;
    if (authored.length !== 2 || p.length !== 1 || q.length !== 1 || p[0].role === q[0].role) {
      return 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
    }
    votes.add(p[0].role === 'A' ? 'P_A_Q_B' : 'P_B_Q_A');
  }
  if (votes.size === 0) return 'NO_TB_ORIENTATION';
  return votes.size === 1 ? [...votes][0] : 'AMBIGUOUS_CONTRADICTORY_TB_ORIENTATION';
};

export const availableWallOrientationsForPanelPair = (panelP: string, panelQ: string, model: SvgDocumentModel,
  assignments: EdgeAssignmentRecord, connections: ConnectionMap): readonly WallOrientation[] => {
  const orientation = resolveTBPanelPairOrientation(panelP, panelQ, model, assignments, connections);
  if (orientation === 'NO_TB_ORIENTATION') return ['P_WA_Q_WB', 'P_WB_Q_WA'];
  if (orientation === 'P_A_Q_B') return ['P_WA_Q_WB'];
  if (orientation === 'P_B_Q_A') return ['P_WB_Q_WA'];
  return [];
};

export const getWallAssignments = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord, connectionId: string) =>
  assignmentsForConnection(model, assignments, connectionId);

export const validateWallConnection = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap, connectionId: string): void => {
  const connection = connections[connectionId];
  if (connection?.prefix !== 'W') return;
  const authored = getWallAssignments(model, assignments, connectionId);
  if (authored.length !== 2 || authored.filter((item) => item.role === 'A').length !== 1
    || authored.filter((item) => item.role === 'B').length !== 1) {
    throw new Error(`${connectionId} is incomplete: Wall requires exactly one W-A and one W-B assignment.`);
  }
  const [p, q] = authored;
  const available = availableWallOrientationsForPanelPair(p.panelId, q.panelId, model, assignments, connections);
  const selected: WallOrientation = p.role === 'A' ? 'P_WA_Q_WB' : 'P_WB_Q_WA';
  if (!available.includes(selected)) throw new Error(`${connectionId} conflicts with the TB orientation between its panel pair.`);
};

export const validateWallAuthoringForApply = (model: SvgDocumentModel, assignments: EdgeAssignmentRecord,
  connections: ConnectionMap): void => {
  const walls = Object.values(connections).filter((connection) => connection.prefix === 'W');
  if (walls.length === 0) return;
  walls.forEach((connection) => validateWallConnection(model, assignments, connections, connection.id));
  throw new Error('Wall geometry not implemented in B2; Wall authoring was not applied.');
};

export const complementaryWallRole = (role: EdgeRole): EdgeRole => role === 'A' ? 'B' : 'A';
