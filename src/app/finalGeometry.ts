import type { GeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { manufacturingMetadataForGeometryType } from './manufacturingMetadata';
import { pointsToClosedPathD } from './sharedGeometry';
import type { ContourDiagnostic, FinalContour, FinalContourSource } from './contourClassification';
import type { FinalGeometryType } from './finalGeometryTypes';
import { cornerTouchTolerance, getContourSignedArea, pointsMatch } from './sharedGeometry';
import type { Point, SvgDocumentModel } from '../svgUtils';
import type { GeneratedProfile, GeneratedProfileGroup, GeneratedProfileId } from './generatedProfiles';
import type { GeneratedTapGroup, GeneratedTapId, GeneratedTapSegmentRole } from './generatedTaps';

export type FinalGeometryContour = FinalContour;

export type FinalGeometry = {
  readonly contours: ReadonlyArray<FinalGeometryContour>;
  readonly diagnostics: ReadonlyArray<ContourDiagnostic>;
  /** Non-authoritative generator shadow; deliberately unused by FinalGeometry algorithms. */
  readonly generatedProfiles: ReadonlyArray<GeneratedProfile>;
};

const clonePoints = (points: Point[]) => points.map((point) => ({ ...point }));

const pointOnImportedSegment = (point: Point, start: Point, end: Point) => {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  return Math.abs(cross) <= cornerTouchTolerance
    && point.x >= Math.min(start.x, end.x) - cornerTouchTolerance
    && point.x <= Math.max(start.x, end.x) + cornerTouchTolerance
    && point.y >= Math.min(start.y, end.y) - cornerTouchTolerance
    && point.y <= Math.max(start.y, end.y) + cornerTouchTolerance;
};

// This is the automatic Clearance classifier from 8003f98, the last revision
// before profile activation became user-selectable.  Its result is the
// authoritative geometric definition; profile IDs must never broaden it.
export const identifyAutomaticCompensationProfile = (generated: Point[], imported: Point[]): boolean[] => {
  const modifiedSegments = generated.map((start, index) => {
    const end = generated[(index + 1) % generated.length];
    return !imported.some((importedStart, importedIndex) => pointOnImportedSegment(start, importedStart, imported[(importedIndex + 1) % imported.length])
      && pointOnImportedSegment(end, importedStart, imported[(importedIndex + 1) % imported.length]));
  });

  const supportingImportedSegments = new Set<number>();
  const visited = new Set<number>();
  modifiedSegments.forEach((isModified, startIndex) => {
    if (!isModified || visited.has(startIndex)) return;
    const attachments: Point[] = [];
    let index = startIndex;
    while (modifiedSegments[index] && !visited.has(index)) {
      visited.add(index);
      attachments.push(generated[index], generated[(index + 1) % generated.length]);
      index = (index + 1) % generated.length;
    }
    imported.forEach((importedStart, importedIndex) => {
      const importedEnd = imported[(importedIndex + 1) % imported.length];
      const distinctAttachments = attachments.filter((point, pointIndex) => pointOnImportedSegment(point, importedStart, importedEnd)
        && attachments.findIndex((candidate) => Math.abs(candidate.x - point.x) <= cornerTouchTolerance
          && Math.abs(candidate.y - point.y) <= cornerTouchTolerance) === pointIndex);
      if (distinctAttachments.length >= 2) supportingImportedSegments.add(importedIndex);
    });
  });

  return generated.map((start, index) => modifiedSegments[index] || [...supportingImportedSegments].some((importedIndex) => (
    pointOnImportedSegment(start, imported[importedIndex], imported[(importedIndex + 1) % imported.length])
    && pointOnImportedSegment(generated[(index + 1) % generated.length], imported[importedIndex], imported[(importedIndex + 1) % imported.length])
  )));
};

const identifyProfileGroups = (generated: Point[], imported: Point[], edgeIds: string[], groups: ReadonlyArray<GeneratedProfileGroup>, automaticMask: ReadonlyArray<boolean>): Array<GeneratedProfileId | null> => {
  const result: Array<GeneratedProfileId | null> = generated.map(() => null);
  const onAnyImportedEdge = (start: Point, end: Point) => imported.some((point, index) => pointOnImportedSegment(start, point, imported[(index + 1) % imported.length]) && pointOnImportedSegment(end, point, imported[(index + 1) % imported.length]));

  groups.forEach((group) => {
    const edgeIndex = edgeIds.indexOf(group.sourceEdgeId);
    if (edgeIndex < 0) return;
    const edgeStart = imported[edgeIndex];
    const edgeEnd = imported[(edgeIndex + 1) % imported.length];
    const attachmentStart = group.attachmentStart ?? edgeStart;
    const attachmentEnd = group.attachmentEnd ?? edgeEnd;
    const startIndex = generated.findIndex((point) => (
      Math.abs(point.x - attachmentStart.x) <= cornerTouchTolerance
      && Math.abs(point.y - attachmentStart.y) <= cornerTouchTolerance
    ));
    const endIndex = generated.findIndex((point) => (
      Math.abs(point.x - attachmentEnd.x) <= cornerTouchTolerance
      && Math.abs(point.y - attachmentEnd.y) <= cornerTouchTolerance
    ));
    if (group.attachmentStart && group.attachmentEnd && startIndex >= 0 && endIndex >= 0 && startIndex !== endIndex) {
      for (let index = startIndex; index !== endIndex; index = (index + 1) % generated.length) result[index] = group.id;
      return;
    }
    generated.forEach((start, index) => {
      const end = generated[(index + 1) % generated.length];
      if (pointOnImportedSegment(start, edgeStart, edgeEnd) && pointOnImportedSegment(end, edgeStart, edgeEnd)) result[index] = group.id;
    });
    generated.forEach((start, startIndex) => {
      const end = generated[(startIndex + 1) % generated.length];
      if (onAnyImportedEdge(start, end) || !onAnyImportedEdge(generated[(startIndex - 1 + generated.length) % generated.length], start)) return;
      let index = startIndex;
      while (index < generated.length && !onAnyImportedEdge(generated[index], generated[(index + 1) % generated.length])) index += 1;
      const runEnd = generated[index % generated.length];
      if (pointOnImportedSegment(start, edgeStart, edgeEnd) && pointOnImportedSegment(runEnd, edgeStart, edgeEnd)) {
        for (let cursor = startIndex; cursor < index; cursor += 1) result[cursor] = group.id;
      }
    });
  });
  // Attachment metadata supplies stable identity only.  Intersect it with the
  // proven automatic mask so a bad/ambiguous contour walk cannot redefine a
  // profile by crossing a seam or consuming an adjacent imported edge.
  return result.map((id, index) => automaticMask[index] ? id : null);
};

const identifyGeneratedTaps = (generated: Point[], taps: ReadonlyArray<GeneratedTapGroup>): { ids: Array<GeneratedTapId | null>; roles: Array<GeneratedTapSegmentRole | null> } => {
  const ids: Array<GeneratedTapId | null> = generated.map(() => null);
  const roles: Array<GeneratedTapSegmentRole | null> = generated.map(() => null);
  taps.forEach((tap) => {
    for (let tapSegment = 0; tapSegment < tap.points.length - 1; tapSegment += 1) {
      const start = tap.points[tapSegment];
      const end = tap.points[tapSegment + 1];
      const index = generated.findIndex((point, pointIndex) => pointsMatch(point, start) && pointsMatch(generated[(pointIndex + 1) % generated.length], end));
      if (index >= 0) {
        ids[index] = tap.id;
        roles[index] = tap.segmentRoles[tapSegment];
      }
    }
  });
  return { ids, roles };
};

const identifySourceEdges = (generated: Point[], imported: Point[], edgeIds: string[], profileIds: ReadonlyArray<GeneratedProfileId | null>): Array<string | null> => (
  generated.map((start, index) => {
    if (profileIds[index]) return null;
    const end = generated[(index + 1) % generated.length];
    const sourceIndex = imported.findIndex((sourceStart, importedIndex) => (
      pointOnImportedSegment(start, sourceStart, imported[(importedIndex + 1) % imported.length])
      && pointOnImportedSegment(end, sourceStart, imported[(importedIndex + 1) % imported.length])
    ));
    return sourceIndex >= 0 ? edgeIds[sourceIndex] ?? null : null;
  })
);


const pathDToClosedContourForFinalGeometry = (pathD: string): Point[] | null => {
  const tokens = pathD.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let index = 0;
  let command = '';
  let sawClose = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toUpperCase() === 'Z') {
        sawClose = true;
        break;
      }
      continue;
    }
    if (command.toUpperCase() !== 'M' && command.toUpperCase() !== 'L') return null;
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 2;
  }

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) <= cornerTouchTolerance && Math.abs(first.y - last.y) <= cornerTouchTolerance) {
      points.pop();
      sawClose = true;
    }
  }

  return sawClose && points.length >= 3 ? points : null;
};

