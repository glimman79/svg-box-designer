import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { applyProfileOffset, resolveProfileOffsetProfileSelection } from '../../src/app/manufacturingCompensation';
import { createManufacturingGeometry } from '../../src/app/manufacturingGeometry';
import type { GeneratedGeometryItem } from '../../src/app/generatedGeometryTypes';
import type { Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';
import { resolveShadowProfileOffsetEligibility } from './profile-offset-shadow-resolver';

type Winding = 'clockwise' | 'counterclockwise';
type Tool = 'TB' | 'S';
const close = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
const point = (p: Point) => `[${p.x.toFixed(3)}, ${p.y.toFixed(3)}]`;
const marks = (mask: readonly boolean[]) => mask.map((value) => value ? '✓' : '✗').join(' ');

const rectangle = (id: string, x: number, y: number, w: number, h: number, winding: Winding, reverseSide = -1) => {
  const ccw = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const contour = winding === 'counterclockwise' ? ccw : [ccw[0], ccw[3], ccw[2], ccw[1]];
  const edgeIds = contour.map((_, index) => `${id}-edge-${index}`);
  const edges = contour.map((start, index) => {
    const end = contour[(index + 1) % contour.length];
    return { id: edgeIds[index], source: id, start: index === reverseSide ? end : start, end: index === reverseSide ? start : end };
  });
  const panel: SvgPanel = { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: x, maxX: x + w, minY: y, maxY: y + h } };
  return { panel, edges };
};

const fixture = (name: string, tool: Tool, winding: Winding, side: number, reverseSource: boolean, fingerWidthMm: number) => {
  const owner = rectangle(`${name}-owner`, 0, 0, 90, 40, winding, reverseSource ? side : -1);
  const mate = rectangle(`${name}-mate`, 120, 0, 90, 40, winding);
  const panels = [owner.panel, mate.panel];
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 240 80', width: 240, height: 80, panels, edges: [...owner.edges, ...mate.edges] };
  const connectionId = tool === 'TB' ? 'TB1' : `${tool}-${name}`;
  const assignments: any = tool === 'TB'
    ? { [owner.panel.edgeIds[side]]: { edgeAssignment: { connectionId, edgeRole: 'A' } }, [mate.panel.edgeIds[side]]: { edgeAssignment: { connectionId, edgeRole: 'B' } } }
    : { [owner.panel.edgeIds[side]]: { slotAssignments: [{ connectionId, slotRole: 'A' }] }, [mate.panel.edgeIds[side]]: { slotAssignments: [{ connectionId, slotRole: 'B' }] } };
  const connections: any = tool === 'TB'
    ? { [connectionId]: { id: connectionId, prefix: 'TB', properties: { fingerWidthMm, isFingerWidthManual: true } } }
    : { [connectionId]: { id: connectionId, prefix: 'S', properties: { slotLengthMm: fingerWidthMm, isSlotLengthManual: true, slotOffsetMm: 0 } } };
  const panelManager = { defaultThicknessMm: 5, panels: Object.fromEntries(panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 5 }])) };
  const items = tool === 'TB' ? buildGeneratedTBGeometryItems(model, assignments, connections, panelManager) : buildGeneratedSGeometryItems(model, assignments, connections, panelManager);
  return { name, model, items };
};

const adjacentFixture = (edgeCount: 2 | 4) => {
  const owner = rectangle(`${edgeCount}-edge-owner`, 0, 0, 90, 60, 'counterclockwise');
  const mates = Array.from({ length: edgeCount }, (_, index) => rectangle(`${edgeCount}-edge-mate-${index}`, 130 + index * 110, 0, 90, 60, 'counterclockwise'));
  const panels = [owner.panel, ...mates.map((mate) => mate.panel)];
  const assignments: any = {}; const connections: any = {};
  for (let index = 0; index < edgeCount; index += 1) {
    const id = `TB${index + 1}`;
    connections[id] = { id, prefix: 'TB', properties: { fingerWidthMm: 30, isFingerWidthManual: true } };
    assignments[owner.panel.edgeIds[index]] = { edgeAssignment: { connectionId: id, edgeRole: 'A' } };
    assignments[mates[index].panel.edgeIds[0]] = { edgeAssignment: { connectionId: id, edgeRole: 'B' } };
  }
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 600 100', width: 600, height: 100, panels, edges: [...owner.edges, ...mates.flatMap((mate) => mate.edges)] };
  const panelManager = { defaultThicknessMm: 5, panels: Object.fromEntries(panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 5 }])) };
  return { name: edgeCount === 2 ? 'adjacent-profiles' : 'four-operated-edges', model, items: buildGeneratedTBGeometryItems(model, assignments, connections, panelManager) };
};

const project = (profile: NonNullable<GeneratedGeometryItem['generatedProfiles']>[number], points: readonly Point[]) => {
  const mask = points.map(() => false);
  for (const { projection, eligible } of resolveShadowProfileOffsetEligibility(profile)) {
    // A collapsed leading/trailing section is an attachment marker, not a
    // generated contour segment.
    if (close(projection.start, projection.end)) continue;
    const index = points.findIndex((start, candidate) => close(start, projection.start) && close(points[(candidate + 1) % points.length], projection.end));
    if (index >= 0) mask[index] = eligible;
  }
  return mask;
};

