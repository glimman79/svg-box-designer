import type { DrawingAngleSector, DrawingDimension, DrawingDimensionKind, DrawingDimensionRole, DrawingDocumentV2, DrawingEntityReference, DrawingGeometryReference, DrawingLineEntity, DrawingPoint, DrawingPointReference, DrawingSketchV2, ResolvedDrawingLine } from './drawingTypes';
import { pointIdForLineEndpoint, removeLineAndOrphans, resolveLine } from './drawingTopology.js';
import { dimensionIncreasesConstraintRank } from './drawingConstraintAnalysis.js';
import { candidateForSector, createLineAngleBasis, selectLineAngleCandidate } from './drawingLineAngle.js';

export const DIMENSION_AXIS_EPSILON_MM = 1e-7;
/** |cross(unitA, unitB)| at or below this value is geometrically parallel. */
export const LINE_PAIR_PARALLEL_TOLERANCE = 1e-9;
export const DIMENSION_INTERPRETATION_HYSTERESIS_PX = 3;
export const DIMENSION_ENDPOINT_TOLERANCE_PX = 9;
export const DIMENSION_LINE_TOLERANCE_PX = 8;
export const DIMENSION_DRAG_THRESHOLD_PX = 4;
export const DIMENSION_TEXT_SIZE_PX = 10;
// The SVG annotation's 2 px non-scaling paint halo adds 4 px to its visible
// silhouette. 17 px makes the un-stroked HTML input about 121% of that 14 px
// painted target, rather than comparing unlike 10 px SVG and 12 px CSS values.
export const DIMENSION_EDITOR_TEXT_SIZE_PX = 17;
export const DIMENSION_EDITOR_HEIGHT_PX = 26;
export const DIMENSION_EDITOR_HORIZONTAL_PADDING_PX = 4;
export const DIMENSION_EDITOR_VERTICAL_PADDING_PX = 2;
export const DIMENSION_EDITOR_BORDER_PX = 1;
export const DIMENSION_EDITOR_RADIUS_PX = 3;
/** Compact width in screen pixels for a numeric draft rendered at 17 px. */
export const dimensionEditorWidthPixels = (draft: string): number => Math.max(34, draft.length * 10 + 2 * DIMENSION_EDITOR_HORIZONTAL_PADDING_PX + 2 * DIMENSION_EDITOR_BORDER_PX);
export type DimensionPreselection = Readonly<{
  kind: 'point'; lineId: string; point: 'start' | 'end'; pointId?: string; clientPoint: DrawingPoint; distancePx: number;
}> | Readonly<{ kind: 'origin'; clientPoint: DrawingPoint; distancePx: number }> | Readonly<{ kind: 'line'; lineId: string; distancePx: number }>;
export type DimensionClientLine = Readonly<{ id: string; start: DrawingPoint; end: DrawingPoint }>;
export type DimensionToolState =
  | Readonly<{ phase: 'inactive' }>
  | Readonly<{ phase: 'waitingForFirstTarget' }>
  | Readonly<{ phase: 'waitingForSecondTarget'; first: DrawingGeometryReference }>
  | Readonly<{ phase: 'lineTargetSelected'; line: DrawingEntityReference; dimension: DrawingDimension; cursor: DrawingPoint }>
  | Readonly<{ phase: 'placementPreview'; dimension: DrawingDimension; cursor: DrawingPoint }>;

