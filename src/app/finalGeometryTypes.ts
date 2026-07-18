export type FinalGeometryType =
  | 'IMPORTED_OUTER'
  | 'IMPORTED_HOLE'
  | 'GENERATED_OUTER'
  | 'GENERATED_SLOT'
  | 'UNKNOWN';

/** Tool-agnostic classification consumed by manufacturing stages. */
export type ManufacturingClassification = FinalGeometryType;
