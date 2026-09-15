import { DRAWING_MODEL_SPACE_TOLERANCE, type DrawingDocumentV2, type DrawingGeometricConstraint, type DrawingLineEntity, type DrawingPoint } from './drawingTypes.js';
import type { DrawingInference } from './drawingInference';
import { canonicalCoincidentPointPair } from './drawingCoincidentConstraint.js';

export type DrawingLineDraft = Readonly<{ id: string; type: 'line'; start: DrawingPoint; end: DrawingPoint; startPointId?: string; endPointId?: string }>;

export const LINE_ZERO_LENGTH_TOLERANCE_MM = DRAWING_MODEL_SPACE_TOLERANCE;
export const LINE_ANGULAR_SNAP_INCREMENT_DEGREES = 22.5;
// Inclusive practical window: (100, 90) is the canonical near-45° gesture
// (3.013° away), so retain the intended approximate three-degree feel.
export const LINE_ANGULAR_SNAP_TOLERANCE_DEGREES = 3.1;

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
  startLineId: string | null;
  startMidpointLineId: string | null;
  rawPointerPoint: DrawingPoint | null;
  effectivePreviewPoint: DrawingPoint | null;
  snappedAngleDegrees: number | null;
  perpendicularLineId: string | null;
  parallelLineId: string | null;
  midpointLineId: string | null;
  lineBodyId: string | null;
  previousChainedLineId: string | null;
}>;

export const EMPTY_LINE_INTERACTION: LineToolInteraction = {
  start: null,
  startPointId: null,
  startLineId: null,
  startMidpointLineId: null,
  rawPointerPoint: null,
  effectivePreviewPoint: null,
  snappedAngleDegrees: null,
  perpendicularLineId: null,
  parallelLineId: null,
  midpointLineId: null,
  lineBodyId: null,
  previousChainedLineId: null,
};

export const updateLinePreview = (interaction: LineToolInteraction, pointer: DrawingPoint): LineToolInteraction => (
  interaction.start ? (() => {
    const preview = resolveLinePreviewPoint(interaction.start!, pointer);
    return { ...interaction, rawPointerPoint: preview.rawPointerPoint, effectivePreviewPoint: preview.effectivePreviewPoint,
      snappedAngleDegrees: preview.snappedAngleDegrees, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null };
  })() : interaction
);

type LineAlignmentXReference = Extract<DrawingInference, { type: 'alignment-x' }>;
type LineAlignmentYReference = Extract<DrawingInference, { type: 'alignment-y' }>;

type LineSpatialSnap = Readonly<{
  active: boolean;
  type: 'none' | 'endpoint' | 'midpoint' | 'line' | 'alignment' | 'point-reference' | 'perpendicular' | 'parallel';
  entityId?: string;
  effectivePoint: DrawingPoint;
  xReference?: LineAlignmentXReference | null;
  yReference?: LineAlignmentYReference | null;
  lineStart?: DrawingPoint;
  lineEnd?: DrawingPoint;
  channels?: Readonly<{
    xAlignment: LineAlignmentXReference | null;
    yAlignment: LineAlignmentYReference | null;
    perpendicular: Readonly<{ entityId: string; candidatePoint: DrawingPoint; screenDistance: number;
      lineStart?: DrawingPoint; lineEnd?: DrawingPoint }> | null;
    parallel: Readonly<{ entityId: string; candidatePoint: DrawingPoint; screenDistance: number;
      lineStart?: DrawingPoint; lineEnd?: DrawingPoint }> | null;
    pointReference?: Readonly<{ candidatePoint: DrawingPoint; screenDistance: number }> | null;
  }>;
}>;

export type LineEffectivePointResolution = Readonly<{
  effectivePoint: DrawingPoint;
  interaction: LineToolInteraction;
  resolvedReferences: Readonly<{
    x: LineAlignmentXReference | null;
    y: LineAlignmentYReference | null;
  }>;
  diagnostic?: Readonly<{
    finalAxisAngle: 0 | 90 | 180 | 270 | null;
    directionalSemanticsBeforeAxisFinalization: Readonly<{ perpendicularLineId: string | null; parallelLineId: string | null }>;
  }>;
}>;

