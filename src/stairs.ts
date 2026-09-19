// Stair geometry shared by the 2D plan, the 3D model, and walkthrough physics.
//
// Each style is laid out in a local frame: u runs across (0..LW), v runs front-to-back
// (0..LD), and at rotation 0 you climb heading toward v = 0 (north on the plan). The
// item's rotation turns that frame in quarter turns clockwise.
import { FLOOR_H, stairLevels, type Item, type StairStyle } from './model';

export const RISERS = 16;
export const RISE = FLOOR_H / RISERS;
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Tread {
  /** 1..RISERS-1: the tread's top sits at k × RISE above the lower floor. */
  k: number;
  rect?: Rect;
  /** Spiral wedges, in radians. Point = (cu + r·sinφ, cv + r·cosφ). */
  wedge?: { cu: number; cv: number; r0: number; r1: number; a0: number; a1: number };
}
export interface Segment {
  a: [number, number];
  b: [number, number];
}
export interface StairLayout {
  LW: number;
  LD: number;
  treads: Tread[];
  /** Areas cut out of the upper floor. */
  holes: Rect[];
  /** Guard rails around the opening on the upper floor. */
  rails: Segment[];
  /** Full-height dividers between flights. */
  dividers: Segment[];
  /** Plan arrow from the bottom step to the top. */
  path: [number, number][];
  /** Spiral center pole. */
  pole?: { u: number; v: number; r: number };
}
const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
const S = (a: [number, number], b: [number, number]): Segment => ({ a, b });

export function localSize(i: Item) {
  return i.rotation % 180 === 0 ? { LW: i.w, LD: i.d } : { LW: i.d, LD: i.w };
}

export function stairLayout(style: StairStyle, LW: number, LD: number): StairLayout {
  const treads: Tread[] = [];
  const n = RISERS - 1;
  if (style === 'l') {
    const fw = Math.min(LW, LD) * 0.345,
      a = Math.floor(n / 2),
      b = n - a - 1,
      run1 = (LD - fw) / a,
      run2 = (LW - fw) / b;
    for (let k = 1; k <= a; k++)
      treads.push({ k, rect: R(0, LD - k * run1, fw, LD - (k - 1) * run1) });
    treads.push({ k: a + 1, rect: R(0, 0, fw, fw) });
    for (let j = 1; j <= b; j++)
      treads.push({ k: a + 1 + j, rect: R(fw + (j - 1) * run2, 0, fw + j * run2, fw) });
    return {
      LW,
      LD,
      treads,
      holes: [R(0, 0, LW, LD)],
      rails: [S([0, 0], [LW, 0]), S([0, 0], [0, LD]), S([0, LD], [LW, LD]), S([LW, fw], [LW, LD])],
      dividers: [],
      path: [
        [fw / 2, LD - 0.25],
        [fw / 2, fw / 2],
        [LW - 0.2, fw / 2],
      ],
    };
  }
  if (style === 'u') {
    const half = LW / 2,
      ld = Math.min(half, LD * 0.35),
      a = Math.floor(n / 2),
      b = n - a - 1,
      run1 = (LD - ld) / a,
      run2 = (LD - ld) / b;
    for (let k = 1; k <= a; k++)
      treads.push({ k, rect: R(0, LD - k * run1, half, LD - (k - 1) * run1) });
    treads.push({ k: a + 1, rect: R(0, 0, LW, ld) });
    for (let j = 1; j <= b; j++)
      treads.push({ k: a + 1 + j, rect: R(half, ld + (j - 1) * run2, LW, ld + j * run2) });
    return {
      LW,
      LD,
      treads,
      holes: [R(0, 0, LW, LD)],
      rails: [S([0, 0], [LW, 0]), S([0, 0], [0, LD]), S([LW, 0], [LW, LD]), S([0, LD], [half, LD])],
      dividers: [S([half, ld], [half, LD])],
      path: [
        [half / 2, LD - 0.25],
        [half / 2, ld / 2],
        [half + half / 2, ld / 2],
        [half + half / 2, LD - 0.2],
      ],
    };
  }
  if (style === 'spiral') {
    const cu = LW / 2,
      cv = LD / 2,
      r1 = Math.min(LW, LD) / 2,
      sweep = (Math.PI * 3) / 2,
      step = sweep / n;
    for (let k = 1; k <= n; k++)
      treads.push({ k, wedge: { cu, cv, r0: 0.09, r1, a0: (k - 1) * step, a1: k * step } });
    const path: [number, number][] = [];
    for (let a = step / 2; a <= sweep - step / 2 + 1e-6; a += step / 2)
      path.push([cu + r1 * 0.62 * Math.sin(a), cv + r1 * 0.62 * Math.cos(a)]);
    return {
      LW,
      LD,
      treads,
      // The south-west quarter stays as floor: it is the landing you step onto at the top.
      holes: [R(0, 0, LW, cv), R(cu, cv, LW, LD)],
      rails: [
        S([0, 0], [LW, 0]),
        S([LW, 0], [LW, LD]),
        S([0, 0], [0, cv]),
        S([cu, LD], [LW, LD]),
        S([cu, cv], [cu, LD]),
      ],
      dividers: [],
      path,
      pole: { u: cu, v: cv, r: 0.07 },
    };
  }
  const run = LD / n;
  for (let k = 1; k <= n; k++) treads.push({ k, rect: R(0, LD - k * run, LW, LD - (k - 1) * run) });
  return {
    LW,
    LD,
    treads,
    holes: [R(0, 0, LW, LD)],
    rails: [S([0, 0], [0, LD]), S([LW, 0], [LW, LD]), S([0, LD], [LW, LD])],
    dividers: [],
    path: [
      [LW / 2, LD - 0.25],
      [LW / 2, 0.2],
    ],
  };
}

