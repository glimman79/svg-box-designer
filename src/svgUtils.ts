export type Point = {
  x: number;
  y: number;
};

type SourceBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type SvgEdge = {
  id: string;
  source: string;
  start: Point;
  end: Point;
};

export type EdgeAssignment = {
  connectionId: string;
};

export const getEdgeAssignmentDisplayLabel = (assignment: EdgeAssignment | undefined) => assignment?.connectionId;

export type SvgDocumentModel = {
  content: string;
  innerMarkup: string;
  viewBox: string;
  width: number;
  height: number;
  edges: SvgEdge[];
};

export type EdgeLabelPlacement = {
  edgeId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type EdgeLabelPlacementOptions = {
  fontSizePx: number;
  paddingXPx: number;
  paddingYPx: number;
  edgeOffsetPx: number;
  labelScale?: number;
};

const defaultCanvas = {
  viewBox: '0 0 800 600',
  width: 800,
  height: 600,
};

const exportedLabelFontSize = 18;
const exportedLabelPaddingX = 7;
const exportedLabelPaddingY = 4;
const exportedLabelEdgeOffset = 10;

const svgNumber = (value: string | null, fallback = 0) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePoints = (points: string | null): Point[] => {
  if (!points) {
    return [];
  }

  const values = points
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const parsedPoints: Point[] = [];
  for (let index = 0; index < values.length - 1; index += 2) {
    parsedPoints.push({ x: values[index], y: values[index + 1] });
  }

  return parsedPoints;
};

const addEdge = (
  edges: SvgEdge[],
  source: string,
  start: Point,
  end: Point,
) => {
  if (start.x === end.x && start.y === end.y) {
    return;
  }

  edges.push({
    id: `edge-${edges.length + 1}`,
    source,
    start,
    end,
  });
};

const parsePathSegments = (pathData: string | null, source: string, edges: SvgEdge[]) => {
  if (!pathData) {
    return;
  }

  const tokens = pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const readNumber = () => Number.parseFloat(tokens[index++]);
  const addPathEdge = (start: Point, end: Point) => {
    addEdge(edges, source, start, end);
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }

    const relative = command === command.toLowerCase();
    const upperCommand = command.toUpperCase();

    if (upperCommand === 'M') {
      const x = readNumber();
      const y = readNumber();
      current = {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      };
      subpathStart = current;
      command = relative ? 'l' : 'L';
    } else if (upperCommand === 'L') {
      const x = readNumber();
      const y = readNumber();
      const next = {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      };
      addPathEdge(current, next);
      current = next;
    } else if (upperCommand === 'H') {
      const x = readNumber();
      const next = { x: relative ? current.x + x : x, y: current.y };
      addPathEdge(current, next);
      current = next;
    } else if (upperCommand === 'V') {
      const y = readNumber();
      const next = { x: current.x, y: relative ? current.y + y : y };
      addPathEdge(current, next);
      current = next;
    } else if (upperCommand === 'Z') {
      addPathEdge(current, subpathStart);
      current = subpathStart;
    } else {
      // Curves and arcs are intentionally ignored in v1; this app labels straight edges only.
      while (index < tokens.length && !isCommand(tokens[index])) {
        index += 1;
      }
    }
  }

};

const sanitizeSvg = (svgElement: SVGSVGElement) => {
  const blockedTags = svgElement.querySelectorAll('script, foreignObject, iframe, object, embed');
  blockedTags.forEach((element) => element.remove());

  svgElement.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    });
  });
};

const getCanvasMetrics = (svgElement: SVGSVGElement) => {
  const viewBox = svgElement.getAttribute('viewBox');
  const width = svgNumber(svgElement.getAttribute('width'), defaultCanvas.width);
  const height = svgNumber(svgElement.getAttribute('height'), defaultCanvas.height);

  if (viewBox) {
    const [, , viewBoxWidth, viewBoxHeight] = viewBox.split(/[\s,]+/).map(Number);
    return {
      viewBox,
      width: Number.isFinite(viewBoxWidth) ? viewBoxWidth : width,
      height: Number.isFinite(viewBoxHeight) ? viewBoxHeight : height,
    };
  }

  return {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  };
};

