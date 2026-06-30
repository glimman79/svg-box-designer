import type { AppliedEPanelPath, ConnectionMap, EdgeConnectionDefinition } from './connectionTypes';
import { getBucketEdgeAssignment } from './assignmentBuckets';
import type { EdgeAssignmentRecord, EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../svgUtils';
import {
  buildContourSides,
  cornerTouchTolerance,
  createTabSegmentPlan,
  getContourSideLength,
  getContourSignedArea,
  interpolateSidePoint,
  isContourSideReversedFromCanonical,
  lineIntersection,
  mirrorSegments,
  offsetContourSide,
  pointsMatch,
  pointsToClosedPathD,
  projectPointDistanceOnSide,
} from './sharedGeometry';
import type { ContourSide, TabSegment } from './sharedGeometry';
import { validateClosedPanel } from './sharedPanelGeometry';

type PanelPoint = Point;

export type PanelThicknessMetadata = { panelId: string; thicknessMm: number };

export type PanelThicknessState = { panels?: Record<string, PanelThicknessMetadata>; defaultThicknessMm?: number };

export type PanelContour = PanelPoint[];


const getPanelContourSidePoints = (panel: SvgPanel, contourIndex: number) => ({
  start: panel.contour[contourIndex],
  end: panel.contour[(contourIndex + 1) % panel.contour.length],
});

const getRoleTabSegments = (
  segments: TabSegment[],
  role: EdgeRole,
): TabSegment[] => (
  segments.filter((_, segmentIndex) => (
    role === 'B'
      ? segmentIndex % 2 === 0
      : segmentIndex % 2 === 1
  ))
);

export type ContourSideOffsetPlan = {
  sideIndex: number;
  edgeId: string;
  offsetDistance: number;
};

export type PanelEdgeOperation = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole;
  materialThicknessMm: number;
  fingerWidthMm: number;
  insetDepthMm?: number;
};

export type TabSegmentPlan = {
  connectionId: string;
  insetLength: number;
  originalSideLengths: number[];
  segments: TabSegment[];
};

export type PanelTabOperation = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole;
  materialThicknessMm: number;
  fingerWidthMm: number;
  insetDepthMm?: number;
  insetLength: number;
  segments: TabSegment[];
};

export type PanelGeometryBuildResult =
  | { ok: true; contour: PanelContour }
  | { ok: false; reason: string };



export const getPanelThickness = (
  panelId: string | null | undefined,
  panelThicknessState?: PanelThicknessState,
  fallbackThicknessMm = 3,
): number => {
  const pmThickness = panelId ? panelThicknessState?.panels?.[panelId]?.thicknessMm : undefined;

  if (Number.isFinite(pmThickness) && (pmThickness as number) > 0) {
    return pmThickness as number;
  }

  if (Number.isFinite(fallbackThicknessMm) && fallbackThicknessMm > 0) {
    return fallbackThicknessMm;
  }

  const defaultThickness = panelThicknessState?.defaultThicknessMm;
  return Number.isFinite(defaultThickness) && (defaultThickness as number) > 0 ? defaultThickness as number : 3;
};

export const getPanelThicknessForEdge = (
  svgModel: SvgDocumentModel,
  edgeId: string,
  panelThicknessState?: PanelThicknessState,
  fallbackThicknessMm = 3,
): number => {
  const panel = svgModel.panels.find((candidate) => candidate.edgeIds.includes(edgeId));
  return getPanelThickness(panel?.id, panelThicknessState, fallbackThicknessMm);
};

type TBConnectionThickness = {
  panelAId: string | null;
  panelBId: string | null;
  panelAThicknessMm: number;
  panelBThicknessMm: number;
  autoFingerWidthMm: number;
};

type AssignedTBEdge = { edgeId: string; role: EdgeRole };

const getAssignedTBEdges = (
  assignments: EdgeAssignmentRecord,
  connectionId: string,
): AssignedTBEdge[] => (
  Object.entries(assignments).flatMap(([edgeId, bucket]) => {
    const assignment = getBucketEdgeAssignment(bucket);
    return assignment?.connectionId === connectionId && assignment.edgeRole
      ? [{ edgeId, role: assignment.edgeRole }]
      : [];
  })
);

const getAssignedPanelForRole = (
  svgModel: SvgDocumentModel,
  assignedEdges: AssignedTBEdge[],
  role: EdgeRole,
): SvgPanel | null => {
  const edgeId = assignedEdges.find((assignment) => assignment.role === role)?.edgeId;
  return edgeId ? svgModel.panels.find((panel) => panel.edgeIds.includes(edgeId)) ?? null : null;
};

const getTBRoleThickness = (
  thickness: TBConnectionThickness,
  role: EdgeRole,
): { ownerThicknessMm: number; receiverThicknessMm: number } => (
  role === 'A'
    ? { ownerThicknessMm: thickness.panelAThicknessMm, receiverThicknessMm: thickness.panelBThicknessMm }
    : { ownerThicknessMm: thickness.panelBThicknessMm, receiverThicknessMm: thickness.panelAThicknessMm }
);

export const resolveTBThickness = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: EdgeConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
): TBConnectionThickness => {
  const assignedEdges = getAssignedTBEdges(assignments, connection.id);
  const panelA = getAssignedPanelForRole(svgModel, assignedEdges, 'A');
  const panelB = getAssignedPanelForRole(svgModel, assignedEdges, 'B');
  const legacyThicknessMm = connection.properties.materialThicknessMm;
  const panelAThicknessMm = getPanelThickness(panelA?.id, panelThicknessState, legacyThicknessMm);
  const panelBThicknessMm = getPanelThickness(panelB?.id, panelThicknessState, legacyThicknessMm);

  return {
    panelAId: panelA?.id ?? null,
    panelBId: panelB?.id ?? null,
    panelAThicknessMm,
    panelBThicknessMm,
    autoFingerWidthMm: 3 * Math.min(panelAThicknessMm, panelBThicknessMm),
  };
};