export function layoutFor(i: Item) {
  const { LW, LD } = localSize(i);
  return stairLayout(i.style || 'straight', LW, LD);
}

/** Local (u, v) → plan (x, z). */
export function toWorld(i: Item, u: number, v: number): [number, number] {
  switch (i.rotation) {
    case 90:
      return [i.x + i.w - v, i.z + u];
    case 180:
      return [i.x + i.w - u, i.z + i.d - v];
    case 270:
      return [i.x + v, i.z + i.d - u];
    default:
      return [i.x + u, i.z + v];
  }
}
/** Plan (x, z) → local (u, v). */
export function toLocal(i: Item, x: number, z: number): [number, number] {
  switch (i.rotation) {
    case 90:
      return [z - i.z, i.x + i.w - x];
    case 180:
      return [i.x + i.w - x, i.z + i.d - z];
    case 270:
      return [i.z + i.d - z, x - i.x];
    default:
      return [x - i.x, z - i.z];
  }
}
export function rectToWorld(i: Item, r: Rect): Rect {
  const [ax, az] = toWorld(i, r.x0, r.z0),
    [bx, bz] = toWorld(i, r.x1, r.z1);
  return R(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
}

/** Which tread (if any) is under a local point. */
export function treadAt(layout: StairLayout, u: number, v: number): Tread | undefined {
  for (const t of layout.treads) {
    if (t.rect) {
      const r = t.rect;
      if (u >= r.x0 && u <= r.x1 && v >= r.z0 && v <= r.z1) return t;
    } else if (t.wedge) {
      const w = t.wedge,
        du = u - w.cu,
        dv = v - w.cv,
        dist = Math.hypot(du, dv);
      if (dist > w.r1 || dist < w.r0) continue;
      let a = Math.atan2(du, dv);
      if (a < 0) a += Math.PI * 2;
      if (a >= w.a0 && a < w.a1) return t;
    }
  }
  return undefined;
}

/** Height of the walkable stair surface under a plan point, in meters above ground level. */
export function stairHeightAt(i: Item, x: number, z: number): number | undefined {
  const [u, v] = toLocal(i, x, z);
  const { LW, LD } = localSize(i);
  if (u < 0 || v < 0 || u > LW || v > LD) return undefined;
  const t = treadAt(layoutFor(i), u, v);
  if (!t) return undefined;
  return stairLevels(i).lower * FLOOR_H + t.k * RISE;
}

/** Subtracts rectangles from a rectangle, returning the remaining axis-aligned pieces. */
export function subtractRects(base: Rect, cuts: Rect[]): Rect[] {
  let pieces = [base];
  for (const c of cuts) {
    const next: Rect[] = [];
    for (const p of pieces) {
      if (c.x1 <= p.x0 || c.x0 >= p.x1 || c.z1 <= p.z0 || c.z0 >= p.z1) {
        next.push(p);
        continue;
      }
      const ix0 = Math.max(p.x0, c.x0),
        ix1 = Math.min(p.x1, c.x1);
      if (c.z0 > p.z0) next.push(R(p.x0, p.z0, p.x1, c.z0));
      if (c.z1 < p.z1) next.push(R(p.x0, c.z1, p.x1, p.z1));
      const z0 = Math.max(p.z0, c.z0),
        z1 = Math.min(p.z1, c.z1);
      if (ix0 > p.x0) next.push(R(p.x0, z0, ix0, z1));
      if (ix1 < p.x1) next.push(R(ix1, z0, p.x1, z1));
    }
    pieces = next.filter((r) => r.x1 - r.x0 > 0.005 && r.z1 - r.z0 > 0.005);
  }
  return pieces;
}
