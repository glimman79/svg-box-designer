import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';
import { exportLabeledSvg, getEPreviewInwardCutBaseline, getEPreviewSegmentDebug, getEPreviewSegmentLengths, getEPreviewSteppedPath, getEPreviewTabPath, getEdgeAssignmentDisplayLabel, getEdgeLabelPlacements, getInwardEdgeDirection, getPanelEdgeSide, parseSvgDocument } from './svgUtils';
import type { EdgeAssignment, EdgePreviewPath, EdgeRole, Point, SourceBounds, SvgDocumentModel, SvgEdge } from './svgUtils';

type LabelPrefix = 'E' | 'S' | 'C' | 'P';

type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

type EdgeConnectionProperties = {
  materialThicknessMm: number;
  fingerWidthMm: number;
  isFingerWidthManual: boolean;
};

type SlotConnectionProperties = {
  slotOffsetMm: number;
  slotWidthMm: number;
  slotLengthMm: number;
  isSlotLengthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
};

type CornerConnectionProperties = {
  cornerDepthMm: number;
  isCornerDepthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
  cornerType: string;
};

type PatternConnectionProperties = {
  patternType: string;
  patternWidthMm: number;
  materialThicknessMm: number;
  lineSpacingMm: number;
  rowOffsetMm: number;
  marginMm: number;
};

type ConnectionPropertiesByPrefix = {
  E: EdgeConnectionProperties;
  S: SlotConnectionProperties;
  C: CornerConnectionProperties;
  P: PatternConnectionProperties;
};

type EdgeConnectionDefinition = {
  id: string;
  prefix: 'E';
  properties: EdgeConnectionProperties;
};

type SlotConnectionDefinition = {
  id: string;
  prefix: 'S';
  properties: SlotConnectionProperties;
};

type CornerConnectionDefinition = {
  id: string;
  prefix: 'C';
  properties: CornerConnectionProperties;
};

type PatternConnectionDefinition = {
  id: string;
  prefix: 'P';
  properties: PatternConnectionProperties;
};

type ConnectionDefinition =
  | EdgeConnectionDefinition
  | SlotConnectionDefinition
  | CornerConnectionDefinition
  | PatternConnectionDefinition;

type ConnectionMap = Record<string, ConnectionDefinition>;

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
};

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};
type CanvasViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
};

type OrderedEGenerationStageId = 'outer-cut' | 'outer-make-solid' | 'outer-tabs' | 'inner-cut' | 'inner-make-solid' | 'inner-tabs';

type OrderedEGenerationOperation = 'cut' | 'make-solid' | 'tabs';

type OrderedEGenerationStage = {
  id: OrderedEGenerationStageId;
  role: EdgeRole;
  operation: OrderedEGenerationOperation;
};

type FinalPanelPreviewPath = {
  panelKey: string;
  panelBounds: SourceBounds;
  d: string;
  stage: OrderedEGenerationStageId;
};

type AppliedEPanelPath = {
  panelKey: string;
  panelBounds: SourceBounds;
  d: string;
};

type AssignedEEdge = {
  edge: SvgEdge;
  assignment: EdgeAssignment;
  connection: EdgeConnectionDefinition;
};

type OrderedEPreviewEdges = {
  outerEdges: AssignedEEdge[];
  innerEdges: AssignedEEdge[];
  stages: OrderedEGenerationStage[];
};

type PanelSide = NonNullable<ReturnType<typeof getPanelEdgeSide>>;

const panelSideOrder: PanelSide[] = ['top', 'right', 'bottom', 'left'];

const pointsToClosedPathD = (points: Point[]) => {
  if (points.length === 0) {
    return '';
  }

  const [firstPoint, ...remainingPoints] = points;
  const commands = [`M ${firstPoint.x} ${firstPoint.y}`];
  remainingPoints.forEach((point) => commands.push(`L ${point.x} ${point.y}`));
  commands.push('Z');

  return commands.join(' ');
};

const orderedEGenerationStages: OrderedEGenerationStage[] = [
  { id: 'outer-cut', role: 'outer', operation: 'cut' },
  { id: 'outer-make-solid', role: 'outer', operation: 'make-solid' },
  { id: 'outer-tabs', role: 'outer', operation: 'tabs' },
  { id: 'inner-cut', role: 'inner', operation: 'cut' },
  { id: 'inner-make-solid', role: 'inner', operation: 'make-solid' },
  { id: 'inner-tabs', role: 'inner', operation: 'tabs' },
];

const getPanelKey = (panelBounds: SourceBounds) => (
  [panelBounds.minX, panelBounds.maxX, panelBounds.minY, panelBounds.maxY].map(formatNumber).join('|')
);

const getClockwisePanelEdge = (panelBounds: SourceBounds, side: PanelSide): SvgEdge => {
  const sidePoints: Record<PanelSide, { start: Point; end: Point }> = {
    top: {
      start: { x: panelBounds.minX, y: panelBounds.minY },
      end: { x: panelBounds.maxX, y: panelBounds.minY },
    },
    right: {
      start: { x: panelBounds.maxX, y: panelBounds.minY },
      end: { x: panelBounds.maxX, y: panelBounds.maxY },
    },
    bottom: {
      start: { x: panelBounds.maxX, y: panelBounds.maxY },
      end: { x: panelBounds.minX, y: panelBounds.maxY },
    },
    left: {
      start: { x: panelBounds.minX, y: panelBounds.maxY },
      end: { x: panelBounds.minX, y: panelBounds.minY },
    },
  };

  return {
    id: `panel-${getPanelKey(panelBounds)}-${side}`,
    source: 'final panel outline preview',
    panelBounds,
    ...sidePoints[side],
  };
};

const getOrderedEPreviewEdges = (
  edges: SvgEdge[],
  assignments: Record<string, EdgeAssignment>,
  connectionMap: ConnectionMap,
): OrderedEPreviewEdges => {
  const outerEdges: AssignedEEdge[] = [];
  const innerEdges: AssignedEEdge[] = [];

  edges.forEach((edge) => {
    const assignment = assignments[edge.id];
    const connection = assignment ? connectionMap[assignment.connectionId] : undefined;

    if (!assignment || connection?.prefix !== 'E') {
      return;
    }

    const orderedEdge = { edge, assignment, connection };

    if (assignment.edgeRole === 'inner') {
      innerEdges.push(orderedEdge);
      return;
    }

    outerEdges.push(orderedEdge);
  });

  return { outerEdges, innerEdges, stages: orderedEGenerationStages };
};

const getEdgesForGenerationRole = (orderedEdges: OrderedEPreviewEdges, role: EdgeRole) => (
  role === 'outer' ? orderedEdges.outerEdges : orderedEdges.innerEdges
);

