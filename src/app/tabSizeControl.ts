import type { ConnectionMap, TBConnectionProperties } from './connectionTypes';

/** Visibility policy for the shared TB/Wall finger-width control. */
export const shouldShowFingerJointTabControl = (
  activeTool: string,
  connectionPrefix: string | null | undefined,
): boolean => (activeTool === 'TB' || activeTool === 'W') && connectionPrefix === activeTool;

/** Applies one edit to the single finger-width setting mirrored by all TB/Wall connections. */
export const applySharedFingerWidthUpdates = (
  connections: ConnectionMap,
  updates: Partial<TBConnectionProperties>,
): ConnectionMap => Object.fromEntries(
  Object.entries(connections).map(([connectionId, connection]) => [
    connectionId,
    connection.prefix === 'TB' || connection.prefix === 'W'
      ? {
          ...connection,
          properties: {
            ...connection.properties,
            ...updates,
            isFingerWidthManual: updates.fingerWidthMm !== undefined
              ? true
              : updates.isFingerWidthManual ?? connection.properties.isFingerWidthManual,
          },
        }
      : connection,
  ]),
) as ConnectionMap;
