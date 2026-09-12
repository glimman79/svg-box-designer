import type { DrawingDocumentV2, DrawingSketchV2 } from './drawingTypes';
import { resolveLine } from './drawingTopology.js';

export const GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX = 12;
export const GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX = 22;
export const GEOMETRIC_CONSTRAINT_MARKER_SIZE_PX = 12;
export const RIGHT_ANGLE_MARKER_SIZE_PX = 9;
export type DrawingGeometricConstraintMarker = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  x: number;
  y: number;
  label: string;
  ux?: number;
  uy?: number;
}>;

/** Compatibility type retained for existing marker consumers. */
export type DrawingParallelMarker = DrawingGeometricConstraintMarker;

export type DrawingRightAngleMarker = Readonly<{
  id: string;
  constraintId: string;
  lineAId: string;
  lineBId: string;
  corner: Readonly<{ x: number; y: number }>;
  p1: Readonly<{ x: number; y: number }>;
  p2: Readonly<{ x: number; y: number }>;
  p3: Readonly<{ x: number; y: number }>;
  supportExtensionA?: DrawingPerpendicularSupportExtension;
  supportExtensionB?: DrawingPerpendicularSupportExtension;
}>;

export type DrawingPerpendicularSupportExtension = Readonly<{
  start: Readonly<{ x: number; y: number }>;
  end: Readonly<{ x: number; y: number }>;
}>;

export type DrawingPerpendicularPresentation = Readonly<{
  intersection: Readonly<{ x: number; y: number }>;
  markerDirectionA: Readonly<{ x: number; y: number }>;
  markerDirectionB: Readonly<{ x: number; y: number }>;
  markerPoints: readonly [Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>];
  supportExtensionA?: DrawingPerpendicularSupportExtension;
  supportExtensionB?: DrawingPerpendicularSupportExtension;
}>;

export type LineMarkerCandidate = Readonly<{
  id: string;
  constraintId: string;
  lineId: string;
  label: string;
}>;

const symmetricSlot = (index: number) => index === 0 ? 0 : (index % 2 === 1 ? 1 : -1) * Math.ceil(index / 2);

/**
 * One presentation authority lays out every Line-associated marker. Candidates
 * only identify their Line and glyph; adding another kind does not add another
 * collision rule.
 */
export const layoutLineConstraintMarkers = (
  sketch: DrawingSketchV2,
  candidates: readonly LineMarkerCandidate[],
  pixelsPerModelUnit = 1,
): DrawingGeometricConstraintMarker[] => {
  const lineSlotCounts = new Map<string, number>();
  return candidates.flatMap((candidate) => {
    const entity = sketch.entities[candidate.lineId];
    const line = entity?.type === 'line' ? resolveLine(sketch, entity) : null;
    if (!line) return [];
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
    if (length === 0) return [];
    const slotIndex = lineSlotCounts.get(candidate.lineId) ?? 0;
    lineSlotCounts.set(candidate.lineId, slotIndex + 1);
    const perpendicularOffset = GEOMETRIC_CONSTRAINT_MARKER_OFFSET_PX / pixelsPerModelUnit;
    const alongLineOffset = symmetricSlot(slotIndex) * GEOMETRIC_CONSTRAINT_MARKER_SPACING_PX / pixelsPerModelUnit;
    return [{
      ...candidate,
      x: (line.start.x + line.end.x) / 2 - dy / length * perpendicularOffset + dx / length * alongLineOffset,
      y: (line.start.y + line.end.y) / 2 + dx / length * perpendicularOffset + dy / length * alongLineOffset,
      ...(candidate.label === 'MIDPOINT' ? { ux: dx / length, uy: dy / length } : {}),
    }];
  });
};

/** Ordered semantic candidates consumed by the shared Line marker layout. */
export const deriveLineConstraintMarkerCandidates = (sketch: DrawingSketchV2): LineMarkerCandidate[] => {
  const order = new Map((sketch.geometricConstraintOrder ?? []).map((id, index) => [id, index]));
  const constraints = Object.values(sketch.geometricConstraints ?? {}).sort((a, b) =>
    (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return constraints.filter((constraint) => constraint.kind !== 'PERPENDICULAR' && constraint.kind !== 'COINCIDENT').flatMap((constraint) =>
    (constraint.kind === 'MIDPOINT' ? [constraint.references[1]] : constraint.references).map(({ entityId }, index) => ({
      id: `${constraint.id}:${index}`,
      constraintId: constraint.id,
      lineId: entityId,
      label: constraint.kind === 'MIDPOINT' ? 'MIDPOINT' : constraint.kind === 'PARALLEL' ? '∥' : constraint.kind === 'HORIZONTAL' ? 'H' : 'V',
    })));
};

/** Derive presentation-only markers beside their finite Lines. */
export const deriveGeometricConstraintMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingGeometricConstraintMarker[] => {
  return layoutLineConstraintMarkers(sketch, deriveLineConstraintMarkerCandidates(sketch), pixelsPerModelUnit);
};

const unitFrom = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : null;
};

const PRESENTATION_TOLERANCE = 1e-9;
const comparePoints = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x === b.x ? a.y - b.y : a.x - b.x;

const segmentPresentation = (
  intersection: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= PRESENTATION_TOLERANCE * PRESENTATION_TOLERANCE) return null;
  const parameter = ((intersection.x - start.x) * dx + (intersection.y - start.y) * dy) / lengthSquared;
  const startDistance = Math.hypot(start.x - intersection.x, start.y - intersection.y);
  const endDistance = Math.hypot(end.x - intersection.x, end.y - intersection.y);
  // An exact extent tie uses the lexicographically smaller physical endpoint.
  // This is deterministic and independent of endpoint storage and entity order.
  const preferredEndpoint = Math.abs(startDistance - endDistance) <= PRESENTATION_TOLERANCE
    ? (comparePoints(start, end) <= 0 ? start : end)
    : (startDistance > endDistance ? start : end);
  const direction = unitFrom(intersection, preferredEndpoint);
  if (!direction) return null;
  if (parameter >= -PRESENTATION_TOLERANCE && parameter <= 1 + PRESENTATION_TOLERANCE) return { direction };
  const nearestEndpoint = parameter < 0 ? start : end;
  return { direction, supportExtension: { start: nearestEndpoint, end: intersection } };
};