const getAssignedEdgesByPanelSide = (edges: AssignedEEdge[]) => {
  const edgesByPanelSide = new Map<string, AssignedEEdge>();

  edges.forEach((assignedEdge) => {
    const { edge } = assignedEdge;

    if (!edge.panelBounds) {
      return;
    }

    const side = getPanelEdgeSide(edge, edge.panelBounds);

    if (!side) {
      return;
    }

    edgesByPanelSide.set(`${getPanelKey(edge.panelBounds)}|${side}`, assignedEdge);
  });

  return edgesByPanelSide;
};

const getAffectedPanels = (edges: AssignedEEdge[]) => {
  const panelsByKey = new Map<string, SourceBounds>();

  edges.forEach(({ edge }) => {
    if (edge.panelBounds) {
      panelsByKey.set(getPanelKey(edge.panelBounds), edge.panelBounds);
    }
  });

  return [...panelsByKey.entries()];
};

const buildMakeSolidPanelPath = (panelBounds: SourceBounds, edgesByPanelSide: Map<string, AssignedEEdge>) => {
  const outlinePoints: Point[] = [];

  panelSideOrder.forEach((side) => {
    const assignedEdge = edgesByPanelSide.get(`${getPanelKey(panelBounds)}|${side}`);
    const clockwiseEdge = getClockwisePanelEdge(panelBounds, side);

    if (assignedEdge) {
      const cutBaseline = getEPreviewInwardCutBaseline(
        clockwiseEdge,
        assignedEdge.connection.properties.materialThicknessMm,
      );
      outlinePoints.push(cutBaseline.innerStart, cutBaseline.innerEnd);
      return;
    }

    outlinePoints.push(clockwiseEdge.start, clockwiseEdge.end);
  });

  return pointsToClosedPathD(outlinePoints);
};

const buildFinalPanelPreviewPaths = (orderedEdges: OrderedEPreviewEdges) => {
  const skippedEdgeIds = new Set<string>();
  const finalPanelPreviewPaths: FinalPanelPreviewPath[] = [];

  const appendCutPreviewPath = (stage: OrderedEGenerationStage, edges: AssignedEEdge[]) => {
    const cutBaselineCommands: string[] = [];

    edges.forEach(({ edge, connection }) => {
      if (!edge.panelBounds) {
        skippedEdgeIds.add(edge.id);
        return;
      }

      const side = getPanelEdgeSide(edge, edge.panelBounds);

      if (!side) {
        skippedEdgeIds.add(edge.id);
        return;
      }

      const clockwiseEdge = getClockwisePanelEdge(edge.panelBounds, side);
      cutBaselineCommands.push(getEPreviewInwardCutBaseline(
        clockwiseEdge,
        connection.properties.materialThicknessMm,
      ).d);
    });

    if (cutBaselineCommands.length > 0) {
      finalPanelPreviewPaths.push({
        panelKey: stage.id,
        panelBounds: edges[0].edge.panelBounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        d: cutBaselineCommands.join(' '),
        stage: stage.id,
      });
    }
  };

  const appendMakeSolidPreviewPaths = (stage: OrderedEGenerationStage, edges: AssignedEEdge[]) => {
    const edgesByPanelSide = getAssignedEdgesByPanelSide(edges);

    getAffectedPanels(edges).forEach(([panelKey, panelBounds]) => {
      finalPanelPreviewPaths.push({
        panelKey: `${stage.id}-${panelKey}`,
        panelBounds,
        d: buildMakeSolidPanelPath(panelBounds, edgesByPanelSide),
        stage: stage.id,
      });
    });
  };

  const appendTabsPreviewPath = (stage: OrderedEGenerationStage, edges: AssignedEEdge[]) => {
    const tabCommands: string[] = [];

    edges.forEach(({ edge, assignment, connection }) => {
      if (!edge.panelBounds) {
        skippedEdgeIds.add(edge.id);
        return;
      }

      const side = getPanelEdgeSide(edge, edge.panelBounds);

      if (!side) {
        skippedEdgeIds.add(edge.id);
        return;
      }

      tabCommands.push(getEPreviewTabPath(
        edge,
        assignment.edgeRole ?? stage.role,
        connection.properties.materialThicknessMm,
        connection.properties.fingerWidthMm,
      ));
    });

    if (tabCommands.length > 0) {
      finalPanelPreviewPaths.push({
        panelKey: stage.id,
        panelBounds: edges[0].edge.panelBounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        d: tabCommands.join(' '),
        stage: stage.id,
      });
    }
  };

  orderedEdges.stages.forEach((stage) => {
    const edges = getEdgesForGenerationRole(orderedEdges, stage.role);

    if (stage.operation === 'cut') {
      appendCutPreviewPath(stage, edges);
      return;
    }

    if (stage.operation === 'make-solid') {
      appendMakeSolidPreviewPaths(stage, edges);
      return;
    }

    appendTabsPreviewPath(stage, edges);
  });

  if (skippedEdgeIds.size > 0) {
    console.warn('Skipped assigned E edges without panel bounds or a detected panel side.', { edgeIds: [...skippedEdgeIds] });
  }

  return finalPanelPreviewPaths;
};

const getPanelBoundaryEdge = (panelBounds: SourceBounds, side: PanelSide): SvgEdge => {
  const sidePoints: Record<PanelSide, { start: Point; end: Point }> = {
    top: {
      start: { x: panelBounds.minX, y: panelBounds.minY },
      end: { x: panelBounds.maxX, y: panelBounds.minY },
    },
    right: {
      start: { x: panelBounds.maxX, y: panelBounds.minY },
      end: { x: panelBounds.maxX, y: panelBounds.maxY },
    },
    bottom: {
      start: { x: panelBounds.maxX, y: panelBounds.maxY },
      end: { x: panelBounds.minX, y: panelBounds.maxY },
    },
    left: {
      start: { x: panelBounds.minX, y: panelBounds.maxY },
      end: { x: panelBounds.minX, y: panelBounds.minY },
    },
  };

  return {
    id: `panel-${getPanelKey(panelBounds)}-${side}-applied`,
    source: 'applied panel edge',
    panelBounds,
    ...sidePoints[side],
  };
};

const getInsetShortenedPanelEdge = (
  panelBounds: SourceBounds,
  side: PanelSide,
  materialThicknessMm: number,
): SvgEdge => {
  const t = Math.max(0, materialThicknessMm);
  const sidePoints: Record<PanelSide, { start: Point; end: Point }> = {
    top: {
      start: { x: panelBounds.minX + t, y: panelBounds.minY + t },
      end: { x: panelBounds.maxX - t, y: panelBounds.minY + t },
    },
    right: {
      start: { x: panelBounds.maxX - t, y: panelBounds.minY + t },
      end: { x: panelBounds.maxX - t, y: panelBounds.maxY - t },
    },
    bottom: {
      start: { x: panelBounds.maxX - t, y: panelBounds.maxY - t },
      end: { x: panelBounds.minX + t, y: panelBounds.maxY - t },
    },
    left: {
      start: { x: panelBounds.minX + t, y: panelBounds.maxY - t },
      end: { x: panelBounds.minX + t, y: panelBounds.minY + t },
    },
  };

  return {
    id: `panel-${getPanelKey(panelBounds)}-${side}-applied-inset-shortened`,
    source: 'applied inset shortened panel edge',
    panelBounds,
    ...sidePoints[side],
  };
};

