import { getBucketEdgeAssignment } from './assignmentBuckets';
import type { EdgeAssignmentRecord } from '../svgUtils';
import type { ActiveTBGroup, ConnectionMap, EdgeConnectionDefinition, EdgeConnectionProperties } from './connectionTypes';

const getLabelPrefix = (label: string) => label.charAt(0);
const getLabelNumber = (label: string) => Number.parseInt(label.slice(1), 10);

export const getNextInternalELabel = (connections: ConnectionMap) => {
  const usedNumbers = Object.keys(connections)
    .filter((label) => getLabelPrefix(label) === 'E')
    .map(getLabelNumber)
    .filter((value) => Number.isFinite(value));

  return `E${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

export const getSharedTBEdgeProperties = (
  connections: ConnectionMap,
  defaultProperties: EdgeConnectionProperties,
): EdgeConnectionProperties => {
  const sharedConnection = Object.values(connections).find(
    (connection): connection is EdgeConnectionDefinition => connection.prefix === 'E',
  );

  return sharedConnection ? { ...sharedConnection.properties } : { ...defaultProperties };
};

export const createTBConnectionDefinition = (
  id: string,
  properties: EdgeConnectionProperties,
): EdgeConnectionDefinition => ({
  id,
  prefix: 'E',
  properties: { ...properties },
});

export const startTBGroupWorkflow = (
  connections: ConnectionMap,
  defaultProperties: EdgeConnectionProperties,
) => {
  const connectionId = getNextInternalELabel(connections);
  const nextConnections = {
    ...connections,
    [connectionId]: createTBConnectionDefinition(
      connectionId,
      getSharedTBEdgeProperties(connections, defaultProperties),
    ),
  };
  const activeTBGroup: ActiveTBGroup = {
    groupId: `tb-group-${connectionId}`,
    connectionIds: [connectionId],
    isActive: true,
  };

  return {
    connections: nextConnections,
    selectedLabelId: connectionId,
    activeTool: 'TB' as const,
    activeTBGroup,
  };
};

export const appendAutoCreatedEToTBGroup = (
  activeTBGroup: ActiveTBGroup | null,
  selectedLabelId: string,
  nextEdgeLabel: string,
): ActiveTBGroup | null => {
  if (!activeTBGroup?.isActive || !activeTBGroup.connectionIds.includes(selectedLabelId)) {
    return activeTBGroup;
  }

  if (activeTBGroup.connectionIds.includes(nextEdgeLabel)) {
    return activeTBGroup;
  }

  return {
    ...activeTBGroup,
    connectionIds: [...activeTBGroup.connectionIds, nextEdgeLabel],
  };
};

export const finishTBGroupWorkflow = (activeTBGroup: ActiveTBGroup): ActiveTBGroup => ({
  ...activeTBGroup,
  isActive: false,
});

export const finishTBGroupWithTrailingCleanup = (
  activeTBGroup: ActiveTBGroup,
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  selectedLabelId: string | null,
) => {
  const lastConnectionId = activeTBGroup.connectionIds.at(-1);
  const lastAssignmentCount = lastConnectionId
    ? Object.values(assignments).filter((assignment) => getBucketEdgeAssignment(assignment)?.connectionId === lastConnectionId).length
    : 0;
  const shouldRemoveTrailingConnection = !!lastConnectionId && lastAssignmentCount === 0;
  const nextConnectionIds = shouldRemoveTrailingConnection
    ? activeTBGroup.connectionIds.slice(0, -1)
    : activeTBGroup.connectionIds;
  const nextConnections = shouldRemoveTrailingConnection
    ? Object.fromEntries(Object.entries(connections).filter(([connectionId]) => connectionId !== lastConnectionId)) as ConnectionMap
    : connections;
  const activeTBGroupWithoutTrailing = {
    ...activeTBGroup,
    connectionIds: nextConnectionIds,
  };

  return {
    connections: nextConnections,
    selectedLabelId: shouldRemoveTrailingConnection && selectedLabelId === lastConnectionId ? null : selectedLabelId,
    activeTBGroup: finishTBGroupWorkflow(activeTBGroupWithoutTrailing),
    removedConnectionId: shouldRemoveTrailingConnection ? lastConnectionId : null,
  };
};



export const getTBGroupActionNumber = (
  tbGroups: { id: string }[],
  activeTBGroup: ActiveTBGroup | null,
) => {
  if (!activeTBGroup?.isActive) {
    return tbGroups.length + 1;
  }

  const activeGroupIndex = tbGroups.findIndex((group) => group.id === activeTBGroup.groupId);
  return activeGroupIndex >= 0 ? activeGroupIndex + 1 : tbGroups.length;
};

export const buildTBDisplayLabelAliasMap = (tbGroups: { labels: string[] }[]) => Object.fromEntries(
  tbGroups.flatMap((group) => group.labels).flatMap((connectionId, connectionIndex) => {
    const displayConnectionId = `TB${connectionIndex + 1}`;

    return [
      [connectionId, displayConnectionId],
      [`${connectionId}-A`, `${displayConnectionId}-A`],
      [`${connectionId}-B`, `${displayConnectionId}-B`],
    ];
  }),
);

export const buildTBCanvasLabelAliasMap = buildTBDisplayLabelAliasMap;