export const lineDimensionReferences = (line: DrawingLineEntity): readonly [DrawingPointReference, DrawingPointReference] => ([
  { kind: 'point', entityId: line.id, point: 'start' }, { kind: 'point', entityId: line.id, point: 'end' },
]);
export const resolveDrawingPointReference = (sketch: DrawingSketchV2, reference: DrawingGeometryReference): DrawingPoint | null => {
  if (reference.kind === 'datum') return reference.datum === 'ORIGIN' ? { x: 0, y: 0 } : null;
  if (reference.kind === 'sketchPoint') { const point = sketch.points[reference.pointId]; return point ? { x: point.x, y: point.y } : null; }
  if (reference.kind !== 'point') return null;
  const entity = sketch.entities[reference.entityId];
  if (entity?.type !== 'line') return null;
  const point = sketch.points[pointIdForLineEndpoint(entity, reference.point)];
  return point ? { x: point.x, y: point.y } : null;
};
export const sketchPointIdFromReference = (sketch: DrawingSketchV2, reference: DrawingPointReference): string | null => {
  if (reference.kind === 'sketchPoint') return sketch.points[reference.pointId] ? reference.pointId : null;
  if (reference.kind !== 'point') return null;
  const line = sketch.entities[reference.entityId]; return line ? pointIdForLineEndpoint(line, reference.point) : null;
};
export const measureDimension = (kind: DrawingDimensionKind, a: DrawingPoint, b: DrawingPoint): number => kind === 'HORIZONTAL_DISTANCE'
  ? Math.abs(b.x - a.x) : kind === 'VERTICAL_DISTANCE' ? Math.abs(b.y - a.y) : Math.hypot(b.x - a.x, b.y - a.y);
export const measurePointToLine = (point: DrawingPoint, line: ResolvedDrawingLine): number | null => {
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
  return length <= DIMENSION_AXIS_EPSILON_MM ? null : Math.abs(dx * (point.y - line.start.y) - dy * (point.x - line.start.x)) / length;
};
export const resolveDimensionLineReference = (sketch: DrawingSketchV2, reference: DrawingEntityReference): ResolvedDrawingLine | null => {
  const entity = sketch.entities[reference.entityId]; return entity?.type === 'line' ? resolveLine(sketch, entity) : null;
};
export const availableLineDimensionKinds = (line: ResolvedDrawingLine): Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>[] => {
  const dx = Math.abs(line.end.x - line.start.x), dy = Math.abs(line.end.y - line.start.y);
  if (dx <= DIMENSION_AXIS_EPSILON_MM && dy <= DIMENSION_AXIS_EPSILON_MM) return [];
  // Aligned is the canonical axis-line length. Zero projections and duplicate families are omitted.
  if (dy <= DIMENSION_AXIS_EPSILON_MM || dx <= DIMENSION_AXIS_EPSILON_MM) return ['ALIGNED_DISTANCE'];
  return ['ALIGNED_DISTANCE', 'HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE'];
};
export const availablePointDimensionKinds = (a: DrawingPoint, b: DrawingPoint): DrawingDimensionKind[] => availableLineDimensionKinds({ id: '', type: 'line', startPointId: '', endPointId: '', start: a, end: b });
/** Converts a fixed screen-space annotation size to SVG model units. */
export const dimensionScreenPixelsToModelUnits = (screenPixels: number, pixelsPerModelUnit: number): number => screenPixels / pixelsPerModelUnit;
/** Resolve one semantic target in client space. Endpoints intentionally form the first priority tier. */
export const collectDimensionReferenceCandidates = (lines: readonly DimensionClientLine[], cursor: DrawingPoint, originClient?: DrawingPoint): DimensionPreselection[] => {
  const points: DimensionPreselection[] = [], bodies: DimensionPreselection[] = [];
  for (const line of lines) {
    for (const point of ['start', 'end'] as const) {
      const distancePx = Math.hypot(cursor.x - line[point].x, cursor.y - line[point].y);
      if (distancePx <= DIMENSION_ENDPOINT_TOLERANCE_PX) points.push({ kind: 'point', lineId: line.id, point, clientPoint: line[point], distancePx });
    }
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
    const t = Math.max(0, Math.min(1, ((cursor.x - line.start.x) * dx + (cursor.y - line.start.y) * dy) / (dx * dx + dy * dy || 1)));
    const distancePx = Math.hypot(cursor.x - line.start.x - t * dx, cursor.y - line.start.y - t * dy);
    if (distancePx <= DIMENSION_LINE_TOLERANCE_PX) bodies.push({ kind: 'line', lineId: line.id, distancePx });
  }
  const origin = originClient && Math.hypot(cursor.x - originClient.x, cursor.y - originClient.y) <= DIMENSION_ENDPOINT_TOLERANCE_PX
    ? [{ kind: 'origin', clientPoint: originClient, distancePx: Math.hypot(cursor.x - originClient.x, cursor.y - originClient.y) } as const] : [];
  return [...points, ...origin].sort((a, b) => a.distancePx - b.distancePx).concat(bodies.sort((a, b) => a.distancePx - b.distancePx));
};
export const resolveDimensionPreselection = (lines: readonly DimensionClientLine[], cursor: DrawingPoint, originClient?: DrawingPoint): DimensionPreselection | null => collectDimensionReferenceCandidates(lines, cursor, originClient)[0] ?? null;
export const resolveDimensionPreselectionForTarget = (lines: readonly DimensionClientLine[], cursor: DrawingPoint, target: 'any' | 'point' | 'line', originClient?: DrawingPoint): DimensionPreselection | null => {
  const candidates = collectDimensionReferenceCandidates(lines, cursor, originClient);
  if (target === 'line') return candidates.find((candidate) => candidate.kind === 'line') ?? null;
  if (target === 'point') {
    // In a state that explicitly requests a Point, the datum is intentional UI,
    // not another generic endpoint candidate. Keep it selectable at coincidence.
    return candidates.find((candidate) => candidate.kind === 'origin')
      ?? candidates.find((candidate) => candidate.kind === 'point') ?? null;
  }
  return candidates[0] ?? null;
};
export const preselectionReference = (candidate: DimensionPreselection): DrawingGeometryReference => candidate.kind === 'point'
  ? candidate.pointId ? { kind: 'sketchPoint', pointId: candidate.pointId } : { kind: 'point', entityId: candidate.lineId, point: candidate.point }
  : candidate.kind === 'origin' ? { kind: 'datum', datum: 'ORIGIN' } : { kind: 'entity', entityId: candidate.lineId };

