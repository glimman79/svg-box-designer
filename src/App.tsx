import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';
import { exportLabeledSvg, getEPreviewSegmentDebug, getEdgeAssignmentDisplayLabel, getEdgeLabelPlacements, getInwardEdgeDirection, getPanelEdgeSide, parseSvgDocument } from './svgUtils';
import type { EdgeAssignment, EdgeRole, Point, SourceBounds, SvgDocumentModel, SvgEdge, SvgPanel } from './svgUtils';

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

type AppliedEPanelPath = {
  panelId: string;
  eraseRect: SourceBounds;
  erasePathD: string;
  pathD: string;
  edgeIds: string[];
};

type PanelPoint = Point;

type PanelContour = PanelPoint[];

type ContourSide = {
  start: Point;
  end: Point;
};

type ContourSideOffsetPlan = {
  sideIndex: number;
  edgeId: string;
  offsetDistance: number;
};

type PanelEdgeOperation = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole;
  materialThicknessMm: number;
  fingerWidthMm: number;
};

type TabSegment = {
  startDistance: number;
  endDistance: number;
};

type TabSegmentPlan = {
  connectionId: string;
  insetLength: number;
  segments: TabSegment[];
};

type PanelTabOperation = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole;
  materialThicknessMm: number;
  fingerWidthMm: number;
  reversed: boolean;
  insetLength: number;
  segments: TabSegment[];
};

type PanelGeometryBuildResult =
  | { ok: true; contour: PanelContour }
  | { ok: false; reason: string };

type PanelValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const cornerTouchTolerance = 0.01;

const getContourEdgePoints = (panel: SvgPanel, contourIndex: number) => ({
  start: panel.contour[contourIndex],
  end: panel.contour[(contourIndex + 1) % panel.contour.length],
});

const pointsMatch = (first: Point, second: Point) => (
  Math.abs(first.x - second.x) <= cornerTouchTolerance
  && Math.abs(first.y - second.y) <= cornerTouchTolerance
);

const edgeMatchesContourSide = (edge: SvgEdge, start: Point, end: Point) => {
  const normalMatch = pointsMatch(edge.start, start) && pointsMatch(edge.end, end);
  const reversedMatch = pointsMatch(edge.start, end) && pointsMatch(edge.end, start);

  return {
    matches: normalMatch || reversedMatch,
    reversedMatch,
  };
};

const pointsToClosedPathD = (points: Point[]) => (
  `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')} Z`
);

const clonePanelContour = (panel: SvgPanel): PanelContour => (
  panel.contour.map((point) => ({ x: point.x, y: point.y }))
);

const getContourSignedArea = (contour: PanelContour) => (
  contour.reduce((area, point, index) => {
    const nextPoint = contour[(index + 1) % contour.length];
    return area + ((point.x * nextPoint.y) - (nextPoint.x * point.y));
  }, 0) / 2
);

const buildContourSides = (contour: PanelContour): ContourSide[] => (
  contour.map((point, index) => ({
    start: { x: point.x, y: point.y },
    end: {
      x: contour[(index + 1) % contour.length].x,
      y: contour[(index + 1) % contour.length].y,
    },
  }))
);

const offsetContourSide = (side: ContourSide, offsetDistance: number): ContourSide | null => {
  const sideLength = Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y);

  if (sideLength <= cornerTouchTolerance) {
    return null;
  }

  const offsetX = (-(side.end.y - side.start.y) / sideLength) * offsetDistance;
  const offsetY = ((side.end.x - side.start.x) / sideLength) * offsetDistance;

  return {
    start: {
      x: side.start.x + offsetX,
      y: side.start.y + offsetY,
    },
    end: {
      x: side.end.x + offsetX,
      y: side.end.y + offsetY,
    },
  };
};

