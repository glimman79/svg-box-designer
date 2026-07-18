import { getBucketEdgeAssignment, getBucketSlotAssignments } from './assignmentBuckets';
import type { AppliedSGeometry, ConnectionMap, SlotConnectionDefinition } from './connectionTypes';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { getAppliedSGeometryFromItems } from './generatedGeometrySnapshot';
import { generatedManufacturingMetadata } from './manufacturingMetadata';
import { addContourPoint, clipOriginalSegmentsToInsetSide, clonePanelContour, getPanelThickness, removeInteriorBacktrackSpurs, validatePanelContour } from './eGeometry';
import type { PanelContour, PanelGeometryBuildResult, PanelThicknessState } from './eGeometry';
import { findPanelContainingEdge } from './panelLookup';
import { getContourEdgePoints, getTabSegmentsForRole, validateClosedPanel } from './sharedPanelGeometry';
import { buildContourSides, cornerTouchTolerance, createTabSegmentPlan, getContourSideLength, getContourSignedArea, interpolateSidePoint, isContourSideReversedFromCanonical, lineIntersection, mirrorSegments, offsetContourSide, pointsMatch, pointsToClosedPathD } from './sharedGeometry';
import type { ContourSide, TabSegment } from './sharedGeometry';
import type { EdgeAssignmentRecord, Point, SvgDocumentModel, SvgEdge, SvgPanel } from '../svgUtils';

type SPanelOperation = {
  connectionId: string;
  sourceAEdgeId: string;
  sourceBEdgeId: string;
  wallThicknessMm: number;
  insertDepthMm: number;
  aSegments: TabSegment[];
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
    const offsetDistance = operation?.insertDepthMm ?? 0;

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

    const outwardSide = offsetContourSide(insetSide, -operation.insertDepthMm * contourWindingSign);

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

export type SConnectionThickness = {
  panelAId: string | null;
  panelBId: string | null;
  panelAThicknessMm: number | null;
  panelBThicknessMm: number | null;
  autoSlotLengthMm: number | null;
  isComplete: boolean;
};

const getAssignedSEdges = (assignments: EdgeAssignmentRecord, connectionId: string) => (
  Object.entries(assignments).flatMap(([edgeId, assignment]) => (
    getBucketSlotAssignments(assignment)
      .filter((slotAssignment) => slotAssignment.connectionId === connectionId)
      .map((slotAssignment) => ({ edgeId, role: slotAssignment.slotRole }))
  ))
);

export const resolveSThickness = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connection: SlotConnectionDefinition,
  panelThicknessState?: PanelThicknessState,
): SConnectionThickness => {
  const assignedEdges = getAssignedSEdges(assignments, connection.id);
  const aEdgeId = assignedEdges.find((assignment) => assignment.role === 'A')?.edgeId;
  const bEdgeId = assignedEdges.find((assignment) => assignment.role === 'B')?.edgeId;
  const panelA = aEdgeId ? findPanelContainingEdge(svgModel, aEdgeId) : null;
  const panelB = bEdgeId ? findPanelContainingEdge(svgModel, bEdgeId) : null;
  // Active PM-resolved S geometry must not use the legacy connection thickness.
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
    autoSlotLengthMm: isComplete && panelAThicknessMm !== null ? panelAThicknessMm * 3 : null,
    isComplete,
  };
};

export const resolveSSlotLengthMm = (
  connection: SlotConnectionDefinition,
  thickness: SConnectionThickness,
): number | null => (
  connection.properties.isSlotLengthManual
    ? connection.properties.slotLengthMm
    : thickness.autoSlotLengthMm
);

// Compatibility shim: automatic S slot length/width are resolved from PM at geometry/view-model time.
// Keep this exported no-op for older call sites without writing PM-derived values into persisted fields.
export const recalculateAutomaticSSlotLengths = (
  _svgModel: SvgDocumentModel,
  _assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  _panelThicknessState?: PanelThicknessState,
): ConnectionMap => connectionMap;