const ANGULAR_DIRECTION_EPSILON = 1e-12;
const ANGULAR_COMPATIBILITY_EPSILON = DRAWING_MODEL_SPACE_TOLERANCE;

const coordinatesGeometricallyEqual = (first: number, second: number) => Math.abs(first - second)
  <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, Math.abs(first), Math.abs(second));

const resolvedReferencesAt = (point: DrawingPoint, spatialSnap: LineSpatialSnap) => {
  const x = spatialSnap.channels?.xAlignment ?? spatialSnap.xReference ?? null;
  const y = spatialSnap.channels?.yAlignment ?? spatialSnap.yReference ?? null;
  return {
    x: x && coordinatesGeometricallyEqual(point.x, (x.referencePoint ?? x.candidatePoint).x)
      && !(x.positionOwnership === 'reference-only' && spatialSnap.type === 'endpoint'
        && coordinatesGeometricallyEqual(point.x, x.referencePoint!.x) && coordinatesGeometricallyEqual(point.y, x.referencePoint!.y)) ? x : null,
    y: y && coordinatesGeometricallyEqual(point.y, (y.referencePoint ?? y.candidatePoint).y)
      && !(y.positionOwnership === 'reference-only' && spatialSnap.type === 'endpoint'
        && coordinatesGeometricallyEqual(point.x, y.referencePoint!.x) && coordinatesGeometricallyEqual(point.y, y.referencePoint!.y)) ? y : null,
  };
};

const finalAxisAngle = (start: DrawingPoint | null, end: DrawingPoint): 0 | 90 | 180 | 270 | null => {
  if (!start) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= LINE_ZERO_LENGTH_TOLERANCE_MM) return null;
  if (Math.abs(dy) <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, length)) return dx >= 0 ? 0 : 180;
  if (Math.abs(dx) <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, length)) return dy >= 0 ? 90 : 270;
  return null;
};

/** Final geometry, rather than candidate acquisition order, owns automatic axis semantics. */
const lineResolution = (effectivePoint: DrawingPoint, interaction: LineToolInteraction, spatialSnap: LineSpatialSnap): LineEffectivePointResolution => {
  const axisAngle = finalAxisAngle(interaction.start, effectivePoint);
  const acceptedRelations = acceptedDirectionalRelationsAt(interaction.start, effectivePoint, spatialSnap);
  const acceptedInteraction = axisAngle === null ? interaction : {
    ...interaction,
    snappedAngleDegrees: axisAngle,
    perpendicularLineId: null,
    parallelLineId: null,
  };
  return {
    effectivePoint,
    interaction: axisAngle === null ? { ...acceptedInteraction, ...acceptedRelations } : acceptedInteraction,
    resolvedReferences: resolvedReferencesAt(effectivePoint, spatialSnap),
    diagnostic: { finalAxisAngle: axisAngle, directionalSemanticsBeforeAxisFinalization: acceptedRelations },
  };
};

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

const isPerpendicularAt = (start: DrawingPoint, end: DrawingPoint, lineStart?: DrawingPoint, lineEnd?: DrawingPoint) => {
  if (!lineStart || !lineEnd) return false;
  const authoredX = end.x - start.x, authoredY = end.y - start.y;
  const targetX = lineEnd.x - lineStart.x, targetY = lineEnd.y - lineStart.y;
  const authoredLength = Math.hypot(authoredX, authoredY), targetLength = Math.hypot(targetX, targetY);
  return authoredLength > LINE_ZERO_LENGTH_TOLERANCE_MM && targetLength > LINE_ZERO_LENGTH_TOLERANCE_MM
    && Math.abs(authoredX * targetX + authoredY * targetY)
      <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, authoredLength * targetLength);
};

