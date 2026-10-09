import { DRAWING_CONSTRAINT_TOLERANCE_MM, solveDrawingComponentDrag, solveDrawingGeometricIntent, verifyDrawingConstraints } from './drawingConstraintSolver.js';
import { resolveDrawingArc, projectPointToArc } from './drawingArcGeometry.js';
import { resolveCircularSupport } from './drawingCircularSupport.js';
import { analyzeDrawingConstraints } from './drawingConstraintAnalysis.js';
import { circularRadiusSolverVariable, pointSolverVariables } from './drawingSolverVariables.js';
import { displayedDimensionMeasurement, drawingPointReferenceDependencies, measureDimension, resolveDrawingPointReference, sketchPointIdFromReference } from './drawingDimension.js';
import { pointIdForLineEndpoint } from './drawingTopology.js';
import type { DrawingDimension, DrawingDocumentV2, DrawingEntity, DrawingPoint, DrawingSketchV2, ResolvedDrawingArc } from './drawingTypes.js';

export const DRAWING_DRAG_THRESHOLD_PX = 4;
const ARC_CONTINUATION_SAMPLE_PARAMETERS = [1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 7 / 8] as const;

export type DrawingGeometryTarget =
  | Readonly<{ kind: 'point'; pointId: string }>
  | Readonly<{ kind: 'line'; lineId: string; segmentParameter?: number; grabOffset?: DrawingPoint }>
  | Readonly<{ kind: 'arc-endpoint'; entityId: string; draggedPointId: string; pivotPointId: string }>
  | Readonly<{ kind: 'arc-radius'; entityId: string; sweepParameter: number; radialDirection: DrawingPoint; grabOffset: DrawingPoint }>
  | Readonly<{ kind: 'arc-center'; entityId: string }>
  | Readonly<{ kind: 'entity-scalar'; entityId: string; scalar: 'circular-radius'; radialDirection: DrawingPoint; grabOffset: DrawingPoint }>;

/** Converts a circumference hit into a semantic scalar target. The stored
 * offset makes the pointer-down pose an identity mapping despite hit slop. */
export const createCircleRadiusDragTarget = (document: DrawingDocumentV2, circleId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  const circle = sketch ? (sketch.entities as unknown as Record<string, DrawingEntity>)[circleId] : undefined;
  if (circle?.type !== 'circle') return null;
  const center = sketch.points[circle.centerPointId];
  if (!center) return null;
  const dx = pointer.x - center.x, dy = pointer.y - center.y, length = Math.hypot(dx, dy);
  if (length <= DRAWING_CONSTRAINT_TOLERANCE_MM) return null;
  const radialDirection = { x: dx / length, y: dy / length };
  const resolved = { x: center.x + circle.radius * radialDirection.x, y: center.y + circle.radius * radialDirection.y };
  return { kind: 'entity-scalar', entityId: circle.id, scalar: 'circular-radius', radialDirection,
    grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** A persistent center hit owns one rigid-translation grip. */
export const createArcCenterDragTarget = (document: DrawingDocumentV2, arcId: string): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId];
  return sketch && arcInSketch(sketch, arcId) ? { kind: 'arc-center', entityId: arcId } : null;
};

/** Creates an endpoint session referenced exclusively to the drag-start Arc. */
export const createArcEndpointDragTarget = (document: DrawingDocumentV2, arcId: string, draggedPointId: string): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId], arc = sketch && arcInSketch(sketch, arcId);
  return arc && (draggedPointId === arc.startPointId || draggedPointId === arc.endPointId)
    ? { kind: 'arc-endpoint', entityId: arcId, draggedPointId,
      pivotPointId: draggedPointId === arc.startPointId ? arc.endPointId : arc.startPointId } : null;
};

/** Resolves semantic ownership after the physical point hit. A unique selected
 * incident Arc disambiguates a shared endpoint; otherwise multiple Arc owners
 * intentionally fall back to ordinary point manipulation. */
