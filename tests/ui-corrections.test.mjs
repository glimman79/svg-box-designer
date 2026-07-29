import assert from 'node:assert/strict';
import * as numeric from '../.test-build/app/numericDraft.js';
assert.equal(numeric.parseCompleteNumericDraft('0,78'), 0.78);
assert.equal(numeric.parseCompleteNumericDraft('0.78'), 0.78);
assert.equal(numeric.parseCompleteNumericDraft('-0,15'), -0.15);
for (const incomplete of ['', '-', '+', '0,', '-0,']) assert.equal(numeric.parseCompleteNumericDraft(incomplete), null);
assert.equal(numeric.formatFixedNumericValue(-0.1), '-0.10');

const layout = await import('../.test-build/app/labelLayout.js');
const rectangle = (id, points, edgePrefix = id) => {
  const edges = points.map((start, index) => ({ id: `${edgePrefix}-${index}`, source: '', start, end: points[(index + 1) % points.length] }));
  return {
    edges,
    panel: {
      id,
      outerContour: points,
      innerContours: [],
      outerEdgeIds: edges.map((edge) => edge.id),
      innerEdgeIds: [],
      contour: points,
      edgeIds: edges.map((edge) => edge.id),
      bounds: { minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)), maxY: Math.max(...points.map((point) => point.y)) },
    },
  };
};
const first = rectangle('A', [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }]);
const second = rectangle('B', [{ x: 80.5, y: 50 }, { x: 160.5, y: 50 }, { x: 160.5, y: 0 }, { x: 80.5, y: 0 }]); // reversed contour, narrow gap
const requests = [
  { edge: first.edges[0], label: 'TB1-A' }, // horizontal
  { edge: first.edges[1], label: 'S1-A' }, // vertical
  { edge: first.edges[0], label: 'TB2-A' }, // nearby collision
  { edge: first.edges[3], label: 'S2-A' }, // corner/vertical
  { edge: second.edges[2], label: 'TB1-B' }, // paired shared edge, reversed owner
];
const placements = layout.layoutPanelLabels(requests, [first.panel, second.panel], { labelScale: 1, edgeOffset: 2, measureLabel: (label) => ({ width: label.length * 4 + 2, height: 8 }) });
for (const placement of placements) {
  const panel = placement.panelId === first.panel.id ? first.panel : second.panel;
  assert.equal(layout.isPointInPanel(placement, panel), true, `${placement.label} center is inside owner`);
  assert.equal(layout.isLabelBoxInsidePanel(placement, panel), true, `${placement.label} box is inside owner`);
  assert.equal(placement.diagnostic, undefined);
  const request = requests.find((candidate) => candidate.label === placement.label);
  const normal = layout.getOwningPanelInwardNormal(request.edge, panel);
  const edgeCenter = { x: (request.edge.start.x + request.edge.end.x) / 2, y: (request.edge.start.y + request.edge.end.y) / 2 };
  assert.ok((placement.x - edgeCenter.x) * normal.x + (placement.y - edgeCenter.y) * normal.y > 0, `${placement.label} uses the inward side`);
}
for (let index = 0; index < placements.length; index += 1) for (let other = index + 1; other < placements.length; other += 1) {
  if (placements[index].panelId !== placements[other].panelId) continue;
  const overlap = Math.abs(placements[index].x - placements[other].x) < (placements[index].width + placements[other].width) / 2
    && Math.abs(placements[index].y - placements[other].y) < (placements[index].height + placements[other].height) / 2;
  assert.equal(overlap, false, `${placements[index].label} does not overlap ${placements[other].label}`);
}
const fingerEdge = { id: first.edges[2].id, source: 'generated-finger-joint', start: { x: 55, y: 50 }, end: { x: 25, y: 50 } };
const fingerPlacement = layout.layoutPanelLabels([{ edge: fingerEdge, label: 'TB-FINGER' }], [first.panel], { labelScale: 1, edgeOffset: 2, measureLabel: () => ({ width: 30, height: 8 }) })[0];
assert.equal(layout.isLabelBoxInsidePanel(fingerPlacement, first.panel), true);

console.log('UI label-layout and numeric-draft regression harness passed.');
