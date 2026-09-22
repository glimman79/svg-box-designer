import { canonicalCoincidentPointPair } from './drawingCoincidentConstraint.js';
import type { DrawingDocumentV2, DrawingGeometricConstraint, DrawingLineEntity } from './drawingTypes.js';
import type { DrawingLineDraft } from './drawingLineSegmentSupport.js';
import type { DrawingCircleDraft } from './drawingCircleTool.js';

export const appendCircleToActiveSketch = (document: DrawingDocumentV2, draft: DrawingCircleDraft,
  createPointId: () => string = () => `point-${crypto.randomUUID()}`,
  midpointLineId: string | null = null, circumferencePointId: string | null = null): DrawingDocumentV2 => {
  const sketch = document.sketches[document.activeSketchId];
  if (!sketch || (sketch.entities as unknown as Record<string, unknown>)[draft.id] || !Number.isFinite(draft.radius) || draft.radius <= 1e-9) return document;
  const centerPointId = draft.centerPointId ?? createPointId();
  const circle = { id: draft.id, type: 'circle' as const, centerPointId, radius: draft.radius };
  const constraints: DrawingGeometricConstraint[] = [];
  if (midpointLineId && sketch.entities[midpointLineId]?.type === 'line') constraints.push({ id: `midpoint:${centerPointId}:${midpointLineId}`, kind: 'MIDPOINT',
    references: [{ kind: 'sketchPoint', pointId: centerPointId }, { kind: 'entity', entityId: midpointLineId }] });
  if (circumferencePointId && sketch.points[circumferencePointId] && circumferencePointId !== centerPointId) constraints.push({
    id: `coincident:${circumferencePointId}:curve:${draft.id}`, kind: 'COINCIDENT', variant: 'point-curve',
    references: [{ kind: 'sketchPoint', pointId: circumferencePointId }, { kind: 'entity', entityId: draft.id }],
  });
  const entities = { ...sketch.entities, [draft.id]: circle } as unknown as typeof sketch.entities;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: { ...sketch,
    points: sketch.points[centerPointId] ? sketch.points : { ...sketch.points, [centerPointId]: { id: centerPointId, ...draft.center } },
    entities, entityOrder: [...sketch.entityOrder, draft.id],
    geometricConstraints: { ...sketch.geometricConstraints, ...Object.fromEntries(constraints.map((item) => [item.id, item])) },
    geometricConstraintOrder: [...sketch.geometricConstraintOrder, ...constraints.map(({ id }) => id)],
  } } };
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
    const duplicatePair = Object.values(activeSketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === 'COINCIDENT' && constraint.variant === 'point-point'
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
