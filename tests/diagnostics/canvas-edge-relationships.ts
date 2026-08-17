import { collectSourceEdgeAuthoringClaims, deriveCanvasEdgeRelationshipState, deriveGeneratedCanvasEdgeRelationshipState, sourceEdgeRelationshipKey } from '../../src/app/canvasEdgeRelationships';
import type { GeometryRelationship } from '../../src/app/geometryRelationships';

const assert = {
  equal(actual: unknown, expected: unknown, message = 'values differ') { if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); },
  deepEqual(actual: unknown, expected: unknown, message = 'values differ') { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); },
};

const claim = (kind: 'replaces' | 'references', operationId: string, panelId: string, sourceEdgeId: string): GeometryRelationship => ({
  kind, operationId, panelId, sourceEdgeId, provenance: 'native-generator-intent', provenanceId: `${kind}:${operationId}:${panelId}:${sourceEdgeId}`,
});
const view = (state: ReturnType<typeof deriveCanvasEdgeRelationshipState>, panelId: string, edgeId: string) =>
  state.bySource.get(sourceEdgeRelationshipKey(panelId, edgeId));
const rectangle = (id: string, edgePrefix = id) => {
  const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const edgeIds = contour.map((_, index) => `${edgePrefix}-edge-${index}`);
  return { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } };
};

const base = [claim('replaces', 'operation:TB:E1', 'P', 'edge-0')];
assert.equal(view(deriveCanvasEdgeRelationshipState(base), 'P', 'edge-0')?.replacementOwner, 'operation:TB:E1', 'single TB owner');
assert.equal(view(deriveCanvasEdgeRelationshipState([claim('replaces', 'operation:S:S1', 'P', 'edge-1')]), 'P', 'edge-1')?.replacementOwner, 'operation:S:S1', 'single S-A owner');
assert.deepEqual(view(deriveCanvasEdgeRelationshipState([claim('references', 'operation:S:S1', 'P', 'edge-0')]), 'P', 'edge-0'), {
  source: { panelId: 'P', sourceEdgeId: 'edge-0' }, replacementOwner: null, replacementClaimants: [], references: ['operation:S:S1'],
}, 'S-B is reference-only');

const mixedClaims = [
  claim('replaces', 'operation:TB:E1', 'P', 'edge-0'), claim('references', 'operation:S:S1', 'P', 'edge-0'),
  claim('replaces', 'operation:S:S1', 'P', 'edge-1'),
  claim('references', 'future-ref-2', 'P', 'edge-0'), claim('references', 'future-ref-1', 'P', 'edge-0'),
];
const mixed = deriveCanvasEdgeRelationshipState(mixedClaims);
assert.equal(view(mixed, 'P', 'edge-0')?.replacementOwner, 'operation:TB:E1', 'TB remains owner with S-B reference');
assert.deepEqual(view(mixed, 'P', 'edge-0')?.references, ['future-ref-1', 'future-ref-2', 'operation:S:S1'], 'multiple references are retained deterministically');
assert.equal(view(mixed, 'P', 'edge-1')?.replacementOwner, 'operation:S:S1', 'S-A owns its different edge');
assert.equal(view(mixed, 'P', 'edge-2'), undefined, 'unchanged edge remains unowned');
assert.equal(view(deriveCanvasEdgeRelationshipState([claim('replaces', 'TB', 'P', 'edge-0'), claim('replaces', 'S', 'P', 'edge-2')]), 'P', 'edge-2')?.replacementOwner, 'S', 'non-adjacent owners work');

const reversed = deriveCanvasEdgeRelationshipState([...mixedClaims].reverse());
assert.deepEqual(reversed.index.sources, mixed.index.sources, 'input order does not affect state');
const sameLocalIds = deriveCanvasEdgeRelationshipState([claim('replaces', 'one', 'P1', 'edge-0'), claim('references', 'two', 'P2', 'edge-0')]);
assert.equal(view(sameLocalIds, 'P1', 'edge-0')?.replacementOwner, 'one', 'panel id participates in identity');
assert.equal(view(sameLocalIds, 'P2', 'edge-0')?.replacementOwner, null, 'same local id on another panel is independent');

