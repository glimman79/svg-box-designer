import type { SvgDocumentModel } from '../svgUtils';

export const initialBoxViewBox = '0 0 800 600';

/** Creates the authoritative empty document used by a new Box workspace. */
export const createBoxDocumentV1 = (): SvgDocumentModel => ({
  content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${initialBoxViewBox}"></svg>`,
  innerMarkup: '',
  rootAttributes: {
    width: null,
    height: null,
    viewBox: initialBoxViewBox,
  },
  viewBox: initialBoxViewBox,
  width: 800,
  height: 600,
  edges: [],
  panels: [],
});
