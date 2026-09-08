import assert from 'node:assert/strict';
import { resolveDrawingSnap } from '../.test-build/drawing-line-authority/drawingSnapEngine.js';
import { EMPTY_LINE_INTERACTION, automaticAxisConstraintKind, hasAngularPresentationTruth, resolveLineEffectivePoint } from '../.test-build/drawing-line-authority/drawingLineTool.js';

const raw = { x: 10.2, y: 0.3 };
const empty = { endpoints: [], lines: [], alignmentsX: [], alignmentsY: [], perpendiculars: [] };
const endpoint = (entityId, point, distance) => ({ type: 'endpoint', entityId, endpoint: 'end', candidatePoint: point, screenDistance: distance });
const perpendicular = { type: 'perpendicular', entityId: 'target', candidatePoint: { x: 10, y: 0 }, screenDistance: 1 };

// Higher positional authority is evaluated before every retained lower channel.
const retainedPerpendicular = resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, perpendiculars: [perpendicular] }, previousSnap: null, ctrlOverride: false });
const acquiredEndpoint = resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints: [endpoint('joint', { x: 10, y: 0 }, 2)], perpendiculars: [perpendicular] }, previousSnap: retainedPerpendicular, ctrlOverride: false });
assert.equal(acquiredEndpoint.type, 'endpoint');
assert.deepEqual(acquiredEndpoint.effectivePoint, { x: 10, y: 0 });
assert.equal(acquiredEndpoint.channels.perpendicular.entityId, 'target', 'compatible channels coexist with endpoint position');

const retainedLine = { active: true, type: 'line', entityId: 'line', effectivePoint: { x: 9, y: 1 }, segmentParameter: .5, screenDistance: 3, channels: { xAlignment: null, yAlignment: null, perpendicular: null } };
assert.equal(resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints: [endpoint('joint', { x: 10, y: 0 }, 2)] }, previousSnap: retainedLine, ctrlOverride: false }).type, 'endpoint');

// Same-class switching is nearest-first, deterministic by stable identity on ties.
const endpoints = [endpoint('z', { x: 8, y: 0 }, 4), endpoint('a', { x: 10, y: 0 }, 1)];
assert.equal(resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints }, previousSnap: { ...acquiredEndpoint, entityId: 'z' }, ctrlOverride: false }).entityId, 'a');
const tied = [endpoint('z', { x: 8, y: 0 }, 2), endpoint('a', { x: 10, y: 0 }, 2)];
assert.equal(resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints: tied }, previousSnap: null, ctrlOverride: false }).entityId, 'a');

const interaction = { ...EMPTY_LINE_INTERACTION, start: { x: 0, y: 0 }, startPointId: 'start', previousChainedLineId: 'previous' };
const exact = resolveLineEffectivePoint(interaction, raw, acquiredEndpoint);
assert.deepEqual(exact.effectivePoint, { x: 10, y: 0 }, 'endpoint coordinate cannot be projected');
assert.equal(automaticAxisConstraintKind(exact.interaction), 'HORIZONTAL');
assert.equal(exact.interaction.perpendicularLineId, 'target');

const inexactEndpoint = resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints: [endpoint('off-axis', { x: 10, y: .1 }, 1)], perpendiculars: [perpendicular] }, previousSnap: null, ctrlOverride: false });
const inexact = resolveLineEffectivePoint(interaction, raw, inexactEndpoint);
assert.deepEqual(inexact.effectivePoint, { x: 10, y: .1 });
assert.equal(automaticAxisConstraintKind(inexact.interaction), null, 'inexact endpoint vetoes H rather than moving topology');
assert.equal(inexact.interaction.perpendicularLineId, null, 'inexact endpoint vetoes Perpendicular');

const diagonalRaw = { x: 9.8, y: 10.1 };
const diagonalEndpoint = resolveDrawingSnap({ rawPoint: diagonalRaw, candidates: { ...empty, endpoints: [endpoint('diagonal', { x: 10, y: 10 }, 1)] }, previousSnap: null, ctrlOverride: false });
const diagonal = resolveLineEffectivePoint(interaction, diagonalRaw, diagonalEndpoint);
assert.equal(diagonal.interaction.snappedAngleDegrees, 45);
assert.equal(automaticAxisConstraintKind(diagonal.interaction), null, '45 degrees is presentation-only');

const finiteLine = { active: true, type: 'line', entityId: 'finite', effectivePoint: { x: 10.1, y: .2 }, segmentParameter: .5, screenDistance: 1,
  lineStart: { x: 10, y: -5 }, lineEnd: { x: 10, y: 5 }, channels: { xAlignment: null, yAlignment: null, perpendicular: null } };
const composed = resolveLineEffectivePoint(interaction, raw, finiteLine);
assert.deepEqual(composed.effectivePoint, { x: 10, y: 0 }, 'H ray composes with the finite segment');
assert.equal(automaticAxisConstraintKind(composed.interaction), 'HORIZONTAL');

const ctrlSnap = resolveDrawingSnap({ rawPoint: raw, candidates: { ...empty, endpoints: [endpoint('joint', { x: 10, y: 0 }, 1)], perpendiculars: [perpendicular] }, previousSnap: acquiredEndpoint, ctrlOverride: true });
assert.equal(ctrlSnap.type, 'none');
assert.deepEqual(ctrlSnap.channels, { xAlignment: null, yAlignment: null, perpendicular: null, parallel: null });
const ctrl = resolveLineEffectivePoint(interaction, raw, acquiredEndpoint, 'HORIZONTAL', true);
assert.deepEqual(ctrl.effectivePoint, raw);
assert.equal(hasAngularPresentationTruth(ctrl.interaction), false);
assert.equal(ctrl.interaction.perpendicularLineId, null);
assert.equal(ctrl.interaction.startPointId, 'start');
assert.equal(ctrl.interaction.previousChainedLineId, 'previous');

console.log('drawing Line authority tests passed');
