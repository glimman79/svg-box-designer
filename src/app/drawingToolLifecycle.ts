export type DrawingActiveTool = 'select' | 'line';
export type CadToolActivationMode = 'normal' | 'persistent';
export type DrawingToolLifecycle = Readonly<{ activeTool: DrawingActiveTool; activationMode: CadToolActivationMode }>;
export type DrawingToolLifecycleAction = 'activate' | 'cancel-construction' | 'finish-construction' | 'deactivate';

/** Shared vocabulary for tool lifetime; transient construction remains owned by each tool. */
export const nextDrawingTool = (activeTool: DrawingActiveTool, action: DrawingToolLifecycleAction, tool: DrawingActiveTool = activeTool): DrawingActiveTool => {
  if (action === 'activate') return tool;
  if (action === 'deactivate') return 'select';
  return activeTool;
};

export const activateDrawingTool = (tool: DrawingActiveTool, activationMode: CadToolActivationMode = 'normal'): DrawingToolLifecycle => ({
  activeTool: tool,
  activationMode: tool === 'select' ? 'normal' : activationMode,
});

export const finishDrawingConstruction = (lifecycle: DrawingToolLifecycle): DrawingToolLifecycle => (
  lifecycle.activationMode === 'persistent' ? lifecycle : activateDrawingTool('select')
);
