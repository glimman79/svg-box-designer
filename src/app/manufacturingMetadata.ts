export type ManufacturingMetadata = {
  clearance: boolean;
  slotClearance: boolean;
};

export const importedManufacturingMetadata = (): ManufacturingMetadata => ({
  clearance: false,
  slotClearance: false,
});

export const generatedManufacturingMetadata = (
  slotClearance = false,
): ManufacturingMetadata => ({
  clearance: true,
  slotClearance,
});

export const cloneManufacturingMetadata = (
  manufacturing?: ManufacturingMetadata,
): ManufacturingMetadata | undefined => (manufacturing ? { ...manufacturing } : undefined);
