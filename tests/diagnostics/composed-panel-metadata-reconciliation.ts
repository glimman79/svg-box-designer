import { reconcileComposedPanelMetadata } from '../../src/app/composedPanelMetadataReconciliation';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import type { SourceGeometryRelationship } from '../../src/app/geometryRelationships';
import type { GeneratedProfile, GeneratedProfileElementId, GeneratedProfileId, GeometryProjectionId } from '../../src/app/generatedProfiles';
import type { PanelCandidate, PanelCandidateSegment } from '../../src/app/panelComposer';
import type { PanelContributorType } from '../../src/app/panelContributors';
import type { GeneratedTapId } from '../../src/app/generatedTaps';

const assert = {
  equal: (actual: unknown, expected: unknown) => { if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`); },
  ok: (value: unknown) => { if (!value) throw new Error('expected truthy value'); },
  deepEqual: (actual: unknown, expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
};

const pid = (value: string) => value as GeneratedProfileId;
const eid = (value: string) => value as GeneratedProfileElementId;
const qid = (value: string) => value as GeometryProjectionId;
const profile = (name: string, start = { x: 0, y: 0 }, end = { x: 10, y: 0 }, tool: PanelContributorType = 'TB', order = 0): GeneratedProfile => {
  const id = pid(`p-${name}`); const element = eid(`e-${name}`); const projection = qid(`q-${name}`);
  return { id, generatorType: tool, operationId: `op-${name}`, panelId: 'panel', sourceEdgeId: `edge-${name}`,
    sourceEdgeDirection: { start, end }, attachmentStart: start, attachmentEnd: end,
    orderedElements: [{ id: element, profileId: id, kind: 'boundary-run', profileOrder: order, geometryProjectionId: projection }],
    geometryProjections: [{ id: projection, profileId: id, elementId: element, kind: 'current-contour-segment', profileSegmentOrder: order, start, end }],
    orderedTaps: [], leadingBoundaryRun: element, trailingBoundaryRun: element };
};
const segment = (p: GeneratedProfile, index = 0, start = p.geometryProjections[0].start, end = p.geometryProjections[0].end): PanelCandidateSegment => ({
  segmentIndex: index, start, end, panelId: p.panelId, sourceEdgeId: p.sourceEdgeId, operationId: p.operationId, profileId: p.id,
  elementId: p.orderedElements[0].id, projectionId: p.geometryProjections[0].id, tapId: null, tapRole: null, relationshipOrigin: 'replaces',
});
const run = (profiles: GeneratedProfile[], segments: PanelCandidateSegment[], relationships: ReadonlyArray<SourceGeometryRelationship> = profiles.map((p) => ({
  kind: 'replaces' as const, operationId: p.operationId, panelId: p.panelId, sourceEdgeId: p.sourceEdgeId,
  provenance: 'native-generated-profile' as const, provenanceId: p.id,
}))) => {
  const candidate: PanelCandidate = { panelId: 'panel', points: [], junctions: [], segments, diagnostics: [], createdFeatures: [] };
  const item = { id: 'carrier', generatedProfiles: profiles } as unknown as GeneratedGeometryItem;
  return reconcileComposedPanelMetadata({ candidate, generatedGeometryItems: [item], relationshipIndex: buildGeometryRelationshipIndex(relationships) });
};

// TB-like, W-like, and a synthetic future contributor all use the same policy.
for (const tool of ['TB', 'W', 'FUTURE_X'] as PanelContributorType[]) {
  const p = profile(tool, undefined, undefined, tool); assert.equal(run([p], [segment(p)]).reconciliations[0].status, 'PRESERVED');
}
{
  const p = profile('remap'); const result = run([p], [segment(p, 0, { x: -1, y: 0 }, { x: 10, y: 0 })]);
  assert.equal(result.reconciliations[0].status, 'REMAPPED'); assert.equal(result.reconciliations[0].evidence.startMoved, true);
}
{
  const p = profile('reverse'); assert.equal(run([p], [segment(p, 0, { x: 10, y: 0 }, { x: 0, y: 0 })]).reconciliations[0].status, 'REVERSED');
}
{
  const p = profile('zero', { x: 2, y: 2 }, { x: 2.005, y: 2.005 }); const result = run([p], []);
  assert.equal(result.reconciliations[0].status, 'ZERO_LENGTH_SEMANTIC'); assert.equal(result.diagnostics.length, 0);
}
{
  const p = profile('missing'); const result = run([p], []);
  assert.equal(result.diagnostics[0].code, 'RECONCILIATION_REQUIRED_PHYSICAL_MAPPING_MISSING');
  assert.ok(!result.reconciliations.some((m) => m.status === 'DROPPED_NONPHYSICAL'));
}
{
  const p = profile('ambiguous'); const result = run([p], [segment(p, 0), segment(p, 1)]);
  assert.equal(result.reconciliations[0].status, 'AMBIGUOUS'); assert.ok(result.diagnostics.some((d) => d.code === 'RECONCILIATION_AMBIGUOUS_FINAL_TARGET'));
}
{
  const p = profile('split'); const result = run([p], [segment(p, 0, { x: 0, y: 0 }, { x: 4, y: 0 }), segment(p, 1, { x: 4, y: 0 }, { x: 10, y: 0 })]);
  assert.equal(result.reconciliations[0].status, 'SPLIT'); assert.deepEqual(result.reconciliations[0].finalSegmentRefs.map((r) => r.originalCoverage), [[0, .4], [.4, 1]]);
  assert.ok(result.diagnostics.some((d) => d.code === 'RECONCILIATION_UNSUPPORTED_SPLIT'));
}
{
  // Coalescence is represented when separately-lineaged candidate ancestry shares a transient final index.
  const a = profile('coal-a'); const b0 = profile('coal-b');
  const b = { ...b0, panelId: a.panelId, sourceEdgeId: a.sourceEdgeId, operationId: a.operationId, id: a.id,
    orderedElements: [{ ...b0.orderedElements[0], profileId: a.id }], geometryProjections: [{ ...b0.geometryProjections[0], profileId: a.id }] } as GeneratedProfile;
  const sb = segment(b, 0); const result = run([a, b], [segment(a, 0), sb], [{ kind: 'replaces', operationId: a.operationId, panelId: a.panelId,
    sourceEdgeId: a.sourceEdgeId, provenance: 'native-generated-profile', provenanceId: a.id }]);
  assert.ok(result.reconciliations.every((m) => m.status === 'COALESCED'));
  assert.ok(result.diagnostics.some((d) => d.code === 'RECONCILIATION_UNSUPPORTED_COALESCE'));
}
{
  const p = profile('bad-lineage'); const broken = { ...p, orderedElements: [] } as GeneratedProfile;
  assert.equal(run([broken], [segment(p)]).diagnostics[0].code, 'RECONCILIATION_CONFLICTING_SEMANTIC_LINEAGE');
}
{
  const p0 = profile('tap'); const element = { ...p0.orderedElements[0], tapId: 'tap-1' as GeneratedTapId, segmentTapRole: 'tap-tip' as const };
  const p = { ...p0, orderedElements: [element] } as unknown as GeneratedProfile;
  assert.equal(run([p], [segment(p)]).diagnostics[0].code, 'RECONCILIATION_INCONSISTENT_TAP_MAPPING');
}
{
  const p = profile('invalid-ref'); assert.equal(run([p], [{ ...segment(p), segmentIndex: -1 }]).diagnostics[0].code, 'RECONCILIATION_INVALID_FINAL_SEGMENT_REF');
}
{
  const a = profile('order-a'); const b = profile('order-b'); const normal = run([a, b], [segment(a, 0), segment(b, 1)]);
  const reversed = run([b, a], [segment(b, 1), segment(a, 0)]); assert.equal(JSON.stringify(normal), JSON.stringify(reversed));
}
{
  // Rotation, translation, contour direction, and raw edge reversal do not change semantic classification.
  const transforms = [
    (x: number, y: number) => ({ x: x + 25, y: y - 7 }), (x: number, y: number) => ({ x: -y, y: x }),
    (x: number, y: number) => ({ x: -x, y: y }),
  ];
  transforms.forEach((transform, i) => { const p = profile(`transform-${i}`, transform(0, 0), transform(10, 0));
    assert.equal(run([p], [segment(p)]).reconciliations[0].status, 'PRESERVED'); });
}
{
  const p = profile('owner'); const relationships = ['owner-a', 'owner-b'].map((operationId) => ({ kind: 'replaces' as const, operationId,
    panelId: p.panelId, sourceEdgeId: p.sourceEdgeId, provenance: 'native-generator-intent' as const, provenanceId: operationId }));
  assert.equal(run([p], [segment(p)], relationships).diagnostics[0].code, 'RECONCILIATION_INVALID_SOURCE_EDGE_OWNERSHIP');
}
{
  // A reference remains non-owning when another operation owns the edge.
  const p = profile('reference'); const relationships = [
    { kind: 'replaces' as const, operationId: p.operationId, panelId: p.panelId, sourceEdgeId: p.sourceEdgeId, provenance: 'native-generated-profile' as const, provenanceId: p.id },
    { kind: 'references' as const, operationId: 's-operation', panelId: p.panelId, sourceEdgeId: p.sourceEdgeId, provenance: 'native-generator-intent' as const, provenanceId: 's-ref' },
  ]; assert.equal(run([p], [segment(p)], relationships).reconciliations[0].status, 'PRESERVED');
}
{
  const p = profile('immutable'); const s = segment(p); const input = { profiles: [p], segments: [s] }; const before = JSON.stringify(input);
  Object.freeze(p.geometryProjections); Object.freeze(p.orderedElements); Object.freeze(p); Object.freeze(s); run(input.profiles, input.segments);
  assert.equal(JSON.stringify(input), before);
}
console.log('composed panel metadata reconciliation: all structural cases passed');
