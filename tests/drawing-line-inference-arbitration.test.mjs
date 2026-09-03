import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const line = await import(pathToFileURL(path.resolve('.test-build/drawing-line-inference-arbitration/drawingLineTool.js')));
const start = { x: 10, y: 20 };
const interaction = line.applyResolvedLineClick(line.EMPTY_LINE_INTERACTION, start, () => 'start').interaction;
const pointAt = (degrees, distance = 100) => ({ x: start.x + distance * Math.cos(degrees * Math.PI / 180), y: start.y + distance * Math.sin(degrees * Math.PI / 180) });
const none = (point) => ({ active: false, type: 'none', effectivePoint: point });
const alignment = (point, { x, y } = {}) => ({
  active: true,
  type: 'alignment',
  effectivePoint: point,
  xReference: x === undefined ? null : { candidatePoint: { x, y: point.y }, screenDistance: Math.abs(point.x - x) },
  yReference: y === undefined ? null : { candidatePoint: { x: point.x, y }, screenDistance: Math.abs(point.y - y) },
});
const exactAngle = (point, expected, message) => {
  const angle = Math.atan2(point.y - start.y, point.x - start.x) * 180 / Math.PI;
  assert.ok(Math.abs(angle - expected) <= 1e-10, `${message}: ${angle} != ${expected}`);
};
const free90 = line.resolveLinePreviewPoint(start, pointAt(89));
assert.equal(free90.snapActive, true);
assert.equal(free90.snappedAngleDegrees, 90);
for (const degrees of [90, 45, 22.5]) {
  const endpoint = pointAt(degrees);
  const resolved = line.updateLinePreviewAtSpatialPoint(interaction, pointAt(degrees + 1), endpoint);
  assert.equal(resolved.effectivePreviewPoint, endpoint, `${degrees} endpoint remains the exact semantic snap object`);
  assert.equal(resolved.snapActive, true, `${degrees} endpoint and angular inference coexist`);
  assert.equal(resolved.snappedAngleDegrees, degrees);
  const committed = line.applyResolvedLineClick(resolved, resolved.effectivePreviewPoint, () => `line-${degrees}`).entity;
  assert.equal(committed.end, endpoint, `${degrees} preview and commit are identical`);
}
const horizontalEndpoint = pointAt(0);
const replaced = line.updateLinePreviewAtSpatialPoint(interaction, pointAt(90), horizontalEndpoint);
assert.equal(replaced.snapActive, true);
assert.equal(replaced.snappedAngleDegrees, 0, 'visual follows actual endpoint geometry rather than stale 90 degrees');
const incompatible = pointAt(13);
const conflict = line.updateLinePreviewAtSpatialPoint(interaction, pointAt(0), incompatible);
assert.equal(conflict.effectivePreviewPoint, incompatible);
assert.equal(conflict.snapActive, false, 'incompatible endpoint cannot retain a false angular visual');
assert.equal(conflict.snappedAngleDegrees, null);
const ctrlAngular = line.resolveLinePreviewPoint(start, pointAt(44));
assert.equal(ctrlAngular.snapActive, true);
assert.equal(ctrlAngular.snappedAngleDegrees, 45);

for (const degrees of [0, 22.5, 45, 67.5, 90]) {
  const raw = pointAt(degrees + 2, 120);
  const spatial = alignment({ ...raw, x: raw.x + 4, y: raw.y - 3 }, { x: raw.x + 4, y: raw.y - 3 });
  const resolved = line.resolveLineEffectivePoint(interaction, raw, spatial);
  assert.equal(resolved.interaction.snapActive, true, `${degrees} remains angular-snapped during X/Y inference`);
  assert.equal(resolved.interaction.effectivePreviewPoint, resolved.effectivePoint, `${degrees} has one authoritative preview endpoint`);
  exactAngle(resolved.effectivePoint, degrees, `${degrees} geometry is exact`);
  const committed = line.applyResolvedLineClick(resolved.interaction, resolved.effectivePoint, () => `hard-${degrees}`).entity;
  assert.deepEqual(committed.end, resolved.effectivePoint, `${degrees} commit equals preview`);
}