const getPointAlongEdge = (edge: SvgEdge, distanceAlongEdge: number, edgeLength: number): Point => {
  if (edgeLength <= 0) {
    return edge.start;
  }

  const progress = distanceAlongEdge / edgeLength;

  return {
    x: edge.start.x + (edge.end.x - edge.start.x) * progress,
    y: edge.start.y + (edge.end.y - edge.start.y) * progress,
  };
};

const pointsMatch = (point: Point, otherPoint: Point) => (
  Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) <= 0.000001
);

const appendPathPoint = (points: Point[], point: Point) => {
  const previousPoint = points[points.length - 1];

  if (!previousPoint || !pointsMatch(previousPoint, point)) {
    points.push(point);
  }
};

const getAppliedEEdgeOutlinePoints = (
  outerEdge: SvgEdge,
  insetShortenedEdge: SvgEdge,
  role: EdgeRole,
  materialThicknessMm: number,
  fingerWidthMm: number,
) => {
  const outerEdgeLength = Math.hypot(outerEdge.end.x - outerEdge.start.x, outerEdge.end.y - outerEdge.start.y);

  if (outerEdgeLength <= 0) {
    return [];
  }

  const insetDistance = Math.max(0, materialThicknessMm);
  const shortenedStartDistance = insetDistance;
  const shortenedEndDistance = outerEdgeLength - insetDistance;
  const segmentLengths = getEPreviewSegmentLengths(outerEdgeLength, fingerWidthMm);
  const points: Point[] = [];
  let distanceAlongEdge = 0;
  let isTabSegment = role === 'outer';

  appendPathPoint(points, insetShortenedEdge.start);

  segmentLengths.forEach((segmentLength) => {
    const segmentStartDistance = distanceAlongEdge;
    distanceAlongEdge = Math.min(outerEdgeLength, distanceAlongEdge + segmentLength);
    const segmentEndDistance = distanceAlongEdge;
    const clippedStartDistance = Math.max(shortenedStartDistance, segmentStartDistance);
    const clippedEndDistance = Math.min(shortenedEndDistance, segmentEndDistance);

    if (clippedEndDistance > clippedStartDistance) {
      const insetSegmentStart = getPointAlongEdge(
        insetShortenedEdge,
        clippedStartDistance - shortenedStartDistance,
        shortenedEndDistance - shortenedStartDistance,
      );
      const insetSegmentEnd = getPointAlongEdge(
        insetShortenedEdge,
        clippedEndDistance - shortenedStartDistance,
        shortenedEndDistance - shortenedStartDistance,
      );

      if (isTabSegment) {
        appendPathPoint(points, insetSegmentStart);
        appendPathPoint(points, getPointAlongEdge(outerEdge, clippedStartDistance, outerEdgeLength));
        appendPathPoint(points, getPointAlongEdge(outerEdge, clippedEndDistance, outerEdgeLength));
      }

      appendPathPoint(points, insetSegmentEnd);
    }

    isTabSegment = !isTabSegment;
  });

  appendPathPoint(points, insetShortenedEdge.end);

  return points;
};

const getCornerGapDistance = (points: Point[], nextPoints: Point[]) => {
  const endPoint = points[points.length - 1];
  const nextStartPoint = nextPoints[0];

  if (!endPoint || !nextStartPoint) {
    return 0;
  }

  return Math.hypot(endPoint.x - nextStartPoint.x, endPoint.y - nextStartPoint.y);
};

const buildAppliedEPanelPaths = (orderedEdges: OrderedEPreviewEdges): AppliedEPanelPath[] => {
  const skippedEdgeIds = new Set<string>();
  const assignedEdgesByPanelSide = new Map<string, AssignedEEdge>();
  const affectedPanels = new Map<string, SourceBounds>();

  [...orderedEdges.outerEdges, ...orderedEdges.innerEdges].forEach((assignedEdge) => {
    const { edge } = assignedEdge;

    if (!edge.panelBounds) {
      skippedEdgeIds.add(edge.id);
      return;
    }

    const side = getPanelEdgeSide(edge, edge.panelBounds);

    if (!side) {
      skippedEdgeIds.add(edge.id);
      return;
    }

    const panelKey = getPanelKey(edge.panelBounds);
    affectedPanels.set(panelKey, edge.panelBounds);
    assignedEdgesByPanelSide.set(`${panelKey}|${side}`, assignedEdge);
  });

  const appliedPanelPaths = [...affectedPanels.entries()].flatMap(([panelKey, panelBounds]) => {
    const panelSidePoints = panelSideOrder.map((side) => {
      const outerBoundaryEdge = getPanelBoundaryEdge(panelBounds, side);
      const assignedEdge = assignedEdgesByPanelSide.get(`${panelKey}|${side}`);

      if (!assignedEdge) {
        return { side, points: [outerBoundaryEdge.start, outerBoundaryEdge.end] };
      }

      const insetShortenedEdge = getInsetShortenedPanelEdge(
        panelBounds,
        side,
        assignedEdge.connection.properties.materialThicknessMm,
      );

      return {
        side,
        points: getAppliedEEdgeOutlinePoints(
          outerBoundaryEdge,
          insetShortenedEdge,
          assignedEdge.assignment.edgeRole ?? 'outer',
          assignedEdge.connection.properties.materialThicknessMm,
          assignedEdge.connection.properties.fingerWidthMm,
        ),
      };
    });

    panelSidePoints.forEach(({ side, points }, index) => {
      const nextSidePoints = panelSidePoints[(index + 1) % panelSidePoints.length];
      const cornerGapDistance = getCornerGapDistance(points, nextSidePoints.points);

      if (cornerGapDistance > 0.01) {
        console.warn('Applied E panel corner gap is greater than 0.01.', {
          panelKey,
          side,
          nextSide: nextSidePoints.side,
          cornerGapDistance,
        });
      }
    });

    const panelPoints: Point[] = [];
    panelSidePoints.forEach(({ points }) => {
      points.forEach((point) => appendPathPoint(panelPoints, point));
    });

    if (panelPoints.length === 0) {
      console.warn('Skipped E panel apply because the inset panel edge paths could not be generated.', { panelKey, panelBounds });
      return [];
    }

    return [{ panelKey, panelBounds, d: pointsToClosedPathD(panelPoints) }];
  });

  if (skippedEdgeIds.size > 0) {
    console.warn('Skipped assigned E edges during apply because they lacked panel bounds or a detected panel side.', { edgeIds: [...skippedEdgeIds] });
  }

  return appliedPanelPaths;
};

