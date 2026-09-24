// The space a curved wall closes in: its floor, its ceiling and the roof over it.
//
// A curved wall bows out from a straight line (its chord) joining its two ends. The space
// between the arc and the chord is a room of its own shape: it gets a floor, a flat ceiling at
// the top of the wall, and a roof that follows the curve round. A cone rises from the curved
// eave to the chord, like the roof of a bay or a turret; two curves set back to back make a
// round tower with a full cone on top.
import { arcOf } from './curve';
import { WALL_H, type CurveRoof, type Item } from './model';
import { toWorld, type Rect } from './stairs';

/** The curve's circle, in the piece's own frame: center (cu, r), and the chord at v = D. */
export function curveCircle(i: Item) {
  const a = arcOf(i);
  return { cu: a.cu, r: a.r, D: a.D, half: a.half };
}

/** Points round the arc at radius rad from the center, from one end of the chord to the other. */
export function arcOutline(i: Item, rad: number, n = 32): [number, number][] {
  const { cu, r, D } = curveCircle(i);
  // Where a circle of this radius crosses the chord line.
  const reach = rad > r - D ? Math.acos(Math.min(1, (r - D) / rad)) : 0;
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const f = -reach + (2 * reach * k) / n;
    out.push([cu + rad * Math.sin(f), r - rad * Math.cos(f)]);
  }
  return out;
}

/** The floor inside a curve, as plan rectangles, for walking on. */
export function curveFloor(i: Item, strips = 12): Rect[] {
  const { cu, r, D, half } = curveCircle(i);
  const u0 = cu - r * Math.sin(half),
    u1 = cu + r * Math.sin(half);
  const out: Rect[] = [];
  for (let k = 0; k < strips; k++) {
    const a = u0 + ((u1 - u0) * k) / strips,
      b = u0 + ((u1 - u0) * (k + 1)) / strips;
    // The arc is furthest out in the middle, so the strip's edge nearer the ends sets its depth.
    const far = Math.max(Math.abs(a - cu), Math.abs(b - cu));
    const v = r - Math.sqrt(Math.max(0, r * r - far * far));
    if (D - v < 0.05) continue;
    const [x0, z0] = toWorld(i, a, v),
      [x1, z1] = toWorld(i, b, D);
    out.push({
      x0: Math.min(x0, x1),
      z0: Math.min(z0, z1),
      x1: Math.max(x0, x1),
      z1: Math.max(z0, z1),
    });
  }
  return out;
}

/**
 * The roof over a curve as a grid of points (u, height, v) in the piece's own frame: rows run
 * in from the eave to the chord along lines from the circle's center. `eave` is the height of the
 * wall top; the roof hangs `ov` past the wall.
 */
export function curveRoofGrid(
  i: Item,
  kind: Exclude<CurveRoof, 'flat'>,
  ov: number,
  tan: number,
  eave = WALL_H,
  n = 32,
  m = 8,
) {
  const { cu, r, D } = curveCircle(i);
  const R = r + ov;
  const reach = Math.acos(Math.min(1, (r - D) / R));
  const lift = kind === 'dome' ? Math.max(0.6, r * 0.62) : 0;
  const height = (rho: number) => {
    if (kind === 'cone') return eave + (r - rho) * tan;
    if (rho >= r) return eave - (rho - r) * 0.5;
    return eave + lift * Math.sqrt(Math.max(0, 1 - (rho / r) ** 2));
  };
  const rows: [number, number, number][][] = [];
  for (let k = 0; k <= n; k++) {
    const f = -reach + (2 * reach * k) / n;
    const c = Math.cos(f);
    // In along this line until it meets the chord (or the center, for a half round).
    const inner = r - D < 1e-6 || c < 1e-6 ? 0 : Math.min(R, (r - D) / c);
    const row: [number, number, number][] = [];
    for (let j = 0; j <= m; j++) {
      const rho = R + ((inner - R) * j) / m;
      row.push([cu + rho * Math.sin(f), height(rho), r - rho * c]);
    }
    rows.push(row);
  }
  // Along the chord, the height of the roof, for closing in the end against the house.
  const chord = (u: number) => height(Math.hypot(u - cu, r - D));
  return { rows, chord, top: height(r - D) };
}
