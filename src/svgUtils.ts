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

const defaultCanvas = {
  viewBox: '0 0 800 600',
  width: 800,
  height: 600,
};

const exportedLabelFontSize = 18;
const exportedLabelPaddingX = 7;
const exportedLabelPaddingY = 4;
const exportedLabelEdgeOffset = 18;

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

export const exportLabeledSvg = (svgContent: string, edgeAssignments: Record<string, EdgeAssignment>, edges: SvgEdge[]) => {
  const document = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const svgElement = document.querySelector('svg');

  if (!svgElement) {
    throw new Error('Cannot export because no SVG is loaded.');
  }

  svgElement.querySelector('#svg-box-designer-labels')?.remove();

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

    const center = midpoint(edge);
    const normal = getEdgeNormal(edge);
    const label = getEdgeAssignmentDisplayLabel(assignment) ?? assignment.connectionId;
    const labelWidth = label.length * exportedLabelFontSize * 0.68 + exportedLabelPaddingX * 2;
    const labelHeight = exportedLabelFontSize + exportedLabelPaddingY * 2;
    const labelElement = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    labelElement.setAttribute('transform', `translate(${center.x + normal.x * exportedLabelEdgeOffset} ${center.y + normal.y * exportedLabelEdgeOffset})`);
    labelElement.setAttribute('data-edge-id', edge.id);
    labelElement.setAttribute('data-connection-id', assignment.connectionId);
    if (assignment.slotRole) {
      labelElement.setAttribute('data-slot-role', assignment.slotRole);
    }

    background.setAttribute('x', String(-labelWidth / 2));
    background.setAttribute('y', String(-labelHeight / 2));
    background.setAttribute('width', String(labelWidth));
    background.setAttribute('height', String(labelHeight));
    background.setAttribute('rx', '5');
    background.setAttribute('fill', '#ffffff');
    background.setAttribute('stroke', '#cbd5e1');
    background.setAttribute('stroke-width', '1');
    background.setAttribute('opacity', '0.96');

    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = label;
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
  const defaultEndMargin = Math.max(0, properties.materialThicknessMm);
  const requestedStartOffset = properties.startOffsetMm > 0 ? properties.startOffsetMm : defaultEndMargin;
  const requestedEndOffset = properties.endOffsetMm > 0 ? properties.endOffsetMm : defaultEndMargin;
  const startOffset = Math.max(0, Math.min(requestedStartOffset, length));
  const endOffset = Math.max(0, Math.min(requestedEndOffset, Math.max(0, length - startOffset)));
  const availableLength = Math.max(0, length - startOffset - endOffset);
  const maxFullSegments = requestedSegmentWidth > 0 ? Math.floor(availableLength / requestedSegmentWidth) : 0;
  const segmentCount = maxFullSegments >= 3
    ? maxFullSegments - (maxFullSegments % 2 === 0 ? 1 : 0)
    : maxFullSegments >= 2
      ? 2
      : 0;
  const middleSegmentWidth = segmentCount > 2 ? requestedSegmentWidth : 0;
  const firstLastSegmentWidth = segmentCount > 0
    ? (availableLength - Math.max(0, segmentCount - 2) * requestedSegmentWidth) / 2
    : 0;
  const segmentWidths = Array.from({ length: segmentCount }, (_, index) => (
    index === 0 || index === segmentCount - 1 ? firstLastSegmentWidth : requestedSegmentWidth
  ));
  const segmentDistances = [startOffset];

  segmentWidths.reduce((distance, width) => {
    const nextDistance = distance + width;
    segmentDistances.push(nextDistance);
    return nextDistance;
  }, startOffset);

  return {
    availableLengthMm: availableLength,
    segmentCount,
    segmentWidthMm: middleSegmentWidth || firstLastSegmentWidth,
    middleSegmentWidthMm: middleSegmentWidth,
    firstLastSegmentWidthMm: firstLastSegmentWidth,
    tabCount: Math.ceil(segmentCount / 2),
    gapCount: Math.floor(segmentCount / 2),
    endMarginMm: Math.min(startOffset, endOffset),
    startDistanceMm: startOffset,
    endDistanceMm: length - endOffset,
    segmentDistancesMm: segmentDistances,
  };
};

const generateFingerJointCommands = (
  edge: SvgEdge,
  assignment: EdgeAssignment,
  connection: EGeometryConnectionDefinition,
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

  const unitX = (edge.end.x - edge.start.x) / length;
  const unitY = (edge.end.y - edge.start.y) / length;
  const normal = { x: -unitY, y: unitX };
  const role = assignment.slotRole ?? 'tab';
  const clearance = Math.max(0, properties.kerfMm + properties.playMm);
  const depth = Math.max(0, properties.materialThicknessMm + (role === 'slot' ? clearance : 0));
  const direction = role === 'tab' ? 1 : -1;
  const commands = [pointCommand('M', edge.start)];

  const addLineAt = (distance: number, offset = 0) => {
    const base = pointAtDistance(edge, distance, length);
    commands.push(pointCommand('L', { x: base.x + normal.x * offset, y: base.y + normal.y * offset }));
  };

  addLineAt(patternInfo.startDistanceMm);

  for (let intervalIndex = 0; intervalIndex < patternInfo.segmentCount; intervalIndex += 1) {
    const distance = patternInfo.segmentDistancesMm[intervalIndex];
    const nextDistance = patternInfo.segmentDistancesMm[intervalIndex + 1];
    const isEvenPatternSegment = intervalIndex % 2 === 0;
    const isTabSegment = role === 'tab' ? isEvenPatternSegment : !isEvenPatternSegment;
    const isGapSegment = !isTabSegment;
    const shouldStepOffEdge = role === 'tab' ? isTabSegment : isGapSegment;

    if (shouldStepOffEdge) {
      const offset = direction * depth;

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
): EdgePathSegment => {
  const assignment = edgeAssignments[edge.id];
  const connection = assignment ? connections[assignment.connectionId] : undefined;
  const commands = assignment?.slotRole && connection
    ? generateFingerJointCommands(edge, assignment, connection)
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
  let edgeIndex = 0;
  let generatedCount = 0;

  lineElements.forEach((line) => {
    const edge = edges[edgeIndex++];
    if (!edge || !isAssignedEEdge(edge, edgeAssignments, connections)) {
      return;
    }

    replaceElementWithPath(
      line,
      getEdgePathSegment(edge, edgeAssignments, connections, true).d,
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

    const segments = shapeEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0).d);
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

    const segments = rectEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0).d);
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

    const segments = sourceEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0).d);
    path.setAttribute('d', segments.join(' '));
    applyTechnicalLineStyle(path);
    generatedCount += sourceEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  if (generatedCount === 0) {
    throw new Error('Assign at least one E-T or E-S edge before generating E geometry.');
  }

  return new XMLSerializer().serializeToString(svgElement);
};
