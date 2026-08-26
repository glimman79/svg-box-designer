import { assembleGeneratedGeometryDiagnostics } from '../../src/app/generatedGeometryAssembly';
import { selectGeneratedGeometryAuthority } from '../../src/app/generatedGeometryAuthority';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { processManufacturingGeometry } from '../../src/app/manufacturingCompensation';
import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedWGeometryItems } from '../../src/app/wallGeometry';
import { validateWallAuthoringForApply } from '../../src/app/wallAuthoring';
import type { ConnectionMap } from '../../src/app/connectionTypes';
import type { EdgeAssignmentRecord, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const rectangle = (id: string, x: number): { panel: SvgPanel; edges: SvgDocumentModel['edges'] } => {
  const contour = [{ x, y: 0 }, { x: x + 80, y: 0 }, { x: x + 80, y: 60 }, { x, y: 60 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds,
    innerEdgeIds: [], bounds: { minX: x, minY: 0, maxX: x + 80, maxY: 60 } };
  return { panel, edges: contour.map((start, index) =>
    ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] })) };
};

const left = rectangle('panel-a', 0); const right = rectangle('panel-b', 120);
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null },
  viewBox: '0 0 200 60', width: 200, height: 60, panels: [left.panel, right.panel], edges: [...left.edges, ...right.edges] };
const sourceEdges = [left.panel.edgeIds[1], right.panel.edgeIds[3]] as const;
const thickness = { defaultThicknessMm: 3, panels: { 'panel-a': { panelId: 'panel-a', thicknessMm: 3 },
  'panel-b': { panelId: 'panel-b', thicknessMm: 3 } } };

const normalize = (value: unknown) => JSON.parse(JSON.stringify(value)
  .replaceAll('TB1', 'FJ1').replaceAll('W1', 'FJ1')
  .replaceAll('TB', 'FJ').replaceAll('W', 'FJ'));
const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  const left = JSON.stringify(actual); const right = JSON.stringify(expected);
  if (left !== right) {
    const index = [...left].findIndex((character, offset) => character !== right[offset]);
    throw new Error(`${message}; first difference at ${index}: ${left.slice(Math.max(0, index - 80), index + 120)} != ${right.slice(Math.max(0, index - 80), index + 120)}`);
  }
};

const run = (tool: 'TB' | 'W') => {
  const id = `${tool}1`; const connections: ConnectionMap = {
    [id]: { id, prefix: tool, properties: { fingerWidthMm: 10, isFingerWidthManual: true } },
  };
  const assignments: EdgeAssignmentRecord = {
    [sourceEdges[0]]: { edgeAssignment: { connectionId: id, edgeRole: 'A' } },
    [sourceEdges[1]]: { edgeAssignment: { connectionId: id, edgeRole: 'B' } },
  };
  if (tool === 'W') validateWallAuthoringForApply(model, assignments, connections);
  const raw = tool === 'TB' ? buildGeneratedTBGeometryItems(model, assignments, connections, thickness)
    : buildGeneratedWGeometryItems(model, assignments, connections, thickness);
  const assembly = assembleGeneratedGeometryDiagnostics(model, raw);
  const authority = selectGeneratedGeometryAuthority(model, raw, 'mixed', assembly);
  const final = buildFinalGeometry(model, authority.generatedGeometry);
  const manufacturing = processManufacturingGeometry(final, 0, 0, 0, [], 0);
  return { raw, assembly: { candidates: assembly.panelCandidates, diagnostics: assembly.panelDiagnostics },
    authority: { ok: authority.ok, generatedGeometry: authority.generatedGeometry,
      blockingDecisions: authority.blockingDecisions }, final, manufacturing };
};

const tb = run('TB'); const wall = run('W');
assertEqual(tb.authority.ok, true, 'same-edge TB oracle must pass');
assertEqual(wall.authority.ok, true, 'current same-edge W pipeline unexpectedly diverged from TB');
assertEqual(normalize(wall.raw), normalize(tb.raw), 'generated profiles/taps/carriers differ beyond tool identity');
assertEqual(normalize(wall.assembly), normalize(tb.assembly), 'adapter/composer output differs beyond tool identity');
assertEqual(normalize(wall.authority), normalize(tb.authority), 'packaged authority output differs beyond tool identity');
assertEqual(normalize(wall.final), normalize(tb.final), 'FinalGeometry differs beyond tool identity');
assertEqual(normalize(wall.manufacturing), normalize(tb.manufacturing), 'manufacturing differs beyond tool identity');

const summarize = (result: typeof tb) => ({ authority: result.authority.ok,
  profiles: result.raw.flatMap((item) => item.generatedProfiles ?? []).length,
  taps: result.raw.flatMap((item) => item.generatedTaps ?? []).length,
  candidateSegments: result.assembly.candidates.map((candidate) => candidate.segments.length),
  clearanceMissing: result.final.diagnostics.filter((diagnostic) => diagnostic.code === 'CLEARANCE_PROFILE_MISSING').length,
  manufacturingContours: result.manufacturing.contours.length });
console.log(JSON.stringify({ sameModel: true, sameSourceEdges: sourceEdges, tabWidthMm: 10,
  tb: summarize(tb), wall: summarize(wall), equivalentModuloIdentity: true,
  naturalRedRegression: false,
  conclusion: 'CURRENT_SOURCE_IS_EXACTLY_EQUIVALENT_MODULO_TOOL_IDENTITY; TB_PASS_W_FAIL_NOT_REPRODUCED' }, null, 2));
