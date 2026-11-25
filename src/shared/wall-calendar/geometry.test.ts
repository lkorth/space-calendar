import { describe, it, expect } from 'vitest';
import {
  annulus, arcBand, capsule, circle, dashedRing, dotsAlong, moonLit, num, polygon, radialBar, shiftPath, strokePolyline, thinQuad,
} from './geometry.ts';
import { bounds, contours, pathArea, signedArea } from './path-testing.ts';

describe('num', () => {
  it('rounds to two decimals without trailing zeros or a negative zero', () => {
    expect(num(1.239)).toBe('1.24');
    expect(num(2)).toBe('2');
    expect(num(-0.001)).toBe('0');
  });
});

describe('annulus', () => {
  it('winds the outer contour clockwise and the inner one counter-clockwise', () => {
    const [outer, inner] = contours(annulus(100, 100, 50, 4));
    expect(signedArea(outer!)).toBeGreaterThan(0);
    expect(signedArea(inner!)).toBeLessThan(0);
  });

  it('is centered on its radius', () => {
    const { x0, x1, y0, y1 } = bounds(annulus(100, 100, 50, 4));
    expect([x0, x1, y0, y1].map(Math.round)).toEqual([48, 152, 48, 152]);
  });
});

describe('dashedRing', () => {
  it('draws the requested number of dashes at the requested duty', () => {
    const d = dashedRing(0, 0, 100, 2, 28, 0.52);
    expect(contours(d)).toHaveLength(28);
    // Short of a full ring only by the duty (two-decimal rounding costs a little).
    expect(pathArea(d) / pathArea(annulus(0, 0, 100, 2))).toBeCloseTo(0.52, 2);
  });

  it('starts the first dash at the top', () => {
    const [x, y] = contours(dashedRing(0, 0, 100, 2, 28, 0.52))[0]![0]!;
    expect(x).toBeCloseTo(0, 2);
    expect(y).toBeCloseTo(-101, 2);
  });
});

describe('solid outlines', () => {
  it('all wind clockwise, so solids in one path union', () => {
    const solids = {
      circle: circle(0, 0, 10),
      arcBand: arcBand(0, 0, 10, 20, 0.3, 0.9),
      radialBarOut: radialBar(0, 0, 10, 20, 2, 0.1),
      radialBarIn: radialBar(0, 0, 20, 10, 2, 0.1),
      quad: thinQuad([0, 0], [10, 3], 1),
      quadReversed: thinQuad([10, 3], [0, 0], 1),
      polyline: strokePolyline([[0, 0], [10, 0], [12, 8]], 1.4),
      capsule: capsule([0, 0], [5, 9], 2),
      moon: moonLit(0, 0, 10, 0.7, true),
    };
    for (const [name, d] of Object.entries(solids)) {
      expect(pathArea(d), name).toBeGreaterThan(0);
    }
  });

  it('gives lines their width', () => {
    expect(pathArea(thinQuad([0, 0], [30, 40], 2))).toBeCloseTo(100, 0);
    expect(pathArea(strokePolyline([[0, 0], [10, 0], [10, 10]], 2))).toBeCloseTo(40, 0);
    expect(pathArea(capsule([0, 0], [10, 0], 2))).toBeCloseTo(20 + Math.PI, 0);
  });
});

describe('dotsAlong', () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]] as const;

  it('spaces round dots evenly around a closed curve without doubling the first', () => {
    const dots = contours(dotsAlong(square, 2, 10, true));
    expect(dots).toHaveLength(40);
    expect(new Set(dots.map((c) => c[0]!.map(Math.round).join())).size).toBe(40);
  });

  it('puts a dot on both ends of an open curve', () => {
    expect(contours(dotsAlong([[0, 0], [100, 0]], 2, 10, false))).toHaveLength(11);
  });
});

describe('moonLit', () => {
  const full = Math.PI * 100 ** 2;
  const centroidX = (d: string) => {
    const { x0, x1 } = bounds(d);
    return (x0 + x1) / 2;
  };

  it('lights the fraction of the disc it is given', () => {
    for (const k of [0.25, 0.5, 0.75]) {
      for (const right of [true, false]) {
        expect(Math.abs(pathArea(moonLit(0, 0, 100, k, right))) / full, `${k} ${right}`).toBeCloseTo(k, 2);
      }
    }
  });

  it('lights the requested side', () => {
    expect(centroidX(moonLit(0, 0, 100, 0.25, true))).toBeGreaterThan(0);
    expect(centroidX(moonLit(0, 0, 100, 0.25, false))).toBeLessThan(0);
    // A gibbous Moon bulges past the middle, but not all the way.
    expect(bounds(moonLit(0, 0, 100, 0.75, true)).x0).toBeCloseTo(-50, 0);
    expect(bounds(moonLit(0, 0, 100, 0.75, false)).x1).toBeCloseTo(50, 0);
  });

  it('draws nothing at new and a whole disc at full', () => {
    expect(moonLit(0, 0, 100, 0.005, true)).toBe('');
    expect(moonLit(0, 0, 100, 0.995, true)).toBe(circle(0, 0, 100));
  });

  it('keeps thin slivers wide enough to engrave', () => {
    // 1.8 units of a 16-unit radius, on the thin crescent and on the dark limb.
    expect(bounds(moonLit(0, 0, 16, 0.01, true)).x0).toBeCloseTo(0, 5);
    const crescentInner = contours(moonLit(0, 0, 16, 0.01, true))[0]!.slice(24).map(([x]) => x);
    expect(Math.max(...crescentInner)).toBeCloseTo(14.2, 1);
    expect(bounds(moonLit(0, 0, 16, 0.99, true)).x0).toBeCloseTo(-14.2, 1);
  });
});

describe('polygon', () => {
  it('closes an absolute path', () => {
    expect(polygon([[0, 0], [1, 0], [1, 1]])).toBe('M0 0L1 0L1 1Z');
  });
});

describe('shiftPath', () => {
  it('moves every point sideways and leaves radii, flags and heights alone', () => {
    expect(shiftPath('M10 20L30 40Q1 2 3 4A5 5 0 1 0 60 70Z', -10)).toBe('M0 20L20 40Q-9 2 -7 4A5 5 0 1 0 50 70Z');
  });

  it('moves real shapes without changing them', () => {
    for (const d of [circle(50, 60, 9), annulus(0, 0, 50, 2), arcBand(0, 0, 10, 20, 0.3, 0.9), capsule([0, 0], [5, 9], 2)]) {
      const [before, after] = [bounds(d), bounds(shiftPath(d, 100))];
      expect(after.x0).toBeCloseTo(before.x0 + 100, 2);
      expect(after.x1).toBeCloseTo(before.x1 + 100, 2);
      expect(after.y0).toBeCloseTo(before.y0, 2);
      expect(pathArea(shiftPath(d, 100))).toBeCloseTo(pathArea(d), 0);
    }
  });
});
