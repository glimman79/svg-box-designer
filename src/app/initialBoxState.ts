import { createBoxDocumentV1 } from './boxDocument';
import { defaultPanelManagerState } from './panelManagerModel';
import { DEFAULT_PROJECT_SETTINGS } from './projectDefaults';
import { createGeneratedGeometrySnapshot } from './generatedGeometrySnapshot';
import type { BoxStateSource } from './projectState';

export const createInitialBoxState = (): BoxStateSource => ({
  svgModel: createBoxDocumentV1(), edgeAssignments: {}, connections: {},
  panelManager: structuredClone(defaultPanelManagerState),
  projectSettings: { ...DEFAULT_PROJECT_SETTINGS, selectedProfileOffsetIds: [] },
  lastAppliedManufacturingSettings: null,
  generatedGeometrySnapshot: createGeneratedGeometrySnapshot({ generatedGeometry: [] }),
  activeSGroup: null, activeTBGroup: null, completedTBGroups: [],
  activeWallGroup: null, completedWallGroups: [], workflowGroupOrder: {},
  assignmentTargetConnectionId: null, displayConnectionId: null, selectedEdgeId: null,
});