/** Pure presentation geometry shared by transient and persistent Perpendicular rendering. */
export const derivePerpendicularPresentation = (
  lineA: Readonly<{ start: { x: number; y: number }; end: { x: number; y: number } }>,
  lineB: Readonly<{ start: { x: number; y: number }; end: { x: number; y: number } }>,
  markerSize: number,
  authoritativeIntersection?: Readonly<{ x: number; y: number }>,
): DrawingPerpendicularPresentation | null => {
  const ad = { x: lineA.end.x - lineA.start.x, y: lineA.end.y - lineA.start.y };
  const bd = { x: lineB.end.x - lineB.start.x, y: lineB.end.y - lineB.start.y };
  const cross = ad.x * bd.y - ad.y * bd.x;
  if (Math.abs(cross) <= PRESENTATION_TOLERANCE) return null;
  const delta = { x: lineB.start.x - lineA.start.x, y: lineB.start.y - lineA.start.y };
  const t = (delta.x * bd.y - delta.y * bd.x) / cross;
  const intersection = authoritativeIntersection ?? { x: lineA.start.x + t * ad.x, y: lineA.start.y + t * ad.y };
  const a = segmentPresentation(intersection, lineA.start, lineA.end);
  const b = segmentPresentation(intersection, lineB.start, lineB.end);
  if (!a || !b) return null;
  const p1 = { x: intersection.x + a.direction.x * markerSize, y: intersection.y + a.direction.y * markerSize };
  const p3 = { x: intersection.x + b.direction.x * markerSize, y: intersection.y + b.direction.y * markerSize };
  const p2 = { x: p1.x + b.direction.x * markerSize, y: p1.y + b.direction.y * markerSize };
  return { intersection, markerDirectionA: a.direction, markerDirectionB: b.direction,
    markerPoints: [p1, p2, p3], supportExtensionA: a.supportExtension, supportExtensionB: b.supportExtension };
};

/** Derives exactly one screen-stable geometric corner for each perpendicular relation. */
export const deriveRightAngleMarkers = (sketch: DrawingSketchV2, pixelsPerModelUnit = 1): DrawingRightAngleMarker[] =>
  Object.values(sketch.geometricConstraints ?? {}).flatMap((constraint) => {
    if (constraint.kind !== 'PERPENDICULAR') return [];
    const [lineAId, lineBId] = constraint.references.map(({ entityId }) => entityId);
    const entityA = sketch.entities[lineAId], entityB = sketch.entities[lineBId];
    if (entityA?.type !== 'line' || entityB?.type !== 'line') return [];
    const a = resolveLine(sketch, entityA), b = resolveLine(sketch, entityB);
    if (!a || !b) return [];

    const sharedPointId = [entityA.startPointId, entityA.endPointId].find((id) => id === entityB.startPointId || id === entityB.endPointId);
    let corner: { x: number; y: number } | undefined;
    if (sharedPointId) {
      corner = sketch.points[sharedPointId];
    }
    const d = RIGHT_ANGLE_MARKER_SIZE_PX / pixelsPerModelUnit;
    const presentation = derivePerpendicularPresentation(a, b, d, corner);
    if (!presentation) return [];
    const [p1, p2, p3] = presentation.markerPoints;
    return [{ id: constraint.id, constraintId: constraint.id, lineAId, lineBId,
      corner: presentation.intersection, p1, p2, p3,
      supportExtensionA: presentation.supportExtensionA, supportExtensionB: presentation.supportExtensionB }];
  });

/** Compatibility name retained for existing marker consumers and tests. */
export const deriveParallelMarkers = deriveGeometricConstraintMarkers;

/** Remove one semantic constraint; every marker derived from its ID disappears together. */
export const deleteGeometricConstraint = (document: DrawingDocumentV2, constraintId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch?.geometricConstraints?.[constraintId]) return document;
  const geometricConstraints = { ...sketch.geometricConstraints };
  delete geometricConstraints[constraintId];
  return {
    ...document,
    sketches: {
      ...document.sketches,
      [sketch.id]: {
        ...sketch,
        geometricConstraints,
        geometricConstraintOrder: (sketch.geometricConstraintOrder ?? []).filter((id) => id !== constraintId),
      },
    },
  };
};
