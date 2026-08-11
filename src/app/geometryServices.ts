import type { FinalContour } from './contourClassification';
import type { ProfileMaterialSide } from './contourClassification';
import {
  buildContourSides,
  cornerTouchTolerance,
  getContourSignedArea,
  lineIntersection,
  offsetContourSide,
  pointsMatch,
  pointsToClosedPathD,
} from './sharedGeometry';
import type { ContourSide, PanelContour } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type ProfileDirection = 'OUTWARD' | 'INWARD';
export type ProfileOrientation = 'CLOCKWISE' | 'COUNTER_CLOCKWISE' | 'DEGENERATE';
export enum ProfileDisplacement {
  REMOVE_MATERIAL = 'REMOVE_MATERIAL',
  ADD_MATERIAL = 'ADD_MATERIAL',
}

/** Converts manufacturing intent to a contour-relative direction. */
export const directionForOuterMaterialDisplacement = (
  displacement: ProfileDisplacement,
  _materialSide: ProfileMaterialSide = 'GENERATED_MATING',
): ProfileDirection => (
  displacement === ProfileDisplacement.REMOVE_MATERIAL ? 'INWARD' : 'OUTWARD'
);

/**
 * The permanent geometry-operation boundary. Callers pass domain geometry and do
 * not parse paths, inspect vertices, or choose an offset algorithm themselves.
 */
export interface GeometryServices {
  compensateProfile(profile: FinalContour, signedDistanceMm: number, directionWhenNegative: ProfileDirection): FinalContour | null;
  parallelProfile(profile: FinalContour, distanceMm: number, direction: ProfileDirection): FinalContour | null;
  offset(profile: FinalContour, distanceMm: number, direction: ProfileDirection): FinalContour | null;
  orientation(profile: FinalContour): ProfileOrientation | null;
  signedArea(profile: FinalContour): number | null;
  clone(profile: FinalContour): FinalContour;
  replace(target: FinalContour, replacement: FinalContour): void;
}

const clonePoints = (points: PanelContour): PanelContour => points.map((point) => ({ ...point }));

const areCollinear = (previous: Point, current: Point, next: Point) => {
  const firstX = current.x - previous.x;
  const firstY = current.y - previous.y;
  const secondX = next.x - current.x;
  const secondY = next.y - current.y;
  return Math.abs(firstX * secondY - firstY * secondX) <= cornerTouchTolerance;
};

export const isRedundantContiguousCollinearJoin = (previousSide: ContourSide, currentSide: ContourSide) => {
  const coordinates = [
    previousSide.start.x, previousSide.start.y, previousSide.end.x, previousSide.end.y,
    currentSide.start.x, currentSide.start.y, currentSide.end.x, currentSide.end.y,
  ];
  if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) return false;
  if (!pointsMatch(previousSide.end, currentSide.start)) return false;

  const previousDx = previousSide.end.x - previousSide.start.x;
  const previousDy = previousSide.end.y - previousSide.start.y;
  const currentDx = currentSide.end.x - currentSide.start.x;
  const currentDy = currentSide.end.y - currentSide.start.y;
  const previousLength = Math.hypot(previousDx, previousDy);
  const currentLength = Math.hypot(currentDx, currentDy);
  if (previousLength <= cornerTouchTolerance || currentLength <= cornerTouchTolerance) return false;

  const normalizedCross = Math.abs((previousDx * currentDy) - (previousDy * currentDx))
    / (previousLength * currentLength);
  const dotProduct = (previousDx * currentDx) + (previousDy * currentDy);
  return normalizedCross <= cornerTouchTolerance && dotProduct > 0;
};

