import type { ConnectionMap, TBConnectionDefinition } from './connectionTypes';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { createBoundaryProfileGroup, createGeneratedProfile } from './generatedProfiles';
import { createGeneratedTapId } from './generatedTaps';
import type { GeneratedTapGroup, GeneratedTapSegmentRole } from './generatedTaps';
import { generatedManufacturingMetadata } from './manufacturingMetadata';
import { getBucketEdgeAssignment } from './assignmentBuckets';
import type { EdgeAssignmentRecord, EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../svgUtils';
import {
  addContourPoint,
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
  removeInteriorBacktrackSpurs,
} from './sharedGeometry';
import type { ContourSide, PanelContour, TabSegment } from './sharedGeometry';
import { clonePanelContour, segmentLiesOnPanelBoundary, validateClosedPanel, validatePanelContour } from './sharedPanelGeometry';
import type { PanelGeometryBuildResult } from './sharedPanelGeometry';
import { getPanelThickness } from './panelThickness';
import type { PanelThicknessState } from './panelThickness';

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

export const getPanelThicknessForEdge = (
  svgModel: SvgDocumentModel,
  edgeId: string,
  panelThicknessState?: PanelThicknessState,
  fallbackThicknessMm?: number,
): number | null => {
  const panel = svgModel.panels.find((candidate) => candidate.edgeIds.includes(edgeId));
  return getPanelThickness(panel?.id, panelThicknessState, fallbackThicknessMm);
};

type TBConnectionThickness = {
  panelAId: string | null;
  panelBId: string | null;
  panelAThicknessMm: number | null;
  panelBThicknessMm: number | null;
  autoFingerWidthMm: number | null;
  isComplete: boolean;
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
): { ownerThicknessMm: number | null; receiverThicknessMm: number | null } => (
  role === 'A'
    ? { ownerThicknessMm: thickness.panelAThicknessMm, receiverThicknessMm: thickness.panelBThicknessMm }
    : { ownerThicknessMm: thickness.panelBThicknessMm, receiverThicknessMm: thickness.panelAThicknessMm }
);

export const resolveTBThickness = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: TBConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
): TBConnectionThickness => {
  const assignedEdges = getAssignedTBEdges(assignments, connection.id);
  const panelA = getAssignedPanelForRole(svgModel, assignedEdges, 'A');
  const panelB = getAssignedPanelForRole(svgModel, assignedEdges, 'B');
  // Active PM-resolved TB geometry must not use the legacy connection thickness.
  // The fallback is retained only for pre-PM callers that provide no PM state.
  const legacyFallbackThicknessMm = panelThicknessState ? undefined : connection.properties.materialThicknessMm;
  const panelAThicknessMm = getPanelThickness(panelA?.id, panelThicknessState, legacyFallbackThicknessMm);
  const panelBThicknessMm = getPanelThickness(panelB?.id, panelThicknessState, legacyFallbackThicknessMm);
  const isComplete = panelAThicknessMm !== null && panelBThicknessMm !== null;

  return {
    panelAId: panelA?.id ?? null,
    panelBId: panelB?.id ?? null,
    panelAThicknessMm,
    panelBThicknessMm,
    autoFingerWidthMm: isComplete ? 3 * Math.min(panelAThicknessMm, panelBThicknessMm) : null,
    isComplete,
  };
};

// Compatibility shim: automatic TB finger widths are resolved from PM at geometry/view-model time.
// Keep this exported no-op for older call sites without writing PM-derived values into persisted fields.
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

    if (!assignment || connection?.prefix !== 'TB' || !assignment.edgeRole) {
      return [];
    }

    const connectionThickness = svgModel
      ? resolveTBThickness(svgModel, assignments, connection, panelThicknessState)
      : null;
    const roleThickness = connectionThickness
      ? getTBRoleThickness(connectionThickness, assignment.edgeRole)
      : { ownerThicknessMm: connection.properties.materialThicknessMm, receiverThicknessMm: connection.properties.materialThicknessMm };
    const { ownerThicknessMm, receiverThicknessMm } = roleThickness;
    const fingerWidthMm = connection.properties.isFingerWidthManual || !connectionThickness
      ? connection.properties.fingerWidthMm
      : connectionThickness.autoFingerWidthMm;

    if (ownerThicknessMm === null || receiverThicknessMm === null || fingerWidthMm === null) {
      return [];
    }

    return [{
      edgeId,
      connectionId: assignment.connectionId,
      role: assignment.edgeRole,
      materialThicknessMm: ownerThicknessMm,
      insetDepthMm: receiverThicknessMm,
      fingerWidthMm,
    }];
  })
);

