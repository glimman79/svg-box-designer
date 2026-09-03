export type WorkspaceId = 'drawing' | 'puzzle' | 'construction';

export const DEFAULT_WORKSPACE: WorkspaceId = 'construction';

export const selectWorkspace = (current: WorkspaceId, requested: WorkspaceId): WorkspaceId => (
  requested === 'puzzle' ? current : requested
);

export type SketchId = string;

/** A reusable point in Drawing model space, measured in the document unit. */
export type DrawingPoint = Readonly<{ x: number; y: number }>;

export type DrawingSketchPoint = Readonly<{ id: string; x: number; y: number }>;

export type DrawingLineEntity = Readonly<{
  id: string;
  type: 'line';
  startPointId: string;
  endPointId: string;
}>;
export type DrawingLineEntityV1 = Readonly<{ id: string; type: 'line'; start: DrawingPoint; end: DrawingPoint }>;

/** Non-persistent geometry resolved from a line's point references. */
export type ResolvedDrawingLine = DrawingLineEntity & Readonly<{ start: DrawingPoint; end: DrawingPoint }>;

export type DrawingEntity = DrawingLineEntity;

export type DrawingGeometryReference =
  | Readonly<{ kind: 'entity'; entityId: string }>
  | Readonly<{ kind: 'point'; entityId: string; point: 'start' | 'end' }>
  | Readonly<{ kind: 'sketchPoint'; pointId: string }>
  | Readonly<{ kind: 'datum'; datum: 'ORIGIN' | 'X_AXIS' | 'Y_AXIS' }>;
export type DrawingPointReference = Exclude<DrawingGeometryReference, { kind: 'entity' }>;
export type DrawingEntityReference = Extract<DrawingGeometryReference, { kind: 'entity' }>;
export type DrawingDimensionKind = 'ALIGNED_DISTANCE' | 'HORIZONTAL_DISTANCE' | 'VERTICAL_DISTANCE' | 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE';
export type DrawingAngleSector = Readonly<{ sideA: -1 | 1; sideB: -1 | 1 }>;
export type DrawingDimensionRole = 'driving' | 'reference';
type DrawingDimensionBase = Readonly<{
  id: string;
  /** Persistent solver semantics. Reference dimensions contribute no constraint equation. */
  role: DrawingDimensionRole;
  /** Authoritative future target for driving dimensions; ignored for reference display. */
  value: number;
  placement: Readonly<{ kind: 'linear'; offset: number } | { kind: 'angular'; anchor: DrawingPoint; radius: number; offset: number }>;
}>;
export type DrawingDimension =
  | (DrawingDimensionBase & Readonly<{
    kind: Exclude<DrawingDimensionKind, 'POINT_TO_LINE_DISTANCE' | 'LINE_TO_LINE_DISTANCE' | 'LINE_TO_LINE_ANGLE'>;
    references: readonly [DrawingPointReference, DrawingPointReference];
  }>)
  | (DrawingDimensionBase & Readonly<{
    kind: 'POINT_TO_LINE_DISTANCE';
    /**
     * Retained for schema compatibility with existing documents. Point-to-Line
     * movement ownership is derived from topology and is not controlled by this
     * historical record of selection order.
     */
    references: readonly [DrawingPointReference, DrawingEntityReference];
    movementPreference: 'point' | 'line';
  }>)
  | (DrawingDimensionBase & Readonly<{
    kind: 'LINE_TO_LINE_DISTANCE';
    /** Canonical unordered pair: references[0].entityId is lexically first. */
    references: readonly [DrawingEntityReference, DrawingEntityReference];
    /** Side of canonical Line B relative to canonical Line A's stable normal. */
    signedSide: -1 | 1;
  }>)
  | (DrawingDimensionBase & Readonly<{
    kind: 'LINE_TO_LINE_ANGLE';
    /** Canonical unordered pair: references[0].entityId is lexically first. */
    references: readonly [DrawingEntityReference, DrawingEntityReference];
    /** Signed half-plane membership relative to the canonical directed supports. */
    angleSector: DrawingAngleSector;
  }>);

