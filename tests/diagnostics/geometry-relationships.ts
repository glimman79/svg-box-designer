import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { auditGeneratedGeometryRelationships, buildGeometryRelationshipIndex } from '../../src/app/geometryRelationships';
import type { GeometryRelationship } from '../../src/app/geometryRelationships';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const rectangle = (id: string, x: number) => {
  const contour = [{ x, y: 0 }, { x: x + 90, y: 0 }, { x: x + 90, y: 50 }, { x, y: 50 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const edges = contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] }));
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: x, minY: 0, maxX: x + 90, maxY: 50 } };
  return { panel, edges };
};
const makeModel = (...parts: ReturnType<typeof rectangle>[]): SvgDocumentModel => ({ content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 500 100', width: 500, height: 100, panels: parts.map(({ panel }) => panel), edges: parts.flatMap(({ edges }) => edges) });
const panelManager = (...panels: SvgPanel[]) => ({ defaultThicknessMm: 5, panels: Object.fromEntries(panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 5 }])) });

// Real TB: edge-local profiles, including distinct logical actors in one aggregate panel item.
const tbOwner = rectangle('tb-owner', 0); const tbMate1 = rectangle('tb-mate-1', 120); const tbMate2 = rectangle('tb-mate-2', 240);
const tbModel = makeModel(tbOwner, tbMate1, tbMate2);
const tbAssignments: any = {
  [tbOwner.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
  [tbMate1.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } },
  [tbOwner.panel.edgeIds[2]]: { edgeAssignment: { connectionId: 'TB2', edgeRole: 'A' } },
  [tbMate2.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB2', edgeRole: 'B' } },
};
const tbConnections: any = Object.fromEntries(['TB1', 'TB2'].map((id) => [id, { id, prefix: 'TB', properties: { materialThicknessMm: 5, fingerWidthMm: 20, isFingerWidthManual: true } }]));
const tbItems = buildGeneratedTBGeometryItems(tbModel, tbAssignments, tbConnections, panelManager(...tbModel.panels));
const tbFrozen = JSON.stringify(tbItems); const tbAudit = auditGeneratedGeometryRelationships(tbItems);
assert(JSON.stringify(tbItems) === tbFrozen, 'relationship audit mutated TB physical output');
const tbOwnerView = tbAudit.sources.find(({ source }) => source.panelId === tbOwner.panel.id && source.sourceEdgeId === tbOwner.panel.edgeIds[0]);
assert(tbOwnerView?.replacementOwner === 'operation:TB:TB1', 'TB replacement did not retain edge-local logical operation identity');
assert(tbAudit.sources.filter(({ source }) => source.panelId === tbOwner.panel.id).length === 2, 'TB audit claimed untouched closure edges');
assert(tbAudit.operations.some(({ operationId, replaces }) => operationId === 'operation:TB:TB2' && replaces.some(({ sourceEdgeId }) => sourceEdgeId === tbOwner.panel.edgeIds[2])), 'second TB operation missing');

// Real S: A replaces, B explicitly references, every independent slot is created.
const sA = rectangle('s-a', 0); const sB = rectangle('s-b', 140); const sModel = makeModel(sA, sB);
const sAssignments: any = { [sA.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' }] }, [sB.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' }] } };
const sConnections: any = { S1: { id: 'S1', prefix: 'S', properties: { materialThicknessMm: 5, slotLengthMm: 20, isSlotLengthManual: true, slotOffsetMm: 0 } } };
const sItems = buildGeneratedSGeometryItems(sModel, sAssignments, sConnections, panelManager(...sModel.panels));
const sFrozen = JSON.stringify(sItems); const sAudit = auditGeneratedGeometryRelationships(sItems);
assert(JSON.stringify(sItems) === sFrozen, 'relationship audit mutated S physical output');
assert(sAudit.sources.find(({ source }) => source.sourceEdgeId === sA.panel.edgeIds[0])?.replacementOwner === 'operation:S:S1', 'S-A replacement missing');
const bView = sAudit.sources.find(({ source }) => source.sourceEdgeId === sB.panel.edgeIds[0]);
assert(bView?.replacementOwner === null && bView.references.join() === 'operation:S:S1', 'S-B must be an unowned reference');
assert(sAudit.features.length === sItems.filter(({ kind }) => kind === 'SLOT_PATH').length && sAudit.features.every(({ creator, feature }) => creator === 'operation:S:S1' && feature.panelId === sB.panel.id && feature.kind === 'SLOT_PATH'), 'S slot creation provenance missing');

const source = (kind: 'replaces' | 'references', operationId: string, panelId: string, sourceEdgeId: string): GeometryRelationship => ({ kind, operationId, panelId, sourceEdgeId, provenance: 'native-generator-intent', provenanceId: `${kind}:${operationId}:${panelId}:${sourceEdgeId}` });
const create = (operationId: string, featureId: string): GeometryRelationship => ({ kind: 'creates', operationId, featureId, panelId: 'P', featureKind: 'SLOT_PATH', provenance: 'native-generated-feature', provenanceId: featureId });
const generic: GeometryRelationship[] = [source('replaces', 'A', 'P', 'E1'), source('replaces', 'A', 'P', 'E2'), source('references', 'A', 'P', 'E3'), source('references', 'A', 'P', 'E4'), create('A', 'F1'), create('A', 'F2'), create('A', 'F3'), source('references', 'B', 'P', 'E3'), source('references', 'C', 'P', 'E3')];
const genericIndex = buildGeometryRelationshipIndex(generic);
const operationA = genericIndex.operations.find(({ operationId }) => operationId === 'A')!;
assert(operationA.replaces.length === 2 && operationA.references.length === 2 && operationA.creates.length === 3, '0..N operation cardinality failed');
assert(genericIndex.sources.find(({ source }) => source.sourceEdgeId === 'E3')?.references.join() === 'A,B,C', 'multiple references failed');
assert(genericIndex.diagnostics.length === 0, 'references or different-edge replacements incorrectly conflict');

const conflictInput = [source('replaces', 'B', 'P', 'E1'), source('replaces', 'A', 'P', 'E1'), source('replaces', 'A', 'P', 'E1')];
const conflict = buildGeometryRelationshipIndex(conflictInput);
assert(conflict.relationships.length === 2 && conflict.diagnostics.filter(({ kind }) => kind === 'replacement-conflict').length === 1, 'replacement deduplication/conflict validation failed');
assert(conflict.sources[0].replacementOwner === null && conflict.sources[0].replacementClaimants.join() === 'A,B', 'conflict was resolved instead of reported');
const reversed = buildGeometryRelationshipIndex([...generic].reverse());
assert(JSON.stringify(genericIndex) === JSON.stringify(reversed), 'normalization depends on input order');

// A replacement and references coexist without ownership transfer (generic coverage; current UI need not author N references).
const coexist = buildGeometryRelationshipIndex([source('references', 'S1', 'PanelB', 'EdgeX'), source('replaces', 'TB1', 'PanelB', 'EdgeX'), source('references', 'S2', 'PanelB', 'EdgeX')]);
assert(coexist.diagnostics.length === 0 && coexist.sources[0].replacementOwner === 'TB1' && coexist.sources[0].references.join() === 'S1,S2', 'owner/reference coexistence failed');
console.log('Geometry relationships: PASS (physical composition remains intentionally out of scope)');
