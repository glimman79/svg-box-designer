import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';
import { exportLabeledSvg, getEdgeAssignmentDisplayLabels, getEdgeLabelPlacements, parseSvgDocument } from './svgUtils';
import type { EdgeAssignment, EdgeAssignmentBucket, EdgeAssignmentRecord, EdgeRole, Point, SlotRole, SourceBounds, SvgDocumentModel, SvgEdge, SvgPanel } from './svgUtils';
import type { ActiveSGroup, ActiveWGroup, AppliedEPanelPath, AppliedSGeometry, ConnectionDefinition, ConnectionMap, ConnectionPropertiesByPrefix, CornerConnectionDefinition, CornerConnectionProperties, EdgeConnectionDefinition, EdgeConnectionProperties, PatternConnectionDefinition, PatternConnectionProperties, SlotConnectionDefinition, SlotConnectionProperties, WallConnectionDefinition, WallConnectionProperties, WallPatternType, WallReference } from './app/connectionTypes';
export type { ActiveSGroup, ActiveWGroup, AppliedEPanelPath, AppliedSGeometry, AppliedSPanelPath, AppliedSSlotPath, ConnectionDefinition, ConnectionMap, EdgeConnectionDefinition, EdgeConnectionProperties, WallPatternType, WallReference } from './app/connectionTypes';

type LabelPrefix = 'E' | 'S' | 'W' | 'C' | 'P';

const isEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): assignment is EdgeAssignmentBucket => (
  !!assignment && ('edgeAssignment' in assignment || 'slotAssignments' in assignment)
);

const toEdgeAssignmentBucket = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined): EdgeAssignmentBucket | undefined => {
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

const getBucketEdgeAssignment = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.edgeAssignment
);

const getBucketSlotAssignments = (assignment: EdgeAssignment | EdgeAssignmentBucket | undefined) => (
  toEdgeAssignmentBucket(assignment)?.slotAssignments ?? []
);


type LabelGroup = {
  prefix: LabelPrefix;
  name: string;
  description: string;
};

type HistoryState = {
  edgeAssignments: Record<string, EdgeAssignmentBucket>;
  connections: ConnectionMap;
  selectedLabelId: string | null;
  selectedEdgeId: string | null;
  appliedEPanelPaths?: AppliedEPanelPath[];
  appliedSGeometry?: AppliedSGeometry[];
  activeSGroup: ActiveSGroup | null;
  activeWGroup: ActiveWGroup | null;
};

const maxHistoryEntries = 10;

const cloneHistoryState = (state: HistoryState): HistoryState => ({
  edgeAssignments: structuredClone(state.edgeAssignments),
  connections: structuredClone(state.connections),
  selectedLabelId: state.selectedLabelId,
  selectedEdgeId: state.selectedEdgeId,
  ...(state.appliedEPanelPaths ? { appliedEPanelPaths: structuredClone(state.appliedEPanelPaths) } : {}),
  ...(state.appliedSGeometry ? { appliedSGeometry: structuredClone(state.appliedSGeometry) } : {}),
  activeSGroup: state.activeSGroup ? structuredClone(state.activeSGroup) : null,
  activeWGroup: state.activeWGroup ? structuredClone(state.activeWGroup) : null,
});

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



const escapeSvgAttribute = (value: string | number) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const exportAppliedSvg = (
  svgModel: SvgDocumentModel,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[] = [],
): string => {
  const rootViewBox = svgModel.rootAttributes.viewBox ?? svgModel.viewBox;
  const rootWidth = svgModel.rootAttributes.width;
  const rootHeight = svgModel.rootAttributes.height;
  const sizeAttributes = [
    rootWidth !== null ? `width="${escapeSvgAttribute(rootWidth)}"` : '',
    rootHeight !== null ? `height="${escapeSvgAttribute(rootHeight)}"` : '',
  ].filter(Boolean).join(' ');
  const appliedByPanelId = new Map<string, { pathD: string }>(appliedEPanelPaths.map((panelPath) => [panelPath.panelId, panelPath]));
  appliedSGeometry.flatMap((geometry) => geometry.panelPaths).forEach((panelPath) => {
    if (!appliedByPanelId.has(panelPath.panelId)) {
      appliedByPanelId.set(panelPath.panelId, panelPath);
    }
  });
  const pathElements = svgModel.panels.map((panel) => {
    const d = appliedByPanelId.get(panel.id)?.pathD ?? pointsToClosedPathD(panel.contour);

    return `  <path d="${escapeSvgAttribute(d)}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  });
  const slotElements = appliedSGeometry.flatMap((geometry) => geometry.slotPaths).map((slotPath) => (
    `  <path d="${escapeSvgAttribute(slotPath.pathD)}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`
  ));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeSvgAttribute(rootViewBox)}"${sizeAttributes ? ` ${sizeAttributes}` : ''}>`,
    ...pathElements,
    ...slotElements,
    '</svg>',
  ].join('\n');
};

const emptySvgModel: SvgDocumentModel = {
  content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>',
  innerMarkup: '',
  rootAttributes: {
    width: null,
    height: null,
    viewBox: '0 0 800 600',
  },
  viewBox: '0 0 800 600',
  width: 800,
  height: 600,
  edges: [],
  panels: [],
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
  originalSideLengths: number[];
  segments: TabSegment[];
};

type PanelTabOperation = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole;
  materialThicknessMm: number;
  fingerWidthMm: number;
  insetLength: number;
  segments: TabSegment[];
};

type SPanelOperation = {
  connectionId: string;
  sourceAEdgeId: string;
  materialThicknessMm: number;
  aSegments: TabSegment[];
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

export const pointsToClosedPathD = (points: Point[]) => (
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

export const createTabSegmentPlan = (
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

  const maxInteriorSegmentCount = Math.floor((safeInsetLength - (2 * safeFingerWidth)) / safeFingerWidth);
  let interiorSegmentCount = maxInteriorSegmentCount % 2 === 0
    ? maxInteriorSegmentCount - 1
    : maxInteriorSegmentCount;

  while (interiorSegmentCount >= 1) {
    const outerLength = (safeInsetLength - (interiorSegmentCount * safeFingerWidth)) / 2;

    if (outerLength + cornerTouchTolerance >= safeFingerWidth) {
      const segments: TabSegment[] = [
        { startDistance: 0, endDistance: outerLength },
      ];

      for (let index = 0; index < interiorSegmentCount; index += 1) {
        const startDistance = outerLength + (index * safeFingerWidth);

        segments.push({
          startDistance,
          endDistance: startDistance + safeFingerWidth,
        });
      }

      segments.push({
        startDistance: safeInsetLength - outerLength,
        endDistance: safeInsetLength,
      });

      return segments;
    }

    interiorSegmentCount -= 2;
  }

  return [{ startDistance: 0, endDistance: safeInsetLength }];
};

const getContourSideLength = (side: ContourSide) => (
  Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y)
);

export const buildTabSegmentPlansByConnectionId = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
): Map<string, TabSegmentPlan> => {
  const lengthsByConnectionId = new Map<string, number[]>();
  const fingerWidthByConnectionId = new Map<string, number>();

  operations.forEach((operation) => {
    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.edgeId);

    if (sideIndex === -1) {
      return;
    }

    const side = getContourEdgePoints(panel, sideIndex);
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
      console.warn(`E connection ${connectionId} original side lengths differ (${lengths.join(', ')}); using shortest length.`, {
        connectionId,
        lengths,
      });
    }

    plansByConnectionId.set(connectionId, {
      connectionId,
      insetLength: shortestLength,
      originalSideLengths: lengths,
      segments: createTabSegmentPlan(shortestLength, fingerWidthByConnectionId.get(connectionId) ?? 0),
    });
  });

  return plansByConnectionId;
};

