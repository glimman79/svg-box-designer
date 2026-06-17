import { pointsToClosedPathD } from './sharedGeometry';
import type { AppliedEPanelPath, AppliedSGeometry } from './connectionTypes';
import type { SvgDocumentModel } from '../svgUtils';

const escapeSvgAttribute = (value: string | number) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const exportAppliedSvg = (
  svgModel: SvgDocumentModel,
  appliedEPanelPaths: AppliedEPanelPath[],
  appliedSGeometry: AppliedSGeometry[] = [],
): string => {
  const rootViewBox = svgModel.rootAttributes.viewBox ?? svgModel.viewBox;
  const rootWidth = svgModel.rootAttributes.width;
  const rootHeight = svgModel.rootAttributes.height;
  const sizeAttributes = [
    rootWidth !== null ? `width="${escapeSvgAttribute(rootWidth)}"` : '',
    rootHeight !== null ? `height="${escapeSvgAttribute(rootHeight)}"` : '',
  ].filter(Boolean).join(' ');
  const appliedByPanelId = new Map<string, { pathD: string }>(appliedEPanelPaths.map((panelPath) => [panelPath.panelId, panelPath]));
  appliedSGeometry.flatMap((geometry) => geometry.panelPaths).forEach((panelPath) => {
    if (!appliedByPanelId.has(panelPath.panelId)) {
      appliedByPanelId.set(panelPath.panelId, panelPath);
    }
  });
  const pathElements = svgModel.panels.map((panel) => {
    const d = appliedByPanelId.get(panel.id)?.pathD ?? pointsToClosedPathD(panel.contour);

    return `  <path d="${escapeSvgAttribute(d)}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  });
  const slotElements = appliedSGeometry.flatMap((geometry) => geometry.slotPaths).map((slotPath) => (
    `  <path d="${escapeSvgAttribute(slotPath.pathD)}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`
  ));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeSvgAttribute(rootViewBox)}"${sizeAttributes ? ` ${sizeAttributes}` : ''}>`,
    ...pathElements,
    ...slotElements,
    '</svg>',
  ].join('\n');
};
