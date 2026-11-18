import { createProjectHistory, transactProjectHistory, undoProjectHistory } from '../../src/app/projectHistory';
import type { ProjectTransaction, ProjectTransactionMetadata } from '../../src/app/projectHistory';
import { captureProjectState, projectProjectState } from '../../src/app/projectState';
import type { ProjectStateSource } from '../../src/app/projectState';

const checkHistoryTypes = (source: ProjectStateSource, metadata: ProjectTransactionMetadata): ProjectStateSource => {
  const history = createProjectHistory(captureProjectState(source));
  // @ts-expect-error accepted geometry is deeply read-only
  history.current.drawingDocument.sketches.alpha.points.center.x = 3;
  // @ts-expect-error BOX generated output cannot be changed through history
  history.current.box.data.generatedGeometrySnapshot.generatedGeometry[0].geometry.pathD = '';
  // @ts-expect-error history stacks are immutable
  history.undo.push({ frame: history.current, transaction: metadata });
  // @ts-expect-error current frame cannot be replaced in place
  history.current = captureProjectState(source);
  // @ts-expect-error no transient UI state in the history contract
  history.current.activeWorkspace;
  transactProjectHistory(history, metadata, (transaction) => {
    // @ts-expect-error staging data is also deeply read-only
    transaction.getCandidate().box.data.activeTBGroup?.connectionIds.push('TB2');
    return 'noop';
  });
  // @ts-expect-error asynchronous actions require a future runtime protocol
  transactProjectHistory(history, metadata, async () => 'accept' as const);
  const checkAsyncUpdate = (transaction: ProjectTransaction) => {
    // @ts-expect-error asynchronous updates cannot stage project data
    transaction.update(async (frame) => frame);
  };
  void checkAsyncUpdate;
  return projectProjectState(undoProjectHistory(history).frame);
};
void checkHistoryTypes;
