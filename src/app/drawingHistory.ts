import type { DrawingDocumentV2 } from './drawingTypes';

export const DRAWING_HISTORY_LIMIT = 100;

export type DrawingHistory = Readonly<{
  undo: readonly DrawingDocumentV2[];
  redo: readonly DrawingDocumentV2[];
}>;

export const EMPTY_DRAWING_HISTORY: DrawingHistory = { undo: [], redo: [] };

const appendBounded = (stack: readonly DrawingDocumentV2[], document: DrawingDocumentV2) => (
  [...stack, document].slice(-DRAWING_HISTORY_LIMIT)
);

export const transactDrawingDocument = (
  history: DrawingHistory,
  current: DrawingDocumentV2,
  update: (document: DrawingDocumentV2) => DrawingDocumentV2,
): { document: DrawingDocumentV2; history: DrawingHistory; changed: boolean } => {
  const next = update(current);
  if (next === current) return { document: current, history, changed: false };
  return {
    document: next,
    history: { undo: appendBounded(history.undo, current), redo: [] },
    changed: true,
  };
};

export const undoDrawingDocument = (history: DrawingHistory, current: DrawingDocumentV2) => {
  const previous = history.undo.at(-1);
  if (!previous) return { document: current, history, changed: false };
  return {
    document: previous,
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current] },
    changed: true,
  };
};

export const redoDrawingDocument = (history: DrawingHistory, current: DrawingDocumentV2) => {
  const next = history.redo.at(-1);
  if (!next) return { document: current, history, changed: false };
  return {
    document: next,
    history: { undo: appendBounded(history.undo, current), redo: history.redo.slice(0, -1) },
    changed: true,
  };
};
