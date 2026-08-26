
export type TBConnectionProperties = {
  // Persisted TB tab size; active for manual TB tab size only.
  fingerWidthMm: number;
  isFingerWidthManual: boolean;
};

export type SlotConnectionProperties = {
  slotOffsetMm: number;
  // Persisted S slot length; active for manual S slot length only.
  slotLengthMm: number;
  isSlotLengthManual: boolean;
  kerfMm: number;
};

/** Wall shares TB's finger-width properties while retaining native Wall identity. */
export type WallConnectionProperties = Partial<TBConnectionProperties>;

export type CornerConnectionProperties = {
  cornerDepthMm: number;
  isCornerDepthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
  cornerType: string;
};

export type PatternConnectionProperties = {
  patternType: string;
  patternWidthMm: number;
  materialThicknessMm: number;
  lineSpacingMm: number;
  rowOffsetMm: number;
  marginMm: number;
};

export type ConnectionPropertiesByPrefix = {
  TB: TBConnectionProperties;
  W: WallConnectionProperties;
  S: SlotConnectionProperties;
  C: CornerConnectionProperties;
  P: PatternConnectionProperties;
};

export type WallConnectionDefinition = {
  id: string;
  prefix: 'W';
  properties: WallConnectionProperties;
};

export type TBConnectionDefinition = {
  id: string;
  prefix: 'TB';
  properties: TBConnectionProperties;
};

export type SlotConnectionDefinition = {
  id: string;
  prefix: 'S';
  properties: SlotConnectionProperties;
};

export type CornerConnectionDefinition = {
  id: string;
  prefix: 'C';
  properties: CornerConnectionProperties;
};

export type PatternConnectionDefinition = {
  id: string;
  prefix: 'P';
  properties: PatternConnectionProperties;
};

export type ConnectionDefinition =
  | TBConnectionDefinition
  | WallConnectionDefinition
  | SlotConnectionDefinition
  | CornerConnectionDefinition
  | PatternConnectionDefinition;

export type ConnectionMap = Record<string, ConnectionDefinition>;

export type ActiveSGroup = {
  groupId: string;
  connectionIds: string[];
  isActive: boolean;
};

export type ActiveTBGroup = {
  groupId: string;
  connectionIds: string[];
  isActive: boolean;
};
