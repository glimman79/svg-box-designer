export const DRAWING_CANVAS_DIAGNOSTIC_EVENTS = [
  'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'selectionstart',
] as const;

export type DrawingCanvasDiagnosticEntry = Readonly<{
  event: string;
  target: string;
  elementFromPoint: string;
  composedPath: string[];
  selection: Readonly<{
    isCollapsed: boolean | null;
    rangeCount: number;
    text: string;
    anchorNode: string;
    focusNode: string;
  }>;
}>;

const describeNode = (node: Node | null): string => {
  if (!node) return 'null';
  if (node.nodeType === Node.TEXT_NODE) return `#text(${JSON.stringify(node.textContent?.trim() ?? '')})`;
  if (!(node instanceof Element)) return node.nodeName;
  const id = node.id ? `#${node.id}` : '';
  const classes = node.classList.length ? `.${Array.from(node.classList).join('.')}` : '';
  return `${node.tagName.toLowerCase()}${id}${classes}`;
};

const readSelection = () => {
  const selection = document.getSelection();
  return {
    isCollapsed: selection?.isCollapsed ?? null,
    rangeCount: selection?.rangeCount ?? 0,
    text: selection?.toString() ?? '',
    anchorNode: describeNode(selection?.anchorNode ?? null),
    focusNode: describeNode(selection?.focusNode ?? null),
  };
};

export const installDrawingCanvasDiagnostics = (
  root: HTMLElement,
  onEntry: (entry: DrawingCanvasDiagnosticEntry) => void,
) => {
  let lastPoint = { x: 0, y: 0 };
  const record = (event: Event) => {
    if (event instanceof MouseEvent) lastPoint = { x: event.clientX, y: event.clientY };
    onEntry({
      event: event.type,
      target: describeNode(event.target as Node | null),
      elementFromPoint: describeNode(document.elementFromPoint(lastPoint.x, lastPoint.y)),
      composedPath: event.composedPath().map((item) => item instanceof Node ? describeNode(item) : String(item)),
      selection: readSelection(),
    });
  };
  const recordSelectionChange = (event: Event) => record(event);
  DRAWING_CANVAS_DIAGNOSTIC_EVENTS.forEach((eventName) => root.addEventListener(eventName, record, true));
  document.addEventListener('selectionchange', recordSelectionChange, true);
  return () => {
    DRAWING_CANVAS_DIAGNOSTIC_EVENTS.forEach((eventName) => root.removeEventListener(eventName, record, true));
    document.removeEventListener('selectionchange', recordSelectionChange, true);
  };
};
