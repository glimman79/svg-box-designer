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

const path = process.argv[2];
if (!path) throw new Error('Usage: npm run test:wall-v2-runtime-state-replay -- path/to/wall-debug-state.json');
const capture = deserializeGeometryRuntimeDebugState<GeometryRuntimeDebugCapture>(require('fs').readFileSync(path, 'utf8'));
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
      if (candidate && !panel.status.startsWith('BLOCKED_')) packaged = packageComposedPanelGeometry(packaged, candidate, panel.replacementOperationIds);
    }
  } catch (error) { packagingError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error); }
  const downstreamExceptions = probeGeometryDownstreamExceptions(authored.svgModel, items);
  const authority = selectGeneratedGeometryAuthority(authored.svgModel, items, capture.authorityContext.mode as any);
  console.log(JSON.stringify({ label, itemCount: items.length, packagingError, downstreamExceptions,
    authority: { ok: authority.ok, decisions: authority.decisions, panelCompositionModel: authority.panelCompositionModel } }, null, 2));
};
const regenerated = generate(false);
const captured = capture.applyInput.combinedGeneratedItems;
console.log(`RAW_COMPARISON=${serializeGeometryRuntimeDebugState(regenerated) === serializeGeometryRuntimeDebugState(captured) ? 'EXACT_MATCH' : 'DIFFERS'}`);
execute('A_REGENERATE_TB_PLUS_W', regenerated);
execute('B_RAW_REPLAY_TB_PLUS_W', captured);
execute('A_REGENERATE_W_ONLY', generate(true));
execute('B_RAW_REPLAY_W_ONLY', captured.filter((item) => item.toolType !== 'TB'));
