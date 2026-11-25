import qrcode from 'qrcode-generator';
import { polygon, rect } from './geometry.ts';
import type { Point } from './geometry.ts';

const QUIET_ZONE = 4;

/** Larger codes would reach the wheel when drawn at MODULE_PX. */
export const MAX_QR_MODULES = 41;
export const MODULE_PX = 4.5;

/** The QR matrix, true where a module is dark, at error correction level M. Returns null
 *  when the text needs more modules than the page has room for. */
export function qrMatrix(text: string): boolean[][] | null {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  try {
    qr.make();
  } catch {
    return null; // longer than any QR code holds
  }
  const n = qr.getModuleCount();
  if (n > MAX_QR_MODULES) return null;
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)));
}

export function qrSize(matrix: boolean[][]): number {
  return (matrix.length + 2 * QUIET_ZONE) * MODULE_PX;
}

/** Outlines of the dark regions, in module units. Whole regions rather than one square per
 *  module, because the seams between touching squares engrave as hairlines. */
export function darkOutlines(matrix: boolean[][]): Point[][] {
  const dark = (row: number, col: number) => matrix[row]?.[col] ?? false;
  // Boundary edges with the dark module on their right, keyed by where they start.
  const edges = new Map<string, Point[]>();
  const key = ([x, y]: Point) => `${x},${y}`;
  const add = (from: Point, to: Point) => edges.set(key(from), [...(edges.get(key(from)) ?? []), to]);
  matrix.forEach((cells, row) =>
    cells.forEach((isDark, col) => {
      if (!isDark) return;
      if (!dark(row - 1, col)) add([col, row], [col + 1, row]);
      if (!dark(row, col + 1)) add([col + 1, row], [col + 1, row + 1]);
      if (!dark(row + 1, col)) add([col + 1, row + 1], [col, row + 1]);
      if (!dark(row, col - 1)) add([col, row + 1], [col, row]);
    }),
  );

  const loops: Point[][] = [];
  for (const [start, targets] of edges) {
    while (targets.length > 0) {
      const origin = start.split(',').map(Number) as unknown as Point;
      const loop: Point[] = [origin];
      let at = origin;
      let next = targets.pop()!;
      while (key(next) !== start) {
        const outgoing = edges.get(key(next))!;
        // Two dark modules touching at a corner leave two ways out; turn right so each
        // module keeps its own outline.
        const [dx, dy] = [next[0] - at[0], next[1] - at[1]];
        const right = outgoing.findIndex(([x, y]) => x - next[0] === -dy && y - next[1] === dx);
        const [to] = outgoing.splice(outgoing.length > 1 ? Math.max(0, right) : 0, 1);
        loop.push(next);
        at = next;
        next = to!;
      }
      loops.push(loop.filter((p, i) => !isStraight(loop.at(i - 1)!, p, loop[(i + 1) % loop.length]!)));
    }
  }
  return loops;
}

function isStraight(a: Point, b: Point, c: Point): boolean {
  return (b[0] - a[0]) * (c[1] - b[1]) === (b[1] - a[1]) * (c[0] - b[0]);
}

/** The light square with the dark modules left out. Fill with the even-odd rule. */
export function qrPath(matrix: boolean[][], x: number, y: number): string {
  const size = qrSize(matrix);
  const at = (v: number) => (v + QUIET_ZONE) * MODULE_PX;
  return (
    rect(x, y, size, size) +
    darkOutlines(matrix)
      .map((loop) => polygon(loop.map(([px, py]): Point => [x + at(px), y + at(py)])))
      .join('')
  );
}
