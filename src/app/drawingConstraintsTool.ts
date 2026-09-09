import { addCoincidentConstraint, addPointOnLinearSupportConstraint } from './drawingCoincidentConstraint.js';
import { solveDrawingComponentDrag } from './drawingConstraintSolver.js';
import type { DrawingDocumentV2, DrawingGeometricConstraint, DrawingSketchV2 } from './drawingTypes.js';

export type DrawingSelectionRef = Readonly<{ kind: 'line'; lineId: string }> | Readonly<{ kind: 'point'; pointId: string }>;
const drawingSelectionKey = (ref: DrawingSelectionRef) => ref.kind === 'line' ? `line:${ref.lineId}` : `point:${ref.pointId}`;

/** Toggles exactly one stable semantic target while preserving the order of every other selection. */
export const toggleDrawingGeometrySelection = (selection: readonly DrawingSelectionRef[], target: DrawingSelectionRef): readonly DrawingSelectionRef[] => {
  const targetKey = drawingSelectionKey(target);
  return selection.some((ref) => drawingSelectionKey(ref) === targetKey)
    ? selection.filter((ref) => drawingSelectionKey(ref) !== targetKey)
    : [...selection, target];
};
export type DrawingConstraintChoice = 'distance' | 'length' | 'angle' | 'radiusDiameter' | 'symmetry' | 'midpoint' | 'fix' | 'coincidence' | 'concentricity' | 'tangency' | 'parallelism' | 'perpendicular' | 'horizontal' | 'vertical';
export const DRAWING_CONSTRAINT_CATALOG: readonly Readonly<{ kind: DrawingConstraintChoice; label: string }>[] = [
  ['distance', 'Distance'], ['length', 'Length'], ['angle', 'Angle'], ['radiusDiameter', 'Radius / Diameter'],
  ['symmetry', 'Symmetry'], ['midpoint', 'Midpoint'], ['fix', 'Fix'], ['coincidence', 'Coincidence'],
  ['concentricity', 'Concentricity'], ['tangency', 'Tangency'], ['parallelism', 'Parallelism'],
  ['perpendicular', 'Perpendicular'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'],
].map(([kind, label]) => ({ kind: kind as DrawingConstraintChoice, label }));

export type DrawingConstraintApplicability = Readonly<{
  kind: DrawingConstraintChoice; implemented: boolean; applicable: boolean; creatable: boolean; enabled: boolean;
  references: readonly DrawingSelectionRef[]; disabledReason?: string;
}>;

const existing = (sketch: DrawingSketchV2, kind: DrawingConstraintChoice, refs: readonly DrawingSelectionRef[]) => {
  const semanticKind = kind === 'parallelism' ? 'PARALLEL' : kind === 'coincidence' ? 'COINCIDENT' : kind.toUpperCase();
  const ids = refs.map((ref) => ref.kind === 'line' ? ref.lineId : ref.pointId).sort().join('\0');
  return Object.values(sketch.geometricConstraints ?? {}).some((constraint) => constraint.kind === semanticKind
    && constraint.references.map((ref) => 'entityId' in ref ? ref.entityId : ref.pointId).sort().join('\0') === ids);
};

/** The sole selection-to-constraint policy authority. */
export const getDrawingConstraintApplicability = (selection: readonly DrawingSelectionRef[], document: DrawingDocumentV2): readonly DrawingConstraintApplicability[] => {
  const sketch = document.sketches[document.activeSketchId];
  return DRAWING_CONSTRAINT_CATALOG.map(({ kind }) => {
    const implemented = ['coincidence', 'parallelism', 'perpendicular', 'horizontal', 'vertical'].includes(kind);
    const oneLine = selection.length === 1 && selection[0].kind === 'line';
    const twoLines = selection.length === 2 && selection.every((ref) => ref.kind === 'line') && selection[0].lineId !== selection[1].lineId;
    const twoPoints = selection.length === 2 && selection.every((ref) => ref.kind === 'point') && selection[0].pointId !== selection[1].pointId;
    const pointAndLine = selection.length === 2 && selection.some((ref) => ref.kind === 'point') && selection.some((ref) => ref.kind === 'line');
    const selectedLine = pointAndLine ? selection.find((ref): ref is Extract<DrawingSelectionRef, { kind: 'line' }> => ref.kind === 'line') : undefined;
    const line = selectedLine && sketch?.entities[selectedLine.lineId];
    const a = line && sketch?.points[line.startPointId], b = line && sketch?.points[line.endPointId];
    const validLinearSupport = Boolean(a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1e-9);
    const applicable = (kind === 'horizontal' || kind === 'vertical') ? oneLine
      : (kind === 'parallelism' || kind === 'perpendicular') ? twoLines : kind === 'coincidence' ? twoPoints || pointAndLine && validLinearSupport : false;
    const references = applicable ? [...selection].sort((a, b) => a.kind === b.kind
      ? (a.kind === 'line' ? a.lineId : a.pointId).localeCompare(b.kind === 'line' ? b.lineId : b.pointId)
      : a.kind === 'point' ? -1 : 1) : [];
    const creatable = Boolean(sketch && implemented && applicable && !existing(sketch, kind, references));
    return { kind, implemented, applicable, creatable, enabled: implemented && applicable && creatable, references,
      disabledReason: !implemented ? 'Not implemented yet' : !applicable ? 'Not applicable to this selection' : !creatable ? 'Already present' : undefined };
  });
};

/** Adds a validated first-class relation and asks the existing component solver to satisfy it. */
export const applyDrawingConstraint = (document: DrawingDocumentV2, applicability: DrawingConstraintApplicability): DrawingDocumentV2 => {
  if (!applicability.enabled) return document;
  const refs = applicability.references;
  if (applicability.kind === 'coincidence' && refs[0]?.kind === 'point' && refs[1]?.kind === 'point') {
    const withConstraint = addCoincidentConstraint(document, refs[0].pointId, refs[1].pointId);
    if (withConstraint === document) return document;
    const sketch = withConstraint.sketches[withConstraint.activeSketchId], point = sketch.points[refs[1].pointId];
    const solved = solveDrawingComponentDrag(sketch, { [point.id]: point }, { directPointIds: [point.id] });
    return solved ? { ...withConstraint, sketches: { ...withConstraint.sketches, [sketch.id]: solved } } : document;
  }
  if (applicability.kind === 'coincidence' && refs[0]?.kind === 'point' && refs[1]?.kind === 'line') {
    const withConstraint = addPointOnLinearSupportConstraint(document, refs[0].pointId, refs[1].lineId);
    if (withConstraint === document) return document;
    const sketch = withConstraint.sketches[withConstraint.activeSketchId], line = sketch.entities[refs[1].lineId];
    if (!line) return document;
    const targets = { [line.startPointId]: sketch.points[line.startPointId], [line.endPointId]: sketch.points[line.endPointId] };
    const solved = solveDrawingComponentDrag(sketch, targets, { directLineIds: [line.id] });
    return solved ? { ...withConstraint, sketches: { ...withConstraint.sketches, [sketch.id]: solved } } : document;
  }
  const sketch = document.sketches[document.activeSketchId];
  const lineIds = refs.flatMap((ref) => ref.kind === 'line' ? [ref.lineId] : []);
  if (!sketch || !lineIds.length) return document;
  const semanticKind = applicability.kind === 'parallelism' ? 'PARALLEL' : applicability.kind.toUpperCase() as DrawingGeometricConstraint['kind'];
  const id = `${applicability.kind}:${lineIds.join(':')}`;
  const constraint = { id, kind: semanticKind, references: lineIds.map((entityId) => ({ kind: 'entity' as const, entityId })) } as unknown as DrawingGeometricConstraint;
  const withConstraint = { ...sketch, geometricConstraints: { ...sketch.geometricConstraints, [id]: constraint }, geometricConstraintOrder: [...sketch.geometricConstraintOrder, id] };
  const line = withConstraint.entities[lineIds[lineIds.length - 1]];
  const point = line && withConstraint.points[line.endPointId];
  const solved = line && point ? solveDrawingComponentDrag(withConstraint, { [point.id]: point }, { directPointIds: [point.id] }) : null;
  if (!solved) return document;
  return { ...document, sketches: { ...document.sketches, [sketch.id]: solved } };
};

export const clampConstraintsPanelPosition = (position: Readonly<{ x: number; y: number }>, bounds: Readonly<{ width: number; height: number }>, panel: Readonly<{ width: number; height: number }> = { width: 300, height: 330 }) => ({
  x: Math.max(0, Math.min(position.x, Math.max(0, bounds.width - Math.min(80, panel.width)))),
  y: Math.max(0, Math.min(position.y, Math.max(0, bounds.height - Math.min(32, panel.height)))),
});

export const initialConstraintsPanelPosition = (
  bounds: Readonly<{ width: number; height: number }>,
  panel: Readonly<{ width: number; height: number }>,
  rightMargin = 32,
) => clampConstraintsPanelPosition({ x: bounds.width - panel.width - rightMargin, y: 58 }, bounds, panel);

export const constraintsPanelGrabOffset = (
  pointerClient: Readonly<{ x: number; y: number }>,
  panelRect: Readonly<{ left: number; top: number }>,
) => ({ x: pointerClient.x - panelRect.left, y: pointerClient.y - panelRect.top });

export const constraintsPanelDragPosition = (
  pointerClient: Readonly<{ x: number; y: number }>,
  frameRect: Readonly<{ left: number; top: number }>,
  grabOffset: Readonly<{ x: number; y: number }>,
) => ({
  x: pointerClient.x - frameRect.left - grabOffset.x,
  y: pointerClient.y - frameRect.top - grabOffset.y,
});
