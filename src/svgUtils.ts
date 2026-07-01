export type Point = {
  x: number;
  y: number;
};

export type SourceBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type AffineMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export const identityMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const parseMatrixTransform = (transform: string | null): AffineMatrix | undefined => {
  if (!transform) {
    return undefined;
  }

  const match = transform.trim().match(/^matrix\(([^)]*)\)$/i);

  if (!match) {
    return undefined;
  }

  const values = match[1]
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);

  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    return undefined;
  }

  const [a, b, c, d, e, f] = values;
  return { a, b, c, d, e, f };
};

export const multiplyAffineMatrices = (first: AffineMatrix, second: AffineMatrix): AffineMatrix => ({
  a: first.a * second.a + first.c * second.b,
  b: first.b * second.a + first.d * second.b,
  c: first.a * second.c + first.c * second.d,
  d: first.b * second.c + first.d * second.d,
  e: first.a * second.e + first.c * second.f + first.e,
  f: first.b * second.e + first.d * second.f + first.f,
});

export const applyAffineMatrixToPoint = (matrix: AffineMatrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

const getAccumulatedMatrixTransform = (element: Element, rootElement: SVGSVGElement): AffineMatrix => {
  const transforms: AffineMatrix[] = [];
  let current: Element | null = element;

  while (current && current !== rootElement) {
    const matrix = parseMatrixTransform(current.getAttribute('transform'));

    if (matrix) {
      transforms.unshift(matrix);
    }

    current = current.parentElement;
  }

  return transforms.reduce(multiplyAffineMatrices, identityMatrix);
};

export type SvgEdge = {
  id: string;
  source: string;
  start: Point;
  end: Point;
  panelBounds?: SourceBounds;
};

export type SvgPanel = {
  id: string;
  outerContour: Point[];
  innerContours: Point[][];
  outerEdgeIds: string[];
  innerEdgeIds: string[][];
  bounds: SourceBounds;
  parentPanelId?: string;
  /** @deprecated Compatibility alias for outerContour. */
  contour: Point[];
  /** @deprecated Compatibility alias for outerEdgeIds. */
  edgeIds: string[];
};

export type RawImportedContour = {
  source: string;
  contour: Point[];
  bounds?: SourceBounds;
  edgeIds: string[];
  metadata?: Record<string, unknown>;
};

export type ImportDiagnosticChainStatus = 'ClosedLoop' | 'OpenChain' | 'Branching' | 'IsolatedSegment' | 'SelfIntersecting' | 'Unknown';

export type TopologyNode = {
  id: string;
  point: Point;
  degree: number;
  connectedSegmentIds: string[];
  connectedNodeIds: string[];
};

export type TopologySegment = {
  id: string;
  sourceElementId: string;
  start: Point;
  end: Point;
  startNodeId: string;
  endNodeId: string;
  length: number;
};

export type TopologyChainClassification = ImportDiagnosticChainStatus;

export type TopologyChain = {
  id: string;
  componentId: string;
  segmentIds: string[];
  nodeIds: string[];
  totalLength: number;
  startNodeId: string;
  endNodeId: string;
  bounds?: SourceBounds;
  classification: TopologyChainClassification;
  gapDistance: number;
  branchCount: number;
  selfIntersectionCount: number;
};

export type TopologyComponent = {
  id: string;
  segmentIds: string[];
  nodeIds: string[];
  chainIds: string[];
};

export type TopologyGraph = {
  toleranceMm: number;
  segments: TopologySegment[];
  nodes: TopologyNode[];
  components: TopologyComponent[];
  chains: TopologyChain[];
};

export type ImportDiagnosticChain = {
  id: string;
  segmentCount: number;
  classification: ImportDiagnosticChainStatus;
  startNodeId: string;
  endNodeId: string;
  gapDistance: number;
  branchCount: number;
  bounds?: SourceBounds;
  sourceEdgeIds: string[];
  status: ImportDiagnosticChainStatus;
};

export type ImportDiagnostics = {
  toleranceMm: number;
  touchingLoopsFound: number;
  overlappingLoopsFound: number;
  closedContoursFound: number;
  looseEdgesFound: number;
  openChainsFound: number;
  endpointGaps: number[];
  possibleRepairCandidates: number;
  unrepairedOpenContours: number;
  closedLoopsFound: number;
  branchingChainsFound: number;
  isolatedSegmentsFound: number;
  selfIntersectionsFound: number;
  chains: ImportDiagnosticChain[];
  topology: TopologyGraph;
  topologyPanelsCreated: number;
};

export type RawImportedGeometry = {
  contours: RawImportedContour[];
  looseEdges: SvgEdge[];
  diagnostics?: ImportDiagnostics;
};

export type EdgeRole = 'A' | 'B';
export type SlotRole = 'A' | 'B';

export type EdgeAssignment = {
  connectionId: string;
  edgeRole?: EdgeRole;
  slotRole?: SlotRole;
};

export type EdgeAssignmentBucket = {
  edgeAssignment?: EdgeAssignment;
  slotAssignments?: EdgeAssignment[];
};

export type EdgeAssignmentRecord = Record<string, EdgeAssignment | EdgeAssignmentBucket>;

export const isEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): assignment is EdgeAssignmentBucket => (
  !!assignment && ('edgeAssignment' in assignment || 'slotAssignments' in assignment)
);

