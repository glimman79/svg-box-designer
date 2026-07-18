import type { SourceBounds } from '../svgUtils';
import type { ManufacturingMetadata } from './manufacturingMetadata';
import type { OperationKind } from './operationTypes';
import type { ManufacturingClassification } from './finalGeometryTypes';

export type GeneratedGeometryKind = 'PANEL_PATH' | 'SLOT_PATH';

export type GeneratedGeometrySource = {
  operationId: string;
  panelIds: string[];
  edgeIds: string[];
  connectionIds: string[];
};

/** Generic path primitive. Optional source and metric data describe how a generated
 * path relates to imported geometry without coupling the model to a particular tool. */
export type GeneratedPathPrimitive = {
  type: 'path';
  pathD: string;
  sourcePathD?: string;
  sourceBounds?: SourceBounds;
  metrics?: Readonly<Record<string, number>>;
  references?: Readonly<Record<string, string[]>>;
};

export type GeneratedGeometryBehaviour = {
  assembly: 'panel-boundary' | 'slot-cutout';
  replacesPanelId?: string;
  ownerPanelId?: string;
};

export type GeneratedGeometryItem = {
  id: string;
  operationId: string;
  toolType: OperationKind;
  kind: GeneratedGeometryKind;
  source: GeneratedGeometrySource;
  geometry: GeneratedPathPrimitive;
  behaviour: GeneratedGeometryBehaviour;
  manufacturingClassification: Extract<ManufacturingClassification, 'GENERATED_OUTER' | 'GENERATED_SLOT'>;
  manufacturing?: ManufacturingMetadata;
  pathD: string;
  diagnostics: string[];
};