const lineIntersection = (firstSide: ContourSide, secondSide: ContourSide): Point | null => {
  const firstDx = firstSide.end.x - firstSide.start.x;
  const firstDy = firstSide.end.y - firstSide.start.y;
  const secondDx = secondSide.end.x - secondSide.start.x;
  const secondDy = secondSide.end.y - secondSide.start.y;
  const denominator = (firstDx * secondDy) - (firstDy * secondDx);

  if (Math.abs(denominator) <= cornerTouchTolerance) {
    return null;
  }

  const startDx = secondSide.start.x - firstSide.start.x;
  const startDy = secondSide.start.y - firstSide.start.y;
  const firstScale = ((startDx * secondDy) - (startDy * secondDx)) / denominator;

  return {
    x: firstSide.start.x + (firstScale * firstDx),
    y: firstSide.start.y + (firstScale * firstDy),
  };
};

const validatePanelContour = (contour: PanelContour): PanelGeometryBuildResult => {
  if (contour.length < 3) {
    return { ok: false, reason: 'Panel contour must contain at least 3 points.' };
  }

  for (let contourIndex = 0; contourIndex < contour.length; contourIndex += 1) {
    const point = contour[contourIndex];

    if (!point) {
      return { ok: false, reason: `Panel contour point ${contourIndex} is undefined.` };
    }

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { ok: false, reason: `Panel contour point ${contourIndex} must have finite coordinates.` };
    }

    const nextPoint = contour[(contourIndex + 1) % contour.length];

    if (!nextPoint) {
      return { ok: false, reason: 'Panel contour closed path cannot be generated because a side endpoint is missing.' };
    }

    if (Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y) <= cornerTouchTolerance) {
      return { ok: false, reason: `Panel contour point ${contourIndex} duplicates the next consecutive point.` };
    }
  }

  if (Math.abs(getContourSignedArea(contour)) <= cornerTouchTolerance) {
    return { ok: false, reason: 'Panel contour polygon area must be greater than tolerance.' };
  }

  const closedPathD = pointsToClosedPathD(contour);

  if (!closedPathD.endsWith(' Z')) {
    return { ok: false, reason: 'Panel contour closed path cannot be generated.' };
  }

  return { ok: true, contour };
};

const buildContourSideOffsetPlan = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
  role: EdgeRole,
): ContourSideOffsetPlan[] => (
  panel.edgeIds.map((edgeId, sideIndex) => {
    const operation = operations.find((candidate) => (
      candidate.edgeId === edgeId && candidate.role === role
    ));

    return {
      sideIndex,
      edgeId,
      offsetDistance: operation?.materialThicknessMm ?? 0,
    };
  })
);

const applyContourSideOffsetPlan = (
  contour: PanelContour,
  plan: ContourSideOffsetPlan[],
): PanelGeometryBuildResult => {
  const contourSides = buildContourSides(contour);

  if (plan.length !== contourSides.length) {
    return { ok: false, reason: 'Panel contour offset plan must cover every contour side.' };
  }

  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;
  const offsetSides = plan.map((planItem, planIndex) => {
    if (planItem.sideIndex !== planIndex) {
      return null;
    }

    const side = contourSides[planItem.sideIndex];

    if (!side) {
      return null;
    }

    return offsetContourSide(side, planItem.offsetDistance * contourWindingSign);
  });
  const invalidOffsetSideIndex = offsetSides.findIndex((side) => !side);

  if (invalidOffsetSideIndex !== -1) {
    const planItem = plan[invalidOffsetSideIndex];

    return {
      ok: false,
      reason: `Panel edge ${planItem?.edgeId ?? invalidOffsetSideIndex} cannot be offset because its contour side is invalid.`,
    };
  }

  const contourResult = (offsetSides as ContourSide[]).map((side, sideIndex, sides) => {
    const previousSide = sides[(sideIndex + sides.length - 1) % sides.length];
    return lineIntersection(previousSide, side);
  });
  const invalidIntersectionIndex = contourResult.findIndex((point) => !point);

  if (invalidIntersectionIndex !== -1) {
    return {
      ok: false,
      reason: `Panel contour side ${invalidIntersectionIndex} cannot be rebuilt because adjacent offset sides do not intersect.`,
    };
  }

  return validatePanelContour(contourResult as PanelContour);
};

