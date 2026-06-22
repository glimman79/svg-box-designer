import type { EdgeRole, SlotRole, SourceBounds } from '../svgUtils';

export type EdgeConnectionProperties = {
  materialThicknessMm: number;
  fingerWidthMm: number;
  isFingerWidthManual: boolean;
};

export type SlotConnectionProperties = {
  slotOffsetMm: number;
  slotWidthMm: number;
  slotLengthMm: number;
  isSlotLengthManual: boolean;
  materialThicknessMm: number;
  kerfMm: number;
  playMm: number;
};

export type WallPatternType = 'UNIFORM' | 'ALTERNATING';

export type WallReference = {
  edgeId: string;
  connectionId: string;
  role: EdgeRole | SlotRole;
  sourceType: 'E' | 'S';
};

export type WallConnectionProperties = {
  wallHeightMm: number;
  materialThicknessMm: number;
  fingerWidthMm: number;
  kerfMm: number;
  playMm: number;
  selectedEdgeIds: string[];
  references: WallReference[];
  referencePatternType: WallPatternType | null;
  generatedPatternType: WallPatternType | null;
  generatedConnectionIds: string[];
};

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
  E: EdgeConnectionProperties;
  S: SlotConnectionProperties;
  W: WallConnectionProperties;
  C: CornerConnectionProperties;
  P: PatternConnectionProperties;
};

export type EdgeConnectionDefinition = {
  id: string;
  prefix: 'E';
  properties: EdgeConnectionProperties;
};

export type SlotConnectionDefinition = {
  id: string;
  prefix: 'S';
  properties: SlotConnectionProperties;
};

export type WallConnectionDefinition = {
  id: string;
  prefix: 'W';
  properties: WallConnectionProperties;
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
  | EdgeConnectionDefinition
  | SlotConnectionDefinition
  | WallConnectionDefinition
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

export type ActiveWGroup = {
  groupId: string;
  connectionId: string;
  isActive: boolean;
};

export type AppliedEPanelPath = {
  panelId: string;
  eraseRect: SourceBounds;
  erasePathD: string;
  pathD: string;
  edgeIds: string[];
};

export type AppliedSPanelPath = {
  panelId: string;
  sourceEdgeId: string;
  eraseRect: SourceBounds;
  erasePathD: string;
  pathD: string;
  edgeIds: string[];
};

export type AppliedSSlotPath = {
  connectionId: string;
  sourceAEdgeId: string;
  sourceBEdgeId: string;
  pathD: string;
  startDistance: number;
  endDistance: number;
  widthMm: number;
};

export type AppliedSGeometry = {
  connectionId: string;
  panelPaths: AppliedSPanelPath[];
  slotPaths: AppliedSSlotPath[];
  edgeIds: string[];
};
