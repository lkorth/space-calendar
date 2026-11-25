import { shiftPath } from './geometry.ts';

/** 16 × 12 in pages at 96 px/in, so laser software imports them at true size. */
export const PAGE_WIDTH = 1536;
export const PAGE_HEIGHT = 1152;

/** A Glowforge Basic engraves only about 11 in front to back. */
export const ARTWORK_TOP = 48;
export const ARTWORK_BOTTOM = 1104;

export type Mode = 'print' | 'laser';

/** 'circle' is a 12 in disc, cut from the middle of the page with the same artwork. */
export type PageShape = 'rectangle' | 'circle';

/** One filled path. Shapes that overlap stay separate, because contours in one path can
 *  cancel each other out. */
export interface Shape {
  /** What the shape depicts. Not written to the SVG. */
  layer: string;
  d: string;
  evenOdd?: boolean;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Both modes draw the same outlines: print text as outlines too, so it looks right in an
 *  <img>, which cannot load a web font. */
export function renderSvg(title: string, shapes: readonly Shape[], mode: Mode, shape: PageShape = 'rectangle'): string {
  const round = shape === 'circle';
  const width = round ? PAGE_HEIGHT : PAGE_WIDTH;
  // Moved in the paths rather than by the viewBox, so that every coordinate stays absolute.
  const dx = (width - PAGE_WIDTH) / 2;
  const paths = shapes
    .filter(({ d }) => d !== '')
    .map(({ d, evenOdd }) => `<path${evenOdd ? ' fill-rule="evenodd"' : ''} d="${dx === 0 ? d : shiftPath(d, dx)}"/>`)
    .join('\n');
  const r = PAGE_HEIGHT / 2;
  const edge = (inset: number, style: string) =>
    round
      ? `<circle cx="${r}" cy="${r}" r="${r - inset}" ${style}/>`
      : `<rect x="${inset}" y="${inset}" width="${width - 2 * inset}" height="${PAGE_HEIGHT - 2 * inset}" ${style}/>`;
  const background = mode === 'print' ? `${edge(0, 'fill="#111214"')}\n` : '';
  const outline =
    mode === 'laser'
      ? `<g id="page-outline-reference-only">\n${edge(0.5, 'fill="none" stroke="#ff0000" stroke-width="1"')}\n</g>\n`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width / 96}in" height="12in" viewBox="0 0 ${width} ${PAGE_HEIGHT}">
<title>${escapeXml(title)}</title>
${background}<g id="artwork" fill="${mode === 'laser' ? '#000000' : '#dcdee1'}" fill-rule="nonzero">
${paths}
</g>
${outline}</svg>
`;
}
