import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export const CAD_PRIMARY_BUTTON = 0;
export const CAD_PAN_BUTTON = 2;

export type CadPanDelta = Readonly<{ dx: number; dy: number }>;

/** Workspace-neutral browser mechanics for the product-wide right-drag pan gesture. */
export function useCadPanGesture<T extends Element>({
  viewportRef,
  onPan,
  onPanStart,
  onPanEnd,
}: {
  viewportRef: RefObject<T | null>;
  onPan: (delta: CadPanDelta) => void;
  onPanStart?: () => void;
  onPanEnd?: () => void;
}) {
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const callbacksRef = useRef({ onPan, onPanStart, onPanEnd });
  callbacksRef.current = { onPan, onPanStart, onPanEnd };
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => () => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (pan && viewport?.hasPointerCapture(pan.pointerId)) viewport.releasePointerCapture(pan.pointerId);
    panRef.current = null;
  }, [viewportRef]);

  const end = (event: ReactPointerEvent<T>) => {
    if (panRef.current?.pointerId !== event.pointerId) return false;
    panRef.current = null;
    setIsPanning(false);
    callbacksRef.current.onPanEnd?.();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };

  return {
    isPanning,
    isCadPanning: (pointerId?: number) => panRef.current !== null && (pointerId === undefined || panRef.current.pointerId === pointerId),
    panHandlers: {
      onPointerDown: (event: ReactPointerEvent<T>) => {
        if (event.button !== CAD_PAN_BUTTON) return false;
        event.preventDefault();
        panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        setIsPanning(true);
        callbacksRef.current.onPanStart?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        return true;
      },
      onPointerMove: (event: ReactPointerEvent<T>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return false;
        const delta = { dx: event.clientX - pan.x, dy: event.clientY - pan.y };
        pan.x = event.clientX;
        pan.y = event.clientY;
        callbacksRef.current.onPan(delta);
        return true;
      },
      onPointerUp: end,
      onPointerCancel: end,
      onContextMenu: (event: React.MouseEvent<T>) => event.preventDefault(),
    },
  };
}

/** Physical Ctrl state shared by CAD workspaces; snap engines choose how to consume it. */
export function useCadCtrlSnapOverride(onChange?: (held: boolean) => void) {
  const [ctrlSnapOverride, setCtrlSnapOverride] = useState(false);
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  useEffect(() => {
    const update = (held: boolean) => {
      setCtrlSnapOverride(held);
      callbackRef.current?.(held);
    };
    const down = (event: KeyboardEvent) => { if (event.key === 'Control') update(true); };
    const up = (event: KeyboardEvent) => { if (event.key === 'Control') update(false); };
    const blur = () => update(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  return ctrlSnapOverride;
}

/** One Escape invokes workspace-owned tool cleanup and exit. */
export function useCadEscapeToolExit(onExit: () => void) {
  const callbackRef = useRef(onExit);
  callbackRef.current = onExit;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') callbackRef.current(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
