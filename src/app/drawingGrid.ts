export const DRAWING_ORIGIN = Object.freeze({ x: 0, y: 0 });

export type DrawingGridSpacing = 1 | 10 | 100;
export type DrawingGridHierarchy = { primarySpacing: DrawingGridSpacing; majorSpacing: 10 | 100 | null };

/** Selects one of the three supported model-space grid intervals. */
export const getDrawingGridSpacing = (visibleWidthMm: number): DrawingGridSpacing => {
  if (visibleWidthMm <= 240) return 1;
  if (visibleWidthMm >= 1800) return 100;
  return 10;
};

/** Defines the decimal visual hierarchy for each supported primary grid. */
export const getDrawingGridHierarchy = (primarySpacing: DrawingGridSpacing): DrawingGridHierarchy => ({
  primarySpacing,
  majorSpacing: primarySpacing === 100 ? null : primarySpacing * 10 as 10 | 100,
});


/** Chooses a readable coordinate interval without changing the primary grid mode. */
export const getAxisLabelInterval = (
  gridSpacing: DrawingGridSpacing,
  pixelsPerMm: number,
  minimumPixelSpacing = 56,
): number => {
  const preferredMultipliers = [1, 2, 5, 10, 20, 50, 100];
  return gridSpacing * (preferredMultipliers.find((multiple) => gridSpacing * multiple * pixelsPerMm >= minimumPixelSpacing) ?? 100);
};

/** Selects which model-coordinate values are visible; it does not position them. */
export const getVisibleAxisValues = (
  minimum: number,
  maximum: number,
  interval: number,
): number[] => {
  if (!(maximum > minimum) || !(interval > 0)) return [];
  const first = Math.ceil(minimum / interval) * interval;
  const values: number[] = [];
  for (let value = first; value <= maximum + interval * 1e-9; value += interval) {
    const normalizedValue = Math.abs(value) < interval * 1e-9 ? 0 : value;
    values.push(normalizedValue);
  }
  return values;
};

export const zoomViewBoxAtPoint = <T extends { x: number; y: number; width: number; height: number }>(
  viewBox: T,
  factor: number,
  anchor: { x: number; y: number },
): T => {
  const width = Math.min(8000, Math.max(40, viewBox.width / factor));
  const height = Math.min(6000, Math.max(30, viewBox.height / factor));
  const xRatio = (anchor.x - viewBox.x) / viewBox.width;
  const yRatio = (anchor.y - viewBox.y) / viewBox.height;
  return { ...viewBox, x: anchor.x - width * xRatio, y: anchor.y - height * yRatio, width, height };
};
