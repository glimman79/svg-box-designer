import { buildGeneratedTBGeometryItems } from '../../src/app/eGeometry';
import { getContourSignedArea } from '../../src/app/sharedGeometry';
import type { EdgeRole, Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';

const epsilon = 1e-7;
const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < epsilon;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const point = (value: Point) => `(${value.x},${value.y})`;
const length = (start: Point, end: Point) => Math.hypot(end.x - start.x, end.y - start.y);
const supportIntersection = (previous: { start: Point; end: Point }, current: { start: Point; end: Point }): Point => {
  const px = previous.end.x - previous.start.x; const py = previous.end.y - previous.start.y;
  const cx = current.end.x - current.start.x; const cy = current.end.y - current.start.y;
  const denominator = px * cy - py * cx;
  const t = ((current.start.x - previous.start.x) * cy - (current.start.y - previous.start.y) * cx) / denominator;
  return { x: previous.start.x + t * px, y: previous.start.y + t * py };
};

const rectangle = (winding: 'CCW' | 'CW', reversedSourceSide = -1) => {
  const ccw = [{ x: 120, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 40 }, { x: 120, y: 40 }];
  const contour = winding === 'CCW' ? ccw : [ccw[0], ccw[3], ccw[2], ccw[1]];
  const edgeIds = contour.map((_, index) => `edge-${index}`);
  const edges = contour.map((start, index) => {
    const end = contour[(index + 1) % contour.length];
    return { id: edgeIds[index], source: 'panel', start: index === reversedSourceSide ? end : start, end: index === reversedSourceSide ? start : end };
  });
  const panel: SvgPanel = { id: 'panel', contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: 120, minY: 0, maxX: 210, maxY: 40 } };
  return { panel, edges };
};

