import type { SvgDocumentModel, SvgPanel } from '../svgUtils';

export const findPanelContainingEdge = (svgModel: SvgDocumentModel, edgeId: string): SvgPanel | null => (
  svgModel.panels.find((panel) => panel.edgeIds.includes(edgeId)) ?? null
);