for (const rawDegrees of [88, 92]) {
  const raw = pointAt(rawDegrees, 100);
  const resolved = line.resolveLineEffectivePoint(interaction, raw, alignment(raw, { y: 150 }));
  assert.equal(resolved.effectivePoint.x, start.x, 'vertical snap cannot drift sideways inside its angular window');
  exactAngle(resolved.effectivePoint, 90, 'vertical parallel browser case');
}
const horizontal = line.resolveLineEffectivePoint(interaction, pointAt(2), alignment(pointAt(2), { x: 130 }));
assert.equal(horizontal.effectivePoint.y, start.y, 'horizontal snap remains exact during X inference');

const compatible = line.resolveLineEffectivePoint(interaction, { x: 108, y: 118 }, alignment({ x: 108, y: 118 }, { x: 110 }));
assert.equal(compatible.effectivePoint.x, 110, 'compatible X alignment is exact');
assert.ok(Math.abs(compatible.effectivePoint.y - 120) <= 1e-10, 'compatible X alignment intersects the 45 degree ray');
exactAngle(compatible.effectivePoint, 45, 'compatible alignment direction');

const unstable = line.resolveLineEffectivePoint(interaction, pointAt(90, 100), alignment(pointAt(90, 100), { x: 999 }));
assert.equal(unstable.effectivePoint.x, start.x, 'parallel X target remains informational for a vertical ray');
assert.ok(Number.isFinite(unstable.effectivePoint.x) && Number.isFinite(unstable.effectivePoint.y), 'unstable intersection cannot produce NaN or infinity');

const releasedRaw = pointAt(94);
const released = line.resolveLineEffectivePoint(interaction, releasedRaw, alignment({ ...releasedRaw, x: releasedRaw.x + 2 }, { x: releasedRaw.x + 2 }));
assert.equal(released.interaction.snapActive, false, 'existing three-degree angular release boundary remains unchanged');
assert.deepEqual(released.effectivePoint, { ...releasedRaw, x: releasedRaw.x + 2 }, 'released angle follows normal spatial inference');

const exactEndpoint = pointAt(45);
const endpointResolution = line.resolveLineEffectivePoint(interaction, pointAt(44), { active: true, type: 'endpoint', effectivePoint: exactEndpoint });
assert.equal(endpointResolution.effectivePoint, exactEndpoint, 'endpoint target retains higher-priority ownership');
assert.equal(endpointResolution.interaction.snapActive, true, 'exactly compatible endpoint may also report angular snap');
const incompatibleEndpoint = pointAt(44);
const endpointConflict = line.resolveLineEffectivePoint(interaction, pointAt(45), { active: true, type: 'endpoint', effectivePoint: incompatibleEndpoint });
assert.equal(endpointConflict.effectivePoint, incompatibleEndpoint, 'incompatible endpoint still retains higher-priority ownership');
assert.equal(endpointConflict.interaction.snapActive, false, 'blue angular state never describes the incompatible endpoint');

const ctrlResolved = line.resolveLineEffectivePoint(interaction, pointAt(44), none(pointAt(44)));
exactAngle(ctrlResolved.effectivePoint, 45, 'Ctrl-bypassed spatial snap retains Line-specific angular inference');
const workspace = fs.readFileSync('src/app/DrawingWorkspace.tsx', 'utf8');
assert.match(workspace, /resolveLineEffectivePoint\(interaction, rawPoint, snap\)/, 'workspace consumes the authoritative Line resolution');
assert.match(workspace, /commitLinePoint\(effectivePoint, endpointPointId\)/);
assert.match(workspace, /drawing-line-cursor-endpoint/);
assert.match(workspace, /drawing-line-cursor-line/);
assert.match(workspace, /drawing-line-cursor-alignment/);
assert.match(workspace, /if \(panHandlers\.onPointerMove\(event\)\) return;/);
console.log('Drawing Line inference arbitration tests passed');
