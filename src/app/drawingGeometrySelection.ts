import { toggleDrawingGeometrySelection, type DrawingSelectionRef } from './drawingConstraintsTool.js';

/** Shared click-selection policy; drag availability is an independent concern. */
export const routeDrawingGeometryPointerSelection = (selection: readonly DrawingSelectionRef[], target: DrawingSelectionRef, ctrlKey: boolean, constraintsOpen: boolean) => {
  const toggle = ctrlKey || constraintsOpen;
  return { selection: toggle ? toggleDrawingGeometrySelection(selection, target) : [target], beginDrag: !toggle } as const;
};