const createTabSegmentPlan = (
  insetLength: number,
  fingerWidthMm: number,
): TabSegment[] => {
  const safeInsetLength = Math.max(0, insetLength);
  const safeFingerWidth = Math.max(0, fingerWidthMm);

  if (safeInsetLength <= cornerTouchTolerance) {
    return [];
  }

  if (safeFingerWidth <= cornerTouchTolerance || safeInsetLength < safeFingerWidth) {
    return [{ startDistance: 0, endDistance: safeInsetLength }];
  }

  const maxFullFingerCount = Math.max(1, Math.floor(safeInsetLength / safeFingerWidth));
  const segmentCount = maxFullFingerCount % 2 === 0
    ? Math.max(1, maxFullFingerCount - 1)
    : maxFullFingerCount;

  if (segmentCount === 1) {
    return [{ startDistance: 0, endDistance: safeInsetLength }];
  }

  const centerDistance = safeInsetLength / 2;
  const middleSegmentCount = segmentCount - 2;
  const middleSegmentsLength = middleSegmentCount * safeFingerWidth;
  const middleStartDistance = centerDistance - (middleSegmentsLength / 2);
  const middleEndDistance = centerDistance + (middleSegmentsLength / 2);
  const boundaryDistances = [
    0,
    middleStartDistance,
    ...Array.from({ length: Math.max(0, middleSegmentCount - 1) }, (_, index) => (
      middleStartDistance + ((index + 1) * safeFingerWidth)
    )),
    middleEndDistance,
    safeInsetLength,
  ];

  return boundaryDistances.flatMap((startDistance, index) => {
    const endDistance = boundaryDistances[index + 1];

    if (endDistance === undefined || endDistance - startDistance <= cornerTouchTolerance) {
      return [];
    }

    return [{ startDistance, endDistance }];
  });
};

const getContourSideLength = (side: ContourSide) => (
  Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y)
);

const buildTabSegmentPlansByConnectionId = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
  contour: PanelContour,
): Map<string, TabSegmentPlan> => {
  const contourSides = buildContourSides(contour);
  const lengthsByConnectionId = new Map<string, number[]>();
  const fingerWidthByConnectionId = new Map<string, number>();

  operations.forEach((operation) => {
    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.edgeId);
    const side = sideIndex === -1 ? undefined : contourSides[sideIndex];

    if (!side) {
      return;
    }

    const lengths = lengthsByConnectionId.get(operation.connectionId) ?? [];
    lengths.push(getContourSideLength(side));
    lengthsByConnectionId.set(operation.connectionId, lengths);
    fingerWidthByConnectionId.set(operation.connectionId, operation.fingerWidthMm);
  });

  const plansByConnectionId = new Map<string, TabSegmentPlan>();

  lengthsByConnectionId.forEach((lengths, connectionId) => {
    if (lengths.length === 0) {
      return;
    }

    const shortestLength = Math.min(...lengths);
    const longestLength = Math.max(...lengths);

    if (longestLength - shortestLength > cornerTouchTolerance) {
      console.warn(`E connection ${connectionId} current inset side lengths differ (${lengths.join(', ')}); using shortest length.`, {
        connectionId,
        lengths,
      });
    }

    plansByConnectionId.set(connectionId, {
      connectionId,
      insetLength: shortestLength,
      segments: createTabSegmentPlan(shortestLength, fingerWidthByConnectionId.get(connectionId) ?? 0),
    });
  });

  return plansByConnectionId;
};

