export * from './project-state';
export * from '../../src/app/projectOwner';
export * from '../../src/app/boxTransactionAdapter';
export * from '../../src/app/drawingDocumentMutation';
export * from '../../src/app/drawingHistory';
export * from '../../src/app/drawingTransactionAdapter';
export * from '../../src/app/panelManagerModel';
export * from '../../src/app/projectSettings';
export * from '../../src/app/projectDefaults';
export * from '../../src/app/generatedGeometrySnapshot';
export * from '../../src/app/generatedGeometryAuthority';
export * from '../../src/app/assignmentBuckets';
export * from '../../src/app/sGeometry';
export * from '../../src/app/tbGeometry';
export * from '../../src/app/wallGeometry';
export * from '../../src/app/wallAuthoring';
export * from '../../src/app/tbWorkflow';
export * from '../../src/app/sWorkflow';
export * from '../../src/app/wallWorkflow';
export * from '../../src/app/authoringRelationships';
export * from '../../src/app/finalGeometry';
export * from '../../src/app/manufacturingCompensation';
export * from '../../src/app/boxDocument';
export * from '../../src/app/boxConstruction';
export * from '../../src/app/connectionLabels';
export * from '../../src/app/connectionViewModel';
export * from '../../src/app/globalProjectHistory';
export * from '../../src/app/projectDataEqual';
export * from '../../src/app/constructionOperations';

import { stageDrawingAction, type DrawingAction } from '../../src/app/drawingTransactionAdapter';
import type { GlobalProjectHistory } from '../../src/app/globalProjectHistory';

/** Exercise whole-document admission and staging independently of the mounted CAD editing session. */
export const projectDrawingActions = (owner: GlobalProjectHistory) => ({
  transact: (label: string, action: DrawingAction) => owner.transact('drawing', label, tx => stageDrawingAction(tx, action)),
});