export const recalculateAutomaticTBFingerWidths = (
  _svgModel: SvgDocumentModel,
  _assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  _panelThicknessState?: PanelThicknessState,
): ConnectionMap => connectionMap;

export const getPanelEdgeOperations = (
  panel: SvgPanel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelThicknessState?: PanelThicknessState,
  svgModel?: SvgDocumentModel,
): PanelEdgeOperation[] => (
  panel.edgeIds.flatMap((edgeId) => {
    const assignment = getBucketEdgeAssignment(assignments[edgeId]);
    const connection = assignment ? connectionMap[assignment.connectionId] : undefined;

    if (!assignment || (connection?.prefix !== 'E' && connection?.prefix !== 'W') || !assignment.edgeRole) {
      return [];
    }

    const connectionThickness = svgModel && connection.prefix === 'E'
      ? resolveTBThickness(svgModel, assignments, connection, panelThicknessState)
      : null;
    const { ownerThicknessMm, receiverThicknessMm } = connectionThickness
      ? getTBRoleThickness(connectionThickness, assignment.edgeRole)
      : {
          ownerThicknessMm: connection.properties.materialThicknessMm,
          receiverThicknessMm: connection.properties.materialThicknessMm,
        };

    return [{
      edgeId,
      connectionId: assignment.connectionId,
      role: assignment.edgeRole,
      materialThicknessMm: ownerThicknessMm,
      insetDepthMm: receiverThicknessMm,
      fingerWidthMm: connection.prefix !== 'E' || connection.properties.isFingerWidthManual || !connectionThickness
        ? connection.properties.fingerWidthMm
        : connectionThickness.autoFingerWidthMm,
    }];
  })
);

export const buildAppliedEPanelPaths = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelThicknessState?: PanelThicknessState,
): AppliedEPanelPath[] => {
  const edgesById = new Map(svgModel.edges.map((edge) => [edge.id, edge]));
  const insetPanelOperations = svgModel.panels.flatMap((panel) => {
    const operations = getPanelEdgeOperations(panel, assignments, connectionMap, panelThicknessState, svgModel);
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


export const clonePanelContour = (panel: SvgPanel): PanelContour => (
  panel.contour.map((point) => ({ x: point.x, y: point.y }))
);


export const validatePanelContour = (contour: PanelContour): PanelGeometryBuildResult => {
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

export const buildContourSideOffsetPlan = (
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
      offsetDistance: operation ? operation.insetDepthMm ?? operation.materialThicknessMm : 0,
    };
  })
);

export const applyContourSideOffsetPlan = (
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

    const side = getPanelContourSidePoints(panel, sideIndex);
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
    plansByConnectionId.set(connectionId, {
      connectionId,
      insetLength: shortestLength,
      originalSideLengths: lengths,
      segments: createTabSegmentPlan(shortestLength, fingerWidthByConnectionId.get(connectionId) ?? 0),
    });
  });

  return plansByConnectionId;
};

export const mergeTabSegmentPlansByConnectionId = (
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

export const clipOriginalSegmentsToInsetSide = (
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

export const buildTabOperations = (
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

export const addContourPoint = (contour: PanelContour, point: Point) => {
  const previousPoint = contour[contour.length - 1];

  if (!previousPoint || !pointsMatch(previousPoint, point)) {
    contour.push(point);
  }
};

const getOperationDepthMm = (operation: Pick<PanelEdgeOperation, 'insetDepthMm' | 'materialThicknessMm'>): number => (
  operation.insetDepthMm ?? operation.materialThicknessMm
);

export const isBBCorner = (
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
export const addBBCornerJoin = (
  tabbedContour: PanelContour,
  insetCorner: Point,
  previousInsetSide: ContourSide,
  currentInsetSide: ContourSide,
  depthMm: number,
  contourWindingSign: number,
): void => {
  const previousOutwardSide = offsetContourSide(previousInsetSide, -depthMm * contourWindingSign);
  const currentOutwardSide = offsetContourSide(currentInsetSide, -depthMm * contourWindingSign);

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
export const removeInteriorBacktrackSpurs = (contour: PanelContour): PanelContour => {
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
          getOperationDepthMm(currentOperation),
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

    const operationDepthMm = getOperationDepthMm(operation);
    const outwardSide = offsetContourSide(side, -operationDepthMm * contourWindingSign);

    if (!outwardSide) {
      addContourPoint(tabbedContour, side.end);
      return;
    }

    const originalSide = getPanelContourSidePoints(panel, sideIndex);
    const originalSideLength = getContourSideLength(originalSide);
    const reversedFromCanonical = isContourSideReversedFromCanonical(originalSide);
    const orientedSegments = reversedFromCanonical
      ? mirrorSegments(operation.segments, originalSideLength)
      : operation.segments;
    const roleSegments = getRoleTabSegments(orientedSegments, operation.role);
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
): PanelGeometryBuildResult => {
  const tabOperations = buildTabOperations(panel, operations, tabSegmentPlansByConnectionId);
  const tabResult = applyTabsToContour(panel, insetContour, tabOperations);

  if (!tabResult.ok) {
    return tabResult;
  }

  const finalValidation = validatePanelContour(tabResult.contour);

  if (!finalValidation.ok) {
    return finalValidation;
  }

  return { ok: true, contour: tabResult.contour };
};

