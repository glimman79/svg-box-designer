export type Point = {
  x: number;
  y: number;
};

export type SourceBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type SvgEdge = {
  id: string;
  source: string;
  start: Point;
  end: Point;
  panelBounds?: SourceBounds;
};

export type EdgeSideRole = 'tab' | 'slot';

export type EdgeAssignment = {
  connectionId: string;
  slotRole?: EdgeSideRole;
};

export type EGeometryConnectionProperties = {
  materialThicknessMm: number;
  fingerWidthMm: number;
  playMm: number;
  kerfMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
};

export type EGeometryPatternInfo = {
  availableLengthMm: number;
  segmentCount: number;
  segmentWidthMm: number;
  middleSegmentWidthMm: number;
  firstLastSegmentWidthMm: number;
  tabCount: number;
  gapCount: number;
  endMarginMm: number;
  startDistanceMm: number;
  endDistanceMm: number;
  segmentDistancesMm: number[];
};

export type EGeometryConnectionDefinition = {
  prefix: 'E';
  properties: EGeometryConnectionProperties;
};

export const getEdgeAssignmentDisplayLabel = (assignment: EdgeAssignment | undefined) => {
  if (!assignment) {
    return undefined;
  }

  if (assignment.slotRole === 'tab') {
    return `${assignment.connectionId}-T`;
  }

  if (assignment.slotRole === 'slot') {
    return `${assignment.connectionId}-S`;
  }

  return assignment.connectionId;
};

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
  panelBounds?: SourceBounds,
) => {
  if (start.x === end.x && start.y === end.y) {
    return;
  }

  edges.push({
    id: `edge-${edges.length + 1}`,
    source,
    start,
    end,
    ...(panelBounds ? { panelBounds } : {}),
  });
};

const getBoundsForPoints = (points: Point[]): SourceBounds | undefined => {
  if (points.length === 0) {
    return undefined;
  }

  return points.reduce<SourceBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: points[0].x, maxX: points[0].x, minY: points[0].y, maxY: points[0].y });
};

type PendingPathEdge = { start: Point; end: Point };

