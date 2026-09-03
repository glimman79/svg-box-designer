import type { DrawingDocumentV2, DrawingLineEntity, DrawingPoint } from './drawingTypes';

export type DrawingLineDraft = Readonly<{ id: string; type: 'line'; start: DrawingPoint; end: DrawingPoint; startPointId?: string; endPointId?: string }>;

export const LINE_ZERO_LENGTH_TOLERANCE_MM = 1e-9;
export const LINE_ANGULAR_SNAP_INCREMENT_DEGREES = 22.5;
export const LINE_ANGULAR_SNAP_TOLERANCE_DEGREES = 3;

export type LinePreviewResolution = Readonly<{
  rawPointerPoint: DrawingPoint;
  effectivePreviewPoint: DrawingPoint;
  snapActive: boolean;
  snappedAngleDegrees: number | null;
}>;

const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Resolves angular inference entirely in Drawing model space, preserving radial distance. */
export const resolveLinePreviewPoint = (
  start: DrawingPoint,
  rawPointerPoint: DrawingPoint,
): LinePreviewResolution => {
  const dx = rawPointerPoint.x - start.x;
  const dy = rawPointerPoint.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= LINE_ZERO_LENGTH_TOLERANCE_MM) {
    return { rawPointerPoint, effectivePreviewPoint: rawPointerPoint, snapActive: false, snappedAngleDegrees: null };
  }

  const rawAngleDegrees = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
  const candidateDegrees = normalizeDegrees(
    Math.round(rawAngleDegrees / LINE_ANGULAR_SNAP_INCREMENT_DEGREES) * LINE_ANGULAR_SNAP_INCREMENT_DEGREES,
  );
  const angularDifference = Math.abs(((rawAngleDegrees - candidateDegrees + 180) % 360 + 360) % 360 - 180);
  if (angularDifference > LINE_ANGULAR_SNAP_TOLERANCE_DEGREES) {
    return { rawPointerPoint, effectivePreviewPoint: rawPointerPoint, snapActive: false, snappedAngleDegrees: null };
  }

  const snappedRadians = candidateDegrees * Math.PI / 180;
  return {
    rawPointerPoint,
    effectivePreviewPoint: {
      x: start.x + distance * Math.cos(snappedRadians),
      y: start.y + distance * Math.sin(snappedRadians),
    },
    snapActive: true,
    snappedAngleDegrees: candidateDegrees,
  };
};

export type LineToolInteraction = Readonly<{
  start: DrawingPoint | null;
  startPointId: string | null;
  rawPointerPoint: DrawingPoint | null;
  effectivePreviewPoint: DrawingPoint | null;
  snapActive: boolean;
  snappedAngleDegrees: number | null;
}>;

export const EMPTY_LINE_INTERACTION: LineToolInteraction = {
  start: null,
  startPointId: null,
  rawPointerPoint: null,
  effectivePreviewPoint: null,
  snapActive: false,
  snappedAngleDegrees: null,
};

export const updateLinePreview = (interaction: LineToolInteraction, pointer: DrawingPoint): LineToolInteraction => (
  interaction.start ? { ...interaction, ...resolveLinePreviewPoint(interaction.start, pointer) } : interaction
);

type LineSpatialSnap = Readonly<{
  active: boolean;
  type: 'none' | 'endpoint' | 'line' | 'alignment';
  effectivePoint: DrawingPoint;
  xReference?: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
  yReference?: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
}>;

export type LineEffectivePointResolution = Readonly<{
  effectivePoint: DrawingPoint;
  interaction: LineToolInteraction;
}>;

const ANGULAR_DIRECTION_EPSILON = 1e-12;
const ANGULAR_COMPATIBILITY_EPSILON = 1e-9;

const directionAt = (angleDegrees: number): DrawingPoint => {
  const radians = angleDegrees * Math.PI / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  return {
    x: Math.abs(x) <= ANGULAR_DIRECTION_EPSILON ? 0 : x,
    y: Math.abs(y) <= ANGULAR_DIRECTION_EPSILON ? 0 : y,
  };
};

const isPointOnDirection = (start: DrawingPoint, point: DrawingPoint, direction: DrawingPoint) => {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const length = Math.hypot(dx, dy);
  return length > LINE_ZERO_LENGTH_TOLERANCE_MM
    && dx * direction.x + dy * direction.y >= 0
    && Math.abs(dx * direction.y - dy * direction.x) <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, length);
};

