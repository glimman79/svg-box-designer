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

const polylinePointsToCommands = (points: Point[]) => points.map((point, index) => (
  pointCommand(index === 0 ? 'M' : 'L', point)
));

const getEdgePathSegment = (
  edge: SvgEdge,
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  includeMove: boolean,
): EdgePathSegment => {
  const assignment = edgeAssignments[edge.id];
  const connection = assignment ? connections[assignment.connectionId] : undefined;
  const points = assignment?.slotRole && connection
    ? buildEGeometryPolyline(edge, connection, assignment.slotRole)
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

const buildEGeometryPolyline = (
  edge: SvgEdge,
  connection: EGeometryConnectionDefinition,
  role: EdgeSideRole,
): Point[] => {
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);

  if (edgeLength === 0) {
    return [edge.start, edge.end];
  }

  const { materialThicknessMm, fingerWidthMm } = connection.properties;
  const segmentCount = fingerWidthMm > 0
    ? Math.max(1, Math.floor(edgeLength / fingerWidthMm))
    : 1;
  const actualSegmentWidth = edgeLength / segmentCount;
  const edgeDirection = {
    x: (edge.end.x - edge.start.x) / edgeLength,
    y: (edge.end.y - edge.start.y) / edgeLength,
  };
  const inwardDirection = getInwardDirection(edge, edge.panelBounds);
  const pocketDepth = Math.max(0, materialThicknessMm);
  const points: Point[] = [edge.start];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStartDistance = actualSegmentWidth * segmentIndex;
    const segmentEndDistance = segmentIndex === segmentCount - 1
      ? edgeLength
      : actualSegmentWidth * (segmentIndex + 1);
    const segmentStart = {
      x: edge.start.x + edgeDirection.x * segmentStartDistance,
      y: edge.start.y + edgeDirection.y * segmentStartDistance,
    };
    const segmentEnd = {
      x: edge.start.x + edgeDirection.x * segmentEndDistance,
      y: edge.start.y + edgeDirection.y * segmentEndDistance,
    };
    const isPocket = role === 'tab' ? segmentIndex % 2 === 0 : segmentIndex % 2 === 1;

    if (isPocket) {
      points.push(
        {
          x: segmentStart.x + inwardDirection.x * pocketDepth,
          y: segmentStart.y + inwardDirection.y * pocketDepth,
        },
        {
          x: segmentEnd.x + inwardDirection.x * pocketDepth,
          y: segmentEnd.y + inwardDirection.y * pocketDepth,
        },
        segmentEnd,
      );
    } else {
      points.push(segmentEnd);
    }
  }

  return points;
};

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
  const side = getEdgeSide(edge, panelBounds);
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
    detectedSide: side,
    inwardDirection: formatDirection(getInwardDirection(edge, panelBounds)),
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

  if (length <= 0) {
    return {
      paths: [],
      debugInfo: {
        ...baseDebugInfo,
        generatedPointCount: 0,
        generatedPoints: [],
        warning: 'Edge length is too small to generate an E geometry preview.',
      },
    };
  }

  const polyline = buildEGeometryPolyline(edge, connection, assignment.slotRole ?? 'tab');
  const path = polylinePointsToCommands(polyline).join(' ');

  return {
    paths: [path],
    debugInfo: {
      ...baseDebugInfo,
      generatedPointCount: polyline.length,
      generatedPoints: polyline,
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

const replaceConnectedPanelWithPath = (
  records: OrientedEdgeRecord[],
  duplicateRecords: OriginalEdgeRecord[],
  edgeAssignments: Record<string, EdgeAssignment>,
  connections: Record<string, EGeometryConnectionDefinition>,
  removedOriginalElements?: Set<Element>,
) => {
  const elements = [...new Set(duplicateRecords.map((record) => record.element))];
  const firstElement = getFirstDocumentOrderedElement(elements);

  if (!firstElement?.parentNode) {
    return false;
  }

  const segments = records.map(({ edge }, index) => getEdgePathSegment(edge, edgeAssignments, connections, index === 0));
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
  const originalEdgeRecords = buildOriginalEdgeRecords(svgElement, edges);
  const handledElements = new Set<Element>();
  const removedOriginalElements = new Set<Element>();
  let generatedCount = 0;

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
    path.setAttribute('d', segments.map((segment) => segment.d).join(' '));
    applyTechnicalLineStyle(path);
    removedOriginalElements.add(path);
    generatedCount += sourceEdges.filter((edge) => isAssignedEEdge(edge, edgeAssignments, connections)).length;
  });

  if (generatedCount === 0) {
    throw new Error('Assign at least one E-T or E-S edge before generating E geometry.');
  }

  return new XMLSerializer().serializeToString(svgElement);
};
