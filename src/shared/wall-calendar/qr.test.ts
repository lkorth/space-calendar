import { describe, it, expect } from 'vitest';
import { MODULE_PX, darkOutlines, qrMatrix, qrPath, qrSize } from './qr.ts';
import { pathArea, signedArea } from './path-testing.ts';

const URL_TEXT = 'https://space-calendar.lukekorth.com';

describe('qrMatrix', () => {
  it('encodes a short URL in 29 modules', () => {
    expect(qrMatrix(URL_TEXT)).toHaveLength(29);
  });

  it('refuses text that would not fit beside the wheel', () => {
    expect(qrMatrix('x'.repeat(150))).toBeNull();
    expect(qrMatrix('x'.repeat(5000))).toBeNull();
  });
});

describe('darkOutlines', () => {
  it('covers exactly the dark modules', () => {
    const matrix = qrMatrix(URL_TEXT)!;
    const dark = matrix.flat().filter(Boolean).length;
    const area = darkOutlines(matrix).reduce((sum, loop) => sum + signedArea(loop), 0);
    expect(area).toBe(dark);
  });

  it('outlines a block once and keeps corner-touching modules apart', () => {
    expect(darkOutlines([[true, true], [true, true]])).toEqual([[[0, 0], [2, 0], [2, 2], [0, 2]]]);
    expect(darkOutlines([[true, false], [false, true]])).toHaveLength(2);
    expect(darkOutlines([[false, true], [true, false]])).toHaveLength(2);
  });

  it('returns the light hole inside a dark ring as its own contour', () => {
    const ring = [[true, true, true], [true, false, true], [true, true, true]];
    expect(darkOutlines(ring).map(signedArea).sort()).toEqual([-1, 9]);
  });
});

describe('qrPath', () => {
  it('fills the square and quiet zone, less the dark modules', () => {
    const matrix = qrMatrix(URL_TEXT)!;
    expect(qrSize(matrix)).toBe((29 + 8) * MODULE_PX);
    const outline = pathArea(qrPath(matrix, 64, 800));
    const dark = matrix.flat().filter(Boolean).length * MODULE_PX ** 2;
    // Contours share a direction here; the even-odd rule is what makes them holes.
    expect(outline).toBeCloseTo(qrSize(matrix) ** 2 + dark, 0);
  });
});
