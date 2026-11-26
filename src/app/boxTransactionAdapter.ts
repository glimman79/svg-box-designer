import type { GlobalEditResult, GlobalProjectHistory } from './globalProjectHistory';
import { projectDataEqual } from './projectDataEqual';
import { retainEquivalentSnapshot } from './generatedGeometrySnapshot';
import { IMPORTED_SOURCE, sameSketchRequired } from './boxSources';
import { createInitialBoxState } from './projectOwner';
import { boxStateFields, type BoxStateSource } from './projectState';

export type BoxTransactionResult = GlobalEditResult;

export function createBoxTransactionAdapter(owner: GlobalProjectHistory, renderEpoch?: number) {
  type ImportToken = ReturnType<typeof owner.beginBoxImport>;
  function transact(label: string, prepare: (before: BoxStateSource) => BoxStateSource, token?: ImportToken, boundary?: 'beginTB' | 'finishTB') {
    const current = () => (renderEpoch === undefined || renderEpoch === owner.getEpoch())
      && (renderEpoch === undefined || owner.getPublication().activeWorkspace === 'construction')
      && (!token || owner.isCurrentBoxImport(token));
    if (!current()) return { outcome: 'rejected' as const, error: new Error('Select the current source. ' + sameSketchRequired) };
    const transact = boundary === 'beginTB' ? (_label: string, action: Parameters<typeof owner.transact>[2], admit: () => boolean) => owner.beginTBDraft(action, admit)
      : boundary === 'finishTB' ? owner.acceptTBDraft
      : (label: string, action: Parameters<typeof owner.transact>[2], admit: () => boolean) => owner.transact('box', label, action, admit);
    return transact(label, tx => {
      const project = owner.getSnapshot();
      const scope = owner.getBoxScope();
      const before = token ? project.box : scope.box;
      const next = prepare(before);
      if (next === before && (!token || scope.id === IMPORTED_SOURCE)) return 'noop';
      if (!next || Object.keys(before).some(key => !Object.hasOwn(next, key))) throw new TypeError('Incomplete BOX candidate');
      if (!token && before.svgModel.drawingSource) {
        tx.update(frame => ({ ...frame, boxSources: { ...frame.boxSources,
          sketches: { ...frame.boxSources!.sketches, [scope.id]: next } } }));
      } else {
        tx.update(frame => ({ ...frame, box: boxStateFields(next),
          ...(token && frame.boxSources && { boxSources: { ...frame.boxSources, selection: { id: IMPORTED_SOURCE } } }) }));
      }
      return 'accept';
    }, current);
  }
  function replaceSource(token: ImportToken, svgModel: BoxStateSource['svgModel'], panelManager: BoxStateSource['panelManager']) {
    return transact('Import SVG source', before => {
      const next = { ...createInitialBoxState(), svgModel, connections: before.connections, panelManager,
        appliedGeometryInputs: undefined, dependencyDiagnostics: undefined };
      if (svgModel.content !== before.svgModel.content) return next;
      next.generatedGeometrySnapshot = retainEquivalentSnapshot(before.generatedGeometrySnapshot, next.generatedGeometrySnapshot);
      if (projectDataEqual(boxStateFields(next).data, boxStateFields(before).data)) return before;
      return next;
    }, token);
  }
  return { transact, replaceSource,
    beginTBDraft: (prepare: (before: BoxStateSource) => BoxStateSource) => transact('Start TB group', prepare, undefined, 'beginTB'),
    finishTBDraft: (prepare: (before: BoxStateSource) => BoxStateSource) => transact('Finish TB group', prepare, undefined, 'finishTB'),
  };
}