export const buildGeneratedTBGeometryItems = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelThicknessState?: PanelThicknessState,
): GeneratedGeometryItem[] => {
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
    const connectionIds = [...new Set(operations.map((operation) => operation.connectionId))];
    const operationId = `operation:TB:${connectionIds.join('+')}`;
    const generatedTaps: GeneratedTapGroup[] = [];
    const result = buildPanelGeometry(
      panel,
      operations,
      insetContour,
      tabSegmentPlansByConnectionId,
      (operation, points, tapIndex, segmentRoles) => generatedTaps.push({
        id: createGeneratedTapId({ toolType: 'TB', sourceOperationId: operationId, panelId: panel.id, sourceEdgeId: operation.edgeId, tapIndex }),
        sourceOperationId: operationId, panelId: panel.id, sourceEdgeId: operation.edgeId, points, segmentRoles,
      }),
    );

    if (!result.ok) {
      return [];
    }

    const pathD = pointsToClosedPathD(result.contour);
    const tabOperations = buildTabOperations(panel, operations, tabSegmentPlansByConnectionId);
    const operationsBySideIndex = new Map(tabOperations.map((operation) => [panel.edgeIds.indexOf(operation.edgeId), operation]));
    const roleEffectiveGeometry = buildRoleEffectiveJunctionGeometry(insetContour, operationsBySideIndex, panel.contour);

    if (!roleEffectiveGeometry.ok) {
      return [];
    }

    return [{
      id: `generated:panel:${panel.id}`, operationId, toolType: 'TB', kind: 'PANEL_PATH', pathD,
      source: { operationId, panelIds: [panel.id], edgeIds: [...panel.edgeIds], connectionIds },
      geometry: { type: 'path', pathD, sourcePathD: pointsToClosedPathD(panel.contour), sourceBounds: { ...panel.bounds } },
      behaviour: { assembly: 'panel-boundary', replacesPanelId: panel.id },
      manufacturingClassification: 'GENERATED_OUTER', manufacturing: generatedManufacturingMetadata(false), diagnostics: [],
      profileGroups: operations.map((operation) => createBoundaryProfileGroup({
        toolType: 'TB', sourceOperationId: `operation:TB:${operation.connectionId}`, connectionId: operation.connectionId,
        panelId: panel.id, sourceEdgeId: operation.edgeId,
        attachmentStart: roleEffectiveGeometry.junctions[panel.edgeIds.indexOf(operation.edgeId)],
        attachmentEnd: roleEffectiveGeometry.junctions[(panel.edgeIds.indexOf(operation.edgeId) + 1) % insetContour.length],
      })),
      generatedProfiles: operations.map((operation) => {
        const edgeIndex = panel.edgeIds.indexOf(operation.edgeId);
        const sourceEdge = edgesById.get(operation.edgeId)!;
        return createGeneratedProfile({
          toolType: 'TB', connectionId: operation.connectionId, operationId: `operation:TB:${operation.connectionId}`, panelId: panel.id, sourceEdgeId: operation.edgeId,
          sourceEdgeStart: sourceEdge.start, sourceEdgeEnd: sourceEdge.end,
          attachmentStart: roleEffectiveGeometry.junctions[edgeIndex], attachmentEnd: roleEffectiveGeometry.junctions[(edgeIndex + 1) % insetContour.length],
          taps: generatedTaps,
        });
      }),
      generatedTaps,
    }];
  });
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

const getOperationDepthMm = (operation: Pick<PanelEdgeOperation, 'insetDepthMm' | 'materialThicknessMm'>): number => (
  operation.insetDepthMm ?? operation.materialThicknessMm
);

type RoleEffectiveJunctionGeometry =
  | { ok: true; sides: ContourSide[]; junctions: Point[] }
  | { ok: false; reason: string };