export const toEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): EdgeAssignmentBucket | undefined => {
  if (!assignment) {
    return undefined;
  }

  if (isEdgeAssignmentBucket(assignment)) {
    return assignment;
  }

  if (assignment.connectionId.startsWith('E')) {
    return { edgeAssignment: assignment };
  }

  if (assignment.connectionId.startsWith('S')) {
    return { slotAssignments: [assignment] };
  }

  return { edgeAssignment: assignment };
};

export const getBucketEdgeAssignment = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.edgeAssignment
);

export const getBucketSlotAssignments = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.slotAssignments ?? []
);

const getAssignmentDisplayLabel = (assignment: EdgeAssignment) => {
  if ((assignment.connectionId.startsWith('E') || assignment.connectionId.startsWith('W')) && assignment.edgeRole) {
    return `${assignment.connectionId}-${assignment.edgeRole === 'A' ? 'A' : 'B'}`;
  }

  if (assignment.connectionId.startsWith('S') && assignment.slotRole) {
    return `${assignment.connectionId}-${assignment.slotRole === 'A' ? 'A' : 'B'}`;
  }

  return assignment.connectionId;
};

export const getEdgeAssignmentDisplayLabels = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => {
  const bucket = toEdgeAssignmentBucket(assignment);

  if (!bucket) {
    return [];
  }

  return [bucket.edgeAssignment, ...(bucket.slotAssignments ?? [])]
    .filter((bucketAssignment): bucketAssignment is EdgeAssignment => !!bucketAssignment)
    .map(getAssignmentDisplayLabel);
};

export const getEdgeAssignmentDisplayLabel = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  getEdgeAssignmentDisplayLabels(assignment)[0]
);

