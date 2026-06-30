import { getBucketEdgeAssignment, getBucketSlotAssignments } from './assignmentBuckets';
import type { EdgeConnectionDefinition, SlotConnectionDefinition } from './connectionTypes';
import { resolveTBThickness } from './eGeometry';
import type { PanelThicknessState } from './eGeometry';
import { resolveSSlotLengthMm, resolveSThickness } from './sGeometry';
import type { EdgeAssignmentRecord, EdgeRole, SlotRole, SvgDocumentModel } from '../svgUtils';

export type ConnectionViewModelPrefix = 'TB' | 'S';

export type ConnectionViewModelAssignedEdge = {
  edgeId: string;
  role: EdgeRole | SlotRole;
  panelId: string | null;
  panelLabel: string | null;
  panelThicknessMm: number | null;
  matingPanelId: string | null;
  matingPanelLabel: string | null;
  matingThicknessMm: number | null;
};

export type ConnectionViewModel = {
  connectionId: string;
  prefix: ConnectionViewModelPrefix;
  displayTabMm: number | null;
  isTabManual: boolean;
  storedTabMm: number;
  autoTabMm: number | null;
  panelIds: { panelAId: string | null; panelBId: string | null };
  panelLabels: { panelALabel: string | null; panelBLabel: string | null };
  panelThicknesses: { panelAThicknessMm: number | null; panelBThicknessMm: number | null };
  diagnostics: string[];
  assignedEdges: ConnectionViewModelAssignedEdge[];
};

type LabelResolver = (panelId: string) => string;

const getPanelLabel = (panelId: string | null, getPanelDisplayLabel?: LabelResolver): string | null => (
  panelId ? getPanelDisplayLabel?.(panelId) ?? panelId : null
);

const findPanelIdForEdge = (svgModel: SvgDocumentModel, edgeId: string): string | null => (
  svgModel.panels.find((panel) => panel.edgeIds.includes(edgeId))?.id ?? null
);


export const resolveAssignedTBOrSConnectionIdForEdge = (
  assignments: EdgeAssignmentRecord,
  edgeId: string,
  preferredPrefix?: ConnectionViewModelPrefix,
): string | null => {
  const assignment = assignments[edgeId];
  const tbConnectionId = getBucketEdgeAssignment(assignment)?.connectionId ?? null;
  const sConnectionId = getBucketSlotAssignments(assignment)[0]?.connectionId ?? null;

  if (preferredPrefix === 'S' && sConnectionId) {
    return sConnectionId;
  }

  if (preferredPrefix === 'TB' && tbConnectionId) {
    return tbConnectionId;
  }

  return tbConnectionId ?? sConnectionId;
};

export const getTBConnectionViewModel = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: EdgeConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
  getPanelDisplayLabel?: LabelResolver,
): ConnectionViewModel => {
  const thickness = resolveTBThickness(svgModel, assignments, connection, panelThicknessState);
  const displayTabMm = !thickness.isComplete
    ? null
    : connection.properties.isFingerWidthManual
      ? connection.properties.fingerWidthMm
      : thickness.autoFingerWidthMm;

  const assignedEdges = Object.entries(assignments).flatMap(([edgeId, assignment]) => {
    const edgeAssignment = getBucketEdgeAssignment(assignment);
    if (edgeAssignment?.connectionId !== connection.id || !edgeAssignment.edgeRole) {
      return [];
    }

    const isRoleA = edgeAssignment.edgeRole === 'A';
    const panelId = findPanelIdForEdge(svgModel, edgeId);
    const resolvedPanelId = isRoleA ? thickness.panelAId : thickness.panelBId;
    const matingPanelId = isRoleA ? thickness.panelBId : thickness.panelAId;
    return [{
      edgeId,
      role: edgeAssignment.edgeRole,
      panelId: panelId ?? resolvedPanelId,
      panelLabel: getPanelLabel(panelId ?? resolvedPanelId, getPanelDisplayLabel),
      panelThicknessMm: isRoleA ? thickness.panelAThicknessMm : thickness.panelBThicknessMm,
      matingPanelId,
      matingPanelLabel: getPanelLabel(matingPanelId, getPanelDisplayLabel),
      matingThicknessMm: isRoleA ? thickness.panelBThicknessMm : thickness.panelAThicknessMm,
    }];
  });

  return {
    connectionId: connection.id,
    prefix: 'TB',
    displayTabMm,
    isTabManual: connection.properties.isFingerWidthManual,
    storedTabMm: connection.properties.fingerWidthMm,
    autoTabMm: thickness.autoFingerWidthMm,
    panelIds: { panelAId: thickness.panelAId, panelBId: thickness.panelBId },
    panelLabels: {
      panelALabel: getPanelLabel(thickness.panelAId, getPanelDisplayLabel),
      panelBLabel: getPanelLabel(thickness.panelBId, getPanelDisplayLabel),
    },
    panelThicknesses: { panelAThicknessMm: thickness.panelAThicknessMm, panelBThicknessMm: thickness.panelBThicknessMm },
    diagnostics: [
      ...(thickness.isComplete ? [] : ['Waiting for second edge.']),
      connection.properties.isFingerWidthManual ? 'Manual tab value uses stored fingerWidthMm.' : (thickness.isComplete ? 'Auto tab value uses 3 × min(panel A thickness, panel B thickness).' : 'Automatic tab value is unavailable until the TB connection is complete.'),
    ],
    assignedEdges,
  };
};

