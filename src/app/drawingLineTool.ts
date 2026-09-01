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
