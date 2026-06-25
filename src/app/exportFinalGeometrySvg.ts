import type { FinalGeometry } from './finalGeometry';
import type { SvgDocumentModel } from '../svgUtils';

const escapeSvgAttribute = (value: string | number) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const exportFinalGeometrySvg = (svgModel: SvgDocumentModel, finalGeometry: FinalGeometry): string => {
  const rootViewBox = svgModel.rootAttributes.viewBox ?? svgModel.viewBox;
  const rootWidth = svgModel.rootAttributes.width;
  const rootHeight = svgModel.rootAttributes.height;
  const sizeAttributes = [
    rootWidth !== null ? `width="${escapeSvgAttribute(rootWidth)}"` : '',
    rootHeight !== null ? `height="${escapeSvgAttribute(rootHeight)}"` : '',
  ].filter(Boolean).join(' ');
  const panelContoursById = new Map(finalGeometry.contours
    .filter((contour) => contour.finalSource !== 's-slot' && contour.panelId)
    .map((contour) => [contour.panelId as string, contour]));
  const pathElements = svgModel.panels.map((panel) => {
    const d = panelContoursById.get(panel.id)?.pathD;

    return `  <path d="${escapeSvgAttribute(d ?? '')}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  });
  const slotElements = finalGeometry.contours.filter((contour) => contour.finalSource === 's-slot').map((contour) => (
    `  <path d="${escapeSvgAttribute(contour.pathD ?? '')}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`
  ));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeSvgAttribute(rootViewBox)}"${sizeAttributes ? ` ${sizeAttributes}` : ''}>`,
    ...pathElements,
    ...slotElements,
    '</svg>',
  ].join('\n');
};