const labelGroups: LabelGroup[] = [
  { prefix: 'E', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern connections', description: 'Reusable pattern connection IDs' },
];

const defaultConnectionProperties: ConnectionPropertiesByPrefix = {
  E: {
    materialThicknessMm: 3,
    fingerWidthMm: 9,
    isFingerWidthManual: false,
  },
  S: {
    slotOffsetMm: 0,
    slotWidthMm: getDefaultSlotWidth(3),
    slotLengthMm: getDefaultSlotLength(3),
    isSlotLengthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
  },
  C: {
    cornerDepthMm: getDefaultCornerDepth(3),
    isCornerDepthManual: false,
    materialThicknessMm: 3,
    kerfMm: 0.15,
    playMm: 0,
    cornerType: 'finger',
  },
  P: {
    patternType: 'line-fill',
    patternWidthMm: 20,
    materialThicknessMm: 3,
    lineSpacingMm: 5,
    rowOffsetMm: 0,
    marginMm: 2,
  },
};

const starterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
  <rect x="70" y="45" width="280" height="170" rx="0" fill="none" stroke="#000000" stroke-width="1"/>
  <line x1="70" y1="130" x2="350" y2="130" stroke="#000000" stroke-width="1"/>
</svg>`;

const getLabelPrefix = (label: string) => label.charAt(0) as LabelPrefix;

const getNextLabel = (prefix: LabelPrefix, labels: string[]) => {
  const usedNumbers = labels
    .filter((label) => getLabelPrefix(label) === prefix)
    .map((label) => Number.parseInt(label.slice(1), 10))
    .filter((value) => Number.isFinite(value));

  return `${prefix}${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};

const getFollowingEdgeLabel = (label: string) => {
  const labelNumber = Number.parseInt(label.slice(1), 10);

  if (getLabelPrefix(label) !== 'E' || !Number.isFinite(labelNumber)) {
    return null;
  }

  return `E${labelNumber + 1}`;
};

const minZoom = 0.1;
const maxZoom = 20;
const buttonZoomFactor = 1.25;
const wheelZoomSensitivity = 0.0015;
const labelFontSizePx = 18;
const minLabelFontSizePx = 12;
const labelPaddingXPx = 7;
const labelPaddingYPx = 4;
const labelEdgeOffsetPx = 10;

const parseViewBox = (viewBox: string): CanvasViewBox => {
  const [x, y, width, height] = viewBox.split(/[\s,]+/).map(Number);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 600,
  };
};

const formatViewBox = ({ x, y, width, height }: CanvasViewBox) => `${x} ${y} ${width} ${height}`;

const formatNumber = (value: number) => Number.isInteger(value) ? value.toString() : Number(value.toFixed(3)).toString();

const formatPoint = (point: { x: number; y: number }) => `${formatNumber(point.x)} / ${formatNumber(point.y)}`;

const formatPanelBounds = (panelBounds: SvgDocumentModel['edges'][number]['panelBounds']) => {
  if (!panelBounds) {
    return 'unknown';
  }

  return [panelBounds.minX, panelBounds.maxX, panelBounds.minY, panelBounds.maxY].map(formatNumber).join(' / ');
};

const zoomViewBox = (
  viewBox: CanvasViewBox,
  factor: number,
  center: { x: number; y: number },
  originalViewBox: CanvasViewBox,
): CanvasViewBox => {
  const currentZoom = originalViewBox.width / viewBox.width;
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom * factor));
  const clampedFactor = nextZoom / currentZoom;
  const nextWidth = viewBox.width / clampedFactor;
  const nextHeight = viewBox.height / clampedFactor;
  const centerXRatio = (center.x - viewBox.x) / viewBox.width;
  const centerYRatio = (center.y - viewBox.y) / viewBox.height;

  return {
    x: center.x - nextWidth * centerXRatio,
    y: center.y - nextHeight * centerYRatio,
    width: nextWidth,
    height: nextHeight,
  };
};
function getDefaultSlotLength(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

function getDefaultSlotWidth(materialThicknessMm: number) {
  return materialThicknessMm;
}

function getDefaultCornerDepth(materialThicknessMm: number) {
  return materialThicknessMm * 3;
}

const getAssignedConnectionId = (assignment: EdgeAssignment | undefined) => assignment?.connectionId;

const getDefaultEdgeRole = (assignments: Record<string, EdgeAssignment>, connectionId: string): EdgeRole => {
  const assignedRoles = Object.values(assignments)
    .filter((assignment) => assignment.connectionId === connectionId)
    .map((assignment) => assignment.edgeRole);
  const hasOuter = assignedRoles.includes('outer');
  const hasInner = assignedRoles.includes('inner');

  if (hasOuter && !hasInner) {
    return 'inner';
  }

  return 'outer';
};

const formatEdgeRoleLabel = (role: EdgeRole | undefined) => {
  if (role === 'outer') {
    return 'Outer';
  }

  if (role === 'inner') {
    return 'Inner';
  }

  return 'No role';
};

const formatCalculatedMm = (value: number) => `${Number(value.toFixed(2)).toString()} mm`;
const cloneDefaultProperties = <P extends LabelPrefix>(prefix: P): ConnectionPropertiesByPrefix[P] => ({
  ...defaultConnectionProperties[prefix],
});

const createConnectionDefinition = (id: string, prefix: LabelPrefix): ConnectionDefinition => {
  if (prefix === 'E') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'S') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'C') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  return { id, prefix, properties: cloneDefaultProperties(prefix) };
};

const NumericField = ({ id, label, value, min, step = 0.1, onChange }: NumericFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <input
      id={id}
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(event) => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)}
    />
  </label>
);

const SelectField = ({ id, label, value, options, onChange }: SelectFieldProps) => (
  <label className="property-field" htmlFor={id}>
    <span>{label}</span>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option === 'outer' ? 'Outer' : option === 'inner' ? 'Inner' : option}
        </option>
      ))}
    </select>
  </label>
);

