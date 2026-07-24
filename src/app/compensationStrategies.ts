import type { FinalContour } from './contourClassification';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import { cornerTouchTolerance } from './sharedGeometry';
import { geometryServices } from './geometryServices';
import type { GeometryServices } from './geometryServices';

export type CompensationStrategyContext = {
  geometry: ManufacturingGeometry;
  contour: FinalContour;
  clearanceMm: number;
  services?: GeometryServices;
};

/** Geometry-only manufacturing compensation contract. */
export interface CompensationStrategy {
  readonly name: string;
  validate(context: CompensationStrategyContext): ReadonlyArray<string>;
  execute(context: CompensationStrategyContext): void;
}

export class NoMovementStrategy implements CompensationStrategy {
  readonly name = 'no-movement';
  validate(): ReadonlyArray<string> { return []; }
  execute(): void { /* Policy intentionally preserves this contour. */ }
}

export class OffsetStrategy implements CompensationStrategy {
  readonly name = 'offset';

  validate({ contour, clearanceMm, services = geometryServices }: CompensationStrategyContext): ReadonlyArray<string> {
    if (!Number.isFinite(clearanceMm)) return ['Clearance distance is invalid.'];
    if (Math.abs(clearanceMm) <= cornerTouchTolerance) return [];
    const area = services.signedArea(contour);
    if (area === null) return ['Unsupported or open contour geometry.'];
    if (Math.abs(area) <= cornerTouchTolerance) return ['Contour has zero area.'];
    return [];
  }

  execute(context: CompensationStrategyContext): void {
    if (Math.abs(context.clearanceMm) <= cornerTouchTolerance) return;
    const validation = this.validate(context);
    if (validation.length) { this.report(context, validation); return; }
    const services = context.services ?? geometryServices;
    const offset = services.compensateProfile(context.contour, context.clearanceMm, 'OUTWARD');
    if (!offset) { this.report(context, ['Offset could not be produced safely.']); return; }
    services.replace(context.contour, offset);
  }

  private report({ geometry, contour }: CompensationStrategyContext, messages: ReadonlyArray<string>) {
    contour.diagnostics = [...(contour.diagnostics ?? []), ...messages];
    messages.forEach((message) => geometry.diagnostics.push({ id: contour.id, message }));
  }
}

export const noMovementStrategy = Object.freeze(new NoMovementStrategy());
export const offsetStrategy = Object.freeze(new OffsetStrategy());

export { cleanContourPointsForOffset, pathDToClosedContour } from './geometryServices';
