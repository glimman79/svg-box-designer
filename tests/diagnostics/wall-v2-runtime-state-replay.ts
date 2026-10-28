import { reconcileComposedPanelMetadata } from '../../src/app/composedPanelMetadataReconciliation';
declare const require: (id: string) => { readFileSync(path: string, encoding: string): string };
declare const process: { argv: string[]; exitCode?: number };
import { deserializeGeometryRuntimeDebugState, probeGeometryDownstreamExceptions, serializeGeometryRuntimeDebugState } from '../../src/app/geometryRuntimeDebug';
import type { GeometryRuntimeDebugCapture } from '../../src/app/geometryRuntimeDebug';
import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { packageComposedPanelGeometry } from '../../src/app/generatedGeometryDualRun';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import type { SvgDocumentModel } from '../../src/svgUtils';
import { makeEvidenceRectangle } from './helpers/mixed-evidence-fixture';

// The npm script is also an independently runnable regression. Keep external
// capture replay, and use an explicitly synthetic TB+W capture when no file is supplied.
const createRegressionCapture = (): GeometryRuntimeDebugCapture => {
  const rectangles = [makeEvidenceRectangle('owner', 0, 0, 120, 80),
    makeEvidenceRectangle('tb-mate', 200, 0, 120, 80), makeEvidenceRectangle('w-mate', 400, 0, 120, 80)];
  const svgModel: SvgDocumentModel = { content: '', innerMarkup: '',
    rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 600 100', width: 600, height: 100,
    panels: rectangles.map(({ panel }) => panel), edges: rectangles.flatMap(({ edges }) => edges) };
  const connections = { TB1: { id: 'TB1', prefix: 'TB' as const, properties: { fingerWidthMm: 10, isFingerWidthManual: true } },
    W1: { id: 'W1', prefix: 'W' as const, properties: { fingerWidthMm: 10, isFingerWidthManual: true } } };
  const edgeAssignments = { 'owner-edge-0': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' as const } },
    'tb-mate-edge-2': { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' as const } },
    'owner-edge-1': { edgeAssignment: { connectionId: 'W1', edgeRole: 'A' as const } },
    'w-mate-edge-3': { edgeAssignment: { connectionId: 'W1', edgeRole: 'B' as const } } };
  const panelManager = { defaultThicknessMm: 3, panels: Object.fromEntries(svgModel.panels.map((panel) =>
    [panel.id, { panelId: panel.id, thicknessMm: 3 }])) };
  const tbGeneratedItems = buildGeneratedTBGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  const wGeneratedItems = buildGeneratedWGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  const sGeneratedItems = buildGeneratedSGeometryItems(svgModel, edgeAssignments, connections, panelManager);
  if (!tbGeneratedItems.length || !wGeneratedItems.length) throw new Error('Regression capture must exercise both TB and W.');
  return { schema: 'wall-v2-runtime-debug-b3.7', capturedAt: '2026-10-28T00:00:00Z',
    authoredState: { svgModel, connections, edgeAssignments, panelManager },
    applyInput: { tbGeneratedItems, wGeneratedItems, sGeneratedItems,
      combinedGeneratedItems: [...tbGeneratedItems, ...wGeneratedItems, ...sGeneratedItems] },
    authorityContext: { mode: 'mixed', panelCompositionModel: 'relationship-composed-mixed-v1',
      contributorRegistryIdentity: ['S', 'TB', 'W'], assemblyDiagnostics: null }, downstreamExceptions: [] };
};
const path = process.argv[2];
const serialized = path ? require('fs').readFileSync(path, 'utf8') : serializeGeometryRuntimeDebugState(createRegressionCapture());
const capture = deserializeGeometryRuntimeDebugState<GeometryRuntimeDebugCapture>(serialized);
const originalCapture = serializeGeometryRuntimeDebugState(capture);
if (capture.schema !== 'wall-v2-runtime-debug-b3.7') throw new Error(`Unsupported capture schema: ${capture.schema}`);
const authored: any = capture.authoredState;
const generate = (withoutTB: boolean) => {
  const connections = withoutTB ? Object.fromEntries(Object.entries(authored.connections).filter(([, value]: any) => value.prefix !== 'TB')) : authored.connections;
  const assignments = withoutTB ? Object.fromEntries(Object.entries(authored.edgeAssignments).flatMap(([edgeId, bucket]: any) => {
    const edgeAssignment = authored.connections[bucket?.edgeAssignment?.connectionId]?.prefix === 'TB' ? undefined : bucket?.edgeAssignment;
    const slotAssignments = (bucket?.slotAssignments ?? []).filter((value: any) => authored.connections[value.connectionId]?.prefix !== 'TB');
    const next = { ...(edgeAssignment ? { edgeAssignment } : {}), ...(slotAssignments.length ? { slotAssignments } : {}) };
    return Object.keys(next).length ? [[edgeId, next]] : [];
  })) : authored.edgeAssignments;
  return [
    ...buildGeneratedTBGeometryItems(authored.svgModel, assignments, connections, authored.panelManager),
    ...buildGeneratedWGeometryItems(authored.svgModel, assignments, connections, authored.panelManager),
    ...buildGeneratedSGeometryItems(authored.svgModel, assignments, connections, authored.panelManager),
  ];
};
const execute = (label: string, items: GeneratedGeometryItem[]) => {
  const diagnostics = assembleGeneratedGeometryDiagnostics(authored.svgModel, items);
  let packaged: ReadonlyArray<GeneratedGeometryItem> = items;
  let packagingError: string | null = null;
  try {
    for (const panel of diagnostics.panelDiagnostics) {
      const candidate = diagnostics.panelCandidates.find((item) => item.panelId === panel.panelId);
      if (candidate && !panel.status.startsWith('BLOCKED_')) {
        const reconciliation = reconcileComposedPanelMetadata({ candidate, generatedGeometryItems: packaged,
          relationshipIndex: diagnostics.relationshipIndex });
        packaged = packageComposedPanelGeometry(packaged, candidate, panel.replacementOperationIds, reconciliation);
      }
    }
  } catch (error) { packagingError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error); }
  const downstreamExceptions = probeGeometryDownstreamExceptions(authored.svgModel, items);
  const authority = selectGeneratedGeometryAuthority(authored.svgModel, items, capture.authorityContext.mode as any);
  if (!path && (packagingError || downstreamExceptions.length || !authority.ok)) {
    throw new Error(`${label}: synthetic replay failed: ${packagingError ?? JSON.stringify({ downstreamExceptions, decisions: authority.decisions })}`);
  }
  console.log(JSON.stringify({ label, itemCount: items.length, packagingError, downstreamExceptions,
    authority: { ok: authority.ok, decisions: authority.decisions, panelCompositionModel: authority.panelCompositionModel } }, null, 2));
  return authority;
};
const regenerated = generate(false);
const captured = capture.applyInput.combinedGeneratedItems;
console.log(`RAW_COMPARISON=${serializeGeometryRuntimeDebugState(regenerated) === serializeGeometryRuntimeDebugState(captured) ? 'EXACT_MATCH' : 'DIFFERS'}`);
const regeneratedMixed = execute('A_REGENERATE_TB_PLUS_W', regenerated);
const replayedMixed = execute('B_RAW_REPLAY_TB_PLUS_W', captured);
const regeneratedWall = execute('A_REGENERATE_W_ONLY', generate(true));
const replayedWall = execute('B_RAW_REPLAY_W_ONLY', captured.filter((item) => item.toolType !== 'TB'));
if (!path) {
  const same = (left: unknown, right: unknown) => serializeGeometryRuntimeDebugState(left) === serializeGeometryRuntimeDebugState(right);
  if (!same(regenerated, captured)) throw new Error('Serialized capture changed raw generator IDs or metadata.');
  if (!same(regeneratedMixed, replayedMixed) || !same(regeneratedWall, replayedWall)) throw new Error('Replay changed authority or composed geometry.');
  if (!regeneratedMixed.decisions.some((decision) => decision.cohort === 'MIXED' && decision.authority === 'COMPOSED')) throw new Error('Replay did not exercise mixed composition.');
  if (regeneratedWall.decisions.some((decision) => decision.cohort === 'MIXED')) throw new Error('W-only replay retained TB ownership.');
  if (serializeGeometryRuntimeDebugState(capture) !== originalCapture) throw new Error('Replay mutated its captured input.');
  console.log('PASS | synthetic capture round trip | TB+W and W-only replay | stable identity and authority | immutable capture');
}