export type SvgDocumentModel = {
  content: string;
  innerMarkup: string;
  rootAttributes: {
    width: string | null;
    height: string | null;
    viewBox: string | null;
  };
  viewBox: string;
  width: number;
  height: number;
  edges: SvgEdge[];
  panels: SvgPanel[];
  importDiagnostics?: ImportDiagnostics;
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
  formatDisplayLabel?: (label: string) => string;
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

export const IMPORT_REPAIR_CANDIDATE_TOLERANCE_MM = 0.1;

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

      const leftVertical = getMatchingVerticalSide(verticalEdges, minX, minY, maxY);
      const rightVertical = getMatchingVerticalSide(verticalEdges, maxX, minY, maxY, leftVertical?.edge);

      if (!leftVertical || !rightVertical) {
        return;
      }

      const topHorizontal = nearlyEqual(firstHorizontal.minY, minY) ? firstHorizontal : secondHorizontal;
      const bottomHorizontal = topHorizontal === firstHorizontal ? secondHorizontal : firstHorizontal;
      const panelBounds = getRectangleBounds(topHorizontal, bottomHorizontal, leftVertical, rightVertical);

      [topHorizontal, rightVertical, bottomHorizontal, leftVertical].forEach(({ edge }) => {
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



const addRawClosedContour = (
  rawGeometry: RawImportedGeometry,
  source: string,
  contour: Point[],
  bounds: SourceBounds | undefined,
  edgeIds: string[],
  metadata?: Record<string, unknown>,
) => {
  rawGeometry.contours.push({ source, contour, bounds, edgeIds, metadata });
};


const distanceBetweenPoints = (first: Point, second: Point): number => Math.hypot(first.x - second.x, first.y - second.y);

const pointsWithinEndpointTolerance = (first: Point, second: Point) => distanceBetweenPoints(first, second) <= IMPORT_REPAIR_CANDIDATE_TOLERANCE_MM;

const linesIntersect = (a: SvgEdge | TopologySegment, b: SvgEdge | TopologySegment): boolean => {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const between = (p: Point, q: Point, r: Point) => Math.min(p.x, r.x) - closedLoopTolerance <= q.x && q.x <= Math.max(p.x, r.x) + closedLoopTolerance
    && Math.min(p.y, r.y) - closedLoopTolerance <= q.y && q.y <= Math.max(p.y, r.y) + closedLoopTolerance;
  const d1 = cross(a.start, a.end, b.start);
  const d2 = cross(a.start, a.end, b.end);
  const d3 = cross(b.start, b.end, a.start);
  const d4 = cross(b.start, b.end, a.end);

  if (nearlyEqual(d1, 0) && between(a.start, b.start, a.end)) return true;
  if (nearlyEqual(d2, 0) && between(a.start, b.end, a.end)) return true;
  if (nearlyEqual(d3, 0) && between(b.start, a.start, b.end)) return true;
  if (nearlyEqual(d4, 0) && between(b.start, a.end, b.end)) return true;
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
};

export const buildTopologyGraph = (segments: SvgEdge[]): TopologyGraph => {
  const nodes: TopologyNode[] = [];
  const findOrCreateNode = (point: Point): TopologyNode => {
    const existing = nodes.find((node) => pointsWithinEndpointTolerance(node.point, point));
    if (existing) return existing;
    const node: TopologyNode = { id: `node-${nodes.length + 1}`, point, degree: 0, connectedSegmentIds: [], connectedNodeIds: [] };
    nodes.push(node);
    return node;
  };

  const topologySegments = segments.map((segment) => {
    const startNode = findOrCreateNode(segment.start);
    const endNode = findOrCreateNode(segment.end);
    const topologySegment: TopologySegment = {
      id: segment.id,
      sourceElementId: segment.source,
      start: segment.start,
      end: segment.end,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      length: distanceBetweenPoints(segment.start, segment.end),
    };
    startNode.connectedSegmentIds.push(segment.id);
    endNode.connectedSegmentIds.push(segment.id);
    startNode.connectedNodeIds.push(endNode.id);
    endNode.connectedNodeIds.push(startNode.id);
    return topologySegment;
  });

  nodes.forEach((node) => {
    node.connectedSegmentIds = [...new Set(node.connectedSegmentIds)];
    node.connectedNodeIds = [...new Set(node.connectedNodeIds.filter((nodeId) => nodeId !== node.id))];
    node.degree = node.connectedSegmentIds.length;
  });

  const segmentById = new Map(topologySegments.map((segment) => [segment.id, segment]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const components: TopologyComponent[] = [];
  const visitedSegments = new Set<string>();
  topologySegments.forEach((seed) => {
    if (visitedSegments.has(seed.id)) return;
    const segmentIds: string[] = [];
    const nodeIds = new Set<string>();
    const pending = [seed.id];
    visitedSegments.add(seed.id);
    while (pending.length) {
      const segment = segmentById.get(pending.pop() as string);
      if (!segment) continue;
      segmentIds.push(segment.id);
      [segment.startNodeId, segment.endNodeId].forEach((nodeId) => {
        nodeIds.add(nodeId);
        (nodeById.get(nodeId)?.connectedSegmentIds ?? []).forEach((nextId) => {
          if (!visitedSegments.has(nextId)) {
            visitedSegments.add(nextId);
            pending.push(nextId);
          }
        });
      });
    }
    components.push({ id: `component-${components.length + 1}`, segmentIds, nodeIds: [...nodeIds], chainIds: [] });
  });

  const chains: TopologyChain[] = [];
  components.forEach((component) => {
    const componentSegments = component.segmentIds.map((id) => segmentById.get(id)).filter((segment): segment is TopologySegment => Boolean(segment));
    const componentNodes = component.nodeIds.map((id) => nodeById.get(id)).filter((node): node is TopologyNode => Boolean(node));
    const branchCount = componentNodes.filter((node) => node.degree > 2).length;
    const degreeOneNodes = componentNodes.filter((node) => node.degree === 1);
    const orderedSegmentIds: string[] = [];
    const orderedNodeIds: string[] = [];
    const used = new Set<string>();
    let currentNodeId = (degreeOneNodes[0] ?? componentNodes[0])?.id ?? '';
    orderedNodeIds.push(currentNodeId);
    while (currentNodeId && used.size < componentSegments.length) {
      const nextSegmentId = (nodeById.get(currentNodeId)?.connectedSegmentIds ?? []).find((id) => component.segmentIds.includes(id) && !used.has(id));
      if (!nextSegmentId) break;
      const nextSegment = segmentById.get(nextSegmentId);
      if (!nextSegment) break;
      used.add(nextSegmentId);
      orderedSegmentIds.push(nextSegmentId);
      currentNodeId = nextSegment.startNodeId === currentNodeId ? nextSegment.endNodeId : nextSegment.startNodeId;
      orderedNodeIds.push(currentNodeId);
    }
    componentSegments.forEach((segment) => {
      if (!used.has(segment.id)) orderedSegmentIds.push(segment.id);
    });
    const points = componentSegments.flatMap((segment) => [segment.start, segment.end]);
    const startNodeId = orderedNodeIds[0] ?? component.nodeIds[0] ?? '';
    const endNodeId = orderedNodeIds.at(-1) ?? startNodeId;
    const startNode = nodeById.get(startNodeId);
    const endNode = nodeById.get(endNodeId);
    const selfIntersectionCount = componentSegments.reduce((count, first, firstIndex) => count + componentSegments.slice(firstIndex + 1).filter((second) => {
      const sharesNode = first.startNodeId === second.startNodeId || first.startNodeId === second.endNodeId || first.endNodeId === second.startNodeId || first.endNodeId === second.endNodeId;
      return !sharesNode && linesIntersect(first, second);
    }).length, 0);
    const gapDistance = startNode && endNode ? distanceBetweenPoints(startNode.point, endNode.point) : 0;
    let classification: TopologyChainClassification = 'Unknown';
    if (selfIntersectionCount > 0) classification = 'SelfIntersecting';
    else if (componentSegments.length === 1) classification = 'IsolatedSegment';
    else if (branchCount > 0) classification = 'Branching';
    else if (startNodeId === endNodeId || (startNode && endNode && pointsWithinEndpointTolerance(startNode.point, endNode.point))) classification = 'ClosedLoop';
    else if (degreeOneNodes.length === 2) classification = 'OpenChain';

    const chain: TopologyChain = {
      id: `chain-${chains.length + 1}`,
      componentId: component.id,
      segmentIds: orderedSegmentIds,
      nodeIds: orderedNodeIds,
      totalLength: componentSegments.reduce((total, segment) => total + segment.length, 0),
      startNodeId,
      endNodeId,
      bounds: getPointsBounds(points),
      classification,
      gapDistance,
      branchCount,
      selfIntersectionCount,
    };
    chains.push(chain);
    component.chainIds.push(chain.id);
  });

  return { toleranceMm: IMPORT_REPAIR_CANDIDATE_TOLERANCE_MM, segments: topologySegments, nodes, components, chains };
};

const buildImportDiagnostics = (rawGeometry: RawImportedGeometry, allEdges: SvgEdge[]): ImportDiagnostics => {
  const topology = buildTopologyGraph(allEdges);
  const chains = topology.chains.map((chain): ImportDiagnosticChain => ({
    id: chain.id,
    segmentCount: chain.segmentIds.length,
    classification: chain.classification,
    startNodeId: chain.startNodeId,
    endNodeId: chain.endNodeId,
    gapDistance: chain.gapDistance,
    branchCount: chain.branchCount,
    bounds: chain.bounds,
    sourceEdgeIds: chain.segmentIds,
    status: chain.classification,
  }));
  const openChains = chains.filter((chain) => chain.classification === 'OpenChain');

  return {
    toleranceMm: IMPORT_REPAIR_CANDIDATE_TOLERANCE_MM,
    closedContoursFound: chains.filter((chain) => chain.classification === 'ClosedLoop').length,
    looseEdgesFound: rawGeometry.looseEdges.length,
    openChainsFound: openChains.length,
    endpointGaps: openChains.map((chain) => chain.gapDistance),
    possibleRepairCandidates: 0,
    unrepairedOpenContours: openChains.length,
    closedLoopsFound: chains.filter((chain) => chain.classification === 'ClosedLoop').length,
    branchingChainsFound: chains.filter((chain) => chain.classification === 'Branching').length,
    isolatedSegmentsFound: chains.filter((chain) => chain.classification === 'IsolatedSegment').length,
    selfIntersectionsFound: chains.filter((chain) => chain.classification === 'SelfIntersecting').length,
    chains,
    topology,
    topologyPanelsCreated: 0,
    touchingLoopsFound: 0,
    overlappingLoopsFound: 0,
  };
};

export const formatImportDiagnosticMessage = (model: Pick<SvgDocumentModel, 'panels' | 'importDiagnostics'>): string => {
  const diagnostics = model.importDiagnostics;

  if (!diagnostics) {
    return 'Import complete. No topology diagnostics were produced. No repair has been performed.';
  }

  if (diagnostics.topologyPanelsCreated > 0) {
    return [
      'Import complete.',
      `Panels detected: ${model.panels.length}`,
      `Created from topology closed loops: ${diagnostics.topologyPanelsCreated}`,
      `Open chains: ${diagnostics.openChainsFound}`,
      `Branching: ${diagnostics.branchingChainsFound}`,
      'No repair has been performed.',
    ].join('\n');
  }

  return [
    'Import complete.',
    `Closed loops: ${diagnostics.closedLoopsFound}`,
    `Open chains: ${diagnostics.openChainsFound}`,
    `Branching: ${diagnostics.branchingChainsFound}`,
    `Isolated: ${diagnostics.isolatedSegmentsFound}`,
    `Self intersections: ${diagnostics.selfIntersectionsFound}`,
    'Repairable chains: 0',
    'No repair has been performed.',
  ].join('\n');
};

const repairRawImportedGeometry = (rawGeometry: RawImportedGeometry, edges: SvgEdge[]): RawImportedGeometry => ({
  contours: rawGeometry.contours,
  looseEdges: rawGeometry.looseEdges,
  diagnostics: buildImportDiagnostics(rawGeometry, edges),
});

const pointKeysMatch = (first: Point, second: Point): boolean => first.x === second.x && first.y === second.y;

const hasSameEdgeIds = (first: string[], second: string[]): boolean => {
  if (first.length !== second.length) {
    return false;
  }

  const firstSet = new Set(first);
  return second.every((edgeId) => firstSet.has(edgeId));
};

const buildContourFromTopologyClosedLoop = (chain: TopologyChain, topology: TopologyGraph): Point[] | undefined => {
  const segmentsById = new Map(topology.segments.map((segment) => [segment.id, segment]));
  const contour: Point[] = [];
  let currentNodeId = chain.startNodeId;

  for (const segmentId of chain.segmentIds) {
    const segment = segmentsById.get(segmentId);

    if (!segment) {
      return undefined;
    }

    const followsCurrentNode = segment.startNodeId === currentNodeId || segment.endNodeId === currentNodeId;
    const orientedStart = segment.startNodeId === currentNodeId ? segment.start : segment.end;
    const orientedEnd = segment.startNodeId === currentNodeId ? segment.end : segment.start;

    if (!followsCurrentNode || (contour.length > 0 && !pointKeysMatch(contour[contour.length - 1], orientedStart))) {
      return undefined;
    }

    if (contour.length === 0) {
      contour.push(orientedStart);
    }

    contour.push(orientedEnd);
    currentNodeId = segment.startNodeId === currentNodeId ? segment.endNodeId : segment.startNodeId;
  }

  if (contour.length < 4 || !pointKeysMatch(contour[0], contour[contour.length - 1])) {
    return undefined;
  }

  return contour.slice(0, -1);
};


type ClosedLoopClassification = 'PANEL' | 'HOLE';

type ClosedLoop = {
  id: string;
  contour: Point[];
  edgeIds: string[];
  bounds: SourceBounds;
  signedArea: number;
  parentLoopId?: string;
  classification: ClosedLoopClassification;
  diagnostics: string[];
};

const getSignedArea = (contour: Point[]): number => (
  contour.reduce((total, point, index) => {
    const next = contour[(index + 1) % contour.length];
    return total + (point.x * next.y - next.x * point.y);
  }, 0) / 2
);

const boundsContainBounds = (outer: SourceBounds, inner: SourceBounds): boolean => (
  inner.minX > outer.minX + closedLoopTolerance
  && inner.maxX < outer.maxX - closedLoopTolerance
  && inner.minY > outer.minY + closedLoopTolerance
  && inner.maxY < outer.maxY - closedLoopTolerance
);

const boundsOverlap = (first: SourceBounds, second: SourceBounds): boolean => !(
  first.maxX < second.minX - closedLoopTolerance
  || second.maxX < first.minX - closedLoopTolerance
  || first.maxY < second.minY - closedLoopTolerance
  || second.maxY < first.minY - closedLoopTolerance
);

const boundsTouch = (first: SourceBounds, second: SourceBounds): boolean => boundsOverlap(first, second) && !boundsContainBounds(first, second) && !boundsContainBounds(second, first) && (
  nearlyEqual(first.maxX, second.minX)
  || nearlyEqual(second.maxX, first.minX)
  || nearlyEqual(first.maxY, second.minY)
  || nearlyEqual(second.maxY, first.minY)
);

const pointInContour = (point: Point, contour: Point[]): boolean => {
  let inside = false;
  for (let index = 0, previousIndex = contour.length - 1; index < contour.length; previousIndex = index++) {
    const current = contour[index];
    const previous = contour[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const contourContainsContour = (outer: ClosedLoop, inner: ClosedLoop): boolean => (
  boundsContainBounds(outer.bounds, inner.bounds) && inner.contour.every((point) => pointInContour(point, outer.contour))
);

const getLoopDepth = (loop: ClosedLoop, loopById: Map<string, ClosedLoop>): number => {
  let depth = 0;
  let parentLoopId = loop.parentLoopId;
  while (parentLoopId) {
    depth += 1;
    parentLoopId = loopById.get(parentLoopId)?.parentLoopId;
  }
  return depth;
};

const createSvgPanel = (
  panels: SvgPanel[],
  contour: Point[],
  bounds: SourceBounds | undefined,
  edgeIds: string[],
  parentPanelId?: string,
): SvgPanel | undefined => {
  if (!bounds) {
    return undefined;
  }

  const panel = {
    id: `panel-${panels.length + 1}`,
    outerContour: contour,
    innerContours: [],
    outerEdgeIds: edgeIds,
    innerEdgeIds: [],
    bounds,
    ...(parentPanelId ? { parentPanelId } : {}),
    contour,
    edgeIds,
  };

  panels.push(panel);

  return panel;
};

const buildContainmentTree = (loops: ClosedLoop[], diagnostics?: ImportDiagnostics): ClosedLoop[] => {
  loops.forEach((loop) => {
    const containers = loops.filter((candidate) => candidate.id !== loop.id && contourContainsContour(candidate, loop));
    const parentLoop = containers.sort((first, second) => Math.abs(first.signedArea) - Math.abs(second.signedArea))[0];
    loop.parentLoopId = parentLoop?.id;
  });

  loops.forEach((loop, index) => {
    loops.slice(index + 1).forEach((other) => {
      if (!boundsOverlap(loop.bounds, other.bounds) || contourContainsContour(loop, other) || contourContainsContour(other, loop)) return;
      const message = boundsTouch(loop.bounds, other.bounds) ? 'Touching loop detected; no containment relationship was assigned.' : 'Overlapping loop detected; no containment relationship was assigned.';
      loop.diagnostics.push(message);
      other.diagnostics.push(message);
      if (diagnostics) {
        if (boundsTouch(loop.bounds, other.bounds)) diagnostics.touchingLoopsFound += 1;
        else diagnostics.overlappingLoopsFound += 1;
      }
    });
  });

  const loopById = new Map(loops.map((loop) => [loop.id, loop]));
  loops.forEach((loop) => {
    const depth = getLoopDepth(loop, loopById);
    loop.classification = depth % 2 === 0 ? 'PANEL' : 'HOLE';
  });

  return loops;
};

const buildPanelsFromClosedLoops = (loops: ClosedLoop[]): SvgPanel[] => {
  const panels: SvgPanel[] = [];
  const loopById = new Map(loops.map((loop) => [loop.id, loop]));
  const panelByLoopId = new Map<string, SvgPanel>();

  loops.forEach((loop) => {
    if (loop.classification !== 'PANEL') return;
    let parentLoopId = loop.parentLoopId;
    let parentPanelId: string | undefined;
    while (parentLoopId) {
      const parentLoop = loopById.get(parentLoopId);
      if (parentLoop?.classification === 'PANEL') {
        parentPanelId = panelByLoopId.get(parentLoop.id)?.id;
        break;
      }
      parentLoopId = parentLoop?.parentLoopId;
    }
    const panel = createSvgPanel(panels, loop.contour, loop.bounds, loop.edgeIds, parentPanelId);
    if (panel) panelByLoopId.set(loop.id, panel);
  });

  loops.forEach((loop) => {
    if (loop.classification !== 'HOLE') return;
    let parentLoopId = loop.parentLoopId;
    while (parentLoopId) {
      const parentLoop = loopById.get(parentLoopId);
      if (parentLoop?.classification === 'PANEL') {
        const panel = panelByLoopId.get(parentLoop.id);
        if (panel) {
          panel.innerContours.push(loop.contour);
          panel.innerEdgeIds.push(loop.edgeIds);
        }
        break;
      }
      parentLoopId = parentLoop?.parentLoopId;
    }
  });

  return panels;
};

const createSvgPanelsFromClosedContours = (rawGeometry: RawImportedGeometry): SvgPanel[] => {
  const loops: ClosedLoop[] = [];
  const addLoop = (contour: Point[], bounds: SourceBounds | undefined, edgeIds: string[]) => {
    if (!bounds) return;
    loops.push({
      id: `loop-${loops.length + 1}`,
      contour,
      edgeIds,
      bounds,
      signedArea: getSignedArea(contour),
      classification: 'PANEL',
      diagnostics: [],
    });
  };

  rawGeometry.contours.forEach((contour) => {
    addLoop(contour.contour, contour.bounds, contour.edgeIds);
  });

  const diagnostics = rawGeometry.diagnostics;
  const topology = diagnostics?.topology;
  if (diagnostics && topology) {
    const rawContourEdgeIds = rawGeometry.contours.map((contour) => contour.edgeIds);
    let topologyPanelsCreated = 0;

    topology.chains
      .filter((chain) => chain.classification === 'ClosedLoop')
      .forEach((chain) => {
        if (rawContourEdgeIds.some((edgeIds) => hasSameEdgeIds(edgeIds, chain.segmentIds))) {
          return;
        }

        const contour = buildContourFromTopologyClosedLoop(chain, topology);
        if (!contour) {
          return;
        }

        addLoop(contour, getPanelFigureBounds(contour), chain.segmentIds);
        topologyPanelsCreated += 1;
      });

    diagnostics.topologyPanelsCreated = topologyPanelsCreated;
  }

  return buildPanelsFromClosedLoops(buildContainmentTree(loops, diagnostics));
};

const parsePathSegments = (pathData: string | null, source: string, edges: SvgEdge[], rawGeometry: RawImportedGeometry) => {
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

    const addedEdges: SvgEdge[] = [];

    subpathEdges.forEach((edge) => {
      const addedEdge = addEdge(edges, source, edge.start, edge.end, panelBounds);

      if (addedEdge) {
        edgeIds.push(addedEdge.id);
        addedEdges.push(addedEdge);
      }
    });

    if (isSubpathClosed) {
      addRawClosedContour(rawGeometry, source, subpathContour, panelBounds, edgeIds, { sourceType: 'path' });
    } else {
      rawGeometry.looseEdges.push(...addedEdges);
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
  const rootAttributes = {
    width: svgElement.getAttribute('width'),
    height: svgElement.getAttribute('height'),
    viewBox: svgElement.getAttribute('viewBox'),
  };
  const edges: SvgEdge[] = [];
  const rawGeometry: RawImportedGeometry = { contours: [], looseEdges: [] };

  svgElement.querySelectorAll('line').forEach((line, elementIndex) => {
    const start = { x: svgNumber(line.getAttribute('x1')), y: svgNumber(line.getAttribute('y1')) };
    const end = { x: svgNumber(line.getAttribute('x2')), y: svgNumber(line.getAttribute('y2')) };
    const edge = addEdge(edges, `line ${elementIndex + 1}`, start, end);

    if (edge) {
      rawGeometry.looseEdges.push(edge);
    }
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
      addRawClosedContour(rawGeometry, source, points, panelBounds, edgeIds, { sourceType: isPolygon ? 'polygon' : 'polyline' });
    } else {
      rawGeometry.looseEdges.push(...edgeIds.map((edgeId) => edges.find((edge) => edge.id === edgeId)).filter((edge): edge is SvgEdge => Boolean(edge)));
    }
  });

  svgElement.querySelectorAll('rect').forEach((rect, elementIndex) => {
    const x = svgNumber(rect.getAttribute('x'));
    const y = svgNumber(rect.getAttribute('y'));
    const width = svgNumber(rect.getAttribute('width'));
    const height = svgNumber(rect.getAttribute('height'));
    const localCorners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    const transformMatrix = getAccumulatedMatrixTransform(rect, svgElement);
    const corners = localCorners.map((corner) => applyAffineMatrixToPoint(transformMatrix, corner));
    const panelBounds = getPanelFigureBounds(corners);

    const edgeIds: string[] = [];

    corners.forEach((corner, cornerIndex) => {
      const edge = addEdge(edges, `rect ${elementIndex + 1}`, corner, corners[(cornerIndex + 1) % corners.length], panelBounds);

      if (edge) {
        edgeIds.push(edge.id);
      }
    });

    addRawClosedContour(rawGeometry, `rect ${elementIndex + 1}`, corners, panelBounds, edgeIds, { sourceType: 'rect' });
  });

  svgElement.querySelectorAll('path').forEach((path, elementIndex) => {
    parsePathSegments(path.getAttribute('d'), `path ${elementIndex + 1}`, edges, rawGeometry);
  });

  const repairedGeometry = repairRawImportedGeometry(rawGeometry, edges);
  const panels = createSvgPanelsFromClosedContours(repairedGeometry);

  return {
    content: new XMLSerializer().serializeToString(svgElement),
    innerMarkup: svgElement.innerHTML,
    rootAttributes,
    ...getCanvasMetrics(svgElement),
    edges,
    panels,
    importDiagnostics: repairedGeometry.diagnostics,
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
  edgeAssignments: EdgeAssignmentRecord,
  options: EdgeLabelPlacementOptions,
): EdgeLabelPlacement[] => {
  const labelScale = options.labelScale ?? 1;
  const placedBoxes: { x: number; y: number; width: number; height: number }[] = [];

  return edges.flatMap((edge) => {
    const assignment = edgeAssignments[edge.id];
    const labels = getEdgeAssignmentDisplayLabels(assignment).map((displayLabel) => options.formatDisplayLabel?.(displayLabel) ?? displayLabel);

    if (labels.length === 0) {
      return [];
    }

    const label = labels.join('\n');
    const maxLabelLength = Math.max(...labels.map((displayLabel) => displayLabel.length));
    const width = maxLabelLength * options.fontSizePx * 0.68 + options.paddingXPx * 2;
    const height = labels.length * options.fontSizePx + options.paddingYPx * 2;
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

export const exportLabeledSvg = (svgContent: string, edgeAssignments: EdgeAssignmentRecord, edges: SvgEdge[]) => {
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
    const assignment = getBucketEdgeAssignment(edgeAssignments[edge.id]) ?? getBucketSlotAssignments(edgeAssignments[edge.id])[0];
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
