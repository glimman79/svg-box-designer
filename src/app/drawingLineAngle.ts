import type { DrawingAngleSector, DrawingEntityReference, DrawingPoint, ResolvedDrawingLine } from './drawingTypes';

const EPSILON = 1e-9;
/**
 * A support intersection farther than this many source-line lengths is treated
 * as presentationally near-parallel. This keeps pathological coordinates out
 * of SVG while failing closed instead of substituting a local, false vertex.
 */
export const MAX_SUPPORT_INTERSECTION_DISTANCE_RATIO = 1e6;
const TAU = Math.PI * 2;
export type LineAngleCandidate = Readonly<{
  sector: DrawingAngleSector;
  angleDegrees: number;
  startAngle: number;
  sweepAngle: number;
}>;
export type LineAngleBasis = Readonly<{
  lineA: ResolvedDrawingLine;
  lineB: ResolvedDrawingLine;
  references: readonly [DrawingEntityReference, DrawingEntityReference];
  intersection: DrawingPoint;
  /** All four mathematical cells, including currently non-practical placement cells. */
  supportCandidates: readonly LineAngleCandidate[];
  /** Cursor-exposed cells after finite-geometry relevance filtering. */
  candidates: readonly LineAngleCandidate[];
}>;
export type LineAngleAnnotationGeometry = Readonly<{
  /** Local display origin. `basis.intersection` remains the mathematical vertex. */
  center: DrawingPoint;
  radius: number;
  start: DrawingPoint;
  end: DrawingPoint;
  label: DrawingPoint;
  largeArc: 0 | 1;
  sweep: 0 | 1;
  supportA: Readonly<{ start: DrawingPoint; end: DrawingPoint }>;
  supportB: Readonly<{ start: DrawingPoint; end: DrawingPoint }>;
  presentationRegion: 'interior' | 'exterior-positive' | 'exterior-negative';
  startTangent: DrawingPoint;
  endTangent: DrawingPoint;
  /** Derived display-only bridges from finite segments to local witnesses. */
  supportExtensions: readonly Readonly<{ lineId: string; start: DrawingPoint; end: DrawingPoint }>[];
}>;

const direction = (line: ResolvedDrawingLine) => ({ x: line.end.x - line.start.x, y: line.end.y - line.start.y });
const cross = (a: DrawingPoint, b: DrawingPoint) => a.x * b.y - a.y * b.x;
const side = (line: ResolvedDrawingLine, point: DrawingPoint): -1 | 1 => cross(direction(line), { x: point.x - line.start.x, y: point.y - line.start.y }) >= 0 ? 1 : -1;
const positiveDelta = (from: number, to: number) => (to - from + TAU) % TAU;
const sameSector = (a: DrawingAngleSector, b: DrawingAngleSector) => a.sideA === b.sideA && a.sideB === b.sideB;
export const angleSectorKey = (sector: DrawingAngleSector): string => `${sector.sideA > 0 ? 'A+' : 'A-'}:${sector.sideB > 0 ? 'B+' : 'B-'}`;

export const canonicalLinePair = (first: ResolvedDrawingLine, second: ResolvedDrawingLine): readonly [ResolvedDrawingLine, ResolvedDrawingLine] =>
  first.id.localeCompare(second.id) <= 0 ? [first, second] : [second, first];

export const intersectLineSupports = (a: ResolvedDrawingLine, b: ResolvedDrawingLine): DrawingPoint | null => {
  const da = direction(a), db = direction(b), denominator = cross(da, db);
  const lengthA = Math.hypot(da.x, da.y), lengthB = Math.hypot(db.x, db.y);
  if (lengthA <= EPSILON || lengthB <= EPSILON || Math.abs(denominator) <= EPSILON * lengthA * lengthB) return null;
  const delta = { x: b.start.x - a.start.x, y: b.start.y - a.start.y };
  const t = cross(delta, db) / denominator;
  const intersection = { x: a.start.x + t * da.x, y: a.start.y + t * da.y };
  const sourceScale = Math.max(lengthA, lengthB);
  const remoteDistance = Math.min(
    Math.hypot(intersection.x - a.start.x, intersection.y - a.start.y),
    Math.hypot(intersection.x - a.end.x, intersection.y - a.end.y),
    Math.hypot(intersection.x - b.start.x, intersection.y - b.start.y),
    Math.hypot(intersection.x - b.end.x, intersection.y - b.end.y),
  );
  return Number.isFinite(intersection.x) && Number.isFinite(intersection.y) && remoteDistance / sourceScale <= MAX_SUPPORT_INTERSECTION_DISTANCE_RATIO ? intersection : null;
};

const segmentContains = (line: ResolvedDrawingLine, p: DrawingPoint) => {
  const d = direction(line), lengthSquared = d.x * d.x + d.y * d.y;
  const t = ((p.x - line.start.x) * d.x + (p.y - line.start.y) * d.y) / lengthSquared;
  return t >= -EPSILON && t <= 1 + EPSILON;
};

const closestSegmentPoint = (line: ResolvedDrawingLine, point: DrawingPoint): DrawingPoint => {
  const d = direction(line), lengthSquared = d.x * d.x + d.y * d.y;
  const t = Math.max(0, Math.min(1, ((point.x - line.start.x) * d.x + (point.y - line.start.y) * d.y) / lengthSquared));
  return { x: line.start.x + d.x * t, y: line.start.y + d.y * t };
};