const isParallelAt = (start: DrawingPoint, end: DrawingPoint, candidatePoint?: DrawingPoint) => {
  if (!candidatePoint) return false;
  const authoredX = end.x - start.x, authoredY = end.y - start.y;
  const candidateX = candidatePoint.x - start.x, candidateY = candidatePoint.y - start.y;
  const authoredLength = Math.hypot(authoredX, authoredY), candidateLength = Math.hypot(candidateX, candidateY);
  return authoredLength > LINE_ZERO_LENGTH_TOLERANCE_MM && candidateLength > LINE_ZERO_LENGTH_TOLERANCE_MM
    && Math.abs(authoredX * candidateY - authoredY * candidateX)
      <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, authoredLength * candidateLength);
};

/** Returns the common unoriented direction requested by live Parallel and
 * Perpendicular channels. Reference geometry, not candidate IDs or the
 * positional winner, owns compatibility. */
const compatibleDirectionalChannel = (spatialSnap: LineSpatialSnap): DrawingPoint | null => {
  const parallel = spatialSnap.channels?.parallel;
  const perpendicular = spatialSnap.channels?.perpendicular;
  if (!parallel?.lineStart || !parallel.lineEnd || !perpendicular?.lineStart || !perpendicular.lineEnd) return null;
  const px = parallel.lineEnd.x - parallel.lineStart.x, py = parallel.lineEnd.y - parallel.lineStart.y;
  const qx = perpendicular.lineEnd.x - perpendicular.lineStart.x, qy = perpendicular.lineEnd.y - perpendicular.lineStart.y;
  const pl = Math.hypot(px, py), ql = Math.hypot(qx, qy);
  if (pl <= LINE_ZERO_LENGTH_TOLERANCE_MM || ql <= LINE_ZERO_LENGTH_TOLERANCE_MM) return null;
  if (Math.abs(px * qx + py * qy) > ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, pl * ql)) return null;
  return { x: px / pl, y: py / pl };
};

/** Diagnostic observation of the exact common-direction gate used below. */
export const diagnoseLineCommonDirection = (spatialSnap: LineSpatialSnap) => {
  const parallel = spatialSnap.channels?.parallel;
  const perpendicular = spatialSnap.channels?.perpendicular;
  const bothChannels = Boolean(parallel && perpendicular);
  const bothReferenceGeometries = Boolean(parallel?.lineStart && parallel.lineEnd
    && perpendicular?.lineStart && perpendicular.lineEnd);
  const compatibleDirection = compatibleDirectionalChannel(spatialSnap);
  const hardPosition = spatialSnap.type === 'endpoint' || spatialSnap.type === 'midpoint' || spatialSnap.type === 'line';
  return {
    bothChannels,
    bothReferenceGeometries,
    compatible: compatibleDirection !== null,
    used: compatibleDirection !== null && !hardPosition,
    reason: compatibleDirection === null
      ? !bothChannels ? 'bypassed: both directional channels are not acquired'
        : !bothReferenceGeometries ? 'bypassed: directional reference geometry is incomplete'
          : 'bypassed: reference directions are incompatible or degenerate'
      : hardPosition ? `bypassed: snap.type=${spatialSnap.type} owns hard position` : 'used',
  } as const;
};

const projectPointerToDirection = (start: DrawingPoint, pointer: DrawingPoint, direction: DrawingPoint): DrawingPoint => {
  const radial = (pointer.x - start.x) * direction.x + (pointer.y - start.y) * direction.y;
  return { x: start.x + radial * direction.x, y: start.y + radial * direction.y };
};

