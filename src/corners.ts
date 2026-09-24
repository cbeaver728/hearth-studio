// Rounded room corners: a quarter circle of wall where two sides would meet, shared by the plan,
// the 3D model and the walkthrough.
import { CORNERS, cornerRadius, isRoom, type Corner, type Item, type Project } from './model';

export interface CornerArc {
  room: Item;
  corner: Corner;
  /** Center of the curve, in plan meters. */
  cx: number;
  cz: number;
  r: number;
  /** The curve runs from angle a0 to a1; a point is (cx + r cos a, cz + r sin a). */
  a0: number;
  a1: number;
}

export function cornerArc(room: Item, corner: Corner): CornerArc | null {
  const r = cornerRadius(room, corner);
  if (r < 0.05) return null;
  const { x, z, w, d } = room;
  const [cx, cz, a0] =
    corner === 'nw'
      ? [x + r, z + r, Math.PI]
      : corner === 'ne'
        ? [x + w - r, z + r, Math.PI * 1.5]
        : corner === 'se'
          ? [x + w - r, z + d - r, 0]
          : [x + r, z + d - r, Math.PI / 2];
  return { room, corner, cx, cz, r, a0, a1: a0 + Math.PI / 2 };
}

export const cornerArcs = (p: Project) =>
  p.items
    .filter((i) => isRoom(i) && i.radius)
    .flatMap((room) => CORNERS.map((c) => cornerArc(room, c)))
    .filter(Boolean) as CornerArc[];

/** Short straight lengths following the curve: midpoint, direction and length of each. */
export function arcPieces(arc: CornerArc) {
  const n = Math.max(4, Math.ceil(arc.r * 8));
  const out: { x: number; z: number; angle: number; len: number; normal: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = arc.a0 + ((arc.a1 - arc.a0) * k) / n,
      t1 = arc.a0 + ((arc.a1 - arc.a0) * (k + 1)) / n;
    const x0 = arc.cx + arc.r * Math.cos(t0),
      z0 = arc.cz + arc.r * Math.sin(t0),
      x1 = arc.cx + arc.r * Math.cos(t1),
      z1 = arc.cz + arc.r * Math.sin(t1);
    out.push({
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      angle: Math.atan2(z1 - z0, x1 - x0),
      // Slightly long, so neighbouring pieces overlap and leave no chinks.
      len: Math.hypot(x1 - x0, z1 - z0) + 0.04,
      normal: (t0 + t1) / 2,
    });
  }
  return out;
}

/** SVG path of a room's outline, with its rounded corners. */
export function roomPath(room: Item) {
  const { x, z, w, d } = room;
  const r = (c: Corner) => cornerRadius(room, c);
  const [nw, ne, se, sw] = [r('nw'), r('ne'), r('se'), r('sw')];
  const arc = (rad: number, ex: number, ez: number) =>
    rad ? `A${rad} ${rad} 0 0 1 ${ex} ${ez}` : '';
  return [
    `M${x + nw} ${z}`,
    `L${x + w - ne} ${z}`,
    arc(ne, x + w, z + ne),
    `L${x + w} ${z + d - se}`,
    arc(se, x + w - se, z + d),
    `L${x + sw} ${z + d}`,
    arc(sw, x, z + d - sw),
    `L${x} ${z + nw}`,
    arc(nw, x + nw, z),
    'Z',
  ].join('');
}
