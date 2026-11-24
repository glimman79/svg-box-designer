import type { SketchDefinition, SketchOperation } from './constructionOperations';
import { distanceToArc } from './drawingArcGeometry.js';
import { distancePointToSegment } from './drawingInference.js';
import { DRAWING_SEMANTIC_CURVE_TOLERANCE_PX } from './drawingPointerArbitration.js';
import { resolveArc, resolveCircle, resolveLine } from './drawingTopology.js';
import type { DrawingEntity, DrawingPoint, DrawingSketchV2 } from './drawingTypes';

const neutralPalette = ['#2163a1', '#ac491d', '#267443', '#36776d', '#866c32', '#9a526c', '#546984', '#617442'];

export function neutralSketchColor(operation: SketchOperation) {
  return neutralPalette[(operation.presentationIndex ?? 0) % neutralPalette.length];
}

export function resolveSketchMember(sketch: DrawingSketchV2, id: string) {
  const entity: DrawingEntity = (sketch.entities as Record<string, DrawingEntity>)[id];
  switch (entity.type) {
    case 'line': return resolveLine(sketch, entity);
    case 'circle': return resolveCircle(sketch, entity);
    case 'arc': return resolveArc(sketch, entity);
  }
}

/** The viewport has a uniform SVG scale. Test finite geometry once per owner, in construction order. */
export function findSketchOwners(definitions: readonly SketchDefinition[], point: DrawingPoint, pixelsPerUnit: number) {
  return definitions.filter(({ sketch }) => sketch.entityOrder.some(id => {
    const member = resolveSketchMember(sketch, id);
    if (!member) return false;
    let distance: number;
    switch (member.type) {
      case 'line': distance = distancePointToSegment(point, member.start, member.end).distance; break;
      case 'circle': distance = Math.abs(Math.hypot(point.x - member.center.x, point.y - member.center.y) - member.radius); break;
      case 'arc': distance = distanceToArc(point, member); break;
    }
    return distance * pixelsPerUnit <= DRAWING_SEMANTIC_CURVE_TOLERANCE_PX;
  }));
}
