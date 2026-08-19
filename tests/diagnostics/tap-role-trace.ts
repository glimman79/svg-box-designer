import { buildGeneratedTBGeometryItems } from '../../src/app/tbGeometry';
import { buildGeneratedSGeometryItems } from '../../src/app/sGeometry';
import { createGeneratedGeometrySnapshot } from '../../src/app/generatedGeometrySnapshot';
import { buildFinalGeometry } from '../../src/app/finalGeometry';
import { createManufacturingGeometry } from '../../src/app/manufacturingGeometry';
import { isTapClearanceEligibleRole } from '../../src/app/generatedTaps';
import type { Point, SvgDocumentModel, SvgPanel } from '../../src/svgUtils';
import type { GeneratedTapGroup } from '../../src/app/generatedTaps';

declare const process: { env: Record<string, string | undefined> };
declare const require: (id: string) => any;

type Orientation = 'horizontal' | 'vertical';
type Winding = 'clockwise' | 'counterclockwise';
type Tool = 'TB' | 'S';

const close = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const onSegment = (p: Point, a: Point, b: Point) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) < 1e-7
  && p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7
  && p.y >= Math.min(a.y, b.y) - 1e-7 && p.y <= Math.max(a.y, b.y) + 1e-7;
const point = (p: Point) => `[${p.x.toFixed(3)}, ${p.y.toFixed(3)}]`;

const rectangle = (id: string, x: number, y: number, w: number, h: number, winding: Winding, selectedSide: number, reverseSource: boolean): { panel: SvgPanel; edges: any[]; selectedEdgeId: string } => {
  const ccw = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const contour = winding === 'counterclockwise' ? ccw : [ccw[0], ccw[3], ccw[2], ccw[1]];
  const edgeIds = contour.map((_, i) => `${id}-edge-${i}`);
  const edges = contour.map((start, i) => {
    const end = contour[(i + 1) % contour.length];
    return { id: edgeIds[i], source: id, start: reverseSource && i === selectedSide ? end : start, end: reverseSource && i === selectedSide ? start : end };
  });
  return { panel: { id, contour, outerContour: contour, innerContours: [], edgeIds, outerEdgeIds: edgeIds, innerEdgeIds: [], bounds: { minX: x, maxX: x + w, minY: y, maxY: y + h } }, edges, selectedEdgeId: edgeIds[selectedSide] };
};

const fixture = (name: string, tool: Tool, orientation: Orientation, winding: Winding, reverseSource: boolean, role: 'A' | 'B') => {
  const selectedSide = orientation === 'horizontal'
    ? (winding === 'counterclockwise' ? 0 : 2)
    : (winding === 'counterclockwise' ? 1 : 3);
  const a = rectangle(`${name}-owner`, 0, 0, 90, 40, winding, selectedSide, reverseSource);
  const b = rectangle(`${name}-mate`, 120, 0, 90, 40, winding, selectedSide, false);
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: '240', height: '80', viewBox: '0 0 240 80' }, viewBox: '0 0 240 80', width: 240, height: 80, panels: [a.panel, b.panel], edges: [...a.edges, ...b.edges] };
  const connectionId = tool === 'TB' ? 'TB1' : `${tool}-${name}`;
  const pm = { defaultThicknessMm: 5, panels: { [a.panel.id]: { panelId: a.panel.id, thicknessMm: 5 }, [b.panel.id]: { panelId: b.panel.id, thicknessMm: 5 } } };
  let assignments: any;
  let connections: any;
  if (tool === 'TB') {
    assignments = { [a.selectedEdgeId]: { edgeAssignment: { connectionId, edgeRole: role } }, [b.selectedEdgeId]: { edgeAssignment: { connectionId, edgeRole: role === 'A' ? 'B' : 'A' } } };
    connections = { [connectionId]: { id: connectionId, prefix: 'TB', properties: { materialThicknessMm: 5, fingerWidthMm: 30, isFingerWidthManual: true } } };
  } else {
    assignments = { [a.selectedEdgeId]: { slotAssignments: [{ connectionId, slotRole: 'A' }] }, [b.selectedEdgeId]: { slotAssignments: [{ connectionId, slotRole: 'B' }] } };
    connections = { [connectionId]: { id: connectionId, prefix: 'S', properties: { materialThicknessMm: 5, slotLengthMm: 30, isSlotLengthManual: true, slotOffsetMm: 0 } } };
  }
  const items = tool === 'TB' ? buildGeneratedTBGeometryItems(model, assignments, connections, pm) : buildGeneratedSGeometryItems(model, assignments, connections, pm);
  return { name, tool, model, items, sourceEdge: model.edges.find((edge) => edge.id === a.selectedEdgeId)! };
};

