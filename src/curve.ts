// Curved walls: a bowed wall the plan, the 3D model, and the walkthrough all share.
//
// The arc is drawn inside the piece's footprint: it springs from the two back corners
// and bows out to the middle of the front edge. A wider footprint makes a longer wall,
// a deeper one a rounder bow (half-round when the depth is half the width).
import { isPassable, type Item, type Opening } from './model';
import { localSize } from './stairs';

export interface Arc {
  /** Radius, and the center in the piece's own frame. */
  r: number;
  cu: number;
  cv: number;
  /** Half the sweep, in radians. */
  half: number;
  /** Length along the curve, in meters. */
  length: number;
  W: number;
  D: number;
}

export function arcOf(i: Item): Arc {
  const { LW: W, LD: D } = localSize(i);
  const bow = Math.max(0.08, Math.min(D, W));
  const r = (W * W) / 4 / (2 * bow) + bow / 2;
  return {
    r,
    cu: W / 2,
    cv: r,
    half: Math.atan2(W / 2, r - bow),
    length: 2 * Math.atan2(W / 2, r - bow) * r,
    W,
    D: bow,
  };
}

/** A point along the curve: 0 at one end, 1 at the other. Returns local u, v and the angle. */
export function pointAt(a: Arc, t: number): [number, number, number] {
  const f = -a.half + 2 * a.half * t;
  return [a.cu + a.r * Math.sin(f), a.cv - a.r * Math.cos(f), f];
}

export interface CurvePiece {
  /** Midpoint and facing of this short length of wall. */
  u: number;
  v: number;
  angle: number;
  len: number;
  /** What the wall does here: solid, a window, or a way through. */
  fill: 'solid' | 'window' | 'gap';
}

/** Chops the curve into short straight lengths, marking where openings fall. */
export function curvePieces(i: Item, openings: Opening[], steps?: number): CurvePiece[] {
  const a = arcOf(i);
  const n = steps ?? Math.max(10, Math.min(56, Math.round(a.length / 0.18)));
  const mine = openings.filter((o) => o.roomId === i.id);
  const pieces: CurvePiece[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n,
      t1 = (k + 1) / n,
      mid = (t0 + t1) / 2;
    const [u, v, angle] = pointAt(a, mid);
    const open = mine.find((o) => {
      const halfT = o.width / 2 / a.length;
      return mid > o.offset - halfT && mid < o.offset + halfT;
    });
    pieces.push({
      u,
      v,
      angle,
      len: (a.length / n) * 1.12,
      fill: !open
        ? 'solid'
        : open.kind === 'window'
          ? 'window'
          : isPassable(open.kind)
            ? 'gap'
            : 'solid',
    });
  }
  return pieces;
}

/** How far a plan point sits from the curve, and where along it that is. */
export function nearestOnCurve(i: Item, x: number, z: number) {
  const a = arcOf(i);
  const rot = ((i.rotation % 360) + 360) % 360;
  // Bring the point into the piece's own frame.
  const local = (): [number, number] => {
    switch (rot) {
      case 90:
        return [z - i.z, i.x + i.w - x];
      case 180:
        return [i.x + i.w - x, i.z + i.d - z];
      case 270:
        return [i.z + i.d - z, x - i.x];
      default:
        return [x - i.x, z - i.z];
    }
  };
  const [u, v] = local();
  const du = u - a.cu,
    dv = v - a.cv;
  const dist = Math.hypot(du, dv);
  let f = Math.atan2(du, -dv);
  f = Math.max(-a.half, Math.min(a.half, f));
  const t = (f + a.half) / (2 * a.half);
  const [pu, pv] = pointAt(a, t);
  return { t, distance: Math.hypot(u - pu, v - pv), off: Math.abs(dist - a.r) };
}
