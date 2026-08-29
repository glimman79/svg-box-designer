export type CoordinatePoint = Readonly<{ x: number; y: number }>;

/** The browser-compatible 2D portion of DOMMatrix/SVGMatrix. */
export type AffineTransform = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;

const transformPoint = (point: CoordinatePoint, transform: AffineTransform): CoordinatePoint => ({
  x: transform.a * point.x + transform.c * point.y + transform.e,
  y: transform.b * point.x + transform.d * point.y + transform.f,
});

const invertTransform = (transform: AffineTransform): AffineTransform | null => {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) return null;
  return {
    a: transform.d / determinant,
    b: -transform.b / determinant,
    c: -transform.c / determinant,
    d: transform.a / determinant,
    e: (transform.c * transform.f - transform.d * transform.e) / determinant,
    f: (transform.b * transform.e - transform.a * transform.f) / determinant,
  };
};

/**
 * Converts a MODEL COORDINATE through the Drawing SVG's real CLIENT transform,
 * then from CLIENT coordinates through the overlay SVG's inverse transform.
 */
export const modelToOverlayPoint = (
  modelPoint: CoordinatePoint,
  drawingToClientTransform: AffineTransform,
  overlayToClientTransform: AffineTransform,
): CoordinatePoint | null => {
  const clientToOverlayTransform = invertTransform(overlayToClientTransform);
  if (!clientToOverlayTransform) return null;
  const clientPoint = transformPoint(modelPoint, drawingToClientTransform);
  return transformPoint(clientPoint, clientToOverlayTransform);
};
