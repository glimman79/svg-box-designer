import type { GlobalEditResult, GlobalProjectHistory } from './globalProjectHistory';
import { projectDataEqual } from './projectDataEqual';
import { retainEquivalentSnapshot } from './generatedGeometrySnapshot';
import { getBoxScope, IMPORTED_SOURCE, sameSketchRequired } from './boxSources';
import { createInitialBoxState } from './projectOwner';
import { boxStateFields, type BoxStateSource } from './projectState';

export type BoxTransactionResult = GlobalEditResult;

export function createBoxTransactionAdapter(owner: GlobalProjectHistory, renderEpoch?: number) {
  type ImportToken = ReturnType<typeof owner.beginBoxImport>;
  function transact(label: string, prepare: (before: BoxStateSource) => BoxStateSource, token?: ImportToken) {
    const current = () => (renderEpoch === undefined || renderEpoch === owner.getEpoch())
      && (renderEpoch === undefined || owner.getPublication().activeWorkspace === 'construction')
      && (!token || owner.isCurrentBoxImport(token));
    if (!current()) return { outcome: 'rejected' as const, error: new Error('Select the current source. ' + sameSketchRequired) };
    return owner.transact('box', label, tx => {
      const project = owner.getSnapshot();
      const scope = getBoxScope(project);
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
      const next = { ...createInitialBoxState(), svgModel, connections: before.connections, panelManager };
      if (svgModel.content !== before.svgModel.content) return next;
      next.generatedGeometrySnapshot = retainEquivalentSnapshot(before.generatedGeometrySnapshot, next.generatedGeometrySnapshot);
      if (projectDataEqual(boxStateFields(next).data, boxStateFields(before).data)) return before;
      return next;
    }, token);
  }
  return { transact, replaceSource };
}
