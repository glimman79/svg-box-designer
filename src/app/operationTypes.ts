import type { EdgeRole, SlotRole } from '../svgUtils';
import type { ConnectionDefinition, EdgeConnectionProperties, SlotConnectionProperties } from './connectionTypes';

export type OperationKind = 'TB' | 'S';

export type OperationValidation = {
  isValid: boolean;
  diagnostics: string[];
};

export type OperationSourceReference = {
  edgeIds: string[];
  panelIds: string[];
  connectionId: string;
};

export type BaseOperation = {
  id: string;
  kind: OperationKind;
  source: OperationSourceReference;
  validation: OperationValidation;
};

export type TBOperation = BaseOperation & {
  kind: 'TB';
  sourceRoles: EdgeRole[];
  resolvedParameters: EdgeConnectionProperties;
  constructionIntent: 'tabbed-panel-boundary';
};

export type SOperation = BaseOperation & {
  kind: 'S';
  sourceRoles: SlotRole[];
  resolvedParameters: SlotConnectionProperties;
  constructionIntent: 'slot-and-panel-boundary';
};

export type GeometryOperation = TBOperation | SOperation;

export const validateOperationSource = (source: OperationSourceReference): OperationValidation => ({
  isValid: source.connectionId.length > 0 && source.edgeIds.length > 0,
  diagnostics: [
    ...(source.connectionId.length > 0 ? [] : ['Operation requires a source connection.']),
    ...(source.edgeIds.length > 0 ? [] : ['Operation requires at least one source edge.']),
  ],
});

export const operationFromConnection = (
  connection: ConnectionDefinition,
  source: OperationSourceReference,
  roles: Array<EdgeRole | SlotRole> = [],
): GeometryOperation | null => {
  if (connection.prefix === 'E') {
    return {
      id: `operation:TB:${connection.id}`,
      kind: 'TB',
      source,
      sourceRoles: roles as EdgeRole[],
      resolvedParameters: { ...connection.properties },
      validation: validateOperationSource(source),
      constructionIntent: 'tabbed-panel-boundary',
    };
  }

  if (connection.prefix === 'S') {
    return {
      id: `operation:S:${connection.id}`,
      kind: 'S',
      source,
      sourceRoles: roles as SlotRole[],
      resolvedParameters: { ...connection.properties },
      validation: validateOperationSource(source),
      constructionIntent: 'slot-and-panel-boundary',
    };
  }

  return null;
};