assert.equal(view(deriveCanvasEdgeRelationshipState([claim('replaces', 'future-wall', 'P', 'edge-2')]), 'P', 'edge-2')?.replacementOwner, 'future-wall', 'unknown replacer works');
assert.equal(view(deriveCanvasEdgeRelationshipState([claim('references', 'future-reader', 'P', 'edge-2')]), 'P', 'edge-2')?.replacementOwner, null, 'unknown reference does not own');
assert.equal(deriveCanvasEdgeRelationshipState([claim('replaces', 'A', 'P', 'edge-0'), claim('replaces', 'B', 'P', 'edge-0')]).index.diagnostics[0]?.kind, 'replacement-conflict', 'same-edge replacements conflict');

const afterRemove = deriveCanvasEdgeRelationshipState(mixedClaims.filter((entry) => entry.operationId !== 'operation:TB:E1'));
assert.equal(view(afterRemove, 'P', 'edge-0')?.replacementOwner, null, 'removing TB clears only TB ownership');
assert.equal(view(afterRemove, 'P', 'edge-1')?.replacementOwner, 'operation:S:S1', 'removing TB preserves S ownership');
const moved = deriveCanvasEdgeRelationshipState([claim('replaces', 'S', 'P', 'edge-2')]);
assert.equal(view(moved, 'P', 'edge-1'), undefined, 'changed assignment clears old edge');
assert.equal(view(moved, 'P', 'edge-2')?.replacementOwner, 'S', 'changed assignment owns new edge');

const panel = rectangle('P'); const mate = rectangle('Q');
const model: any = { panels: [panel, mate], edges: [] };
const connections: any = { E1: { id: 'E1', prefix: 'E', properties: {} }, S1: { id: 'S1', prefix: 'S', properties: {} } };
const assignments: any = {
  [panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'E1', edgeRole: 'A' }, slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] },
  [panel.edgeIds[1]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] },
};
const authored = deriveCanvasEdgeRelationshipState(collectSourceEdgeAuthoringClaims(model, assignments, connections));
assert.equal(view(authored, 'P', panel.edgeIds[0])?.replacementOwner, 'operation:TB:E1', 'normal authoring TB owner');
assert.deepEqual(view(authored, 'P', panel.edgeIds[0])?.references, ['operation:S:S1'], 'normal authoring S-B reference');
assert.equal(view(authored, 'P', panel.edgeIds[1])?.replacementOwner, 'operation:S:S1', 'normal authoring S-A owner');

const generated: any[] = [{
  id: 'composed-panel', operationId: 'composed', toolType: 'TB', kind: 'PANEL_PATH',
  source: { operationId: 'composed', panelIds: ['P'], edgeIds: [...panel.edgeIds], connectionIds: [] },
  behaviour: { assembly: 'panel-boundary', replacesPanelId: 'P' }, geometry: { type: 'path', pathD: '' }, pathD: '', diagnostics: [], manufacturingClassification: 'GENERATED_OUTER',
  generatedProfiles: [
    { id: 'profile-tb', operationId: 'operation:TB:E1', panelId: 'P', sourceEdgeId: panel.edgeIds[0] },
    { id: 'profile-s', operationId: 'operation:S:S1', panelId: 'P', sourceEdgeId: panel.edgeIds[1] },
  ],
  sourceRelationships: [claim('references', 'operation:S:S1', 'P', panel.edgeIds[0])],
}];
const applied = deriveGeneratedCanvasEdgeRelationshipState(generated);
assert.equal(view(applied, 'P', panel.edgeIds[0])?.replacementOwner, 'operation:TB:E1');
assert.equal(view(applied, 'P', panel.edgeIds[1])?.replacementOwner, 'operation:S:S1');
assert.equal(view(applied, 'P', panel.edgeIds[2]), undefined, 'broad PANEL_PATH source.edgeIds does not leak ownership');
assert.deepEqual(applied.index.sources, deriveGeneratedCanvasEdgeRelationshipState(structuredClone(generated)).index.sources, 'snapshot restore reconstructs state');
assert.deepEqual(applied.index.sources, authored.index.sources, 'pre-Apply and post-Apply semantics agree');

console.log('canvas edge relationship semantic tests passed');