const mergeTabSegmentPlansByConnectionId = (
  panelPlans: Map<string, TabSegmentPlan>[],
): Map<string, TabSegmentPlan> => {
  const plansByConnectionId = new Map<string, { insetLengths: number[]; segments: TabSegment[] }>();

  panelPlans.forEach((plans) => {
    plans.forEach((plan) => {
      const groupedPlan = plansByConnectionId.get(plan.connectionId) ?? {
        insetLengths: [],
        segments: plan.segments,
      };
      groupedPlan.insetLengths.push(plan.insetLength);
      plansByConnectionId.set(plan.connectionId, groupedPlan);
    });
  });

  const mergedPlansByConnectionId = new Map<string, TabSegmentPlan>();

  plansByConnectionId.forEach((groupedPlan, connectionId) => {
    const shortestLength = Math.min(...groupedPlan.insetLengths);
    const longestLength = Math.max(...groupedPlan.insetLengths);

    if (longestLength - shortestLength > cornerTouchTolerance) {
      console.warn(`E connection ${connectionId} current inset side lengths differ (${groupedPlan.insetLengths.join(', ')}); using shortest length.`, {
        connectionId,
        lengths: groupedPlan.insetLengths,
      });
    }

    const sourcePlan = panelPlans
      .map((plans) => plans.get(connectionId))
      .find((plan) => plan && Math.abs(plan.insetLength - shortestLength) <= cornerTouchTolerance);

    mergedPlansByConnectionId.set(connectionId, {
      connectionId,
      insetLength: shortestLength,
      segments: sourcePlan?.segments ?? groupedPlan.segments,
    });
  });

  return mergedPlansByConnectionId;
};

const getTabSegmentsForRole = (
  segments: TabSegment[],
  role: EdgeRole,
): TabSegment[] => (
  segments.filter((_, segmentIndex) => (
    role === 'B'
      ? segmentIndex % 2 === 0
      : segmentIndex % 2 === 1
  ))
);

const interpolateSidePoint = (side: ContourSide, distance: number): Point => {
  const sideLength = getContourSideLength(side);

  if (sideLength <= cornerTouchTolerance) {
    return { x: side.start.x, y: side.start.y };
  }

  const distanceRatio = distance / sideLength;

  return {
    x: side.start.x + (side.end.x - side.start.x) * distanceRatio,
    y: side.start.y + (side.end.y - side.start.y) * distanceRatio,
  };
};

const isOperationReversedAgainstContour = (
  panel: SvgPanel,
  operation: PanelEdgeOperation,
  edgesById: Map<string, SvgEdge>,
): boolean => {
  const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.edgeId);
  const edge = edgesById.get(operation.edgeId);

  if (sideIndex === -1 || !edge) {
    return false;
  }

  const { start, end } = getContourEdgePoints(panel, sideIndex);

  return pointsMatch(edge.start, end) && pointsMatch(edge.end, start);
};

const centerSegmentsOnSide = (
  segments: TabSegment[],
  centerOffset: number,
): TabSegment[] => (
  segments.map((segment) => ({
    startDistance: segment.startDistance + centerOffset,
    endDistance: segment.endDistance + centerOffset,
  }))
);

const mirrorSegments = (
  segments: TabSegment[],
  sideLength: number,
): TabSegment[] => (
  segments
    .map((segment) => ({
      startDistance: sideLength - segment.endDistance,
      endDistance: sideLength - segment.startDistance,
    }))
    .sort((first, second) => first.startDistance - second.startDistance)
);

const buildTabOperations = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
  tabSegmentPlansByConnectionId: Map<string, TabSegmentPlan>,
  edgesById: Map<string, SvgEdge>,
): PanelTabOperation[] => (
  operations.flatMap((operation) => {
    if (operation.role !== 'A' && operation.role !== 'B') {
      return [];
    }

    if (!panel.edgeIds.includes(operation.edgeId)) {
      return [];
    }

    const segmentPlan = tabSegmentPlansByConnectionId.get(operation.connectionId);

    if (!segmentPlan) {
      return [];
    }

    return [{
      ...operation,
      reversed: isOperationReversedAgainstContour(panel, operation, edgesById),
      insetLength: segmentPlan.insetLength,
      segments: getTabSegmentsForRole(segmentPlan.segments, operation.role),
    }];
  })
);

