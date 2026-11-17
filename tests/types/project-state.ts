import { captureProjectState, projectProjectState } from '../../src/app/projectState';
import type { ProjectStateSource } from '../../src/app/projectState';

// Type-checked only: captures expose deep read-only data, projections restore the
// existing owner-facing model types without a new Drawing or BOX domain schema.
const checkBoundaryTypes = (source: ProjectStateSource): ProjectStateSource => {
  const capture = captureProjectState(source);
  // @ts-expect-error captured Sketch maps cannot be replaced
  capture.drawingDocument.sketches = {};
  // @ts-expect-error captured point records are immutable
  capture.drawingDocument.sketches['alpha'].points['center'].x = 20;
  // @ts-expect-error nested workflow collections are read-only
  capture.box.data.activeTBGroup?.connectionIds.push('TB2');
  // @ts-expect-error accepted geometry cannot be changed in a capture
  capture.box.data.generatedGeometrySnapshot.generatedGeometry[0].geometry.pathD = '';
  // @ts-expect-error source edge coordinates are read-only
  capture.box.data.svgModel.edges[0].start.x = 5;
  // @ts-expect-error active module is outside the capture boundary
  capture.activeWorkspace;
  return projectProjectState(capture);
};
void checkBoundaryTypes;
