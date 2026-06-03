export type Point = {
  x: number;
  y: number;
};

export type SvgEdge = {
  id: string;
  source: string;
  start: Point;
  end: Point;
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
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'H') {
      const x = readNumber();
      const next = { x: relative ? current.x + x : x, y: current.y };
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'V') {
      const y = readNumber();
      const next = { x: current.x, y: relative ? current.y + y : y };
      addEdge(edges, source, current, next);
      current = next;
    } else if (upperCommand === 'Z') {
      addEdge(edges, source, current, subpathStart);
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
    addEdge(
      edges,
      `line ${elementIndex + 1}`,
      { x: svgNumber(line.getAttribute('x1')), y: svgNumber(line.getAttribute('y1')) },
      { x: svgNumber(line.getAttribute('x2')), y: svgNumber(line.getAttribute('y2')) },
    );
  });

  svgElement.querySelectorAll('polyline, polygon').forEach((shape, elementIndex) => {
    const points = parsePoints(shape.getAttribute('points'));
    points.slice(1).forEach((point, pointIndex) => {
      addEdge(edges, `${shape.tagName} ${elementIndex + 1}`, points[pointIndex], point);
    });

    if (shape.tagName.toLowerCase() === 'polygon' && points.length > 2) {
      addEdge(edges, `${shape.tagName} ${elementIndex + 1}`, points[points.length - 1], points[0]);
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

const getEdgesBySourceBounds = (edges: SvgEdge[]) => {
  return edges.reduce<Record<string, { minX: number; maxX: number; minY: number; maxY: number }>>((boundsBySource, edge) => {
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | undefined,
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

export type EGeometryGenerationResult = {
  svgContent: string;
  warnings: string[];
};

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

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
  const defaultEndMargin = Math.max(0, properties.materialThicknessMm);
  const requestedStartOffset = properties.startOffsetMm > 0 ? properties.startOffsetMm : defaultEndMargin;
  const requestedEndOffset = properties.endOffsetMm > 0 ? properties.endOffsetMm : defaultEndMargin;
  const startOffset = Math.max(0, Math.min(requestedStartOffset, length));
  const endOffset = Math.max(0, Math.min(requestedEndOffset, Math.max(0, length - startOffset)));
  const availableLength = Math.max(0, length - startOffset - endOffset);
  const maxFullSegments = requestedSegmentWidth > 0 ? Math.floor(availableLength / requestedSegmentWidth) : 0;
  const segmentCount = maxFullSegments >= 3
    ? maxFullSegments - (maxFullSegments % 2 === 0 ? 1 : 0)
    : 0;
  const segmentWidth = segmentCount > 0 ? requestedSegmentWidth : 0;
  const patternLength = segmentCount * segmentWidth;
  const extraMargin = Math.max(0, availableLength - patternLength) / 2;
  const startDistance = startOffset + extraMargin;
  const endDistance = length - endOffset - extraMargin;
  const segmentDistances = [startDistance];

  for (let index = 0; index < segmentCount; index += 1) {
    segmentDistances.push(startDistance + segmentWidth * (index + 1));
  }

  return {
    availableLengthMm: availableLength,
    segmentCount,
    segmentWidthMm: segmentWidth,
    middleSegmentWidthMm: segmentCount > 2 ? segmentWidth : 0,
    firstLastSegmentWidthMm: segmentWidth,
    tabCount: Math.ceil(segmentCount / 2),
    gapCount: Math.floor(segmentCount / 2),
    endMarginMm: Math.min(startDistance, length - endDistance),
    startDistanceMm: startDistance,
    endDistanceMm: endDistance,
    segmentDistancesMm: segmentDistances,
  };
};

const getInwardEdgeNormal = (
  edge: SvgEdge,
  bounds: Bounds | undefined,
): Point => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  const unitX = (edge.end.x - edge.start.x) / length;
  const unitY = (edge.end.y - edge.start.y) / length;
  const normal = { x: -unitY, y: unitX };
  const inwardDirection = getInwardLabelDirection(edge, bounds);
  const dotProduct = normal.x * inwardDirection.x + normal.y * inwardDirection.y;

  return dotProduct < 0 ? { x: -normal.x, y: -normal.y } : normal;
};

const generateFingerJointCommands = (
  edge: SvgEdge,
  assignment: EdgeAssignment,
  connection: EGeometryConnectionDefinition,
  sourceBounds: Bounds | undefined,
) => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const properties = connection.properties;
  const patternInfo = calculateEGeometryPatternInfo(length, properties);

  if (
    length <= 0
    || patternInfo.segmentCount <= 0
    || patternInfo.segmentWidthMm <= 0
    || properties.materialThicknessMm <= 0
  ) {
    return [pointCommand('M', edge.start), pointCommand('L', edge.end)];
  }

  const normal = getInwardEdgeNormal(edge, sourceBounds);
  const role = assignment.slotRole ?? 'tab';
  const clearance = Math.max(0, properties.kerfMm + properties.playMm);
  const depth = Math.max(0, properties.materialThicknessMm + (role === 'slot' ? clearance : 0));
  const commands = [pointCommand('M', edge.start)];
  let lastPoint = edge.start;

  const addLineAt = (distance: number, offset = 0) => {
    const base = pointAtDistance(edge, distance, length);
    const nextPoint = { x: base.x + normal.x * offset, y: base.y + normal.y * offset };

    if (Math.abs(nextPoint.x - lastPoint.x) < 0.0001 && Math.abs(nextPoint.y - lastPoint.y) < 0.0001) {
      return;
    }

    commands.push(pointCommand('L', nextPoint));
    lastPoint = nextPoint;
  };

  addLineAt(patternInfo.startDistanceMm);

  for (let intervalIndex = 0; intervalIndex < patternInfo.segmentCount; intervalIndex += 1) {
    const distance = patternInfo.segmentDistancesMm[intervalIndex];
    const nextDistance = patternInfo.segmentDistancesMm[intervalIndex + 1];
    const isEvenPatternSegment = intervalIndex % 2 === 0;
    const isTabSegment = role === 'tab' ? isEvenPatternSegment : !isEvenPatternSegment;
    const isGapSegment = !isTabSegment;

    if (isGapSegment) {
      const offset = depth;

      addLineAt(distance);
      addLineAt(distance, offset);
      addLineAt(nextDistance, offset);
      addLineAt(nextDistance);
    } else {
      addLineAt(nextDistance);
    }
  }

  addLineAt(patternInfo.endDistanceMm);
  addLineAt(length);
  return commands;
};

const getEdgePathSegment = (
  edge: SvgEdge,
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  includeMove: boolean,
  sourceBounds: Bounds | undefined,
): EdgePathSegment => {
  const assignment = edgeAssignments[edge.id];
  const connection = assignment ? connections[assignment.connectionId] : undefined;
  const commands = assignment?.slotRole && connection
    ? generateFingerJointCommands(edge, assignment, connection, sourceBounds)
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

const getBoundsFromEdges = (sourceEdges: SvgEdge[]): Bounds | undefined => {
  if (sourceEdges.length === 0) {
    return undefined;
  }

  return sourceEdges.reduce<Bounds>((bounds, edge) => ({
    minX: Math.min(bounds.minX, edge.start.x, edge.end.x),
    maxX: Math.max(bounds.maxX, edge.start.x, edge.end.x),
    minY: Math.min(bounds.minY, edge.start.y, edge.end.y),
    maxY: Math.max(bounds.maxY, edge.start.y, edge.end.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
};

const getBoundsFromPathData = (pathData: string, source: string) => getBoundsFromEdges(simplePathToEdges(pathData, source));

const doesBoundsGrow = (originalBounds: Bounds | undefined, generatedBounds: Bounds | undefined) => {
  if (!originalBounds || !generatedBounds) {
    return false;
  }

  const epsilon = 0.0001;
  return generatedBounds.minX < originalBounds.minX - epsilon
    || generatedBounds.maxX > originalBounds.maxX + epsilon
    || generatedBounds.minY < originalBounds.minY - epsilon
    || generatedBounds.maxY > originalBounds.maxY + epsilon;
};

const boundsWarningMessage = (source: string) => (
  `Warning: generated E geometry for ${source} grew outside the original panel bounding box.`
);

export const generateEGeometrySvg = (
  svgContent: string,
  edgeAssignments: Record<string, EdgeAssignment>,
  edges: SvgEdge[],
  connections: Record<string, EGeometryConnectionDefinition>,
): EGeometryGenerationResult => {
  const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgElement = document.querySelector('svg');

  if (!svgElement) {
    throw new Error('Cannot generate E geometry because no SVG is loaded.');
  }

  const lineElements = [...svgElement.querySelectorAll('line')];
  const polyElements = [...svgElement.querySelectorAll('polyline, polygon')];
  const rectElements = [...svgElement.querySelectorAll('rect')];
  const pathElements = [...svgElement.querySelectorAll('path')];
  const boundsBySource = getEdgesBySourceBounds(edges);
  const warnings = new Set<string>();
  let edgeIndex = 0;
  let generatedCount = 0;

  lineElements.forEach((line) => {
    const edge = edges[edgeIndex++];
    if (!edge || !isAssignedEEdge(edge, edgeAssignments, connections)) {
      return;
    }

    const pathData = getEdgePathSegment(edge, edgeAssignments, connections, true, boundsBySource[edge.source]).d;
    replaceElementWithPath(
      line,
      pathData,
      ['x1', 'y1', 'x2', 'y2'],
    );

    if (doesBoundsGrow(getBoundsFromEdges([edge]), getBoundsFromPathData(pathData, edge.source))) {
      warnings.add(boundsWarningMessage(edge.source));
    }
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

    const segments = shapeEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, boundsBySource[edge.source]).d);
    const closeCommand = shape.tagName.toLowerCase() === 'polygon' ? ' Z' : '';
    const pathData = `${segments.join(' ')}${closeCommand}`;
    replaceElementWithPath(shape, pathData, ['points']);

    if (doesBoundsGrow(getBoundsFromEdges(shapeEdges), getBoundsFromPathData(pathData, shapeEdges[0]?.source ?? 'shape'))) {
      warnings.add(boundsWarningMessage(shapeEdges[0]?.source ?? 'shape'));
    }

    generatedCount += shapeEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  rectElements.forEach((rect) => {
    const rectEdges = edges.slice(edgeIndex, edgeIndex + 4);
    edgeIndex += 4;

    if (!rectEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = rectEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, boundsBySource[edge.source]).d);
    const pathData = `${segments.join(' ')} Z`;
    replaceElementWithPath(rect, pathData, ['x', 'y', 'width', 'height', 'rx', 'ry']);

    if (doesBoundsGrow(getBoundsFromEdges(rectEdges), getBoundsFromPathData(pathData, rectEdges[0]?.source ?? 'rect'))) {
      warnings.add(boundsWarningMessage(rectEdges[0]?.source ?? 'rect'));
    }

    generatedCount += rectEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  pathElements.forEach((path, pathIndex) => {
    const pathEdges = simplePathToEdges(path.getAttribute('d'), `path ${pathIndex + 1}`);
    const sourceEdges = edges.slice(edgeIndex, edgeIndex + pathEdges.length);
    edgeIndex += pathEdges.length;

    if (pathEdges.length === 0 || !sourceEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = sourceEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0, boundsBySource[edge.source]).d);
    const pathData = segments.join(' ');
    path.setAttribute('d', pathData);
    applyTechnicalLineStyle(path);

    if (doesBoundsGrow(getBoundsFromEdges(sourceEdges), getBoundsFromPathData(pathData, sourceEdges[0]?.source ?? `path ${pathIndex + 1}`))) {
      warnings.add(boundsWarningMessage(sourceEdges[0]?.source ?? `path ${pathIndex + 1}`));
    }

    generatedCount += sourceEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  if (generatedCount === 0) {
    throw new Error('Assign at least one E-T or E-S edge before generating E geometry.');
  }

  return {
    svgContent: new XMLSerializer().serializeToString(svgElement),
    warnings: [...warnings],
  };
};