const reconcileAlignmentOnRay = (
  start: DrawingPoint,
  angularPoint: DrawingPoint,
  angleDegrees: number,
  spatialSnap: LineSpatialSnap,
): DrawingPoint => {
  const direction = directionAt(angleDegrees);
  const intersections = [
    spatialSnap.xReference && Math.abs(direction.x) > ANGULAR_DIRECTION_EPSILON
      ? { axis: 'x' as const, target: spatialSnap.xReference.candidatePoint.x, t: (spatialSnap.xReference.candidatePoint.x - start.x) / direction.x, distance: spatialSnap.xReference.screenDistance }
      : null,
    spatialSnap.yReference && Math.abs(direction.y) > ANGULAR_DIRECTION_EPSILON
      ? { axis: 'y' as const, target: spatialSnap.yReference.candidatePoint.y, t: (spatialSnap.yReference.candidatePoint.y - start.y) / direction.y, distance: spatialSnap.yReference.screenDistance }
      : null,
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null && Number.isFinite(candidate.t) && candidate.t >= 0);
  if (intersections.length === 0) return angularPoint;

  const [first, second] = intersections;
  if (second && Math.abs(first.t - second.t) <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, first.t, second.t)) {
    const candidate = { x: spatialSnap.xReference!.candidatePoint.x, y: spatialSnap.yReference!.candidatePoint.y };
    if (isPointOnDirection(start, candidate, direction)) return candidate;
  }
  const chosen = second && second.distance < first.distance ? second : first;
  const point = { x: start.x + chosen.t * direction.x, y: start.y + chosen.t * direction.y };
  return chosen.axis === 'x' ? { ...point, x: chosen.target } : { ...point, y: chosen.target };
};

/** Resolves one authoritative Line endpoint and its matching angular presentation state. */
export const resolveLineEffectivePoint = (
  interaction: LineToolInteraction,
  rawPointerPoint: DrawingPoint,
  spatialSnap: LineSpatialSnap,
): LineEffectivePointResolution => {
  if (!interaction.start) return { effectivePoint: spatialSnap.effectivePoint, interaction };

  if (spatialSnap.type === 'endpoint' || spatialSnap.type === 'line') {
    const spatialAngle = resolveLinePreviewPoint(interaction.start, spatialSnap.effectivePoint);
    const direction = spatialAngle.snappedAngleDegrees === null ? null : directionAt(spatialAngle.snappedAngleDegrees);
    const angularExact = direction !== null && isPointOnDirection(interaction.start, spatialSnap.effectivePoint, direction);
    const nextInteraction = {
      ...interaction,
      rawPointerPoint,
      effectivePreviewPoint: spatialSnap.effectivePoint,
      snapActive: angularExact,
      snappedAngleDegrees: angularExact ? spatialAngle.snappedAngleDegrees : null,
    };
    return { effectivePoint: spatialSnap.effectivePoint, interaction: nextInteraction };
  }

  const angular = resolveLinePreviewPoint(interaction.start, rawPointerPoint);
  if (!angular.snapActive || angular.snappedAngleDegrees === null) {
    const effectivePoint = spatialSnap.active ? spatialSnap.effectivePoint : rawPointerPoint;
    return { effectivePoint, interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snapActive: false, snappedAngleDegrees: null } };
  }
  const direction = directionAt(angular.snappedAngleDegrees);
  const radialDistance = Math.hypot(rawPointerPoint.x - interaction.start.x, rawPointerPoint.y - interaction.start.y);
  const angularPoint = {
    x: interaction.start.x + radialDistance * direction.x,
    y: interaction.start.y + radialDistance * direction.y,
  };
  const effectivePoint = spatialSnap.type === 'alignment'
    ? reconcileAlignmentOnRay(interaction.start, angularPoint, angular.snappedAngleDegrees, spatialSnap)
    : angularPoint;
  return {
    effectivePoint,
    interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snapActive: true, snappedAngleDegrees: angular.snappedAngleDegrees },
  };
};

