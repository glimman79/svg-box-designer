import type { SketchId } from './drawingTypes';
import type { DrawingStateCapture } from './projectState';

/** The opaque ID names exactly one operation lifetime, even if a local Sketch ID is reused. */
export type SketchOperation = Readonly<{
  id: string;
  kind: 'sketch';
  kindVersion: 1;
  module: 'drawing';
  sketchId: SketchId;
  definitionRevision: string;
}>;

/** Construction order. No separate mutable index, parameter values or member copies. */
export type ConstructionOperations = readonly SketchOperation[];

function checkSketchOrder(doc: DrawingStateCapture) {
  if (doc.schemaVersion !== 2 || doc.unit !== 'mm' || !Array.isArray(doc.sketchOrder)) {
    throw new TypeError('Expected an ordered DrawingDocumentV2 in millimetres');
  }
  const ids = new Set(doc.sketchOrder);
  if (ids.size !== doc.sketchOrder.length || ids.size !== Object.keys(doc.sketches).length
    || !ids.has(doc.activeSketchId) || !Array.from(ids).every(id =>
      typeof id === 'string' && id.length > 0 && Object.hasOwn(doc.sketches, id) && doc.sketches[id]?.id === id)) {
    throw new TypeError('Expected a complete, ordered DrawingDocumentV2 Sketch map');
  }
}

// getRandomValues also works when the application is served over local-network HTTP.
function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), word => word.toString(16).padStart(8, '0')).join('');
}

function createSketchOperation(sketchId: SketchId): SketchOperation {
  return { id: newToken(), kind: 'sketch', kindVersion: 1, module: 'drawing',
    sketchId, definitionRevision: newToken() };
}

/** Admit current Drawing data once. Existing operation records must agree with it. */
export function initializeSketchOperations(doc: DrawingStateCapture, existing?: ConstructionOperations): ConstructionOperations {
  checkSketchOrder(doc);
  if (existing === undefined) return doc.sketchOrder.map(createSketchOperation);
  const ids = new Set<string>();
  if (!Array.isArray(existing) || existing.length !== doc.sketchOrder.length) {
    throw new TypeError('Expected one construction operation per Sketch');
  }
  for (const [index, op] of existing.entries()) {
    if (!op || op.kind !== 'sketch' || op.kindVersion !== 1 || op.module !== 'drawing'
      || op.sketchId !== doc.sketchOrder[index] || typeof op.id !== 'string' || !op.id || ids.has(op.id)
      || typeof op.definitionRevision !== 'string' || !op.definitionRevision) {
      throw new TypeError('Unsupported or inconsistent Sketch operation');
    }
    ids.add(op.id);
  }
  return existing;
}

/** Called once on the complete accepted candidate, including grouped member edits. */
export function updateSketchOperations(operations: ConstructionOperations, before: DrawingStateCapture,
  after: DrawingStateCapture): ConstructionOperations {
  if (before.sketches === after.sketches && before.sketchOrder === after.sketchOrder) return operations;
  checkSketchOrder(after);
  const prior = new Map(operations.map(op => [op.sketchId, op]));
  const next = after.sketchOrder.map(id => {
    const op = prior.get(id);
    if (!op) return createSketchOperation(id);
    return before.sketches[id] === after.sketches[id] ? op : { ...op, definitionRevision: newToken() };
  });
  return next.length === operations.length && next.every((op, i) => op === operations[i]) ? operations : next;
}

type SketchDefinition = Readonly<{ operation: SketchOperation; sketch: DrawingStateCapture['sketches'][SketchId] }>;

/** Resolve in construction order against one frame, including its exact solver results. */
export function readSketchDefinitions(project: Readonly<{
  drawingDocument: DrawingStateCapture;
  constructionOperations: ConstructionOperations;
}>): readonly SketchDefinition[] {
  return project.constructionOperations.map(operation => ({
    operation, sketch: project.drawingDocument.sketches[operation.sketchId],
  }));
}
