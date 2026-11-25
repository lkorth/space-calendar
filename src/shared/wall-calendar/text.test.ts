import { describe, it, expect } from 'vitest';
import { fitStyle, hasGlyphs, spokePlacement, tangentRotation, textPath, textWidth, wrapText } from './text.ts';
import type { TextStyle } from './text.ts';
import { bounds } from './path-testing.ts';
import { DEG } from './geometry.ts';

const style: TextStyle = { size: 10, weight: 400, spacing: 1 };

describe('textWidth', () => {
  it('counts spacing between letters only', () => {
    const bare = textWidth('AB', { ...style, spacing: 0 });
    expect(textWidth('AB', style)).toBeCloseTo(bare + 1);
    expect(textWidth('', style)).toBe(0);
  });
});

describe('textPath', () => {
  it('anchors at the start, middle and end', () => {
    const at = (anchor: 'start' | 'middle' | 'end') => bounds(textPath('HH', [100, 50], style, { anchor }));
    expect(at('start').x0).toBeGreaterThan(100);
    const mid = at('middle');
    expect((mid.x0 + mid.x1) / 2).toBeCloseTo(100, 0);
    expect(at('end').x1).toBeLessThan(100);
  });

  it('stands capitals on the baseline, or centers them', () => {
    const onBaseline = bounds(textPath('H', [0, 50], style));
    expect(onBaseline.y1).toBeCloseTo(50, 1);
    expect(onBaseline.y0).toBeCloseTo(43, 1);
    const centered = bounds(textPath('H', [0, 50], style, { align: 'middle' }));
    expect((centered.y0 + centered.y1) / 2).toBeCloseTo(50, 1);
  });

  it('bakes rotation into the coordinates', () => {
    const b = bounds(textPath('HHHH', [0, 0], style, { rotate: 90 * DEG }));
    expect(b.y1 - b.y0).toBeGreaterThan(b.x1 - b.x0);
    expect(b.y0).toBeGreaterThanOrEqual(0); // reads downward from the anchor
  });

  it('rejects a character the font does not have', () => {
    expect(() => textPath('東', [0, 0], style)).toThrow('no outline');
    expect(hasGlyphs('SÃO PAULO', 400)).toBe(true);
    expect(hasGlyphs('東京', 400)).toBe(false);
  });
});

describe('fitStyle', () => {
  it('shrinks only text that is too wide', () => {
    expect(fitStyle('A', style, 100)).toBe(style);
    expect(textWidth('A LONG LABEL', fitStyle('A LONG LABEL', style, 30))).toBeCloseTo(30);
  });
});

describe('wrapText', () => {
  it('keeps each line within its own width', () => {
    const widthOf = (line: number) => (line === 0 ? 40 : 80);
    const lines = wrapText('ONE TWO THREE FOUR FIVE', style, widthOf);
    expect(lines.join(' ')).toBe('ONE TWO THREE FOUR FIVE');
    lines.forEach((line, i) => expect(textWidth(line, style)).toBeLessThanOrEqual(widthOf(i)));
  });
});

describe('upright orientation', () => {
  it('keeps tangential text upright at the top and the bottom', () => {
    expect(tangentRotation(-90 * DEG)).toBeCloseTo(0);
    expect(tangentRotation(90 * DEG)).toBeCloseTo(0);
  });

  it('reads outward on the left half and inward from the rim on the right', () => {
    expect(spokePlacement(0)).toEqual({ rotate: 0, anchor: 'end' });
    expect(spokePlacement(Math.PI)).toEqual({ rotate: 2 * Math.PI, anchor: 'start' });
  });
});

describe('outward orientation', () => {
  it('turns evenly with the angle, without flipping', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      expect(tangentRotation(deg * DEG, 'outward')).toBeCloseTo((deg + 90) * DEG);
      expect(spokePlacement(deg * DEG, 'outward')).toEqual({ rotate: deg * DEG + Math.PI, anchor: 'start' });
    }
  });
});
