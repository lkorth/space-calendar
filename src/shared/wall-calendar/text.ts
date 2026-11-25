import font from './jost-glyphs.json';
import { num } from './geometry.ts';
import type { Point } from './geometry.ts';

export type Weight = 300 | 400 | 500 | 600;

export interface TextStyle {
  /** Font size in px */
  size: number;
  weight: Weight;
  /** Letter-spacing in px */
  spacing?: number;
}

export interface TextPlacement {
  anchor?: 'start' | 'middle' | 'end';
  /** Rotation about (x, y) in radians, clockwise */
  rotate?: number;
  /** What sits on y: the baseline, or the middle of the capitals */
  align?: 'baseline' | 'middle';
  /** Shifts the text down, before rotation */
  dy?: number;
}

interface Glyph {
  advance: number;
  /** Outline commands: a letter followed by its coordinates, in font units, y up */
  outline: (string | number)[];
}

const { unitsPerEm, capHeight } = font;
const DATA = font.weights as unknown as Record<string, Record<string, [number, string]>>;
const parsed = new Map<string, Glyph>();

function glyph(ch: string, weight: Weight): Glyph {
  const key = `${weight}${ch}`;
  let found = parsed.get(key);
  if (!found) {
    const entry = DATA[weight]![ch];
    if (!entry) throw new Error(`Jost ${weight} has no outline for "${ch}"`);
    const outline = (entry[1].match(/[MLQZ]|-?[\d.]+/g) ?? []).map((t) => (/[MLQZ]/.test(t) ? t : Number(t)));
    found = { advance: entry[0], outline };
    parsed.set(key, found);
  }
  return found;
}

export function hasGlyphs(text: string, weight: Weight): boolean {
  return [...text].every((ch) => ch in DATA[weight]!);
}

/** Width of the text. Spacing falls between letters, not after the last. */
export function textWidth(text: string, { size, weight, spacing = 0 }: TextStyle): number {
  const chars = [...text];
  const advance = chars.reduce((sum, ch) => sum + glyph(ch, weight).advance, 0);
  return (advance * size) / unitsPerEm + Math.max(0, chars.length - 1) * spacing;
}

export function scaleStyle(style: TextStyle, factor: number): TextStyle {
  return { ...style, size: style.size * factor, spacing: (style.spacing ?? 0) * factor };
}

/** The style, shrunk as far as it must be for the text to fit in `maxWidth`. */
export function fitStyle(text: string, style: TextStyle, maxWidth: number): TextStyle {
  const width = textWidth(text, style);
  return width <= maxWidth ? style : scaleStyle(style, maxWidth / width);
}

/** Break text into lines. `widthOf` gives the room on each line, by line number. A word
 *  wider than its line gets a line to itself. */
export function wrapText(text: string, style: TextStyle, widthOf: (line: number) => number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textWidth(candidate, style) > widthOf(lines.length)) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** The text as outlines, placed at (x, y). */
export function textPath(text: string, [x, y]: Point, style: TextStyle, placement: TextPlacement = {}): string {
  const { anchor = 'start', rotate = 0, align = 'baseline', dy = 0 } = placement;
  const { size, weight, spacing = 0 } = style;
  const scale = size / unitsPerEm;
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  const base = dy + (align === 'middle' ? (capHeight * scale) / 2 : 0);
  let pen = 0;
  if (anchor !== 'start') pen = -textWidth(text, style) / (anchor === 'middle' ? 2 : 1);

  let d = '';
  for (const ch of text) {
    const { advance, outline } = glyph(ch, weight);
    let first = true;
    for (let i = 0; i < outline.length; ) {
      const token = outline[i]!;
      if (typeof token === 'string') {
        d += token;
        first = true;
        i++;
        continue;
      }
      const lx = pen + token * scale;
      const ly = base - (outline[i + 1] as number) * scale;
      d += `${first ? '' : ' '}${num(x + lx * cos - ly * sin)} ${num(y + lx * sin + ly * cos)}`;
      first = false;
      i += 2;
    }
    pen += advance * scale + spacing;
  }
  return d;
}

/** Rotation for text running along a circle at angle `a`, flipped in the bottom half so it
 *  stays upright. */
export function tangentRotation(a: number): number {
  return Math.sin(a) > 1e-9 ? a - Math.PI / 2 : a + Math.PI / 2;
}

/** Placement for text running along a spoke, inward from its outer end. */
export function spokePlacement(a: number): { rotate: number; anchor: 'start' | 'end' } {
  return Math.cos(a) < -1e-9 ? { rotate: a + Math.PI, anchor: 'start' } : { rotate: a, anchor: 'end' };
}
