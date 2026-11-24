import type { DrawingSketchV2, ProjectDrawingDocument, SketchId } from './drawingTypes';

type OrderedSketches = Pick<ProjectDrawingDocument, 'schemaVersion' | 'unit' | 'activeSketchId'> & {
  sketchOrder: readonly SketchId[];
  sketches: Readonly<Record<SketchId, { readonly id: SketchId }>>;
};

/** The opaque ID names exactly one operation lifetime, even if a local Sketch ID is reused. */
export type SketchOperation = Readonly<{
  id: string;
  kind: 'sketch';
  kindVersion: 1;
  module: 'drawing';
  sketchId: SketchId;
  definitionRevision: string;
  /** Allocated once per lifetime. Older in-memory records acquire this on admission. */
  presentationIndex?: number;
}>;

/** Construction order. No separate mutable index, parameter values or member copies. */
export type ConstructionOperations = readonly SketchOperation[];

function checkSketchOrder(doc: OrderedSketches) {
  if (doc.schemaVersion !== 2 || doc.unit !== 'mm' || !Array.isArray(doc.sketchOrder)) {
    throw new TypeError('Expected an ordered DrawingDocumentV2 in millimetres');
  }
  const ids = new Set(doc.sketchOrder);
  if (ids.size !== doc.sketchOrder.length || ids.size !== Object.keys(doc.sketches).length
    || (ids.size === 0 ? doc.activeSketchId !== null : doc.activeSketchId === null || !ids.has(doc.activeSketchId)) || !Array.from(ids).every(id =>
      typeof id === 'string' && id.length > 0 && Object.hasOwn(doc.sketches, id) && doc.sketches[id]?.id === id)) {
    throw new TypeError('Expected a complete, ordered DrawingDocumentV2 Sketch map');
  }
}

// getRandomValues also works when the application is served over local-network HTTP.
export function newIdentityToken(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), word => word.toString(16).padStart(8, '0')).join('');
}

function nextPresentationIndex(operations: ConstructionOperations) {
  const used = new Set(operations.map(op => op.presentationIndex));
  let next = 0;
  return () => {
    while (used.has(next)) next++;
    return next++;
  };
}

function createSketchOperation(sketchId: SketchId, presentationIndex: number): SketchOperation {
  return { id: newIdentityToken(), kind: 'sketch', kindVersion: 1, module: 'drawing',
    sketchId, presentationIndex, definitionRevision: newIdentityToken() };
}

/** Admit current Drawing data once. Existing operation records must agree with it. */
export function initializeSketchOperations(doc: OrderedSketches, existing?: ConstructionOperations): ConstructionOperations {
  checkSketchOrder(doc);
  if (existing === undefined) return doc.sketchOrder.map(createSketchOperation);
  const ids = new Set<string>();
  if (!Array.isArray(existing) || existing.length !== doc.sketchOrder.length) {
    throw new TypeError('Expected one construction operation per Sketch');
  }
  for (const [index, op] of existing.entries()) {
    if (!op || op.kind !== 'sketch' || op.kindVersion !== 1 || op.module !== 'drawing'
      || op.sketchId !== doc.sketchOrder[index] || typeof op.id !== 'string' || !op.id || ids.has(op.id)
      || (op.presentationIndex !== undefined && (!Number.isSafeInteger(op.presentationIndex) || op.presentationIndex < 0))
      || typeof op.definitionRevision !== 'string' || !op.definitionRevision) {
      throw new TypeError('Unsupported or inconsistent Sketch operation');
    }
    ids.add(op.id);
  }
  if (existing.every(op => op.presentationIndex !== undefined)) return existing;
  const allocate = nextPresentationIndex(existing);
  return existing.map(op => op.presentationIndex === undefined ? { ...op, presentationIndex: allocate() } : op);
}

/** Called once on the complete accepted candidate, including grouped member edits. */
export function updateSketchOperations(operations: ConstructionOperations, before: OrderedSketches,
  after: OrderedSketches): ConstructionOperations {
  if (before.sketches === after.sketches && before.sketchOrder === after.sketchOrder) return operations;
  checkSketchOrder(after);
  const prior = new Map(operations.map(op => [op.sketchId, op]));
  let allocate: (() => number) | undefined;
  const next = after.sketchOrder.map(id => {
    const op = prior.get(id);
    if (!op) {
      allocate ??= nextPresentationIndex(operations);
      return createSketchOperation(id, allocate());
    }
    return before.sketches[id] === after.sketches[id] ? op : { ...op, definitionRevision: newIdentityToken() };
  });
  return next.length === operations.length && next.every((op, i) => op === operations[i]) ? operations : next;
}

export type SketchDefinition<Sketch = DrawingSketchV2> = Readonly<{ operation: SketchOperation; sketch: Sketch }>;

/** Resolve in construction order against one frame, including its exact solver results. */
export function readSketchDefinitions<Sketch>(project: Readonly<{
  drawingDocument: { sketches: Readonly<Record<SketchId, Sketch>> };
  constructionOperations: ConstructionOperations;
}>): readonly SketchDefinition<Sketch>[] {
  return project.constructionOperations.map(operation => ({
    operation, sketch: project.drawingDocument.sketches[operation.sketchId],
  }));
}
