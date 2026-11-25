/** 16 × 12 in pages at 96 px/in, so laser software imports them at true size. */
export const PAGE_WIDTH = 1536;
export const PAGE_HEIGHT = 1152;

/** A Glowforge Basic engraves only about 11 in front to back. */
export const ARTWORK_TOP = 48;
export const ARTWORK_BOTTOM = 1104;

export type Mode = 'print' | 'laser';

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

/** Both modes draw the same outlines: preview text as outlines too, so it looks right in an
 *  <img>, which cannot load a web font. */
export function renderSvg(title: string, shapes: readonly Shape[], mode: Mode): string {
  const paths = shapes
    .filter(({ d }) => d !== '')
    .map(({ d, evenOdd }) => `<path${evenOdd ? ' fill-rule="evenodd"' : ''} d="${d}"/>`)
    .join('\n');
  const background =
    mode === 'print' ? `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#111214"/>\n` : '';
  const outline =
    mode === 'laser'
      ? `<g id="page-outline-reference-only">\n<rect x="0.5" y="0.5" width="${PAGE_WIDTH - 1}" height="${PAGE_HEIGHT - 1}" fill="none" stroke="#ff0000" stroke-width="1"/>\n</g>\n`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="16in" height="12in" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
<title>${escapeXml(title)}</title>
${background}<g id="artwork" fill="${mode === 'laser' ? '#000000' : '#dcdee1'}" fill-rule="nonzero">
${paths}
</g>
${outline}</svg>
`;
}
