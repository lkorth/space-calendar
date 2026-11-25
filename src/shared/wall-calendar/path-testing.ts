/** Path helpers for tests: turn path data back into points so a test can measure it. */
import type { Point } from './geometry.ts';

/** The contours of a path as polylines, with curves and arcs sampled. Throws on any
 *  command a wall calendar must not contain, relative ones included. */
export function contours(d: string): Point[][] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Point[][] = [];
  let current: Point[] = [];
  let i = 0;
  let command = '';
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) command = tokens[i++]!;
    const last = current.at(-1);
    if (command === 'M') {
      current = [[n(), n()]];
      out.push(current);
      command = 'L';
    } else if (command === 'L') {
      current.push([n(), n()]);
    } else if (command === 'Q') {
      const [cx, cy, x, y] = [n(), n(), n(), n()];
      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const u = 1 - t;
        current.push([
          u * u * last![0] + 2 * u * t * cx + t * t * x,
          u * u * last![1] + 2 * u * t * cy + t * t * y,
        ]);
      }
    } else if (command === 'A') {
      const [rx, ry, , large, sweep, x, y] = [n(), n(), n(), n(), n(), n(), n()];
      current.push(...sampleArc(last!, rx, ry, large === 1, sweep === 1, [x, y]));
    } else if (command !== 'Z') {
      throw new Error(`Unexpected path command ${command}`);
    }
  }
  return out;
}

/** Endpoint-to-center arc conversion, SVG 1.1 appendix F.6.5, without rotation. */
function sampleArc(p0: Point, rx0: number, ry0: number, large: boolean, sweep: boolean, p1: Point): Point[] {
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const grow = Math.sqrt(Math.max(1, (dx / rx0) ** 2 + (dy / ry0) ** 2));
  const rx = rx0 * grow;
  const ry = ry0 * grow;
  const under = Math.max(0, (rx * ry) ** 2 - (rx * dy) ** 2 - (ry * dx) ** 2) / ((rx * dy) ** 2 + (ry * dx) ** 2);
  const k = Math.sqrt(under) * (large === sweep ? -1 : 1);
  const cxp = (k * rx * dy) / ry;
  const cyp = (-k * ry * dx) / rx;
  const cx = cxp + (p0[0] + p1[0]) / 2;
  const cy = cyp + (p0[1] + p1[1]) / 2;
  const a0 = Math.atan2((dy - cyp) / ry, (dx - cxp) / rx);
  let span = Math.atan2((-dy - cyp) / ry, (-dx - cxp) / rx) - a0;
  if (sweep && span < 0) span += 2 * Math.PI;
  if (!sweep && span > 0) span -= 2 * Math.PI;
  return Array.from({ length: 24 }, (_, s): Point => {
    const a = a0 + (span * (s + 1)) / 24;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** Signed area: positive for a contour that runs clockwise on screen. */
export function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, [x, y], i) => {
    const [x1, y1] = points[(i + 1) % points.length]!;
    return sum + (x * y1 - x1 * y) / 2;
  }, 0);
}

export function pathArea(d: string): number {
  return contours(d).reduce((sum, c) => sum + signedArea(c), 0);
}

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

export function bounds(d: string): Bounds {
  const points = contours(d).flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const min = (v: number[]) => v.reduce((a, b) => Math.min(a, b), Infinity);
  const max = (v: number[]) => v.reduce((a, b) => Math.max(a, b), -Infinity);
  return { x0: min(xs), y0: min(ys), x1: max(xs), y1: max(ys) };
}
