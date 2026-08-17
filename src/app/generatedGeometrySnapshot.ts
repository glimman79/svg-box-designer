import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import type { GeometryOperation } from './operationTypes';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import { createBoundaryProfileGroup } from './generatedProfiles';

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
  panelCompositionModel?: 'legacy' | 'relationship-composed-single-tool-v1';
};

export type GeneratedGeometrySnapshot = {
  metadata: GeneratedGeometrySnapshotMetadata;
  operations: ReadonlyArray<GeometryOperation>;
  generatedGeometry: ReadonlyArray<GeneratedGeometryItem>;
};

const clone = <T>(value: T): T => structuredClone(value);

export const createGeneratedGeometrySnapshot = ({
  generatedGeometry,
  appliedEPanelPaths,
  appliedSGeometry,
  operations = [],
  revision = 1,
  importedGeometryRevision = 1,
  assignmentRevision = 1,
  operationRevision = 1,
  panelCompositionModel = 'legacy',
}: {
  generatedGeometry?: GeneratedGeometryItem[];
  appliedEPanelPaths?: AppliedEPanelPath[];
  appliedSGeometry?: AppliedSGeometry[];
  operations?: GeometryOperation[];
  revision?: number;
  importedGeometryRevision?: number;
  assignmentRevision?: number;
  operationRevision?: number;
  panelCompositionModel?: 'legacy' | 'relationship-composed-single-tool-v1';
}): GeneratedGeometrySnapshot => {
  appliedEPanelPaths ??= [];
  appliedSGeometry ??= [];
  const operationByConnectionId = new Map(operations.map((operation) => [operation.source.connectionId, operation]));
  const findOperationForEdges = (edgeIds: string[]) => operations.find((operation) => edgeIds.some((edgeId) => operation.source.edgeIds.includes(edgeId)));
  const tbItems = appliedEPanelPaths.map((path): GeneratedGeometryItem => {
    const operation = findOperationForEdges(path.edgeIds);

    return ({
    id: `generated:panel:${path.panelId}`,
    kind: 'PANEL_PATH',
    pathD: path.pathD,
    operationId: operation?.id ?? `operation:TB:legacy:${path.panelId}`,
    toolType: 'TB',
    source: { operationId: operation?.id ?? `operation:TB:legacy:${path.panelId}`, connectionIds: operation ? [operation.source.connectionId] : [], edgeIds: [...path.edgeIds], panelIds: [path.panelId] },
    geometry: { type: 'path', pathD: path.pathD, sourcePathD: path.erasePathD, sourceBounds: clone(path.eraseRect) },
    manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
    behaviour: { assembly: 'panel-boundary', replacesPanelId: path.panelId },
    manufacturingClassification: 'GENERATED_OUTER',
    diagnostics: [],
    profileGroups: path.edgeIds.map((sourceEdgeId) => createBoundaryProfileGroup({ toolType: 'TB', sourceOperationId: operation?.id ?? `operation:TB:legacy:${path.panelId}`, connectionId: operation?.source.connectionId ?? 'legacy', panelId: path.panelId, sourceEdgeId })),
  });
  });
  const sItems = appliedSGeometry.flatMap((geometry) => {
    const operation = operationByConnectionId.get(geometry.connectionId);
    return [
      ...geometry.panelPaths.map((path): GeneratedGeometryItem => ({
        id: `generated:s-panel:${geometry.connectionId}:${path.panelId}`,
        kind: 'PANEL_PATH',
        pathD: path.pathD,
        operationId: operation?.id ?? `operation:S:${geometry.connectionId}`,
        toolType: 'S',
        source: { operationId: operation?.id ?? `operation:S:${geometry.connectionId}`, connectionIds: [geometry.connectionId], edgeIds: [...path.edgeIds], panelIds: [path.panelId] },
        geometry: { type: 'path', pathD: path.pathD, sourcePathD: path.erasePathD, sourceBounds: clone(path.eraseRect), references: { operationEdgeIds: path.sourceEdgeId.split(' '), connectionEdgeIds: [...geometry.edgeIds] } },
        manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
        behaviour: { assembly: 'panel-boundary', replacesPanelId: path.panelId },
        manufacturingClassification: 'GENERATED_OUTER', diagnostics: [],
        profileGroups: path.sourceEdgeId.split(' ').filter(Boolean).map((sourceEdgeId) => createBoundaryProfileGroup({ toolType: 'S', sourceOperationId: operation?.id ?? `operation:S:${geometry.connectionId}`, connectionId: geometry.connectionId, panelId: path.panelId, sourceEdgeId })),
      })),
      ...geometry.slotPaths.map((path, index): GeneratedGeometryItem => ({
        id: `generated:s-slot:${geometry.connectionId}:${index}`,
        kind: 'SLOT_PATH',
        pathD: path.pathD,
        operationId: operation?.id ?? `operation:S:${geometry.connectionId}`,
        toolType: 'S',
        source: { operationId: operation?.id ?? `operation:S:${geometry.connectionId}`, connectionIds: [geometry.connectionId], edgeIds: [path.sourceAEdgeId, path.sourceBEdgeId], panelIds: [] },
        geometry: { type: 'path', pathD: path.pathD, metrics: { startDistance: path.startDistance, endDistance: path.endDistance, widthMm: path.widthMm } },
        manufacturing: path.manufacturing ? clone(path.manufacturing) : undefined,
        behaviour: { assembly: 'slot-cutout', ownerPanelId: path.sourceBEdgeId },
        manufacturingClassification: 'GENERATED_SLOT', diagnostics: [],
      })),
    ];
  });

  return Object.freeze({
    metadata: Object.freeze({ snapshotId: `generated-geometry:${revision}:${importedGeometryRevision}:${assignmentRevision}:${operationRevision}`, revision, generatorVersion: generatedGeometrySnapshotVersion, createdTimestamp: new Date().toISOString(), importedGeometryRevision, assignmentRevision, operationRevision, panelCompositionModel }),
    operations: Object.freeze(clone(operations)),
    generatedGeometry: Object.freeze(clone(generatedGeometry ?? [...tbItems, ...sItems])),
  });
};

