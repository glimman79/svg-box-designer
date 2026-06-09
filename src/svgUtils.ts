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

export type SvgPanel = {
  id: string;
  contour: Point[];
  bounds: SourceBounds;
  edgeIds: string[];
};

export type EdgeRole = 'A' | 'B';

export type EdgeAssignment = {
  connectionId: string;
  edgeRole?: EdgeRole;
};

export const getEdgeAssignmentDisplayLabel = (assignment: EdgeAssignment | undefined) => {
  if (!assignment) {
    return undefined;
  }

  if (assignment.connectionId.startsWith('E') && assignment.edgeRole) {
    return `${assignment.connectionId}-${assignment.edgeRole === 'A' ? 'A' : 'B'}`;
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
  panels: SvgPanel[];
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

const getPointsBounds = (points: Point[]): SourceBounds | undefined => {
  if (points.length === 0) {
    return undefined;
  }

  return points.reduce<SourceBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: points[0].x,
    maxX: points[0].x,
    minY: points[0].y,
    maxY: points[0].y,
  });
};

const getPanelFigureBounds = (points: Point[]): SourceBounds | undefined => {
  const bounds = getPointsBounds(points);

  if (!bounds) {
    return undefined;
  }

  const tolerance = 0.001;
  const hasArea = bounds.maxX - bounds.minX > tolerance && bounds.maxY - bounds.minY > tolerance;
  const uniquePoints = new Set(points.map((point) => `${point.x},${point.y}`));

  return hasArea && uniquePoints.size >= 3 ? bounds : undefined;
};

const closedLoopTolerance = 0.1;

const nearlyEqual = (first: number, second: number, tolerance = closedLoopTolerance) => (
  Math.abs(first - second) <= tolerance
);