const buildRoleEffectiveJunctionGeometry = (
  contour: PanelContour,
  tabOperationsBySideIndex: Map<number, PanelTabOperation>,
  sourceContour: PanelContour,
): RoleEffectiveJunctionGeometry => {
  const contourSides = buildContourSides(contour);
  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;
  const effectiveSides = contourSides.map((side, sideIndex) => {
    const operation = tabOperationsBySideIndex.get(sideIndex);
    return operation?.role === 'B'
      ? offsetContourSide(side, -getOperationDepthMm(operation) * contourWindingSign)
      : side;
  });
  const invalidSideIndex = effectiveSides.findIndex((side) => !side);

  if (invalidSideIndex !== -1) {
    return { ok: false, reason: `TB side ${invalidSideIndex} cannot generate its role-effective support line.` };
  }

  const sides = effectiveSides as ContourSide[];
  const sourceSides = buildContourSides(sourceContour);
  const junctions = contourSides.map((side, sideIndex) => {
    const previousSideIndex = (sideIndex + contourSides.length - 1) % contourSides.length;
    const previousSupport = tabOperationsBySideIndex.has(previousSideIndex)
      ? sides[previousSideIndex]
      : sourceSides[previousSideIndex];
    const currentSupport = tabOperationsBySideIndex.has(sideIndex)
      ? sides[sideIndex]
      : sourceSides[sideIndex];
    return lineIntersection(previousSupport, currentSupport);
  });
  const invalidJunctionIndex = junctions.findIndex((junction) => (
    !junction || !Number.isFinite(junction.x) || !Number.isFinite(junction.y)
  ));

  if (invalidJunctionIndex !== -1) {
    const previousSideIndex = (invalidJunctionIndex + contourSides.length - 1) % contourSides.length;
    return {
      ok: false,
      reason: `TB junction ${previousSideIndex}/${invalidJunctionIndex} cannot be generated because its role-effective support lines do not have a finite intersection.`,
    };
  }

  return { ok: true, sides, junctions: junctions as Point[] };
};

type TapTerminalPoints = Readonly<{
  baseStart: Point;
  tabStart: Point;
  tabEnd: Point;
  baseEnd: Point;
}>;

const resolveOwnedTerminalTapPoints = (
  points: TapTerminalPoints,
  topology: Readonly<{
    reachesStartTerminal: boolean;
    reachesEndTerminal: boolean;
    previousEdgeOperated: boolean;
    nextEdgeOperated: boolean;
    previousEdgeRole: EdgeRole | undefined;
    currentEdgeRole: EdgeRole;
    nextEdgeRole: EdgeRole | undefined;
    startJunction: Point;
    endJunction: Point;
  }>,
): TapTerminalPoints => {
  const resolvesStartAtSharedJunction = topology.reachesStartTerminal && !topology.previousEdgeOperated;
  const resolvesEndAtSharedJunction = topology.reachesEndTerminal && !topology.nextEdgeOperated;
  const resolvesStartAtBBCorner = topology.reachesStartTerminal
    && topology.previousEdgeRole === 'B' && topology.currentEdgeRole === 'B';
  const resolvesEndAtBBCorner = topology.reachesEndTerminal
    && topology.currentEdgeRole === 'B' && topology.nextEdgeRole === 'B';

  // An adjacent unoperated edge already terminates at J. At a B/B junction, collapse only the
  // inset-facing terminal wall so the current edge begins J→C and the previous edge ends P→J.
  return {
    baseStart: resolvesStartAtSharedJunction ? topology.startJunction
      : resolvesStartAtBBCorner ? points.tabStart : points.baseStart,
    tabStart: resolvesStartAtSharedJunction ? topology.startJunction : points.tabStart,
    tabEnd: resolvesEndAtSharedJunction ? topology.endJunction : points.tabEnd,
    baseEnd: resolvesEndAtSharedJunction ? topology.endJunction
      : resolvesEndAtBBCorner ? points.tabEnd : points.baseEnd,
  };
};

