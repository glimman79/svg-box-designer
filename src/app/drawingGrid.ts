export const DRAWING_ORIGIN = Object.freeze({ x: 0, y: 0 });

export type DrawingGridSpacing = 1 | 10 | 100;

/** Selects one of the three supported model-space grid intervals. */
export const getDrawingGridSpacing = (visibleWidthMm: number): DrawingGridSpacing => {
  if (visibleWidthMm <= 240) return 1;
  if (visibleWidthMm >= 1800) return 100;
  return 10;
};