/** Scores distance to each family's natural placement locus; a 3 px advantage switches families. */
export const chooseLineDimensionKind = (line: ResolvedDrawingLine, cursor: DrawingPoint, previous?: Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>, pixelsPerModelUnit = 1): Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'> => {
  const kinds = availableLineDimensionKinds(line);
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  const qx = cursor.x - mid.x, qy = cursor.y - mid.y;
  // Loci are rays normal to the candidate dimension line through its midpoint.
  const scores = { ALIGNED_DISTANCE: Math.abs(qx * dx / length + qy * dy / length) * pixelsPerModelUnit, HORIZONTAL_DISTANCE: Math.abs(qx) * pixelsPerModelUnit, VERTICAL_DISTANCE: Math.abs(qy) * pixelsPerModelUnit };
  const winner = kinds.reduce((best, kind) => scores[kind] < scores[best] ? kind : best, kinds[0]);
  return previous && kinds.includes(previous) && scores[previous] <= scores[winner] + DIMENSION_INTERPRETATION_HYSTERESIS_PX ? previous : winner;
};
export const choosePointDimensionKind = (a: DrawingPoint, b: DrawingPoint, cursor: DrawingPoint, previous?: Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>, pixelsPerModelUnit = 1) => chooseLineDimensionKind({ id: '', type: 'line', startPointId: '', endPointId: '', start: a, end: b }, cursor, previous, pixelsPerModelUnit);
export const dimensionOffset = (line: ResolvedDrawingLine, cursor: DrawingPoint, kind: DrawingDimensionKind): number => {
  const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
  if (kind === 'HORIZONTAL_DISTANCE') return cursor.y - mid.y;
  if (kind === 'VERTICAL_DISTANCE') return cursor.x - mid.x;
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  return (cursor.x - mid.x) * (-dy / length) + (cursor.y - mid.y) * (dx / length);
};
export const pointToLineDimensionOffset = (point: DrawingPoint, line: ResolvedDrawingLine, cursor: DrawingPoint): number => {
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy) || 1;
  const projectionT = ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / (length * length);
  const projection = { x: line.start.x + projectionT * dx, y: line.start.y + projectionT * dy };
  return (cursor.x - projection.x) * dx / length + (cursor.y - projection.y) * dy / length;
};
export type LinearAnnotationGeometry = Readonly<{
  a: DrawingPoint;
  b: DrawingPoint;
  sourceA: DrawingPoint;
  sourceB: DrawingPoint;
  /** Annotation-only continuation from the finite measured segment to Q. */
  lineExtension?: Readonly<{ start: DrawingPoint; end: DrawingPoint }>;
}>;
export const derivePointToLineAnnotationGeometry = (point: DrawingPoint, line: ResolvedDrawingLine, offset: number): LinearAnnotationGeometry | null => {
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y, length = Math.hypot(dx, dy);
  if (length <= DIMENSION_AXIS_EPSILON_MM) return null;
  const ux = dx / length, uy = dy / length;
  const projectionT = (point.x - line.start.x) * ux + (point.y - line.start.y) * uy;
  const projection = { x: line.start.x + projectionT * ux, y: line.start.y + projectionT * uy };
  const shift = { x: ux * offset, y: uy * offset };
  const lineExtension = projectionT < 0
    ? { start: line.start, end: projection }
    : projectionT > length ? { start: line.end, end: projection } : undefined;
  return {
    a: { x: projection.x + shift.x, y: projection.y + shift.y },
    b: { x: point.x + shift.x, y: point.y + shift.y },
    sourceA: projection,
    sourceB: point,
    lineExtension,
  };
};
const stableLineBasis = (line: ResolvedDrawingLine) => {
  let dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
  const length = Math.hypot(dx, dy); if (length <= DIMENSION_AXIS_EPSILON_MM) return null;
  dx /= length; dy /= length;
  if (dx < 0 || (Math.abs(dx) <= LINE_PAIR_PARALLEL_TOLERANCE && dy < 0)) { dx = -dx; dy = -dy; }
  return { tangent: { x: dx, y: dy }, normal: { x: -dy, y: dx } };
};
export type LinePairDimensionMode = 'ANGLE' | 'DISTANCE' | 'INVALID';
export const resolveLinePairDimensionMode = (a: ResolvedDrawingLine, b: ResolvedDrawingLine): LinePairDimensionMode => {
  const aa = stableLineBasis(a), bb = stableLineBasis(b); if (!aa || !bb) return 'INVALID';
  return Math.abs(aa.tangent.x * bb.tangent.y - aa.tangent.y * bb.tangent.x) <= LINE_PAIR_PARALLEL_TOLERANCE ? 'DISTANCE' : 'ANGLE';
};
export const canonicalLinePair = (a: ResolvedDrawingLine, b: ResolvedDrawingLine): readonly [ResolvedDrawingLine, ResolvedDrawingLine] => a.id.localeCompare(b.id) <= 0 ? [a, b] : [b, a];
export const measureLineToLineDistance = (a: ResolvedDrawingLine, b: ResolvedDrawingLine): number | null => {
  if (resolveLinePairDimensionMode(a, b) !== 'DISTANCE') return null;
  const basis = stableLineBasis(a)!;
  return Math.abs((b.start.x - a.start.x) * basis.normal.x + (b.start.y - a.start.y) * basis.normal.y);
};
export const lineToLineDimensionOffset = (a: ResolvedDrawingLine, b: ResolvedDrawingLine, cursor: DrawingPoint): number => {
  const basis = stableLineBasis(a); if (!basis) return 0;
  const center = { x: (a.start.x + a.end.x + b.start.x + b.end.x) / 4, y: (a.start.y + a.end.y + b.start.y + b.end.y) / 4 };
  return (cursor.x - center.x) * basis.tangent.x + (cursor.y - center.y) * basis.tangent.y;
};
export const deriveLineToLineAnnotationGeometry = (a: ResolvedDrawingLine, b: ResolvedDrawingLine, offset: number): LinearAnnotationGeometry | null => {
  if (resolveLinePairDimensionMode(a, b) !== 'DISTANCE') return null;
  const basis = stableLineBasis(a)!;
  const center = { x: (a.start.x + a.end.x + b.start.x + b.end.x) / 4, y: (a.start.y + a.end.y + b.start.y + b.end.y) / 4 };
  const anchor = { x: center.x + basis.tangent.x * offset, y: center.y + basis.tangent.y * offset };
  const project = (line: ResolvedDrawingLine) => {
    const endT = (line.end.x - line.start.x) * basis.tangent.x + (line.end.y - line.start.y) * basis.tangent.y;
    const t = (anchor.x - line.start.x) * basis.tangent.x + (anchor.y - line.start.y) * basis.tangent.y;
    const attachmentT = Math.max(Math.min(0, endT), Math.min(Math.max(0, endT), t));
    return {
      endpoint: { x: line.start.x + t * basis.tangent.x, y: line.start.y + t * basis.tangent.y },
      // This is derived annotation geometry only: inside the finite extent it
      // coincides with the Line; outside it is the nearest finite endpoint.
      attachment: { x: line.start.x + attachmentT * basis.tangent.x, y: line.start.y + attachmentT * basis.tangent.y },
    };
  };
  const projectedA = project(a), projectedB = project(b);
  return { a: projectedA.endpoint, b: projectedB.endpoint, sourceA: projectedA.attachment, sourceB: projectedB.attachment };
};
export const createLineToLineDistanceDimension = (first: ResolvedDrawingLine, second: ResolvedDrawingLine, cursor: DrawingPoint, id: string): DrawingDimension | null => {
  const [a, b] = canonicalLinePair(first, second), value = measureLineToLineDistance(a, b), basis = stableLineBasis(a);
  if (value === null || !basis) return null;
  const signed = (b.start.x - a.start.x) * basis.normal.x + (b.start.y - a.start.y) * basis.normal.y;
  return { id, kind: 'LINE_TO_LINE_DISTANCE', role: 'driving', references: [{ kind: 'entity', entityId: a.id }, { kind: 'entity', entityId: b.id }], signedSide: signed < 0 ? -1 : 1, value, placement: { kind: 'linear', offset: lineToLineDimensionOffset(a, b, cursor) } };
};
export const createLinePairDimension = (a: ResolvedDrawingLine, b: ResolvedDrawingLine, cursor: DrawingPoint, id: string): DrawingDimension | null => resolveLinePairDimensionMode(a, b) === 'DISTANCE' ? createLineToLineDistanceDimension(a, b, cursor, id) : createLineToLineAngleDimension(a, b, cursor, id);
export const createLineDimension = (line: ResolvedDrawingLine, kind: Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>, cursor: DrawingPoint, id: string): DrawingDimension => ({ id, kind, role: 'driving', references: lineDimensionReferences(line), value: measureDimension(kind, line.start, line.end), placement: { kind: 'linear', offset: dimensionOffset(line, cursor, kind) } });
export const createPointToPointDimension = (references: readonly [DrawingPointReference, DrawingPointReference], a: DrawingPoint, b: DrawingPoint, kind: Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>, cursor: DrawingPoint, id: string): DrawingDimension => ({ id, kind, role: 'driving', references, value: measureDimension(kind, a, b), placement: { kind: 'linear', offset: dimensionOffset({ id: '', type: 'line', startPointId: '', endPointId: '', start: a, end: b }, cursor, kind) } });
export const createPointToLineDimension = (pointReference: DrawingPointReference, lineReference: DrawingEntityReference, point: DrawingPoint, line: ResolvedDrawingLine, movementPreference: 'point' | 'line', cursor: DrawingPoint, id: string): DrawingDimension | null => {
  const value = measurePointToLine(point, line); if (value === null) return null;
  return { id, kind: 'POINT_TO_LINE_DISTANCE', role: 'driving', references: [pointReference, lineReference], movementPreference, value, placement: { kind: 'linear', offset: pointToLineDimensionOffset(point, line, cursor) } };
};
export const createLineToLineAngleDimension = (first: ResolvedDrawingLine, second: ResolvedDrawingLine, cursor: DrawingPoint, id: string): DrawingDimension | null => {
  const basis = createLineAngleBasis(first, second); if (!basis) return null;
  const candidate = selectLineAngleCandidate(basis, cursor);
  return { id, kind: 'LINE_TO_LINE_ANGLE', role: 'reference', references: basis.references, angleSector: candidate.sector, value: candidate.angleDegrees, placement: { kind: 'angular', anchor: cursor, radius: Math.hypot(cursor.x - basis.intersection.x, cursor.y - basis.intersection.y), offset: 0 } };
};
export const formatLinearDimension = (value: number): string => `${new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(value)} mm`;
/** User-facing edit draft: the authoritative stored target, rounded only to the display policy. */
export const formatDimensionEditValue = (value: number): string => new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(value);
export const formatDimensionValue = (value: number, role: DrawingDimensionRole): string => role === 'reference'
  ? `(${formatLinearDimension(value)})`
  : formatLinearDimension(value);
