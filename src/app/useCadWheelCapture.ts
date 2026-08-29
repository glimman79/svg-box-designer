import { useEffect, useRef, type RefObject } from 'react';

export type CadWheelHandler = (event: WheelEvent) => void;

/** Gives a CAD viewport exclusive ownership of wheel input while it is hovered. */
export function useCadWheelCapture<T extends Element>(
  viewportRef: RefObject<T | null>,
  onWheel: CadWheelHandler,
) {
  const handlerRef = useRef(onWheel);
  handlerRef.current = onWheel;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = ((event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      handlerRef.current(event);
    }) as EventListener;

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  });
}