const adjacentTBFixture = () => {
  const name = 'adjacent-multiple-profiles';
  const owner = rectangle('adjacent-owner', 0, 0, 90, 60, 'counterclockwise', 0, false);
  const mateA = rectangle('adjacent-mate-a', 120, 0, 90, 60, 'counterclockwise', 0, false);
  const mateB = rectangle('adjacent-mate-b', 240, 0, 90, 60, 'counterclockwise', 0, false);
  const edgeA = owner.panel.edgeIds[0]; const edgeB = owner.panel.edgeIds[1];
  const connections: any = {
    TB1: { id: 'TB1', prefix: 'TB', properties: { materialThicknessMm: 5, fingerWidthMm: 30, isFingerWidthManual: true } },
    TB2: { id: 'TB2', prefix: 'TB', properties: { materialThicknessMm: 5, fingerWidthMm: 30, isFingerWidthManual: true } },
  };
  const assignments: any = {
    [edgeA]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'A' } },
    [mateA.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB1', edgeRole: 'B' } },
    [edgeB]: { edgeAssignment: { connectionId: 'TB2', edgeRole: 'A' } },
    [mateB.panel.edgeIds[0]]: { edgeAssignment: { connectionId: 'TB2', edgeRole: 'B' } },
  };
  const panels = [owner.panel, mateA.panel, mateB.panel];
  const model: SvgDocumentModel = { content: '', innerMarkup: '', rootAttributes: { width: null, height: null, viewBox: null }, viewBox: '0 0 360 80', width: 360, height: 80, panels, edges: [...owner.edges, ...mateA.edges, ...mateB.edges] };
  const pm = { defaultThicknessMm: 5, panels: Object.fromEntries(panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: 5 }])) };
  const items = buildGeneratedTBGeometryItems(model, assignments, connections, pm);
  const item = items.find((candidate) => candidate.behaviour.replacesPanelId === owner.panel.id)!;
  invariant(item.generatedProfiles?.length === 2, 'one panel must retain two distinct GeneratedProfiles');
  invariant(close(item.generatedProfiles[0].attachmentEnd, item.generatedProfiles[1].attachmentStart), 'adjacent profiles must retain their shared attachment vertex');
  return { name, tool: 'TB' as const, model, items, sourceEdge: model.edges.find((edge) => edge.id === edgeA)! };
};

const locate = (points: readonly Point[], start: Point, end: Point) => points.findIndex((p, i) => close(p, start) && close(points[(i + 1) % points.length], end));