export const getSConnectionViewModel = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: SlotConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
  getPanelDisplayLabel?: LabelResolver,
): ConnectionViewModel => {
  const thickness = resolveSThickness(svgModel, assignments, connection, panelThicknessState);
  const displayTabMm = thickness.isComplete ? resolveSSlotLengthMm(connection, thickness) : null;

  const assignedEdges = Object.entries(assignments).flatMap(([edgeId, assignment]) => (
    getBucketSlotAssignments(assignment)
      .filter((slotAssignment) => slotAssignment.connectionId === connection.id && slotAssignment.slotRole)
      .map((slotAssignment) => {
        const isRoleA = slotAssignment.slotRole === 'A';
        const panelId = findPanelIdForEdge(svgModel, edgeId);
        const resolvedPanelId = isRoleA ? thickness.panelAId : thickness.panelBId;
        const matingPanelId = isRoleA ? thickness.panelBId : thickness.panelAId;
        return {
          edgeId,
          role: slotAssignment.slotRole!,
          panelId: panelId ?? resolvedPanelId,
          panelLabel: getPanelLabel(panelId ?? resolvedPanelId, getPanelDisplayLabel),
          panelThicknessMm: isRoleA ? thickness.panelAThicknessMm : thickness.panelBThicknessMm,
          matingPanelId,
          matingPanelLabel: getPanelLabel(matingPanelId, getPanelDisplayLabel),
          matingThicknessMm: isRoleA ? thickness.panelBThicknessMm : thickness.panelAThicknessMm,
        };
      })
  ));

  return {
    connectionId: connection.id,
    prefix: 'S',
    displayTabMm,
    isTabManual: connection.properties.isSlotLengthManual,
    storedTabMm: connection.properties.slotLengthMm,
    autoTabMm: thickness.autoSlotLengthMm,
    panelIds: { panelAId: thickness.panelAId, panelBId: thickness.panelBId },
    panelLabels: {
      panelALabel: getPanelLabel(thickness.panelAId, getPanelDisplayLabel),
      panelBLabel: getPanelLabel(thickness.panelBId, getPanelDisplayLabel),
    },
    panelThicknesses: { panelAThicknessMm: thickness.panelAThicknessMm, panelBThicknessMm: thickness.panelBThicknessMm },
    diagnostics: [
      ...(thickness.isComplete ? [] : ['Waiting for S-A/S-B.']),
      connection.properties.isSlotLengthManual ? 'Manual tab value uses stored slotLengthMm.' : (thickness.isComplete ? 'Auto tab value uses 3 × S-A panel thickness.' : 'Automatic tab value is unavailable until S-A and S-B are assigned.'),
    ],
    assignedEdges,
  };
};

export const getConnectionViewModel = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: EdgeConnectionDefinition | SlotConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
  getPanelDisplayLabel?: LabelResolver,
): ConnectionViewModel => (
  connection.prefix === 'E'
    ? getTBConnectionViewModel(svgModel, assignments, connection, panelThicknessState, getPanelDisplayLabel)
    : getSConnectionViewModel(svgModel, assignments, connection, panelThicknessState, getPanelDisplayLabel)
);