const addContourPoint = (contour: PanelContour, point: Point) => {
  const previousPoint = contour[contour.length - 1];

  if (!previousPoint || !pointsMatch(previousPoint, point)) {
    contour.push(point);
  }
};

const applyTabsToContour = (
  panel: SvgPanel,
  contour: PanelContour,
  tabOperations: PanelTabOperation[],
  shouldDebugApply = false,
): PanelGeometryBuildResult => {
  if (tabOperations.length === 0) {
    return validatePanelContour(contour);
  }

  const contourSides = buildContourSides(contour);
  const tabOperationsBySideIndex = new Map<number, PanelTabOperation>();

  tabOperations.forEach((operation) => {
    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.edgeId);

    if (sideIndex !== -1) {
      tabOperationsBySideIndex.set(sideIndex, operation);
    }
  });

  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;
  const tabbedContour: PanelContour = [];

  contourSides.forEach((side, sideIndex) => {
    const operation = tabOperationsBySideIndex.get(sideIndex);

    addContourPoint(tabbedContour, side.start);

    if (!operation || operation.segments.length === 0) {
      addContourPoint(tabbedContour, side.end);
      return;
    }

    const outwardSide = offsetContourSide(side, -operation.materialThicknessMm * contourWindingSign);

    if (!outwardSide) {
      addContourPoint(tabbedContour, side.end);
      return;
    }

    const currentSideLength = getContourSideLength(side);
    const centerOffset = Math.max(0, (currentSideLength - operation.insetLength) / 2);
    const centeredSegments = centerSegmentsOnSide(operation.segments, centerOffset);
    const segments = operation.reversed
      ? mirrorSegments(centeredSegments, currentSideLength)
      : centeredSegments;

    if (shouldDebugApply) {
      console.log('E tab operation', {
        edgeId: operation.edgeId,
        connectionId: operation.connectionId,
        role: operation.role,
        currentSideLength,
        centerOffset,
        reversed: operation.reversed,
        finalSegmentDistances: segments.map((segment) => [segment.startDistance, segment.endDistance]),
      });
    }

    segments.forEach((segment) => {
      const baseStart = interpolateSidePoint(side, segment.startDistance);
      const baseEnd = interpolateSidePoint(side, segment.endDistance);
      const tabStart = interpolateSidePoint(outwardSide, segment.startDistance);
      const tabEnd = interpolateSidePoint(outwardSide, segment.endDistance);

      addContourPoint(tabbedContour, baseStart);
      addContourPoint(tabbedContour, tabStart);
      addContourPoint(tabbedContour, tabEnd);
      addContourPoint(tabbedContour, baseEnd);
    });

    addContourPoint(tabbedContour, side.end);
  });

  if (tabbedContour.length > 1 && pointsMatch(tabbedContour[0], tabbedContour[tabbedContour.length - 1])) {
    tabbedContour.pop();
  }

  return validatePanelContour(tabbedContour);
};

const getPanelEdgeOperations = (
  panel: SvgPanel,
  assignments: Record<string, EdgeAssignment>,
  connectionMap: ConnectionMap,
): PanelEdgeOperation[] => (
  panel.edgeIds.flatMap((edgeId) => {
    const assignment = assignments[edgeId];
    const connection = assignment ? connectionMap[assignment.connectionId] : undefined;

    if (!assignment || connection?.prefix !== 'E') {
      return [];
    }

    return [{
      edgeId,
      connectionId: assignment.connectionId,
      role: assignment.edgeRole ?? 'A',
      materialThicknessMm: connection.properties.materialThicknessMm,
      fingerWidthMm: connection.properties.fingerWidthMm,
    }];
  })
);

