import type { Point, SvgDocumentModel } from '../svgUtils';
import { pointsToClosedPathD } from './sharedGeometry';

export type PanelMetadata = { panelId: string; thicknessMm: number };
export type PanelManagerState = { panels: Record<string, PanelMetadata>; defaultThicknessMm: number; isApplied: boolean; isDirty: boolean };

export const defaultPanelManagerState: PanelManagerState = { panels: {}, defaultThicknessMm: 0, isApplied: false, isDirty: false };

export const createPanelManagerStateFromModel = (svgModel: SvgDocumentModel, defaultThicknessMm = 0): PanelManagerState => ({
  panels: Object.fromEntries(svgModel.panels.map((panel) => [panel.id, { panelId: panel.id, thicknessMm: defaultThicknessMm }])),
  defaultThicknessMm,
  isApplied: false,
  isDirty: false,
});

export const validatePanelManagerState = (panelManager: PanelManagerState): string | null => {
  const panels = Object.values(panelManager.panels);
  if (panels.length === 0) return 'No panels were detected. Import a file with closed panels before using workflow tools.';
  return panels.every((panel) => Number.isFinite(panel.thicknessMm) && panel.thicknessMm > 0)
    ? null
    : 'Set thickness for all panels before applying Panel Manager.';
};

export type PanelTreeHoleNode = { kind: 'hole'; id: string; ownerPanelId: string; holeIndex: number; label: string; pathD: string; childPanels: PanelTreePanelNode[] };
export type PanelTreePanelNode = { kind: 'panel'; id: string; label: string; parentPanelId?: string; innerContourCount: number; holes: PanelTreeHoleNode[] };

const getPanelDisplayName = (panelId: string): string => {
  const panelNumber = panelId.match(/^panel-(\d+)$/)?.[1];
  return panelNumber ? `P${panelNumber}` : panelId;
};

const getContourCenter = (contour: Point[]): Point => {
  if (contour.length === 0) return { x: 0, y: 0 };
  const totals = contour.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: totals.x / contour.length, y: totals.y / contour.length };
};

const isPointInContour = (point: Point, contour: Point[]): boolean => {
  let inside = false;
  for (let index = 0, previousIndex = contour.length - 1; index < contour.length; previousIndex = index++) {
    const current = contour[index];
    const previous = contour[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const buildPanelContainmentTree = (svgModel: SvgDocumentModel): PanelTreePanelNode[] => {
  const panelsByParent = new Map<string, SvgDocumentModel['panels']>();
  svgModel.panels.forEach((panel) => {
    const parentKey = panel.parentPanelId ?? '';
    panelsByParent.set(parentKey, [...(panelsByParent.get(parentKey) ?? []), panel]);
  });
  const buildPanelNode = (panel: SvgDocumentModel['panels'][number]): PanelTreePanelNode => {
    const childPanelByHoleIndex = new Map<number, SvgDocumentModel['panels']>();
    (panelsByParent.get(panel.id) ?? []).forEach((childPanel) => {
      const center = getContourCenter(childPanel.outerContour ?? childPanel.contour);
      const holeIndex = panel.innerContours.findIndex((innerContour) => isPointInContour(center, innerContour));
      const targetHoleIndex = holeIndex >= 0 ? holeIndex : 0;
      childPanelByHoleIndex.set(targetHoleIndex, [...(childPanelByHoleIndex.get(targetHoleIndex) ?? []), childPanel]);
    });
    return {
      kind: 'panel', id: panel.id, label: getPanelDisplayName(panel.id), parentPanelId: panel.parentPanelId, innerContourCount: panel.innerContours.length,
      holes: panel.innerContours.map((innerContour, holeIndex) => ({ kind: 'hole', id: `${panel.id}:hole-${holeIndex}`, ownerPanelId: panel.id, holeIndex, label: `Hole ${holeIndex + 1}`, pathD: pointsToClosedPathD(innerContour), childPanels: (childPanelByHoleIndex.get(holeIndex) ?? []).map(buildPanelNode) })),
    };
  };
  return (panelsByParent.get('') ?? []).map(buildPanelNode);
};
