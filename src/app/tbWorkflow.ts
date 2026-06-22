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
