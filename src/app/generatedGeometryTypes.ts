import type { SourceBounds } from '../svgUtils';
import type { ManufacturingMetadata } from './manufacturingMetadata';
import type { PanelContributorType } from './panelContributors';
import type { ManufacturingClassification } from './finalGeometryTypes';
import type { GeneratedProfile, GeneratedProfileGroup } from './generatedProfiles';
import type { GeneratedTapGroup } from './generatedTaps';
import type { SourceGeometryRelationship } from './geometryRelationships';

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
  toolType: PanelContributorType;
  kind: GeneratedGeometryKind;
  source: GeneratedGeometrySource;
  geometry: GeneratedPathPrimitive;
  behaviour: GeneratedGeometryBehaviour;
  manufacturingClassification: Extract<ManufacturingClassification, 'GENERATED_OUTER' | 'GENERATED_SLOT'>;
  manufacturing?: ManufacturingMetadata;
  pathD: string;
  diagnostics: string[];
  profileGroups?: ReadonlyArray<GeneratedProfileGroup>;
  /** Generator-owned shadow metadata; production algorithms must not consume this field. */
  generatedProfiles?: ReadonlyArray<GeneratedProfile>;
  generatedTaps?: ReadonlyArray<GeneratedTapGroup>;
  /** Explicit generator intent that cannot be recovered safely from contour provenance. */
  sourceRelationships?: ReadonlyArray<SourceGeometryRelationship>;
};

/** Stable identity for a contributor's coherent, pre-composition panel carrier.
 * Final composed panel items intentionally use the separate panel-scoped identity. */
export const createGeneratedPanelCarrierId = (
  contributorType: PanelContributorType,
  panelId: string,
): string => ['generated', 'panel', contributorType, panelId].map(encodeURIComponent).join(':');
