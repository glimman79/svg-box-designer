import type { SvgDocumentModel } from '../svgUtils';
import { assembleGeneratedGeometryDiagnostics } from './generatedGeometryAssembly';
import { packageComposedPanelGeometry } from './generatedGeometryDualRun';
import { reconcileComposedPanelMetadata } from './composedPanelMetadataReconciliation';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { buildFinalGeometry } from './finalGeometry';
import { processManufacturingGeometry } from './manufacturingCompensation';
import { defaultPanelContributorRegistry } from './panelContributors';

const tag = '__wallDebugType';

const encode = (value: unknown): unknown => {
  if (value === undefined) return { [tag]: 'undefined' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [tag]: 'number', value: String(value) };
  if (typeof value === 'bigint') return { [tag]: 'bigint', value: String(value) };
  if (value instanceof Map) return { [tag]: 'map', entries: [...value.entries()]
    .map(([key, item]) => [encode(key), encode(item)]).sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0]))) };
  if (value instanceof Set) return { [tag]: 'set', values: [...value].map(encode).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, encode(item)]));
  return value;
};

const decode = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record[tag] === 'undefined') return undefined;
  if (record[tag] === 'number') return record.value === 'NaN' ? NaN : record.value === 'Infinity' ? Infinity : -Infinity;
  if (record[tag] === 'bigint') return BigInt(String(record.value));
  if (record[tag] === 'map') return new Map((record.entries as unknown[][]).map(([key, item]) => [decode(key), decode(item)]));
  if (record[tag] === 'set') return new Set((record.values as unknown[]).map(decode));
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decode(item)]));
};

/** Canonical, lossless diagnostic JSON. This is deliberately independent of the project snapshot schema. */
export const serializeGeometryRuntimeDebugState = (value: unknown) => JSON.stringify(encode(value));
export const deserializeGeometryRuntimeDebugState = <T>(json: string): T => decode(JSON.parse(json)) as T;

export type GeometryRuntimeDebugCapture = {
  schema: 'wall-v2-runtime-debug-b3.7'; capturedAt: string;
  authoredState: Record<string, unknown>;
  applyInput: { tbGeneratedItems: GeneratedGeometryItem[]; wGeneratedItems: GeneratedGeometryItem[];
    sGeneratedItems: GeneratedGeometryItem[]; combinedGeneratedItems: GeneratedGeometryItem[] };
  authorityContext: { mode: string; panelCompositionModel: string; contributorRegistryIdentity: string[];
    assemblyDiagnostics: unknown };
  downstreamExceptions: Array<{ panelId: string | null; message: string; stack?: string; stage: string }>;
};

/** Runs downstream stages without the authority catch, solely to retain the hidden development exception. */
export const probeGeometryDownstreamExceptions = (svgModel: SvgDocumentModel, items: GeneratedGeometryItem[]) => {
  const failures: GeometryRuntimeDebugCapture['downstreamExceptions'] = [];
  let stage = 'assembleGeneratedGeometryDiagnostics';
  try {
    const diagnostics = assembleGeneratedGeometryDiagnostics(svgModel, items);
    let temporary: ReadonlyArray<GeneratedGeometryItem> = items;
    for (const panel of diagnostics.panelDiagnostics) {
      const candidate = diagnostics.panelCandidates.find((value) => value.panelId === panel.panelId);
      if (!candidate || panel.status.startsWith('BLOCKED_')) continue;
      stage = 'packageComposedPanelGeometry';
      const reconciliation = reconcileComposedPanelMetadata({ candidate, generatedGeometryItems: temporary,
        relationshipIndex: diagnostics.relationshipIndex });
      temporary = packageComposedPanelGeometry(temporary, candidate, panel.replacementOperationIds, reconciliation);
    }
    stage = 'buildFinalGeometry';
    const finalGeometry = buildFinalGeometry(svgModel, temporary);
    stage = 'processManufacturingGeometry';
    processManufacturingGeometry(finalGeometry, 0, 0, 0, [], 0);
  } catch (error) {
    failures.push({ panelId: null, stage, message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}) });
  }
  return failures;
};

export const geometryContributorRegistryIdentity = () => [...defaultPanelContributorRegistry.keys()].sort();

export const downloadGeometryRuntimeDebugState = (capture: GeometryRuntimeDebugCapture) => {
  const json = serializeGeometryRuntimeDebugState(capture);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\..+/, '');
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  anchor.download = `wall-debug-state-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  return json;
};
