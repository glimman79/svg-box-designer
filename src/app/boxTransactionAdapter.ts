import { createProjectHistory, transactProjectHistory, type ProjectTransaction, type ProjectTransactionResult } from './projectHistory';
import { createInitialBoxState, type ProjectOwner } from './projectOwner';
import { boxStateFields, type BoxStateSource } from './projectState';

type ImportToken = ReturnType<ProjectOwner['beginBoxImport']>;
type PrepareBox = (before: BoxStateSource) => BoxStateSource;
type RecordLocalHistory = (before: BoxStateSource) => void;
export type BoxTransactionResult = ProjectTransactionResult | { outcome: 'rejected'; error?: unknown };

/** Each synchronous action starts from the live owner. Only the caller receives the
 * provisional complete transition. Local execution history stays in App. */
export function createBoxTransactionAdapter(owner: ProjectOwner) {
  let sequence = 0;
  let staging: ProjectTransaction | undefined;
  let publishing = false;

  function transact(label: string, prepare: PrepareBox, recordLocal?: RecordLocalHistory, token?: ImportToken): BoxTransactionResult {
    if (staging) {
      staging.nest(() => 'reject');
      return { outcome: 'rejected' };
    }
    if (publishing || (token && !owner.isCurrentBoxImport(token))) return { outcome: 'rejected' };

    const before = owner.getSnapshot();
    const history = createProjectHistory({ drawingDocument: before.drawingDocument, box: boxStateFields(before.box) });
    const result = transactProjectHistory(history, { module: 'box', id: String(++sequence), label }, transaction => {
      staging = transaction;
      try {
        const next = prepare(before.box);
        if (next === before.box) return 'noop';
        if (!next || Object.keys(before.box).some(key => !Object.hasOwn(next, key))) {
          throw new TypeError('BOX preparation must synchronously return a complete BOX candidate.');
        }
        transaction.update(frame => ({ drawingDocument: frame.drawingDocument, box: boxStateFields(next) }));
        return 'accept';
      } finally {
        staging = undefined;
      }
    });
    if (result.outcome !== 'accepted') return result;

    // The core detached any mutable candidate fields. The owner consumes the
    // very same immutable domain records that a future frame restore would see.
    const next = { ...result.frame.box.data, ...result.frame.box.context } as BoxStateSource;
    publishing = true;
    try {
      let accepted = false;
      owner.batchIfCurrent(before, () => {
        if (token) {
          if (!owner.publishBoxImport(token, next)) return;
        } else {
          owner.update(current => ({ ...current, box: next }));
        }
        recordLocal?.(before.box);
        accepted = true;
      });
      return accepted ? result : { outcome: 'rejected' };
    } finally {
      publishing = false;
    }
  }

  function replaceSource(token: ImportToken, svgModel: BoxStateSource['svgModel'], panelManager: BoxStateSource['panelManager'],
    resetLocal: RecordLocalHistory) {
    return transact('Import SVG source', before => ({
      ...createInitialBoxState(), svgModel, connections: before.connections, panelManager,
    }), resetLocal, token);
  }

  return { transact, replaceSource };
}