export const cleanContourPointsForOffset = (points: PanelContour): PanelContour => {
  const cleaned: PanelContour = [];
  points.forEach((point) => {
    if (!cleaned.length || !pointsMatch(cleaned[cleaned.length - 1], point)) cleaned.push({ ...point });
  });
  while (cleaned.length > 1 && pointsMatch(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();

  let changed = true;
  while (changed && cleaned.length >= 3) {
    changed = false;
    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = cleaned[(index + cleaned.length - 1) % cleaned.length];
      const current = cleaned[index];
      const next = cleaned[(index + 1) % cleaned.length];
      if (pointsMatch(previous, current) || pointsMatch(current, next) || areCollinear(previous, current, next)) {
        cleaned.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return cleaned;
};

export const pathDToClosedContour = (pathD: string): PanelContour | null => {
  const tokens = pathD.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let index = 0;
  let command = '';
  let closed = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toUpperCase() === 'Z') { closed = true; break; }
      continue;
    }
    if (command.toUpperCase() !== 'M' && command.toUpperCase() !== 'L') return null;
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 2;
  }
  if (points.length > 1 && pointsMatch(points[0], points[points.length - 1])) { points.pop(); closed = true; }
  return closed && points.length >= 3 ? points : null;
};

const offsetContourPoints = (points: PanelContour, outward: boolean, distanceMm: number): PanelContour | null => {
  const cleaned = cleanContourPointsForOffset(points);
  if (cleaned.length < 3 || Math.abs(getContourSignedArea(cleaned)) <= cornerTouchTolerance) return null;
  const winding = getContourSignedArea(cleaned) >= 0 ? 1 : -1;
  const signedOffset = (outward ? -1 : 1) * winding * distanceMm;
  const sides = buildContourSides(cleaned).map((side) => offsetContourSide(side, signedOffset));
  if (sides.some((side) => !side)) return null;
  const rebuilt = (sides as NonNullable<(typeof sides)[number]>[]).map((side, sideIndex, allSides) => (
    lineIntersection(allSides[(sideIndex + allSides.length - 1) % allSides.length], side)
  ));
  if (rebuilt.some((point) => !point)) return null;
  const result = rebuilt as PanelContour;
  if (result.some((point, pointIndex) => pointsMatch(point, result[(pointIndex + 1) % result.length]))) return null;
  if (Math.sign(getContourSignedArea(result)) !== Math.sign(getContourSignedArea(cleaned))) return null;
  return result;
};

const reconstructSelectiveProfile = (profile: FinalContour, signedDistanceMm: number, directionWhenNegative: ProfileDirection): FinalContour | null => {
  const sourcePoints = profile.points ?? (profile.pathD ? pathDToClosedContour(profile.pathD) : null);
  if (!sourcePoints) return null;
  if (sourcePoints.length !== profile.compensationProfile?.length) return null;
  // Clean geometry and provenance together. Previously the points alone were
  // cleaned, so their segment indexes no longer matched the generator mask.
  const points = clonePoints(sourcePoints);
  const selectedSegments = [...profile.compensationProfile];
  const protectedCornerAnchors = points.map((_, index) => {
    const previousRole = profile.segmentTapRoles?.[(index + points.length - 1) % points.length];
    const nextRole = profile.segmentTapRoles?.[index];
    return previousRole === 'source-boundary-end' || nextRole === 'source-boundary-start'
      || previousRole === 'corner-closure' || nextRole === 'corner-closure';
  });
  let changed = true;
  while (changed && points.length >= 3) {
    changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const previousIndex = (index + points.length - 1) % points.length;
      const nextIndex = (index + 1) % points.length;
      const duplicateEndpoint = pointsMatch(points[previousIndex], points[index]) || pointsMatch(points[index], points[nextIndex]);
      const removableCollinearPoint = areCollinear(points[previousIndex], points[index], points[nextIndex])
        && selectedSegments[previousIndex] === selectedSegments[index];
      // A collinear vertex at a provenance boundary is a real transition anchor:
      // removing it would merge the selected exit with unchanged geometry.
      if (duplicateEndpoint || (removableCollinearPoint && !protectedCornerAnchors[index])) {
        selectedSegments[previousIndex] = selectedSegments[previousIndex] || selectedSegments[index];
        points.splice(index, 1);
        selectedSegments.splice(index, 1);
        protectedCornerAnchors.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  if (points.length < 3) return null;
  if (Math.abs(signedDistanceMm) <= cornerTouchTolerance) return { ...profile, points: clonePoints(sourcePoints) };
  const winding = getContourSignedArea(points) >= 0 ? 1 : -1;
  const negativeDirectionSign = directionWhenNegative === 'OUTWARD' ? -1 : 1;
  const directionSign = signedDistanceMm < 0 ? negativeDirectionSign : -negativeDirectionSign;
  const signedOffset = Math.abs(signedDistanceMm) * winding * directionSign;
  const sides = buildContourSides(points).map((side, index) => (
    selectedSegments[index] ? offsetContourSide(side, signedOffset) : side
  ));
  if (sides.some((side) => !side)) return null;
  const concreteSides = sides as NonNullable<(typeof sides)[number]>[];
  const result: PanelContour = [];
  let reconstructionFailed = false;
  concreteSides.forEach((side, index, allSides) => {
    const previousIndex = (index + allSides.length - 1) % allSides.length;
    const previousSide = allSides[previousIndex];
    const intersection = lineIntersection(previousSide, side);
    if (intersection) {
      result.push(intersection);
      return;
    }

    // A selected run may start or end part-way along a straight source edge.
    // Its displaced line is necessarily parallel to the unchanged neighbour,
    // so there is no mathematical intersection. Preserve both endpoints and
    // join them with the transition segment instead of treating that expected
    // condition as a reconstruction failure.
    if (selectedSegments[previousIndex] !== selectedSegments[index]) {
      result.push({ ...previousSide.end }, { ...side.start });
    } else if (!selectedSegments[previousIndex] && !selectedSegments[index]
      && isRedundantContiguousCollinearJoin(previousSide, side)) {
      // Protected semantic attachment anchors remain in the source metadata,
      // but a contiguous straight-through unchanged vertex is numerically
      // redundant and need not be emitted into the reconstructed contour.
      // Omit the shared point; the adjacent sides describe one straight edge.
    } else {
      reconstructionFailed = true;
    }
  });
  if (reconstructionFailed) return null;
  if (result.some((point, index) => pointsMatch(point, result[(index + 1) % result.length]))) return null;
  return { ...profile, points: result, pathD: pointsToClosedPathD(result) };
};

/** @deprecated Polygon compatibility helper. New consumers must use GeometryServices. */
export const compensateContourPoints = (points: PanelContour, outward: boolean, distanceMm: number): PanelContour => (
  offsetContourPoints(points, outward, distanceMm) ?? clonePoints(points)
);

class PolygonGeometryServices implements GeometryServices {
  compensateProfile(profile: FinalContour, signedDistanceMm: number, directionWhenNegative: ProfileDirection): FinalContour | null {
    if (!Number.isFinite(signedDistanceMm)) return null;
    if (profile.compensationProfile) return reconstructSelectiveProfile(profile, signedDistanceMm, directionWhenNegative);
    // Pre-V2.7 compatibility: a contour without profile provenance is one complete profile.
    const direction = signedDistanceMm < 0
      ? directionWhenNegative
      : directionWhenNegative === 'OUTWARD' ? 'INWARD' : 'OUTWARD';
    return this.parallelProfile(profile, Math.abs(signedDistanceMm), direction);
  }

  parallelProfile(profile: FinalContour, distanceMm: number, direction: ProfileDirection): FinalContour | null {
    const points = profile.points ?? (profile.pathD ? pathDToClosedContour(profile.pathD) : null);
    if (!points) return null;
    if (distanceMm <= cornerTouchTolerance) return this.clone(profile);
    const offsetPoints = offsetContourPoints(points, direction === 'OUTWARD', distanceMm);
    if (!offsetPoints) return null;
    return { ...profile, points: offsetPoints, pathD: pointsToClosedPathD(offsetPoints) };
  }

  offset(profile: FinalContour, distanceMm: number, direction: ProfileDirection) {
    return this.parallelProfile(profile, distanceMm, direction);
  }

  signedArea(profile: FinalContour) {
    const points = profile.points ?? (profile.pathD ? pathDToClosedContour(profile.pathD) : null);
    return points ? getContourSignedArea(points) : null;
  }

  orientation(profile: FinalContour): ProfileOrientation | null {
    const area = this.signedArea(profile);
    if (area === null) return null;
    if (Math.abs(area) <= cornerTouchTolerance) return 'DEGENERATE';
    return area > 0 ? 'COUNTER_CLOCKWISE' : 'CLOCKWISE';
  }

  clone(profile: FinalContour): FinalContour {
    return { ...profile, ...(profile.points ? { points: clonePoints(profile.points) } : {}), ...(profile.compensationProfile ? { compensationProfile: [...profile.compensationProfile] } : {}), ...(profile.segmentProfileIds ? { segmentProfileIds: [...profile.segmentProfileIds] } : {}) };
  }

  replace(target: FinalContour, replacement: FinalContour): void {
    target.points = replacement.points ? clonePoints(replacement.points) : undefined;
    target.pathD = replacement.pathD;
  }
}

export const geometryServices: GeometryServices = Object.freeze(new PolygonGeometryServices());