export const resolveLineAnglePresentationRegion = (basis: LineAngleBasis, anchor: DrawingPoint): LineAngleAnnotationGeometry['presentationRegion'] => {
  const points = [basis.lineA.start, basis.lineA.end, basis.lineB.start, basis.lineB.end];
  const minX = Math.min(...points.map(({ x }) => x)), maxX = Math.max(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y)), maxY = Math.max(...points.map(({ y }) => y));
  if (anchor.x >= minX && anchor.x <= maxX && anchor.y >= minY && anchor.y <= maxY) return 'interior';
  const centroid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return cross(direction(basis.lineA), { x: anchor.x - centroid.x, y: anchor.y - centroid.y }) >= 0 ? 'exterior-positive' : 'exterior-negative';
};

export const resolveRequiredSupportExtensions = (basis: LineAngleBasis, targets: readonly [DrawingPoint, DrawingPoint]): LineAngleAnnotationGeometry['supportExtensions'] =>
  [basis.lineA, basis.lineB].flatMap((line, index) => {
    const start = closestSegmentPoint(line, targets[index]);
    return Math.hypot(start.x - targets[index].x, start.y - targets[index].y) <= EPSILON ? [] : [{ lineId: line.id, start, end: targets[index] }];
  });

/**
 * The four support-line cells are authoritative. When the finite segments cross,
 * all four are exposed. Otherwise the cell diametrically opposite the finite
 * geometry's centroid is omitted: it is the sole cell reached only by extending
 * both finite lines away from the visible geometry. This leaves the occupied cell
 * and its two boundary-adjacent presentation cells (commonly three).
 */
export const createLineAngleBasis = (first: ResolvedDrawingLine, second: ResolvedDrawingLine): LineAngleBasis | null => {
  const [lineA, lineB] = canonicalLinePair(first, second);
  const intersection = intersectLineSupports(lineA, lineB); if (!intersection) return null;
  const da = direction(lineA), db = direction(lineB);
  const rays = [Math.atan2(da.y, da.x), Math.atan2(db.y, db.x), Math.atan2(-da.y, -da.x), Math.atan2(-db.y, -db.x)].sort((x, y) => x - y);
  const supportCandidates = rays.map((startAngle, index): LineAngleCandidate => {
    const sweepAngle = positiveDelta(startAngle, rays[(index + 1) % rays.length]);
    const probe = { x: intersection.x + Math.cos(startAngle + sweepAngle / 2), y: intersection.y + Math.sin(startAngle + sweepAngle / 2) };
    return { sector: { sideA: side(lineA, probe), sideB: side(lineB, probe) }, angleDegrees: sweepAngle * 180 / Math.PI, startAngle, sweepAngle };
  });
  let candidates = supportCandidates;
  if (!(segmentContains(lineA, intersection) && segmentContains(lineB, intersection))) {
    const centroid = { x: (lineA.start.x + lineA.end.x + lineB.start.x + lineB.end.x) / 4, y: (lineA.start.y + lineA.end.y + lineB.start.y + lineB.end.y) / 4 };
    const occupied = { sideA: side(lineA, centroid), sideB: side(lineB, centroid) } as const;
    candidates = candidates.filter(({ sector }) => !(sector.sideA === -occupied.sideA && sector.sideB === -occupied.sideB));
  }
  return { lineA, lineB, references: [{ kind: 'entity', entityId: lineA.id }, { kind: 'entity', entityId: lineB.id }], intersection, supportCandidates, candidates };
};

export const selectLineAngleCandidate = (basis: LineAngleBasis, cursor: DrawingPoint): LineAngleCandidate => {
  const identity = { sideA: side(basis.lineA, cursor), sideB: side(basis.lineB, cursor) };
  const exact = basis.candidates.find(({ sector }) => sameSector(sector, identity));
  if (exact) return exact;
  return basis.candidates.reduce((best, candidate) => {
    const mid = candidate.startAngle + candidate.sweepAngle / 2;
    const cursorAngle = Math.atan2(cursor.y - basis.intersection.y, cursor.x - basis.intersection.x);
    const score = Math.abs(Math.atan2(Math.sin(cursorAngle - mid), Math.cos(cursorAngle - mid)));
    const bestMid = best.startAngle + best.sweepAngle / 2;
    const bestScore = Math.abs(Math.atan2(Math.sin(cursorAngle - bestMid), Math.cos(cursorAngle - bestMid)));
    return score < bestScore ? candidate : best;
  });
};

export const candidateForSector = (basis: LineAngleBasis, sector: DrawingAngleSector): LineAngleCandidate | null => basis.supportCandidates.find((candidate) => sameSector(candidate.sector, sector)) ?? null;

export const deriveLineAngleAnnotation = (basis: LineAngleBasis, candidate: LineAngleCandidate, anchor: DrawingPoint, minimumRadius: number): LineAngleAnnotationGeometry => {
  const radius = minimumRadius * 1.65;
  const middle = candidate.startAngle + candidate.sweepAngle / 2;
  const labelDistance = radius + minimumRadius * .45;
  const center = { x: anchor.x - Math.cos(middle) * labelDistance, y: anchor.y - Math.sin(middle) * labelDistance };
  const start = { x: center.x + Math.cos(candidate.startAngle) * radius, y: center.y + Math.sin(candidate.startAngle) * radius };
  const endAngle = candidate.startAngle + candidate.sweepAngle;
  const end = { x: center.x + Math.cos(endAngle) * radius, y: center.y + Math.sin(endAngle) * radius };
  return { center, radius, start, end, label: anchor, largeArc: candidate.sweepAngle > Math.PI ? 1 : 0, sweep: 1,
    supportA: { start: center, end: start }, supportB: { start: center, end },
    presentationRegion: resolveLineAnglePresentationRegion(basis, anchor),
    startTangent: { x: -Math.sin(candidate.startAngle), y: Math.cos(candidate.startAngle) },
    endTangent: { x: -Math.sin(endAngle), y: Math.cos(endAngle) },
    supportExtensions: resolveRequiredSupportExtensions(basis, [start, end]) };
};
