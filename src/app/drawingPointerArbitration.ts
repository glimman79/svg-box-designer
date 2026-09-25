import { createArcCenterDragTarget, createArcEndpointDragTarget, createArcRadiusDragTarget, createCircleRadiusDragTarget, createLineBodyDragTarget, resolveArcEndpointOwner, type DrawingGeometryTarget } from './drawingDirectManipulation.js';
import type { DimensionPreselection } from './drawingDimension.js';
import type { DrawingSelectionRef } from './drawingConstraintsTool.js';
import type { DrawingDocumentV2, DrawingEntity, DrawingPoint } from './drawingTypes.js';

export type DrawingPointerEvidence = Readonly<{
  explicitPointId?: string;
  explicitLineId?: string;
  explicitCircleId?: string;
  explicitArcCenterId?: string;
  explicitArcId?: string;
  dimensionId?: string;
  dimensionSurface?: 'line' | 'value';
}>;

export type DrawingPointerOwner =
  | Readonly<{ kind: 'geometry'; selection: DrawingSelectionRef; target: DrawingGeometryTarget }>
  | Readonly<{ kind: 'dimension'; dimensionId: string; surface: 'line' | 'value' }>
  | Readonly<{ kind: 'empty' }>;

export const DRAWING_SEMANTIC_CURVE_TOLERANCE_PX = 8;

/** Selects the nearest finite Circle/Arc proximity candidate in screen pixels. */
export const resolveDrawingCurveProximity = (
  candidates: readonly Readonly<{ entityId: string; distancePx: number }>[],
): Extract<DimensionPreselection, { kind: 'curve' }> | null => {
  const nearest = [...candidates].sort((a, b) => a.distancePx - b.distancePx || a.entityId.localeCompare(b.entityId))[0];
  return nearest && nearest.distancePx <= DRAWING_SEMANTIC_CURVE_TOLERANCE_PX ? { kind: 'curve', ...nearest } : null;
};

/**
 * Select-mode semantic authority. Value controls are intentional UI and remain
 * explicit; everywhere else points precede bodies, bodies precede annotation
 * corridors, and DOM paint order is only evidence.
 */
export const resolveDrawingPointerOwner = (
  document: DrawingDocumentV2,
  pointer: DrawingPoint,
  semantic: DimensionPreselection | null,
  evidence: DrawingPointerEvidence,
  selectedEntityIds: readonly string[] = [],
): DrawingPointerOwner => {
  if (evidence.dimensionId && evidence.dimensionSurface === 'value') {
    return { kind: 'dimension', dimensionId: evidence.dimensionId, surface: 'value' };
  }

  const pointCandidate = evidence.explicitPointId
    ? { pointId: evidence.explicitPointId }
    : semantic?.kind === 'point'
      ? { pointId: semantic.pointId, reference: semantic.reference, lineId: semantic.lineId, endpoint: semantic.point }
      : null;
  if (pointCandidate) {
    if (pointCandidate.reference?.kind === 'derivedPoint' && pointCandidate.reference.role === 'center') {
      const target = createArcCenterDragTarget(document, pointCandidate.reference.entityId);
      if (target) return { kind: 'geometry', selection: { kind: 'arc', arcId: pointCandidate.reference.entityId }, target };
    }
    const pointId = pointCandidate.pointId ?? (() => {
      const sketch = document.sketches[document.activeSketchId];
      const line = sketch?.entities[pointCandidate.lineId ?? ''];
      return line?.type === 'line' ? line[pointCandidate.endpoint === 'end' ? 'endPointId' : 'startPointId'] : undefined;
    })();
    if (pointId) {
      const arcId = resolveArcEndpointOwner(document, pointId, selectedEntityIds);
      const target = arcId ? createArcEndpointDragTarget(document, arcId, pointId) : { kind: 'point' as const, pointId };
      if (target) return { kind: 'geometry', selection: { kind: 'point', pointId }, target };
    }
  }

  const sketch = document.sketches[document.activeSketchId];
  const bodyId = evidence.explicitLineId ?? evidence.explicitCircleId ?? evidence.explicitArcId
    ?? (semantic?.kind === 'line' ? semantic.lineId : semantic?.kind === 'curve' ? semantic.entityId : undefined);
  const entity = bodyId ? (sketch?.entities as unknown as Record<string, DrawingEntity> | undefined)?.[bodyId] : undefined;
  const target = entity?.type === 'line' ? createLineBodyDragTarget(document, entity.id, pointer)
    : entity?.type === 'circle' ? createCircleRadiusDragTarget(document, entity.id, pointer)
    : entity?.type === 'arc' ? createArcRadiusDragTarget(document, entity.id, pointer) : null;
  if (target) {
    const selection: DrawingSelectionRef = entity!.type === 'line' ? { kind: 'line', lineId: entity!.id }
      : entity!.type === 'circle' ? { kind: 'circle', circleId: entity!.id }
      : { kind: 'arc', arcId: entity!.id };
    return { kind: 'geometry', selection, target };
  }

  if (evidence.explicitArcCenterId) {
    const target = createArcCenterDragTarget(document, evidence.explicitArcCenterId);
    if (target) return { kind: 'geometry', selection: { kind: 'arc', arcId: evidence.explicitArcCenterId }, target };
  }
  return evidence.dimensionId
    ? { kind: 'dimension', dimensionId: evidence.dimensionId, surface: evidence.dimensionSurface ?? 'line' }
    : { kind: 'empty' };
};
