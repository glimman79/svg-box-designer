import { useLayoutEffect, useRef } from 'react';
import { captureModalInput } from './modalInput';

export function ClearProjectDialog({ onCancel, onConfirm }: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const releaseInput = captureModalInput(event => {
      if (!dialog.open || (event.target instanceof Node && dialog.contains(event.target))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    dialog.showModal();
    cancelRef.current?.focus();
    return releaseInput;
  }, []);

  return <dialog ref={dialogRef} className="clear-dialog project-clear-dialog" aria-modal="true"
    aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-description clear-save-explanation"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.target === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }}
    onKeyUp={event => event.stopPropagation()}
    onClose={onCancel}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }}>
    <h2 id="clear-dialog-title">Clear entire project?</h2>
    <p id="clear-dialog-description">This will remove all Drawing sketches, BOX constructions, imported SVG data,
      manufacturing results, and Undo/Redo history. This action cannot be undone.</p>
    <p id="clear-save-explanation">Saving an editable project is not available yet. Save and Clear will become
      available when native project saving is implemented.</p>
    <div className="clear-dialog-actions">
      <button className="toolbar-button" type="button" disabled aria-describedby="clear-save-explanation">Save and Clear</button>
      <button className="toolbar-button destructive" type="button" onClick={() => {
        if (!dialogRef.current?.open) return;
        dialogRef.current.close();
        onConfirm();
      }}>Clear Without Saving</button>
      <button ref={cancelRef} className="toolbar-button" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
    </div>
  </dialog>;
}
