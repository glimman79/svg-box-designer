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

const pointEqualityTolerance = 0.0001;

const pointsAreEqual = (first: Point, second: Point) => (
  Math.abs(first.x - second.x) < pointEqualityTolerance && Math.abs(first.y - second.y) < pointEqualityTolerance
);

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

const isClosedEdgeChain = (edges: PendingPathEdge[]) => (
  edges.length >= 3 && pointsAreEqual(edges[0].start, edges[edges.length - 1].end)
);

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

    const panelBounds = isClosedEdgeChain(pendingSubpathEdges)
      ? getBoundsForPoints(pendingSubpathEdges.flatMap((edge) => [edge.start, edge.end]))
      : undefined;
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

const getPanelPointKey = (point: Point) => `${Math.round(point.x / pointEqualityTolerance)},${Math.round(point.y / pointEqualityTolerance)}`;

const assignConnectedPathPanelBounds = (edges: SvgEdge[]) => {
  const pathEdgeEntries = edges
    .map((edge, edgeIndex) => ({ edge, edgeIndex }))
    .filter(({ edge }) => edge.source.startsWith('path '));

  const edgeIndexesByPoint = new Map<string, number[]>();

  pathEdgeEntries.forEach(({ edgeIndex, edge }) => {
    [edge.start, edge.end].forEach((point) => {
      const key = getPanelPointKey(point);
      edgeIndexesByPoint.set(key, [...(edgeIndexesByPoint.get(key) ?? []), edgeIndex]);
    });
  });

  const visitedEdges = new Set<number>();

  pathEdgeEntries.forEach(({ edgeIndex }) => {
    if (visitedEdges.has(edgeIndex)) {
      return;
    }

    const componentEdgeIndexes = new Set<number>();
    const componentPointKeys = new Set<string>();
    const pendingEdgeIndexes = [edgeIndex];

    while (pendingEdgeIndexes.length > 0) {
      const currentEdgeIndex = pendingEdgeIndexes.pop();

      if (currentEdgeIndex === undefined || visitedEdges.has(currentEdgeIndex)) {
        continue;
      }

      visitedEdges.add(currentEdgeIndex);
      componentEdgeIndexes.add(currentEdgeIndex);
      const edge = edges[currentEdgeIndex];

      [edge.start, edge.end].forEach((point) => {
        const key = getPanelPointKey(point);
        componentPointKeys.add(key);
        (edgeIndexesByPoint.get(key) ?? []).forEach((connectedEdgeIndex) => {
          if (!visitedEdges.has(connectedEdgeIndex)) {
            pendingEdgeIndexes.push(connectedEdgeIndex);
          }
        });
      });
    }

    const isClosedPanel = componentEdgeIndexes.size >= 3
      && componentPointKeys.size >= 3
      && [...componentPointKeys].every((pointKey) => (edgeIndexesByPoint.get(pointKey) ?? [])
        .filter((connectedEdgeIndex) => componentEdgeIndexes.has(connectedEdgeIndex)).length === 2);

    if (!isClosedPanel) {
      return;
    }

    const panelBounds = getBoundsForPoints([...componentEdgeIndexes]
      .flatMap((componentEdgeIndex) => [edges[componentEdgeIndex].start, edges[componentEdgeIndex].end]));

    if (!panelBounds
      || Math.abs(panelBounds.maxX - panelBounds.minX) <= pointEqualityTolerance
      || Math.abs(panelBounds.maxY - panelBounds.minY) <= pointEqualityTolerance) {
      return;
    }

    componentEdgeIndexes.forEach((componentEdgeIndex) => {
      edges[componentEdgeIndex].panelBounds = panelBounds;
    });
  });
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

  assignConnectedPathPanelBounds(edges);

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
  firstPocketStartDistanceMm?: number;
  firstPocketEndDistanceMm?: number;
  lastPocketStartDistanceMm?: number;
  lastPocketEndDistanceMm?: number;
  materialThicknessMm: number;
  fingerWidthMm: number;
  patternPreview: string;
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
  points: Point[];
};

const formatNumber = (value: number) => Number(value.toFixed(4)).toString();

const pointAtDistance = (edge: SvgEdge, distance: number, length: number): Point => ({
  x: edge.start.x + ((edge.end.x - edge.start.x) * distance) / length,
  y: edge.start.y + ((edge.end.y - edge.start.y) * distance) / length,
});

const pointCommand = (command: 'M' | 'L', point: Point) => `${command} ${formatNumber(point.x)} ${formatNumber(point.y)}`;

const pointDistance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);

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

const getEEdgeEndClearanceMm = (properties: EGeometryConnectionProperties) => (
  Math.max(0, properties.materialThicknessMm)
);

