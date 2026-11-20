import { useLayoutEffect, useRef, useState } from 'react';
import type { ProjectOwner } from './projectOwner';

type ImportToken = ReturnType<ProjectOwner['beginBoxImport']>;

/** Transient SVG-import UI ownership; project publication still belongs to the owner. */
export function useSvgImportLock(projectOwner: Pick<ProjectOwner, 'beginBoxImport' | 'isCurrentBoxImport' | 'invalidateBoxImports'>) {
  const [isImporting, setIsImporting] = useState(false);
  const activeImportRef = useRef<ImportToken | null>(null);
  const mountedRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    mountedRef.current = true;
    // Capture at window before React handlers and the Drawing window shortcuts.
    // The ref takes effect in the selecting event, before React commits the modal.
    const blockInteraction = (event: Event) => {
      if (!activeImportRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'focusin' && event.target !== dialogRef.current) dialogRef.current?.focus();
    };
    const events = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove',
      'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel',
      'touchstart', 'touchmove', 'touchend', 'beforeinput', 'input', 'change', 'submit',
      'dragstart', 'dragover', 'drop', 'focusin', 'focusout', 'drawing:activate-dimension'];
    events.forEach((type) => window.addEventListener(type, blockInteraction, { capture: true, passive: false }));
    return () => {
      mountedRef.current = false;
      activeImportRef.current = null;
      projectOwner.invalidateBoxImports();
      events.forEach((type) => window.removeEventListener(type, blockInteraction, true));
    };
  }, [projectOwner]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (isImporting) dialog?.showModal();
    else if (dialog?.open) dialog.close();
  }, [isImporting]);

  const acquire = () => {
    if (!mountedRef.current || activeImportRef.current) return null;
    const token = projectOwner.beginBoxImport();
    activeImportRef.current = token;
    setIsImporting(true);
    return token;
  };
  const isCurrent = (token: ImportToken) => mountedRef.current
    && activeImportRef.current === token && projectOwner.isCurrentBoxImport(token);
  const release = (token: ImportToken) => {
    // An old callback must never unlock a later import or update an unmounted App.
    if (activeImportRef.current !== token) return;
    activeImportRef.current = null;
    if (mountedRef.current) setIsImporting(false);
  };

  return { isImporting, dialogRef, acquire, isCurrent, release };
}