const buildInsetPanelContour = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
): PanelGeometryBuildResult => {
  let contour = clonePanelContour(panel);

  const initialValidation = validatePanelContour(contour);

  if (!initialValidation.ok) {
    return initialValidation;
  }

  const aOffsetPlan = buildContourSideOffsetPlan(panel, operations, 'A');
  const aResult = applyContourSideOffsetPlan(contour, aOffsetPlan);

  if (!aResult.ok) {
    return aResult;
  }

  contour = aResult.contour;

  const aValidation = validatePanelContour(contour);

  if (!aValidation.ok) {
    return aValidation;
  }

  const bOffsetPlan = buildContourSideOffsetPlan(panel, operations, 'B');
  const bResult = applyContourSideOffsetPlan(contour, bOffsetPlan);

  if (!bResult.ok) {
    return bResult;
  }

  contour = bResult.contour;

  const bValidation = validatePanelContour(contour);

  if (!bValidation.ok) {
    return bValidation;
  }

  return { ok: true, contour };
};

const buildPanelGeometry = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
  insetContour: PanelContour,
  tabSegmentPlansByConnectionId: Map<string, TabSegmentPlan>,
  edgesById: Map<string, SvgEdge>,
  shouldDebugApply = false,
): PanelGeometryBuildResult => {
  const tabOperations = buildTabOperations(panel, operations, tabSegmentPlansByConnectionId, edgesById);
  const tabResult = applyTabsToContour(panel, insetContour, tabOperations, shouldDebugApply);

  if (!tabResult.ok) {
    return tabResult;
  }

  const finalValidation = validatePanelContour(tabResult.contour);

  if (!finalValidation.ok) {
    return finalValidation;
  }

  return { ok: true, contour: tabResult.contour };
};

const validateClosedPanel = (
  panel: SvgPanel,
  edgesById: Map<string, SvgEdge>,
): PanelValidationResult => {
  if (panel.contour.length < 3) {
    return { valid: false, reason: 'Panel contour must contain at least 3 points.' };
  }

  if (panel.edgeIds.length !== panel.contour.length) {
    return { valid: false, reason: 'Panel edge count must match contour point count.' };
  }

  for (let contourIndex = 0; contourIndex < panel.contour.length; contourIndex += 1) {
    const point = panel.contour[contourIndex];

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { valid: false, reason: `Panel contour point ${contourIndex} must have finite coordinates.` };
    }
  }

  for (let contourIndex = 0; contourIndex < panel.edgeIds.length; contourIndex += 1) {
    const edgeId = panel.edgeIds[contourIndex];
    const edge = edgesById.get(edgeId);

    if (!edge) {
      return { valid: false, reason: `Panel edge ${edgeId} does not exist.` };
    }

    const { start, end } = getContourEdgePoints(panel, contourIndex);
    const contourSideMatch = edgeMatchesContourSide(edge, start, end);

    if (!contourSideMatch.matches) {
      return { valid: false, reason: `Panel edge ${edgeId} does not match contour side ${contourIndex}.` };
    }
  }

  const finalEdgeId = panel.edgeIds[panel.edgeIds.length - 1];
  const finalEdge = edgesById.get(finalEdgeId);
  const finalStart = panel.contour[panel.contour.length - 1];
  const finalEnd = panel.contour[0];

  if (!finalEdge || !edgeMatchesContourSide(finalEdge, finalStart, finalEnd).matches) {
    return { valid: false, reason: 'Panel final contour segment must close from last point to first point.' };
  }

  return { valid: true };
};

