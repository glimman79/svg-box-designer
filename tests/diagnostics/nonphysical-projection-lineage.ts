import { reconcileComposedPanelMetadata } from '../../src/app/composedPanelMetadataReconciliation';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import { buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import { createGeneratedProfile } from '../../src/app/generatedProfiles';
import { composePanel } from '../../src/app/panelComposer';
import { adaptFingerJointProfilesToPanelContributions } from '../../src/app/tbShadowPanelAdapter';
import type { GeneratedTapGroup } from '../../src/app/generatedTaps';
import type { SvgPanel } from '../../src/svgUtils';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const panel: SvgPanel = { id: 'panel', contour: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  outerContour: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  edgeIds: ['edge', 'right', 'bottom', 'left'], outerEdgeIds: ['edge', 'right', 'bottom', 'left'], innerContours: [], innerEdgeIds: [],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } };

for (const toolType of ['TB', 'W'] as const) {
  const operationId = `operation:${toolType}:1`; const tapId = `tap:${toolType}` as GeneratedTapGroup['id'];
  const tap: GeneratedTapGroup = { id: tapId, sourceOperationId: operationId, panelId: panel.id, sourceEdgeId: 'edge',
    points: [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 9, y: 0 }, { x: 10, y: 0 }],
    segmentRoles: ['tap-side-start', 'tap-tip', 'tap-side-end'] };
  const profile = createGeneratedProfile({ toolType, connectionId: '1', operationId, panelId: panel.id, sourceEdgeId: 'edge',
    sourceEdgeStart: { x: 0, y: 0 }, sourceEdgeEnd: { x: 10, y: 0 }, attachmentStart: { x: 0, y: 0 },
    attachmentEnd: { x: 9, y: 0 }, taps: [tap] });
  const original = JSON.stringify({ profile, tap });
  const [contribution] = adaptFingerJointProfilesToPanelContributions([profile]);
  assert(contribution.geometry.length === 1 && contribution.geometry[0].elementId.endsWith(':tap-0-tip'), `${toolType}: physical geometry changed`);
  assert(contribution.nonphysicalProjectionLineage?.length === 4, `${toolType}: terminal evidence missing`);
  assert(contribution.nonphysicalProjectionLineage?.every((entry) => entry.disposition === 'TERMINAL_INVERSE_PAIR_NONPHYSICAL'),
    `${toolType}: wrong disposition`);
  const relationship = { kind: 'replaces' as const, operationId, panelId: panel.id, sourceEdgeId: 'edge',
    provenance: 'native-generated-profile' as const, provenanceId: profile.id };
  const candidate = composePanel(panel, buildGeometryRelationshipIndex([relationship]), [contribution]);
  const item = { id: `carrier:${toolType}`, generatedProfiles: [profile] } as unknown as GeneratedGeometryItem;
  const result = reconcileComposedPanelMetadata({ candidate, generatedGeometryItems: [item],
    relationshipIndex: buildGeometryRelationshipIndex([relationship]) });
  assert(result.ok, `${toolType}: reconciliation failed`);
  assert(result.reconciliations.filter((entry) => entry.status === 'DROPPED_NONPHYSICAL').length === 4,
    `${toolType}: nonphysical mappings missing`);
  assert(JSON.stringify({ profile, tap }) === original, `${toolType}: provenance mutated`);
}

console.log('generic nonphysical projection lineage: PASS (start/end TB/W, immutable provenance)');
