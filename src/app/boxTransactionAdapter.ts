import type { GlobalEditResult, GlobalProjectHistory } from './globalProjectHistory';
import { projectDataEqual } from './projectDataEqual';
import { retainEquivalentSnapshot } from './generatedGeometrySnapshot';
import { createInitialBoxState } from './projectOwner';
import { boxStateFields, type BoxStateSource } from './projectState';

export type BoxTransactionResult = GlobalEditResult;

export function createBoxTransactionAdapter(owner: GlobalProjectHistory, renderEpoch?: number) {
  type ImportToken = ReturnType<typeof owner.beginBoxImport>;
  function transact(label: string, prepare: (before: BoxStateSource) => BoxStateSource, token?: ImportToken) {
    const current = () => (renderEpoch === undefined || renderEpoch === owner.getEpoch())
      && (!token || owner.isCurrentBoxImport(token));
    if (!current()) return { outcome: 'rejected' as const };
    return owner.transact('box', label, tx => {
      const before = owner.getSnapshot().box;
      const next = prepare(before);
      if (next === before) return 'noop';
      if (!next || Object.keys(before).some(key => !Object.hasOwn(next, key))) throw new TypeError('Incomplete BOX candidate');
      tx.update(frame => ({ drawingDocument: frame.drawingDocument, box: boxStateFields(next) }));
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
