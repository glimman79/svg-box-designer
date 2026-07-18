import type { AppliedEPanelPath, AppliedSGeometry, AppliedSPanelPath, AppliedSSlotPath } from './connectionTypes';
import type { ManufacturingMetadata } from './manufacturingMetadata';
import type { GeometryOperation } from './operationTypes';

export const generatedGeometrySnapshotVersion = '2.0-foundation';

export type GeneratedGeometryKind = 'PANEL_PATH' | 'SLOT_PATH';

export type GeneratedGeometrySource = {
  operationId: string | null;
  connectionId: string | null;
  edgeIds: string[];
  panelIds: string[];
};

export type GeneratedGeometryItem = {
  id: string;
  kind: GeneratedGeometryKind;
  pathD: string;
  source: GeneratedGeometrySource;
  manufacturing?: ManufacturingMetadata;
  assemblyBehaviour: 'panel-boundary' | 'slot-cutout';
  legacy: AppliedEPanelPath | AppliedSPanelPath | AppliedSSlotPath;
};

export type GeneratedGeometrySnapshotMetadata = {
  snapshotId: string;
  revision: number;
  generatorVersion: string;
  createdTimestamp: string;
  importedGeometryRevision: number;
  assignmentRevision: number;
  operationRevision: number;
};

export type GeneratedGeometrySnapshot = {
  metadata: GeneratedGeometrySnapshotMetadata;
  operations: ReadonlyArray<GeometryOperation>;
  generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
  compatibility: {
    appliedEPanelPaths: AppliedEPanelPath[];
    appliedSGeometry: AppliedSGeometry[];
  };
};

const clone = <T>(value: T): T => structuredClone(value);

export const createGeneratedGeometrySnapshot = ({
  appliedEPanelPaths,
  appliedSGeometry,
  operations = [],
  revision = 1,
  importedGeometryRevision = 1,
  assignmentRevision = 1,
  operationRevision = 1,
}: {
  appliedEPanelPaths: AppliedEPanelPath[];
  appliedSGeometry: AppliedSGeometry[];
  operations?: GeometryOperation[];
  revision?: number;
  importedGeometryRevision?: number;
  assignmentRevision?: number;
  operationRevision?: number;
}): GeneratedGeometrySnapshot => {
  const operationByConnectionId = new Map(operations.map((operation) => [operation.source.connectionId, operation]));
  const findOperationForEdges = (edgeIds: string[]) => operations.find((operation) => edgeIds.some((edgeId) => operation.source.edgeIds.includes(edgeId)));
  const tbItems = appliedEPanelPaths.map((path): GeneratedGeometryItem => {
    const operation = findOperationForEdges(path.edgeIds);

    return ({
    id: `generated:panel:${path.panelId}`,
    kind: 'PANEL_PATH',
    pathD: path.pathD,
    source: { operationId: operation?.id ?? null, connectionId: operation?.source.connectionId ?? null, edgeIds: [...path.edgeIds], panelIds: [path.panelId] },
    manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
    assemblyBehaviour: 'panel-boundary',
    legacy: clone(path),
  });
  });
  const sItems = appliedSGeometry.flatMap((geometry) => {
    const operation = operationByConnectionId.get(geometry.connectionId);
    return [
      ...geometry.panelPaths.map((path): GeneratedGeometryItem => ({
        id: `generated:s-panel:${geometry.connectionId}:${path.panelId}`,
        kind: 'PANEL_PATH',
        pathD: path.pathD,
        source: { operationId: operation?.id ?? null, connectionId: geometry.connectionId, edgeIds: [...path.edgeIds], panelIds: [path.panelId] },
        manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
        assemblyBehaviour: 'panel-boundary',
        legacy: clone(path),
      })),
      ...geometry.slotPaths.map((path, index): GeneratedGeometryItem => ({
        id: `generated:s-slot:${geometry.connectionId}:${index}`,
        kind: 'SLOT_PATH',
        pathD: path.pathD,
        source: { operationId: operation?.id ?? null, connectionId: geometry.connectionId, edgeIds: [path.sourceAEdgeId, path.sourceBEdgeId], panelIds: [] },
        manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
        assemblyBehaviour: 'slot-cutout',
        legacy: clone(path),
      })),
    ];
  });

  return Object.freeze({
    metadata: Object.freeze({ snapshotId: `generated-geometry:${revision}:${importedGeometryRevision}:${assignmentRevision}:${operationRevision}`, revision, generatorVersion: generatedGeometrySnapshotVersion, createdTimestamp: new Date().toISOString(), importedGeometryRevision, assignmentRevision, operationRevision }),
    operations: Object.freeze(clone(operations)),
    generatedGeometry: Object.freeze([...tbItems, ...sItems]),
    compatibility: Object.freeze({ appliedEPanelPaths: clone(appliedEPanelPaths), appliedSGeometry: clone(appliedSGeometry) }),
  });
};

export const getAppliedEPanelPathsFromSnapshot = (snapshot: GeneratedGeometrySnapshot): AppliedEPanelPath[] => clone(snapshot.compatibility.appliedEPanelPaths);
export const getAppliedSGeometryFromSnapshot = (snapshot: GeneratedGeometrySnapshot): AppliedSGeometry[] => clone(snapshot.compatibility.appliedSGeometry);
