import type { SlotRole } from '../svgUtils';
import type { EdgeAssignmentRecord } from '../svgUtils';
import { getBucketSlotAssignments } from './assignmentBuckets';
import type { ActiveSGroup, ConnectionMap, SlotConnectionDefinition, SlotConnectionProperties } from './connectionTypes';

const getLabelPrefix = (label: string) => label.charAt(0);

const getNextSLabel = (labels: string[]) => {
  const usedNumbers = labels
    .filter((label) => getLabelPrefix(label) === 'S')
    .map((label) => Number.parseInt(label.slice(1), 10))
    .filter((value) => Number.isFinite(value));

  return `S${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

const getDefaultSlotLength = (materialThicknessMm: number) => materialThicknessMm * 3;

const getDefaultSlotWidth = (materialThicknessMm: number) => materialThicknessMm;

const cloneDefaultSProperties = (): SlotConnectionProperties => ({
  slotOffsetMm: 0,
  slotWidthMm: getDefaultSlotWidth(3),
  slotLengthMm: getDefaultSlotLength(3),
  isSlotLengthManual: false,
  materialThicknessMm: 3,
  kerfMm: 0.15,
});

export const getDefaultSlotRole = (assignments: EdgeAssignmentRecord, connectionId: string): SlotRole | null => {
  const assignedRoles = Object.values(assignments)
    .flatMap((assignment) => getBucketSlotAssignments(assignment))
    .filter((assignment) => assignment.connectionId === connectionId)
    .map((assignment) => assignment.slotRole);

  const hasA = assignedRoles.includes('A');
  const hasB = assignedRoles.includes('B');

  if (hasA && hasB) {
    return null;
  }

  return hasA ? 'B' : 'A';
};

export const isCompleteSConnection = (assignments: EdgeAssignmentRecord, connectionId: string) => {
  const roles = Object.values(assignments)
    .flatMap((assignment) => getBucketSlotAssignments(assignment))
    .filter((assignment) => assignment.connectionId === connectionId)
    .map((assignment) => assignment.slotRole);

  return roles.filter((role) => role === 'A').length === 1 && roles.filter((role) => role === 'B').length === 1;
};

export const createStandaloneSConnection = (id: string): SlotConnectionDefinition => ({
  id,
  prefix: 'S',
  properties: {
    ...cloneDefaultSProperties(),
    slotOffsetMm: 0,
  },
});

export const createCopiedSConnection = (id: string, previousConnection: SlotConnectionDefinition): SlotConnectionDefinition => ({
  id,
  prefix: 'S',
  properties: {
    ...cloneDefaultSProperties(),
    materialThicknessMm: previousConnection.properties.materialThicknessMm,
    slotWidthMm: previousConnection.properties.slotWidthMm,
    slotLengthMm: previousConnection.properties.slotLengthMm,
    isSlotLengthManual: previousConnection.properties.isSlotLengthManual,
    slotOffsetMm: previousConnection.properties.slotOffsetMm,
  },
});

export const applySlotPropertyUpdates = (
  connection: SlotConnectionDefinition,
  updates: Partial<SlotConnectionProperties>,
): SlotConnectionDefinition => {
  const nextProperties: SlotConnectionProperties = {
    ...connection.properties,
    ...updates,
  };

  if (updates.materialThicknessMm !== undefined) {
    nextProperties.slotWidthMm = getDefaultSlotWidth(updates.materialThicknessMm);
  }

  if (updates.slotLengthMm !== undefined) {
    nextProperties.isSlotLengthManual = true;
  }

  return {
    ...connection,
    properties: nextProperties,
  };
};

export const applyActiveSGroupSlotPropertyUpdates = (
  connections: ConnectionMap,
  activeSGroup: ActiveSGroup | null,
  updates: Partial<SlotConnectionProperties>,
): ConnectionMap => {
  if (!activeSGroup?.isActive) {
    return connections;
  }

  const activeConnectionIds = new Set(activeSGroup.connectionIds);

  return Object.fromEntries(
    Object.entries(connections).map(([connectionId, connection]) => [
      connectionId,
      activeConnectionIds.has(connectionId) && connection.prefix === 'S'
        ? applySlotPropertyUpdates(connection, updates)
        : connection,
    ]),
  );
};

export const startSGroupWorkflow = (connections: ConnectionMap) => {
  const connectionId = getNextSLabel(Object.keys(connections));
  const connection = createStandaloneSConnection(connectionId);

  return {
    connections: { ...connections, [connectionId]: connection },
    selectedLabelId: connectionId,
    activeSGroup: { groupId: `s-group-${connectionId}`, connectionIds: [connectionId], isActive: true } satisfies ActiveSGroup,
  };
};

export const finishSGroupWorkflow = (activeSGroup: ActiveSGroup | null): ActiveSGroup | null => (
  activeSGroup ? { ...activeSGroup, isActive: false } : null
);

export const finishSGroupWithTrailingCleanup = (
  activeSGroup: ActiveSGroup | null,
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  selectedLabelId: string | null,
) => {
  const lastConnectionId = activeSGroup?.connectionIds.at(-1);
  const lastAssignmentCount = lastConnectionId
    ? Object.values(assignments)
      .flatMap((assignment) => getBucketSlotAssignments(assignment))
      .filter((assignment) => assignment.connectionId === lastConnectionId).length
    : 0;
  const shouldRemoveTrailingConnection = !!lastConnectionId && lastAssignmentCount === 0;
  const nextConnections = shouldRemoveTrailingConnection
    ? Object.fromEntries(Object.entries(connections).filter(([connectionId]) => connectionId !== lastConnectionId)) as ConnectionMap
    : connections;
  const activeSGroupWithoutTrailing = activeSGroup && shouldRemoveTrailingConnection
    ? { ...activeSGroup, connectionIds: activeSGroup.connectionIds.slice(0, -1) }
    : activeSGroup;

  return {
    connections: nextConnections,
    selectedLabelId: shouldRemoveTrailingConnection && selectedLabelId === lastConnectionId ? null : selectedLabelId,
    activeSGroup: finishSGroupWorkflow(activeSGroupWithoutTrailing),
    removedConnectionId: shouldRemoveTrailingConnection ? lastConnectionId : null,
  };
};

export const manualAddSWorkflow = (connections: ConnectionMap, activeSGroup: ActiveSGroup | null) => {
  const connectionId = getNextSLabel(Object.keys(connections));

  return {
    connections: { ...connections, [connectionId]: createStandaloneSConnection(connectionId) },
    selectedLabelId: connectionId,
    activeSGroup: finishSGroupWorkflow(activeSGroup),
  };
};

export const maybeAutoCreateNextSInGroup = (
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  activeSGroup: ActiveSGroup | null,
  completedConnectionId: string,
) => {
  if (!activeSGroup?.isActive || !activeSGroup.connectionIds.includes(completedConnectionId) || !isCompleteSConnection(assignments, completedConnectionId)) {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  const previousConnection = connections[completedConnectionId];

  if (!previousConnection || previousConnection.prefix !== 'S') {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  const connectionId = getNextSLabel(Object.keys(connections));

  if (connections[connectionId]) {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  return {
    connections: { ...connections, [connectionId]: createCopiedSConnection(connectionId, previousConnection) },
    selectedLabelId: connectionId,
    activeSGroup: { ...activeSGroup, connectionIds: [...activeSGroup.connectionIds, connectionId] },
  };
};
