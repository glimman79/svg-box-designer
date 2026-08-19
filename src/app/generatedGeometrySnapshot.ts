import type { GeometryOperation } from './operationTypes';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { PanelCompositionModel } from './generatedGeometryAuthority';

export type { GeneratedGeometryItem, GeneratedGeometryKind, GeneratedGeometrySource } from './generatedGeometryTypes';

export const generatedGeometrySnapshotVersion = '2.1-native-generated-geometry';

export type GeneratedGeometrySnapshotMetadata = {
  snapshotId: string;
  revision: number;
  generatorVersion: string;
  createdTimestamp: string;
  importedGeometryRevision: number;
  assignmentRevision: number;
  operationRevision: number;
  /** Absent on pre-Phase-4 snapshots, which means legacy authority semantics. */
  panelCompositionModel?: PanelCompositionModel;
};

export type GeneratedGeometrySnapshot = {
  metadata: GeneratedGeometrySnapshotMetadata;
  operations: ReadonlyArray<GeometryOperation>;
  generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
};

const clone = <T>(value: T): T => structuredClone(value);

export const createGeneratedGeometrySnapshot = ({
  generatedGeometry,
  operations = [],
  revision = 1,
  importedGeometryRevision = 1,
  assignmentRevision = 1,
  operationRevision = 1,
  panelCompositionModel = 'legacy',
}: {
  generatedGeometry: GeneratedGeometryItem[];
  operations?: GeometryOperation[];
  revision?: number;
  importedGeometryRevision?: number;
  assignmentRevision?: number;
  operationRevision?: number;
  panelCompositionModel?: PanelCompositionModel;
}): GeneratedGeometrySnapshot => {
  return Object.freeze({
    metadata: Object.freeze({ snapshotId: `generated-geometry:${revision}:${importedGeometryRevision}:${assignmentRevision}:${operationRevision}`, revision, generatorVersion: generatedGeometrySnapshotVersion, createdTimestamp: new Date().toISOString(), importedGeometryRevision, assignmentRevision, operationRevision, panelCompositionModel }),
    operations: Object.freeze(clone(operations)),
    generatedGeometry: Object.freeze(clone(generatedGeometry)),
  });
};