const run = (name: string, roles: Partial<Record<number, EdgeRole>>, depth = 5, winding: 'CCW' | 'CW' = 'CCW', reversedSourceSide = -1, fingerWidth = 30) => {
  const { panel, edges } = rectangle(winding, reversedSourceSide);
  const assignments: any = {}; const connections: any = {};
  Object.entries(roles).forEach(([rawSide, role]) => {
    const side = Number(rawSide); const id = `TB-${side}`;
    assignments[panel.edgeIds[side]] = { edgeAssignment: { connectionId: id, edgeRole: role } };
    connections[id] = { id, prefix: 'W', properties: { materialThicknessMm: depth, fingerWidthMm: fingerWidth, isFingerWidthManual: true } };
  });
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 240 80', width: 240, height: 80, panels: [panel], edges };
  const items = buildGeneratedTBGeometryItems(model, assignments, connections, { defaultThicknessMm: depth, panels: { panel: { panelId: 'panel', thicknessMm: depth } } });
  assert(items.length === 1, `${name}: generator produced no panel`);
  const item = items[0]; const path = item.geometry.type === 'path' ? item.geometry.pathD : '';
  const values = [...path.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  const contour = values.map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert(path.endsWith('Z'), `${name}: contour is not closed`);
  assert(contour.length >= 3 && Math.abs(getContourSignedArea(contour)) > epsilon, `${name}: invalid area`);
  assert(contour.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)), `${name}: non-finite coordinate`);
  contour.forEach((value, index) => assert(!close(value, contour[(index + 1) % contour.length]), `${name}: zero-length physical side`));

  for (const profile of item.generatedProfiles ?? []) {
    const side = panel.edgeIds.indexOf(profile.sourceEdgeId); const previous = (side + 3) % 4; const next = (side + 1) % 4;
    const previousOperated = roles[previous] !== undefined; const nextOperated = roles[next] !== undefined;
    const sourceStart = panel.contour[side]; const sourceEnd = panel.contour[next];
    const windingSign = getContourSignedArea(panel.contour) >= 0 ? 1 : -1;
    const selectedSupport = (index: number) => {
      const start = panel.contour[index]; const end = panel.contour[(index + 1) % 4]; const role = roles[index];
      if (role !== 'A') return { start, end };
      const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy);
      const shift = { x: -dy / length * depth * windingSign, y: dx / length * depth * windingSign };
      return { start: { x: start.x + shift.x, y: start.y + shift.y }, end: { x: end.x + shift.x, y: end.y + shift.y } };
    };
    const expectedStart = supportIntersection(selectedSupport(previous), selectedSupport(side));
    const expectedEnd = supportIntersection(selectedSupport(side), selectedSupport(next));
    assert(close(profile.attachmentStart, expectedStart), `${name}: start ${point(profile.attachmentStart)} != selected-support intersection ${point(expectedStart)}`);
    assert(close(profile.attachmentEnd, expectedEnd), `${name}: end ${point(profile.attachmentEnd)} != selected-support intersection ${point(expectedEnd)}`);
    const neighborSupports = [!previousOperated ? previous : -1, !nextOperated ? next : -1].filter((index) => index >= 0).map((index) => ({ start: panel.contour[index], end: panel.contour[(index + 1) % 4] }));
    const onSupport = (start: Point, end: Point, support: { start: Point; end: Point }) => {
      const dx = support.end.x - support.start.x; const dy = support.end.y - support.start.y;
      const cross = (p: Point) => Math.abs((p.x - support.start.x) * dy - (p.y - support.start.y) * dx) < epsilon;
      return !close(start, end) && cross(start) && cross(end);
    };
    const projectionByElementId = new Map(profile.geometryProjections.map((projection) => [projection.elementId, projection]));
    const firstSemanticTap = profile.orderedTaps[0];
    const lastSemanticTap = profile.orderedTaps.at(-1);
    if (roles[previous] === 'B' && roles[side] === 'B') {
      if (!firstSemanticTap) throw new Error(`${name}: missing first BB profile tap semantic`);
      const leadingBoundary = projectionByElementId.get(profile.leadingBoundaryRun)!;
      const leadingWall = projectionByElementId.get(firstSemanticTap.leadingWallElementId)!;
      assert(close(leadingBoundary.start, profile.attachmentStart), `${name}: current BB leading boundary does not begin at J`);
      assert(close(leadingBoundary.end, leadingWall.start), `${name}: current BB leading boundary does not end at C`);
      assert(length(leadingBoundary.start, leadingBoundary.end) > epsilon, `${name}: current BB J→C run is not physical`);
      assert(length(leadingWall.start, leadingWall.end) < epsilon, `${name}: current BB I→C terminal wall remains physical`);
    }
    if (roles[side] === 'B' && roles[next] === 'B') {
      if (!lastSemanticTap) throw new Error(`${name}: missing last BB profile tap semantic`);
      const trailingWall = projectionByElementId.get(lastSemanticTap.trailingWallElementId)!;
      const trailingBoundary = projectionByElementId.get(profile.trailingBoundaryRun)!;
      assert(length(trailingWall.start, trailingWall.end) < epsilon, `${name}: previous BB P→I terminal wall remains physical`);
      assert(close(trailingBoundary.start, trailingWall.end), `${name}: previous BB trailing boundary does not begin at P`);
      assert(close(trailingBoundary.end, profile.attachmentEnd), `${name}: previous BB trailing boundary does not end at J`);
      assert(length(trailingBoundary.start, trailingBoundary.end) > epsilon, `${name}: previous BB P→J run is not physical`);
    }
    const offending = profile.geometryProjections.filter((projection) => neighborSupports.some((support) => onSupport(projection.start, projection.end, support)));
    if (offending.length) console.log(name, path, offending.map(({ start, end }) => `${point(start)}>${point(end)}`));
    assert(offending.length === 0, `${name}: ${offending.length} generated segments lie on unoperated neighboring supports`);

    if (Object.keys(roles).length === 1 && roles[side] === 'B') {
      const taps = (item.generatedTaps ?? []).filter((tap) => tap.sourceEdgeId === profile.sourceEdgeId);
      const first = taps[0]; const last = taps.at(-1);
      if (!first || !last) throw new Error(`${name}: missing terminal tap semantics`);
      assert(close(first.points[0], profile.attachmentStart) && close(first.points[1], profile.attachmentStart), `${name}: raw start base/tip did not resolve to J`);
      assert(close(last.points[2], profile.attachmentEnd) && close(last.points[3], profile.attachmentEnd), `${name}: raw end tip/base did not resolve to J`);

      const firstSemantic = profile.orderedTaps[0]; const lastSemantic = profile.orderedTaps.at(-1);
      if (!firstSemantic || !lastSemantic) throw new Error(`${name}: missing stable profile tap semantics`);
      const leadingBoundary = projectionByElementId.get(profile.leadingBoundaryRun)!;
      const leadingWall = projectionByElementId.get(firstSemantic.leadingWallElementId)!;
      const trailingWall = projectionByElementId.get(lastSemantic.trailingWallElementId)!;
      const trailingBoundary = projectionByElementId.get(profile.trailingBoundaryRun)!;
      assert(length(leadingBoundary.start, leadingBoundary.end) < epsilon, `${name}: leading boundary has non-zero physical terminal extent`);
      assert(length(leadingWall.start, leadingWall.end) < epsilon, `${name}: leading wall has non-zero physical terminal extent`);
      assert(length(trailingWall.start, trailingWall.end) < epsilon, `${name}: trailing wall has non-zero physical terminal extent`);
      assert(length(trailingBoundary.start, trailingBoundary.end) < epsilon, `${name}: trailing boundary has non-zero physical terminal extent`);

      const nonZeroWalls = taps.flatMap((tap) => [[tap.points[0], tap.points[1]], [tap.points[2], tap.points[3]]] as const)
        .filter(([start, end]) => length(start, end) > epsilon);
      assert(nonZeroWalls.every(([start, end]) => Math.abs(length(start, end) - depth) < epsilon), `${name}: an interior wall does not equal actual depth`);
      if (name.includes('custom-width')) {
        const interior = taps.find((tap, index) => index > 0 && index < taps.length - 1
          && length(tap.points[0], tap.points[1]) > epsilon && length(tap.points[2], tap.points[3]) > epsilon);
        if (!interior) throw new Error(`${name}: missing interior tap control`);
        assert(Math.abs(length(interior.points[0], interior.points[1]) - depth) < epsilon, `${name}: interior leading wall does not equal actual depth`);
        assert(Math.abs(length(interior.points[2], interior.points[3]) - depth) < epsilon, `${name}: interior trailing wall does not equal actual depth`);
      }
    }
    console.log(`${name} edge=${side} source=${point(sourceStart)}..${point(sourceEnd)} attachment=${point(profile.attachmentStart)}..${point(profile.attachmentEnd)} adjacent-operated=${previousOperated ? 'YES' : 'NO'}/${nextOperated ? 'YES' : 'NO'} terminal-segments=${profile.geometryProjections.filter((projection) => close(projection.start, sourceStart) || close(projection.end, sourceEnd)).length} adjacent-unoperated-support-segments=${offending.length} PASS`);
  }
  return { item, panel };
};