export const getAppliedEPanelPathsFromItems = (items: ReadonlyArray<GeneratedGeometryItem>): AppliedEPanelPath[] => items
  .filter((item) => item.toolType === 'TB' && item.kind === 'PANEL_PATH' && !!item.behaviour.replacesPanelId)
  .map((item) => ({ panelId: item.behaviour.replacesPanelId!, eraseRect: clone(item.geometry.sourceBounds!), erasePathD: item.geometry.sourcePathD!, pathD: item.pathD, edgeIds: [...item.source.edgeIds], ...(item.manufacturing ? { manufacturing: clone(item.manufacturing) } : {}) }));

export const getAppliedSGeometryFromItems = (items: ReadonlyArray<GeneratedGeometryItem>): AppliedSGeometry[] => {
  const byConnection = new Map<string, AppliedSGeometry>();
  items.filter((item) => item.toolType === 'S').forEach((item) => {
    const connectionId = item.source.connectionIds[0];
    if (!connectionId) return;
    const value = byConnection.get(connectionId) ?? { connectionId, panelPaths: [], slotPaths: [], edgeIds: [...(item.geometry.references?.connectionEdgeIds ?? item.source.edgeIds)] };
    if (item.kind === 'PANEL_PATH') value.panelPaths.push({ panelId: item.behaviour.replacesPanelId!, sourceEdgeId: item.geometry.references?.operationEdgeIds?.join(' ') ?? item.source.edgeIds.join(' '), eraseRect: clone(item.geometry.sourceBounds!), erasePathD: item.geometry.sourcePathD!, pathD: item.pathD, edgeIds: [...item.source.edgeIds], ...(item.manufacturing ? { manufacturing: clone(item.manufacturing) } : {}) });
    else value.slotPaths.push({ connectionId, sourceAEdgeId: item.source.edgeIds[0], sourceBEdgeId: item.source.edgeIds[1], pathD: item.pathD, startDistance: item.geometry.metrics!.startDistance, endDistance: item.geometry.metrics!.endDistance, widthMm: item.geometry.metrics!.widthMm, ...(item.manufacturing ? { manufacturing: clone(item.manufacturing) } : {}) });
    byConnection.set(connectionId, value);
  });
  return [...byConnection.values()];
};

export const getAppliedEPanelPathsFromSnapshot = (snapshot: GeneratedGeometrySnapshot): AppliedEPanelPath[] => getAppliedEPanelPathsFromItems(snapshot.generatedGeometry);
export const getAppliedSGeometryFromSnapshot = (snapshot: GeneratedGeometrySnapshot): AppliedSGeometry[] => getAppliedSGeometryFromItems(snapshot.generatedGeometry);