const traceFixture = ({ name, tool, model, items, sourceEdge }: ReturnType<typeof fixture>) => {
  const item = items.find((candidate) => candidate.kind === 'PANEL_PATH' && candidate.generatedTaps?.some((tap) => tap.sourceEdgeId === sourceEdge.id));
  if (!item) throw new Error(`${name}: generator emitted no owner panel item`);
  const snapshot = createGeneratedGeometrySnapshot({ generatedGeometry: items, revision: 1 });
  const snapshotItem = snapshot.generatedGeometry.find((candidate) => candidate.id === item.id);
  invariant(JSON.stringify(snapshotItem?.generatedTaps) === JSON.stringify(item.generatedTaps), `${name}: snapshot changed generated tap metadata`);
  invariant(JSON.stringify(snapshotItem?.generatedProfiles) === JSON.stringify(item.generatedProfiles), `${name}: snapshot changed GeneratedProfile shadow`);
  const final = buildFinalGeometry(model, snapshot);
  const contour = final.contours.find((candidate) => candidate.panelId === item.behaviour.replacesPanelId)!;
  const manufacturing = createManufacturingGeometry(final).finalContourList.find((candidate) => candidate.id === contour.id)!;
  const manufacturingGeometry = createManufacturingGeometry(final);
  const ownerProfiles = (profiles: typeof final.generatedProfiles) => profiles.filter((profile) => profile.panelId === item.behaviour.replacesPanelId);
  invariant(JSON.stringify(ownerProfiles(final.generatedProfiles)) === JSON.stringify(item.generatedProfiles), `${name}: FinalGeometry changed GeneratedProfile shadow`);
  invariant(JSON.stringify(ownerProfiles(manufacturingGeometry.generatedProfiles)) === JSON.stringify(item.generatedProfiles), `${name}: ManufacturingGeometry changed GeneratedProfile shadow`);
  const finalMask = manufacturing.segmentTapIds?.map((id, i) => id !== null && isTapClearanceEligibleRole(manufacturing.segmentTapRoles?.[i] ?? null)) ?? [];
  console.log(`\n=== ${name} (${tool}) ===`);
  const authoredSegments = (item.generatedTaps?.length ?? 0) * 3;
  console.log(`stage counts: generator=${authoredSegments} authored tap segments; snapshot=${(snapshot.generatedGeometry.find((x) => x.id === item.id)?.generatedTaps?.length ?? 0) * 3} authored tap segments; FinalGeometry=${contour.points?.length ?? 0} segments/ids=${contour.segmentTapIds?.length ?? 0}/roles=${contour.segmentTapRoles?.length ?? 0}; ManufacturingGeometry=${manufacturing.points?.length ?? 0} segments/ids=${manufacturing.segmentTapIds?.length ?? 0}/roles=${manufacturing.segmentTapRoles?.length ?? 0}`);
  for (const profile of item.generatedProfiles ?? []) {
    invariant(profile.orderedElements.every((element, index) => element.profileId === profile.id && element.profileOrder === index), `${name}: ProfileElement ownership/order is invalid`);
    invariant(profile.geometryProjections.length === profile.orderedElements.length, `${name}: projection count differs from ProfileElement count`);
    invariant(profile.orderedElements.every((element) => profile.geometryProjections.some((projection) => projection.id === element.geometryProjectionId && projection.elementId === element.id && projection.profileId === profile.id)), `${name}: ProfileElement projection lineage is incomplete`);
    invariant(profile.orderedTaps.every((tap, index) => tap.tapIndex === index && tap.totalTapCount === profile.orderedTaps.length), `${name}: tap ordering/count is not generator-authored`);
    invariant(profile.orderedTaps.every((tap) => {
      const members = profile.orderedElements.filter((element) => element.tapId === tap.id);
      return members.length === 3 && members[0].id === tap.leadingWallElementId && members[1].id === tap.tipElementId && members[2].id === tap.trailingWallElementId;
    }), `${name}: GeneratedTap does not reference its three ordered ProfileElements`);
    invariant(profile.orderedTaps.every((tap, index, taps) => tap.isFirstTap === (index === 0) && tap.isLastTap === (index === taps.length - 1) && tap.isMiddleTap === (index > 0 && index < taps.length - 1)), `${name}: first/middle/last identity is invalid`);
    const legacy = item.profileGroups?.find((group) => group.id === profile.id);
    invariant(!!legacy && JSON.stringify(legacy.attachmentStart) === JSON.stringify(profile.attachmentStart) && JSON.stringify(legacy.attachmentEnd) === JSON.stringify(profile.attachmentEnd), `${name}: attachments disagree with production metadata`);
    const legacyTapIds = (item.generatedTaps ?? []).filter((tap) => tap.sourceEdgeId === profile.sourceEdgeId).map((tap) => tap.id);
    invariant(JSON.stringify(legacyTapIds) === JSON.stringify(profile.orderedTaps.map((tap) => tap.id)), `${name}: ordered taps disagree with production metadata`);
    console.log(`GeneratedProfile ${profile.id}\n  ordered taps: ${profile.orderedTaps.map((tap) => tap.id).join(', ')}\n  first tap: ${profile.orderedTaps.find((tap) => tap.isFirstTap)?.id ?? 'none'}\n  middle taps: ${profile.orderedTaps.filter((tap) => tap.isMiddleTap).map((tap) => tap.id).join(', ') || 'none'}\n  last tap: ${profile.orderedTaps.find((tap) => tap.isLastTap)?.id ?? 'none'}\n  attachments: ${point(profile.attachmentStart)} -> ${point(profile.attachmentEnd)}\n  ProfileElements: ${profile.orderedElements.map((element) => `${element.profileOrder}:${element.id} [${element.kind}] tap=${element.tapId ?? 'none'}`).join(', ')}\n  GeneratedTap references: ${profile.orderedTaps.map((tap) => `${tap.id} -> ${tap.leadingWallElementId}, ${tap.tipElementId}, ${tap.trailingWallElementId}`).join('; ')}\n  GeometryProjection: ${profile.geometryProjections.map((projection) => `${projection.id} -> contour[${projection.profileSegmentOrder}] ${point(projection.start)} -> ${point(projection.end)}`).join(', ')}`);
  }
  for (const profile of item.profileGroups ?? []) {
    const orderedTaps = (item.generatedTaps ?? []).filter((tap) => tap.sourceEdgeId === profile.sourceEdgeId);
    console.log(`Profile ID: ${profile.id}\nGenerator: ${tool}\nOperation ID: ${profile.sourceOperationId}\nPanel ID: ${profile.panelId}\nSource edge ID: ${profile.sourceEdgeId}\nSource edge direction: ${point(sourceEdge.start)} -> ${point(sourceEdge.end)}\nProfile start attachment: ${profile.attachmentStart ? point(profile.attachmentStart) : 'MISSING'}\nProfile end attachment: ${profile.attachmentEnd ? point(profile.attachmentEnd) : 'MISSING'}\nOrdered tap IDs: [${orderedTaps.map((tap) => tap.id).join(', ')}]\nFirst tap ID: ${orderedTaps[0]?.id ?? 'MISSING'}\nLast tap ID: ${orderedTaps.at(-1)?.id ?? 'MISSING'}`);
    orderedTaps.forEach((tap, tapIndex) => traceProfileTap(tap, tapIndex, orderedTaps.length));
  }
  for (const [tapIndex, tap] of (item.generatedTaps ?? []).entries()) traceTap(tap, tapIndex, sourceEdge.start, sourceEdge.end, model.panels.find((panel) => panel.id === tap.panelId)!, contour.points ?? [], contour.segmentTapIds ?? [], contour.segmentTapRoles ?? [], finalMask);
  console.log(`complete final segment mask: [${finalMask.map((value) => value ? '1' : '0').join(', ')}]`);
  const svgDirectory = process.env.TAP_ROLE_DEBUG_SVG_DIR;
  if (svgDirectory) {
    const fs = require('fs');
    fs.mkdirSync(svgDirectory, { recursive: true });
    fs.writeFileSync(`${svgDirectory}/${name}.svg`, debugSvg(name, contour.points ?? [], contour.segmentTapRoles ?? [], finalMask));
  }
};