const canonicalA = run('isolated-A-control', { 0: 'A' });
const canonicalB = run('isolated-B-depth-5', { 0: 'B' });
assert(canonicalB.item.geometry.type === 'path' && canonicalB.item.geometry.pathD === 'M 120 0 L 150 0 L 150 5 L 180 5 L 180 0 L 210 0 L 210 40 L 120 40 Z', `canonical B path mismatch: ${canonicalB.item.geometry.type === 'path' ? canonicalB.item.geometry.pathD : ''}`);
assert(canonicalA.item.geometry.type === 'path' && canonicalA.item.geometry.pathD === 'M 120 5 L 150 5 L 150 0 L 180 0 L 180 5 L 210 5 L 210 40 L 120 40 Z', `canonical A path mismatch: ${canonicalA.item.geometry.type === 'path' ? canonicalA.item.geometry.pathD : ''}`);
const canonicalAProfile = canonicalA.item.generatedProfiles?.[0];
assert(!!canonicalAProfile && close(canonicalAProfile.attachmentStart, { x: 120, y: 5 }) && close(canonicalAProfile.attachmentEnd, { x: 210, y: 5 }), 'canonical A attachments do not use mixed selected-support intersections');
const canonicalA3 = run('isolated-A-depth-3', { 0: 'A' }, 3);
const canonicalA3Profile = canonicalA3.item.generatedProfiles?.[0];
assert(!!canonicalA3Profile && close(canonicalA3Profile.attachmentStart, { x: 120, y: 3 }) && close(canonicalA3Profile.attachmentEnd, { x: 210, y: 3 }), 'depth-3 A attachments are incorrect');
run('isolated-B-depth-3', { 0: 'B' }, 3);
const terminalB24 = run('isolated-B-depth-2.4', { 0: 'B' }, 2.4);
const terminalB55 = run('isolated-B-depth-5.5', { 0: 'B' }, 5.5);
run('isolated-A-depth-2.4', { 0: 'A' }, 2.4);
run('isolated-A-depth-5.5', { 0: 'A' }, 5.5);
run('isolated-B-depth-3.25-custom-width', { 0: 'B' }, 3.25, 'CCW', -1, 10);
assert(terminalB24.item.generatedTaps?.map((tap) => tap.id).join('|') === terminalB55.item.generatedTaps?.map((tap) => tap.id).join('|'), 'terminal GeneratedTap IDs changed with geometry depth');
assert(terminalB24.item.generatedProfiles?.[0]?.orderedElements.map((element) => element.id).join('|') === terminalB55.item.generatedProfiles?.[0]?.orderedElements.map((element) => element.id).join('|'), 'terminal GeneratedProfile element IDs changed with geometry depth');
for (const winding of ['CCW', 'CW'] as const) for (let side = 0; side < 4; side += 1) {
  run(`isolated-A-${winding}-side-${side}`, { [side]: 'A' }, 5, winding);
  run(`isolated-A-reversed-source-${winding}-side-${side}`, { [side]: 'A' }, 5, winding, side);
  run(`isolated-B-${winding}-side-${side}`, { [side]: 'B' }, 5, winding);
  run(`isolated-B-reversed-source-${winding}-side-${side}`, { [side]: 'B' }, 5, winding, side);
}
run('two-non-adjacent-B', { 0: 'B', 2: 'B' });
run('non-adjacent-A-B', { 0: 'A', 2: 'B' });
run('previous-neighbor-operated-only', { 0: 'A', 1: 'B' });
run('next-neighbor-operated-only', { 0: 'B', 1: 'A' });
for (const [name, first, second] of [['AA', 'A', 'A'], ['BB', 'B', 'B'], ['AB', 'A', 'B'], ['BA', 'B', 'A']] as const) run(name, { 0: first, 1: second });
for (const winding of ['CCW', 'CW'] as const) for (const depth of [2.4, 3.25, 5.5]) for (let current = 0; current < 4; current += 1) {
  const previous = (current + 3) % 4;
  run(`BB-edge-local-${winding}-corner-${previous}-${current}-depth-${depth}`, { [previous]: 'B', [current]: 'B' }, depth, winding);
}
run('BB-edge-local-custom-width', { 0: 'B', 1: 'B' }, 3.25, 'CCW', -1, 10);
run('four-operated-edges', { 0: 'A', 1: 'B', 2: 'A', 3: 'B' });
console.log('TB edge-locality: PASS');
