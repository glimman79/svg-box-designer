import type { FinalGeometry } from './finalGeometry';
import type { ManufacturingGeometry } from './manufacturingGeometry';
import type { SvgDocumentModel } from '../svgUtils';

const escapeSvgAttribute = (value: string | number) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const serializeContourSvg = (svgModel: SvgDocumentModel, contours: ReadonlyArray<{ pathD?: string }>): string => {
  const rootViewBox = svgModel.rootAttributes.viewBox ?? svgModel.viewBox;
  const rootWidth = svgModel.rootAttributes.width;
  const rootHeight = svgModel.rootAttributes.height;
  const sizeAttributes = [
    rootWidth !== null ? `width="${escapeSvgAttribute(rootWidth)}"` : '',
    rootHeight !== null ? `height="${escapeSvgAttribute(rootHeight)}"` : '',
  ].filter(Boolean).join(' ');
  const pathElements = contours.map((contour) => (
    `  <path d="${escapeSvgAttribute(contour.pathD ?? '')}" fill="none" stroke="#000000" stroke-width="1" vector-effect="non-scaling-stroke"/>`
  ));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeSvgAttribute(rootViewBox)}"${sizeAttributes ? ` ${sizeAttributes}` : ''}>`,
    ...pathElements,
    '</svg>',
  ].join('\n');
};

export const exportManufacturingGeometrySvg = (
  svgModel: SvgDocumentModel,
  manufacturingGeometry: ManufacturingGeometry,
): string => serializeContourSvg(svgModel, manufacturingGeometry.contours);

export const exportFinalGeometrySvg = (svgModel: SvgDocumentModel, finalGeometry: FinalGeometry): string => serializeContourSvg(svgModel, finalGeometry.contours);