const mergeTabSegmentPlansByConnectionId = (
  panelPlans: Map<string, TabSegmentPlan>[],
): Map<string, TabSegmentPlan> => {
  const plansByConnectionId = new Map<string, { insetLengths: number[]; originalSideLengths: number[]; segments: TabSegment[] }>();

  panelPlans.forEach((plans) => {
    plans.forEach((plan) => {
      const groupedPlan = plansByConnectionId.get(plan.connectionId) ?? {
        insetLengths: [],
        originalSideLengths: [],
        segments: plan.segments,
      };
      groupedPlan.insetLengths.push(plan.insetLength);
      groupedPlan.originalSideLengths.push(...plan.originalSideLengths);
      plansByConnectionId.set(plan.connectionId, groupedPlan);
    });
  });

  const mergedPlansByConnectionId = new Map<string, TabSegmentPlan>();

  plansByConnectionId.forEach((groupedPlan, connectionId) => {
    const shortestLength = Math.min(...groupedPlan.insetLengths);
    const longestLength = Math.max(...groupedPlan.insetLengths);

    if (longestLength - shortestLength > cornerTouchTolerance) {
      console.warn(`E connection ${connectionId} original side lengths differ (${groupedPlan.insetLengths.join(', ')}); using shortest length.`, {
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
      originalSideLengths: groupedPlan.originalSideLengths,
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

const projectPointDistanceOnSide = (side: ContourSide, point: Point): number => {
  const sideLength = getContourSideLength(side);

  if (sideLength <= cornerTouchTolerance) {
    return 0;
  }

  const sideUnitX = (side.end.x - side.start.x) / sideLength;
  const sideUnitY = (side.end.y - side.start.y) / sideLength;

  return ((point.x - side.start.x) * sideUnitX) + ((point.y - side.start.y) * sideUnitY);
};

const clipOriginalSegmentsToInsetSide = (
  originalSide: ContourSide,
  insetSide: ContourSide,
  segments: TabSegment[],
): TabSegment[] => {
  const trimStart = projectPointDistanceOnSide(originalSide, insetSide.start);
  const trimEnd = projectPointDistanceOnSide(originalSide, insetSide.end);

  return segments.flatMap((segment) => {
    const clippedStart = Math.max(segment.startDistance, trimStart);
    const clippedEnd = Math.min(segment.endDistance, trimEnd);

    if (clippedEnd <= clippedStart) {
      return [];
    }

    return [{
      startDistance: clippedStart - trimStart,
      endDistance: clippedEnd - trimStart,
    }];
  });
};

const getContourSideCanonicalOrientation = (side: ContourSide): 'horizontal' | 'vertical' => {
  const dx = side.end.x - side.start.x;
  const dy = side.end.y - side.start.y;

  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
};

const isContourSideReversedFromCanonical = (side: ContourSide): boolean => (
  getContourSideCanonicalOrientation(side) === 'horizontal'
    ? side.start.x > side.end.x
    : side.start.y > side.end.y
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
      insetLength: segmentPlan.insetLength,
      segments: segmentPlan.segments,
    }];
  })
);

const addContourPoint = (contour: PanelContour, point: Point) => {
  const previousPoint = contour[contour.length - 1];

  if (!previousPoint || !pointsMatch(previousPoint, point)) {
    contour.push(point);
  }
};

const isBBCorner = (
  sideIndex: number,
  sideCount: number,
  tabOperationsBySideIndex: Map<number, PanelTabOperation>,
): boolean => {
  const previousSideIndex = (sideIndex + sideCount - 1) % sideCount;
  const previousOperation = tabOperationsBySideIndex.get(previousSideIndex);
  const currentOperation = tabOperationsBySideIndex.get(sideIndex);

  return previousOperation?.role === 'B' && currentOperation?.role === 'B';
};

// B-B corners need an explicit outward join because both adjacent B sides are inset before tabs are drawn.
// Do not remove this as dead code; it preserves the outside corner when two B sides meet on the same panel.
const addBBCornerJoin = (
  tabbedContour: PanelContour,
  insetCorner: Point,
  previousInsetSide: ContourSide,
  currentInsetSide: ContourSide,
  materialThicknessMm: number,
  contourWindingSign: number,
): void => {
  const previousOutwardSide = offsetContourSide(previousInsetSide, -materialThicknessMm * contourWindingSign);
  const currentOutwardSide = offsetContourSide(currentInsetSide, -materialThicknessMm * contourWindingSign);

  if (!previousOutwardSide || !currentOutwardSide) {
    addContourPoint(tabbedContour, insetCorner);
    return;
  }

  const outwardCorner = lineIntersection(previousOutwardSide, currentOutwardSide);

  if (!outwardCorner) {
    addContourPoint(tabbedContour, insetCorner);
    return;
  }

  addContourPoint(tabbedContour, insetCorner);
  addContourPoint(tabbedContour, previousOutwardSide.end);
  addContourPoint(tabbedContour, outwardCorner);
  addContourPoint(tabbedContour, currentOutwardSide.start);
  addContourPoint(tabbedContour, insetCorner);
};

// Cleans zero-area A-B-A backtracks, including seam backtracks across the implicit SVG close path.
// This protects B-B corner joins from leaving interior spur lines.
const removeInteriorBacktrackSpurs = (contour: PanelContour): PanelContour => {
  const cleanedContour: PanelContour = [];

  contour.forEach((point) => {
    addContourPoint(cleanedContour, point);

    while (
      cleanedContour.length >= 3
      && pointsMatch(cleanedContour[cleanedContour.length - 3], cleanedContour[cleanedContour.length - 1])
    ) {
      cleanedContour.splice(cleanedContour.length - 2, 2);
    }
  });

  let removedClosedSpur = true;

  while (removedClosedSpur && cleanedContour.length >= 3) {
    removedClosedSpur = false;

    if (
      cleanedContour.length >= 4
      && pointsMatch(cleanedContour[cleanedContour.length - 2], cleanedContour[1])
      && pointsMatch(cleanedContour[cleanedContour.length - 1], cleanedContour[0])
    ) {
      cleanedContour.pop();
      cleanedContour.shift();
      removedClosedSpur = true;
      continue;
    }

    if (pointsMatch(cleanedContour[cleanedContour.length - 1], cleanedContour[1])) {
      cleanedContour.shift();
      removedClosedSpur = true;
    }

    if (cleanedContour.length >= 3 && pointsMatch(cleanedContour[cleanedContour.length - 2], cleanedContour[0])) {
      cleanedContour.pop();
      removedClosedSpur = true;
    }
  }

  return cleanedContour;
};

export const applyTabsToContour = (
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

    if (isBBCorner(sideIndex, contourSides.length, tabOperationsBySideIndex)) {
      const previousSide = contourSides[(sideIndex + contourSides.length - 1) % contourSides.length];
      const currentOperation = tabOperationsBySideIndex.get(sideIndex);

      if (currentOperation) {
        addBBCornerJoin(
          tabbedContour,
          side.start,
          previousSide,
          side,
          currentOperation.materialThicknessMm,
          contourWindingSign,
        );
      } else {
        addContourPoint(tabbedContour, side.start);
      }
    } else {
      addContourPoint(tabbedContour, side.start);
    }

    if (!operation || operation.segments.length === 0) {
      addContourPoint(tabbedContour, side.end);
      return;
    }

    const outwardSide = offsetContourSide(side, -operation.materialThicknessMm * contourWindingSign);

    if (!outwardSide) {
      addContourPoint(tabbedContour, side.end);
      return;
    }

    const originalSide = getContourEdgePoints(panel, sideIndex);
    const originalSideLength = getContourSideLength(originalSide);
    const reversedFromCanonical = isContourSideReversedFromCanonical(originalSide);
    const orientedSegments = reversedFromCanonical
      ? mirrorSegments(operation.segments, originalSideLength)
      : operation.segments;
    const roleSegments = getTabSegmentsForRole(orientedSegments, operation.role);
    const segments = clipOriginalSegmentsToInsetSide(originalSide, side, roleSegments);

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

  const cleanedTabbedContour = removeInteriorBacktrackSpurs(tabbedContour);

  if (cleanedTabbedContour.length > 1 && pointsMatch(cleanedTabbedContour[0], cleanedTabbedContour[cleanedTabbedContour.length - 1])) {
    cleanedTabbedContour.pop();
  }

  return validatePanelContour(cleanedTabbedContour);
};

export const getPanelEdgeOperations = (
  panel: SvgPanel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
): PanelEdgeOperation[] => (
  panel.edgeIds.flatMap((edgeId) => {
    const assignment = getBucketEdgeAssignment(assignments[edgeId]);
    const connection = assignment ? connectionMap[assignment.connectionId] : undefined;

    if (!assignment || (connection?.prefix !== 'E' && connection?.prefix !== 'W') || !assignment.edgeRole) {
      return [];
    }

    return [{
      edgeId,
      connectionId: assignment.connectionId,
      role: assignment.edgeRole,
      materialThicknessMm: connection.properties.materialThicknessMm,
      fingerWidthMm: connection.properties.fingerWidthMm,
    }];
  })
);

export const buildInsetPanelContour = (
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

export const buildPanelGeometry = (
  panel: SvgPanel,
  operations: PanelEdgeOperation[],
  insetContour: PanelContour,
  tabSegmentPlansByConnectionId: Map<string, TabSegmentPlan>,
  shouldDebugApply = false,
): PanelGeometryBuildResult => {
  const tabOperations = buildTabOperations(panel, operations, tabSegmentPlansByConnectionId);
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

export const buildAppliedEPanelPaths = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
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
    insetPanelOperations.map(({ panel, operations }) => (
      buildTabSegmentPlansByConnectionId(panel, operations)
    )),
  );


  return insetPanelOperations.flatMap(({ panel, operations, insetContour }) => {
    const result = buildPanelGeometry(
      panel,
      operations,
      insetContour,
      tabSegmentPlansByConnectionId,
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


const buildSInsetPanelContour = (
  panel: SvgPanel,
  operations: SPanelOperation[],
): PanelGeometryBuildResult => {
  const contour = clonePanelContour(panel);
  const validation = validatePanelContour(contour);

  if (!validation.ok) {
    return validation;
  }

  const operationsBySideIndex = new Map<number, SPanelOperation>();

  for (const operation of operations) {
    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.sourceAEdgeId);

    if (sideIndex === -1) {
      return { ok: false, reason: `S-A edge ${operation.sourceAEdgeId} is not part of its panel contour.` };
    }

    if (operationsBySideIndex.has(sideIndex)) {
      return { ok: false, reason: `S-A edge ${operation.sourceAEdgeId} has more than one operation on the same panel edge.` };
    }

    operationsBySideIndex.set(sideIndex, operation);
  }

  const contourSides = buildContourSides(contour);
  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;
  const offsetSides = contourSides.map((side, sideIndex) => {
    const operation = operationsBySideIndex.get(sideIndex);
    const offsetDistance = operation?.materialThicknessMm ?? 0;

    return offsetContourSide(side, offsetDistance * contourWindingSign);
  });
  const invalidOffsetSideIndex = offsetSides.findIndex((side) => !side);

  if (invalidOffsetSideIndex !== -1) {
    const edgeId = panel.edgeIds[invalidOffsetSideIndex];
    return { ok: false, reason: `Panel edge ${edgeId ?? invalidOffsetSideIndex} cannot be offset because its contour side is invalid.` };
  }

  const insetContour = (offsetSides as ContourSide[]).map((side, sideIndex, sides) => {
    const previousSide = sides[(sideIndex + sides.length - 1) % sides.length];
    return lineIntersection(previousSide, side);
  });
  const invalidIntersectionIndex = insetContour.findIndex((point) => !point);

  if (invalidIntersectionIndex !== -1) {
    return {
      ok: false,
      reason: `S-A panel contour side ${invalidIntersectionIndex} cannot be rebuilt because adjacent offset sides do not intersect.`,
    };
  }

  return validatePanelContour(insetContour as PanelContour);
};

const applySTabsToContour = (
  panel: SvgPanel,
  originalContour: PanelContour,
  insetContour: PanelContour,
  operations: SPanelOperation[],
): PanelGeometryBuildResult => {
  if (operations.length === 0) {
    return validatePanelContour(insetContour);
  }

  const originalSides = buildContourSides(originalContour);
  const insetSides = buildContourSides(insetContour);

  if (originalSides.length !== insetSides.length) {
    return { ok: false, reason: 'S-A original and inset contours must have matching side counts.' };
  }

  const operationsBySideIndex = new Map<number, SPanelOperation>();

  operations.forEach((operation) => {
    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === operation.sourceAEdgeId);

    if (sideIndex !== -1) {
      operationsBySideIndex.set(sideIndex, operation);
    }
  });

  const contourWindingSign = getContourSignedArea(originalContour) >= 0 ? 1 : -1;
  const tabbedContour: PanelContour = [];

  insetSides.forEach((insetSide, sideIndex) => {
    const operation = operationsBySideIndex.get(sideIndex);
    addContourPoint(tabbedContour, insetSide.start);

    if (!operation || operation.aSegments.length === 0) {
      addContourPoint(tabbedContour, insetSide.end);
      return;
    }

    const outwardSide = offsetContourSide(insetSide, -operation.materialThicknessMm * contourWindingSign);

    if (!outwardSide) {
      addContourPoint(tabbedContour, insetSide.end);
      return;
    }

    const originalSide = originalSides[sideIndex];
    const originalSideLength = getContourSideLength(originalSide);
    const reversedFromCanonical = isContourSideReversedFromCanonical(originalSide);
    const orientedSegments = reversedFromCanonical
      ? mirrorSegments(operation.aSegments, originalSideLength)
      : operation.aSegments;
    const segments = clipOriginalSegmentsToInsetSide(originalSide, insetSide, orientedSegments);

    segments.forEach((segment) => {
      const baseStart = interpolateSidePoint(insetSide, segment.startDistance);
      const baseEnd = interpolateSidePoint(insetSide, segment.endDistance);
      const tabStart = interpolateSidePoint(outwardSide, segment.startDistance);
      const tabEnd = interpolateSidePoint(outwardSide, segment.endDistance);

      addContourPoint(tabbedContour, baseStart);
      addContourPoint(tabbedContour, tabStart);
      addContourPoint(tabbedContour, tabEnd);
      addContourPoint(tabbedContour, baseEnd);
    });

    addContourPoint(tabbedContour, insetSide.end);
  });

  const cleanedTabbedContour = removeInteriorBacktrackSpurs(tabbedContour);

  if (cleanedTabbedContour.length > 1 && pointsMatch(cleanedTabbedContour[0], cleanedTabbedContour[cleanedTabbedContour.length - 1])) {
    cleanedTabbedContour.pop();
  }

  return validatePanelContour(cleanedTabbedContour);
};

const buildSPanelContour = (
  panel: SvgPanel,
  operations: SPanelOperation[],
): PanelGeometryBuildResult => {
  const insetResult = buildSInsetPanelContour(panel, operations);

  if (!insetResult.ok) {
    return insetResult;
  }

  return applySTabsToContour(panel, panel.contour, insetResult.contour, operations);
};

const findPanelContainingEdge = (svgModel: SvgDocumentModel, edgeId: string) => (
  svgModel.panels.find((panel) => panel.edgeIds.includes(edgeId)) ?? null
);

const getContourSideInwardNormal = (side: ContourSide, contour: PanelContour): Point | null => {
  const sideLength = Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y);

  if (sideLength <= cornerTouchTolerance) {
    return null;
  }

  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;

  return {
    x: (-(side.end.y - side.start.y) / sideLength) * contourWindingSign,
    y: ((side.end.x - side.start.x) / sideLength) * contourWindingSign,
  };
};

const buildSlotPathD = (
  edge: SvgEdge,
  startDistance: number,
  endDistance: number,
  widthMm: number,
  offsetNormal: Point,
  offsetDistance: number,
): string | null => {
  const edgeLength = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);

  if (edgeLength <= cornerTouchTolerance) {
    return null;
  }

  const ux = (edge.end.x - edge.start.x) / edgeLength;
  const uy = (edge.end.y - edge.start.y) / edgeLength;
  const nx = -uy;
  const ny = ux;
  const halfWidth = widthMm / 2;
  const baselineStart = {
    x: edge.start.x + (offsetNormal.x * offsetDistance),
    y: edge.start.y + (offsetNormal.y * offsetDistance),
  };
  const p0 = { x: baselineStart.x + (ux * startDistance), y: baselineStart.y + (uy * startDistance) };
  const p1 = { x: baselineStart.x + (ux * endDistance), y: baselineStart.y + (uy * endDistance) };
  const q0 = { x: p0.x + (nx * halfWidth), y: p0.y + (ny * halfWidth) };
  const q1 = { x: p1.x + (nx * halfWidth), y: p1.y + (ny * halfWidth) };
  const q2 = { x: p1.x - (nx * halfWidth), y: p1.y - (ny * halfWidth) };
  const q3 = { x: p0.x - (nx * halfWidth), y: p0.y - (ny * halfWidth) };

  return pointsToClosedPathD([q0, q1, q2, q3]);
};

export const buildAppliedSGeometry = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
): AppliedSGeometry[] => {
  const edgesById = new Map(svgModel.edges.map((edge) => [edge.id, edge]));
  const sConnections = Object.values(connectionMap).filter((connection): connection is SlotConnectionDefinition => connection.prefix === 'S');
  const result: AppliedSGeometry[] = [];
  const operationsByPanelId = new Map<string, { panel: SvgPanel; operations: SPanelOperation[] }>();

  sConnections.forEach((connection) => {
    const assignedEdges = Object.entries(assignments).flatMap(([edgeId, assignment]) => (
      getBucketSlotAssignments(assignment)
        .filter((slotAssignment) => slotAssignment.connectionId === connection.id)
        .map((slotAssignment) => [edgeId, slotAssignment] as const)
    ));
    if (assignedEdges.length === 0) {
      return;
    }

    const aEdges = assignedEdges.filter(([, assignment]) => assignment.slotRole === 'A');
    const bEdges = assignedEdges.filter(([, assignment]) => assignment.slotRole === 'B');

    if (aEdges.length !== 1 || bEdges.length !== 1) {
      throw new Error(`${connection.id} must have exactly one S-A edge and one S-B edge.`);
    }

    const [sourceAEdgeId] = aEdges[0];
    const [sourceBEdgeId] = bEdges[0];
    const sourceAEdge = edgesById.get(sourceAEdgeId);
    const sourceBEdge = edgesById.get(sourceBEdgeId);
    const panel = findPanelContainingEdge(svgModel, sourceAEdgeId);
    const bPanel = findPanelContainingEdge(svgModel, sourceBEdgeId);

    if (!sourceAEdge || !sourceBEdge || !panel) {
      throw new Error(`${connection.id} S-A edge must be part of a valid closed panel.`);
    }

    if (!bPanel) {
      throw new Error(`${connection.id} S-B edge must be part of a valid closed panel so slot offset direction can be determined.`);
    }

    const validation = validateClosedPanel(panel, edgesById);
    if (!validation.valid) {
      throw new Error(`${connection.id} S-A edge is not part of a valid closed panel: ${validation.reason}`);
    }

    const bValidation = validateClosedPanel(bPanel, edgesById);
    if (!bValidation.valid) {
      throw new Error(`${connection.id} S-B edge must be part of a valid closed panel so slot offset direction can be determined.`);
    }

    if (panel.edgeIds.some((edgeId) => {
      const edgeConnectionId = getBucketEdgeAssignment(assignments[edgeId])?.connectionId;
      return edgeConnectionId ? connectionMap[edgeConnectionId]?.prefix === 'E' : false;
    })) {
      throw new Error(`${connection.id} S-A panel conflicts with existing E-applied geometry on the same panel.`);
    }

    const sideIndex = panel.edgeIds.findIndex((edgeId) => edgeId === sourceAEdgeId);
    const originalSide = getContourEdgePoints(panel, sideIndex);
    const sideLength = getContourSideLength(originalSide);
    const materialThicknessMm = connection.properties.materialThicknessMm;
    const planSegments = createTabSegmentPlan(sideLength, connection.properties.slotLengthMm);
    const aSegments = getTabSegmentsForRole(planSegments, 'A');
    const bLength = Math.hypot(sourceBEdge.end.x - sourceBEdge.start.x, sourceBEdge.end.y - sourceBEdge.start.y);
    const bSideIndex = bPanel.edgeIds.findIndex((edgeId) => edgeId === sourceBEdgeId);
    const bOriginalSide = getContourEdgePoints(bPanel, bSideIndex);
    const bInwardNormal = getContourSideInwardNormal(bOriginalSide, bPanel.contour);

    if (!bInwardNormal) {
      throw new Error(`${connection.id} S-B edge must be part of a valid closed panel so slot offset direction can be determined.`);
    }

    aSegments.forEach((segment) => {
      if (segment.startDistance < -cornerTouchTolerance || segment.endDistance > bLength + cornerTouchTolerance || segment.endDistance <= segment.startDistance + cornerTouchTolerance) {
        throw new Error(`${connection.id} S-B slot pattern extends outside the S-B edge.`);
      }
    });

    const panelOperations = operationsByPanelId.get(panel.id) ?? { panel, operations: [] };
    panelOperations.operations.push({
      connectionId: connection.id,
      sourceAEdgeId,
      materialThicknessMm,
      aSegments,
    });
    operationsByPanelId.set(panel.id, panelOperations);

    const slotPaths = aSegments.map((segment) => {
      const startDistance = segment.startDistance;
      const endDistance = segment.endDistance;
      const slotOffsetMm = connection.properties.slotOffsetMm ?? 0;
      const pathD = buildSlotPathD(sourceBEdge, startDistance, endDistance, materialThicknessMm, bInwardNormal, slotOffsetMm);

      if (!pathD) {
        throw new Error(`${connection.id} S-B edge cannot receive slots because its length is invalid.`);
      }

      return {
        connectionId: connection.id,
        sourceAEdgeId,
        sourceBEdgeId,
        pathD,
        startDistance,
        endDistance,
        widthMm: materialThicknessMm,
      };
    });

    result.push({
      connectionId: connection.id,
      panelPaths: [],
      slotPaths,
      edgeIds: [sourceAEdgeId, sourceBEdgeId],
    });
  });

  operationsByPanelId.forEach(({ panel, operations }) => {
    const panelResult = buildSPanelContour(panel, operations);
    if (!panelResult.ok) {
      throw new Error(`${operations.map((operation) => operation.connectionId).join(', ')} S-A geometry failed: ${panelResult.reason}`);
    }

    const ownerConnectionId = operations
      .map((operation) => operation.connectionId)
      .sort((first, second) => first.localeCompare(second))[0];
    const ownerResult = result.find((geometry) => geometry.connectionId === ownerConnectionId);

    if (!ownerResult) {
      return;
    }

    ownerResult.panelPaths.push({
      panelId: panel.id,
      sourceEdgeId: operations
        .map((operation) => operation.sourceAEdgeId)
        .sort((first, second) => first.localeCompare(second))
        .join(' '),
      eraseRect: panel.bounds,
      erasePathD: pointsToClosedPathD(panel.contour),
      pathD: pointsToClosedPathD(panelResult.contour),
      edgeIds: panel.edgeIds,
    });
  });

  return result;
};

const labelGroups: LabelGroup[] = [
  { prefix: 'E', name: 'Edge connections', description: 'Reusable edge connection IDs' },
  { prefix: 'S', name: 'Slot connections', description: 'Reusable slot connection IDs' },
  { prefix: 'W', name: 'Wall connections', description: 'Reusable wall connection IDs' },
  { prefix: 'C', name: 'Corner connections', description: 'Reusable corner connection IDs' },
  { prefix: 'P', name: 'Pattern connections', description: 'Reusable pattern connection IDs' },
];

export const defaultConnectionProperties: ConnectionPropertiesByPrefix = {
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
  W: {
    wallHeightMm: 30,
    materialThicknessMm: 3,
    fingerWidthMm: 9,
    kerfMm: 0.15,
    playMm: 0,
    selectedEdgeIds: [],
    references: [],
    referencePatternType: null,
    generatedPatternType: null,
    generatedConnectionIds: [],
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

const getLabelNumber = (label: string) => Number.parseInt(label.slice(1), 10);

const getSGroupDisplayName = (groupIndex: number) => `S Group ${groupIndex + 1}`;

const getSGroupActionNumber = (connections: ConnectionMap, activeSGroup: ActiveSGroup | null) => {
  if (activeSGroup?.isActive) {
    const firstActiveNumber = getLabelNumber(activeSGroup.connectionIds[0] ?? 'S1');
    const previousSLabels = Object.keys(connections).filter((label) => getLabelPrefix(label) === 'S' && getLabelNumber(label) < firstActiveNumber);

    return previousSLabels.length > 0 ? 2 : 1;
  }

  return Object.keys(connections).some((label) => getLabelPrefix(label) === 'S') ? 2 : 1;
};

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

const getAssignedConnectionId = (assignment: EdgeAssignmentBucket | undefined) => {
  const edgeAssignment = getBucketEdgeAssignment(assignment);
  const slotAssignment = getBucketSlotAssignments(assignment)[0];
  return edgeAssignment && slotAssignment
    ? `${edgeAssignment.connectionId}, ${slotAssignment.connectionId}`
    : edgeAssignment?.connectionId ?? slotAssignment?.connectionId;
};

const getDefaultEdgeRole = (assignments: EdgeAssignmentRecord, connectionId: string): EdgeRole => {
  const assignedRoles = Object.values(assignments)
    .map((assignment) => getBucketEdgeAssignment(assignment))
    .filter((assignment): assignment is EdgeAssignment => assignment?.connectionId === connectionId)
    .map((assignment) => assignment.edgeRole);
  const hasOuter = assignedRoles.includes('A');
  const hasInner = assignedRoles.includes('B');

  if (hasOuter && !hasInner) {
    return 'B';
  }

  return 'A';
};

export const getDefaultSlotRole = (assignments: EdgeAssignmentRecord, connectionId: string): SlotRole | null => {
  const assignedRoles = Object.values(assignments)
    .flatMap((assignment) => getBucketSlotAssignments(assignment))
    .filter((assignment) => assignment.connectionId === connectionId)
    .map((assignment) => assignment.slotRole);

  const hasA = assignedRoles.includes('A');
  const hasB = assignedRoles.includes('B');

  if (hasA && hasB) {
    return null;
  }

  return hasA ? 'B' : 'A';
};

const getFollowingSlotLabel = (label: string) => {
  const labelNumber = Number.parseInt(label.slice(1), 10);

  if (getLabelPrefix(label) !== 'S' || !Number.isFinite(labelNumber)) {
    return null;
  }

  return `S${labelNumber + 1}`;
};


export const isCompleteSConnection = (assignments: EdgeAssignmentRecord, connectionId: string) => {
  const roles = Object.values(assignments)
    .flatMap((assignment) => getBucketSlotAssignments(assignment))
    .filter((assignment) => assignment.connectionId === connectionId)
    .map((assignment) => assignment.slotRole);

  return roles.filter((role) => role === 'A').length === 1 && roles.filter((role) => role === 'B').length === 1;
};

export const createStandaloneSConnection = (id: string): SlotConnectionDefinition => ({
  ...(createConnectionDefinition(id, 'S') as SlotConnectionDefinition),
  properties: {
    ...(createConnectionDefinition(id, 'S') as SlotConnectionDefinition).properties,
    slotOffsetMm: 0,
  },
});

export const createCopiedSConnection = (id: string, previousConnection: SlotConnectionDefinition): SlotConnectionDefinition => ({
  id,
  prefix: 'S',
  properties: {
    ...cloneDefaultProperties('S'),
    materialThicknessMm: previousConnection.properties.materialThicknessMm,
    slotWidthMm: previousConnection.properties.slotWidthMm,
    slotLengthMm: previousConnection.properties.slotLengthMm,
    isSlotLengthManual: previousConnection.properties.isSlotLengthManual,
    slotOffsetMm: previousConnection.properties.slotOffsetMm,
  },
});

export const applySlotPropertyUpdates = (
  connection: SlotConnectionDefinition,
  updates: Partial<SlotConnectionProperties>,
): SlotConnectionDefinition => {
  const nextProperties: SlotConnectionProperties = {
    ...connection.properties,
    ...updates,
  };

  if (updates.materialThicknessMm !== undefined) {
    nextProperties.slotWidthMm = getDefaultSlotWidth(updates.materialThicknessMm);

    if (!connection.properties.isSlotLengthManual) {
      nextProperties.slotLengthMm = getDefaultSlotLength(updates.materialThicknessMm);
    }
  }

  if (updates.slotLengthMm !== undefined) {
    nextProperties.isSlotLengthManual = true;
  }

  return {
    ...connection,
    properties: nextProperties,
  };
};

export const applyActiveSGroupSlotPropertyUpdates = (
  connections: ConnectionMap,
  activeSGroup: ActiveSGroup | null,
  updates: Partial<SlotConnectionProperties>,
): ConnectionMap => {
  if (!activeSGroup?.isActive) {
    return connections;
  }

  const activeConnectionIds = new Set(activeSGroup.connectionIds);

  return Object.fromEntries(
    Object.entries(connections).map(([connectionId, connection]) => [
      connectionId,
      activeConnectionIds.has(connectionId) && connection.prefix === 'S'
        ? applySlotPropertyUpdates(connection, updates)
        : connection,
    ]),
  );
};

export const startSGroupWorkflow = (connections: ConnectionMap) => {
  const connectionId = getNextLabel('S', Object.keys(connections));
  const connection = createStandaloneSConnection(connectionId);

  return {
    connections: { ...connections, [connectionId]: connection },
    selectedLabelId: connectionId,
    activeSGroup: { groupId: `s-group-${connectionId}`, connectionIds: [connectionId], isActive: true } satisfies ActiveSGroup,
  };
};

export const finishSGroupWorkflow = (activeSGroup: ActiveSGroup | null): ActiveSGroup | null => (
  activeSGroup ? { ...activeSGroup, isActive: false } : null
);

export const manualAddSWorkflow = (connections: ConnectionMap, activeSGroup: ActiveSGroup | null) => {
  const connectionId = getNextLabel('S', Object.keys(connections));

  return {
    connections: { ...connections, [connectionId]: createStandaloneSConnection(connectionId) },
    selectedLabelId: connectionId,
    activeSGroup: finishSGroupWorkflow(activeSGroup),
  };
};

export const maybeAutoCreateNextSInGroup = (
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  activeSGroup: ActiveSGroup | null,
  completedConnectionId: string,
) => {
  if (!activeSGroup?.isActive || !activeSGroup.connectionIds.includes(completedConnectionId) || !isCompleteSConnection(assignments, completedConnectionId)) {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  const previousConnection = connections[completedConnectionId];

  if (!previousConnection || previousConnection.prefix !== 'S') {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  const connectionId = getNextLabel('S', Object.keys(connections));

  if (connections[connectionId]) {
    return { connections, selectedLabelId: completedConnectionId, activeSGroup };
  }

  return {
    connections: { ...connections, [connectionId]: createCopiedSConnection(connectionId, previousConnection) },
    selectedLabelId: connectionId,
    activeSGroup: { ...activeSGroup, connectionIds: [...activeSGroup.connectionIds, connectionId] },
  };
};


export const getWGroupActionNumber = (connections: ConnectionMap, activeWGroup: ActiveWGroup | null) => {
  if (activeWGroup?.isActive) {
    return getLabelNumber(activeWGroup.connectionId);
  }

  const wNumbers = Object.keys(connections)
    .filter((label) => getLabelPrefix(label) === 'W')
    .map(getLabelNumber)
    .filter((value) => Number.isFinite(value));

  return wNumbers.length > 0 ? Math.max(...wNumbers) + 1 : 1;
};

const createStandaloneWConnection = (id: string): WallConnectionDefinition => ({
  id,
  prefix: 'W',
  properties: cloneDefaultProperties('W'),
});

export const startWGroupWorkflow = (connections: ConnectionMap) => {
  const connectionId = getNextLabel('W', Object.keys(connections));

  return {
    connections: { ...connections, [connectionId]: createStandaloneWConnection(connectionId) },
    selectedLabelId: connectionId,
    activeWGroup: { groupId: `w-group-${connectionId}`, connectionId, isActive: true } satisfies ActiveWGroup,
  };
};

const collectEdgeReferenceLabels = (edgeId: string, assignments: EdgeAssignmentRecord): WallReference[] => {
  const bucket = toEdgeAssignmentBucket(assignments[edgeId]);
  if (!bucket) {
    return [];
  }

  const edgeReference = bucket.edgeAssignment?.connectionId.startsWith('E') && bucket.edgeAssignment.edgeRole
    ? [{ edgeId, connectionId: bucket.edgeAssignment.connectionId, role: bucket.edgeAssignment.edgeRole, sourceType: 'E' as const }]
    : [];
  const slotReferences = getBucketSlotAssignments(bucket)
    .filter((assignment) => assignment.connectionId.startsWith('S') && !!assignment.slotRole)
    .map((assignment) => ({ edgeId, connectionId: assignment.connectionId, role: assignment.slotRole as SlotRole, sourceType: 'S' as const }));

  return [...edgeReference, ...slotReferences];
};

export const collectWReferences = (
  selectedEdgeIds: string[],
  assignments: EdgeAssignmentRecord,
  svgModel: SvgDocumentModel,
  wallConnectionId = 'W group',
): WallReference[] => {
  const selectedPanelIds = new Set<string>();

  return selectedEdgeIds.reduce<WallReference[]>((panelReferences, selectedEdgeId) => {
    const panel = findPanelContainingEdge(svgModel, selectedEdgeId);
    if (!panel) {
      throw new Error(`${wallConnectionId} selected wall edge ${selectedEdgeId} is not part of a valid panel.`);
    }

    if (selectedPanelIds.has(panel.id)) {
      return panelReferences;
    }
    selectedPanelIds.add(panel.id);

    const references = panel.edgeIds.flatMap((panelEdgeId) => collectEdgeReferenceLabels(panelEdgeId, assignments));

    if (references.length === 0) {
      throw new Error(`${wallConnectionId} selected panel ${panel.id} has 0 E/S reference labels.`);
    }

    if (references.length > 1) {
      throw new Error(`${wallConnectionId} selected panel ${panel.id} has multiple E/S reference labels.`);
    }

    panelReferences.push(references[0]);
    return panelReferences;
  }, []);
};

export const buildActiveWDisplayAssignments = (
  assignments: EdgeAssignmentRecord,
  connections: ConnectionMap,
  activeWGroup: ActiveWGroup | null,
): EdgeAssignmentRecord => {
  if (!activeWGroup?.isActive) {
    return assignments;
  }

  const wConnection = connections[activeWGroup.connectionId];
  if (!wConnection || wConnection.prefix !== 'W') {
    return assignments;
  }

  const displayAssignments: EdgeAssignmentRecord = { ...assignments };
  wConnection.properties.selectedEdgeIds.forEach((edgeId) => {
    const currentBucket = toEdgeAssignmentBucket(displayAssignments[edgeId]) ?? {};
    if (currentBucket.edgeAssignment) {
      return;
    }

    displayAssignments[edgeId] = {
      ...currentBucket,
      edgeAssignment: { connectionId: wConnection.id },
    };
  });

  return displayAssignments;
};

export const classifyWReferencePattern = (references: WallReference[]): WallPatternType | null => {
  if (references.length === 0) {
    return null;
  }

  const roles = references.map((reference) => reference.role);
  const allSame = roles.every((role) => role === roles[0]);
  if (allSame) {
    return 'UNIFORM';
  }

  const alternating = roles.length > 1 && roles.every((role, index) => index === 0 || role !== roles[index - 1]);
  return alternating ? 'ALTERNATING' : null;
};

export const invertWPatternType = (patternType: WallPatternType): WallPatternType => (
  patternType === 'UNIFORM' ? 'ALTERNATING' : 'UNIFORM'
);

export const generateWEdgeRoles = (edgeIds: string[], generatedPatternType: WallPatternType): EdgeRole[] => (
  edgeIds.map((_, index) => (generatedPatternType === 'ALTERNATING' && index % 2 === 1 ? 'B' : 'A'))
);

const shouldCopyMixedEReferenceRoles = (references: WallReference[], referencePatternType: WallPatternType): boolean => (
  referencePatternType === 'ALTERNATING'
  && references.every((reference) => reference.sourceType === 'E' && (reference.role === 'A' || reference.role === 'B'))
);

const buildPanelReferenceRoleMap = (references: WallReference[], svgModel: SvgDocumentModel, wallConnectionId: string) => (
  references.reduce<Map<string, EdgeRole>>((roleByPanelId, reference) => {
    const panel = findPanelContainingEdge(svgModel, reference.edgeId);
    if (!panel) {
      throw new Error(`${wallConnectionId} reference edge ${reference.edgeId} is not part of a valid panel.`);
    }

    roleByPanelId.set(panel.id, reference.role as EdgeRole);
    return roleByPanelId;
  }, new Map<string, EdgeRole>())
);

const copyMixedEReferenceRolesToWEdges = (
  selectedEdgeIds: string[],
  references: WallReference[],
  svgModel: SvgDocumentModel,
  wallConnectionId: string,
): EdgeRole[] => {
  const referenceRoleByPanelId = buildPanelReferenceRoleMap(references, svgModel, wallConnectionId);

  return selectedEdgeIds.map((selectedEdgeId) => {
    const selectedPanel = findPanelContainingEdge(svgModel, selectedEdgeId);
    if (!selectedPanel) {
      throw new Error(`${wallConnectionId} selected wall edge ${selectedEdgeId} is not part of a valid panel.`);
    }

    const referenceRole = referenceRoleByPanelId.get(selectedPanel.id);
    if (!referenceRole) {
      throw new Error(`${wallConnectionId} selected panel ${selectedPanel.id} has no matching E reference role.`);
    }

    return referenceRole;
  });
};

export const finishWGroupWorkflow = (
  connections: ConnectionMap,
  assignments: EdgeAssignmentRecord,
  activeWGroup: ActiveWGroup | null,
  svgModel: SvgDocumentModel,
): { connections: ConnectionMap; assignments: EdgeAssignmentRecord; selectedLabelId: string | null; activeWGroup: ActiveWGroup | null } => {
  if (!activeWGroup?.isActive) {
    return { connections, assignments, selectedLabelId: null, activeWGroup };
  }

  const wConnection = connections[activeWGroup.connectionId];
  if (!wConnection || wConnection.prefix !== 'W') {
    throw new Error('Active W group is missing its W connection metadata.');
  }

  const selectedEdgeIds = wConnection.properties.selectedEdgeIds;
  if (selectedEdgeIds.length === 0) {
    throw new Error(`${activeWGroup.connectionId} has no selected wall edges.`);
  }

  const references = collectWReferences(selectedEdgeIds, assignments, svgModel, activeWGroup.connectionId);

  const referencePatternType = classifyWReferencePattern(references);
  if (!referencePatternType) {
    throw new Error(`${activeWGroup.connectionId} references are neither uniform nor alternating across the complete W group.`);
  }

  const copyMixedERoles = shouldCopyMixedEReferenceRoles(references, referencePatternType);
  const generatedPatternType = copyMixedERoles ? referencePatternType : invertWPatternType(referencePatternType);
  const generatedRoles = copyMixedERoles
    ? copyMixedEReferenceRolesToWEdges(selectedEdgeIds, references, svgModel, activeWGroup.connectionId)
    : generateWEdgeRoles(selectedEdgeIds, generatedPatternType);

  const nextAssignments = { ...assignments };
  selectedEdgeIds.forEach((edgeId, index) => {
    const currentBucket = toEdgeAssignmentBucket(nextAssignments[edgeId]) ?? {};
    nextAssignments[edgeId] = {
      ...currentBucket,
      edgeAssignment: {
        connectionId: wConnection.id,
        edgeRole: generatedRoles[index],
      },
    };
  });

  return {
    connections: {
      ...connections,
      [wConnection.id]: {
        ...wConnection,
        properties: {
          ...wConnection.properties,
          references,
          referencePatternType,
          generatedPatternType,
          generatedConnectionIds: [],
        },
      },
    },
    assignments: nextAssignments,
    selectedLabelId: wConnection.id,
    activeWGroup: { ...activeWGroup, isActive: false },
  };
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

const createConnectionDefinition = (
  id: string,
  prefix: LabelPrefix,
  edgeProperties?: EdgeConnectionProperties,
): ConnectionDefinition => {
  if (prefix === 'E') {
    return { id, prefix, properties: edgeProperties ? { ...edgeProperties } : cloneDefaultProperties(prefix) };
  }

  if (prefix === 'S') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'W') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  if (prefix === 'C') {
    return { id, prefix, properties: cloneDefaultProperties(prefix) };
  }

  return { id, prefix, properties: cloneDefaultProperties(prefix) };
};

const getSharedEdgeProperties = (connections: ConnectionMap): EdgeConnectionProperties => {
  const sharedConnection = Object.values(connections).find(
    (connection): connection is EdgeConnectionDefinition => connection.prefix === 'E',
  );

  return sharedConnection ? { ...sharedConnection.properties } : cloneDefaultProperties('E');
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
  const [edgeAssignments, setEdgeAssignments] = useState<Record<string, EdgeAssignmentBucket>>({});
  const [connections, setConnections] = useState<ConnectionMap>({});
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [appliedEPanelPaths, setAppliedEPanelPaths] = useState<AppliedEPanelPath[]>([]);
  const [appliedSGeometry, setAppliedSGeometry] = useState<AppliedSGeometry[]>([]);
  const [activeSGroup, setActiveSGroup] = useState<ActiveSGroup | null>(null);
  const [activeWGroup, setActiveWGroup] = useState<ActiveWGroup | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const suppressEdgeClickRef = useRef(false);
  const [canvasViewBox, setCanvasViewBox] = useState<CanvasViewBox>(() => parseViewBox(svgModel.viewBox));
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [expandedSGroups, setExpandedSGroups] = useState<Record<string, boolean>>({});
  const [expandedWGroups, setExpandedWGroups] = useState<Record<string, boolean>>({});

  const availableLabels = useMemo(() => Object.keys(connections), [connections]);
  const selectedConnection = selectedLabelId ? connections[selectedLabelId] ?? null : null;
  const selectedEdge = svgModel.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const labelCounts = useMemo(() => {
    return availableLabels.reduce<Record<string, number>>((counts, label) => {
      counts[label] = Object.values(edgeAssignments).reduce((count, assignment) => (
        count
        + (getBucketEdgeAssignment(assignment)?.connectionId === label ? 1 : 0)
        + getBucketSlotAssignments(assignment).filter((slotAssignment) => slotAssignment.connectionId === label).length
      ), 0);
      return counts;
    }, {});
  }, [availableLabels, edgeAssignments]);

  const labelsByGroup = useMemo(() => {
    return labelGroups.map((group) => ({
      ...group,
      labels: availableLabels.filter((label) => getLabelPrefix(label) === group.prefix),
    }));
  }, [availableLabels]);

  const wLabelGroups = useMemo(() => {
    const wLabels = availableLabels
      .filter((label) => getLabelPrefix(label) === 'W')
      .sort((first, second) => getLabelNumber(first) - getLabelNumber(second));

    return wLabels.map((label) => ({
      id: `w-group-${label}`,
      labels: [label],
      isActive: activeWGroup?.connectionId === label && activeWGroup.isActive,
    }));
  }, [activeWGroup, availableLabels]);

  const sLabelGroups = useMemo(() => {
    const sLabels = availableLabels
      .filter((label) => getLabelPrefix(label) === 'S')
      .sort((first, second) => getLabelNumber(first) - getLabelNumber(second));

    if (sLabels.length === 0) {
      return [];
    }

    const groups: { id: string; labels: string[]; isActive: boolean }[] = [];
    const activeIds = activeSGroup?.connectionIds ?? [];
    const firstActiveId = activeIds[0];
    const firstActiveNumber = firstActiveId ? getLabelNumber(firstActiveId) : Number.POSITIVE_INFINITY;
    const previousLabels = sLabels.filter((label) => getLabelNumber(label) < firstActiveNumber);
    const activeLabels = activeIds.filter((label) => sLabels.includes(label));
    const laterLabels = sLabels.filter((label) => getLabelNumber(label) > getLabelNumber(activeIds.at(-1) ?? 'S0'));

    if (previousLabels.length > 0) {
      groups.push({ id: `s-group-${previousLabels[0]}`, labels: previousLabels, isActive: false });
    }

    if (activeLabels.length > 0) {
      groups.push({ id: activeSGroup?.groupId ?? `s-group-${activeLabels[0]}`, labels: activeLabels, isActive: activeSGroup?.isActive ?? false });
    } else if (previousLabels.length === 0) {
      groups.push({ id: `s-group-${sLabels[0]}`, labels: sLabels, isActive: activeSGroup?.isActive ?? false });
    }

    if (laterLabels.length > 0 && activeLabels.length > 0) {
      groups.push({ id: `s-group-${laterLabels[0]}`, labels: laterLabels, isActive: false });
    }

    return groups;
  }, [activeSGroup, availableLabels]);

  const sGroupActionNumber = getSGroupActionNumber(connections, activeSGroup);
  const wGroupActionNumber = getWGroupActionNumber(connections, activeWGroup);

  const hasAssignedEEdges = useMemo(() => {
    return Object.values(edgeAssignments).some((assignment) => getBucketEdgeAssignment(assignment)?.connectionId.startsWith('E'));
  }, [edgeAssignments]);

  const getCurrentHistoryState = (): HistoryState => cloneHistoryState({
    edgeAssignments,
    connections,
    selectedLabelId,
    selectedEdgeId,
    appliedEPanelPaths,
    appliedSGeometry,
    activeSGroup,
    activeWGroup,
  });

  const restoreHistoryState = (state: HistoryState) => {
    const snapshot = cloneHistoryState(state);
    setEdgeAssignments(Object.fromEntries(Object.entries(snapshot.edgeAssignments).map(([edgeId, assignment]) => [edgeId, toEdgeAssignmentBucket(assignment) ?? {}])));
    setConnections(snapshot.connections);
    setSelectedLabelId(snapshot.selectedLabelId);
    setSelectedEdgeId(snapshot.selectedEdgeId);
    setAppliedEPanelPaths(snapshot.appliedEPanelPaths ?? []);
    setAppliedSGeometry(snapshot.appliedSGeometry ?? []);
    setActiveSGroup(snapshot.activeSGroup);
    setActiveWGroup(snapshot.activeWGroup);
  };

  const pushUndoState = () => {
    const snapshot = getCurrentHistoryState();
    setUndoStack((currentStack) => [...currentStack, snapshot].slice(-maxHistoryEntries));
    setRedoStack([]);
  };

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
    setAppliedEPanelPaths([]);
    setAppliedSGeometry([]);
    setActiveSGroup(null);
    setActiveWGroup(null);
    setUndoStack([]);
    setRedoStack([]);
    setErrorMessage('');
    event.target.value = '';
  };

  const handleImportWithError = (event: ChangeEvent<HTMLInputElement>) => {
    handleImport(event).catch((error: Error) => {
      setErrorMessage(error.message);
    });
  };

  const createLabel = (prefix: LabelPrefix) => {
    pushUndoState();

    if (prefix === 'S') {
      const nextWorkflow = manualAddSWorkflow(connections, activeSGroup);
      setConnections(nextWorkflow.connections);
      setActiveSGroup(nextWorkflow.activeSGroup);
      setSelectedLabelId(nextWorkflow.selectedLabelId);
      setErrorMessage('');
      return;
    }

    const nextLabel = getNextLabel(prefix, availableLabels);
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextLabel]: createConnectionDefinition(
        nextLabel,
        prefix,
        prefix === 'E' ? getSharedEdgeProperties(currentConnections) : undefined,
      ),
    }));
    setSelectedLabelId(nextLabel);
    setErrorMessage('');
  };

  const startSGroup = () => {
    pushUndoState();
    const nextWorkflow = startSGroupWorkflow(connections);
    setConnections(nextWorkflow.connections);
    setSelectedLabelId(nextWorkflow.selectedLabelId);
    setActiveSGroup(nextWorkflow.activeSGroup);
    setErrorMessage('');
  };

  const startWGroup = () => {
    pushUndoState();
    const nextWorkflow = startWGroupWorkflow(connections);
    setConnections(nextWorkflow.connections);
    setSelectedLabelId(nextWorkflow.selectedLabelId);
    setActiveWGroup(nextWorkflow.activeWGroup);
    setExpandedWGroups((currentGroups) => ({ ...currentGroups, [nextWorkflow.activeWGroup.groupId]: true }));
    setErrorMessage('');
  };

  const finishWGroup = () => {
    if (!activeWGroup?.isActive) {
      return;
    }

    try {
      pushUndoState();
      const nextWorkflow = finishWGroupWorkflow(connections, edgeAssignments, activeWGroup, svgModel);
      setConnections(nextWorkflow.connections);
      setEdgeAssignments(nextWorkflow.assignments as Record<string, EdgeAssignmentBucket>);
      setSelectedLabelId(nextWorkflow.selectedLabelId);
      setActiveWGroup(nextWorkflow.activeWGroup);
      setExpandedWGroups((currentGroups) => ({ ...currentGroups, [activeWGroup.groupId]: false }));
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finish W group.');
    }
  };

  const finishSGroup = () => {
    if (!activeSGroup?.isActive) {
      return;
    }

    pushUndoState();
    setActiveSGroup(finishSGroupWorkflow(activeSGroup));
    setSelectedLabelId(null);
    setErrorMessage('');
  };

  const clearEdgeLabel = (edgeId: string) => {
    if (!edgeAssignments[edgeId]) {
      return;
    }

    pushUndoState();
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

    if (connection.prefix === 'W') {
      if (!activeWGroup?.isActive || activeWGroup.connectionId !== connection.id) {
        setErrorMessage('Start a W group before selecting wall edges.');
        return;
      }

      pushUndoState();
      setConnections((currentConnections) => {
        const currentConnection = currentConnections[connection.id];
        if (!currentConnection || currentConnection.prefix !== 'W') {
          return currentConnections;
        }
        const selectedEdgeIds = currentConnection.properties.selectedEdgeIds.includes(edgeId)
          ? currentConnection.properties.selectedEdgeIds.filter((selectedEdgeId) => selectedEdgeId !== edgeId)
          : [...currentConnection.properties.selectedEdgeIds, edgeId];
        return {
          ...currentConnections,
          [connection.id]: {
            ...currentConnection,
            properties: {
              ...currentConnection.properties,
              selectedEdgeIds,
            },
          },
        };
      });
      setErrorMessage('');
      return;
    }

    const nextSlotRole = connection.prefix === 'S' ? getDefaultSlotRole(edgeAssignments, selectedLabelId) : null;

    if (connection.prefix === 'S' && !nextSlotRole) {
      if (activeSGroup?.isActive && activeSGroup.connectionIds.includes(selectedLabelId)) {
        const nextWorkflow = maybeAutoCreateNextSInGroup(connections, edgeAssignments, activeSGroup, selectedLabelId);
        setConnections(nextWorkflow.connections);
        setSelectedLabelId(nextWorkflow.selectedLabelId);
        setActiveSGroup(nextWorkflow.activeSGroup);
        setErrorMessage(`${selectedLabelId} is complete. Select the next S connection before assigning another edge.`);
        return;
      }

      setErrorMessage(`${selectedLabelId} is complete. Start S Group or select another S connection before assigning another edge.`);
      return;
    }

    pushUndoState();

    const currentBucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]) ?? {};
    const nextAssignment: EdgeAssignment = {
      connectionId: selectedLabelId,
      ...(connection.prefix === 'E' ? { edgeRole: getDefaultEdgeRole(edgeAssignments, selectedLabelId) } : {}),
      ...(connection.prefix === 'S' && nextSlotRole ? { slotRole: nextSlotRole } : {}),
    };

    if (connection.prefix === 'E') {
      if (currentBucket.edgeAssignment) {
        setErrorMessage('This edge already has an E assignment.');
        return;
      }
    } else if (connection.prefix === 'S') {
      if (nextAssignment.slotRole === 'A' && (currentBucket.edgeAssignment || (currentBucket.slotAssignments?.length ?? 0) > 0)) {
        setErrorMessage('S-A cannot share an edge with another assignment.');
        return;
      }

      if (nextAssignment.slotRole === 'B' && (currentBucket.slotAssignments?.length ?? 0) > 0) {
        setErrorMessage('This edge already has an S assignment.');
        return;
      }
    }

    const nextAssignments = {
      ...edgeAssignments,
      [edgeId]: connection.prefix === 'E'
        ? { ...currentBucket, edgeAssignment: nextAssignment }
        : { ...currentBucket, slotAssignments: [...(currentBucket.slotAssignments ?? []), nextAssignment] },
    };
    setEdgeAssignments(nextAssignments);


    const selectedLabelAssignmentCount = Object.values(nextAssignments).reduce((count, assignment) => (
      count
      + (getBucketEdgeAssignment(assignment)?.connectionId === selectedLabelId ? 1 : 0)
      + getBucketSlotAssignments(assignment).filter((slotAssignment) => slotAssignment.connectionId === selectedLabelId).length
    ), 0);
    const nextEdgeLabel = selectedLabelAssignmentCount === 2 ? getFollowingEdgeLabel(selectedLabelId) : null;

    if (connection.prefix === 'E' && nextEdgeLabel) {
      setConnections((currentConnections) => {
        if (currentConnections[nextEdgeLabel]) {
          return currentConnections;
        }

        return {
          ...currentConnections,
          [nextEdgeLabel]: createConnectionDefinition(
            nextEdgeLabel,
            'E',
            getSharedEdgeProperties(currentConnections),
          ),
        };
      });
      setSelectedLabelId(nextEdgeLabel);
    }

    const selectedSlotRoles = Object.values(nextAssignments)
      .flatMap((assignment) => getBucketSlotAssignments(assignment))
      .filter((assignment) => assignment.connectionId === selectedLabelId)
      .map((assignment) => assignment.slotRole);
    const nextSlotLabel = selectedSlotRoles.includes('A') && selectedSlotRoles.includes('B')
      ? getFollowingSlotLabel(selectedLabelId)
      : null;

    if (connection.prefix === 'S' && nextSlotLabel) {
      const nextWorkflow = maybeAutoCreateNextSInGroup(connections, nextAssignments, activeSGroup, selectedLabelId);
      setConnections(nextWorkflow.connections);
      setSelectedLabelId(nextWorkflow.selectedLabelId);
      setActiveSGroup(nextWorkflow.activeSGroup);
    }

    setErrorMessage('');
  };

  const updateAssignedEdgeRole = (edgeId: string, edgeRole: EdgeRole) => {
    const bucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]);
    const assignment = bucket?.edgeAssignment;
    const connection = assignment ? connections[assignment.connectionId] : undefined;

    if (!bucket || !assignment || connection?.prefix !== 'E' || assignment.edgeRole === edgeRole) {
      return;
    }

    pushUndoState();
    setEdgeAssignments((currentAssignments) => ({
      ...currentAssignments,
      [edgeId]: {
        ...bucket,
        edgeAssignment: {
          ...assignment,
          edgeRole,
        },
      },
    }));
    setErrorMessage('');
  };

  const updateAssignedSlotRole = (edgeId: string, slotRole: SlotRole) => {
    const bucket = toEdgeAssignmentBucket(edgeAssignments[edgeId]);
    const assignment = bucket?.slotAssignments?.[0];
    const connection = assignment ? connections[assignment.connectionId] : undefined;

    if (!bucket || !assignment || connection?.prefix !== 'S' || assignment.slotRole === slotRole) {
      return;
    }

    pushUndoState();
    setEdgeAssignments((currentAssignments) => ({
      ...currentAssignments,
      [edgeId]: {
        ...bucket,
        slotAssignments: [{
          ...assignment,
          slotRole,
        }],
      },
    }));
    setErrorMessage('');
  };

  const clearSelectedLabel = () => {
    if (!selectedEdgeId) {
      return;
    }

    clearEdgeLabel(selectedEdgeId);
  };

  const applyPanelPaths = () => {
    try {
      const nextAppliedEPanelPaths = buildAppliedEPanelPaths(svgModel, edgeAssignments, connections, true);
      const nextAppliedSGeometry = buildAppliedSGeometry(svgModel, edgeAssignments, connections);
      setAppliedEPanelPaths(nextAppliedEPanelPaths);
      setAppliedSGeometry(nextAppliedSGeometry);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to apply geometry.');
    }
  };

  const undoLastEdit = () => {
    const previousState = undoStack[undoStack.length - 1];

    if (!previousState) {
      return;
    }

    setRedoStack((currentStack) => [...currentStack, getCurrentHistoryState()].slice(-maxHistoryEntries));
    setUndoStack((currentStack) => currentStack.slice(0, -1));
    restoreHistoryState(previousState);
    setErrorMessage('');
  };

  const redoLastEdit = () => {
    const nextState = redoStack[redoStack.length - 1];

    if (!nextState) {
      return;
    }

    setUndoStack((currentStack) => [...currentStack, getCurrentHistoryState()].slice(-maxHistoryEntries));
    setRedoStack((currentStack) => currentStack.slice(0, -1));
    restoreHistoryState(nextState);
    setErrorMessage('');
  };

  const deleteDrawing = () => {
    setSvgModel(emptySvgModel);
    setEdgeAssignments({});
    setConnections({});
    setSelectedLabelId(null);
    setSelectedEdgeId(null);
    setAppliedEPanelPaths([]);
    setAppliedSGeometry([]);
    setActiveSGroup(null);
    setActiveWGroup(null);
    setErrorMessage('');
    setUndoStack([]);
    setRedoStack([]);
    setCanvasViewBox(parseViewBox(emptySvgModel.viewBox));
  };

  const updateEdgeProperties = (updates: Partial<EdgeConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'E') {
      return;
    }

    pushUndoState();
    setConnections((currentConnections) => {
      const currentSelectedConnection = currentConnections[selectedConnection.id];

      if (!currentSelectedConnection || currentSelectedConnection.prefix !== 'E') {
        return currentConnections;
      }

      const nextProperties: EdgeConnectionProperties = {
        ...currentSelectedConnection.properties,
        ...updates,
      };

      if (updates.materialThicknessMm !== undefined && !currentSelectedConnection.properties.isFingerWidthManual) {
        nextProperties.fingerWidthMm = updates.materialThicknessMm * 3;
      }

      if (updates.fingerWidthMm !== undefined) {
        nextProperties.isFingerWidthManual = true;
      }

      return Object.fromEntries(
        Object.entries(currentConnections).map(([connectionId, connection]) => [
          connectionId,
          connection.prefix === 'E'
            ? {
                ...connection,
                properties: {
                  ...connection.properties,
                  fingerWidthMm: nextProperties.fingerWidthMm,
                  materialThicknessMm: nextProperties.materialThicknessMm,
                  isFingerWidthManual: nextProperties.isFingerWidthManual,
                },
              }
            : connection,
        ]),
      );
    });
  };

  const updateSlotProperties = (updates: Partial<SlotConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'S') {
      return;
    }
    pushUndoState();
    setConnections((currentConnections) => {
      if (activeSGroup?.isActive && activeSGroup.connectionIds.includes(selectedConnection.id)) {
        return applyActiveSGroupSlotPropertyUpdates(currentConnections, activeSGroup, updates);
      }

      const currentSelectedConnection = currentConnections[selectedConnection.id];

      if (!currentSelectedConnection || currentSelectedConnection.prefix !== 'S') {
        return currentConnections;
      }

      return {
        ...currentConnections,
        [currentSelectedConnection.id]: applySlotPropertyUpdates(currentSelectedConnection, updates),
      };
    });
  };

  const updateWallProperties = (updates: Partial<WallConnectionProperties>) => {
    if (!selectedConnection || selectedConnection.prefix !== 'W') {
      return;
    }

    pushUndoState();
    setConnections((currentConnections) => ({
      ...currentConnections,
      [selectedConnection.id]: {
        ...selectedConnection,
        properties: {
          ...selectedConnection.properties,
          ...updates,
        },
      },
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
    pushUndoState();
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
    pushUndoState();
    setConnections((currentConnections) => ({
      ...currentConnections,
      [nextConnection.id]: nextConnection,
    }));
  };

  const exportSvg = () => {
    // Export after Apply is clean laser geometry; export before Apply remains label/reference export.
    const hasAppliedGeometry = appliedEPanelPaths.length > 0 || appliedSGeometry.length > 0;
    const output = hasAppliedGeometry
      ? exportAppliedSvg(svgModel, appliedEPanelPaths, appliedSGeometry)
      : exportLabeledSvg(svgModel.content, edgeAssignments, svgModel.edges);
    const blob = new Blob([output], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = hasAppliedGeometry
        ? 'svg-box-designer-applied.svg'
        : 'svg-box-designer-labeled.svg';
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

  const fitCanvasToScreen = () => {
    const fallbackViewBox = parseViewBox(svgModel.viewBox);
    let contentBounds: SourceBounds | null = null;
    const includePointInBounds = (point: Point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }

      contentBounds = contentBounds
        ? {
          minX: Math.min(contentBounds.minX, point.x),
          maxX: Math.max(contentBounds.maxX, point.x),
          minY: Math.min(contentBounds.minY, point.y),
          maxY: Math.max(contentBounds.maxY, point.y),
        }
        : { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
    };
    const includeBounds = (bounds: SourceBounds) => {
      includePointInBounds({ x: bounds.minX, y: bounds.minY });
      includePointInBounds({ x: bounds.maxX, y: bounds.maxY });
    };

    svgModel.edges.forEach((edge) => {
      includePointInBounds(edge.start);
      includePointInBounds(edge.end);
    });
    svgModel.panels.forEach((panel) => {
      includeBounds(panel.bounds);
    });
    appliedEPanelPaths.forEach((panelPath) => {
      includeBounds(panelPath.eraseRect);
    });

    if (!contentBounds) {
      setCanvasViewBox(fallbackViewBox);
      return;
    }

    const fittedContentBounds = contentBounds as SourceBounds;
    const contentWidth = Math.max(fittedContentBounds.maxX - fittedContentBounds.minX, fallbackViewBox.width * 0.01, 1);
    const contentHeight = Math.max(fittedContentBounds.maxY - fittedContentBounds.minY, fallbackViewBox.height * 0.01, 1);
    const paddedWidth = contentWidth * 1.2;
    const paddedHeight = contentHeight * 1.2;
    const svgElement = svgRef.current;
    const canvasAspectRatio = svgElement && svgElement.clientWidth > 0 && svgElement.clientHeight > 0
      ? svgElement.clientWidth / svgElement.clientHeight
      : fallbackViewBox.width / fallbackViewBox.height;
    const safeCanvasAspectRatio = Number.isFinite(canvasAspectRatio) && canvasAspectRatio > 0
      ? canvasAspectRatio
      : 1;
    const contentAspectRatio = paddedWidth / paddedHeight;
    const fittedWidth = contentAspectRatio > safeCanvasAspectRatio
      ? paddedWidth
      : paddedHeight * safeCanvasAspectRatio;
    const fittedHeight = contentAspectRatio > safeCanvasAspectRatio
      ? paddedWidth / safeCanvasAspectRatio
      : paddedHeight;
    const centerX = (fittedContentBounds.minX + fittedContentBounds.maxX) / 2;
    const centerY = (fittedContentBounds.minY + fittedContentBounds.maxY) / 2;

    setCanvasViewBox({
      x: centerX - fittedWidth / 2,
      y: centerY - fittedHeight / 2,
      width: Math.max(fittedWidth, 1),
      height: Math.max(fittedHeight, 1),
    });
  };

  const handleCanvasWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (!event.ctrlKey) {
      return;
    }

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
      return <p className="muted">Select E1, S1, W1, C1, or P1 to edit its saved connection properties.</p>;
    }

    if (selectedConnection.prefix === 'E') {
      const properties = selectedConnection.properties;
      const assignedEEdges = svgModel.edges.filter((edge) => getBucketEdgeAssignment(edgeAssignments[edge.id])?.connectionId === selectedConnection.id);
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
                        <dd>{formatEdgeRoleLabel(getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole)}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-edge-role`}
                      label="Role"
                      value={getBucketEdgeAssignment(edgeAssignments[edge.id])?.edgeRole ?? 'A'}
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
            <p className="muted">Edge settings are shared across all E connections.</p>
          </section>

        </div>
      );
    }

    if (selectedConnection.prefix === 'S') {
      const properties = selectedConnection.properties;
      const assignedSEdges = svgModel.edges.filter((edge) => getBucketSlotAssignments(edgeAssignments[edge.id]).some((assignment) => assignment.connectionId === selectedConnection.id));

      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="slot-assigned-edges">
            <h4 id="slot-assigned-edges">Assigned edges</h4>
            {assignedSEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {assignedSEdges.map((edge) => (
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
                        <dd>{formatEdgeRoleLabel(getBucketSlotAssignments(edgeAssignments[edge.id]).find((assignment) => assignment.connectionId === selectedConnection.id)?.slotRole)}</dd>
                      </div>
                    </dl>
                    <SelectField
                      id={`${edge.id}-slot-role`}
                      label="Role"
                      value={getBucketSlotAssignments(edgeAssignments[edge.id]).find((assignment) => assignment.connectionId === selectedConnection.id)?.slotRole ?? 'A'}
                      options={['A', 'B']}
                      onChange={(slotRole) => updateAssignedSlotRole(edge.id, slotRole as SlotRole)}
                    />
                    <button type="button" onClick={() => clearEdgeLabel(edge.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No edges assigned to this S label yet. Select this label, then click the S-A and S-B edges in the drawing.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="slot-basic-properties">
            <h4 id="slot-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="slot-offset" label="Slot offset inward from selected S-B edge (mm)" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
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

    if (selectedConnection.prefix === 'W') {
      const properties = selectedConnection.properties;
      const selectedEdges = svgModel.edges.filter((edge) => properties.selectedEdgeIds.includes(edge.id));
      return (
        <div className="property-sections">
          <section className="property-section" aria-labelledby="wall-assigned-edges">
            <h4 id="wall-assigned-edges">W group metadata</h4>
            {selectedEdges.length > 0 ? (
              <ul className="calculated-edge-list">
                {selectedEdges.map((edge) => (
                  <li key={edge.id}>
                    <strong>{edge.id}</strong>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{edge.source}</dd>
                      </div>
                      <div>
                        <dt>References</dt>
                        <dd>{getEdgeAssignmentDisplayLabels(edgeAssignments[edge.id]).join(', ') || 'None'}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Start this W group, then click wall edges that already carry E or S references.</p>
            )}
            {properties.referencePatternType && properties.generatedPatternType && (
              <p className="muted">Reference pattern: {properties.referencePatternType}; W role pattern: {properties.generatedPatternType}.</p>
            )}
          </section>

          <section className="property-section" aria-labelledby="wall-basic-properties">
            <h4 id="wall-basic-properties">Basic</h4>
            <div className="property-grid">
              <NumericField id="wall-material-thickness" label="Material thickness (mm)" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateWallProperties({ materialThicknessMm })} />
              <NumericField id="wall-tab-size" label="Tab size (mm)" min={0} value={properties.fingerWidthMm} onChange={(fingerWidthMm) => updateWallProperties({ fingerWidthMm })} />
            </div>
            <p className="muted">W stores its own finished edge assignments and uses W material thickness and tab size.</p>
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

  const renderCompactControls = () => {
    if (selectedConnection?.prefix === 'E') {
      const properties = selectedConnection.properties;

      return (
        <div className="compact-property-controls" aria-label="Compact E controls">
          <NumericField id="compact-edge-material-thickness" label="Thickness" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateEdgeProperties({ materialThicknessMm })} />
          <NumericField id="compact-edge-tab-size" label="Tab" min={0} value={properties.fingerWidthMm} onChange={(fingerWidthMm) => updateEdgeProperties({ fingerWidthMm })} />
        </div>
      );
    }

    if (selectedConnection?.prefix === 'S' && (activeSGroup?.isActive || selectedConnection)) {
      const properties = selectedConnection.properties;
      const controlsLabel = activeSGroup?.isActive && activeSGroup.connectionIds.includes(selectedConnection.id)
        ? 'Compact active S group controls'
        : 'Compact selected S controls';

      return (
        <div className="compact-property-controls" aria-label={controlsLabel}>
          <NumericField id="compact-slot-material-thickness" label="Thickness" min={0} value={properties.materialThicknessMm} onChange={(materialThicknessMm) => updateSlotProperties({ materialThicknessMm })} />
          <NumericField id="compact-slot-tab-size" label="Tab" min={0} value={properties.slotLengthMm} onChange={(slotLengthMm) => updateSlotProperties({ slotLengthMm })} />
          <NumericField id="compact-slot-offset" label="Offset" value={properties.slotOffsetMm} onChange={(slotOffsetMm) => updateSlotProperties({ slotOffsetMm })} />
        </div>
      );
    }

    return null;
  };

  const baseViewBox = parseViewBox(svgModel.viewBox);
  const labelZoom = Math.max(minZoom, baseViewBox.width / canvasViewBox.width);
  const labelScreenFontSize = Math.max(minLabelFontSizePx, labelFontSizePx);
  const labelScale = labelScreenFontSize / labelZoom / labelFontSizePx;
  const labelEdgeOffset = labelEdgeOffsetPx / labelZoom;
  const displayEdgeAssignments = useMemo(
    () => buildActiveWDisplayAssignments(edgeAssignments, connections, activeWGroup),
    [activeWGroup, connections, edgeAssignments],
  );
  const labelPlacements = getEdgeLabelPlacements(svgModel.edges, displayEdgeAssignments, {
    fontSizePx: labelFontSizePx,
    paddingXPx: labelPaddingXPx,
    paddingYPx: labelPaddingYPx,
    edgeOffsetPx: labelEdgeOffset,
    labelScale,
  });
  const labelPlacementsByEdgeId = labelPlacements.reduce((placementsByEdgeId, placement) => {
    placementsByEdgeId.set(placement.edgeId, [...(placementsByEdgeId.get(placement.edgeId) ?? []), placement]);
    return placementsByEdgeId;
  }, new Map<string, typeof labelPlacements>());
  const appliedEEdgeIds = useMemo(
    () => new Set(appliedEPanelPaths.flatMap((panelPath) => panelPath.edgeIds)),
    [appliedEPanelPaths],
  );
  const appliedSPanelEdgeIds = useMemo(
    () => new Set(appliedSGeometry.flatMap((geometry) => geometry.panelPaths.flatMap((panelPath) => panelPath.edgeIds))),
    [appliedSGeometry],
  );


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
          <button className="button destructive" type="button" onClick={deleteDrawing}>
            Delete Drawing
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
            Create a connection, select it, tune its parameters, then click edges from your custom SVG. This app assigns reusable labels and can apply E finger-joint geometry to closed panel outlines.
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
                  <div className="label-actions">
                    {prefix === 'S' ? (
                      <>
                        <button type="button" onClick={startSGroup}>Start S Group {sGroupActionNumber}</button>
                        <button type="button" onClick={finishSGroup} disabled={!activeSGroup?.isActive}>Finish S Group {sGroupActionNumber}</button>
                      </>
                    ) : prefix === 'W' ? (
                      <>
                        <button type="button" onClick={startWGroup}>Start W Group {wGroupActionNumber}</button>
                        <button type="button" onClick={finishWGroup} disabled={!activeWGroup?.isActive}>Finish W Group {wGroupActionNumber}</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => createLabel(prefix)}>
                        Add {getNextLabel(prefix, availableLabels)}
                      </button>
                    )}
                  </div>
                </div>

                {groupLabels.length > 0 ? (
                  prefix === 'S' ? (
                    <ul className="label-list s-group-list">
                      {sLabelGroups.map((sGroup, groupIndex) => {
                        const isExpanded = sGroup.isActive || expandedSGroups[sGroup.id] === true;
                        const groupName = getSGroupDisplayName(groupIndex);
                        const groupCount = sGroup.labels.length;

                        return (
                          <li key={sGroup.id}>
                            <button
                              type="button"
                              className={`s-group-toggle${sGroup.labels.includes(selectedLabelId ?? '') ? ' selected-label' : ''}`}
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedSGroups((currentGroups) => ({ ...currentGroups, [sGroup.id]: !isExpanded }))}
                            >
                              <strong>{groupName} ({groupCount})</strong>
                              <span>{isExpanded ? 'Hide' : 'Show'}</span>
                            </button>
                            {isExpanded && (
                              <ul className="s-group-connection-list">
                                {sGroup.labels.map((label) => (
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
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : prefix === 'W' ? (
                    <ul className="label-list s-group-list">
                      {wLabelGroups.map((wGroup, groupIndex) => {
                        const label = wGroup.labels[0];
                        const isExpanded = wGroup.isActive || expandedWGroups[wGroup.id] === true;
                        const connection = connections[label];
                        const selectedCount = connection?.prefix === 'W' ? connection.properties.selectedEdgeIds.length : 0;
                        return (
                          <li key={wGroup.id}>
                            <button
                              type="button"
                              className={`s-group-toggle${selectedLabelId === label ? ' selected-label' : ''}`}
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedWGroups((currentGroups) => ({ ...currentGroups, [wGroup.id]: !isExpanded }))}
                            >
                              <strong>W Group {groupIndex + 1} ({selectedCount})</strong>
                              <span>{isExpanded ? 'Hide' : 'Show'}</span>
                            </button>
                            {isExpanded && (
                              <ul className="s-group-connection-list">
                                <li>
                                  <button
                                    type="button"
                                    className={selectedLabelId === label ? 'selected-label' : ''}
                                    onClick={() => {
                                      setSelectedLabelId(label);
                                      setErrorMessage('');
                                    }}
                                  >
                                    <strong>{label}</strong>
                                    <span>{selectedCount} {selectedCount === 1 ? 'wall edge' : 'wall edges'}</span>
                                  </button>
                                </li>
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
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
                  )
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
              <button type="button" onClick={resetCanvasView}>Reset view</button>
              <button type="button" onClick={fitCanvasToScreen}>Fit to screen</button>
              <button type="button" onClick={applyPanelPaths} disabled={Object.keys(edgeAssignments).length === 0}>Apply</button>
            </div>
          </div>

          <div className="canvas-frame">
            <div className="canvas-history-controls" aria-label="Canvas history controls">
              <button type="button" onClick={undoLastEdit} disabled={undoStack.length === 0} aria-label="Undo">↶</button>
              <button type="button" onClick={redoLastEdit} disabled={redoStack.length === 0} aria-label="Redo">↷</button>
              {renderCompactControls()}
            </div>
            <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
              <button type="button" onClick={() => zoomCanvas(buttonZoomFactor)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => zoomCanvas(1 / buttonZoomFactor)} aria-label="Zoom out">−</button>
            </div>
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
              <g className="applied-s-geometry-layer">
                {appliedSGeometry.map((geometry) => (
                  <g key={geometry.connectionId}>
                    {geometry.panelPaths.map((panelPath) => (
                      <g key={panelPath.sourceEdgeId}>
                        <rect
                          className="applied-e-panel-erase"
                          x={panelPath.eraseRect.minX}
                          y={panelPath.eraseRect.minY}
                          width={panelPath.eraseRect.maxX - panelPath.eraseRect.minX}
                          height={panelPath.eraseRect.maxY - panelPath.eraseRect.minY}
                        />
                        <path className="applied-e-panel-erase-contour" d={panelPath.erasePathD} />
                        <path className="applied-e-panel-path" d={panelPath.pathD} />
                      </g>
                    ))}
                    {geometry.slotPaths.map((slotPath) => (
                      <path
                        key={`${slotPath.connectionId}-${slotPath.startDistance}-${slotPath.endDistance}`}
                        className="applied-s-slot-path"
                        d={slotPath.pathD}
                      />
                    ))}
                  </g>
                ))}
              </g>
              <g className="edge-overlays">
                  {svgModel.edges.map((edge) => {
                  const assignment = displayEdgeAssignments[edge.id];
                  const labels = getEdgeAssignmentDisplayLabels(assignment);
                  const label = labels[0];
                  const selected = selectedEdgeId === edge.id;
                  const edgeLabelPlacements = labelPlacementsByEdgeId.get(edge.id) ?? [];
                  const showHighlight = (label || selected) && !appliedEEdgeIds.has(edge.id) && !appliedSPanelEdgeIds.has(edge.id);

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
                      {edgeLabelPlacements.map((labelPlacement) => (
                        <g
                          className="edge-label"
                          key={`${edge.id}-${labelPlacement.label}`}
                          transform={`translate(${labelPlacement.x} ${labelPlacement.y}) scale(${labelScale})`}
                        >
                          <rect
                            className="edge-label-background"
                            x={-labelPlacement.width / 2}
                            y={-labelPlacement.height / 2}
                            width={labelPlacement.width}
                            height={labelPlacement.height}
                            rx={5}
                          />
                          <text
                            className="edge-label-text"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {labelPlacement.label.split('\n').map((displayLabel, index, allLabels) => (
                              <tspan
                                key={displayLabel}
                                x={0}
                                dy={index === 0 ? `${-0.5 * (allLabels.length - 1)}em` : '1em'}
                              >
                                {displayLabel}
                              </tspan>
                            ))}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                  })}
                </g>
            </svg>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
