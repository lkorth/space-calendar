/** Filled-outline geometry for wall calendars.
 *
 *  A Glowforge raster-engraves fills, so nothing here strokes a line: lines, rings and
 *  dashes are all returned as closed outlines in absolute coordinates (SVG y-down). Solid
 *  contours run clockwise on screen and holes run counter-clockwise, so a path that holds
 *  several solids unions them under the nonzero fill rule. */

export type Point = readonly [x: number, y: number];

export const DEG = Math.PI / 180;

/** Two decimals is under 0.001 in — finer than the laser spot. */
export function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

const pt = ([x, y]: Point): string => `${num(x)} ${num(y)}`;

/** The point `r` from (cx, cy) at angle `a`, clockwise from the positive x axis. */
export function polar(cx: number, cy: number, r: number, a: number): Point {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function polygon(points: readonly Point[]): string {
  return `M${points.map(pt).join('L')}Z`;
}

export function rect(x: number, y: number, w: number, h: number): string {
  return polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}

export function circle(cx: number, cy: number, r: number, hole = false): string {
  const arc = `A${num(r)} ${num(r)} 0 1 ${hole ? 0 : 1} `;
  return `M${pt([cx, cy - r])}${arc}${pt([cx, cy + r])}${arc}${pt([cx, cy - r])}Z`;
}

/** A ring of the given thickness, centered on radius `r`. */
export function annulus(cx: number, cy: number, r: number, thickness: number): string {
  return circle(cx, cy, r + thickness / 2) + circle(cx, cy, r - thickness / 2, true);
}

/** The part of a ring between two angles. Must span less than half a turn. */
export function arcBand(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
  return (
    `M${pt(polar(cx, cy, rOut, a0))}A${num(rOut)} ${num(rOut)} 0 0 1 ${pt(polar(cx, cy, rOut, a1))}` +
    `L${pt(polar(cx, cy, rIn, a1))}A${num(rIn)} ${num(rIn)} 0 0 0 ${pt(polar(cx, cy, rIn, a0))}Z`
  );
}

/** `count` evenly spaced dashes, the first starting at the top. `duty` is the drawn share. */
export function dashedRing(
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  count: number,
  duty: number,
): string {
  const span = (2 * Math.PI) / count;
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = i * span - Math.PI / 2;
    d += arcBand(cx, cy, r - thickness / 2, r + thickness / 2, a, a + span * duty);
  }
  return d;
}

/** A radial bar: straight sides at `a` ± `halfAngle`, so it widens with radius. */
export function radialBar(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a: number,
  halfAngle: number,
): string {
  const [inner, outer] = r0 < r1 ? [r0, r1] : [r1, r0];
  return polygon([
    polar(cx, cy, inner, a - halfAngle),
    polar(cx, cy, outer, a - halfAngle),
    polar(cx, cy, outer, a + halfAngle),
    polar(cx, cy, inner, a + halfAngle),
  ]);
}

/** A polyline drawn `width` wide with butt ends and mitered corners. */
export function strokePolyline(points: readonly Point[], width: number): string {
  const h = width / 2;
  const left: Point[] = [];
  const right: Point[] = [];
  const normals: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    normals.push([(y1 - y0) / len, -(x1 - x0) / len]);
  }
  points.forEach(([x, y], i) => {
    const a = normals[Math.max(0, i - 1)]!;
    const b = normals[Math.min(normals.length - 1, i)]!;
    const mx = a[0] + b[0];
    const my = a[1] + b[1];
    // The miter that keeps both edges h away; capped so a hairpin cannot spike.
    const k = Math.min(h * (2 / Math.max(mx * mx + my * my, 1e-9)), h * 4);
    left.push([x + mx * k, y + my * k]);
    right.push([x - mx * k, y - my * k]);
  });
  // Left of travel is counter-clockwise in y-down, so walk it first for a clockwise outline.
  return polygon([...left, ...right.reverse()]);
}

export function thinQuad(p0: Point, p1: Point, width: number): string {
  return strokePolyline([p0, p1], width);
}

/** A straight line with round caps. */
export function capsule(p0: Point, p1: Point, width: number): string {
  const r = width / 2;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const nx = ((p1[1] - p0[1]) / len) * r;
  const ny = (-(p1[0] - p0[0]) / len) * r;
  const arc = `A${num(r)} ${num(r)} 0 0 1 `;
  return (
    `M${pt([p0[0] + nx, p0[1] + ny])}L${pt([p1[0] + nx, p1[1] + ny])}` +
    `${arc}${pt([p1[0] - nx, p1[1] - ny])}L${pt([p0[0] - nx, p0[1] - ny])}` +
    `${arc}${pt([p0[0] + nx, p0[1] + ny])}Z`
  );
}

/** Round dots of `diameter`, spaced about `pitch` apart along a polyline. */
export function dotsAlong(points: readonly Point[], diameter: number, pitch: number, closed: boolean): string {
  const path = closed ? [...points, points[0]!] : points;
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const gaps = Math.max(1, Math.round(total / pitch));
  const step = total / gaps;
  let d = '';
  let segment = 0;
  let walked = 0;
  // On a closed curve the last dot would land on the first.
  for (let i = 0; i < gaps + (closed ? 0 : 1); i++) {
    const at = i * step;
    while (segment < lengths.length - 1 && walked + lengths[segment]! < at) walked += lengths[segment++]!;
    const f = lengths[segment]! > 0 ? Math.min(1, (at - walked) / lengths[segment]!) : 0;
    const [x0, y0] = path[segment]!;
    const [x1, y1] = path[segment + 1]!;
    d += circle(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, diameter / 2);
  }
  return d;
}

/** The lit part of a Moon of radius `r`, or '' when too little is lit to engrave.
 *
 *  Lit on the left it winds counter-clockwise, so it needs a path to itself.
 *
 *  @param litOnRight waxing as seen from the northern hemisphere, waning from the southern. */
export function moonLit(cx: number, cy: number, r: number, fraction: number, litOnRight: boolean): string {
  if (fraction < 0.006) return '';
  if (fraction > 0.994) return circle(cx, cy, r);
  // Clamped so neither a thin crescent nor the dark sliver of a near-full Moon gets too
  // narrow to engrave (about 0.4 mm).
  const rx = Math.min(Math.abs(1 - 2 * fraction) * r, r - 1.8 * (r / 16));
  const crescent = fraction < 0.5;
  const limb = litOnRight ? 1 : 0;
  const terminator = litOnRight === crescent ? 0 : 1;
  // At the quarters the terminator is straight, which an arc of zero radius only implies.
  const back = rx < 0.01 ? 'L' : `A${num(rx)} ${num(r)} 0 0 ${terminator} `;
  return `M${pt([cx, cy - r])}A${num(r)} ${num(r)} 0 0 ${limb} ${pt([cx, cy + r])}${back}${pt([cx, cy - r])}Z`;
}