type CandidatePanelEdge = {
  edge: SvgEdge;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const getCandidatePanelEdge = (edge: SvgEdge): CandidatePanelEdge | undefined => {
  if (edge.panelBounds) {
    return undefined;
  }

  const minX = Math.min(edge.start.x, edge.end.x);
  const maxX = Math.max(edge.start.x, edge.end.x);
  const minY = Math.min(edge.start.y, edge.end.y);
  const maxY = Math.max(edge.start.y, edge.end.y);
  const isHorizontal = nearlyEqual(edge.start.y, edge.end.y);
  const isVertical = nearlyEqual(edge.start.x, edge.end.x);

  if (!isHorizontal && !isVertical) {
    return undefined;
  }

  return { edge, minX, maxX, minY, maxY };
};

const getRectangleBounds = (
  firstHorizontal: CandidatePanelEdge,
  secondHorizontal: CandidatePanelEdge,
  firstVertical: CandidatePanelEdge,
  secondVertical: CandidatePanelEdge,
): SourceBounds => ({
  minX: Math.min(firstHorizontal.minX, secondHorizontal.minX, firstVertical.minX, secondVertical.minX),
  maxX: Math.max(firstHorizontal.maxX, secondHorizontal.maxX, firstVertical.maxX, secondVertical.maxX),
  minY: Math.min(firstHorizontal.minY, secondHorizontal.minY, firstVertical.minY, secondVertical.minY),
  maxY: Math.max(firstHorizontal.maxY, secondHorizontal.maxY, firstVertical.maxY, secondVertical.maxY),
});

const hasPositiveArea = (bounds: SourceBounds) => (
  bounds.maxX - bounds.minX > closedLoopTolerance && bounds.maxY - bounds.minY > closedLoopTolerance
);

const getMatchingVerticalSide = (
  verticalEdges: CandidatePanelEdge[],
  x: number,
  minY: number,
  maxY: number,
  excludedEdge?: SvgEdge,
) => verticalEdges.find((vertical) => (
  vertical.edge !== excludedEdge
  && nearlyEqual(vertical.minX, x)
  && nearlyEqual(vertical.maxX, x)
  && nearlyEqual(vertical.minY, minY)
  && nearlyEqual(vertical.maxY, maxY)
));

export const assignPanelBoundsFromClosedLoops = (edges: SvgEdge[]) => {
  const candidateEdges = edges.map(getCandidatePanelEdge).filter((edge): edge is CandidatePanelEdge => Boolean(edge));
  const horizontalEdges = candidateEdges.filter((edge) => nearlyEqual(edge.minY, edge.maxY));
  const verticalEdges = candidateEdges.filter((edge) => nearlyEqual(edge.minX, edge.maxX));

  horizontalEdges.forEach((firstHorizontal, firstIndex) => {
    horizontalEdges.slice(firstIndex + 1).forEach((secondHorizontal) => {
      if (
        !nearlyEqual(firstHorizontal.minX, secondHorizontal.minX)
        || !nearlyEqual(firstHorizontal.maxX, secondHorizontal.maxX)
        || nearlyEqual(firstHorizontal.minY, secondHorizontal.minY)
      ) {
        return;
      }

      const minX = Math.min(firstHorizontal.minX, secondHorizontal.minX);
      const maxX = Math.max(firstHorizontal.maxX, secondHorizontal.maxX);
      const minY = Math.min(firstHorizontal.minY, secondHorizontal.minY);
      const maxY = Math.max(firstHorizontal.maxY, secondHorizontal.maxY);

      if (!hasPositiveArea({ minX, maxX, minY, maxY })) {
        return;
      }

      const firstVertical = getMatchingVerticalSide(verticalEdges, minX, minY, maxY);
      const secondVertical = getMatchingVerticalSide(verticalEdges, maxX, minY, maxY, firstVertical?.edge);

      if (!firstVertical || !secondVertical) {
        return;
      }

      const panelBounds = getRectangleBounds(firstHorizontal, secondHorizontal, firstVertical, secondVertical);

      [firstHorizontal, secondHorizontal, firstVertical, secondVertical].forEach(({ edge }) => {
        if (!edge.panelBounds) {
          edge.panelBounds = panelBounds;
        }
      });
    });
  });
};

const addEdge = (
  edges: SvgEdge[],
  source: string,
  start: Point,
  end: Point,
  panelBounds?: SourceBounds,
): SvgEdge | undefined => {
  if (start.x === end.x && start.y === end.y) {
    return undefined;
  }

  const edge = {
    id: `edge-${edges.length + 1}`,
    source,
    start,
    end,
    panelBounds,
  };

  edges.push(edge);

  return edge;
};

const addPanel = (
  panels: SvgPanel[],
  contour: Point[],
  bounds: SourceBounds | undefined,
  edgeIds: string[],
): SvgPanel | undefined => {
  if (!bounds) {
    return undefined;
  }

  const panel = {
    id: `panel-${panels.length + 1}`,
    contour,
    bounds,
    edgeIds,
  };

  panels.push(panel);

  return panel;
};

const logPanelDebug = (panels: SvgPanel[]) => {
  console.debug('SVG import panels', {
    panelCount: panels.length,
    panels: panels.map((panel) => ({
      id: panel.id,
      contourPointCount: panel.contour.length,
    })),
  });
};

const parsePathSegments = (pathData: string | null, source: string, edges: SvgEdge[], panels: SvgPanel[]) => {
  if (!pathData) {
    return;
  }

  const tokens = pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0;
  let command = '';
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = { x: 0, y: 0 };
  let subpathEdges: { start: Point; end: Point }[] = [];
  let subpathPoints: Point[] = [];
  let subpathContour: Point[] = [];
  let isSubpathClosed = false;
  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const readNumber = () => Number.parseFloat(tokens[index++]);
  const addPathEdge = (start: Point, end: Point) => {
    if (start.x === end.x && start.y === end.y) {
      return;
    }

    subpathEdges.push({ start, end });
    subpathPoints.push(start, end);
  };
  const flushSubpathEdges = () => {
    const panelBounds = getPanelFigureBounds(subpathPoints);
    const edgeIds: string[] = [];

    subpathEdges.forEach((edge) => {
      const addedEdge = addEdge(edges, source, edge.start, edge.end, panelBounds);

      if (addedEdge) {
        edgeIds.push(addedEdge.id);
      }
    });

    if (isSubpathClosed) {
      addPanel(panels, subpathContour, panelBounds, edgeIds);
    }

    subpathEdges = [];
    subpathPoints = [];
    subpathContour = [];
    isSubpathClosed = false;
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
      subpathPoints = [current];
      subpathContour = [current];
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
      subpathContour.push(current);
    } else if (upperCommand === 'H') {
      const x = readNumber();
      const next = { x: relative ? current.x + x : x, y: current.y };
      addPathEdge(current, next);
      current = next;
      subpathContour.push(current);
    } else if (upperCommand === 'V') {
      const y = readNumber();
      const next = { x: current.x, y: relative ? current.y + y : y };
      addPathEdge(current, next);
      current = next;
      subpathContour.push(current);
    } else if (upperCommand === 'Z') {
      addPathEdge(current, subpathStart);
      current = subpathStart;
      isSubpathClosed = true;
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
  const panels: SvgPanel[] = [];

  svgElement.querySelectorAll('line').forEach((line, elementIndex) => {
    const start = { x: svgNumber(line.getAttribute('x1')), y: svgNumber(line.getAttribute('y1')) };
    const end = { x: svgNumber(line.getAttribute('x2')), y: svgNumber(line.getAttribute('y2')) };
    addEdge(edges, `line ${elementIndex + 1}`, start, end);
  });

  svgElement.querySelectorAll('polyline, polygon').forEach((shape, elementIndex) => {
    const points = parsePoints(shape.getAttribute('points'));
    const source = `${shape.tagName} ${elementIndex + 1}`;
    const isPolygon = shape.tagName.toLowerCase() === 'polygon';
    const isClosedPolyline = points.length > 2
      && points[0].x === points[points.length - 1].x
      && points[0].y === points[points.length - 1].y;
    const panelBounds = isPolygon || isClosedPolyline ? getPanelFigureBounds(points) : undefined;
    const edgeIds: string[] = [];

    points.slice(1).forEach((point, pointIndex) => {
      const edge = addEdge(edges, source, points[pointIndex], point, panelBounds);

      if (edge) {
        edgeIds.push(edge.id);
      }
    });

    if (isPolygon && points.length > 2) {
      const edge = addEdge(edges, source, points[points.length - 1], points[0], panelBounds);

      if (edge) {
        edgeIds.push(edge.id);
      }
    }

    if (isPolygon || isClosedPolyline) {
      addPanel(panels, points, panelBounds, edgeIds);
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
    const panelBounds = { minX: x, maxX: x + width, minY: y, maxY: y + height };

    const edgeIds: string[] = [];

    corners.forEach((corner, cornerIndex) => {
      const edge = addEdge(edges, `rect ${elementIndex + 1}`, corner, corners[(cornerIndex + 1) % corners.length], panelBounds);

      if (edge) {
        edgeIds.push(edge.id);
      }
    });

    addPanel(panels, corners, getPanelFigureBounds(corners), edgeIds);
  });

  svgElement.querySelectorAll('path').forEach((path, elementIndex) => {
    parsePathSegments(path.getAttribute('d'), `path ${elementIndex + 1}`, edges, panels);
  });

  assignPanelBoundsFromClosedLoops(edges);
  logPanelDebug(panels);

  return {
    content: new XMLSerializer().serializeToString(svgElement),
    innerMarkup: svgElement.innerHTML,
    ...getCanvasMetrics(svgElement),
    edges,
    panels,
  };
};

const midpoint = (edge: SvgEdge): Point => ({
  x: (edge.start.x + edge.end.x) / 2,
  y: (edge.start.y + edge.end.y) / 2,
});

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

type PanelEdgeSide = 'top' | 'bottom' | 'left' | 'right';

export const getPanelEdgeSide = (
  edge: SvgEdge,
  panelBounds: SourceBounds | undefined,
): PanelEdgeSide | undefined => {
  if (!panelBounds) {
    return undefined;
  }

  const tolerance = 0.1;
  const edgeCenter = midpoint(edge);

  if (Math.abs(edgeCenter.y - panelBounds.minY) <= tolerance) {
    return 'top';
  }

  if (Math.abs(edgeCenter.y - panelBounds.maxY) <= tolerance) {
    return 'bottom';
  }

  if (Math.abs(edgeCenter.x - panelBounds.minX) <= tolerance) {
    return 'left';
  }

  if (Math.abs(edgeCenter.x - panelBounds.maxX) <= tolerance) {
    return 'right';
  }

  return undefined;
};

const inwardDirectionWarningEdgeIds = new Set<string>();

export const getInwardEdgeDirection = (
  edge: SvgEdge,
  panelBounds: SourceBounds | undefined,
): Point => {
  const side = getPanelEdgeSide(edge, panelBounds);

  if (side === 'top') {
    return { x: 0, y: 1 };
  }

  if (side === 'bottom') {
    return { x: 0, y: -1 };
  }

  if (side === 'left') {
    return { x: 1, y: 0 };
  }

  if (side === 'right') {
    return { x: -1, y: 0 };
  }

  if (!inwardDirectionWarningEdgeIds.has(edge.id)) {
    inwardDirectionWarningEdgeIds.add(edge.id);
    console.warn('Unable to detect panel edge side for inward direction.', {
      edgeId: edge.id,
      panelBounds,
    });
  }

  const tolerance = 0.1;
  const isHorizontal = Math.abs(edge.start.y - edge.end.y) <= tolerance;
  const isVertical = Math.abs(edge.start.x - edge.end.x) <= tolerance;

  if (isHorizontal || !isVertical) {
    return { x: 0, y: 1 };
  }

  return { x: 1, y: 0 };
};


export type EdgePreviewPath = {
  d: string;
  cutBaselineD: string;
  tabPreviewD: string;
  start: Point;
  end: Point;
  innerStart: Point;
  innerEnd: Point;
};

const pointToPathCommand = (command: 'M' | 'L', point: Point) => (
  `${command} ${point.x} ${point.y}`
);

const clampPointToBounds = (point: Point, bounds: SourceBounds | undefined): Point => {
  if (!bounds) {
    return point;
  }

  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  };
};

const interpolateEdgePoint = (edge: SvgEdge, distanceAlongEdge: number, edgeLength: number): Point => {
  if (edgeLength <= 0) {
    return edge.start;
  }

  const ratio = distanceAlongEdge / edgeLength;

  return {
    x: edge.start.x + (edge.end.x - edge.start.x) * ratio,
    y: edge.start.y + (edge.end.y - edge.start.y) * ratio,
  };
};

export const getEPreviewSegmentLengths = (originalEdgeLength: number, fingerWidthMm: number) => {
  const safeOriginalEdgeLength = Math.max(0, originalEdgeLength);
  const safeFingerWidth = Math.max(0, fingerWidthMm);

  if (safeOriginalEdgeLength === 0 || safeFingerWidth === 0 || safeOriginalEdgeLength < safeFingerWidth) {
    return [safeOriginalEdgeLength];
  }

  const segmentCount = Math.max(1, Math.floor(safeOriginalEdgeLength / safeFingerWidth));

  if (segmentCount === 1) {
    return [safeOriginalEdgeLength];
  }

  const remainingLength = safeOriginalEdgeLength - segmentCount * safeFingerWidth;
  const endSegmentLength = safeFingerWidth + remainingLength / 2;

  return Array.from({ length: segmentCount }, (_, index) => {
    if (index === 0 || index === segmentCount - 1) {
      return endSegmentLength;
    }

    return safeFingerWidth;
  });
};

export const getEPreviewSegmentDebug = (originalEdgeLength: number, fingerWidthMm: number) => {
  const segmentLengths = getEPreviewSegmentLengths(originalEdgeLength, fingerWidthMm);
  const middleSegmentLength = segmentLengths.length > 2 ? segmentLengths[1] : segmentLengths[0] ?? 0;

  return {
    originalEdgeLength: Math.max(0, originalEdgeLength),
    fingerWidthMm: Math.max(0, fingerWidthMm),
    segmentCount: segmentLengths.length,
    firstSegmentLength: segmentLengths[0] ?? 0,
    middleSegmentLength,
    lastSegmentLength: segmentLengths[segmentLengths.length - 1] ?? 0,
  };
};

export const getEPreviewInwardCutBaseline = (
  edge: SvgEdge,
  materialThicknessMm: number,
) => {
  const direction = getInwardEdgeDirection(edge, edge.panelBounds);
  const tabDepth = Math.max(0, materialThicknessMm);
  const offset = { x: direction.x * tabDepth, y: direction.y * tabDepth };
  const innerStart = clampPointToBounds({ x: edge.start.x + offset.x, y: edge.start.y + offset.y }, edge.panelBounds);
  const innerEnd = clampPointToBounds({ x: edge.end.x + offset.x, y: edge.end.y + offset.y }, edge.panelBounds);

  return {
    d: [pointToPathCommand('M', innerStart), pointToPathCommand('L', innerEnd)].join(' '),
    innerStart,
    innerEnd,
    offset,
  };
};

export const getEPreviewTabPath = (
  edge: SvgEdge,
  role: EdgeRole,
  materialThicknessMm: number,
  fingerWidthMm: number,
) => {
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const { offset } = getEPreviewInwardCutBaseline(edge, materialThicknessMm);
  const segmentLengths = getEPreviewSegmentLengths(edgeLength, fingerWidthMm);
  const commands: string[] = [];
  let distanceAlongEdge = 0;
  let isTabSegment = role === 'A';

  segmentLengths.forEach((segmentLength) => {
    const originalSegmentStart = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentStart = clampPointToBounds({
      x: originalSegmentStart.x + offset.x,
      y: originalSegmentStart.y + offset.y,
    }, edge.panelBounds);
    distanceAlongEdge = Math.min(edgeLength, distanceAlongEdge + segmentLength);
    const originalSegmentEnd = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentEnd = clampPointToBounds({
      x: originalSegmentEnd.x + offset.x,
      y: originalSegmentEnd.y + offset.y,
    }, edge.panelBounds);

    if (isTabSegment) {
      commands.push(pointToPathCommand('M', innerSegmentStart));
      commands.push(pointToPathCommand('L', originalSegmentStart));
      commands.push(pointToPathCommand('L', originalSegmentEnd));
      commands.push(pointToPathCommand('L', innerSegmentEnd));
    }

    isTabSegment = !isTabSegment;
  });

  return commands.join(' ');
};


export const getEReplacementEdgePath = (
  edge: SvgEdge,
  role: EdgeRole,
  materialThicknessMm: number,
  fingerWidthMm: number,
): string => {
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const direction = getInwardEdgeDirection(edge, edge.panelBounds);
  const tabDepth = Math.max(0, materialThicknessMm);
  const offset = { x: direction.x * tabDepth, y: direction.y * tabDepth };
  const segmentLengths = getEPreviewSegmentLengths(edgeLength, fingerWidthMm);
  const innerStart = { x: edge.start.x + offset.x, y: edge.start.y + offset.y };
  const innerEnd = { x: edge.end.x + offset.x, y: edge.end.y + offset.y };
  const points: Point[] = [role === 'A' ? edge.start : innerStart];
  let distanceAlongEdge = 0;
  let isTabSegment = role === 'A';

  const appendPoint = (point: Point) => {
    const previousPoint = points[points.length - 1];
    if (previousPoint && previousPoint.x === point.x && previousPoint.y === point.y) {
      return;
    }

    points.push(point);
  };

  segmentLengths.forEach((segmentLength) => {
    const originalSegmentStart = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentStart = {
      x: originalSegmentStart.x + offset.x,
      y: originalSegmentStart.y + offset.y,
    };

    distanceAlongEdge = Math.min(edgeLength, distanceAlongEdge + segmentLength);

    const originalSegmentEnd = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentEnd = {
      x: originalSegmentEnd.x + offset.x,
      y: originalSegmentEnd.y + offset.y,
    };
    const segmentStart = isTabSegment ? originalSegmentStart : innerSegmentStart;
    const segmentEnd = isTabSegment ? originalSegmentEnd : innerSegmentEnd;

    appendPoint(segmentStart);
    appendPoint(segmentEnd);

    isTabSegment = !isTabSegment;
  });

  appendPoint(role === 'A' ? edge.end : innerEnd);

  return points
    .map((point, index) => pointToPathCommand(index === 0 ? 'M' : 'L', point))
    .join(' ');
};

export const getEPreviewOutlinePoints = (
  edge: SvgEdge,
  role: EdgeRole,
  materialThicknessMm: number,
  fingerWidthMm: number,
): Point[] => {
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  const { offset } = getEPreviewInwardCutBaseline(edge, materialThicknessMm);
  const segmentLengths = getEPreviewSegmentLengths(edgeLength, fingerWidthMm);
  const points: Point[] = [];
  let distanceAlongEdge = 0;
  let isTabSegment = role === 'A';

  segmentLengths.forEach((segmentLength) => {
    const originalSegmentStart = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentStart = clampPointToBounds({
      x: originalSegmentStart.x + offset.x,
      y: originalSegmentStart.y + offset.y,
    }, edge.panelBounds);
    distanceAlongEdge = Math.min(edgeLength, distanceAlongEdge + segmentLength);
    const originalSegmentEnd = interpolateEdgePoint(edge, distanceAlongEdge, edgeLength);
    const innerSegmentEnd = clampPointToBounds({
      x: originalSegmentEnd.x + offset.x,
      y: originalSegmentEnd.y + offset.y,
    }, edge.panelBounds);

    points.push(isTabSegment ? originalSegmentStart : innerSegmentStart);
    points.push(isTabSegment ? originalSegmentEnd : innerSegmentEnd);
    isTabSegment = !isTabSegment;
  });

  return points;
};

export const getEPreviewSteppedPath = (
  edge: SvgEdge,
  role: EdgeRole,
  materialThicknessMm: number,
  fingerWidthMm: number,
): EdgePreviewPath => {
  const cutBaseline = getEPreviewInwardCutBaseline(edge, materialThicknessMm);
  const replacementPathD = getEReplacementEdgePath(edge, role, materialThicknessMm, fingerWidthMm);

  return {
    d: replacementPathD,
    cutBaselineD: cutBaseline.d,
    tabPreviewD: replacementPathD,
    start: edge.start,
    end: edge.end,
    innerStart: cutBaseline.innerStart,
    innerEnd: cutBaseline.innerEnd,
  };
};

const labelBoxesOverlap = (
  box: { x: number; y: number; width: number; height: number },
  otherBox: { x: number; y: number; width: number; height: number },
) => (
  Math.abs(box.x - otherBox.x) < (box.width + otherBox.width) / 2 + 2
  && Math.abs(box.y - otherBox.y) < (box.height + otherBox.height) / 2 + 2
);

const getEdgeLabelPlacementDirection = (edge: SvgEdge): Point => {
  const side = getPanelEdgeSide(edge, edge.panelBounds);

  if (side === 'top') {
    return { x: 0, y: 1 };
  }

  if (side === 'bottom') {
    return { x: 0, y: -1 };
  }

  if (side === 'left') {
    return { x: 1, y: 0 };
  }

  if (side === 'right') {
    return { x: -1, y: 0 };
  }

  const tolerance = 0.1;
  const isHorizontal = Math.abs(edge.end.y - edge.start.y) <= tolerance;
  const isVertical = Math.abs(edge.end.x - edge.start.x) <= tolerance;

  if (isHorizontal || !isVertical) {
    return { x: 0, y: 1 };
  }

  return { x: 1, y: 0 };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampLabelCenterToPanelBounds = (
  x: number,
  y: number,
  renderedWidth: number,
  renderedHeight: number,
  paddingX: number,
  paddingY: number,
  panelBounds: SourceBounds | undefined,
): Point => {
  if (!panelBounds) {
    return { x, y };
  }

  const minCenterX = panelBounds.minX + renderedWidth / 2 + paddingX;
  const maxCenterX = panelBounds.maxX - renderedWidth / 2 - paddingX;
  const minCenterY = panelBounds.minY + renderedHeight / 2 + paddingY;
  const maxCenterY = panelBounds.maxY - renderedHeight / 2 - paddingY;
  const fallbackX = clamp((panelBounds.minX + panelBounds.maxX) / 2, panelBounds.minX, panelBounds.maxX);
  const fallbackY = clamp((panelBounds.minY + panelBounds.maxY) / 2, panelBounds.minY, panelBounds.maxY);

  return {
    x: minCenterX <= maxCenterX ? clamp(x, minCenterX, maxCenterX) : fallbackX,
    y: minCenterY <= maxCenterY ? clamp(y, minCenterY, maxCenterY) : fallbackY,
  };
};

export const getEdgeLabelPlacements = (
  edges: SvgEdge[],
  edgeAssignments: Record<string, EdgeAssignment>,
  options: EdgeLabelPlacementOptions,
): EdgeLabelPlacement[] => {
  const labelScale = options.labelScale ?? 1;
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
    const direction = getEdgeLabelPlacementDirection(edge);
    const halfSizeAlongDirection = Math.abs(direction.x) > 0 ? renderedWidth / 2 : renderedHeight / 2;
    const baseDistance = options.edgeOffsetPx + halfSizeAlongDirection;
    const center = midpoint(edge);
    const stackStep = (Math.abs(direction.x) > 0 ? renderedWidth : renderedHeight) + 4 * labelScale;
    const paddingX = options.paddingXPx * labelScale;
    const paddingY = options.paddingYPx * labelScale;
    let x = center.x + direction.x * baseDistance;
    let y = center.y + direction.y * baseDistance;
    let clampedCenter = clampLabelCenterToPanelBounds(
      x,
      y,
      renderedWidth,
      renderedHeight,
      paddingX,
      paddingY,
      edge.panelBounds,
    );
    x = clampedCenter.x;
    y = clampedCenter.y;
    let renderedBox = { x, y, width: renderedWidth, height: renderedHeight };
    let stackIndex = 0;

    while (placedBoxes.some((box) => labelBoxesOverlap(renderedBox, box)) && stackIndex < 12) {
      stackIndex += 1;
      x = center.x + direction.x * (baseDistance + stackStep * stackIndex);
      y = center.y + direction.y * (baseDistance + stackStep * stackIndex);
      clampedCenter = clampLabelCenterToPanelBounds(
        x,
        y,
        renderedWidth,
        renderedHeight,
        paddingX,
        paddingY,
        edge.panelBounds,
      );
      x = clampedCenter.x;
      y = clampedCenter.y;
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
