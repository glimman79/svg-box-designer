import type { DrawingDocumentV2, DrawingGeometricConstraint, DrawingLineEntity, DrawingPoint } from './drawingTypes';
import { canonicalCoincidentPointPair } from './drawingCoincidentConstraint.js';

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
  perpendicularLineId: string | null;
  previousChainedLineId: string | null;
}>;

export const EMPTY_LINE_INTERACTION: LineToolInteraction = {
  start: null,
  startPointId: null,
  rawPointerPoint: null,
  effectivePreviewPoint: null,
  snapActive: false,
  snappedAngleDegrees: null,
  perpendicularLineId: null,
  previousChainedLineId: null,
};

export const updateLinePreview = (interaction: LineToolInteraction, pointer: DrawingPoint): LineToolInteraction => (
  interaction.start ? { ...interaction, ...resolveLinePreviewPoint(interaction.start, pointer), perpendicularLineId: null } : interaction
);

type LineSpatialSnap = Readonly<{
  active: boolean;
  type: 'none' | 'endpoint' | 'line' | 'alignment' | 'perpendicular';
  entityId?: string;
  effectivePoint: DrawingPoint;
  xReference?: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
  yReference?: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
  lineStart?: DrawingPoint;
  lineEnd?: DrawingPoint;
  channels?: Readonly<{
    xAlignment: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
    yAlignment: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
    perpendicular: Readonly<{ entityId: string; candidatePoint: DrawingPoint; screenDistance: number }> | null;
  }>;
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

const intersectRayWithFiniteSegment = (origin: DrawingPoint, direction: DrawingPoint, a?: DrawingPoint, b?: DrawingPoint): DrawingPoint | null => {
  if (!a || !b) return null;
  const sx = b.x - a.x, sy = b.y - a.y;
  const denominator = direction.x * sy - direction.y * sx;
  if (Math.abs(denominator) <= ANGULAR_DIRECTION_EPSILON) return null;
  const ax = a.x - origin.x, ay = a.y - origin.y;
  const rayParameter = (ax * sy - ay * sx) / denominator;
  const segmentParameter = (ax * direction.y - ay * direction.x) / denominator;
  if (rayParameter < 0 || segmentParameter < -ANGULAR_COMPATIBILITY_EPSILON || segmentParameter > 1 + ANGULAR_COMPATIBILITY_EPSILON) return null;
  return { x: origin.x + rayParameter * direction.x, y: origin.y + rayParameter * direction.y };
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
  previousChainedAxisKind: 'HORIZONTAL' | 'VERTICAL' | null = null,
  ctrlOverride = false,
): LineEffectivePointResolution => {
  if (!interaction.start) return { effectivePoint: ctrlOverride ? rawPointerPoint : spatialSnap.effectivePoint, interaction };
  // Layer 0 is repeated here as the final correctness guard. Future candidate
  // channels cannot accidentally reintroduce Line authoring inference under Ctrl.
  if (ctrlOverride) return {
    effectivePoint: rawPointerPoint,
    interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: rawPointerPoint, snapActive: false, snappedAngleDegrees: null, perpendicularLineId: null },
  };

  // Axis intent is accepted from the Line tool's angular inference, not inferred
  // from the eventual coordinates.  It has CATIA-style priority over a
  // simultaneously available perpendicular spatial candidate.
  const angular = resolveLinePreviewPoint(interaction.start, rawPointerPoint);
  const acceptedAxis = angular.snapActive && angular.snappedAngleDegrees !== null
    && [0, 90, 180, 270].includes(normalizeDegrees(angular.snappedAngleDegrees));
  if (acceptedAxis && spatialSnap.type === 'perpendicular') {
    const direction = directionAt(angular.snappedAngleDegrees!);
    const radialDistance = Math.hypot(rawPointerPoint.x - interaction.start.x, rawPointerPoint.y - interaction.start.y);
    const effectivePoint = {
      x: interaction.start.x + radialDistance * direction.x,
      y: interaction.start.y + radialDistance * direction.y,
    };
    return {
      effectivePoint,
      interaction: { ...interaction, ...angular, effectivePreviewPoint: effectivePoint, perpendicularLineId: null },
    };
  }

  // A perpendicular accepted against the directly previous authored segment
  // carries enough semantic information to continue an axis-constrained chain,
  // even when the raw pointer lies outside Line's independent angular window.
  if (spatialSnap.type === 'perpendicular'
    && spatialSnap.entityId === interaction.previousChainedLineId
    && previousChainedAxisKind) {
    const snappedAngleDegrees = previousChainedAxisKind === 'HORIZONTAL' ? 90 : 0;
    const effectivePoint = previousChainedAxisKind === 'HORIZONTAL'
      ? { x: interaction.start.x, y: spatialSnap.effectivePoint.y }
      : { x: spatialSnap.effectivePoint.x, y: interaction.start.y };
    return {
      effectivePoint,
      interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snapActive: true, snappedAngleDegrees, perpendicularLineId: null },
    };
  }

  if (spatialSnap.type === 'perpendicular') return {
    effectivePoint: spatialSnap.effectivePoint,
    interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: spatialSnap.effectivePoint, snapActive: true, snappedAngleDegrees: null, perpendicularLineId: spatialSnap.entityId ?? null },
  };

  if (spatialSnap.type === 'endpoint' || spatialSnap.type === 'line') {
    // Endpoint/finite target owns position. Construction proposals are validation
    // outputs only: incompatible semantics and guides disappear rather than move it.
    const direction = angular.snappedAngleDegrees === null ? null : directionAt(angular.snappedAngleDegrees);
    // A construction ray may compose with a finite Line. Never intersect its
    // infinite support when the result falls outside the segment.
    const composedLinePoint = spatialSnap.type === 'line' && direction
      ? intersectRayWithFiniteSegment(interaction.start, direction, spatialSnap.lineStart, spatialSnap.lineEnd) : null;
    const acceptedPoint = composedLinePoint ?? spatialSnap.effectivePoint;
    const angularExact = direction !== null && isPointOnDirection(interaction.start, acceptedPoint, direction);
    const perpendicular = spatialSnap.channels?.perpendicular ?? null;
    const perpendicularExact = perpendicular !== null
      && Math.hypot(perpendicular.candidatePoint.x - acceptedPoint.x, perpendicular.candidatePoint.y - acceptedPoint.y)
        <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, Math.hypot(acceptedPoint.x - interaction.start.x, acceptedPoint.y - interaction.start.y));
    const nextInteraction = {
      ...interaction,
      rawPointerPoint,
      effectivePreviewPoint: acceptedPoint,
      snapActive: angularExact,
      snappedAngleDegrees: angularExact ? angular.snappedAngleDegrees : null,
      perpendicularLineId: perpendicularExact ? perpendicular.entityId : null,
    };
    return { effectivePoint: acceptedPoint, interaction: nextInteraction };
  }

  if (!angular.snapActive || angular.snappedAngleDegrees === null) {
    const effectivePoint = spatialSnap.active ? spatialSnap.effectivePoint : rawPointerPoint;
    return { effectivePoint, interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snapActive: false, snappedAngleDegrees: null, perpendicularLineId: null } };
  }
  const direction = directionAt(angular.snappedAngleDegrees);
  const radialDistance = Math.hypot(rawPointerPoint.x - interaction.start.x, rawPointerPoint.y - interaction.start.y);
  const angularPoint = {
    x: interaction.start.x + radialDistance * direction.x,
    y: interaction.start.y + radialDistance * direction.y,
  };
  const alignmentSnap = spatialSnap.channels && (spatialSnap.channels.xAlignment || spatialSnap.channels.yAlignment)
    ? { ...spatialSnap, xReference: spatialSnap.channels.xAlignment, yReference: spatialSnap.channels.yAlignment }
    : spatialSnap;
  const effectivePoint = alignmentSnap.type === 'alignment' || spatialSnap.channels?.xAlignment || spatialSnap.channels?.yAlignment
    ? reconcileAlignmentOnRay(interaction.start, angularPoint, angular.snappedAngleDegrees, alignmentSnap)
    : angularPoint;
  return {
    effectivePoint,
    interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snapActive: true, snappedAngleDegrees: angular.snappedAngleDegrees, perpendicularLineId: null },
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
    perpendicularLineId: null,
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
  const id = createId();
  return {
    interaction: {
      ...EMPTY_LINE_INTERACTION,
      start: effectivePoint,
      rawPointerPoint: effectivePoint,
      effectivePreviewPoint: effectivePoint,
      previousChainedLineId: id,
    },
    entity: { id, type: 'line', start: interaction.start, end: effectivePoint },
  };
};

