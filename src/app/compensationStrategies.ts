import type { FinalContour } from './contourClassification';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import { cornerTouchTolerance } from './sharedGeometry';
import { geometryServices } from './geometryServices';
import { directionForOuterMaterialDisplacement, ProfileDisplacement } from './geometryServices';
import type { GeometryServices } from './geometryServices';

export enum ProfileOffsetEffect {
  INCREASE_FIT = 'INCREASE_FIT',
  DECREASE_FIT = 'DECREASE_FIT',
}

const displacementForProfileOffset = (profileOffsetMm: number): ProfileDisplacement => (
  profileOffsetMm < 0 ? ProfileDisplacement.REMOVE_MATERIAL : ProfileDisplacement.ADD_MATERIAL
);

export type CompensationStrategyContext = {
  geometry: ManufacturingGeometry;
  contour: FinalContour;
  profileOffsetMm: number;
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

  validate({ contour, profileOffsetMm, services = geometryServices }: CompensationStrategyContext): ReadonlyArray<string> {
    if (!Number.isFinite(profileOffsetMm)) return ['Profile Offset distance is invalid.'];
    if (Math.abs(profileOffsetMm) <= cornerTouchTolerance) return [];
    const area = services.signedArea(contour);
    if (area === null) return ['Unsupported or open contour geometry.'];
    if (Math.abs(area) <= cornerTouchTolerance) return ['Contour has zero area.'];
    return [];
  }

  execute(context: CompensationStrategyContext): void {
    if (Math.abs(context.profileOffsetMm) <= cornerTouchTolerance) return;
    const validation = this.validate(context);
    if (validation.length) { this.report(context, validation); return; }
    const services = context.services ?? geometryServices;
    const displacement = displacementForProfileOffset(context.profileOffsetMm);
    const directionForNegative = directionForOuterMaterialDisplacement(
      ProfileDisplacement.REMOVE_MATERIAL,
      context.contour.profileMaterialSide,
    );
    const offset = services.compensateProfile(context.contour, context.profileOffsetMm, directionForNegative);
    if (!offset) {
      const groupIds = context.contour.compensationProfile
        ?.map((selected, index) => selected ? index : -1).filter((index) => index >= 0).join(',') ?? 'none';
      this.report(context, [`Profile Offset profile reconstruction failed safely (contour ${context.contour.id}; profile segments ${groupIds}; displacement ${displacement}).`]);
      return;
    }
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