export const buildGeneratedSGeometryItems = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelThicknessState?: PanelThicknessState,
): GeneratedGeometryItem[] => {
  const edgesById = new Map(svgModel.edges.map((edge) => [edge.id, edge]));
  const sConnections = Object.values(connectionMap).filter((connection): connection is SlotConnectionDefinition => connection.prefix === 'S');
  const result: GeneratedGeometryItem[] = [];
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
    const sThickness = resolveSThickness(svgModel, assignments, connection, panelThicknessState);
    if (!sThickness.isComplete || sThickness.panelAThicknessMm === null || sThickness.panelBThicknessMm === null) {
      throw new Error(`${connection.id} incomplete connection: S-A and S-B panels must both resolve PM thickness.`);
    }

    const wallThicknessMm = sThickness.panelAThicknessMm;
    const insertDepthMm = sThickness.panelBThicknessMm;
    const slotLengthMm = resolveSSlotLengthMm(connection, sThickness);

    if (slotLengthMm === null) {
      throw new Error(`${connection.id} incomplete connection: S tab/slot length cannot be resolved without PM thickness.`);
    }
    const planSegments = createTabSegmentPlan(sideLength, slotLengthMm);
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
      sourceBEdgeId,
      wallThicknessMm,
      insertDepthMm,
      aSegments,
    });
    operationsByPanelId.set(panel.id, panelOperations);

    const slotItems = aSegments.map((segment, segmentIndex): GeneratedGeometryItem => {
      const startDistance = segment.startDistance;
      const endDistance = segment.endDistance;
      const slotOffsetMm = connection.properties.slotOffsetMm ?? 0;
      const pathD = buildSlotPathD(sourceBEdge, startDistance, endDistance, wallThicknessMm, bInwardNormal, slotOffsetMm);

      if (!pathD) {
        throw new Error(`${connection.id} S-B edge cannot receive slots because its length is invalid.`);
      }

      const operationId = `operation:S:${connection.id}`;
      return { id: `generated:s-slot:${connection.id}:${segmentIndex}`, operationId, toolType: 'S', kind: 'SLOT_PATH', pathD,
        source: { operationId, panelIds: [panel.id, bPanel.id], edgeIds: [sourceAEdgeId, sourceBEdgeId], connectionIds: [connection.id] },
        geometry: { type: 'path', pathD, metrics: { startDistance, endDistance, widthMm: wallThicknessMm } },
        behaviour: { assembly: 'slot-cutout', ownerPanelId: bPanel.id }, manufacturingClassification: 'GENERATED_SLOT',
        manufacturing: generatedManufacturingMetadata(true), diagnostics: [] };
    });

    result.push(...slotItems);
  });

  operationsByPanelId.forEach(({ panel, operations }) => {
    const panelResult = buildSPanelContour(panel, operations);
    if (!panelResult.ok) {
      throw new Error(`${operations.map((operation) => operation.connectionId).join(', ')} S-A geometry failed: ${panelResult.reason}`);
    }

    const ownerConnectionId = operations
      .map((operation) => operation.connectionId)
      .sort((first, second) => first.localeCompare(second))[0];
    const sourceEdgeIds = operations
        .map((operation) => operation.sourceAEdgeId)
        .sort((first, second) => first.localeCompare(second));
    const ownerOperation = operations.find((operation) => operation.connectionId === ownerConnectionId)!;
    const operationId = `operation:S:${ownerConnectionId}`;
    const pathD = pointsToClosedPathD(panelResult.contour);
    result.push({ id: `generated:s-panel:${ownerConnectionId}:${panel.id}`, operationId, toolType: 'S', kind: 'PANEL_PATH', pathD,
      source: { operationId, panelIds: [panel.id], edgeIds: [...panel.edgeIds], connectionIds: [ownerConnectionId] },
      geometry: { type: 'path', pathD, sourcePathD: pointsToClosedPathD(panel.contour), sourceBounds: { ...panel.bounds }, references: { operationEdgeIds: sourceEdgeIds, connectionEdgeIds: [ownerOperation.sourceAEdgeId, ownerOperation.sourceBEdgeId] } },
      behaviour: { assembly: 'panel-boundary', replacesPanelId: panel.id }, manufacturingClassification: 'GENERATED_OUTER',
      manufacturing: generatedManufacturingMetadata(false), diagnostics: [] });
  });

  return result;
};

/** @deprecated Compatibility adapter for V1 callers. */
export const buildAppliedSGeometry = (...args: Parameters<typeof buildGeneratedSGeometryItems>): AppliedSGeometry[] => (
  getAppliedSGeometryFromItems(buildGeneratedSGeometryItems(...args))
);
