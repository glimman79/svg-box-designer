import { buildGeneratedSGeometryItems, resolveSSlotLengthMm, resolveSThickness } from '../../src/app/sGeometry';
import { buildGeneratedTBGeometryItems, getPanelEdgeOperations, resolveTBThickness } from '../../src/app/tbGeometry';
import type { SlotConnectionDefinition, TBConnectionDefinition } from '../../src/app/connectionTypes';
import type { SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const rectangle = (id: string, x: number) => {
  const contour = [{ x, y: 0 }, { x: x + 100, y: 0 }, { x: x + 100, y: 60 }, { x, y: 60 }];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: x, minY: 0, maxX: x + 100, maxY: 60 } };
  return { panel, edges: contour.map((start, index) => ({ id: edgeIds[index], source: id, start, end: contour[(index + 1) % contour.length] })) };
};
const a = rectangle('a', 0); const b = rectangle('b', 140);
const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 260 80', width: 260, height: 80, panels: [a.panel, b.panel], edges: [...a.edges, ...b.edges] };
const tbAssignments = { [a.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' as const } }, [b.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' as const } } };
const sAssignments = { [a.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'A' as const }] }, [b.panel.edgeIds[0]]: { slotAssignments: [{ connectionId: 'S1', slotRole: 'B' as const }] } };
const tbAuto: TBConnectionDefinition = { id: 'TB1', prefix: 'TB', properties: { fingerWidthMm: 99, isFingerWidthManual: false } };
const tbManual: TBConnectionDefinition = { ...tbAuto, properties: { fingerWidthMm: 17, isFingerWidthManual: true } };
const sAuto: SlotConnectionDefinition = { id: 'S1', prefix: 'S', properties: { slotOffsetMm: 2, slotLengthMm: 99, isSlotLengthManual: false, kerfMm: 0.15 } };
const sManual: SlotConnectionDefinition = { ...sAuto, properties: { ...sAuto.properties, slotLengthMm: 17, isSlotLengthManual: true } };
const pm = { defaultThicknessMm: 50, panels: { a: { panelId: 'a', thicknessMm: 4 }, b: { panelId: 'b', thicknessMm: 7 } } };

const tbThickness = resolveTBThickness(model, tbAssignments, tbAuto, pm);
assert(tbThickness.panelAThicknessMm === 4 && tbThickness.panelBThicknessMm === 7, 'TB did not resolve unequal PM thickness');
assert(tbThickness.autoFingerWidthMm === 12, 'automatic TB width is not 3 × min(A, B)');
const autoA = getPanelEdgeOperations(a.panel, tbAssignments, { TB1: tbAuto }, pm, model)[0];
const autoB = getPanelEdgeOperations(b.panel, tbAssignments, { TB1: tbAuto }, pm, model)[0];
assert(autoA?.materialThicknessMm === 4 && autoA.insetDepthMm === 7 && autoA.fingerWidthMm === 12, 'TB A thickness semantics changed');
assert(autoB?.materialThicknessMm === 7 && autoB.insetDepthMm === 4 && autoB.fingerWidthMm === 12, 'TB B thickness semantics changed');
assert(getPanelEdgeOperations(a.panel, tbAssignments, { TB1: tbManual }, pm, model)[0]?.fingerWidthMm === 17, 'manual TB width changed');
for (const invalid of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  const missingA = { defaultThicknessMm: 50, panels: { ...(invalid === undefined ? {} : { a: { panelId: 'a', thicknessMm: invalid } }), b: { panelId: 'b', thicknessMm: 7 } } };
  assert(getPanelEdgeOperations(a.panel, tbAssignments, { TB1: tbAuto }, missingA, model).length === 0, 'invalid/missing TB A thickness did not fail closed');
  const missingB = { defaultThicknessMm: 50, panels: { a: { panelId: 'a', thicknessMm: 4 }, ...(invalid === undefined ? {} : { b: { panelId: 'b', thicknessMm: invalid } }) } };
  assert(getPanelEdgeOperations(a.panel, tbAssignments, { TB1: tbAuto }, missingB, model).length === 0, 'invalid/missing TB B thickness did not fail closed');
}
assert(buildGeneratedTBGeometryItems(model, tbAssignments, { TB1: tbAuto }, { defaultThicknessMm: 50, panels: {} }).length === 0, 'TB defaultThicknessMm rescued missing panel metadata');

const sThickness = resolveSThickness(model, sAssignments, sAuto, pm);
assert(sThickness.panelAThicknessMm === 4 && sThickness.panelBThicknessMm === 7, 'S did not resolve unequal PM thickness');
assert(resolveSSlotLengthMm(sAuto, sThickness) === 12, 'automatic S length is not 3 × panel A thickness');
assert(resolveSSlotLengthMm(sManual, sThickness) === 17, 'manual S length changed');
const sItems = buildGeneratedSGeometryItems(model, sAssignments, { S1: sAuto }, pm);
const slot = sItems.find((item) => item.kind === 'SLOT_PATH');
assert(slot?.geometry.metrics?.widthMm === 4, 'S slot width does not come from panel A PM thickness');
assert(sThickness.panelBThicknessMm === 7, 'S insert depth does not come from panel B PM thickness');
for (const invalid of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  for (const missingPanel of ['a', 'b'] as const) {
    const panels: Record<string, { panelId: string; thicknessMm: number }> = { a: { panelId: 'a', thicknessMm: 4 }, b: { panelId: 'b', thicknessMm: 7 } };
    if (invalid === undefined) delete panels[missingPanel]; else panels[missingPanel] = { panelId: missingPanel, thicknessMm: invalid };
    let threw = false;
    try { buildGeneratedSGeometryItems(model, sAssignments, { S1: sAuto }, { defaultThicknessMm: 50, panels }); } catch (error) { threw = error instanceof Error && error.message.includes('must both resolve PM thickness'); }
    assert(threw, 'invalid/missing S thickness did not throw the incomplete-PM error');
  }
}
console.log('Canonical TB/S panel thickness: PASS');
