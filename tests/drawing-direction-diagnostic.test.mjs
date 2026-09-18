import assert from 'node:assert/strict';
import test from 'node:test';
import { createDrawingDirectionDiagnosticRecorder } from '../.test-build/drawing-direction-diagnostic/drawingDirectionDiagnostic.js';

const frame = (sequence, phase = 'hover') => ({
  sequence, phase, pointer: {}, context: {},
  candidates: { parallel: [], perpendicular: [] }, previousSnap: null,
  snapResult: { type: 'none', channels: { parallel: null, perpendicular: null } },
  lineResolution: { after: { parallelLineId: null, perpendicularLineId: null } },
  hv: null, presentation: { parallel: false, perpendicular: false, kinds: [] },
  rawDirectionCandidates: null, acquiredDirectionCandidate: null,
  establishedDirectionAuthority: null, establishedReferenceLineId: null,
  establishedConstructionOrigin: null, establishedConstructionDirection: null,
  establishedDirectionState: null, directionAuthorityReleaseReason: null,
  positionCandidates: null, selectedPositionAuthority: null,
  finalGeometryCompatibleWithDirectionAuthority: null, acceptedSemanticTruth: null,
  transientPresentationSelection: null, persistentSemanticSelection: null,
});

test('click copy retains the full practical pointer trajectory', () => {
  const messages = [];
  const original = console.info;
  console.info = (...args) => messages.push(args);
  try {
    const recorder = createDrawingDirectionDiagnosticRecorder();
    for (let sequence = 1; sequence <= 12; sequence++) recorder.record(frame(sequence));
    recorder.record(frame(13, 'click'));
  } finally {
    console.info = original;
  }
  const copy = messages.find(([label]) => label === 'DRAWING_DIRECTION_DIAGNOSTIC_CLICK_COPY');
  assert.ok(copy, 'click emits one copyable diagnostic payload');
  const payload = JSON.parse(copy[1]);
  assert.deepEqual(payload.history.map(({ sequence }) => sequence), Array.from({ length: 13 }, (_, index) => index + 1));
  assert.equal(payload.lastHoverFrame.sequence, 12);
  assert.equal(payload.clickResolvePlacementFrame.sequence, 13);
});