const buildAppliedEPanelPaths = (
  svgModel: SvgDocumentModel,
  assignments: Record<string, EdgeAssignment>,
  connectionMap: ConnectionMap,
  shouldDebugApply = false,
): AppliedEPanelPath[] => {
  const edgesById = new Map(svgModel.edges.map((edge) => [edge.id, edge]));
  const insetPanelOperations = svgModel.panels.flatMap((panel) => {
    const operations = getPanelEdgeOperations(panel, assignments, connectionMap);
    const validation = validateClosedPanel(panel, edgesById);

    if (!validation.valid || operations.length === 0) {
      return [];
    }

    const insetResult = buildInsetPanelContour(panel, operations);

    if (!insetResult.ok) {
      return [];
    }

    return [{
      panel,
      operations,
      insetContour: insetResult.contour,
    }];
  });
  const tabSegmentPlansByConnectionId = mergeTabSegmentPlansByConnectionId(
    insetPanelOperations.map(({ panel, operations, insetContour }) => (
      buildTabSegmentPlansByConnectionId(panel, operations, insetContour)
    )),
  );

  if (shouldDebugApply) {
    tabSegmentPlansByConnectionId.forEach((plan, connectionId) => {
      const segmentLengths = plan.segments.map((segment) => segment.endDistance - segment.startDistance);

      console.log('E tab segment plan', {
        connectionId,
        insetLength: plan.insetLength,
        fingerWidthMm: insetPanelOperations
          .flatMap(({ operations }) => operations)
          .find((operation) => operation.connectionId === connectionId)?.fingerWidthMm ?? 0,
        segmentCount: plan.segments.length,
        segmentLengths,
        firstSegmentLength: segmentLengths[0] ?? 0,
        lastSegmentLength: segmentLengths[segmentLengths.length - 1] ?? 0,
        middleSegmentLengths: segmentLengths.slice(1, -1),
      });
    });
  }

  return insetPanelOperations.flatMap(({ panel, operations, insetContour }) => {
    const result = buildPanelGeometry(
      panel,
      operations,
      insetContour,
      tabSegmentPlansByConnectionId,
      edgesById,
      shouldDebugApply,
    );

    if (!result.ok) {
      return [];
    }

    return [{
      panelId: panel.id,
      eraseRect: panel.bounds,
      erasePathD: pointsToClosedPathD(panel.contour),
      pathD: pointsToClosedPathD(result.contour),
      edgeIds: panel.edgeIds,
    }];
  });
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
  const hasOuter = assignedRoles.includes('A');
  const hasInner = assignedRoles.includes('B');

  if (hasOuter && !hasInner) {
    return 'B';
  }

  return 'A';
};

const formatEdgeRoleLabel = (role: EdgeRole | undefined) => {
  if (role === 'A') {
    return 'A';
  }

  if (role === 'B') {
    return 'B';
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
          {option === 'A' ? 'A' : option === 'B' ? 'B' : option}
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
    const nextAppliedEPanelPaths = buildAppliedEPanelPaths(svgModel, edgeAssignments, connections, true);
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
                      value={edgeAssignments[edge.id]?.edgeRole ?? 'A'}
                      options={['A', 'B']}
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
  const appliedEEdgeIds = useMemo(
    () => new Set(appliedEPanelPaths.flatMap((panelPath) => panelPath.edgeIds)),
    [appliedEPanelPaths],
  );
  const ePreviewDebugRows = useMemo(() => {
    if (!isEPreviewVisible) {
      return [];
    }

    return svgModel.edges.flatMap((edge) => {
      const assignment = edgeAssignments[edge.id];
      const connection = assignment ? connections[assignment.connectionId] : undefined;
      if (!assignment || connection?.prefix !== 'E') {
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
        ...segmentDebug,
      }];
    });
  }, [connections, edgeAssignments, isEPreviewVisible, svgModel.edges]);

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
                {appliedEPanelPaths.map((panelPath) => (
                  <g key={panelPath.panelId}>
                    <rect
                      className="applied-e-panel-erase"
                      x={panelPath.eraseRect.minX}
                      y={panelPath.eraseRect.minY}
                      width={panelPath.eraseRect.maxX - panelPath.eraseRect.minX}
                      height={panelPath.eraseRect.maxY - panelPath.eraseRect.minY}
                    />
                    <path
                      className="applied-e-panel-erase-contour"
                      d={panelPath.erasePathD}
                    />
                    <path
                      className="applied-e-panel-path"
                      d={panelPath.pathD}
                    />
                  </g>
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
                  const showHighlight = (label || selected) && !appliedEEdgeIds.has(edge.id);

                  return (
                    <g key={edge.id}>
                      {showHighlight && (
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
