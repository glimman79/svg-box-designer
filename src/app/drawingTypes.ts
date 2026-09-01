export type WorkspaceId = 'drawing' | 'puzzle' | 'construction';

export const DEFAULT_WORKSPACE: WorkspaceId = 'construction';

export const selectWorkspace = (current: WorkspaceId, requested: WorkspaceId): WorkspaceId => (
  requested === 'puzzle' ? current : requested
);

export type SketchId = string;

/** A reusable point in Drawing model space, measured in the document unit. */
export type DrawingPoint = Readonly<{ x: number; y: number }>;

export type DrawingLineEntity = Readonly<{
  id: string;
  type: 'line';
  start: DrawingPoint;
  end: DrawingPoint;
}>;

export type DrawingEntity = DrawingLineEntity;

export type DrawingGeometryReference =
  | Readonly<{ kind: 'entity'; entityId: string }>
  | Readonly<{ kind: 'point'; entityId: string; point: 'start' | 'end' }>;
export type DrawingDimensionKind = 'ALIGNED_DISTANCE' | 'HORIZONTAL_DISTANCE' | 'VERTICAL_DISTANCE';
export type DrawingDimension = Readonly<{
  id: string;
  kind: DrawingDimensionKind;
  references: readonly [Extract<DrawingGeometryReference, { kind: 'point' }>, Extract<DrawingGeometryReference, { kind: 'point' }>];
  /** Future driving value in mm; D2.5a keeps it equal to measured geometry. */
  value: number;
  placement: Readonly<{ kind: 'linear'; offset: number }>;
}>;

export type DrawingSketchV1 = {
  id: SketchId;
  name: string;
  entities: Record<string, DrawingEntity>;
  entityOrder: string[];
};

export type DrawingDocumentV1 = {
  schemaVersion: 1;
  unit: 'mm';
  sketches: Record<SketchId, DrawingSketchV1>;
  sketchOrder: SketchId[];
  activeSketchId: SketchId;
};

export type DrawingSketchV2 = DrawingSketchV1 & { dimensions: Record<string, DrawingDimension>; dimensionOrder: string[] };
export type DrawingDocumentV2 = Omit<DrawingDocumentV1, 'schemaVersion' | 'sketches'> & {
  schemaVersion: 2;
  sketches: Record<SketchId, DrawingSketchV2>;
};
export type DrawingDocument = DrawingDocumentV1 | DrawingDocumentV2;

export const DEFAULT_SKETCH_ID: SketchId = 'sketch-1';

export const createDrawingDocumentV1 = (): DrawingDocumentV1 => ({
  schemaVersion: 1,
  unit: 'mm',
  sketches: {
    [DEFAULT_SKETCH_ID]: {
      id: DEFAULT_SKETCH_ID,
      name: 'Sketch 1',
      entities: {},
      entityOrder: [],
    },
  },
  sketchOrder: [DEFAULT_SKETCH_ID],
  activeSketchId: DEFAULT_SKETCH_ID,
});

/** Explicit V1 migration. Restored dimensions with missing entities fail closed. */
export const migrateDrawingDocument = (document: DrawingDocument): DrawingDocumentV2 => {
  if (document.schemaVersion === 2) return {
    ...document,
    sketches: Object.fromEntries(Object.entries(document.sketches).map(([id, sketch]) => {
      const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, dimension]) =>
        dimension.references.every((reference) => Boolean(sketch.entities[reference.entityId]))));
      return [id, { ...sketch, dimensions, dimensionOrder: sketch.dimensionOrder.filter((dimensionId) => Boolean(dimensions[dimensionId])) }];
    })),
  };
  return { ...document, schemaVersion: 2, sketches: Object.fromEntries(Object.entries(document.sketches).map(([id, sketch]) => [id, { ...sketch, dimensions: {}, dimensionOrder: [] }])) };
};

export const createDrawingDocumentV2 = (): DrawingDocumentV2 => migrateDrawingDocument(createDrawingDocumentV1());
