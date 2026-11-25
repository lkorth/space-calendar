/**
 * Extracts the Jost glyph outlines the wall calendars use into
 * src/shared/wall-calendar/jost-glyphs.json, so the Worker neither bundles nor parses fonts.
 *
 * Run: npm run generate-wall-calendar-font
 * Source: the @fontsource/jost npm package (SIL Open Font License 1.1). The license text
 * is written beside the data, because the license must travel with the outlines.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
// opentype.js publishes no types.
// @ts-ignore
import opentype from 'opentype.js';

const FONT_DIR = 'node_modules/@fontsource/jost';
const OUT_DIR = 'src/shared/wall-calendar';

const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).filter(
  // Calendars are set in capitals, so lowercase outlines would be dead weight.
  (ch) => ch < 'a' || ch > 'z',
);
const PUNCTUATION = [...'·—–’°'];
/** Capitals with diacritics, for place labels such as "SÃO PAULO". */
const ACCENTED = Array.from({ length: 0x17f - 0xc0 }, (_, i) => String.fromCharCode(0xc0 + i)).filter(
  (ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase(),
);

/** The characters each weight draws. Only weight 400 sets caller-supplied text. */
const WEIGHTS: Record<string, string[]> = {
  300: [...'0123456789'],
  400: [...ASCII, ...PUNCTUATION, ...ACCENTED],
  500: [...ASCII, ...PUNCTUATION],
  600: [...ASCII, ...PUNCTUATION],
};

interface Command { type: string; x?: number; y?: number; x1?: number; y1?: number }

function outline(commands: Command[]): string {
  return commands
    .map((c) => {
      if (c.type === 'Z') return 'Z';
      if (c.type === 'Q') return `Q${c.x1} ${c.y1} ${c.x} ${c.y}`;
      if (c.type === 'M' || c.type === 'L') return `${c.type}${c.x} ${c.y}`;
      throw new Error(`Unexpected outline command ${c.type}`);
    })
    .join('');
}

function load(subset: string, weight: string) {
  const buf = readFileSync(`${FONT_DIR}/files/jost-${subset}-${weight}-normal.woff`);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const weights: Record<string, Record<string, [number, string]>> = {};
let unitsPerEm = 0;
let capHeight = 0;

for (const [weight, chars] of Object.entries(WEIGHTS)) {
  const fonts = ['latin', 'latin-ext'].map((subset) => load(subset, weight));
  unitsPerEm = fonts[0].unitsPerEm;
  capHeight = fonts[0].tables.os2.sCapHeight;
  const glyphs: Record<string, [number, string]> = {};
  for (const ch of chars) {
    const font = fonts.find((f) => f.charToGlyph(ch).index !== 0);
    if (!font) continue;
    const glyph = font.charToGlyph(ch);
    glyphs[ch] = [glyph.advanceWidth, outline(glyph.path.commands)];
  }
  weights[weight] = glyphs;
}

writeFileSync(`${OUT_DIR}/jost-glyphs.json`, JSON.stringify({ unitsPerEm, capHeight, weights }) + '\n');
copyFileSync(`${FONT_DIR}/LICENSE`, `${OUT_DIR}/JOST-LICENSE.txt`);
console.log(Object.entries(weights).map(([w, g]) => `${w}: ${Object.keys(g).length} glyphs`).join(', '));
