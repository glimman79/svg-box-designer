export const CAD_TOOL_DIAGNOSTIC_QUERY_PARAM = 'cadToolDiagnostics';

type ActivationMarker = Readonly<{
  tool: string;
  activationMode: 'normal' | 'persistent';
}>;

type DiagnosticWindow = Window & {
  __cadToolEventDiagnostics?: unknown[];
};

const nodeSummary = (node: Node | null) => {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return `#text(${JSON.stringify(node.textContent ?? '')})`;
  if (node instanceof Element) {
    const id = node.id ? `#${node.id}` : '';
    const classes = [...node.classList].map((name) => `.${name}`).join('');
    return `${node.tagName.toLowerCase()}${id}${classes}`;
  }
  return node.nodeName;
};

const selectionSnapshot = () => {
  const selection = document.getSelection();
  return selection ? {
    type: selection.type,
    isCollapsed: selection.isCollapsed,
    rangeCount: selection.rangeCount,
    text: selection.toString(),
    anchorNode: nodeSummary(selection.anchorNode),
    focusNode: nodeSummary(selection.focusNode),
  } : null;
};

const eventSnapshot = (event: Event, phase: 'capture' | 'bubble') => {
  const pointer = event as PointerEvent;
  const mouse = event as MouseEvent;
  return {
    kind: 'event',
    type: event.type,
    phase,
    button: typeof mouse.button === 'number' ? mouse.button : null,
    buttons: typeof mouse.buttons === 'number' ? mouse.buttons : null,
    pointerType: pointer.pointerType || null,
    pointerId: typeof pointer.pointerId === 'number' ? pointer.pointerId : null,
    detail: (event as UIEvent).detail ?? null,
    defaultPrevented: event.defaultPrevented,
    cancelable: event.cancelable,
    target: nodeSummary(event.target as Node | null),
    currentTarget: nodeSummary(event.currentTarget as Node | null),
    composedPath: event.composedPath().map((entry) => entry instanceof Node ? nodeSummary(entry) : String(entry)),
    timestamp: event.timeStamp,
    clientX: typeof mouse.clientX === 'number' ? mouse.clientX : null,
    clientY: typeof mouse.clientY === 'number' ? mouse.clientY : null,
    selection: selectionSnapshot(),
  };
};

/** Installs opt-in, development-only event tracing for manual Edge diagnostics. */
export const installCadToolEventDiagnostics = (rail: HTMLElement) => {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get(CAD_TOOL_DIAGNOSTIC_QUERY_PARAM) !== '1') {
    return { recordActivation: (_marker: ActivationMarker) => undefined, dispose: () => undefined };
  }

  const diagnosticWindow = window as DiagnosticWindow;
  const records: unknown[] = [];
  diagnosticWindow.__cadToolEventDiagnostics = records;
  const record = (value: unknown) => {
    records.push(value);
    console.debug('[cad-tool-event]', value);
  };
  const eventTypes = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'selectstart', 'contextmenu', 'dragstart'] as const;
  const removers: Array<() => void> = [];
  for (const type of eventTypes) {
    for (const capture of [true, false]) {
      const listener = (event: Event) => record(eventSnapshot(event, capture ? 'capture' : 'bubble'));
      rail.addEventListener(type, listener, capture);
      removers.push(() => rail.removeEventListener(type, listener, capture));
    }
  }
  const selectionListener = (event: Event) => record(eventSnapshot(event, 'bubble'));
  document.addEventListener('selectionchange', selectionListener);
  removers.push(() => document.removeEventListener('selectionchange', selectionListener));

  return {
    recordActivation: (marker: ActivationMarker) => {
      record({ kind: 'activation', ...marker, timestamp: performance.now(), selection: selectionSnapshot() });
      if (marker.activationMode === 'persistent') {
        requestAnimationFrame(() => record({ kind: 'post-activation-frame', timestamp: performance.now(), selection: selectionSnapshot() }));
      }
    },
    dispose: () => {
      removers.forEach((remove) => remove());
      delete diagnosticWindow.__cadToolEventDiagnostics;
    },
  };
};