export const resolveArcEndpointOwner = (document: DrawingDocumentV2, pointId: string, selectedEntityIds: readonly string[]): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch?.points[pointId]) return null;
  const incident = Object.values(sketch.entities as unknown as Record<string, DrawingEntity>).filter((entity): entity is Extract<DrawingEntity, { type: 'arc' }> =>
    entity.type === 'arc' && (entity.startPointId === pointId || entity.endPointId === pointId));
  const selectedIncident = incident.filter(({ id }) => selectedEntityIds.includes(id));
  if (selectedIncident.length === 1) return selectedIncident[0].id;
  if (selectedIncident.length > 1 || incident.length !== 1) return null;
  // A selected non-Arc entity is an explicit conflicting context.
  return selectedEntityIds.length === 0 ? incident[0].id : null;
};

/** Converts an Arc body hit into a radial interaction. The hit-slop offset
 * makes the pointer-down pose an identity while the endpoints remain canonical. */
export const createArcRadiusDragTarget = (document: DrawingDocumentV2, arcId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId], arc = sketch && arcInSketch(sketch, arcId);
  if (!arc || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
  const resolved = projectPointToArc(pointer, arc);
  const radialDirection = { x: (resolved.x - arc.center.x) / arc.radius, y: (resolved.y - arc.center.y) / arc.radius };
  const angle = Math.atan2(radialDirection.y, radialDirection.x);
  const progress = arc.signedSweep > 0 ? angle - arc.startAngle : arc.startAngle - angle;
  const sweepParameter = Math.max(0, Math.min(1, ((progress % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) / Math.abs(arc.signedSweep)));
  return { kind: 'arc-radius', entityId: arcId, sweepParameter, radialDirection,
    grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** The canonical resolver is also the grip's validity boundary. */
const arcInSketch = (sketch: DrawingSketchV2, id: string) => {
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[id];
  const support = entity?.type === 'arc' ? resolveCircularSupport(sketch, entity) : null;
  return support?.entity.type === 'arc' ? support.entity : null;
};

const arcPointAt = (arc: ResolvedDrawingArc, t: number): DrawingPoint => ({
  x: arc.center.x + arc.radius * Math.cos(arc.startAngle + arc.signedSweep * t),
  y: arc.center.y + arc.radius * Math.sin(arc.startAngle + arc.signedSweep * t),
});

// Objective evaluations must admit unconverged radial equation trials. Only
// this transient metric projects endpoint directions onto Circular Support;
// every accepted canonical candidate still passes the shared domain verifier.
const arcContinuationGeometry = (sketch: DrawingSketchV2, id: string): ResolvedDrawingArc | null => {
  const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[id];
  if (entity?.type !== 'arc') return null;
  const center = sketch.points[entity.centerPointId];
  if (!center) return null;
  const radial = (pointId: string) => {
    const p = sketch.points[pointId]; if (!p) return null;
    const length = Math.hypot(p.x - center.x, p.y - center.y);
    return length > 0 ? { x: center.x + (p.x - center.x) * entity.radius / length,
      y: center.y + (p.y - center.y) * entity.radius / length } : null;
  };
  const start = radial(entity.startPointId), end = radial(entity.endPointId);
  return start && end ? resolveDrawingArc(entity, center, start, end) : null;
};

const arcContinuationResiduals = (before: ResolvedDrawingArc, after: ResolvedDrawingArc): number[] => {
  const scale = Math.max(before.radius, Math.hypot(before.end.x - before.start.x, before.end.y - before.start.y), DRAWING_CONSTRAINT_TOLERANCE_MM);
  const sampleScale = scale * Math.sqrt(ARC_CONTINUATION_SAMPLE_PARAMETERS.length);
  return [...ARC_CONTINUATION_SAMPLE_PARAMETERS.flatMap(t => {
    const a = arcPointAt(before, t), b = arcPointAt(after, t);
    return [(b.x - a.x) / sampleScale, (b.y - a.y) / sampleScale];
  }), (after.center.x - before.center.x) / scale,
    (after.center.y - before.center.y) / scale, Math.log(after.radius / before.radius)];
};

/** Absolute canonical branch charts, projected by the shared component solve.
 * Fixed radius contributes both circle-intersection roots and the 2R boundary.
 * No previous preview or representation-specific curve parameter is authority. */
const arcEndpointContinuationSeeds = (sketch: DrawingSketchV2, arc: ResolvedDrawingArc,
  draggedPointId: string, pointer: DrawingPoint): DrawingSketchV2[] => {
  const pivotId = draggedPointId === arc.startPointId ? arc.endPointId : arc.startPointId;
  const pivot = sketch.points[pivotId], original = sketch.points[draggedPointId];
  const seeds: DrawingSketchV2[] = [];
  const add = (point: DrawingPoint, center: DrawingPoint, radius: number) => {
    const candidate = { ...sketch, points: { ...sketch.points,
      [draggedPointId]: { ...original, ...point }, [arc.centerPointId]: { ...sketch.points[arc.centerPointId], ...center } },
      entities: { ...sketch.entities, [arc.id]: { ...sketch.entities[arc.id], radius } } as DrawingSketchV2['entities'] };
    if (arcInSketch(candidate, arc.id)) seeds.push(candidate);
  };
  const radiusDimension = Object.values(sketch.dimensions).find(d => d.role === 'driving' && d.kind === 'CIRCULAR_SIZE' && d.references[0].entityId === arc.id);
  const fixedRadius = radiusDimension?.kind === 'CIRCULAR_SIZE' ? radiusDimension.value / (radiusDimension.mode === 'diameter' ? 2 : 1) : null;
  const startDx = arc.end.x - arc.start.x, startDy = arc.end.y - arc.start.y, startChord = Math.hypot(startDx, startDy);
  const initialHeightRatio = ((arc.center.x - arc.start.x) * -startDy + (arc.center.y - arc.start.y) * startDx) / (startChord * startChord);
  for (let step = 1; step <= 8; step += 1) {
    const t = step / 8;
    let point = { x: original.x + (pointer.x - original.x) * t, y: original.y + (pointer.y - original.y) * t };
    let dx = point.x - pivot.x, dy = point.y - pivot.y, chord = Math.hypot(dx, dy);
    if (chord <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) continue;
    if (fixedRadius !== null) {
      const distance = Math.min(chord, 2 * fixedRadius);
      point = { x: pivot.x + dx * distance / chord, y: pivot.y + dy * distance / chord };
      dx = point.x - pivot.x; dy = point.y - pivot.y; chord = Math.hypot(dx, dy);
      const half = chord / 2;
      const height = fixedRadius * Math.sqrt(Math.max(0, (1 - half / fixedRadius) * (1 + half / fixedRadius)));
      for (const side of [-1, 1]) add(point, { x: pivot.x + dx / 2 - side * dy / chord * height,
        y: pivot.y + dy / 2 + side * dx / chord * height }, fixedRadius);
    } else {
      const start = draggedPointId === arc.startPointId ? point : pivot;
      const end = draggedPointId === arc.endPointId ? point : pivot;
      const sx = end.x - start.x, sy = end.y - start.y;
      for (const ratio of step === 8 ? [initialHeightRatio, -10, -2, -.5, 0, .5, 2, 10] : [initialHeightRatio, -.5, .5]) {
        const center = { x: start.x + sx / 2 - sy * ratio, y: start.y + sy / 2 + sx * ratio };
        add(point, center, Math.hypot(point.x - center.x, point.y - center.y));
      }
    }
  }
  // A center-axis Driving Dimension can disconnect the fixed-radius manifold.
  // Include its analytic center roots in persistent SketchPoint coordinates.
  if (fixedRadius !== null) {
    for (const dimension of Object.values(sketch.dimensions)) {
      if (dimension.role !== 'driving' || !['HORIZONTAL_DISTANCE', 'VERTICAL_DISTANCE'].includes(dimension.kind)) continue;
      const refs = dimension.references;
      if (refs.length !== 2 || !refs.some(r => r.kind === 'sketchPoint' && r.pointId === arc.centerPointId)
        || !refs.some(r => r.kind === 'datum' && r.datum === 'ORIGIN')) continue;
      const axis = dimension.kind === 'HORIZONTAL_DISTANCE' ? 'x' : 'y', other = axis === 'x' ? 'y' : 'x';
      for (const sign of [-1, 1]) {
        const fixed = sign * dimension.value, offset = fixed - pivot[axis];
        if (Math.abs(offset) > fixedRadius) continue;
        const height = fixedRadius * Math.sqrt(Math.max(0, (1 - Math.abs(offset) / fixedRadius) * (1 + Math.abs(offset) / fixedRadius)));
        for (const side of [-1, 1]) {
          const center = { [axis]: fixed, [other]: pivot[other] + side * height } as DrawingPoint;
          const dx = pointer.x - center.x, dy = pointer.y - center.y, distance = Math.hypot(dx, dy);
          if (distance > 0) add({ x: center.x + fixedRadius * dx / distance,
            y: center.y + fixedRadius * dy / distance }, center, fixedRadius);
        }
      }
    }
  }
  return seeds;
};

const pointTargets = (pointId: string, point: DrawingPoint) => pointSolverVariables(pointId).map(variable => ({
  variable, value: point[variable.kind === 'point-axis' ? variable.axis : 'x'],
}));

export const pointIdFromHit = (document: DrawingDocumentV2, lineId: string, endpoint: 'start' | 'end'): string | null => {
  const sketch = document.sketches[document.activeSketchId];
  const line = sketch?.entities[lineId];
  return line ? pointIdForLineEndpoint(line, endpoint) : null;
};

/** Captures the finite Line location under the pointer without adding topology. */
export const createLineBodyDragTarget = (document: DrawingDocumentV2, lineId: string, pointer: DrawingPoint): DrawingGeometryTarget | null => {
  const sketch = document.sketches[document.activeSketchId], line = sketch?.entities[lineId];
  if (line?.type !== 'line') return null;
  const start = sketch.points[line.startPointId], end = sketch.points[line.endPointId];
  if (!start || !end) return null;
  const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= DRAWING_CONSTRAINT_TOLERANCE_MM ** 2) return null;
  const segmentParameter = Math.max(0, Math.min(1, ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSquared));
  const resolved = { x: start.x + dx * segmentParameter, y: start.y + dy * segmentParameter };
  return { kind: 'line', lineId, segmentParameter, grabOffset: { x: pointer.x - resolved.x, y: pointer.y - resolved.y } };
};

/** Collect equations touching the authoritative points moved by a candidate. */
export const collectAffectedDrivingDimensions = (
  document: DrawingDocumentV2,
  movedPointIds: ReadonlySet<string>,
): readonly DrawingDimension[] => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return [];
  return Object.values(sketch.dimensions).filter((dimension) => dimension.role === 'driving' && dimension.references.some((reference) => {
    if (reference.kind === 'entity') { const line = sketch.entities[reference.entityId]; return Boolean(line && (movedPointIds.has(line.startPointId) || movedPointIds.has(line.endPointId))); }
    return drawingPointReferenceDependencies(sketch, reference).some((variable) => variable.kind === 'point-axis' && movedPointIds.has(variable.pointId));
  }));
};

/** Validate the supplied equation set (all driving equations by default). */
export const validateDrivingDimensions = (document: DrawingDocumentV2, dimensions?: readonly DrawingDimension[]): boolean => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch) return false;
  return (dimensions ?? Object.values(sketch.dimensions).filter(({ role }) => role === 'driving')).every((dimension) => {
    if (dimension.kind === 'LINE_TO_LINE_ANGLE' || dimension.kind === 'LINE_TO_LINE_DISTANCE' || dimension.kind === 'CIRCULAR_SIZE') {
      const value = displayedDimensionMeasurement(sketch, dimension);
      return value !== null && Math.abs(value - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM;
    }
    if (dimension.kind === 'POINT_TO_LINE_DISTANCE') {
      const point = resolveDrawingPointReference(sketch, dimension.references[0]);
      const line = sketch.entities[dimension.references[1].entityId];
      if (!point || !line) return false;
      const a = sketch.points[line.startPointId], b = sketch.points[line.endPointId], length = Math.hypot(b.x - a.x, b.y - a.y);
      return length > 0 && Math.abs(Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM;
    }
    const a = resolveDrawingPointReference(sketch, dimension.references[0]);
    const b = resolveDrawingPointReference(sketch, dimension.references[1]);
    return Boolean(a && b && Math.abs(measureDimension(dimension.kind, a!, b!) - dimension.value) <= DRAWING_CONSTRAINT_TOLERANCE_MM);
  });
};

/** Derive each preview from the drag-start document and total pointer delta. */
export const solveDrawingDragCandidate = (document: DrawingDocumentV2, target: DrawingGeometryTarget, delta: DrawingPoint, startPointer?: DrawingPoint): DrawingDocumentV2 | null => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null;
  if (target.kind === 'arc-radius' || target.kind === 'arc-endpoint' || target.kind === 'arc-center') {
    const arc = arcInSketch(sketch, target.entityId);
    if (!arc) return null;
    if (delta.x === 0 && delta.y === 0) return document;
    const radiusVariable = circularRadiusSolverVariable(arc.id);
    const finish = (solved: DrawingSketchV2 | null): DrawingDocumentV2 | null => {
      if (!solved) return null;
      if (solved === sketch) return document;
      const component = analyzeDrawingConstraints(sketch).componentByPointId.get(arc.centerPointId);
      return verifyDrawingConstraints(solved, component?.dimensionIds ?? [], component?.geometricConstraintIds ?? [], component ? [...component.pointIds] : undefined)
        ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
    };
    if (target.kind === 'arc-center') {
      const requested = { x: arc.center.x + delta.x, y: arc.center.y + delta.y };
      const startVector = { x: arc.start.x - arc.center.x, y: arc.start.y - arc.center.y };
      const endVector = { x: arc.end.x - arc.center.x, y: arc.end.y - arc.center.y };
      const solved = solveDrawingGeometricIntent(sketch, {
        seedVariable: radiusVariable, fixedVariables: [radiusVariable], modelScale: Math.max(1, arc.radius),
        exactVariableTargets: [
          ...pointTargets(arc.centerPointId, requested),
          ...pointTargets(arc.startPointId, { x: arc.start.x + delta.x, y: arc.start.y + delta.y }),
          ...pointTargets(arc.endPointId, { x: arc.end.x + delta.x, y: arc.end.y + delta.y }),
          { variable: radiusVariable, value: arc.radius },
        ],
        primaryResiduals: candidate => {
          const c = candidate.points[arc.centerPointId]; return c ? [c.x - requested.x, c.y - requested.y] : null;
        },
        semanticResiduals: candidate => {
          const c = candidate.points[arc.centerPointId], a = candidate.points[arc.startPointId], b = candidate.points[arc.endPointId];
          return c && a && b ? [(a.x - c.x) - startVector.x, (a.y - c.y) - startVector.y,
            (b.x - c.x) - endVector.x, (b.y - c.y) - endVector.y] : null;
        },
      });
      if (!solved || solved === sketch) return finish(solved);
      const c = solved.points[arc.centerPointId];
      // Express one exact translation after numerical projection, then verify
      // the polished pose against the same persistent component equations.
      const dx = c.x - arc.center.x, dy = c.y - arc.center.y;
      return finish({ ...solved, points: { ...solved.points,
        [arc.startPointId]: { ...solved.points[arc.startPointId], x: arc.start.x + dx, y: arc.start.y + dy },
        [arc.endPointId]: { ...solved.points[arc.endPointId], x: arc.end.x + dx, y: arc.end.y + dy } } });
    }
    if (target.kind === 'arc-radius') {
      if (!startPointer) return null;
      // Retain the established Arc minimum-size policy; R1/R3 stay open.
      const requestedRadius = Math.max(DRAWING_CONSTRAINT_TOLERANCE_MM * 100,
        arc.radius + delta.x * target.radialDirection.x + delta.y * target.radialDirection.y);
      const radialPoint = (point: DrawingPoint, radius: number) => ({
        x: arc.center.x + (point.x - arc.center.x) * radius / arc.radius,
        y: arc.center.y + (point.y - arc.center.y) * radius / arc.radius,
      });
      const solved = solveDrawingGeometricIntent(sketch, {
        seedVariable: radiusVariable, fixedVariables: pointSolverVariables(arc.centerPointId), modelScale: Math.max(1, arc.radius),
        exactVariableTargets: [
          ...pointTargets(arc.centerPointId, arc.center),
          ...pointTargets(arc.startPointId, radialPoint(arc.start, requestedRadius)),
          ...pointTargets(arc.endPointId, radialPoint(arc.end, requestedRadius)),
          { variable: radiusVariable, value: requestedRadius },
        ],
        primaryResiduals: candidate => {
          const e = (candidate.entities as unknown as Record<string, DrawingEntity>)[arc.id];
          return e?.type === 'arc' ? [e.radius - requestedRadius] : null;
        },
        semanticResiduals: candidate => {
          const e = (candidate.entities as unknown as Record<string, DrawingEntity>)[arc.id];
          const a = candidate.points[arc.startPointId], b = candidate.points[arc.endPointId];
          if (e?.type !== 'arc' || !a || !b) return null;
          const idealA = radialPoint(arc.start, e.radius), idealB = radialPoint(arc.end, e.radius);
          return [a.x - idealA.x, a.y - idealA.y, b.x - idealB.x, b.y - idealB.y];
        },
      });
      if (!solved || solved === sketch) return finish(solved);
      const e = (solved.entities as unknown as Record<string, DrawingEntity>)[arc.id];
      if (e?.type !== 'arc') return null;
      if (Math.hypot(arc.end.x - arc.start.x, arc.end.y - arc.start.y) * e.radius / arc.radius <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
      return finish({ ...solved, points: { ...solved.points,
        [arc.startPointId]: { ...solved.points[arc.startPointId], ...radialPoint(arc.start, e.radius) },
        [arc.endPointId]: { ...solved.points[arc.endPointId], ...radialPoint(arc.end, e.radius) } } });
    }
    const dragged = sketch.points[target.draggedPointId], pivot = sketch.points[target.pivotPointId];
    if (!dragged || !pivot || target.draggedPointId !== arc.startPointId && target.draggedPointId !== arc.endPointId
      || target.pivotPointId !== (target.draggedPointId === arc.startPointId ? arc.endPointId : arc.startPointId)) return null;
    const pointer = { x: dragged.x + delta.x, y: dragged.y + delta.y };
    const drivingRadius = Object.values(sketch.dimensions).find(d => d.role === 'driving' && d.kind === 'CIRCULAR_SIZE' && d.references[0].entityId === arc.id);
    const fixedRadius = drivingRadius?.kind === 'CIRCULAR_SIZE' ? drivingRadius.value / (drivingRadius.mode === 'diameter' ? 2 : 1) : null;
    const dx = pointer.x - pivot.x, dy = pointer.y - pivot.y, chord = Math.hypot(dx, dy);
    const boundary = fixedRadius !== null && chord >= 2 * fixedRadius;
    const primaryPoint = boundary ? { x: pivot.x + dx * (2 * fixedRadius!) / chord, y: pivot.y + dy * (2 * fixedRadius!) / chord } : pointer;
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: radiusVariable, fixedVariables: pointSolverVariables(target.pivotPointId), modelScale: Math.max(1, arc.radius),
      exactVariableTargets: [
        ...pointTargets(target.draggedPointId, primaryPoint), ...pointTargets(target.pivotPointId, pivot),
        ...(boundary ? [...pointTargets(arc.centerPointId, { x: pivot.x + (primaryPoint.x - pivot.x) / 2,
          y: pivot.y + (primaryPoint.y - pivot.y) / 2 }), { variable: radiusVariable, value: fixedRadius! }] : []),
      ],
      continuationSeeds: arcEndpointContinuationSeeds(sketch, arc, target.draggedPointId, pointer),
      primaryResiduals: candidate => {
        const p = candidate.points[target.draggedPointId]; return p ? [p.x - pointer.x, p.y - pointer.y] : null;
      },
      geometricResiduals: candidate => {
        const after = arcContinuationGeometry(candidate, arc.id);
        return after && after.orientation === arc.orientation ? arcContinuationResiduals(arc, after) : null;
      },
    });
    if (solved && Math.hypot(solved.points[arc.endPointId].x - solved.points[arc.startPointId].x,
      solved.points[arc.endPointId].y - solved.points[arc.startPointId].y) <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
    return finish(solved);
  }

  if (target.kind === 'entity-scalar') {
    if (!startPointer) return null;
    const pointer = { x: startPointer.x + delta.x, y: startPointer.y + delta.y };
    const entity = (sketch.entities as unknown as Record<string, DrawingEntity>)[target.entityId];
    if (entity?.type !== 'circle') return null;
    const center = sketch.points[entity.centerPointId];
    if (!center) return null;
    const resolvedPointer = { x: pointer.x - target.grabOffset.x, y: pointer.y - target.grabOffset.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: circularRadiusSolverVariable(entity.id), modelScale: Math.max(1, entity.radius),
      primaryResiduals: (candidate) => {
        const candidateEntity = (candidate.entities as unknown as Record<string, DrawingEntity>)[entity.id];
        const candidateCenter = candidateEntity?.type === 'circle' ? candidate.points[candidateEntity.centerPointId] : null;
        return candidateEntity?.type === 'circle' && candidateCenter ? [
          candidateCenter.x + candidateEntity.radius * target.radialDirection.x - resolvedPointer.x,
          candidateCenter.y + candidateEntity.radius * target.radialDirection.y - resolvedPointer.y,
        ] : null;
      },
      semanticResiduals: (candidate) => {
        const candidateCenter = candidate.points[entity.centerPointId];
        return candidateCenter ? [candidateCenter.x - center.x, candidateCenter.y - center.y] : null;
      },
    });
    const solvedEntity = solved ? (solved.entities as unknown as Record<string, DrawingEntity>)[entity.id] : null;
    if (solvedEntity?.type === 'circle' && solvedEntity.radius <= DRAWING_CONSTRAINT_TOLERANCE_MM * 100) return null;
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'line' && target.segmentParameter !== undefined && target.grabOffset && startPointer) {
    if (delta.x === 0 && delta.y === 0) return document;
    const line = sketch.entities[target.lineId]; if (line?.type !== 'line') return null;
    const start = sketch.points[line.startPointId], end = sketch.points[line.endPointId]; if (!start || !end) return null;
    const pointer = { x: startPointer.x + delta.x - target.grabOffset.x, y: startPointer.y + delta.y - target.grabOffset.y };
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: { kind: 'point-axis', pointId: line.startPointId, axis: 'x' }, modelScale: Math.max(1, Math.hypot(end.x - start.x, end.y - start.y)),
      variables: [...pointSolverVariables(line.startPointId), ...pointSolverVariables(line.endPointId)],
      primaryResiduals: (candidate) => { const a = candidate.points[line.startPointId], b = candidate.points[line.endPointId]; return a && b ? [
        a.x + (b.x - a.x) * target.segmentParameter! - pointer.x,
        a.y + (b.y - a.y) * target.segmentParameter! - pointer.y,
      ] : null; },
      secondaryResiduals: (candidate) => { const a = candidate.points[line.startPointId], b = candidate.points[line.endPointId]; return a && b
        ? [(b.x - a.x) - (end.x - start.x), (b.y - a.y) - (end.y - start.y)] : null; },
    });
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  if (target.kind === 'point') {
    if (delta.x === 0 && delta.y === 0) return document;
    const point = sketch.points[target.pointId];
    if (!point) return null;
    const requested = { x: point.x + delta.x, y: point.y + delta.y };
    const component = analyzeDrawingConstraints(sketch).componentByPointId.get(target.pointId);
    const dimensionOnlyContinuation = component && !component.geometricConstraintIds.length
      ? [...component.pointIds].filter((pointId) => pointId !== target.pointId)
      : [];
    const solved = solveDrawingGeometricIntent(sketch, {
      seedVariable: pointSolverVariables(target.pointId)[0],
      modelScale: Math.max(1, Math.hypot(delta.x, delta.y)),
      exactVariableTargets: [
        { variable: { kind: 'point-axis', pointId: target.pointId, axis: 'x' }, value: requested.x },
        { variable: { kind: 'point-axis', pointId: target.pointId, axis: 'y' }, value: requested.y },
      ],
      primaryResiduals: (candidate) => {
        const candidatePoint = candidate.points[target.pointId];
        return candidatePoint ? [candidatePoint.x - requested.x, candidatePoint.y - requested.y] : null;
      },
      // Preserve the useful #593 continuation policy without turning a
      // relative Dimension into an absolute stationary frame. These stays
      // select a stable pose only after the pointer optimum has been found.
      secondaryResiduals: dimensionOnlyContinuation.length ? (candidate) => dimensionOnlyContinuation.flatMap((pointId) => {
        const before = sketch.points[pointId], after = candidate.points[pointId];
        return before && after ? [after.x - before.x, after.y - before.y] : [];
      }) : undefined,
    });
    if (solved && (!component || !component.dimensionIds.length && !component.geometricConstraintIds.length)) {
      const exact = { ...solved, points: { ...solved.points, [target.pointId]: { ...solved.points[target.pointId], ...requested } } };
      // Polishing pointer coordinates is another candidate, subject to the
      // same intrinsic equations and entity domains as the shared solver.
      if (verifyDrawingConstraints(exact, [], [], component ? [...component.pointIds] : [target.pointId]))
        return { ...document, sketches: { ...document.sketches, [sketch.id]: exact } };
    }
    return solved === sketch ? document : solved ? { ...document, sketches: { ...document.sketches, [sketch.id]: solved } } : null;
  }
  const line = sketch.entities[target.lineId];
  const ids = line ? [...new Set([line.startPointId, line.endPointId])] : [];
  if (!ids.length || ids.some((id) => !sketch.points[id])) return null;
  const moves = Object.fromEntries(ids.map((id) => {
    const point = sketch.points[id];
    return [id, { x: point.x + delta.x, y: point.y + delta.y }];
  }));
  const solvedSketch = solveDrawingComponentDrag(sketch, moves, { directLineIds: [target.lineId] });
  if (!solvedSketch) return null;
  const candidate = { ...document, sketches: { ...document.sketches, [sketch.id]: solvedSketch } };
  const affectedPointIds = new Set(Object.keys(sketch.points).filter((id) => {
    const before = sketch.points[id], after = solvedSketch.points[id];
    return Math.hypot(before.x - after.x, before.y - after.y) > DRAWING_CONSTRAINT_TOLERANCE_MM;
  }));
  if (!affectedPointIds.size) return document;
  return validateDrivingDimensions(candidate, collectAffectedDrivingDimensions(document, affectedPointIds)) ? candidate : null;
};
