export const CAD_DOUBLE_ACTIVATION_THRESHOLD_MS = 350;
export const CAD_DOUBLE_ACTIVATION_DISTANCE_PX = 6;

export type CadToolActivationPoint = Readonly<{ x: number; y: number }>;
export type CadToolActivationRecord<TTool extends string> = Readonly<{
  tool: TTool;
  timestamp: number;
  point: CadToolActivationPoint;
}>;

export type CadToolActivationResolution<TTool extends string> = Readonly<{
  activationMode: 'normal' | 'persistent';
  record: CadToolActivationRecord<TTool>;
}>;

/** Resolves rapid pointer activations without relying on the browser's native dblclick event. */
export const resolveCadToolPointerActivation = <TTool extends string>(
  tool: TTool,
  timestamp: number,
  point: CadToolActivationPoint,
  previous: CadToolActivationRecord<TTool> | null,
): CadToolActivationResolution<TTool> => {
  const elapsed = previous === null ? Number.POSITIVE_INFINITY : timestamp - previous.timestamp;
  const distanceSquared = previous === null
    ? Number.POSITIVE_INFINITY
    : (point.x - previous.point.x) ** 2 + (point.y - previous.point.y) ** 2;
  const isDoubleActivation = previous !== null
    && previous.tool === tool
    && elapsed >= 0
    && elapsed <= CAD_DOUBLE_ACTIVATION_THRESHOLD_MS
    && distanceSquared <= CAD_DOUBLE_ACTIVATION_DISTANCE_PX ** 2;

  return {
    activationMode: isDoubleActivation ? 'persistent' : 'normal',
    record: { tool, timestamp, point },
  };
};