const traceProfileTap = (tap: GeneratedTapGroup, tapIndex: number, tapCount: number) => {
  const first = tapIndex === 0;
  const last = tapIndex === tapCount - 1;
  const eligibility = tapCount === 1 ? [false, false] : [!first, !last];
  console.log(`Tap index: ${tapIndex}\nGeneratedTapId: ${tap.id}\nIs first tap: ${first}\nIs last tap: ${last}\nStart wall segment: ${point(tap.points[0])} -> ${point(tap.points[1])}\nTip segment: ${point(tap.points[1])} -> ${point(tap.points[2])}\nEnd wall segment: ${point(tap.points[2])} -> ${point(tap.points[3])}\nPrevious profile element: ${first ? 'profile-start attachment' : `space after tap ${tapIndex - 1}`}\nNext profile element: ${last ? 'profile-end attachment' : `space before tap ${tapIndex + 1}`}`);
  console.log(`Start wall: profile-${first ? 'exterior' : 'interior'}; intended eligible=${eligibility[0]}; proof=tap index ${tapIndex} of ${tapCount}`);
  console.log(`End wall: profile-${last ? 'exterior' : 'interior'}; intended eligible=${eligibility[1]}; proof=tap index ${tapIndex} of ${tapCount}`);
};

const debugSvg = (name: string, points: readonly Point[], roles: readonly any[], mask: readonly boolean[]) => {
  const short: Record<string, string> = { 'source-boundary-start': 'B0', 'source-boundary-end': 'B1', 'tap-side-start': 'TS', 'tap-side-end': 'TE', 'tap-tip': 'TIP', 'corner-closure': 'CC' };
  const lines = points.map((from, i) => {
    const to = points[(i + 1) % points.length];
    const role = roles[i] ?? 'boundary';
    const colour = role === 'tap-tip' ? '#7c3aed' : role.startsWith('tap-side') ? '#dc2626' : role === 'corner-closure' ? '#ea580c' : '#2563eb';
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${colour}"/><text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 1}" font-size="3">${i} ${short[role] ?? 'B'}${mask[i] ? '+' : '-'}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 70"><title>${name} tap-role trace</title><g fill="none" stroke-width="0.8">${lines}</g></svg>\n`;
};

const traceTap = (tap: GeneratedTapGroup, tapIndex: number, sourceStart: Point, sourceEnd: Point, panel: SvgPanel, finalPoints: readonly Point[], ids: readonly any[], roles: readonly any[], mask: readonly boolean[]) => {
  console.log(`Tap:\nGeneratedTapId: ${tap.id}\nPanel: ${tap.panelId}\nSource operation: ${tap.sourceOperationId}\nSource edge: ${tap.sourceEdgeId}\nTap index: ${tapIndex}`);
  tap.segmentRoles.forEach((authoredRole, segmentIndex) => {
    const from = tap.points[segmentIndex]; const to = tap.points[segmentIndex + 1]; const finalIndex = locate(finalPoints, from, to);
    const onPanelBoundary = panel.contour.some((edgeStart, i) => onSegment(from, edgeStart, panel.contour[(i + 1) % panel.contour.length]) && onSegment(to, edgeStart, panel.contour[(i + 1) % panel.contour.length]));
    const expectedRole = segmentIndex === 0
      ? (onPanelBoundary ? 'source-boundary-start' : 'tap-side-start')
      : segmentIndex === 1
        ? 'tap-tip'
        : (onPanelBoundary ? 'source-boundary-end' : 'tap-side-end');
    invariant(authoredRole === expectedRole, `${tap.id} segment ${segmentIndex}: expected authored role ${expectedRole}, received ${authoredRole}`);
    if (close(from, to)) {
      invariant(finalIndex < 0, `${tap.id} segment ${segmentIndex}: collapsed terminal marker unexpectedly became FinalGeometry`);
      console.log(`Segment ${segmentIndex}\nfrom: ${point(from)}\nto: ${point(to)}\nrole: ${authoredRole}\neligible: ${isTapClearanceEligibleRole(authoredRole)}\ncollapsed terminal marker: omitted from FinalGeometry as expected`);
      return;
    }
    invariant(finalIndex >= 0, `${tap.id} segment ${segmentIndex}: missing from FinalGeometry`);
    invariant(ids[finalIndex] === tap.id, `${tap.id} segment ${segmentIndex}: GeneratedTapId changed during propagation`);
    invariant(roles[finalIndex] === authoredRole, `${tap.id} segment ${segmentIndex}: role changed during propagation`);
    invariant(mask[finalIndex] === isTapClearanceEligibleRole(authoredRole), `${tap.id} segment ${segmentIndex}: Tap Clearance mask disagrees with authored eligibility`);
    console.log(`Segment ${segmentIndex}\nfrom: ${point(from)}\nto: ${point(to)}\nrole: ${authoredRole}\neligible: ${isTapClearanceEligibleRole(authoredRole)}\non original source boundary: ${onSegment(from, sourceStart, sourceEnd) && onSegment(to, sourceStart, sourceEnd)}\non any original panel boundary: ${onPanelBoundary}\ntouches source start: ${close(from, sourceStart) || close(to, sourceStart)}\ntouches source end: ${close(from, sourceEnd) || close(to, sourceEnd)}\nindex mapping: generator ${segmentIndex} -> snapshot ${segmentIndex} -> FinalGeometry ${finalIndex} -> ManufacturingGeometry ${finalIndex}\nfinal GeneratedTapId: ${finalIndex < 0 ? 'MISSING' : ids[finalIndex]}\nfinal role: ${finalIndex < 0 ? 'MISSING' : roles[finalIndex]}\nin Tap Clearance mask: ${finalIndex >= 0 && mask[finalIndex]}`);
  });
};

[
  fixture('horizontal-middle', 'TB', 'horizontal', 'counterclockwise', false, 'A'),
  fixture('horizontal-source-start', 'TB', 'horizontal', 'counterclockwise', false, 'B'),
  fixture('horizontal-source-end', 'TB', 'horizontal', 'counterclockwise', false, 'B'),
  fixture('vertical-source-start', 'TB', 'vertical', 'counterclockwise', false, 'B'),
  fixture('vertical-source-end', 'TB', 'vertical', 'counterclockwise', false, 'B'),
  fixture('reversed-horizontal', 'TB', 'horizontal', 'counterclockwise', true, 'B'),
  fixture('reversed-vertical', 'TB', 'vertical', 'counterclockwise', true, 'B'),
  fixture('clockwise', 'TB', 'horizontal', 'clockwise', false, 'B'),
  fixture('s-counterclockwise', 'S', 'horizontal', 'counterclockwise', false, 'A'),
  fixture('s-clockwise-vertical', 'S', 'vertical', 'clockwise', true, 'A'),
  adjacentTBFixture(),
].forEach(traceFixture);
