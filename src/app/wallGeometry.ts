import type { ConnectionMap } from './connectionTypes';
import type { GeneratedGeometryItem } from './generatedGeometryTypes';
import type { PanelThicknessState } from './panelThickness';
import type { EdgeAssignmentRecord, SvgDocumentModel } from '../svgUtils';
import { buildGeneratedFingerJointGeometryItems } from './tbGeometry';

/** Native Wall adapter over the proven, tool-neutral TB finger-joint production path. */
export const buildGeneratedWGeometryItems = (
  svgModel: SvgDocumentModel,
  assignments: EdgeAssignmentRecord,
  connectionMap: ConnectionMap,
  panelThicknessState: PanelThicknessState,
): GeneratedGeometryItem[] => buildGeneratedFingerJointGeometryItems(
  svgModel, assignments, connectionMap, panelThicknessState, 'W',
);