export const parseSvgDocument = (svgText: string): SvgDocumentModel => {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parserError = document.querySelector('parsererror');
  const svgElement = document.querySelector('svg');

  if (parserError || !svgElement) {
    throw new Error('The selected file is not a valid SVG document.');
  }

  sanitizeSvg(svgElement);
  const edges: SvgEdge[] = [];

  svgElement.querySelectorAll('line').forEach((line, elementIndex) => {
    const start = { x: svgNumber(line.getAttribute('x1')), y: svgNumber(line.getAttribute('y1')) };
    const end = { x: svgNumber(line.getAttribute('x2')), y: svgNumber(line.getAttribute('y2')) };
    addEdge(edges, `line ${elementIndex + 1}`, start, end);
  });

  svgElement.querySelectorAll('polyline, polygon').forEach((shape, elementIndex) => {
    const points = parsePoints(shape.getAttribute('points'));
    const source = `${shape.tagName} ${elementIndex + 1}`;
    points.slice(1).forEach((point, pointIndex) => {
      addEdge(edges, source, points[pointIndex], point);
    });

    if (shape.tagName.toLowerCase() === 'polygon' && points.length > 2) {
      addEdge(edges, source, points[points.length - 1], points[0]);
    }
  });

  svgElement.querySelectorAll('rect').forEach((rect, elementIndex) => {
    const x = svgNumber(rect.getAttribute('x'));
    const y = svgNumber(rect.getAttribute('y'));
    const width = svgNumber(rect.getAttribute('width'));
    const height = svgNumber(rect.getAttribute('height'));
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];

    corners.forEach((corner, cornerIndex) => {
      addEdge(edges, `rect ${elementIndex + 1}`, corner, corners[(cornerIndex + 1) % corners.length]);
    });
  });

  svgElement.querySelectorAll('path').forEach((path, elementIndex) => {
    parsePathSegments(path.getAttribute('d'), `path ${elementIndex + 1}`, edges);
  });

  return {
    content: new XMLSerializer().serializeToString(svgElement),
    innerMarkup: svgElement.innerHTML,
    ...getCanvasMetrics(svgElement),
    edges,
  };
};

const midpoint = (edge: SvgEdge): Point => ({
  x: (edge.start.x + edge.end.x) / 2,
  y: (edge.start.y + edge.end.y) / 2,
});

const getEdgeNormal = (edge: SvgEdge): Point => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);

  if (length === 0) {
    return { x: 0, y: -1 };
  }

  return {
    x: -(edge.end.y - edge.start.y) / length,
    y: (edge.end.x - edge.start.x) / length,
  };
};

const getEdgesBySourceBounds = (edges: SvgEdge[]) => {
  return edges.reduce<Record<string, SourceBounds>>((boundsBySource, edge) => {
    const existing = boundsBySource[edge.source];
    const minX = Math.min(edge.start.x, edge.end.x);
    const maxX = Math.max(edge.start.x, edge.end.x);
    const minY = Math.min(edge.start.y, edge.end.y);
    const maxY = Math.max(edge.start.y, edge.end.y);

    boundsBySource[edge.source] = existing
      ? {
        minX: Math.min(existing.minX, minX),
        maxX: Math.max(existing.maxX, maxX),
        minY: Math.min(existing.minY, minY),
        maxY: Math.max(existing.maxY, maxY),
      }
      : { minX, maxX, minY, maxY };

    return boundsBySource;
  }, {});
};

const getInwardLabelDirection = (
  edge: SvgEdge,
  bounds: SourceBounds | undefined,
): Point => {
  const center = midpoint(edge);
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const fallbackNormal = getEdgeNormal(edge);
  const epsilon = 0.0001;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (!bounds || Math.abs(bounds.maxY - bounds.minY) <= epsilon) {
      return Math.abs(fallbackNormal.y) > epsilon ? { x: 0, y: Math.sign(fallbackNormal.y) } : { x: 0, y: 1 };
    }

    const sourceCenterY = (bounds.minY + bounds.maxY) / 2;
    return { x: 0, y: center.y <= sourceCenterY ? 1 : -1 };
  }

  if (!bounds || Math.abs(bounds.maxX - bounds.minX) <= epsilon) {
    return Math.abs(fallbackNormal.x) > epsilon ? { x: Math.sign(fallbackNormal.x), y: 0 } : { x: 1, y: 0 };
  }

  const sourceCenterX = (bounds.minX + bounds.maxX) / 2;
  return { x: center.x <= sourceCenterX ? 1 : -1, y: 0 };
};

const labelBoxesOverlap = (
  box: { x: number; y: number; width: number; height: number },
  otherBox: { x: number; y: number; width: number; height: number },
) => (
  Math.abs(box.x - otherBox.x) < (box.width + otherBox.width) / 2 + 2
  && Math.abs(box.y - otherBox.y) < (box.height + otherBox.height) / 2 + 2
);