const parsePathSegments = (pathData: string | null, source: string, edges: SvgEdge[]) => {
  if (!pathData) {
    return;
  }

  const tokens = pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  let pendingSubpathEdges: PendingPathEdge[] = [];

  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const readNumber = () => Number.parseFloat(tokens[index++]);
  const flushSubpathEdges = () => {
    if (pendingSubpathEdges.length === 0) {
      return;
    }

    const panelBounds = getBoundsForPoints(pendingSubpathEdges.flatMap((edge) => [edge.start, edge.end]));
    pendingSubpathEdges.forEach((edge) => addEdge(edges, source, edge.start, edge.end, panelBounds));
    pendingSubpathEdges = [];
  };
  const addPathEdge = (start: Point, end: Point) => {
    if (start.x === end.x && start.y === end.y) {
      return;
    }

    pendingSubpathEdges.push({ start, end });
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }

    const relative = command === command.toLowerCase();
    const upperCommand = command.toUpperCase();

    if (upperCommand === 'M') {
      flushSubpathEdges();
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
      flushSubpathEdges();
    } else {
      // Curves and arcs are intentionally ignored in v1; this app labels straight edges only.
      while (index < tokens.length && !isCommand(tokens[index])) {
        index += 1;
      }
    }
  }

  flushSubpathEdges();
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
    addEdge(
      edges,
      `line ${elementIndex + 1}`,
      start,
      end,
      getBoundsForPoints([start, end]),
    );
  });

  svgElement.querySelectorAll('polyline, polygon').forEach((shape, elementIndex) => {
    const points = parsePoints(shape.getAttribute('points'));
    const source = `${shape.tagName} ${elementIndex + 1}`;
    const panelBounds = getBoundsForPoints(points);
    points.slice(1).forEach((point, pointIndex) => {
      addEdge(edges, source, points[pointIndex], point, panelBounds);
    });

    if (shape.tagName.toLowerCase() === 'polygon' && points.length > 2) {
      addEdge(edges, source, points[points.length - 1], points[0], panelBounds);
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

    const panelBounds = getBoundsForPoints(corners);

    corners.forEach((corner, cornerIndex) => {
      addEdge(edges, `rect ${elementIndex + 1}`, corner, corners[(cornerIndex + 1) % corners.length], panelBounds);
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

export const midpoint = (edge: SvgEdge): Point => ({
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

type SourceGeometryContext = {
  bounds: SourceBounds;
};

type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

export type EGeometryPreviewDebugInfo = {
  edgeId: string;
  sourceId: string;
  label: string;
  role: string;
  start: Point;
  end: Point;
  detectedSide: EdgeSide | 'unknown';
  inwardDirection: string;
  panelMinY?: number;
  panelMaxY?: number;
  distanceToPanelMinY?: number;
  distanceToPanelMaxY?: number;
  edgeLengthMm: number;
  materialThicknessMm: number;
  fingerWidthMm: number;
  generatedPointCount: number;
  generatedPoints: Point[];
  warning?: string;
};

export type EGeometryPreviewResult = {
  paths: string[];
  debugInfo: EGeometryPreviewDebugInfo[];
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

const getEdgesBySourceGeometryContext = (edges: SvgEdge[]) => {
  const boundsBySource = getEdgesBySourceBounds(edges);

  return Object.entries(boundsBySource).reduce<Record<string, SourceGeometryContext>>((contexts, [source, bounds]) => {
    contexts[source] = { bounds };
    return contexts;
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
    if (assignment.slotRole) {
      labelElement.setAttribute('data-slot-role', assignment.slotRole);
    }

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

const svgNamespace = 'http://www.w3.org/2000/svg';

type EdgePathSegment = {
  edge: SvgEdge;
  d: string;
};

const formatNumber = (value: number) => Number(value.toFixed(4)).toString();

const pointAtDistance = (edge: SvgEdge, distance: number, length: number): Point => ({
  x: edge.start.x + ((edge.end.x - edge.start.x) * distance) / length,
  y: edge.start.y + ((edge.end.y - edge.start.y) * distance) / length,
});

const pointCommand = (command: 'M' | 'L', point: Point) => `${command} ${formatNumber(point.x)} ${formatNumber(point.y)}`;

const cloneGeometryAttributes = (from: Element, to: Element, blockedAttributes: string[]) => {
  const blocked = new Set(blockedAttributes);
  [...from.attributes].forEach((attribute) => {
    if (!blocked.has(attribute.name)) {
      to.setAttribute(attribute.name, attribute.value);
    }
  });
};

const isAssignedEEdge = (
  edge: SvgEdge,
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
) => {
  const assignment = edgeAssignments[edge.id];
  return Boolean(assignment && assignment.slotRole && connections[assignment.connectionId]?.prefix === 'E');
};

export const calculateEGeometryPatternInfo = (
  edgeLengthMm: number,
  properties: EGeometryConnectionProperties,
): EGeometryPatternInfo => {
  const length = Math.max(0, edgeLengthMm);
  const requestedSegmentWidth = Math.max(0, properties.fingerWidthMm);
  const segmentCount = requestedSegmentWidth > 0 && length > 0
    ? Math.max(1, Math.floor(length / requestedSegmentWidth))
    : 0;

  if (segmentCount === 0) {
    return {
      availableLengthMm: length,
      segmentCount: 0,
      segmentWidthMm: 0,
      middleSegmentWidthMm: 0,
      firstLastSegmentWidthMm: 0,
      tabCount: 0,
      gapCount: 0,
      endMarginMm: 0,
      startDistanceMm: 0,
      endDistanceMm: length,
      segmentDistancesMm: [0],
    };
  }

  const usedLength = segmentCount * requestedSegmentWidth;
  const extraLength = Math.max(0, length - usedLength);
  const firstLastSegmentWidth = segmentCount === 1
    ? length
    : requestedSegmentWidth + extraLength / 2;
  const segmentDistances = [0];
  let currentDistance = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const isFirstOrLast = index === 0 || index === segmentCount - 1;
    const segmentWidth = isFirstOrLast ? firstLastSegmentWidth : requestedSegmentWidth;
    currentDistance += segmentWidth;
    segmentDistances.push(Math.min(length, currentDistance));
  }

  segmentDistances[segmentDistances.length - 1] = length;

  return {
    availableLengthMm: length,
    segmentCount,
    segmentWidthMm: requestedSegmentWidth,
    middleSegmentWidthMm: segmentCount > 2 ? requestedSegmentWidth : 0,
    firstLastSegmentWidthMm: firstLastSegmentWidth,
    tabCount: Math.ceil(segmentCount / 2),
    gapCount: Math.floor(segmentCount / 2),
    endMarginMm: 0,
    startDistanceMm: 0,
    endDistanceMm: length,
    segmentDistancesMm: segmentDistances,
  };
};

const getEdgeSide = (edge: SvgEdge, bounds: SourceBounds | undefined): EdgeSide => {
  if (!bounds) {
    const dx = Math.abs(edge.end.x - edge.start.x);
    const dy = Math.abs(edge.end.y - edge.start.y);

    if (dx >= dy) {
      return edge.start.y <= edge.end.y ? 'top' : 'bottom';
    }

    return edge.start.x <= edge.end.x ? 'left' : 'right';
  }

  const center = midpoint(edge);
  const dx = Math.abs(edge.end.x - edge.start.x);
  const dy = Math.abs(edge.end.y - edge.start.y);
  const distanceToSide: Record<EdgeSide, number> = {
    top: Math.abs(center.y - bounds.minY),
    bottom: Math.abs(center.y - bounds.maxY),
    left: Math.abs(center.x - bounds.minX),
    right: Math.abs(center.x - bounds.maxX),
  };

  if (dx >= dy) {
    return distanceToSide.top <= distanceToSide.bottom ? 'top' : 'bottom';
  }

  return distanceToSide.left <= distanceToSide.right ? 'left' : 'right';
};

const getInwardDirection = (edge: SvgEdge, panelBounds: SourceBounds | undefined): Point => {
  const side = getEdgeSide(edge, panelBounds);

  if (side === 'top') {
    return { x: 0, y: 1 };
  }

  if (side === 'bottom') {
    return { x: 0, y: -1 };
  }

  if (side === 'left') {
    return { x: 1, y: 0 };
  }

  return { x: -1, y: 0 };
};

const getMaxInwardPocketDepth = (
  edge: SvgEdge,
  inwardDirection: Point,
  requestedDepth: number,
  bounds: SourceBounds | undefined,
) => {
  if (requestedDepth <= 0) {
    return 0;
  }

  if (!bounds) {
    return 0;
  }

  const inwardAxisSpan = Math.abs(inwardDirection.x) * (bounds.maxX - bounds.minX) + Math.abs(inwardDirection.y) * (bounds.maxY - bounds.minY);

  if (inwardAxisSpan <= 0.0001) {
    return 0;
  }

  const maxDepths = [edge.start, edge.end].flatMap((point) => {
    const axisLimits: number[] = [];

    if (inwardDirection.x > 0.0001) {
      axisLimits.push((bounds.maxX - point.x) / inwardDirection.x);
    } else if (inwardDirection.x < -0.0001) {
      axisLimits.push((bounds.minX - point.x) / inwardDirection.x);
    }

    if (inwardDirection.y > 0.0001) {
      axisLimits.push((bounds.maxY - point.y) / inwardDirection.y);
    } else if (inwardDirection.y < -0.0001) {
      axisLimits.push((bounds.minY - point.y) / inwardDirection.y);
    }

    return axisLimits.filter((value) => Number.isFinite(value) && value >= 0);
  });

  if (maxDepths.length === 0) {
    return Math.max(0, requestedDepth);
  }

  return Math.max(0, Math.min(requestedDepth, ...maxDepths));
};

const pointsAreEqual = (first: Point, second: Point) => (
  Math.abs(first.x - second.x) < 0.0001 && Math.abs(first.y - second.y) < 0.0001
);

const shouldCutEPreviewPatternSegment = (segmentIndex: number) => {
  const segmentNumber = segmentIndex + 1;
  return segmentNumber % 2 === 0;
};

const buildSteppedEPolyline = (
  edge: SvgEdge,
  settings: EGeometryConnectionProperties,
  inwardDirection: Point,
  pocketDepthMm: number,
): Point[] => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const patternInfo = calculateEGeometryPatternInfo(length, settings);

  if (
    length <= 0
    || patternInfo.segmentCount <= 0
    || patternInfo.segmentWidthMm <= 0
    || pocketDepthMm <= 0
  ) {
    return [edge.start, edge.end];
  }

  const points: Point[] = [edge.start];

  const addPointAt = (distance: number, offset = 0) => {
    const base = pointAtDistance(edge, distance, length);
    const nextPoint = {
      x: base.x + inwardDirection.x * Math.max(0, offset),
      y: base.y + inwardDirection.y * Math.max(0, offset),
    };

    if (!pointsAreEqual(nextPoint, points[points.length - 1])) {
      points.push(nextPoint);
    }
  };

  addPointAt(patternInfo.startDistanceMm);

  for (let intervalIndex = 0; intervalIndex < patternInfo.segmentCount; intervalIndex += 1) {
    const distance = patternInfo.segmentDistancesMm[intervalIndex];
    const nextDistance = patternInfo.segmentDistancesMm[intervalIndex + 1];

    if (shouldCutEPreviewPatternSegment(intervalIndex)) {
      addPointAt(distance);
      addPointAt(distance, pocketDepthMm);
      addPointAt(nextDistance, pocketDepthMm);
      addPointAt(nextDistance);
    } else {
      addPointAt(nextDistance);
    }
  }

  addPointAt(patternInfo.endDistanceMm);
  addPointAt(length);
  return points;
};

export const buildNotchedEdgePolyline = (
  edge: SvgEdge,
  settings: EGeometryConnectionProperties,
  panelBounds: SourceBounds | undefined,
): Point[] => {
  const inwardDirection = getInwardDirection(edge, panelBounds);
  const depth = getMaxInwardPocketDepth(edge, inwardDirection, settings.materialThicknessMm, panelBounds);
  return buildSteppedEPolyline(edge, settings, inwardDirection, depth);
};

const polylinePointsToCommands = (points: Point[]) => points.map((point, index) => (
  pointCommand(index === 0 ? 'M' : 'L', point)
));

const generateInwardPocketJointCommands = (
  edge: SvgEdge,
  connection: EGeometryConnectionDefinition,
  context: SourceGeometryContext | undefined,
) => polylinePointsToCommands(
  buildNotchedEdgePolyline(edge, connection.properties, context?.bounds),
);

const getEdgePathSegment = (
  edge: SvgEdge,
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  includeMove: boolean,
  context: SourceGeometryContext | undefined,
): EdgePathSegment => {
  const assignment = edgeAssignments[edge.id];
  const connection = assignment ? connections[assignment.connectionId] : undefined;
  const commands = assignment?.slotRole && connection
    ? generateInwardPocketJointCommands(edge, connection, context)
    : [pointCommand('M', edge.start), pointCommand('L', edge.end)];

  return {
    edge,
    d: (includeMove ? commands : commands.slice(1)).join(' '),
  };
};

const applyTechnicalLineStyle = (element: Element) => {
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', '#000000');
  element.setAttribute('stroke-width', '1');
  element.setAttribute('vector-effect', 'non-scaling-stroke');
};

const replaceElementWithPath = (element: Element, pathData: string, blockedAttributes: string[]) => {
  const path = element.ownerDocument.createElementNS(svgNamespace, 'path');
  cloneGeometryAttributes(element, path, blockedAttributes);
  path.setAttribute('d', pathData);
  applyTechnicalLineStyle(path);
  element.replaceWith(path);
};

const simplePathToEdges = (pathData: string | null, source: string) => {
  const edges: SvgEdge[] = [];
  parsePathSegments(pathData, source, edges);
  return edges;
};

const detectEPreviewSide = (edge: SvgEdge, panelBounds: SourceBounds | undefined): EdgeSide | undefined => {
  const dx = Math.abs(edge.end.x - edge.start.x);
  const dy = Math.abs(edge.end.y - edge.start.y);
  const epsilon = 0.0001;

  if (dx <= epsilon && dy <= epsilon) {
    return undefined;
  }

  if (dy <= epsilon) {
    if (!panelBounds) {
      return edge.start.y <= edge.end.y ? 'top' : 'bottom';
    }

    const centerY = (edge.start.y + edge.end.y) / 2;
    return Math.abs(centerY - panelBounds.minY) <= Math.abs(centerY - panelBounds.maxY) ? 'top' : 'bottom';
  }

  if (dx <= epsilon) {
    if (!panelBounds) {
      return edge.start.x <= edge.end.x ? 'left' : 'right';
    }

    const centerX = (edge.start.x + edge.end.x) / 2;
    return Math.abs(centerX - panelBounds.minX) <= Math.abs(centerX - panelBounds.maxX) ? 'left' : 'right';
  }

  return undefined;
};

const getEPreviewInwardDirection = (side: EdgeSide): Point => {
  if (side === 'top') {
    return { x: 0, y: 1 };
  }

  if (side === 'bottom') {
    return { x: 0, y: -1 };
  }

  if (side === 'left') {
    return { x: 1, y: 0 };
  }

  return { x: -1, y: 0 };
};

const buildEPreviewPolyline = (
  edge: SvgEdge,
  side: EdgeSide,
  settings: EGeometryConnectionProperties,
) => buildSteppedEPolyline(
  edge,
  settings,
  getEPreviewInwardDirection(side),
  settings.materialThicknessMm,
);

const formatDirection = (direction: Point) => `(${formatNumber(direction.x)}, ${formatNumber(direction.y)})`;

const getEPreviewLabel = (assignment: EdgeAssignment) => `${assignment.connectionId}-${assignment.slotRole === 'tab' ? 'T' : 'S'}`;

const generateEPreviewForEdge = (
  edge: SvgEdge,
  assignment: EdgeAssignment,
  connection: EGeometryConnectionDefinition,
  panelBounds: SourceBounds | undefined,
): { paths: string[]; debugInfo: EGeometryPreviewDebugInfo } => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const properties = connection.properties;
  const side = detectEPreviewSide(edge, panelBounds);
  const label = getEPreviewLabel(assignment);
  const role = assignment.slotRole === 'tab' ? 'E-T' : 'E-S';
  const centerY = (edge.start.y + edge.end.y) / 2;
  const baseDebugInfo: Omit<EGeometryPreviewDebugInfo, 'generatedPointCount' | 'generatedPoints' | 'warning'> = {
    edgeId: edge.id,
    sourceId: edge.source,
    label,
    role,
    start: edge.start,
    end: edge.end,
    detectedSide: side ?? 'unknown',
    inwardDirection: side ? formatDirection(getEPreviewInwardDirection(side)) : 'unknown',
    ...(panelBounds ? {
      panelMinY: panelBounds.minY,
      panelMaxY: panelBounds.maxY,
      distanceToPanelMinY: Math.abs(centerY - panelBounds.minY),
      distanceToPanelMaxY: Math.abs(centerY - panelBounds.maxY),
    } : {}),
    edgeLengthMm: length,
    materialThicknessMm: properties.materialThicknessMm,
    fingerWidthMm: properties.fingerWidthMm,
  };

  if (!side) {
    return {
      paths: [],
      debugInfo: {
        ...baseDebugInfo,
        generatedPointCount: 0,
        generatedPoints: [],
        warning: 'Could not detect a top, bottom, left, or right side for this edge; skipped preview notches for this edge.',
      },
    };
  }

  const patternInfo = calculateEGeometryPatternInfo(length, properties);

  if (length <= 0 || properties.materialThicknessMm <= 0 || properties.fingerWidthMm <= 0 || patternInfo.segmentCount <= 0) {
    return {
      paths: [],
      debugInfo: {
        ...baseDebugInfo,
        generatedPointCount: 0,
        generatedPoints: [],
        warning: 'Edge length, material thickness, or finger width is too small to generate preview notches.',
      },
    };
  }

  const hasCutSegments = patternInfo.segmentDistancesMm.slice(0, patternInfo.segmentCount)
    .some((_, intervalIndex) => shouldCutEPreviewPatternSegment(intervalIndex));
  const polyline = buildEPreviewPolyline(edge, side, properties);
  const path = polylinePointsToCommands(polyline).join(' ');

  return {
    paths: [path],
    debugInfo: {
      ...baseDebugInfo,
      generatedPointCount: polyline.length,
      generatedPoints: polyline,
      ...(polyline.length <= 2 && hasCutSegments
        ? { warning: 'Preview stayed on the original edge because no inward pocket depth was available.' }
        : {}),
    },
  };
};

export const generateEGeometryPreview = (
  edgeAssignments: Record<string, EdgeAssignment>,
  edges: SvgEdge[],
  connections: Record<string, EGeometryConnectionDefinition>,
): EGeometryPreviewResult => {
  const preview = edges
    .filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections))
    .map((edge) => {
      const assignment = edgeAssignments[edge.id];
      const connection = connections[assignment.connectionId];
      return generateEPreviewForEdge(edge, assignment, connection, edge.panelBounds);
    });

  if (preview.length === 0) {
    throw new Error('Assign at least one E-T or E-S edge before previewing E geometry.');
  }

  return {
    paths: preview.flatMap((entry) => entry.paths),
    debugInfo: preview.map((entry) => entry.debugInfo),
  };
};

export const generateEGeometryPreviewPaths = (
  edgeAssignments: Record<string, EdgeAssignment>,
  edges: SvgEdge[],
  connections: Record<string, EGeometryConnectionDefinition>,
) => generateEGeometryPreview(edgeAssignments, edges, connections).paths;

export const generateEGeometrySvg = (
  svgContent: string,
  edgeAssignments: Record<string, EdgeAssignment>,
  edges: SvgEdge[],
  connections: Record<string, EGeometryConnectionDefinition>,
) => {
  const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgElement = document.querySelector('svg');

  if (!svgElement) {
    throw new Error('Cannot generate E geometry because no SVG is loaded.');
  }

  const lineElements = [...svgElement.querySelectorAll('line')];
  const polyElements = [...svgElement.querySelectorAll('polyline, polygon')];
  const rectElements = [...svgElement.querySelectorAll('rect')];
  const pathElements = [...svgElement.querySelectorAll('path')];
  const geometryContextsBySource = getEdgesBySourceGeometryContext(edges);
  let edgeIndex = 0;
  let generatedCount = 0;

  lineElements.forEach((line) => {
    const edge = edges[edgeIndex++];
    if (!edge || !isAssignedEEdge(edge, edgeAssignments, connections)) {
      return;
    }

    replaceElementWithPath(
      line,
      getEdgePathSegment(edge, edgeAssignments, connections, true, geometryContextsBySource[edge.source]).d,
      ['x1', 'y1', 'x2', 'y2'],
    );
    generatedCount += 1;
  });

  polyElements.forEach((shape) => {
    const points = parsePoints(shape.getAttribute('points'));
    const segmentCount = Math.max(0, points.length - 1) + (shape.tagName.toLowerCase() === 'polygon' && points.length > 2 ? 1 : 0);
    const shapeEdges = edges.slice(edgeIndex, edgeIndex + segmentCount);
    edgeIndex += segmentCount;

    if (!shapeEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = shapeEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, geometryContextsBySource[edge.source]).d);
    const closeCommand = shape.tagName.toLowerCase() === 'polygon' ? ' Z' : '';
    replaceElementWithPath(shape, `${segments.join(' ')}${closeCommand}`, ['points']);
    generatedCount += shapeEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  rectElements.forEach((rect) => {
    const rectEdges = edges.slice(edgeIndex, edgeIndex + 4);
    edgeIndex += 4;

    if (!rectEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = rectEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, geometryContextsBySource[edge.source]).d);
    replaceElementWithPath(rect, `${segments.join(' ')} Z`, ['x', 'y', 'width', 'height', 'rx', 'ry']);
    generatedCount += rectEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  pathElements.forEach((path, pathIndex) => {
    const pathEdges = simplePathToEdges(path.getAttribute('d'), `path ${pathIndex + 1}`);
    const sourceEdges = edges.slice(edgeIndex, edgeIndex + pathEdges.length);
    edgeIndex += pathEdges.length;

    if (pathEdges.length === 0 || !sourceEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = sourceEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, geometryContextsBySource[edge.source]).d);
    path.setAttribute('d', segments.join(' '));
    applyTechnicalLineStyle(path);
    generatedCount += sourceEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  if (generatedCount === 0) {
    throw new Error('Assign at least one E-T or E-S edge before generating E geometry.');
  }

  return new XMLSerializer().serializeToString(svgElement);
};
