import type { ConnectionMap, TBConnectionProperties } from './connectionTypes';

/** Visibility policy for the shared TB/Wall finger-width control. */
export const shouldShowFingerJointTabControl = (
  activeTool: string,
  connectionPrefix: string | null | undefined,
): boolean => (activeTool === 'TB' || activeTool === 'W') && connectionPrefix === activeTool;

/** Applies a finger-width edit to the selected TB/Wall connection only. */
export const applyFingerWidthUpdate = (
  connections: ConnectionMap,
  connectionId: string,
  updates: Partial<TBConnectionProperties>,
): ConnectionMap => {
  const connection = connections[connectionId];
  if (!connection || (connection.prefix !== 'TB' && connection.prefix !== 'W')) return connections;

  return {
    ...connections,
    [connectionId]: {
      ...connection,
      properties: {
        ...connection.properties,
        ...updates,
        isFingerWidthManual: updates.fingerWidthMm !== undefined
          ? true
          : updates.isFingerWidthManual ?? connection.properties.isFingerWidthManual,
      },
    },
  } as ConnectionMap;
};