/**
 * Arbitrates a globally snapped point with Line's angular presentation. Spatial snap owns the
 * endpoint; angular state is recomputed from that endpoint so compatible inferences coexist and
 * an incompatible/stale angle can never describe different geometry.
 */
export const updateLinePreviewAtSpatialPoint = (interaction: LineToolInteraction, rawPointerPoint: DrawingPoint, effectivePreviewPoint: DrawingPoint): LineToolInteraction => {
  if (!interaction.start) return interaction;
  const effectiveInference = resolveLinePreviewPoint(interaction.start, effectivePreviewPoint);
  const compatible = effectiveInference.snapActive;
  return {
    ...interaction,
    rawPointerPoint,
    effectivePreviewPoint,
    snapActive: compatible,
    snappedAngleDegrees: compatible ? effectiveInference.snappedAngleDegrees : null,
  };
};

export const cancelLineInteraction = (): LineToolInteraction => EMPTY_LINE_INTERACTION;

export type LineClickResult = Readonly<{
  interaction: LineToolInteraction;
  entity: DrawingLineDraft | null;
}>;

export const applyLineClick = (
  interaction: LineToolInteraction,
  point: DrawingPoint,
  createId: () => string,
): LineClickResult => {
  if (!interaction.start) return {
    interaction: { ...EMPTY_LINE_INTERACTION, start: point, rawPointerPoint: point, effectivePreviewPoint: point },
    entity: null,
  };
  const preview = resolveLinePreviewPoint(interaction.start, point);
  const effectivePoint = preview.effectivePreviewPoint;
  const dx = effectivePoint.x - interaction.start.x;
  const dy = effectivePoint.y - interaction.start.y;
  if (Math.hypot(dx, dy) <= LINE_ZERO_LENGTH_TOLERANCE_MM) {
    return { interaction: { ...interaction, ...preview }, entity: null };
  }
  return {
    interaction: {
      ...EMPTY_LINE_INTERACTION,
      start: effectivePoint,
      rawPointerPoint: effectivePoint,
      effectivePreviewPoint: effectivePoint,
    },
    entity: { id: createId(), type: 'line', start: interaction.start, end: effectivePoint },
  };
};

/** Commits a point already resolved by global/tool arbitration without reapplying angular inference. */
export const applyResolvedLineClick = (interaction: LineToolInteraction, point: DrawingPoint, createId: () => string, pointId: string | null = null): LineClickResult => {
  if (!interaction.start) return { interaction: { ...EMPTY_LINE_INTERACTION, start: point, startPointId: pointId, rawPointerPoint: point, effectivePreviewPoint: point }, entity: null };
  if (Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y) <= LINE_ZERO_LENGTH_TOLERANCE_MM) return { interaction, entity: null };
  return {
    interaction: { ...EMPTY_LINE_INTERACTION, start: point, startPointId: pointId, rawPointerPoint: point, effectivePreviewPoint: point },
    entity: { id: createId(), type: 'line', start: interaction.start, end: point, startPointId: interaction.startPointId ?? undefined, endPointId: pointId ?? undefined },
  };
};

/** Immutably appends an entity to the active sketch. Invalid active sketch ids are rejected. */
export const appendEntityToActiveSketch = (
  document: DrawingDocumentV2,
  entity: DrawingLineDraft,
  createPointId: () => string = () => `point-${crypto.randomUUID()}`,
): DrawingDocumentV2 => {
  const activeSketch = document.sketches[document.activeSketchId];
  if (!activeSketch || activeSketch.entities[entity.id]) return document;
  const startPointId = entity.startPointId ?? createPointId();
  const endPointId = entity.endPointId ?? createPointId();
  const line: DrawingLineEntity = { id: entity.id, type: 'line', startPointId, endPointId };
  return {
    ...document,
    sketches: {
      ...document.sketches,
      [activeSketch.id]: {
        ...activeSketch,
        points: {
          ...activeSketch.points,
          ...(activeSketch.points[startPointId] ? {} : { [startPointId]: { id: startPointId, ...entity.start } }),
          ...(activeSketch.points[endPointId] ? {} : { [endPointId]: { id: endPointId, ...entity.end } }),
        },
        entities: { ...activeSketch.entities, [entity.id]: line },
        entityOrder: [...activeSketch.entityOrder, entity.id],
      },
    },
  };
};