export type DrawingSketchV1 = {
  id: SketchId;
  name: string;
  entities: Record<string, DrawingLineEntityV1>;
  entityOrder: string[];
};

export type DrawingDocumentV1 = {
  schemaVersion: 1;
  unit: 'mm';
  sketches: Record<SketchId, DrawingSketchV1>;
  sketchOrder: SketchId[];
  activeSketchId: SketchId;
};

export type DrawingSketchV2 = Omit<DrawingSketchV1, 'entities'> & {
  points: Record<string, DrawingSketchPoint>;
  entities: Record<string, DrawingEntity>;
  dimensions: Record<string, DrawingDimension>;
  dimensionOrder: string[];
};
export type DrawingDocumentV2 = Omit<DrawingDocumentV1, 'schemaVersion' | 'sketches'> & {
  schemaVersion: 2;
  sketches: Record<SketchId, DrawingSketchV2>;
};
/** Runtime input also accepts historical schema-v2 coordinate-embedded lines. */
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
    sketches: Object.fromEntries(Object.entries(document.sketches).map(([id, sourceSketch]) => {
      const legacySketch = sourceSketch as unknown as Omit<DrawingSketchV2, 'entities' | 'points'> & { points?: Record<string, DrawingSketchPoint>; entities: Record<string, DrawingEntity | DrawingLineEntityV1> };
      const points: Record<string, DrawingSketchPoint> = { ...(legacySketch.points ?? {}) };
      const entities = Object.fromEntries(Object.entries(legacySketch.entities).map(([entityId, entity]) => {
        if ('startPointId' in entity) return [entityId, entity];
        // Legacy documents contain no authoritative connectivity metadata. Each endpoint
        // therefore receives a deterministic, independent identity; equal coordinates are not merged.
        const startPointId = `legacy:${entity.id}:start`, endPointId = `legacy:${entity.id}:end`;
        points[startPointId] = { id: startPointId, ...entity.start };
        points[endPointId] = { id: endPointId, ...entity.end };
        return [entityId, { id: entity.id, type: 'line', startPointId, endPointId } satisfies DrawingLineEntity];
      })) as Record<string, DrawingEntity>;
      const sketch = { ...legacySketch, points, entities } as DrawingSketchV2;
      // D2.5a3 migration: legacy schema-v2 dimensions without a role become driving.
      // An explicitly persisted reference role is retained and is never reclassified here.
      const dimensions = Object.fromEntries(Object.entries(sketch.dimensions).filter(([, dimension]) =>
        dimension.references.every((reference) => reference.kind === 'datum' ? reference.datum === 'ORIGIN' : reference.kind === 'sketchPoint' ? Boolean(sketch.points[reference.pointId]) : Boolean(sketch.entities[reference.entityId]))).map(([dimensionId, dimension]) => [
          dimensionId,
          { ...dimension, role: (dimension.role === 'reference' ? 'reference' : 'driving') as DrawingDimensionRole },
        ]));
      return [id, { ...sketch, dimensions, dimensionOrder: sketch.dimensionOrder.filter((dimensionId) => Boolean(dimensions[dimensionId])) }];
    })),
  };
  return { ...document, schemaVersion: 2, sketches: Object.fromEntries(Object.entries(document.sketches).map(([id, sketch]) => {
    const points: Record<string, DrawingSketchPoint> = {};
    const entities = Object.fromEntries(Object.entries(sketch.entities).map(([entityId, entity]) => {
      const startPointId = `legacy:${entity.id}:start`, endPointId = `legacy:${entity.id}:end`;
      points[startPointId] = { id: startPointId, ...entity.start };
      points[endPointId] = { id: endPointId, ...entity.end };
      return [entityId, { id: entity.id, type: 'line', startPointId, endPointId } satisfies DrawingLineEntity];
    }));
    return [id, { ...sketch, points, entities, dimensions: {}, dimensionOrder: [] }];
  })) };
};

export const createDrawingDocumentV2 = (): DrawingDocumentV2 => migrateDrawingDocument(createDrawingDocumentV1());
