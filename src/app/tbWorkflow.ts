import { getBucketEdgeAssignment } from './assignmentBuckets';
import type { EdgeAssignmentRecord } from '../svgUtils';
import type { ActiveTBGroup, ConnectionMap, TBConnectionDefinition, TBConnectionProperties } from './connectionTypes';
import { getNextConnectionLabel } from './connectionLabels';

export const getNextTBLabel = (connections: ConnectionMap) => getNextConnectionLabel('TB', Object.keys(connections));

export const getSharedTBEdgeProperties = (
  connections: ConnectionMap,
  defaultProperties: TBConnectionProperties,
): TBConnectionProperties => {
  const sharedConnection = Object.values(connections).find(
    (connection): connection is TBConnectionDefinition => connection.prefix === 'TB',
  );

  return sharedConnection ? { ...sharedConnection.properties } : { ...defaultProperties };
};

export const createTBConnectionDefinition = (
  id: string,
  properties: TBConnectionProperties,
): TBConnectionDefinition => ({
  id,
  prefix: 'TB',
  properties: { ...properties },
});

export const startTBGroupWorkflow = (
  connections: ConnectionMap,
  defaultProperties: TBConnectionProperties,
) => {
  const connectionId = getNextTBLabel(connections);
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

export const appendAutoCreatedTBToTBGroup = (
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
