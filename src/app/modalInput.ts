const workspaceEvents = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove',
  'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel',
  'touchstart', 'touchmove', 'touchend', 'beforeinput', 'input', 'change', 'submit',
  'dragstart', 'dragover', 'drop', 'focusin', 'focusout', 'drawing:activate-dimension'];

// Pointer capture and window shortcuts can bypass a native dialog's implicit inertness.
export function captureModalInput(listener: (event: Event) => void) {
  workspaceEvents.forEach(type => window.addEventListener(type, listener, { capture: true, passive: false }));
  return () => workspaceEvents.forEach(type => window.removeEventListener(type, listener, true));
}
