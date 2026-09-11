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
    }];
  });
};

/** Ordered semantic candidates consumed by the shared Line marker layout. */
export const deriveLineConstraintMarkerCandidates = (sketch: DrawingSketchV2): LineMarkerCandidate[] => {
  const order = new Map((sketch.geometricConstraintOrder ?? []).map((id, index) => [id, index]));
  const constraints = Object.values(sketch.geometricConstraints ?? {}).sort((a, b) =>
    (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return constraints.filter((constraint) => constraint.kind !== 'PERPENDICULAR' && constraint.kind !== 'COINCIDENT').flatMap((constraint) =>
    constraint.references.map(({ entityId }, index) => ({
      id: `${constraint.id}:${index}`,
      constraintId: constraint.id,
      lineId: entityId,
      label: constraint.kind === 'PARALLEL' ? '∥' : constraint.kind === 'HORIZONTAL' ? 'H' : 'V',
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
    let corner: { x: number; y: number }, u, v;
    if (sharedPointId) {
      corner = sketch.points[sharedPointId];
      const aOther = sketch.points[entityA.startPointId === sharedPointId ? entityA.endPointId : entityA.startPointId];
      const bOther = sketch.points[entityB.startPointId === sharedPointId ? entityB.endPointId : entityB.startPointId];
      u = unitFrom(corner, aOther); v = unitFrom(corner, bOther);
    } else {
      const ad = { x: a.end.x - a.start.x, y: a.end.y - a.start.y };
      const bd = { x: b.end.x - b.start.x, y: b.end.y - b.start.y };
      const cross = ad.x * bd.y - ad.y * bd.x;
      if (Math.abs(cross) <= 1e-12) return [];
      const delta = { x: b.start.x - a.start.x, y: b.start.y - a.start.y };
      const t = (delta.x * bd.y - delta.y * bd.x) / cross;
      corner = { x: a.start.x + t * ad.x, y: a.start.y + t * ad.y };
      u = unitFrom({ x: 0, y: 0 }, ad); v = unitFrom({ x: 0, y: 0 }, bd);
    }
    if (!u || !v) return [];
    const d = RIGHT_ANGLE_MARKER_SIZE_PX / pixelsPerModelUnit;
    const p1 = { x: corner.x + u.x * d, y: corner.y + u.y * d };
    const p3 = { x: corner.x + v.x * d, y: corner.y + v.y * d };
    const p2 = { x: p1.x + v.x * d, y: p1.y + v.y * d };
    return [{ id: constraint.id, constraintId: constraint.id, lineAId, lineBId, corner, p1, p2, p3 }];
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