export const calculateEGeometryPatternInfo = (
  edgeLengthMm: number,
  properties: EGeometryConnectionProperties,
): EGeometryPatternInfo => {
  const length = Math.max(0, edgeLengthMm);
  const endClearanceMm = getEEdgeEndClearanceMm(properties);
  const startDistance = Math.min(endClearanceMm, length / 2);
  const endDistance = Math.max(startDistance, length - endClearanceMm);
  const activeLength = Math.max(0, endDistance - startDistance);
  const requestedSegmentWidth = Math.max(0, properties.fingerWidthMm);
  const segmentCount = requestedSegmentWidth > 0 && activeLength > 0
    ? Math.max(1, Math.floor(activeLength / requestedSegmentWidth))
    : 0;

  if (segmentCount === 0) {
    return {
      availableLengthMm: activeLength,
      segmentCount: 0,
      segmentWidthMm: 0,
      middleSegmentWidthMm: 0,
      firstLastSegmentWidthMm: 0,
      tabCount: 0,
      gapCount: 0,
      endMarginMm: endClearanceMm,
      startDistanceMm: startDistance,
      endDistanceMm: endDistance,
      segmentDistancesMm: [startDistance],
    };
  }

  const usedLength = segmentCount * requestedSegmentWidth;
  const extraLength = Math.max(0, activeLength - usedLength);
  const firstLastSegmentWidth = segmentCount === 1
    ? activeLength
    : requestedSegmentWidth + extraLength / 2;
  const segmentDistances = [startDistance];
  let currentDistance = startDistance;

  for (let index = 0; index < segmentCount; index += 1) {
    const isFirstOrLast = index === 0 || index === segmentCount - 1;
    const segmentWidth = isFirstOrLast ? firstLastSegmentWidth : requestedSegmentWidth;
    currentDistance += segmentWidth;
    segmentDistances.push(Math.min(endDistance, currentDistance));
  }

  segmentDistances[segmentDistances.length - 1] = endDistance;

  return {
    availableLengthMm: activeLength,
    segmentCount,
    segmentWidthMm: requestedSegmentWidth,
    middleSegmentWidthMm: segmentCount > 2 ? requestedSegmentWidth : 0,
    firstLastSegmentWidthMm: firstLastSegmentWidth,
    tabCount: Math.ceil(segmentCount / 2),
    gapCount: Math.floor(segmentCount / 2),
    endMarginMm: endClearanceMm,
    startDistanceMm: startDistance,
    endDistanceMm: endDistance,
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

const shouldCutEPatternSegment = (segmentIndex: number, role: EdgeSideRole) => {
  const segmentNumber = segmentIndex + 1;
  return role === 'tab'
    ? segmentNumber % 2 === 1
    : segmentNumber % 2 === 0;
};

const getEPatternPreviewString = (segmentCount: number, role: EdgeSideRole) => (
  Array.from({ length: segmentCount }, (_, segmentIndex) => (
    shouldCutEPatternSegment(segmentIndex, role) ? 'pocket' : 'solid'
  )).join(', ')
);

type EPatternPocketInterval = {
  startDistanceMm: number;
  endDistanceMm: number;
};

const getEPatternPocketIntervals = (
  patternInfo: EGeometryPatternInfo,
  role: EdgeSideRole,
): EPatternPocketInterval[] => patternInfo.segmentDistancesMm
  .slice(0, patternInfo.segmentCount)
  .flatMap((distance, intervalIndex) => (
    shouldCutEPatternSegment(intervalIndex, role)
      ? [{
        startDistanceMm: distance,
        endDistanceMm: patternInfo.segmentDistancesMm[intervalIndex + 1],
      }]
      : []
  ));

const getEPatternPocketDistanceSummary = (
  patternInfo: EGeometryPatternInfo,
  role: EdgeSideRole,
) => {
  const pocketSegments = getEPatternPocketIntervals(patternInfo, role);
  const firstPocket = pocketSegments[0];
  const lastPocket = pocketSegments[pocketSegments.length - 1];

  return {
    firstPocketStartDistanceMm: firstPocket?.startDistanceMm,
    firstPocketEndDistanceMm: firstPocket?.endDistanceMm,
    lastPocketStartDistanceMm: lastPocket?.startDistanceMm,
    lastPocketEndDistanceMm: lastPocket?.endDistanceMm,
  };
};

const buildSteppedEPolyline = (
  edge: SvgEdge,
  settings: EGeometryConnectionProperties,
  inwardDirection: Point,
  pocketDepthMm: number,
  role: EdgeSideRole,
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

    if (shouldCutEPatternSegment(intervalIndex, role)) {
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
  return buildSteppedEPolyline(edge, settings, inwardDirection, depth, 'tab');
};

const polylinePointsToCommands = (points: Point[]) => points.map((point, index) => (
  pointCommand(index === 0 ? 'M' : 'L', point)
));

const getAppliedEGeometryPolylineV1 = (
  edge: SvgEdge,
  connection: EGeometryConnectionDefinition,
  role: EdgeSideRole,
) => {
  const inwardDirection = getInwardDirection(edge, edge.panelBounds);
  const depth = getMaxInwardPocketDepth(
    edge,
    inwardDirection,
    connection.properties.materialThicknessMm,
    edge.panelBounds,
  );

  return buildSteppedEPolyline(edge, connection.properties, inwardDirection, depth, role);
};

const getEdgePathSegment = (
  edge: SvgEdge,
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  includeMove: boolean,
): EdgePathSegment => {
  const assignment = edgeAssignments[edge.id];
  const connection = assignment ? connections[assignment.connectionId] : undefined;
  const points = assignment?.slotRole && connection
    ? getAppliedEGeometryPolylineV1(edge, connection, assignment.slotRole)
    : [edge.start, edge.end];
  const commands = polylinePointsToCommands(points);

  return {
    edge,
    d: (includeMove ? commands : commands.slice(1)).join(' '),
    points,
  };
};

const applyTechnicalLineStyle = (element: Element) => {
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', '#000000');
  element.setAttribute('stroke-width', '1');
  element.setAttribute('stroke-linecap', 'butt');
  element.setAttribute('stroke-linejoin', 'miter');
  element.setAttribute('stroke-miterlimit', '2');
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

const buildEGeometryPolylineV2 = (
  edge: SvgEdge,
  side: EdgeSide,
  settings: EGeometryConnectionProperties,
  role: EdgeSideRole,
): Point[] => {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const inwardDirection = getEPreviewInwardDirection(side);
  const pocketDepthMm = Math.max(0, settings.materialThicknessMm);
  const activeStartDistanceMm = Math.min(pocketDepthMm, length / 2);
  const activeEndDistanceMm = Math.max(activeStartDistanceMm, length - pocketDepthMm);
  const activeLengthMm = Math.max(0, activeEndDistanceMm - activeStartDistanceMm);
  const requestedSegmentWidthMm = Math.max(0, settings.fingerWidthMm);
  const segmentCount = requestedSegmentWidthMm > 0 && activeLengthMm > 0
    ? Math.max(1, Math.floor(activeLengthMm / requestedSegmentWidthMm))
    : 0;

  if (length <= 0 || segmentCount <= 0 || requestedSegmentWidthMm <= 0 || pocketDepthMm <= 0) {
    return [edge.start, edge.end];
  }

  const usedLengthMm = segmentCount * requestedSegmentWidthMm;
  const extraLengthMm = Math.max(0, activeLengthMm - usedLengthMm);
  const firstLastSegmentWidthMm = segmentCount === 1
    ? activeLengthMm
    : requestedSegmentWidthMm + extraLengthMm / 2;
  const segmentDistancesMm = [0];
  let currentDistanceMm = 0;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const isFirstOrLast = segmentIndex === 0 || segmentIndex === segmentCount - 1;
    const segmentWidthMm = isFirstOrLast ? firstLastSegmentWidthMm : requestedSegmentWidthMm;
    currentDistanceMm += segmentWidthMm;
    segmentDistancesMm.push(Math.min(activeLengthMm, currentDistanceMm));
  }

  segmentDistancesMm[segmentDistancesMm.length - 1] = activeLengthMm;

  const points: Point[] = [edge.start];

  const addPointAt = (activeDistanceMm: number, offset = 0) => {
    const distanceMm = activeStartDistanceMm + Math.max(0, Math.min(activeLengthMm, activeDistanceMm));
    const base = pointAtDistance(edge, distanceMm, length);
    const nextPoint = {
      x: base.x + inwardDirection.x * Math.max(0, offset),
      y: base.y + inwardDirection.y * Math.max(0, offset),
    };

    if (!pointsAreEqual(nextPoint, points[points.length - 1])) {
      points.push(nextPoint);
    }
  };

  addPointAt(0);

  for (let intervalIndex = 0; intervalIndex < segmentCount; intervalIndex += 1) {
    const distanceMm = segmentDistancesMm[intervalIndex];
    const nextDistanceMm = segmentDistancesMm[intervalIndex + 1];

    if (shouldCutEPatternSegment(intervalIndex, role)) {
      addPointAt(distanceMm);
      addPointAt(distanceMm, pocketDepthMm);
      addPointAt(nextDistanceMm, pocketDepthMm);
      addPointAt(nextDistanceMm);
    } else {
      addPointAt(nextDistanceMm);
    }
  }

  addPointAt(activeLengthMm);
  const endPoint = pointAtDistance(edge, length, length);

  if (!pointsAreEqual(endPoint, points[points.length - 1])) {
    points.push(endPoint);
  }

  return points;
};

const buildEPreviewPolyline = buildEGeometryPolylineV2;

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
  const baseDebugInfo: Omit<EGeometryPreviewDebugInfo, 'patternPreview' | 'generatedPointCount' | 'generatedPoints' | 'warning'> = {
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

  const patternInfo = calculateEGeometryPatternInfo(length, properties);
  const pocketDistanceSummary = getEPatternPocketDistanceSummary(patternInfo, assignment.slotRole ?? 'tab');

  if (!side) {
    return {
      paths: [],
      debugInfo: {
        ...baseDebugInfo,
        ...pocketDistanceSummary,
        patternPreview: '',
        generatedPointCount: 0,
        generatedPoints: [],
        warning: 'Could not detect a top, bottom, left, or right side for this edge; skipped preview notches for this edge.',
      },
    };
  }

  if (length <= 0 || properties.materialThicknessMm <= 0 || properties.fingerWidthMm <= 0 || patternInfo.segmentCount <= 0) {
    return {
      paths: [],
      debugInfo: {
        ...baseDebugInfo,
        ...pocketDistanceSummary,
        patternPreview: '',
        generatedPointCount: 0,
        generatedPoints: [],
        warning: 'Edge length, material thickness, or finger width is too small to generate preview notches.',
      },
    };
  }

  const patternPreview = getEPatternPreviewString(patternInfo.segmentCount, assignment.slotRole ?? 'tab');
  const hasCutSegments = patternInfo.segmentDistancesMm.slice(0, patternInfo.segmentCount)
    .some((_, intervalIndex) => shouldCutEPatternSegment(intervalIndex, assignment.slotRole ?? 'tab'));
  const polyline = buildEPreviewPolyline(edge, side, properties, assignment.slotRole ?? 'tab');
  const path = polylinePointsToCommands(polyline).join(' ');

  return {
    paths: [path],
    debugInfo: {
      ...baseDebugInfo,
      ...pocketDistanceSummary,
      patternPreview,
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

  if (preview.length > 0) {
    console.table(preview.map(({ debugInfo }) => ({
      edgeId: debugInfo.edgeId,
      label: debugInfo.label,
      role: debugInfo.role,
      firstPocketStartDistanceMm: debugInfo.firstPocketStartDistanceMm,
      firstPocketEndDistanceMm: debugInfo.firstPocketEndDistanceMm,
      lastPocketStartDistanceMm: debugInfo.lastPocketStartDistanceMm,
      lastPocketEndDistanceMm: debugInfo.lastPocketEndDistanceMm,
      edgeLengthMm: debugInfo.edgeLengthMm,
    })));
  }

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


type OriginalEdgeRecord = {
  edge: SvgEdge;
  element: Element;
  blockedAttributes: string[];
  order: number;
};

type OrientedEdgeRecord = {
  record: OriginalEdgeRecord;
  edge: SvgEdge;
};

const getUndirectedEdgeKey = (edge: SvgEdge) => {
  const startKey = getPanelPointKey(edge.start);
  const endKey = getPanelPointKey(edge.end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
};

const reverseEdge = (edge: SvgEdge): SvgEdge => ({
  ...edge,
  start: edge.end,
  end: edge.start,
});

const buildOriginalEdgeRecords = (svgElement: SVGSVGElement, edges: SvgEdge[]): OriginalEdgeRecord[] => {
  const records: OriginalEdgeRecord[] = [];
  let edgeIndex = 0;

  const addRecord = (edge: SvgEdge | undefined, element: Element, blockedAttributes: string[]) => {
    if (!edge) {
      return;
    }

    records.push({ edge, element, blockedAttributes, order: records.length });
  };

  [...svgElement.querySelectorAll('line')].forEach((line) => {
    addRecord(edges[edgeIndex++], line, ['x1', 'y1', 'x2', 'y2']);
  });

  [...svgElement.querySelectorAll('polyline, polygon')].forEach((shape) => {
    const points = parsePoints(shape.getAttribute('points'));
    const segmentCount = Math.max(0, points.length - 1) + (shape.tagName.toLowerCase() === 'polygon' && points.length > 2 ? 1 : 0);

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      addRecord(edges[edgeIndex++], shape, ['points']);
    }
  });

  [...svgElement.querySelectorAll('rect')].forEach((rect) => {
    for (let segmentIndex = 0; segmentIndex < 4; segmentIndex += 1) {
      addRecord(edges[edgeIndex++], rect, ['x', 'y', 'width', 'height', 'rx', 'ry']);
    }
  });

  [...svgElement.querySelectorAll('path')].forEach((path, pathIndex) => {
    const pathEdges = simplePathToEdges(path.getAttribute('d'), `path ${pathIndex + 1}`);

    for (let segmentIndex = 0; segmentIndex < pathEdges.length; segmentIndex += 1) {
      addRecord(edges[edgeIndex++], path, ['d']);
    }
  });

  return records;
};


const getElementDebugId = (element: Element) => {
  const id = element.getAttribute('id');
  const tagName = element.tagName.toLowerCase();
  return id ? `${tagName}#${id}` : tagName;
};

const getRecordDebugId = (record: OriginalEdgeRecord) => `${getElementDebugId(record.element)}:${record.edge.id}`;

const countSvgPathLineElements = (svgElement: SVGSVGElement) => ({
  path: svgElement.querySelectorAll('path').length,
  line: svgElement.querySelectorAll('line').length,
  total: svgElement.querySelectorAll('path,line').length,
});

const crossProduct = (first: Point, second: Point) => first.x * second.y - first.y * second.x;
const pointsAreCollinear = (first: Point, second: Point, third: Point) => {
  const base = { x: second.x - first.x, y: second.y - first.y };
  const candidate = { x: third.x - first.x, y: third.y - first.y };
  const baseLength = Math.hypot(base.x, base.y);

  if (baseLength <= 0.0001) {
    return false;
  }

  return Math.abs(crossProduct(base, candidate)) / baseLength <= 0.01;
};

const edgesAreCollinearAndOverlapping = (first: SvgEdge, second: SvgEdge) => {
  if (!pointsAreCollinear(first.start, first.end, second.start) || !pointsAreCollinear(first.start, first.end, second.end)) {
    return false;
  }

  const axis = Math.abs(first.end.x - first.start.x) >= Math.abs(first.end.y - first.start.y) ? 'x' : 'y';
  const firstMin = Math.min(first.start[axis], first.end[axis]);
  const firstMax = Math.max(first.start[axis], first.end[axis]);
  const secondMin = Math.min(second.start[axis], second.end[axis]);
  const secondMax = Math.max(second.start[axis], second.end[axis]);

  return Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) > 0.01;
};

const getGeneratedSubEdges = (segments: EdgePathSegment[]) => segments.flatMap((edgeSegment) => edgeSegment.points.slice(1).map((point, index) => ({
  edgeId: edgeSegment.edge.id,
  start: edgeSegment.points[index],
  end: point,
})));

type GeneratedEGeometrySubEdge = ReturnType<typeof getGeneratedSubEdges>[number];

const getAssignedGeneratedSubEdges = (
  segments: EdgePathSegment[],
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
) => getGeneratedSubEdges(segments.filter((segment) => isAssignedEEdge(segment.edge, edgeAssignments, connections)));

const highlightCollinearRemainingElement = (element: Element, matchingEdgeIds: string[]) => {
  element.setAttribute('data-e-geometry-leftover-collinear', 'true');
  element.setAttribute('data-e-geometry-matching-edge-ids', [...new Set(matchingEdgeIds)].join(','));
  element.setAttribute('stroke', '#ff0000');
  element.setAttribute('stroke-width', '3');
  element.setAttribute('vector-effect', 'non-scaling-stroke');
};

const logOriginalGeometryInvestigation = (
  svgElement: SVGSVGElement,
  originalEdgeRecords: OriginalEdgeRecord[],
  removedOriginalElements: Set<Element>,
  generatedSubEdges: GeneratedEGeometrySubEdge[],
  beforePathLineCount: ReturnType<typeof countSvgPathLineElements>,
) => {
  const afterPathLineCount = countSvgPathLineElements(svgElement);
  const removedRecords = originalEdgeRecords.filter((record) => removedOriginalElements.has(record.element));
  const remainingRecords = originalEdgeRecords.filter((record) => !removedOriginalElements.has(record.element));
  const removedSourcePathIds = [...new Set(removedRecords.map(getRecordDebugId))];
  const remainingSourcePathIds = [...new Set(remainingRecords.map(getRecordDebugId))];
  const removedSourcePaths = [...new Set(removedRecords.map((record) => record.edge.source))];
  const remainingSourcePaths = [...new Set(remainingRecords.map((record) => record.edge.source))];
  const collinearRemainingRecords = remainingRecords.flatMap((record) => {
    const matchingGeneratedEdges = generatedSubEdges
      .filter((generatedEdge) => edgesAreCollinearAndOverlapping(record.edge, {
        id: generatedEdge.edgeId,
        source: generatedEdge.edgeId,
        start: generatedEdge.start,
        end: generatedEdge.end,
      }))
      .map((generatedEdge) => generatedEdge.edgeId);

    if (matchingGeneratedEdges.length === 0) {
      return [];
    }

    highlightCollinearRemainingElement(record.element, matchingGeneratedEdges);
    return [{
      sourcePathId: getRecordDebugId(record),
      element: getElementDebugId(record.element),
      originalEdgeId: record.edge.id,
      originalSource: record.edge.source,
      originalStart: record.edge.start,
      originalEnd: record.edge.end,
      matchingAppliedEEdgeIds: [...new Set(matchingGeneratedEdges)],
    }];
  });

  console.debug('[Apply E Geometry] original geometry investigation', {
    pathLineElementCountBeforeApply: beforePathLineCount,
    pathLineElementCountAfterApply: afterPathLineCount,
    removedOriginalSourcePathIds: removedSourcePathIds,
    remainingOriginalSourcePathIds: remainingSourcePathIds,
    removedOriginalSources: removedSourcePaths,
    remainingOriginalSources: remainingSourcePaths,
    collinearRemainingOriginalSegments: collinearRemainingRecords,
    highlightedCollinearElementCount: new Set(collinearRemainingRecords.map((record) => record.element)).size,
  });
};

const getClosedComponentRecords = (records: OriginalEdgeRecord[]) => {
  const uniqueRecords: OriginalEdgeRecord[] = [];
  const duplicateRecordsByKey = new Map<string, OriginalEdgeRecord[]>();
  const seenEdgeKeys = new Set<string>();

  records.forEach((record) => {
    const edgeKey = getUndirectedEdgeKey(record.edge);
    duplicateRecordsByKey.set(edgeKey, [...(duplicateRecordsByKey.get(edgeKey) ?? []), record]);

    if (!seenEdgeKeys.has(edgeKey)) {
      seenEdgeKeys.add(edgeKey);
      uniqueRecords.push(record);
    }
  });

  const recordIndexesByPoint = new Map<string, number[]>();
  uniqueRecords.forEach((record, recordIndex) => {
    [record.edge.start, record.edge.end].forEach((point) => {
      const key = getPanelPointKey(point);
      recordIndexesByPoint.set(key, [...(recordIndexesByPoint.get(key) ?? []), recordIndex]);
    });
  });

  const visited = new Set<number>();
  const components: { records: OriginalEdgeRecord[]; duplicateRecords: OriginalEdgeRecord[] }[] = [];

  uniqueRecords.forEach((_, recordIndex) => {
    if (visited.has(recordIndex)) {
      return;
    }

    const componentIndexes = new Set<number>();
    const pending = [recordIndex];

    while (pending.length > 0) {
      const currentIndex = pending.pop();

      if (currentIndex === undefined || visited.has(currentIndex)) {
        continue;
      }

      visited.add(currentIndex);
      componentIndexes.add(currentIndex);

      [uniqueRecords[currentIndex].edge.start, uniqueRecords[currentIndex].edge.end].forEach((point) => {
        (recordIndexesByPoint.get(getPanelPointKey(point)) ?? []).forEach((connectedIndex) => {
          if (!visited.has(connectedIndex)) {
            pending.push(connectedIndex);
          }
        });
      });
    }

    const pointKeys = new Set<string>();
    componentIndexes.forEach((componentIndex) => {
      pointKeys.add(getPanelPointKey(uniqueRecords[componentIndex].edge.start));
      pointKeys.add(getPanelPointKey(uniqueRecords[componentIndex].edge.end));
    });

    const isClosed = componentIndexes.size >= 3
      && pointKeys.size >= 3
      && [...pointKeys].every((pointKey) => (recordIndexesByPoint.get(pointKey) ?? [])
        .filter((connectedIndex) => componentIndexes.has(connectedIndex)).length === 2);

    if (!isClosed) {
      return;
    }

    const componentRecords = [...componentIndexes].map((componentIndex) => uniqueRecords[componentIndex]);
    const duplicateRecords = componentRecords.flatMap((record) => duplicateRecordsByKey.get(getUndirectedEdgeKey(record.edge)) ?? [record]);
    components.push({ records: componentRecords, duplicateRecords });
  });

  return components;
};

const orientClosedComponentRecords = (
  records: OriginalEdgeRecord[],
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
): OrientedEdgeRecord[] | undefined => {
  const unused = new Set(records);
  const firstRecord = records.find((record) => isAssignedEEdge(record.edge, edgeAssignments, connections)) ?? records[0];
  const orientedRecords: OrientedEdgeRecord[] = [{ record: firstRecord, edge: firstRecord.edge }];
  unused.delete(firstRecord);
  let currentPoint = firstRecord.edge.end;

  while (unused.size > 0) {
    const nextRecord = [...unused].find((record) => pointsAreEqual(record.edge.start, currentPoint) || pointsAreEqual(record.edge.end, currentPoint));

    if (!nextRecord) {
      return undefined;
    }

    const orientedEdge = pointsAreEqual(nextRecord.edge.start, currentPoint) ? nextRecord.edge : reverseEdge(nextRecord.edge);
    orientedRecords.push({ record: nextRecord, edge: orientedEdge });
    unused.delete(nextRecord);
    currentPoint = orientedEdge.end;
  }

  return pointsAreEqual(currentPoint, firstRecord.edge.start) ? orientedRecords : undefined;
};

const getFirstDocumentOrderedElement = (elements: Element[]) => elements
  .sort((first, second) => {
    const position = first.compareDocumentPosition(second);

    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    return 0;
  })[0];

const logAppliedEPanelDebug = (segments: EdgePathSegment[], records: OrientedEdgeRecord[]) => {
  const firstGeneratedPoint = segments[0]?.points[0];
  const finalGeneratedPoint = segments[segments.length - 1]?.points.at(-1);
  const finalPointEqualsFirstPoint = Boolean(
    firstGeneratedPoint
    && finalGeneratedPoint
    && pointsAreEqual(finalGeneratedPoint, firstGeneratedPoint),
  );

  console.debug('[Apply E Geometry] panel debug', {
    edgeCount: segments.length,
    firstGeneratedPoint,
    finalGeneratedPoint,
    finalPointEqualsFirstPointBeforeZ: finalPointEqualsFirstPoint,
  });

  segments.forEach((segment, index) => {
    const nextEdge = records[(index + 1) % records.length]?.edge;
    const generatedFirstPoint = segment.points[0];
    const generatedLastPoint = segment.points.at(-1);

    console.debug('[Apply E Geometry] oriented edge debug', {
      edgeId: segment.edge.id,
      edgeStart: segment.edge.start,
      edgeEnd: segment.edge.end,
      generatedFirstPoint,
      generatedLastPoint,
      nextEdgeStart: nextEdge?.start,
      generatedLastPointEqualsNextEdgeStart: Boolean(
        generatedLastPoint
        && nextEdge
        && pointsAreEqual(generatedLastPoint, nextEdge.start),
      ),
    });
  });

  if (firstGeneratedPoint && finalGeneratedPoint) {
    const closingDistanceMm = pointDistance(finalGeneratedPoint, firstGeneratedPoint);

    if (closingDistanceMm > 0.01) {
      console.warn('[Apply E Geometry] closing Z would create visible segment longer than 0.01 mm', {
        closingDistanceMm,
        finalGeneratedPoint,
        firstGeneratedPoint,
      });
    }
  }
};

const replaceConnectedPanelWithPath = (
  records: OrientedEdgeRecord[],
  duplicateRecords: OriginalEdgeRecord[],
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  removedOriginalElements?: Set<Element>,
  generatedSubEdges?: GeneratedEGeometrySubEdge[],
) => {
  const elements = [...new Set(duplicateRecords.map((record) => record.element))];
  const firstElement = getFirstDocumentOrderedElement(elements);

  if (!firstElement?.parentNode) {
    return false;
  }

  const segments = records.map(({ edge }, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0));
  generatedSubEdges?.push(...getAssignedGeneratedSubEdges(segments, edgeAssignments, connections));
  logAppliedEPanelDebug(segments, records);
  const pathData = `${segments.map((segment) => segment.d).join(' ')} Z`;
  const path = firstElement.ownerDocument.createElementNS(svgNamespace, 'path');
  cloneGeometryAttributes(firstElement, path, duplicateRecords.find((record) => record.element === firstElement)?.blockedAttributes ?? []);
  path.setAttribute('d', pathData);
  applyTechnicalLineStyle(path);
  firstElement.parentNode.insertBefore(path, firstElement);
  elements.forEach((element) => {
    removedOriginalElements?.add(element);
    element.remove();
  });
  return true;
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
  const beforePathLineCount = countSvgPathLineElements(svgElement);
  const originalEdgeRecords = buildOriginalEdgeRecords(svgElement, edges);
  const handledElements = new Set<Element>();
  const removedOriginalElements = new Set<Element>();
  const generatedSubEdges: GeneratedEGeometrySubEdge[] = [];
  let generatedCount = 0;

  console.debug('[Apply E Geometry] path/line element count before apply', beforePathLineCount);

  getClosedComponentRecords(originalEdgeRecords).forEach((component) => {
    if (!component.duplicateRecords.some((record) => isAssignedEEdge(record.edge, edgeAssignments, connections))) {
      return;
    }

    const elements = new Set(component.duplicateRecords.map((record) => record.element));
    const elementRecords = originalEdgeRecords.filter((record) => elements.has(record.element));

    if (!elementRecords.every((record) => component.duplicateRecords.includes(record))) {
      return;
    }

    const orientedRecords = orientClosedComponentRecords(component.records, edgeAssignments, connections);

    if (!orientedRecords) {
      return;
    }

    if (replaceConnectedPanelWithPath(
      orientedRecords,
      component.duplicateRecords,
      edgeAssignments,
      connections,
      removedOriginalElements,
      generatedSubEdges,
    )) {
      elements.forEach((element) => handledElements.add(element));
      generatedCount += component.duplicateRecords.filter((record) => isAssignedEEdge(record.edge, edgeAssignments, connections)).length;
    }
  });

  let edgeIndex = 0;

  lineElements.forEach((line) => {
    if (handledElements.has(line)) {
      edgeIndex += 1;
      return;
    }

    const edge = edges[edgeIndex++];
    if (!edge || !isAssignedEEdge(edge, edgeAssignments, connections)) {
      return;
    }

    const segments = [getEdgePathSegment(edge, edgeAssignments, connections, true)];
    generatedSubEdges.push(...getAssignedGeneratedSubEdges(segments, edgeAssignments, connections));
    replaceElementWithPath(
      line,
      segments[0].d,
      ['x1', 'y1', 'x2', 'y2'],
    );
    removedOriginalElements.add(line);
    generatedCount += 1;
  });

  polyElements.forEach((shape) => {
    const points = parsePoints(shape.getAttribute('points'));
    if (handledElements.has(shape)) {
      const handledSegmentCount = Math.max(0, points.length - 1) + (shape.tagName.toLowerCase() === 'polygon' && points.length > 2 ? 1 : 0);
      edgeIndex += handledSegmentCount;
      return;
    }

    const segmentCount = Math.max(0, points.length - 1) + (shape.tagName.toLowerCase() === 'polygon' && points.length > 2 ? 1 : 0);
    const shapeEdges = edges.slice(edgeIndex, edgeIndex + segmentCount);
    edgeIndex += segmentCount;

    if (!shapeEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = shapeEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0));
    generatedSubEdges.push(...getAssignedGeneratedSubEdges(segments, edgeAssignments, connections));
    const closeCommand = shape.tagName.toLowerCase() === 'polygon' ? ' Z' : '';
    replaceElementWithPath(shape, `${segments.map((segment) => segment.d).join(' ')}${closeCommand}`, ['points']);
    removedOriginalElements.add(shape);
    generatedCount += shapeEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  rectElements.forEach((rect) => {
    if (handledElements.has(rect)) {
      edgeIndex += 4;
      return;
    }

    const rectEdges = edges.slice(edgeIndex, edgeIndex + 4);
    edgeIndex += 4;

    if (!rectEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = rectEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0));
    generatedSubEdges.push(...getAssignedGeneratedSubEdges(segments, edgeAssignments, connections));
    replaceElementWithPath(rect, `${segments.map((segment) => segment.d).join(' ')} Z`, ['x', 'y', 'width', 'height', 'rx', 'ry']);
    removedOriginalElements.add(rect);
    generatedCount += rectEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  pathElements.forEach((path, pathIndex) => {
    const pathEdges = simplePathToEdges(path.getAttribute('d'), `path ${pathIndex + 1}`);
    if (handledElements.has(path)) {
      edgeIndex += pathEdges.length;
      return;
    }

    const sourceEdges = edges.slice(edgeIndex, edgeIndex + pathEdges.length);
    edgeIndex += pathEdges.length;

    if (pathEdges.length === 0 || !sourceEdges.some((edge) => isAssignedEEdge(edge, edgeAssignments, connections))) {
      return;
    }

    const segments = sourceEdges.map((edge, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0));
    generatedSubEdges.push(...getAssignedGeneratedSubEdges(segments, edgeAssignments, connections));
    path.setAttribute('d', segments.map((segment) => segment.d).join(' '));
    applyTechnicalLineStyle(path);
    removedOriginalElements.add(path);
    generatedCount += sourceEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  if (generatedCount === 0) {
    throw new Error('Assign at least one E-T or E-S edge before generating E geometry.');
  }

  logOriginalGeometryInvestigation(
    svgElement,
    originalEdgeRecords,
    removedOriginalElements,
    generatedSubEdges,
    beforePathLineCount,
  );

  return new XMLSerializer().serializeToString(svgElement);
};