export const formatAngleDimension = (value: number): string => `${new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(value)}°`;
export const parseLinearDimension = (input: string): number | null => {
  const match = input.trim().match(/^(?:\d+(?:\.\d*)?|\.\d+)\s*(?:mm)?$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const semanticGeometryReferenceKey = (reference: DrawingGeometryReference): string => reference.kind === 'datum' ? `datum:${reference.datum}` : reference.kind === 'sketchPoint' ? `point:${reference.pointId}` : reference.kind === 'entity' ? `entity:${reference.entityId}` : `legacy:${reference.entityId}:${reference.point}`;
export const canonicalDimensionReferencePairKey = (input: DrawingDimension | readonly DrawingGeometryReference[]): string => {
  if (Array.isArray(input)) return input.map(semanticGeometryReferenceKey).sort().join('|');
  const dimension = input as DrawingDimension;
  return dimension.kind === 'POINT_TO_LINE_DISTANCE'
    ? `point-line:${semanticGeometryReferenceKey(dimension.references[0])}|${semanticGeometryReferenceKey(dimension.references[1])}`
    : dimension.kind === 'LINE_TO_LINE_DISTANCE' ? `line-distance:${dimension.references.map(semanticGeometryReferenceKey).join('|')}`
    : dimension.kind === 'LINE_TO_LINE_ANGLE' ? `line-angle:${dimension.references.map(semanticGeometryReferenceKey).join('|')}:${dimension.angleSector.sideA}:${dimension.angleSector.sideB}`
    : dimension.references.map(semanticGeometryReferenceKey).sort().join('|');
};

export type DimensionRoleClassification = Readonly<
  | { role: 'driving'; reason: 'independent' }
  | { role: 'reference'; reason: 'redundant' }
  | { role: 'reference'; reason: 'duplicate' }
  | { role: 'reference'; reason: 'foundation' }
>;

export const classifyNewDimensionRole = (sketch: DrawingSketchV2, candidate: DrawingDimension): DimensionRoleClassification => {
  const pairKey = canonicalDimensionReferencePairKey(candidate);
  const samePair = Object.values(sketch.dimensions).filter((dimension) =>
    canonicalDimensionReferencePairKey(dimension) === pairKey);
  if (samePair.some((dimension) => dimension.kind === candidate.kind)) return { role: 'reference', reason: 'duplicate' };
  if (candidate.kind === 'LINE_TO_LINE_ANGLE') return { role: 'reference', reason: 'foundation' };
  return dimensionIncreasesConstraintRank(sketch, candidate)
    ? { role: 'driving', reason: 'independent' }
    : { role: 'reference', reason: 'redundant' };
};

/** Reference measurement is always resolved from current geometry, never stale `value`. */
export const displayedDimensionMeasurement = (sketch: DrawingSketchV2, dimension: DrawingDimension): number | null => {
  if (dimension.kind === 'LINE_TO_LINE_DISTANCE') {
    const a = resolveDimensionLineReference(sketch, dimension.references[0]), b = resolveDimensionLineReference(sketch, dimension.references[1]);
    return a && b ? measureLineToLineDistance(a, b) : null;
  }
  if (dimension.kind === 'LINE_TO_LINE_ANGLE') {
    const first = resolveDimensionLineReference(sketch, dimension.references[0]), second = resolveDimensionLineReference(sketch, dimension.references[1]);
    if (!first || !second) return null;
    const basis = createLineAngleBasis(first, second), candidate = basis && candidateForSector(basis, dimension.angleSector);
    return candidate?.angleDegrees ?? null;
  }
  if (dimension.role === 'driving') return dimension.value;
  if (dimension.kind === 'POINT_TO_LINE_DISTANCE') {
    const point = resolveDrawingPointReference(sketch, dimension.references[0]), line = resolveDimensionLineReference(sketch, dimension.references[1]);
    return point && line ? measurePointToLine(point, line) : null;
  }
  const a = resolveDrawingPointReference(sketch, dimension.references[0]);
  const b = resolveDrawingPointReference(sketch, dimension.references[1]);
  return a && b ? measureDimension(dimension.kind, a, b) : null;
};

/** Future solver contract: reference dimensions add zero scalar equations. */
export const dimensionConstraintEquationCount = (dimension: DrawingDimension): 0 | 1 => dimension.role === 'driving' ? 1 : 0;

export const appendDimension = (document: DrawingDocumentV2, dimension: DrawingDimension): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return document;
  const valid = dimension.kind === 'POINT_TO_LINE_DISTANCE'
    ? Boolean(resolveDrawingPointReference(sketch, dimension.references[0]) && resolveDimensionLineReference(sketch, dimension.references[1]))
    : dimension.kind === 'LINE_TO_LINE_ANGLE' || dimension.kind === 'LINE_TO_LINE_DISTANCE' ? Boolean(resolveDimensionLineReference(sketch, dimension.references[0]) && resolveDimensionLineReference(sketch, dimension.references[1]))
    : dimension.references.every((r) => Boolean(resolveDrawingPointReference(sketch, r)));
  if (sketch.dimensions[dimension.id] || !valid) return document;
  const classification = classifyNewDimensionRole(sketch, dimension);
  if (classification.reason === 'duplicate') return document;
  const classified = { ...dimension, role: classification.role };
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions: { ...sketch.dimensions, [dimension.id]: classified }, dimensionOrder: [...sketch.dimensionOrder, dimension.id] } } };
};
export const deleteDimension = (document: DrawingDocumentV2, id: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.dimensions[id]) return document;
  const dimensions = { ...sketch.dimensions }; delete dimensions[id];
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions, dimensionOrder: sketch.dimensionOrder.filter((item) => item !== id) } } };
};
export const moveDimensionPlacement = (document: DrawingDocumentV2, id: string, offset: number): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId], dimension = sketch?.dimensions[id];
  if (!sketch || !dimension || dimension.placement.offset === offset) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch, dimensions: { ...sketch.dimensions, [id]: { ...dimension, placement: { ...dimension.placement, offset } } } } } };
};
export const deleteEntityWithDependentDimensions = (document: DrawingDocumentV2, entityId: string): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId]; if (!sketch?.entities[entityId]) return document;
  const next = removeLineAndOrphans(sketch, entityId);
  return { ...document, sketches: { ...document.sketches, [sketch.id]: next } };
};
export const createDimensionId = (): string => `dimension-${crypto.randomUUID()}`;