let matches = 0; let mismatches = 0; const categories = new Map<string, number>();
const cases = [
  fixture('tb-counterclockwise-multiple', 'TB', 'counterclockwise', 0, false, 20),
  fixture('tb-clockwise-one', 'TB', 'clockwise', 2, false, 90),
  fixture('tb-reversed-source', 'TB', 'counterclockwise', 1, true, 30),
  ...([0, 1, 2, 3] as const).flatMap((side) => ([
    fixture(`canonical-tb-b-ccw-${side}`, 'TB', 'counterclockwise', side, false, 15),
    fixture(`canonical-tb-b-cw-${side}`, 'TB', 'clockwise', side, false, 15),
    fixture(`canonical-tb-b-reversed-${side}`, 'TB', 'counterclockwise', side, true, 15),
  ])),
  fixture('s-counterclockwise-multiple', 'S', 'counterclockwise', 0, false, 20),
  fixture('s-clockwise-corner', 'S', 'clockwise', 3, true, 90),
  adjacentFixture(2), adjacentFixture(4),
];

for (const testCase of cases) {
  const final = buildFinalGeometry(testCase.model, createGeneratedGeometrySnapshot({ generatedGeometry: testCase.items }));
  for (const item of testCase.items.filter((candidate) => candidate.kind === 'PANEL_PATH')) {
    const contour = final.contours.find((candidate) => candidate.panelId === item.behaviour.replacesPanelId);
    if (!contour?.points) continue;
    for (const profile of item.generatedProfiles ?? []) {
      const production = contour.segmentProfileIds?.map((id) => id === profile.id) ?? contour.points.map(() => false);
      const shadow = project(profile, contour.points);
      const firstDifference = production.findIndex((value, index) => value !== shadow[index]);
      const result = firstDifference < 0 ? 'MATCH' : 'MISMATCH';
      if (firstDifference < 0) matches += 1;
      else {
        mismatches += 1;
        const differingKinds = new Set(production.flatMap((value, index) => {
          if (value === shadow[index]) return [];
          const start = contour.points![index]; const end = contour.points![(index + 1) % contour.points!.length];
          return profile.orderedElements.filter((element) => {
            const projection = profile.geometryProjections.find((candidate) => candidate.id === element.geometryProjectionId);
            return !!projection && close(projection.start, start) && close(projection.end, end);
          }).map((element) => element.kind);
        }));
        const category = `production geometric filtering of ${[...differingKinds].join('/') || 'unmapped'} elements`;
        categories.set(category, (categories.get(category) ?? 0) + 1);
      }
      if (firstDifference >= 0) throw new Error(`${testCase.name}: generator-authored ownership differs from semantic projections`);
      const ownedCount = production.filter(Boolean).length;
      if (profile.generatorType === 'TB') {
        production.forEach((owned, index) => {
          if (!owned || !contour.segmentTapIds?.[index]) return;
          if (!contour.segmentTapRoles?.[index]) throw new Error(`${testCase.name}: tap provenance is not segment-aligned`);
        });
      }
      if (testCase.name.startsWith('canonical-tb-b-')) {
        const expected = shadow.filter(Boolean).length;
        if (ownedCount !== expected) throw new Error(`${testCase.name}: ${ownedCount}/${expected} mapped projection segments are owned`);
        const selected = resolveProfileOffsetProfileSelection(createManufacturingGeometry(final), [profile.id]);
        const selectedContour = selected.finalContourList.find((candidate) => candidate.panelId === profile.panelId);
        if (selectedContour?.compensationProfile?.filter(Boolean).length !== expected) throw new Error(`${testCase.name}: resolver did not select all ${expected} segments`);
        for (const amount of [0.9, -0.9]) {
          const displaced = applyProfileOffset(resolveProfileOffsetProfileSelection(createManufacturingGeometry(final), [profile.id]), amount);
          const displacedContour = displaced.finalContourList.find((candidate) => candidate.panelId === profile.panelId);
          if (!displacedContour?.points || displacedContour.pathD === contour.pathD) throw new Error(`${testCase.name}: complete profile displacement ${amount} failed`);
        }
      }
      console.log(`\nProfile ${profile.id}\nPanel: ${profile.panelId}\nGenerator: ${profile.generatorType}\nOperation: ${profile.operationId}\nSource edge: ${profile.sourceEdgeId} ${point(profile.sourceEdgeDirection.start)} -> ${point(profile.sourceEdgeDirection.end)}\nTap count: ${profile.orderedTaps.length}\nTap order: ${profile.orderedTaps.map((tap) => `${tap.tapIndex}:${tap.id}`).join(', ') || '(none)'}\nProfileElements: ${profile.orderedElements.map((element) => `${element.profileOrder}:${element.id} [${element.kind}] tap=${element.tapId ?? 'none'} -> ${element.geometryProjectionId}`).join(', ')}\nGeometry projections: ${profile.geometryProjections.map((projection) => `${projection.id} -> current contour segment ${point(projection.start)} -> ${point(projection.end)}`).join(', ')}\nProduction eligibility\n${marks(production)}\nShadow eligibility\n${marks(shadow)}\nFirst differing segment: ${firstDifference < 0 ? 'none' : `${firstDifference} ${point(contour.points[firstDifference])} -> ${point(contour.points[(firstDifference + 1) % contour.points.length])}; production=${production[firstDifference]}; shadow=${shadow[firstDifference]}`}\nRESULT\n${result}`);
    }
  }
}
console.log(`\nSUMMARY\nProfiles evaluated: ${matches + mismatches}\nMatched: ${matches}\nMismatched: ${mismatches}\nMismatch categories: ${categories.size ? [...categories].map(([name, count]) => `${name}: ${count}`).join(', ') : 'none'}\nGeneratedProfile sufficient: ${mismatches === 0 ? 'yes for all validation cases' : 'not yet'}`);
