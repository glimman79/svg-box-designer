import type { Point, SvgEdge, SvgPanel } from '../svgUtils';

export type LabelMeasurement = { width: number; height: number };

export type PanelLabelRequest = {
  edge: SvgEdge;
  label: string;
};

export type PanelLabelPlacement = LabelMeasurement & {
  edgeId: string;
  label: string;
  panelId: string | null;
  x: number;
  y: number;
  leaderTo: Point;
  diagnostic?: string;
};

export type PanelLabelLayoutOptions = {
  labelScale: number;
  edgeOffset: number;
  measureLabel: (label: string) => LabelMeasurement;
};

type Box = { x: number; y: number; width: number; height: number; panelId: string | null };

const epsilon = 1e-7;
const midpoint = (edge: SvgEdge): Point => ({ x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 });

export const isPointInContour = (point: Point, contour: Point[]): boolean => {
  let inside = false;
  for (let index = 0, previous = contour.length - 1; index < contour.length; previous = index, index += 1) {
    const first = contour[index];
    const second = contour[previous];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

export const isPointInPanel = (point: Point, panel: SvgPanel): boolean => (
  isPointInContour(point, panel.outerContour)
  && !panel.innerContours.some((contour) => isPointInContour(point, contour))
);

const boxCorners = (box: Box): Point[] => [
  { x: box.x - box.width / 2, y: box.y - box.height / 2 },
  { x: box.x + box.width / 2, y: box.y - box.height / 2 },
  { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  { x: box.x - box.width / 2, y: box.y + box.height / 2 },
];

export const isLabelBoxInsidePanel = (box: Omit<Box, 'panelId'>, panel: SvgPanel): boolean => (
  boxCorners({ ...box, panelId: panel.id }).every((corner) => isPointInPanel(corner, panel))
  && [panel.outerContour, ...panel.innerContours].every((contour) => {
    const corners = boxCorners({ ...box, panelId: panel.id });
    const cross = (first: Point, second: Point, third: Point) => (
      (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x)
    );
    const intersects = (a: Point, b: Point, c: Point, d: Point) => (
      cross(a, b, c) * cross(a, b, d) <= epsilon && cross(c, d, a) * cross(c, d, b) <= epsilon
      && Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + epsilon
      && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + epsilon
    );
    return corners.every((corner, index) => contour.every((point, contourIndex) => (
      !intersects(corner, corners[(index + 1) % corners.length], point, contour[(contourIndex + 1) % contour.length])
    )));
  })
);

const boxesOverlap = (first: Box, second: Box) => first.panelId === second.panelId
  && Math.abs(first.x - second.x) < (first.width + second.width) / 2 + epsilon
  && Math.abs(first.y - second.y) < (first.height + second.height) / 2 + epsilon;

const findOwningPanel = (edge: SvgEdge, panels: SvgPanel[]) => panels.find((panel) => (
  panel.outerEdgeIds.includes(edge.id) || panel.innerEdgeIds.some((edgeIds) => edgeIds.includes(edge.id))
));

export const getOwningPanelInwardNormal = (edge: SvgEdge, panel: SvgPanel): Point => {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const candidates = [{ x: -dy / length, y: dx / length }, { x: dy / length, y: -dx / length }];
  const center = midpoint(edge);
  const edgeLength = Math.hypot(dx, dy);
  const testDistances = [Math.max(edgeLength * 0.002, 0.01), Math.max(edgeLength * 0.02, 0.1), Math.max(edgeLength * 0.1, 0.5)];

  for (const distance of testDistances) {
    const inside = candidates.filter((normal) => isPointInPanel({ x: center.x + normal.x * distance, y: center.y + normal.y * distance }, panel));
    if (inside.length === 1) return inside[0];
  }

  // Degenerate/concave midpoint fallback remains deterministic and panel-authoritative.
  return candidates.sort((first, second) => {
    const firstPoint = { x: center.x + first.x * edgeLength * 0.25, y: center.y + first.y * edgeLength * 0.25 };
    const secondPoint = { x: center.x + second.x * edgeLength * 0.25, y: center.y + second.y * edgeLength * 0.25 };
    return Number(isPointInPanel(secondPoint, panel)) - Number(isPointInPanel(firstPoint, panel));
  })[0];
};

export const layoutPanelLabels = (
  requests: PanelLabelRequest[],
  panels: SvgPanel[],
  options: PanelLabelLayoutOptions,
): PanelLabelPlacement[] => {
  const placed: Box[] = [];

  return requests.map(({ edge, label }) => {
    const panel = findOwningPanel(edge, panels);
    const measured = options.measureLabel(label);
    const renderedWidth = measured.width * options.labelScale;
    const renderedHeight = measured.height * options.labelScale;
    const center = midpoint(edge);

    if (!panel) {
      return { edgeId: edge.id, label, panelId: null, x: center.x, y: center.y, ...measured, leaderTo: center, diagnostic: `No owning panel found for ${label}.` };
    }

    const normal = getOwningPanelInwardNormal(edge, panel);
    const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y) || 1;
    const tangent = { x: (edge.end.x - edge.start.x) / edgeLength, y: (edge.end.y - edge.start.y) / edgeLength };
    const normalHalfExtent = Math.abs(normal.x) * renderedWidth / 2 + Math.abs(normal.y) * renderedHeight / 2;
    const baseDistance = options.edgeOffset + normalHalfExtent;
    const inwardStep = Math.max(2 * options.labelScale, Math.min(renderedWidth, renderedHeight) / 2);
    const alongStep = Math.max(3 * options.labelScale, renderedWidth / 3);
    const alongIndexes = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    const candidates: Box[] = [];

    // Prefer progressively deeper positions, then resolve stubborn collisions along the edge.
    for (let inwardIndex = 0; inwardIndex < 10; inwardIndex += 1) {
      for (const alongIndex of (inwardIndex < 5 ? [0] : alongIndexes)) {
        candidates.push({
          x: center.x + normal.x * (baseDistance + inwardIndex * inwardStep) + tangent.x * alongIndex * alongStep,
          y: center.y + normal.y * (baseDistance + inwardIndex * inwardStep) + tangent.y * alongIndex * alongStep,
          width: renderedWidth,
          height: renderedHeight,
          panelId: panel.id,
        });
      }
    }

    const valid = candidates.find((candidate) => isLabelBoxInsidePanel(candidate, panel) && !placed.some((box) => boxesOverlap(candidate, box)));
    const fallback = valid ?? candidates.find((candidate) => isPointInPanel({ x: candidate.x, y: candidate.y }, panel) && !placed.some((box) => boxesOverlap(candidate, box)))
      ?? { x: (panel.bounds.minX + panel.bounds.maxX) / 2, y: (panel.bounds.minY + panel.bounds.maxY) / 2, width: renderedWidth, height: renderedHeight, panelId: panel.id };
    placed.push(fallback);

    return {
      edgeId: edge.id,
      label,
      panelId: panel.id,
      x: fallback.x,
      y: fallback.y,
      ...measured,
      leaderTo: center,
      diagnostic: valid ? undefined : `Panel ${panel.id} is too narrow to contain the complete ${label} label near edge ${edge.id}.`,
    };
  });
};
