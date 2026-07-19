import type { FinalGeometryType } from './finalGeometryTypes';
import { getManufacturingPolicy } from './manufacturingPolicy';

/**
 * @deprecated Compatibility-only manufacturing hints. FinalGeometryType is the
 * authoritative source for manufacturing policy decisions.
 */
export type ManufacturingMetadata = {
  clearance: boolean;
  slotClearance: boolean;
};

export type ManufacturingPipelinePolicy = {
  clearance: boolean;
  slotClearance: boolean;
  kerf: boolean;
};

export const getManufacturingPipelineForGeometryType = (
  geometryType: FinalGeometryType = 'UNKNOWN',
): ManufacturingPipelinePolicy => {
  const policy = getManufacturingPolicy(geometryType);
  return {
    clearance: policy.allowClearance,
    slotClearance: policy.allowSlotClearance,
    kerf: policy.allowKerf,
  };
};

/**
 * @deprecated Use getManufacturingPipelineForGeometryType(geometryType).
 */
export const manufacturingMetadataForGeometryType = (
  geometryType: FinalGeometryType = 'UNKNOWN',
): ManufacturingMetadata => {
  const policy = getManufacturingPipelineForGeometryType(geometryType);
  return { clearance: policy.clearance, slotClearance: policy.slotClearance };
};

/** @deprecated Use manufacturingMetadataForGeometryType('IMPORTED_OUTER' | 'IMPORTED_HOLE'). */
export const importedManufacturingMetadata = (): ManufacturingMetadata => manufacturingMetadataForGeometryType('IMPORTED_OUTER');

/** @deprecated Use manufacturingMetadataForGeometryType('GENERATED_OUTER' | 'GENERATED_SLOT'). */
export const generatedManufacturingMetadata = (
  slotClearance = false,
): ManufacturingMetadata => manufacturingMetadataForGeometryType(slotClearance ? 'GENERATED_SLOT' : 'GENERATED_OUTER');

export const cloneManufacturingMetadata = (
  manufacturing?: ManufacturingMetadata,
): ManufacturingMetadata | undefined => (manufacturing ? { ...manufacturing } : undefined);