/** Commits a point already resolved by global/tool arbitration without reapplying angular inference. */
export const applyResolvedLineClick = (interaction: LineToolInteraction, point: DrawingPoint, createId: () => string, pointId: string | null = null): LineClickResult => {
  if (!interaction.start) return { interaction: { ...EMPTY_LINE_INTERACTION, start: point, startPointId: pointId, rawPointerPoint: point, effectivePreviewPoint: point }, entity: null };
  if (Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y) <= LINE_ZERO_LENGTH_TOLERANCE_MM) return { interaction, entity: null };
  const id = createId();
  return {
    interaction: { ...EMPTY_LINE_INTERACTION, start: point, startPointId: pointId, rawPointerPoint: point, effectivePreviewPoint: point, previousChainedLineId: id },
    entity: { id, type: 'line', start: interaction.start, end: point, startPointId: interaction.startPointId ?? undefined, endPointId: pointId ?? undefined },
  };
};

/** Immutably appends an entity to the active sketch. Invalid active sketch ids are rejected. */
export const appendEntityToActiveSketch = (
  document: DrawingDocumentV2,
  entity: DrawingLineDraft,
  createPointId: () => string = () => `point-${crypto.randomUUID()}`,
  automaticConstraintKind: 'HORIZONTAL' | 'VERTICAL' | null = null,
  perpendicularLineId: string | null = null,
  acceptedEndpointSnaps: Readonly<{ startPointId?: string; endPointId?: string }> | null = null,
): DrawingDocumentV2 => {
  const activeSketch = document.sketches[document.activeSketchId];
  if (!activeSketch || activeSketch.entities[entity.id]) return document;
  const startPointId = entity.startPointId ?? createPointId();
  const endPointId = entity.endPointId ?? createPointId();
  const line: DrawingLineEntity = { id: entity.id, type: 'line', startPointId, endPointId };
  const constraintId = automaticConstraintKind ? `${automaticConstraintKind.toLowerCase()}:${entity.id}` : null;
  const duplicate = automaticConstraintKind && Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) =>
    constraint.kind === automaticConstraintKind && constraint.references[0]?.entityId === entity.id);
  const automaticConstraint: DrawingGeometricConstraint | null = constraintId && !duplicate
    ? { id: constraintId, kind: automaticConstraintKind!, references: [{ kind: 'entity', entityId: entity.id }] }
    : null;
  // Accepted axis intent already expresses the right-angle chain; preserve the
  // D2.5e6c policy by avoiding a redundant Perpendicular relation there.
  const pair = !automaticConstraintKind && perpendicularLineId && activeSketch.entities[perpendicularLineId] ? [entity.id, perpendicularLineId].sort() : null;
  const perpendicularId = pair ? `perpendicular:${pair[0]}:${pair[1]}` : null;
  const perpendicularDuplicate = pair && Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'PERPENDICULAR'
    && constraint.references.map(({ entityId }) => entityId).sort().join(':') === pair.join(':'));
  const perpendicularConstraint: DrawingGeometricConstraint | null = perpendicularId && pair && !perpendicularDuplicate
    ? { id: perpendicularId, kind: 'PERPENDICULAR', references: pair.map((entityId) => ({ kind: 'entity' as const, entityId })) as [{ kind: 'entity'; entityId: string }, { kind: 'entity'; entityId: string }] }
    : null;
  const coincidentConstraints = ([['startPointId', startPointId], ['endPointId', endPointId]] as const).flatMap(([endpoint, createdPointId]) => {
    const targetPointId = acceptedEndpointSnaps?.[endpoint];
    const pointPair = targetPointId && activeSketch.points[targetPointId] ? canonicalCoincidentPointPair(createdPointId, targetPointId) : null;
    if (!pointPair) return [];
    const duplicatePair = Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT'
      && constraint.references.map(({ pointId }) => pointId).sort().join('\0') === pointPair.join('\0'));
    if (duplicatePair) return [];
    return [{ id: `coincident:${pointPair[0]}:${pointPair[1]}`, kind: 'COINCIDENT' as const,
      references: pointPair.map((pointId) => ({ kind: 'sketchPoint' as const, pointId })) as [{ kind: 'sketchPoint'; pointId: string }, { kind: 'sketchPoint'; pointId: string }] }];
  });
  const addedConstraints = [automaticConstraint, perpendicularConstraint, ...coincidentConstraints].filter(Boolean) as DrawingGeometricConstraint[];
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
        geometricConstraints: addedConstraints.length ? { ...(activeSketch.geometricConstraints ?? {}), ...Object.fromEntries(addedConstraints.map((constraint) => [constraint.id, constraint])) } : activeSketch.geometricConstraints,
        geometricConstraintOrder: addedConstraints.length ? [...(activeSketch.geometricConstraintOrder ?? []), ...addedConstraints.map(({ id }) => id)] : activeSketch.geometricConstraintOrder,
      },
    },
  };
};

/** Maps only the accepted angular-inference state, never rounded geometry, to design intent. */
export const automaticAxisConstraintKind = (interaction: LineToolInteraction): 'HORIZONTAL' | 'VERTICAL' | null => {
  if (!interaction.snapActive || interaction.snappedAngleDegrees === null) return null;
  const angle = normalizeDegrees(interaction.snappedAngleDegrees);
  return angle === 0 || angle === 180 ? 'HORIZONTAL' : angle === 90 || angle === 270 ? 'VERTICAL' : null;
};
