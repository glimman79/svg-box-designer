import type { DrawingDocumentV1, DrawingLineEntity, DrawingPoint } from './drawingTypes';

export const LINE_ZERO_LENGTH_TOLERANCE_MM = 1e-9;

export type LineToolInteraction = Readonly<{
  start: DrawingPoint | null;
  pointer: DrawingPoint | null;
}>;

export const EMPTY_LINE_INTERACTION: LineToolInteraction = { start: null, pointer: null };

export const updateLinePreview = (interaction: LineToolInteraction, pointer: DrawingPoint): LineToolInteraction => (
  interaction.start ? { ...interaction, pointer } : interaction
);

export const cancelLineInteraction = (): LineToolInteraction => EMPTY_LINE_INTERACTION;

export type LineClickResult = Readonly<{
  interaction: LineToolInteraction;
  entity: DrawingLineEntity | null;
}>;

export const applyLineClick = (
  interaction: LineToolInteraction,
  point: DrawingPoint,
  createId: () => string,
): LineClickResult => {
  if (!interaction.start) return { interaction: { start: point, pointer: point }, entity: null };
  const dx = point.x - interaction.start.x;
  const dy = point.y - interaction.start.y;
  if (Math.hypot(dx, dy) <= LINE_ZERO_LENGTH_TOLERANCE_MM) {
    return { interaction: { ...interaction, pointer: point }, entity: null };
  }
  return {
    interaction: { start: point, pointer: point },
    entity: { id: createId(), type: 'line', start: interaction.start, end: point },
  };
};

/** Immutably appends an entity to the active sketch. Invalid active sketch ids are rejected. */
export const appendEntityToActiveSketch = (
  document: DrawingDocumentV1,
  entity: DrawingLineEntity,
): DrawingDocumentV1 => {
  const activeSketch = document.sketches[document.activeSketchId];
  if (!activeSketch || activeSketch.entities[entity.id]) return document;
  return {
    ...document,
    sketches: {
      ...document.sketches,
      [activeSketch.id]: {
        ...activeSketch,
        entities: { ...activeSketch.entities, [entity.id]: entity },
        entityOrder: [...activeSketch.entityOrder, entity.id],
      },
    },
  };
};