export const getEdgeLabelPlacements = (
  edges: SvgEdge[],
  edgeAssignments: Record<string, EdgeAssignment>,
  options: EdgeLabelPlacementOptions,
): EdgeLabelPlacement[] => {
  const labelScale = options.labelScale ?? 1;
  const boundsBySource = getEdgesBySourceBounds(edges);
  const placedBoxes: { x: number; y: number; width: number; height: number }[] = [];

  return edges.flatMap((edge) => {
    const assignment = edgeAssignments[edge.id];
    const label = getEdgeAssignmentDisplayLabel(assignment);

    if (!label) {
      return [];
    }

    const width = label.length * options.fontSizePx * 0.68 + options.paddingXPx * 2;
    const height = options.fontSizePx + options.paddingYPx * 2;
    const renderedWidth = width * labelScale;
    const renderedHeight = height * labelScale;
    const direction = getInwardLabelDirection(edge, boundsBySource[edge.source]);
    const halfSizeAlongDirection = Math.abs(direction.x) > 0 ? renderedWidth / 2 : renderedHeight / 2;
    const baseDistance = options.edgeOffsetPx + halfSizeAlongDirection;
    const center = midpoint(edge);
    const stackStep = (Math.abs(direction.x) > 0 ? renderedWidth : renderedHeight) + 4 * labelScale;
    let x = center.x + direction.x * baseDistance;
    let y = center.y + direction.y * baseDistance;
    let renderedBox = { x, y, width: renderedWidth, height: renderedHeight };
    let stackIndex = 0;

    while (placedBoxes.some((box) => labelBoxesOverlap(renderedBox, box)) && stackIndex < 12) {
      stackIndex += 1;
      x = center.x + direction.x * (baseDistance + stackStep * stackIndex);
      y = center.y + direction.y * (baseDistance + stackStep * stackIndex);
      renderedBox = { x, y, width: renderedWidth, height: renderedHeight };
    }

    placedBoxes.push(renderedBox);

    return [{ edgeId: edge.id, label, x, y, width, height }];
  });
};

export const exportLabeledSvg = (svgContent: string, edgeAssignments: Record<string, EdgeAssignment>, edges: SvgEdge[]) => {
  const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgElement = document.querySelector('svg');

  if (!svgElement) {
    throw new Error('Cannot export because no SVG is loaded.');
  }

  svgElement.querySelector('#svg-box-designer-labels')?.remove();

  const labelPlacementsByEdgeId = new Map(getEdgeLabelPlacements(edges, edgeAssignments, {
    fontSizePx: exportedLabelFontSize,
    paddingXPx: exportedLabelPaddingX,
    paddingYPx: exportedLabelPaddingY,
    edgeOffsetPx: exportedLabelEdgeOffset,
  }).map((placement) => [placement.edgeId, placement]));

  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelGroup.setAttribute('id', 'svg-box-designer-labels');
  labelGroup.setAttribute('font-family', 'Inter, Arial, sans-serif');
  labelGroup.setAttribute('font-size', String(exportedLabelFontSize));
  labelGroup.setAttribute('font-weight', '900');
  labelGroup.setAttribute('fill', '#0f172a');

  edges.forEach((edge) => {
    const assignment = edgeAssignments[edge.id];
    if (!assignment) {
      return;
    }

    const placement = labelPlacementsByEdgeId.get(edge.id);

    if (!placement) {
      return;
    }

    const labelElement = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    labelElement.setAttribute('transform', `translate(${placement.x} ${placement.y})`);
    labelElement.setAttribute('data-edge-id', edge.id);
    labelElement.setAttribute('data-connection-id', assignment.connectionId);
    background.setAttribute('x', String(-placement.width / 2));
    background.setAttribute('y', String(-placement.height / 2));
    background.setAttribute('width', String(placement.width));
    background.setAttribute('height', String(placement.height));
    background.setAttribute('rx', '5');
    background.setAttribute('fill', '#ffffff');
    background.setAttribute('stroke', '#cbd5e1');
    background.setAttribute('stroke-width', '1');
    background.setAttribute('opacity', '0.96');

    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = placement.label;
    labelElement.append(background, text);
    labelGroup.append(labelElement);
  });

  svgElement.append(labelGroup);
  return new XMLSerializer().serializeToString(svgElement);
};