/** Semantic Line relations are validated independently at the final position. */
const acceptedDirectionalRelationsAt = (
  start: DrawingPoint | null,
  end: DrawingPoint,
  spatialSnap: LineSpatialSnap,
) => {
  if (!start || finalAxisAngle(start, end) !== null) return { perpendicularLineId: null, parallelLineId: null };
  const perpendicular = spatialSnap.channels?.perpendicular ?? (spatialSnap.type === 'perpendicular' && spatialSnap.entityId
    ? { entityId: spatialSnap.entityId, candidatePoint: spatialSnap.effectivePoint, screenDistance: 0,
      lineStart: spatialSnap.lineStart, lineEnd: spatialSnap.lineEnd } : null);
  const parallel = spatialSnap.channels?.parallel ?? (spatialSnap.type === 'parallel' && spatialSnap.entityId
    ? { entityId: spatialSnap.entityId, candidatePoint: spatialSnap.effectivePoint, screenDistance: 0 } : null);
  return {
    perpendicularLineId: perpendicular && (isPerpendicularAt(start, end, perpendicular.lineStart, perpendicular.lineEnd)
      || (!perpendicular.lineStart && !perpendicular.lineEnd
        && Math.hypot(perpendicular.candidatePoint.x - end.x, perpendicular.candidatePoint.y - end.y)
          <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))))
      ? perpendicular.entityId : null,
    parallelLineId: parallel && isParallelAt(start, end, parallel.candidatePoint) ? parallel.entityId : null,
  };
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
    spatialSnap.xReference && spatialSnap.xReference.positionOwnership !== 'reference-only' && Math.abs(direction.x) > ANGULAR_DIRECTION_EPSILON
      ? { axis: 'x' as const, target: spatialSnap.xReference.candidatePoint.x, t: (spatialSnap.xReference.candidatePoint.x - start.x) / direction.x, distance: spatialSnap.xReference.screenDistance }
      : null,
    spatialSnap.yReference && spatialSnap.yReference.positionOwnership !== 'reference-only' && Math.abs(direction.y) > ANGULAR_DIRECTION_EPSILON
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
  if (!interaction.start) return lineResolution(ctrlOverride ? rawPointerPoint : spatialSnap.effectivePoint, interaction, spatialSnap);
  // Layer 0 is repeated here as the final correctness guard. Future candidate
  // channels cannot accidentally reintroduce Line authoring inference under Ctrl.
  if (ctrlOverride) return {
    effectivePoint: rawPointerPoint,
    interaction: { ...interaction, rawPointerPoint, effectivePreviewPoint: rawPointerPoint, snappedAngleDegrees: null, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null },
    resolvedReferences: { x: null, y: null },
    diagnostic: { finalAxisAngle: null, directionalSemanticsBeforeAxisFinalization: { perpendicularLineId: null, parallelLineId: null } },
  };

  // Compatibility is resolved before positional priority. Soft construction
  // winners (including point-reference/alignment) may position the cursor, but
  // may not bend a direction shared by two actual reference Lines. Exact
  // endpoint/midpoint/finite-Line position remains authoritative and is merely
  // truth-checked by lineResolution.
  const commonDirection = compatibleDirectionalChannel(spatialSnap);
  if (commonDirection && spatialSnap.type !== 'endpoint' && spatialSnap.type !== 'midpoint' && spatialSnap.type !== 'line') {
    const effectivePoint = projectPointerToDirection(interaction.start, rawPointerPoint, commonDirection);
    return lineResolution(effectivePoint, { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint,
      snappedAngleDegrees: null, midpointLineId: null, lineBodyId: null }, spatialSnap);
  }

  // Raw-pointer axis intent has priority over a simultaneously available
  // Line-to-Line candidate. The centralized final-geometry guard below also
  // covers an axis produced by the candidate itself.
  const angular = resolveLinePreviewPoint(interaction.start, rawPointerPoint);
  const acceptedAxis = angular.snapActive && angular.snappedAngleDegrees !== null
    && [0, 90, 180, 270].includes(normalizeDegrees(angular.snappedAngleDegrees));
  if (acceptedAxis && (spatialSnap.type === 'perpendicular' || spatialSnap.type === 'parallel')) {
    const direction = directionAt(angular.snappedAngleDegrees!);
    const radialDistance = Math.hypot(rawPointerPoint.x - interaction.start.x, rawPointerPoint.y - interaction.start.y);
    const effectivePoint = {
      x: interaction.start.x + radialDistance * direction.x,
      y: interaction.start.y + radialDistance * direction.y,
    };
    return lineResolution(effectivePoint, { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint,
      snappedAngleDegrees: angular.snappedAngleDegrees, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null }, spatialSnap);
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
    return lineResolution(effectivePoint,
      { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snappedAngleDegrees, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null }, spatialSnap);
  }

  // The snap winner owns only the endpoint. Do not make this branch a second,
  // winner-only semantic authority: lineResolution independently validates both
  // acquired channels against that endpoint and writes both accepted relation
  // IDs. In particular, acquiring Perpendicular must not clear an already
  // compatible Parallel relation (or vice versa) before reconciliation.
  if (spatialSnap.type === 'perpendicular' || spatialSnap.type === 'parallel') return lineResolution(spatialSnap.effectivePoint,
    { ...interaction, rawPointerPoint, effectivePreviewPoint: spatialSnap.effectivePoint, snappedAngleDegrees: null,
      midpointLineId: null, lineBodyId: null }, spatialSnap);

  if (spatialSnap.type === 'endpoint' || spatialSnap.type === 'midpoint' || spatialSnap.type === 'line') {
    // An endpoint owns its exact position; a finite Line owns its positional support.
    // Compatible direction authority may select the point where its ray meets that support.
    const direction = angular.snappedAngleDegrees === null ? null : directionAt(angular.snappedAngleDegrees);
    const perpendicular = acceptedAxis ? null : spatialSnap.channels?.perpendicular ?? null;
    const perpendicularDirection = perpendicular && perpendicular.entityId === spatialSnap.entityId
      ? (() => {
        const dx = perpendicular.candidatePoint.x - interaction.start!.x;
        const dy = perpendicular.candidatePoint.y - interaction.start!.y;
        const length = Math.hypot(dx, dy);
        return length > LINE_ZERO_LENGTH_TOLERANCE_MM ? { x: dx / length, y: dy / length } : null;
      })()
      : null;
    // A construction ray may compose with a finite Line. Never intersect its
    // infinite support when the result falls outside the segment.
    const perpendicularLinePoint = spatialSnap.type === 'line' && perpendicularDirection
      ? intersectRayWithFiniteSegment(interaction.start, perpendicularDirection, spatialSnap.lineStart, spatialSnap.lineEnd) : null;
    const angularLinePoint = spatialSnap.type === 'line' && direction
      ? intersectRayWithFiniteSegment(interaction.start, direction, spatialSnap.lineStart, spatialSnap.lineEnd) : null;
    const acceptedPoint = perpendicularLinePoint ?? angularLinePoint ?? spatialSnap.effectivePoint;
    const angularExact = direction !== null && isPointOnDirection(interaction.start, acceptedPoint, direction);
    // A compatible endpoint/finite-Line position may preserve H/V, but no
    // lower-priority Line relation may coexist with that axis authority.
    const perpendicularExact = perpendicular !== null && (isPerpendicularAt(
      interaction.start, acceptedPoint, perpendicular.lineStart, perpendicular.lineEnd,
    ) || (!perpendicular.lineStart && !perpendicular.lineEnd
      && Math.hypot(perpendicular.candidatePoint.x - acceptedPoint.x, perpendicular.candidatePoint.y - acceptedPoint.y)
        <= ANGULAR_COMPATIBILITY_EPSILON * Math.max(1, Math.hypot(acceptedPoint.x - interaction.start.x, acceptedPoint.y - interaction.start.y))));
    const parallel = spatialSnap.type === 'midpoint' && !acceptedAxis ? spatialSnap.channels?.parallel ?? null : null;
    const parallelExact = parallel !== null && isParallelAt(interaction.start, acceptedPoint, parallel.candidatePoint);
    const nextInteraction = {
      ...interaction,
      rawPointerPoint,
      effectivePreviewPoint: acceptedPoint,
      snappedAngleDegrees: angularExact ? angular.snappedAngleDegrees : null,
      perpendicularLineId: perpendicularExact ? perpendicular.entityId : null,
      parallelLineId: parallelExact ? parallel.entityId : null,
      midpointLineId: spatialSnap.type === 'midpoint' ? spatialSnap.entityId ?? null : null,
      lineBodyId: spatialSnap.type === 'line' ? spatialSnap.entityId ?? null : null,
    };
    return lineResolution(acceptedPoint, nextInteraction, spatialSnap);
  }

  if (!angular.snapActive || angular.snappedAngleDegrees === null) {
    const effectivePoint = spatialSnap.active ? spatialSnap.effectivePoint : rawPointerPoint;
    return lineResolution(effectivePoint,
      { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snappedAngleDegrees: null, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null }, spatialSnap);
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
  return lineResolution(effectivePoint,
    { ...interaction, rawPointerPoint, effectivePreviewPoint: effectivePoint, snappedAngleDegrees: angular.snappedAngleDegrees, perpendicularLineId: null, parallelLineId: null, midpointLineId: null, lineBodyId: null }, spatialSnap);
};

