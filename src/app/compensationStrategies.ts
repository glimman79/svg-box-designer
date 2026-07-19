import type { FinalContour } from './contourClassification';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import { buildContourSides, cornerTouchTolerance, getContourSignedArea, lineIntersection, offsetContourSide, pointsMatch, pointsToClosedPathD } from './sharedGeometry';
import type { PanelContour } from './sharedGeometry';
import type { Point } from '../svgUtils';

export type CompensationStrategyContext = {
  geometry: ManufacturingGeometry;
  contour: FinalContour;
  clearanceMm: number;
};

/** Geometry-only manufacturing compensation contract. */
export interface CompensationStrategy {
  readonly name: string;
  validate(context: CompensationStrategyContext): ReadonlyArray<string>;
  execute(context: CompensationStrategyContext): void;
}

const clonePoints = (points: PanelContour): PanelContour => points.map((point) => ({ ...point }));

const areCollinear = (previous: Point, current: Point, next: Point) => {
  const firstX = current.x - previous.x;
  const firstY = current.y - previous.y;
  const secondX = next.x - current.x;
  const secondY = next.y - current.y;
  return Math.abs(firstX * secondY - firstY * secondX) <= cornerTouchTolerance;
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

export const offsetContourPoints = (points: PanelContour, outward: boolean, distanceMm: number): PanelContour | null => {
  const cleaned = cleanContourPointsForOffset(points);
  if (cleaned.length < 3 || Math.abs(getContourSignedArea(cleaned)) <= cornerTouchTolerance) return null;
  const winding = getContourSignedArea(cleaned) >= 0 ? 1 : -1;
  const signedOffset = (outward ? -1 : 1) * winding * distanceMm;
  const sides = buildContourSides(cleaned).map((side) => offsetContourSide(side, signedOffset));
  if (sides.some((side) => !side)) return null;
  const rebuilt = (sides as NonNullable<(typeof sides)[number]>[]).map((side, index, allSides) => lineIntersection(allSides[(index + allSides.length - 1) % allSides.length], side));
  if (rebuilt.some((point) => !point)) return null;
  const result = rebuilt as PanelContour;
  if (result.some((point, index) => pointsMatch(point, result[(index + 1) % result.length]))) return null;
  if (Math.sign(getContourSignedArea(result)) !== Math.sign(getContourSignedArea(cleaned))) return null;
  return result;
};

export class NoMovementStrategy implements CompensationStrategy {
  readonly name = 'no-movement';
  validate(): ReadonlyArray<string> { return []; }
  execute(): void { /* Policy intentionally preserves this contour. */ }
}

export class OffsetStrategy implements CompensationStrategy {
  readonly name = 'offset';

  validate({ contour, clearanceMm }: CompensationStrategyContext): ReadonlyArray<string> {
    if (!Number.isFinite(clearanceMm) || clearanceMm < 0) return ['Clearance distance is invalid.'];
    if (clearanceMm <= cornerTouchTolerance) return [];
    const points = contour.points ?? (contour.pathD ? pathDToClosedContour(contour.pathD) : null);
    if (!points) return ['Unsupported or open contour geometry.'];
    if (Math.abs(getContourSignedArea(points)) <= cornerTouchTolerance) return ['Contour has zero area.'];
    return [];
  }

  execute(context: CompensationStrategyContext): void {
    if (context.clearanceMm <= cornerTouchTolerance) return;
    const validation = this.validate(context);
    if (validation.length) { this.report(context, validation); return; }
    const points = context.contour.points ?? pathDToClosedContour(context.contour.pathD as string);
    const offset = points && offsetContourPoints(points, context.contour.kind === 'OUTER', context.clearanceMm);
    if (!offset) { this.report(context, ['Offset could not be produced safely.']); return; }
    context.contour.points = offset;
    context.contour.pathD = pointsToClosedPathD(offset);
  }

  private report({ geometry, contour }: CompensationStrategyContext, messages: ReadonlyArray<string>) {
    contour.diagnostics = [...(contour.diagnostics ?? []), ...messages];
    messages.forEach((message) => geometry.diagnostics.push({ id: contour.id, message }));
  }
}

export const noMovementStrategy = Object.freeze(new NoMovementStrategy());
export const offsetStrategy = Object.freeze(new OffsetStrategy());
