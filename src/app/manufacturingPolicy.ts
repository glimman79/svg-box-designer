import type { ManufacturingClassification } from './finalGeometryTypes';
import { noMovementStrategy, offsetStrategy } from './compensationStrategies';
import type { CompensationStrategy } from './compensationStrategies';

export type ManufacturingCompensationStrategy = CompensationStrategy;

/**
 * Tool-agnostic manufacturing capabilities for a classified contour.
 *
 * Policies contain decisions only: they never contain geometry, parameters, or
 * compensation algorithms. Every policy and its diagnostics collection is
 * frozen so a single cached instance can be safely shared by all contours with
 * the same behaviour.
 */
export type ManufacturingPolicy = Readonly<{
  allowClearance: boolean;
  allowSlotClearance: boolean;
  allowKerf: boolean;
  preserveDimensions: boolean;
  movable: boolean;
  editable: boolean;
  compensationStrategy: CompensationStrategy;
  diagnostics: ReadonlyArray<string>;
}>;

const noDiagnostics = Object.freeze([]) as ReadonlyArray<string>;

const fixedCutPolicy: ManufacturingPolicy = Object.freeze({
  allowClearance: false,
  allowSlotClearance: false,
  allowKerf: true,
  preserveDimensions: true,
  movable: false,
  editable: true,
  compensationStrategy: noMovementStrategy,
  diagnostics: noDiagnostics,
});

const generatedContourPolicy: ManufacturingPolicy = Object.freeze({
  allowClearance: true,
  allowSlotClearance: false,
  allowKerf: true,
  preserveDimensions: false,
  movable: true,
  editable: true,
  compensationStrategy: offsetStrategy,
  diagnostics: noDiagnostics,
});

const generatedSlotPolicy: ManufacturingPolicy = Object.freeze({
  ...generatedContourPolicy,
  allowSlotClearance: true,
  compensationStrategy: noMovementStrategy,
});

/** The sole mapping from manufacturing classifications to behaviour. */
const policyByClassification: Readonly<Record<ManufacturingClassification, ManufacturingPolicy>> = Object.freeze({
  IMPORTED_OUTER: fixedCutPolicy,
  IMPORTED_HOLE: fixedCutPolicy,
  GENERATED_OUTER: generatedContourPolicy,
  GENERATED_SLOT: generatedSlotPolicy,
  UNKNOWN: fixedCutPolicy,
});

/** Returns a cached immutable policy; missing classifications use the safe UNKNOWN policy. */
export const getManufacturingPolicy = (
  classification: ManufacturingClassification = 'UNKNOWN',
): ManufacturingPolicy => policyByClassification[classification] ?? policyByClassification.UNKNOWN;