/**
 * Arbitrates a globally snapped point with Line's angular presentation. Spatial snap owns the
 * endpoint; angular state is recomputed from that endpoint so compatible inferences coexist and
 * an incompatible/stale angle can never describe different geometry.
 */
export const updateLinePreviewAtSpatialPoint = (interaction: LineToolInteraction, rawPointerPoint: DrawingPoint, effectivePreviewPoint: DrawingPoint): LineToolInteraction => {
  if (!interaction.start) return interaction;
  const effectiveInference = resolveLinePreviewPoint(interaction.start, effectivePreviewPoint);
  const nextInteraction = {
    ...interaction,
    rawPointerPoint,
    effectivePreviewPoint,
    snappedAngleDegrees: effectiveInference.snappedAngleDegrees,
    perpendicularLineId: null,
  };
  return finalAxisAngle(interaction.start, effectivePreviewPoint) === null ? nextInteraction : {
    ...nextInteraction,
    parallelLineId: null,
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
export const applyResolvedLineClick = (interaction: LineToolInteraction, point: DrawingPoint, createId: () => string, pointId: string | null = null, lineId: string | null = null, midpointLineId: string | null = null): LineClickResult => {
  if (!interaction.start) return { interaction: { ...EMPTY_LINE_INTERACTION, start: point, startPointId: pointId, startLineId: lineId, startMidpointLineId: midpointLineId, rawPointerPoint: point, effectivePreviewPoint: point }, entity: null };
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
  parallelLineId: string | null = null,
  acceptedLineBodySnaps: Readonly<{ startLineId?: string; endLineId?: string }> | null = null,
  acceptedMidpointSnaps: Readonly<{ startLineId?: string; endLineId?: string }> | null = null,
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
  const parallelPair = !automaticConstraintKind && parallelLineId && activeSketch.entities[parallelLineId] ? [entity.id, parallelLineId].sort() : null;
  const parallelId = parallelPair ? `parallel:${parallelPair[0]}:${parallelPair[1]}` : null;
  const parallelDuplicate = parallelPair && Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'PARALLEL'
    && constraint.references.map(({ entityId }) => entityId).sort().join(':') === parallelPair.join(':'));
  const parallelConstraint: DrawingGeometricConstraint | null = parallelId && parallelPair && !parallelDuplicate
    ? { id: parallelId, kind: 'PARALLEL', references: parallelPair.map((entityId) => ({ kind: 'entity' as const, entityId })) as [{ kind: 'entity'; entityId: string }, { kind: 'entity'; entityId: string }] }
    : null;
  const coincidentConstraints = ([['startPointId', startPointId], ['endPointId', endPointId]] as const).flatMap(([endpoint, createdPointId]) => {
    const targetPointId = acceptedEndpointSnaps?.[endpoint];
    const pointPair = targetPointId && activeSketch.points[targetPointId] ? canonicalCoincidentPointPair(createdPointId, targetPointId) : null;
    if (!pointPair) return [];
    const duplicatePair = Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT' && constraint.variant !== 'point-linear-support'
      && constraint.references.map(({ pointId }) => pointId).sort().join('\0') === pointPair.join('\0'));
    if (duplicatePair) return [];
    return [{ id: `coincident:${pointPair[0]}:${pointPair[1]}`, kind: 'COINCIDENT' as const, variant: 'point-point' as const,
      references: pointPair.map((pointId) => ({ kind: 'sketchPoint' as const, pointId })) as [{ kind: 'sketchPoint'; pointId: string }, { kind: 'sketchPoint'; pointId: string }] }];
  });
  const pointOnLineConstraints = ([['startLineId', startPointId], ['endLineId', endPointId]] as const).flatMap(([endpoint, pointId]) => {
    const targetLineId = acceptedLineBodySnaps?.[endpoint];
    const targetLine = targetLineId ? activeSketch.entities[targetLineId] : null;
    if (!targetLine || targetLine.type !== 'line' || targetLine.startPointId === pointId || targetLine.endPointId === pointId) return [];
    const duplicate = Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT'
      && constraint.variant === 'point-linear-support' && constraint.references[0].pointId === pointId
      && constraint.references[1].entityId === targetLineId);
    return duplicate ? [] : [{ id: `coincident:${pointId}:support:${targetLineId}`, kind: 'COINCIDENT' as const,
      variant: 'point-linear-support' as const, references: [{ kind: 'sketchPoint' as const, pointId }, { kind: 'entity' as const, entityId: targetLineId }] as const }];
  });
  const midpointConstraints = ([['startLineId', startPointId], ['endLineId', endPointId]] as const).flatMap(([endpoint, pointId]) => {
    const targetLineId = acceptedMidpointSnaps?.[endpoint];
    const targetLine = targetLineId ? activeSketch.entities[targetLineId] : null;
    if (!targetLine || targetLine.type !== 'line' || targetLine.startPointId === pointId || targetLine.endPointId === pointId) return [];
    return [{ id: `midpoint:${pointId}:${targetLineId}`, kind: 'MIDPOINT' as const,
      references: [{ kind: 'sketchPoint' as const, pointId }, { kind: 'entity' as const, entityId: targetLineId }] as const }];
  });
  const midpointKeys = new Set(midpointConstraints.map((constraint) => `${constraint.references[0].pointId}\0${constraint.references[1].entityId}`));
  const normalizedPointOnLineConstraints = pointOnLineConstraints.filter((constraint) =>
    !midpointKeys.has(`${constraint.references[0].pointId}\0${constraint.references[1].entityId}`));
  const redundantCoincidenceIds = new Set(Object.values(activeSketch.geometricConstraints ?? {}).filter((constraint) =>
    constraint.kind === 'COINCIDENT' && constraint.variant === 'point-linear-support'
    && midpointKeys.has(`${constraint.references[0].pointId}\0${constraint.references[1].entityId}`)).map(({ id }) => id));
  const retainedConstraints = Object.fromEntries(Object.entries(activeSketch.geometricConstraints ?? {}).filter(([id]) => !redundantCoincidenceIds.has(id)));
  const addedConstraints = [automaticConstraint, perpendicularConstraint, parallelConstraint, ...coincidentConstraints, ...normalizedPointOnLineConstraints, ...midpointConstraints].filter(Boolean) as DrawingGeometricConstraint[];
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
        geometricConstraints: addedConstraints.length ? { ...retainedConstraints, ...Object.fromEntries(addedConstraints.map((constraint) => [constraint.id, constraint])) } : activeSketch.geometricConstraints,
        geometricConstraintOrder: addedConstraints.length ? [...(activeSketch.geometricConstraintOrder ?? []).filter((id) => !redundantCoincidenceIds.has(id)), ...addedConstraints.map(({ id }) => id)] : activeSketch.geometricConstraintOrder,
      },
    },
  };
};

/** Maps only the accepted angular-inference state, never rounded geometry, to design intent. */
export const automaticAxisConstraintKind = (interaction: LineToolInteraction): 'HORIZONTAL' | 'VERTICAL' | null => {
  if (interaction.snappedAngleDegrees === null) return null;
  const angle = normalizeDegrees(interaction.snappedAngleDegrees);
  return angle === 0 || angle === 180 ? 'HORIZONTAL' : angle === 90 || angle === 270 ? 'VERTICAL' : null;
};

/** Angular presentation is derived from acquired intent and the final displayed geometry. */
export const hasAngularPresentationTruth = (interaction: LineToolInteraction): boolean => interaction.start !== null
  && interaction.effectivePreviewPoint !== null
  && interaction.snappedAngleDegrees !== null
  && isPointOnDirection(interaction.start, interaction.effectivePreviewPoint, directionAt(interaction.snappedAngleDegrees));