export const applyTabsToContour = (
  panel: SvgPanel,
  contour: PanelContour,
  tabOperations: PanelTabOperation[],
  onGeneratedTap?: (operation: PanelTabOperation, points: readonly [Point, Point, Point, Point], tapIndex: number, roles: readonly [GeneratedTapSegmentRole, GeneratedTapSegmentRole, GeneratedTapSegmentRole]) => void,
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

  const tabbedContour: PanelContour = [];
  const roleEffectiveGeometry = buildRoleEffectiveJunctionGeometry(contour, tabOperationsBySideIndex, panel.contour);

  if (!roleEffectiveGeometry.ok) {
    return roleEffectiveGeometry;
  }
  const { junctions: effectiveJunctions } = roleEffectiveGeometry;
  const contourWindingSign = getContourSignedArea(contour) >= 0 ? 1 : -1;

  contourSides.forEach((side, sideIndex) => {
    const operation = tabOperationsBySideIndex.get(sideIndex);
    const nextSideIndex = (sideIndex + 1) % contourSides.length;
    const effectiveEnd = effectiveJunctions[nextSideIndex] as Point;

    addContourPoint(tabbedContour, effectiveJunctions[sideIndex] as Point);

    if (!operation || operation.segments.length === 0) {
      addContourPoint(tabbedContour, effectiveEnd);
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

    segments.forEach((segment, tapIndex) => {
      const previousSideIndex = (sideIndex + contourSides.length - 1) % contourSides.length;
      const reachesStartBBCorner = segment.startDistance <= cornerTouchTolerance
        && operation.role === 'B' && tabOperationsBySideIndex.get(previousSideIndex)?.role === 'B';
      const reachesEndBBCorner = getContourSideLength(side) - segment.endDistance <= cornerTouchTolerance
        && operation.role === 'B' && tabOperationsBySideIndex.get(nextSideIndex)?.role === 'B';
      const terminalPoints = resolveOwnedTerminalTapPoints({
        baseStart: interpolateSidePoint(side, segment.startDistance),
        tabStart: interpolateSidePoint(outwardSide, segment.startDistance),
        tabEnd: interpolateSidePoint(outwardSide, segment.endDistance),
        baseEnd: interpolateSidePoint(side, segment.endDistance),
      }, {
        reachesStartTerminal: segment.startDistance <= cornerTouchTolerance,
        reachesEndTerminal: getContourSideLength(side) - segment.endDistance <= cornerTouchTolerance,
        previousEdgeOperated: tabOperationsBySideIndex.has(previousSideIndex),
        nextEdgeOperated: tabOperationsBySideIndex.has(nextSideIndex),
        previousEdgeRole: tabOperationsBySideIndex.get(previousSideIndex)?.role,
        currentEdgeRole: operation.role,
        nextEdgeRole: tabOperationsBySideIndex.get(nextSideIndex)?.role,
        startJunction: effectiveJunctions[sideIndex] as Point,
        endJunction: effectiveEnd,
      });
      const { baseStart, tabStart, tabEnd, baseEnd } = terminalPoints;

      onGeneratedTap?.(operation, [baseStart, tabStart, tabEnd, baseEnd], tapIndex, [
        !reachesStartBBCorner && segmentLiesOnPanelBoundary(panel, baseStart, tabStart) ? 'source-boundary-start' : 'tap-side-start',
        'tap-tip',
        !reachesEndBBCorner && segmentLiesOnPanelBoundary(panel, tabEnd, baseEnd) ? 'source-boundary-end' : 'tap-side-end',
      ]);

      addContourPoint(tabbedContour, baseStart);
      addContourPoint(tabbedContour, tabStart);
      addContourPoint(tabbedContour, tabEnd);
      addContourPoint(tabbedContour, baseEnd);
    });

    addContourPoint(tabbedContour, effectiveEnd);
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
  onGeneratedTap?: Parameters<typeof applyTabsToContour>[3],
): PanelGeometryBuildResult => {
  const tabOperations = buildTabOperations(panel, operations, tabSegmentPlansByConnectionId);
  const tabResult = applyTabsToContour(panel, insetContour, tabOperations, onGeneratedTap);

  if (!tabResult.ok) {
    return tabResult;
  }

  const finalValidation = validatePanelContour(tabResult.contour);

  if (!finalValidation.ok) {
    return finalValidation;
  }

  return { ok: true, contour: tabResult.contour };
};
