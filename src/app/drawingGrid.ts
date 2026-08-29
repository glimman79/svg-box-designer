export const DRAWING_ORIGIN = Object.freeze({ x: 0, y: 0 });

export type DrawingGridSpacing = 1 | 10 | 100;

export type AxisLabel = { value: number; screenPosition: number };
export type DrawingGridHierarchy = { normalSpacing: DrawingGridSpacing; majorSpacing: 10 | 100 | null };

/** Selects one of the three supported model-space grid intervals. */
export const getDrawingGridSpacing = (visibleWidthMm: number): DrawingGridSpacing => {
  if (visibleWidthMm <= 240) return 1;
  if (visibleWidthMm >= 1800) return 100;
  return 10;
};

/** Decimal CAD hierarchy: primary lines plus one stronger decade where required. */
export const getDrawingGridHierarchy = (primarySpacing: DrawingGridSpacing): DrawingGridHierarchy => ({
  normalSpacing: primarySpacing,
  majorSpacing: primarySpacing === 1 ? 10 : primarySpacing === 10 ? 100 : null,
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

/** Generates only visible model-coordinate labels, mapped into screen space. */
export const getVisibleAxisLabels = (
  minimum: number,
  maximum: number,
  interval: number,
  screenExtent: number,
): AxisLabel[] => {
  if (!(maximum > minimum) || !(interval > 0) || !(screenExtent > 0)) return [];
  const first = Math.ceil(minimum / interval) * interval;
  const labels: AxisLabel[] = [];
  for (let value = first; value <= maximum + interval * 1e-9; value += interval) {
    const normalizedValue = Math.abs(value) < interval * 1e-9 ? 0 : value;
    labels.push({ value: normalizedValue, screenPosition: (value - minimum) / (maximum - minimum) * screenExtent });
  }
  return labels;
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