const validateFinalGeometryContour = (contour: FinalGeometryContour): ContourDiagnostic[] => {
  const diagnostics: ContourDiagnostic[] = [];
  if (!contour.points || contour.points.length < 3) diagnostics.push({ id: contour.id, message: 'Contour must be closed and contain at least 3 points.' });
  if (contour.points && contour.points.length >= 3 && Math.abs(getContourSignedArea(contour.points)) <= cornerTouchTolerance) diagnostics.push({ id: contour.id, message: 'Contour polygon area is invalid.' });
  return diagnostics;
};

export const buildFinalGeometry = (
  svgModel: SvgDocumentModel,
  generatedGeometryOrSnapshot: ReadonlyArray<GeneratedGeometryItem> | GeneratedGeometrySnapshot,
): FinalGeometry => {
  const generatedGeometry: ReadonlyArray<GeneratedGeometryItem> = 'generatedGeometry' in generatedGeometryOrSnapshot
    ? generatedGeometryOrSnapshot.generatedGeometry
    : generatedGeometryOrSnapshot;
  const replacementByPanelId = new Map<string, { pathD: string; finalSource: FinalContourSource; geometryType: FinalGeometryType; profileGroups: ReadonlyArray<GeneratedProfileGroup>; generatedTaps: ReadonlyArray<GeneratedTapGroup> }>();
  generatedGeometry
    .filter((item) => item.behaviour.assembly === 'panel-boundary' && !!item.behaviour.replacesPanelId)
    .forEach((item) => replacementByPanelId.set(item.behaviour.replacesPanelId!, { pathD: item.geometry.pathD, finalSource: 'applied-panel', geometryType: item.manufacturingClassification, profileGroups: item.profileGroups ?? [], generatedTaps: item.generatedTaps ?? [] }));

  const contours: FinalGeometryContour[] = svgModel.panels.flatMap((panel) => {
    const replacement = replacementByPanelId.get(panel.id);
    const outerPanelContour = panel.outerContour ?? panel.contour;
    const pathD = replacement?.pathD ?? pointsToClosedPathD(outerPanelContour);
    const generatedPoints = replacement ? pathDToClosedContourForFinalGeometry(pathD) ?? undefined : undefined;
    const outerContour: FinalGeometryContour = {
      id: `final-panel:${panel.id}`,
      source: 'final-contour',
      finalSource: replacement?.finalSource ?? 'original-panel',
      kind: 'OUTER',
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD,
      points: generatedPoints ?? clonePoints(outerPanelContour),
      ...(generatedPoints ? (() => {
        const compensationProfile = identifyAutomaticCompensationProfile(generatedPoints, outerPanelContour);
        const segmentProfileIds = identifyProfileGroups(generatedPoints, outerPanelContour, panel.edgeIds, replacement?.profileGroups ?? [], compensationProfile);
        const segmentSourceEdgeIds = identifySourceEdges(generatedPoints, outerPanelContour, panel.edgeIds, segmentProfileIds);
        const tapSegments = identifyGeneratedTaps(generatedPoints, replacement?.generatedTaps ?? []);
        return { segmentProfileIds, segmentSourceEdgeIds, segmentTapIds: tapSegments.ids, segmentTapRoles: tapSegments.roles, compensationProfile };
      })() : {}),
      ...(!generatedPoints ? { segmentSourceEdgeIds: [...panel.edgeIds] } : {}),
      ...(replacement ? { profileMaterialSide: 'GENERATED_MATING' as const } : {}),
      geometryType: replacement?.geometryType ?? 'IMPORTED_OUTER',
      manufacturing: manufacturingMetadataForGeometryType(replacement?.geometryType ?? 'IMPORTED_OUTER'),
    };

    const innerContours = (panel.innerContours ?? []).map((innerContour, index): FinalGeometryContour => ({
      id: `final-panel-hole:${panel.id}:${index}`,
      source: 'final-contour',
      finalSource: 'original-panel',
      kind: 'INNER',
      panelId: panel.id,
      ownerPanelId: panel.id,
      pathD: pointsToClosedPathD(innerContour),
      points: clonePoints(innerContour),
      geometryType: 'IMPORTED_HOLE',
      manufacturing: manufacturingMetadataForGeometryType('IMPORTED_HOLE'),
    }));

    return [outerContour, ...innerContours];
  });

  generatedGeometry.filter((item) => item.behaviour.assembly === 'slot-cutout').forEach((item) => {
    const slotPoints = pathDToClosedContourForFinalGeometry(item.geometry.pathD) ?? undefined;
    contours.push({
      id: item.id.replace(/^generated:/, 'final-'),
      source: 'final-contour',
      finalSource: 's-slot',
      kind: 'INNER',
      ownerPanelId: item.behaviour.ownerPanelId,
      pathD: item.geometry.pathD,
      points: slotPoints,
      ...(slotPoints ? { compensationProfile: slotPoints.map(() => true) } : {}),
      profileMaterialSide: 'FEMALE',
      geometryType: item.manufacturingClassification,
      manufacturing: manufacturingMetadataForGeometryType(item.manufacturingClassification),
    });
  });

  const profileOccurrences = new Map<GeneratedProfileId, number>();
  generatedGeometry.flatMap((item) => item.profileGroups ?? []).forEach((group) => profileOccurrences.set(group.id, (profileOccurrences.get(group.id) ?? 0) + 1));
  const diagnostics = [
    ...contours.flatMap(validateFinalGeometryContour),
    ...[...profileOccurrences].filter(([, count]) => count > 1).map(([id]): ContourDiagnostic => ({ id, code: 'CLEARANCE_PROFILE_AMBIGUOUS', severity: 'error', message: `Generated Clearance profile identity ${id} appears more than once.` })),
  ];
  contours.forEach((contour) => {
    contour.points?.forEach(Object.freeze);
    if (contour.points) Object.freeze(contour.points);
    if (contour.compensationProfile) Object.freeze(contour.compensationProfile);
    if (contour.segmentProfileIds) Object.freeze(contour.segmentProfileIds);
    if (contour.segmentSourceEdgeIds) Object.freeze(contour.segmentSourceEdgeIds);
    if (contour.segmentTapIds) Object.freeze(contour.segmentTapIds);
    if (contour.segmentTapRoles) Object.freeze(contour.segmentTapRoles);
    if (contour.manufacturing) Object.freeze(contour.manufacturing);
    Object.freeze(contour);
  });
  diagnostics.forEach(Object.freeze);
  const generatedProfiles = structuredClone(generatedGeometry.flatMap((item) => item.generatedProfiles ?? []));
  generatedProfiles.forEach((profile) => {
    profile.orderedElements.forEach(Object.freeze);
    profile.geometryProjections.forEach((projection) => { Object.freeze(projection.start); Object.freeze(projection.end); Object.freeze(projection); });
    profile.orderedTaps.forEach(Object.freeze);
    Object.freeze(profile.sourceEdgeDirection.start); Object.freeze(profile.sourceEdgeDirection.end); Object.freeze(profile.sourceEdgeDirection);
    Object.freeze(profile.attachmentStart); Object.freeze(profile.attachmentEnd);
    Object.freeze(profile.orderedElements); Object.freeze(profile.geometryProjections); Object.freeze(profile.orderedTaps); Object.freeze(profile);
  });
  return Object.freeze({ contours: Object.freeze(contours), diagnostics: Object.freeze(diagnostics), generatedProfiles: Object.freeze(generatedProfiles) });
};
