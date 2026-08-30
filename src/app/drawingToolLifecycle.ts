export type DrawingActiveTool = 'select' | 'line';
export type DrawingToolLifecycleAction = 'activate' | 'cancel-construction' | 'finish-construction' | 'deactivate';

/** Shared vocabulary for tool lifetime; transient construction remains owned by each tool. */
export const nextDrawingTool = (activeTool: DrawingActiveTool, action: DrawingToolLifecycleAction, tool: DrawingActiveTool = activeTool): DrawingActiveTool => {
  if (action === 'activate') return tool;
  if (action === 'deactivate') return 'select';
  return activeTool;
};