function App() {
  const [svgModel, setSvgModel] = useState<SvgDocumentModel>(() => parseSvgDocument(starterSvg));
  const [edgeAssignments, setEdgeAssignments] = useState<Record<string, EdgeAssignment>>({});
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isEPreviewVisible, setIsEPreviewVisible] = useState(false);
  const [appliedEPanelPaths, setAppliedEPanelPaths] = useState<AppliedEPanelPath[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const suppressEdgeClickRef = useRef(false);
  const [canvasViewBox, setCanvasViewBox] = useState<CanvasViewBox>(() => parseViewBox(svgModel.viewBox));
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);

  const availableLabels = useMemo(() => Object.keys(connections), [connections]);
  const selectedConnection = selectedLabelId ? connections[selectedLabelId] ?? null : null;
  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const labelCounts = useMemo(() => {
    return availableLabels.reduce<Record<string, number>>((counts, label) => {
      counts[label] = Object.values(edgeAssignments).filter((assignment) => assignment.connectionId === label).length;
      return counts;
    }, {});
  }, [availableLabels, edgeAssignments]);

  const labelsByGroup = useMemo(() => {
    return labelGroups.map((group) => ({
      ...group,
      labels: availableLabels.filter((label) => getLabelPrefix(label) === group.prefix),
    }));
  }, [availableLabels]);

  const hasAssignedEEdges = useMemo(() => {
    return Object.values(edgeAssignments).some((assignment) => assignment.connectionId.startsWith('E'));
  }, [edgeAssignments]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsedSvg = parseSvgDocument(text);
    setSvgModel(parsedSvg);
    setCanvasViewBox(parseViewBox(parsedSvg.viewBox));
    setEdgeAssignments({});
    setSelectedEdgeId(null);
    setIsEPreviewVisible(false);
    setAppliedEPanelPaths([]);
    setErrorMessage('');
    event.target.value = '';
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => {
    handleImport(event).catch((error: Error) => {
      setErrorMessage(error.message);
    });
  };

  const createLabel = (prefix: LabelPrefix) => {
    const nextLabel = getNextLabel(prefix, availableLabels);
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextLabel]: createConnectionDefinition(nextLabel, prefix),
    }));
    setSelectedLabelId(nextLabel);
    setErrorMessage('');
  };

  const clearEdgeLabel = (edgeId: string) => {
    setEdgeAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      delete nextAssignments[edgeId];
      return nextAssignments;
    });
    setErrorMessage('');
  };

  const assignSelectedLabelToEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);

    if (!selectedLabelId) {
      setErrorMessage('Create and select a connection before clicking an edge.');
      return;
    }

    const connection = connections[selectedLabelId];
    if (!connection) {
      setErrorMessage('Select a valid connection before clicking an edge.');
      return;
    }

    const nextAssignments = {
      ...edgeAssignments,
      [edgeId]: {
        connectionId: selectedLabelId,
        ...(connection.prefix === 'E' ? { edgeRole: getDefaultEdgeRole(edgeAssignments, selectedLabelId) } : {}),
      },
    };
    setEdgeAssignments(nextAssignments);


    const selectedLabelAssignmentCount = Object.values(nextAssignments)
      .filter((assignment) => assignment.connectionId === selectedLabelId).length;
    const nextEdgeLabel = selectedLabelAssignmentCount === 2 ? getFollowingEdgeLabel(selectedLabelId) : null;

    if (connection.prefix === 'E' && nextEdgeLabel) {
      setConnections((currentConnections) => {
        if (currentConnections[nextEdgeLabel]) {
          return currentConnections;
        }

        return {
          ...currentConnections,
          [nextEdgeLabel]: createConnectionDefinition(nextEdgeLabel, 'E'),
        };
      });
      setSelectedLabelId(nextEdgeLabel);
    }

    setErrorMessage('');
  };

  const updateAssignedEdgeRole = (edgeId: string, edgeRole: EdgeRole) => {
    setEdgeAssignments((currentAssignments) => {
      const assignment = currentAssignments[edgeId];
      const connection = assignment ? connections[assignment.connectionId] : undefined;

      if (!assignment || connection?.prefix !== 'E') {
        return currentAssignments;
      }

      return {
        ...currentAssignments,
        [edgeId]: {
          ...assignment,
          edgeRole,
        },
      };
    });
    setErrorMessage('');
  };

  const clearSelectedLabel = () => {
    if (!selectedEdgeId) {
      return;
    }

    clearEdgeLabel(selectedEdgeId);
  };

  const applyEPreview = () => {
    const nextAppliedEPanelPaths = buildAppliedEPanelPaths(orderedEPreviewEdges);
    setAppliedEPanelPaths(nextAppliedEPanelPaths);
    setIsEPreviewVisible(false);
    setErrorMessage('');
  };

  const updateEdgeProperties = (updates: Partial<EdgeConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'E') {
      return;
    }

    const nextProperties: EdgeConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined && !selectedConnection.properties.isFingerWidthManual) {
      nextProperties.fingerWidthMm = updates.materialThicknessMm * 3;
    }

    if (updates.fingerWidthMm !== undefined) {
      nextProperties.isFingerWidthManual = true;
    }

    const nextConnection: EdgeConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updateSlotProperties = (updates: Partial<SlotConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'S') {
      return;
    }

    const nextProperties: SlotConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined) {
      nextProperties.slotWidthMm = getDefaultSlotWidth(updates.materialThicknessMm);

      if (!selectedConnection.properties.isSlotLengthManual) {
        nextProperties.slotLengthMm = getDefaultSlotLength(updates.materialThicknessMm);
      }
    }

    if (updates.slotLengthMm !== undefined) {
      nextProperties.isSlotLengthManual = true;
    }

    const nextConnection: SlotConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updateCornerProperties = (updates: Partial<CornerConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'C') {
      return;
    }

    const nextProperties: CornerConnectionProperties = {
      ...selectedConnection.properties,
      ...updates,
    };

    if (updates.materialThicknessMm !== undefined && !selectedConnection.properties.isCornerDepthManual) {
      nextProperties.cornerDepthMm = getDefaultCornerDepth(updates.materialThicknessMm);
    }

    if (updates.cornerDepthMm !== undefined) {
      nextProperties.isCornerDepthManual = true;
    }

    const nextConnection: CornerConnectionDefinition = {
      ...selectedConnection,
      properties: nextProperties,
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const updatePatternProperties = (updates: Partial<PatternConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'P') {
      return;
    }

    const nextConnection: PatternConnectionDefinition = {
      ...selectedConnection,
      properties: { ...selectedConnection.properties, ...updates },
    };
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const exportSvg = () => {
    const output = exportLabeledSvg(svgModel.content, edgeAssignments, svgModel.edges);
    const blob = new Blob([output], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = 'svg-box-designer-labeled.svg';
      downloadRef.current.click();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getSvgPointFromClient = (clientX: number, clientY: number) => {
    const svgElement = svgRef.current;
    const screenMatrix = svgElement?.getScreenCTM();

    if (!svgElement || !screenMatrix) {
      return {
        x: canvasViewBox.x + canvasViewBox.width / 2,
        y: canvasViewBox.y + canvasViewBox.height / 2,
      };
    }

    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    return point.matrixTransform(screenMatrix.inverse());
  };

  const zoomCanvas = (factor: number, center = {
    x: canvasViewBox.x + canvasViewBox.width / 2,
    y: canvasViewBox.y + canvasViewBox.height / 2,
  }) => {
    const originalViewBox = parseViewBox(svgModel.viewBox);
    setCanvasViewBox((currentViewBox) => zoomViewBox(currentViewBox, factor, center, originalViewBox));
  };

  const resetCanvasView = () => {
    setCanvasViewBox(parseViewBox(svgModel.viewBox));
  };

  const handleCanvasWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const center = getSvgPointFromClient(event.clientX, event.clientY);
    zoomCanvas(Math.exp(-event.deltaY * wheelZoomSensitivity), center);
  };

  const handleCanvasPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
    suppressEdgeClickRef.current = false;
    setIsCanvasPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current;
    const screenMatrix = svgRef.current?.getScreenCTM();

    if (!panState || panState.pointerId !== event.pointerId || !screenMatrix) {
      return;
    }

    const totalDx = event.clientX - panState.startClientX;
    const totalDy = event.clientY - panState.startClientY;
    const dx = event.clientX - panState.lastClientX;
    const dy = event.clientY - panState.lastClientY;
    const scaleX = Math.hypot(screenMatrix.a, screenMatrix.b);
    const scaleY = Math.hypot(screenMatrix.c, screenMatrix.d);

    if (Math.hypot(totalDx, totalDy) > 3) {
      panState.moved = true;
    }

    panState.lastClientX = event.clientX;
    panState.lastClientY = event.clientY;

    if (scaleX === 0 || scaleY === 0) {
      return;
    }

    setCanvasViewBox((currentViewBox) => ({
      ...currentViewBox,
      x: currentViewBox.x - dx / scaleX,
      y: currentViewBox.y - dy / scaleY,
    }));
  };

  const handleCanvasPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current;

    if (panState?.pointerId === event.pointerId) {
      suppressEdgeClickRef.current = panState.moved;
      panStateRef.current = null;
      setIsCanvasPanning(false);
      window.setTimeout(() => {
        suppressEdgeClickRef.current = false;
      }, 0);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCanvasPointerLeave = (event: PointerEvent<SVGSVGElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsCanvasPanning(false);
    }
  };

  const renderPropertiesPanel = () => {
    if (!selectedConnection) {
      return <p className="muted">Select E1, S1, C1, or P1 to edit its saved connection properties.</p>;
    }

    if (selectedConnection.prefix === 'E') {
      const properties = selectedConnection.properties;
      const assignedEEdges = svgModel.edges.filter((edge) => edgeAssignments[edge.id]?.connectionId === selectedConnection.id);
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="edge-assigned-edges">
            <h4 id="edge-assigned-edges">Assigned edges</h4>
            {assignedEEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedEEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.id}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{edge.source}</dd>
                      </div>
                      <div>
                        <dt>Edge length</dt>
                        <dd>{formatCalculatedMm(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y))}</dd>
                      </div>
                      <div>
                        <dt>Current role</dt>
                        <dd>{formatEdgeRoleLabel(edgeAssignments[edge.id]?.edgeRole)}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-edge-role`}
                      label="Role"
                      value={edgeAssignments[edge.id]?.edgeRole ?? 'outer'}
                      options={['outer', 'inner']}
                      onChange={(edgeRole) => updateAssignedEdgeRole(edge.id, edgeRole as EdgeRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this E label yet. Select this label, then click edges in the drawing.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="edge-basic-properties">
            <h4 id="edge-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="edge-finger-width" label="Tab size (mm)" min={0} value={properties.fingerWidthMm} onChange={(fingerWidthMm) => updateEdgeProperties({ fingerWidthMm })} />
              <NumericField id="edge-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateEdgeProperties({ materialThicknessMm })} />
            </div>
          </section>

        </div>
      );
    }

    if (selectedConnection.prefix === 'S') {
      const properties = selectedConnection.properties;

      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="slot-basic-properties">
            <h4 id="slot-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="slot-offset" label="Slot offset from edge (mm)" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
              <NumericField id="slot-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateSlotProperties({ materialThicknessMm })} />
              <NumericField id="slot-length" label="Slot length (mm)" min={0} value={properties.slotLengthMm} onChange={(slotLengthMm) => updateSlotProperties({ slotLengthMm })} />
            </div>
          </section>

          <section className="property-section" aria-labelledby="slot-advanced-properties">
            <h4 id="slot-advanced-properties">Advanced</h4>
            <div className="property-grid">
              <NumericField id="slot-kerf" label="Kerf (mm)" min={0} value={properties.kerfMm} onChange={(kerfMm) => updateSlotProperties({ kerfMm })} />
              <NumericField id="slot-play" label="Play (mm)" min={0} value={properties.playMm} onChange={(playMm) => updateSlotProperties({ playMm })} />
            </div>
          </section>
        </div>
      );
    }

    if (selectedConnection.prefix === 'C') {
      const properties = selectedConnection.properties;
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="corner-basic-properties">
            <h4 id="corner-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="corner-depth" label="Corner depth (mm)" min={0} value={properties.cornerDepthMm} onChange={(cornerDepthMm) => updateCornerProperties({ cornerDepthMm })} />
              <NumericField id="corner-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateCornerProperties({ materialThicknessMm })} />
            </div>
          </section>

          <section className="property-section" aria-labelledby="corner-advanced-properties">
            <h4 id="corner-advanced-properties">Advanced</h4>
            <div className="property-grid">
              <NumericField id="corner-kerf" label="Kerf (mm)" min={0} value={properties.kerfMm} onChange={(kerfMm) => updateCornerProperties({ kerfMm })} />
              <NumericField id="corner-play" label="Play (mm)" min={0} value={properties.playMm} onChange={(playMm) => updateCornerProperties({ playMm })} />
              <SelectField id="corner-type" label="Corner type" value={properties.cornerType} options={['finger', 'miter', 'butt', 'rounded']} onChange={(cornerType) => updateCornerProperties({ cornerType })} />
            </div>
          </section>
        </div>
      );
    }

    const properties = selectedConnection.properties;
    return (
      <div className="property-sections">
        <section className="property-section" aria-labelledby="pattern-basic-properties">
          <h4 id="pattern-basic-properties">Basic</h4>
          <div className="property-grid">
            <SelectField id="pattern-type" label="Pattern type" value={properties.patternType} options={['line-fill', 'dash', 'perforation', 'hatch']} onChange={(patternType) => updatePatternProperties({ patternType })} />
            <NumericField id="pattern-width" label="Pattern width (mm)" min={0} value={properties.patternWidthMm} onChange={(patternWidthMm) => updatePatternProperties({ patternWidthMm })} />
            <NumericField id="pattern-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updatePatternProperties({ materialThicknessMm })} />
          </div>
        </section>

        <section className="property-section" aria-labelledby="pattern-advanced-properties">
          <h4 id="pattern-advanced-properties">Advanced</h4>
          <div className="property-grid">
            <NumericField id="pattern-line-spacing" label="Line spacing (mm)" min={0} value={properties.lineSpacingMm} onChange={(lineSpacingMm) => updatePatternProperties({ lineSpacingMm })} />
            <NumericField id="pattern-row-offset" label="Row offset (mm)" value={properties.rowOffsetMm} onChange={(rowOffsetMm) => updatePatternProperties({ rowOffsetMm })} />
            <NumericField id="pattern-margin" label="Margin (mm)" min={0} value={properties.marginMm} onChange={(marginMm) => updatePatternProperties({ marginMm })} />
          </div>
        </section>
      </div>
    );
  };

  const baseViewBox = parseViewBox(svgModel.viewBox);
  const labelZoom = Math.max(minZoom, baseViewBox.width / canvasViewBox.width);
  const labelScreenFontSize = Math.max(minLabelFontSizePx, labelFontSizePx);
  const labelScale = labelScreenFontSize / labelZoom / labelFontSizePx;
  const labelEdgeOffset = labelEdgeOffsetPx / labelZoom;
  const labelPlacements = getEdgeLabelPlacements(svgModel.edges, edgeAssignments, {
    fontSizePx: labelFontSizePx,
    paddingXPx: labelPaddingXPx,
    paddingYPx: labelPaddingYPx,
    edgeOffsetPx: labelEdgeOffset,
    labelScale,
  });
  const labelPlacementsByEdgeId = new Map(labelPlacements.map((placement) => [placement.edgeId, placement]));
  const orderedEPreviewEdges = useMemo(() => (
    getOrderedEPreviewEdges(svgModel.edges, edgeAssignments, connections)
  ), [connections, edgeAssignments, svgModel.edges]);
  const currentEPreviewPathsByEdgeId = useMemo(() => new Map(
    [...orderedEPreviewEdges.outerEdges, ...orderedEPreviewEdges.innerEdges].map(({ edge, assignment, connection }) => [
      edge.id,
      getEPreviewSteppedPath(edge, assignment.edgeRole ?? 'outer', connection.properties.materialThicknessMm, connection.properties.fingerWidthMm),
    ] as const),
  ), [orderedEPreviewEdges]);

  const ePreviewPathsByEdgeId = isEPreviewVisible ? currentEPreviewPathsByEdgeId : new Map<string, EdgePreviewPath>();
  const finalPanelPreviewPaths = useMemo(() => (
    isEPreviewVisible ? buildFinalPanelPreviewPaths(orderedEPreviewEdges) : []
  ), [isEPreviewVisible, orderedEPreviewEdges]);
  const appliedEPanelKeys = useMemo(() => new Set(
    appliedEPanelPaths.map((panelPath) => panelPath.panelKey),
  ), [appliedEPanelPaths]);
  const appliedEPanelMasks = useMemo(() => (
    appliedEPanelPaths.filter((panelPath) => appliedEPanelKeys.has(panelPath.panelKey))
  ), [appliedEPanelKeys, appliedEPanelPaths]);

  const ePreviewDebugRows = useMemo(() => {
    if (!isEPreviewVisible) {
      return [];
    }

    return svgModel.edges.flatMap((edge) => {
      const assignment = edgeAssignments[edge.id];
      const connection = assignment ? connections[assignment.connectionId] : undefined;
      const previewPath = ePreviewPathsByEdgeId.get(edge.id);

      if (!assignment || connection?.prefix !== 'E' || !previewPath) {
        return [];
      }

      const originalEdgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
      const segmentDebug = getEPreviewSegmentDebug(originalEdgeLength, connection.properties.fingerWidthMm);

      return [{
        edgeId: edge.id,
        label: getEdgeAssignmentDisplayLabel(assignment),
        start: edge.start,
        end: edge.end,
        panelBounds: edge.panelBounds,
        detectedSide: getPanelEdgeSide(edge, edge.panelBounds),
        direction: getInwardEdgeDirection(edge, edge.panelBounds),
        materialThicknessMm: connection.properties.materialThicknessMm,
        previewStart: previewPath.innerStart,
        previewEnd: previewPath.innerEnd,
        ...segmentDebug,
      }];
    });
  }, [connections, ePreviewPathsByEdgeId, edgeAssignments, isEPreviewVisible, svgModel.edges]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Reusable connection definitions</p>
          <h1>SVG Box Designer</h1>
          <p>
            Import your own SVG design, then define reusable edge labels for its existing straight edges.
          </p>
        </div>
        <div className="hero-actions">
          <label className="button primary">
            Import SVG
            <input type="file" accept=".svg,image/svg+xml" onChange={handleImportWithError} />
          </label>
          <button className="button" type="button" onClick={exportSvg} disabled={Object.keys(edgeAssignments).length === 0}>
            Export SVG
          </button>
          <a ref={downloadRef} className="visually-hidden" aria-hidden="true">
            download
          </a>
        </div>
      </header>

      {errorMessage && <div className="notice">{errorMessage}</div>}

      <section className="workspace" aria-label="SVG connection workspace">
        <aside className="panel">
          <h2>Connection manager</h2>
          <p className="muted">
            Create a connection, select it, tune its parameters, then click edges from your custom SVG. This app assigns and exports labels without generating or replacing SVG geometry.
          </p>

          <div className="active-label-card" aria-live="polite">
            <span>Selected connection</span>
            <strong>{selectedLabelId ?? 'None'}</strong>
          </div>

          <div className="label-manager">
            {labelsByGroup.map(({ prefix, name, description, labels: groupLabels }) => (
              <section className="label-group" key={prefix} aria-label={name}>
                <div className="label-group-header">
                  <div>
                    <h3>{prefix} = {name}</h3>
                    <p>{description}</p>
                  </div>
                  <button type="button" onClick={() => createLabel(prefix)}>
                    Add {getNextLabel(prefix, availableLabels)}
                  </button>
                </div>

                {groupLabels.length > 0 ? (
                  <ul className="label-list">
                    {groupLabels.map((label) => (
                      <li key={label}>
                        <button
                          type="button"
                          className={selectedLabelId === label ? 'selected-label' : ''}
                          onClick={() => {
                            setSelectedLabelId(label);
                            setErrorMessage('');
                          }}
                        >
                          <strong>{label}</strong>
                          <span>{labelCounts[label] ?? 0} {(labelCounts[label] ?? 0) === 1 ? 'edge' : 'edges'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-labels">No {prefix} connections yet.</p>
                )}
              </section>
            ))}
          </div>

          <div className="properties-card">
            <div>
              <p className="eyebrow">Properties</p>
              <h3>{selectedConnection ? `${selectedConnection.id} parameters` : 'No connection selected'}</h3>
            </div>
            {renderPropertiesPanel()}
          </div>

          <div className="selection-card">
            <h3>Selection</h3>
            {selectedEdge ? (
              <dl>
                <dt>Edge</dt>
                <dd>{selectedEdge.id}</dd>
                <dt>Source</dt>
                <dd>{selectedEdge.source}</dd>
                <dt>Connection</dt>
                <dd>{getAssignedConnectionId(edgeAssignments[selectedEdge.id]) ?? 'Unassigned'}</dd>
              </dl>
            ) : (
              <p className="muted">No edge selected.</p>
            )}
            <button type="button" onClick={clearSelectedLabel} disabled={!selectedEdgeId || !edgeAssignments[selectedEdgeId]}>
              Clear selected edge label
            </button>
          </div>

        </aside>

        <section className="canvas-card">
          <div className="canvas-toolbar">
            <div>
              <h2>Drawing</h2>
              <p>{svgModel.edges.length} selectable straight edges detected.</p>
            </div>
            <div className="view-controls" aria-label="Drawing view controls">
              <button type="button" onClick={() => zoomCanvas(buttonZoomFactor)}>Zoom in</button>
              <button type="button" onClick={() => zoomCanvas(1 / buttonZoomFactor)}>Zoom out</button>
              <button type="button" onClick={resetCanvasView}>Reset view</button>
              <button type="button" onClick={resetCanvasView}>Fit to screen</button>
              <button type="button" onClick={() => setIsEPreviewVisible(true)} disabled={!hasAssignedEEdges}>Preview</button>
              <button type="button" onClick={applyEPreview} disabled={!hasAssignedEEdges}>Apply</button>
              <button type="button" onClick={() => setIsEPreviewVisible(false)} disabled={!isEPreviewVisible}>Clear Preview</button>
            </div>
          </div>

          <div className="canvas-frame">
            <svg
              ref={svgRef}
              className={`design-svg${isCanvasPanning ? ' is-panning' : ''}`}
              viewBox={formatViewBox(canvasViewBox)}
              role="img"
              aria-label="Imported SVG with selectable edges"
              onWheel={handleCanvasWheel}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerLeave}
            >
              <g className="drawing-layer" dangerouslySetInnerHTML={{ __html: svgModel.innerMarkup }} />
              <g className="applied-e-panel-layer">
                {appliedEPanelMasks.map((panelPath) => (
                  <rect
                    key={`${panelPath.panelKey}-mask`}
                    className="applied-e-panel-mask"
                    x={panelPath.panelBounds.minX - 0.5}
                    y={panelPath.panelBounds.minY - 0.5}
                    width={panelPath.panelBounds.maxX - panelPath.panelBounds.minX + 1}
                    height={panelPath.panelBounds.maxY - panelPath.panelBounds.minY + 1}
                  />
                ))}
                {appliedEPanelPaths.map((panelPath) => (
                  <path
                    key={panelPath.panelKey}
                    className="applied-e-panel-path"
                    d={panelPath.d}
                  />
                ))}
              </g>
              <g className="final-panel-preview-layer">
                {finalPanelPreviewPaths.map((panelPath) => (
                  <path
                    key={panelPath.panelKey}
                    className={panelPath.stage.endsWith('make-solid') ? 'final-panel-preview-path' : panelPath.stage.endsWith('cut') ? 'edge-preview-cut-baseline' : 'edge-preview-tabs'}
                    d={panelPath.d}
                  />
                ))}
              </g>
              <g className="edge-overlays">
                  {svgModel.edges.map((edge) => {
                  const assignment = edgeAssignments[edge.id];
                  const label = getEdgeAssignmentDisplayLabel(assignment);
                  const selected = selectedEdgeId === edge.id;
                  const labelPlacement = labelPlacementsByEdgeId.get(edge.id);
                  const labelWidth = labelPlacement?.width ?? 0;
                  const labelHeight = labelPlacement?.height ?? 0;

                  return (
                    <g key={edge.id}>
                      {(label || selected) && (
                        <line
                          className={`edge-highlight${label ? ' labeled' : ''}${selected ? ' selected' : ''}`}
                          x1={edge.start.x}
                          y1={edge.start.y}
                          x2={edge.end.x}
                          y2={edge.end.y}
                        />
                      )}
                      <line
                        className="edge-hitbox"
                        x1={edge.start.x}
                        y1={edge.start.y}
                        x2={edge.end.x}
                        y2={edge.end.y}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressEdgeClickRef.current) {
                            event.preventDefault();
                            return;
                          }
                          assignSelectedLabelToEdge(edge.id);
                        }}
                      />
                      {label && labelPlacement && (
                        <g
                          className="edge-label"
                          transform={`translate(${labelPlacement.x} ${labelPlacement.y}) scale(${labelScale})`}
                        >
                          <rect
                            className="edge-label-background"
                            x={-labelWidth / 2}
                            y={-labelHeight / 2}
                            width={labelWidth}
                            height={labelHeight}
                            rx={5}
                          />
                          <text
                            className="edge-label-text"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                  })}
                </g>
            </svg>
          </div>

          {isEPreviewVisible && (
            <div className="e-preview-debug-panel" aria-label="E preview debug values">
              <h3>E preview debug</h3>
              {ePreviewDebugRows.length > 0 ? (
                <div className="e-preview-debug-table-wrap">
                  <table className="e-preview-debug-table">
                    <thead>
                      <tr>
                        <th>label</th>
                        <th>edgeId</th>
                        <th>start x/y</th>
                        <th>end x/y</th>
                        <th>panelBounds minX/maxX/minY/maxY</th>
                        <th>detectedSide</th>
                        <th>direction x/y</th>
                        <th>materialThicknessMm</th>
                        <th>original edge length</th>
                        <th>fingerWidthMm</th>
                        <th>segment count</th>
                        <th>first segment length</th>
                        <th>middle segment length</th>
                        <th>last segment length</th>
                        <th>preview start x/y</th>
                        <th>preview end x/y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ePreviewDebugRows.map((row) => (
                        <tr key={row.edgeId}>
                          <td>{row.label}</td>
                          <td>{row.edgeId}</td>
                          <td>{formatPoint(row.start)}</td>
                          <td>{formatPoint(row.end)}</td>
                          <td>{formatPanelBounds(row.panelBounds)}</td>
                          <td>{row.detectedSide ?? 'unknown'}</td>
                          <td>{formatPoint(row.direction)}</td>
                          <td>{formatNumber(row.materialThicknessMm)}</td>
                          <td>{formatNumber(row.originalEdgeLength)}</td>
                          <td>{formatNumber(row.fingerWidthMm)}</td>
                          <td>{row.segmentCount}</td>
                          <td>{formatNumber(row.firstSegmentLength)}</td>
                          <td>{formatNumber(row.middleSegmentLength)}</td>
                          <td>{formatNumber(row.lastSegmentLength)}</td>
                          <td>{formatPoint(row.previewStart)}</td>
                          <td>{formatPoint(row.previewEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No assigned E edges to preview.</p>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
