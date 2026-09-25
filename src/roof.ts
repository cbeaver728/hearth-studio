// Roof layout shared by the 3D model, the walkthrough and the plan.
//
// Rooms are grouped into buildings (rooms that touch or stack). Each building's top floor is
// split into rectangular wings; the biggest takes the main ridge and the rest run their ridges
// out at right angles, their roofs carrying on into the main one until they meet it in a valley.
// Lower parts with nothing above get a roof of their own.
//
// With a Cape Cod roof, a top floor built over another storey lives inside the roof: the eaves
// come down to knee walls and the ceiling slopes up to a flat middle. Dormers push out through
// the slope to make room to stand at a window.
import {
  CAPE_CEIL,
  FLOOR_H,
  KNEE,
  ceilingHeight,
  halfStorey,
  isRoom,
  type Item,
  type Project,
} from './model';
import { subtractRects, type Rect } from './stairs';
import { cornerArcs } from './corners';
import type { Corner } from './model';

export const CAPE_TAN = 1.2;
/** Cape dormers sit a little way up the slope, with roof running below them. */
export const DORMER_SETBACK = 0.4;
/** You can stand where the ceiling is at least this high. */
export const HEADROOM = 1.95;
export const OVERHANG = 0.3;
export const ROOF_T = 0.12;
/** Horizontal distance from a Cape eave to where the sloping ceiling levels off. */
export const collarRun = (tan: number) => (CAPE_CEIL - KNEE) / tan;

export type Edge = 'x0' | 'x1' | 'z0' | 'z1';
export interface Wing {
  rect: Rect;
  /** The floor whose rooms this roof covers. */
  level: number;
  /** Which way the ridge runs. */
  axis: 'x' | 'z';
  /** A half storey inside the roof. */
  cape: boolean;
  flat: boolean;
  /** World height of the underside of the roof at the eaves. */
  base: number;
  /** Rise per meter across. */
  tan: number;
  /** The end joined to the rest of the building: no overhang and no gable wall there. */
  joined?: Edge;
  /** How far past its joined end the roof carries on into the neighbour, to the valley. */
  reach: number;
  /** The top floor of its building; lower wings sit against taller walls. */
  top: boolean;
  /** Corners of the wing where the rooms below are rounded, and by how much. */
  round: Partial<Record<Corner, number>>;
  /**
   * Gable: two slopes and a wall at each free end. Hip: the free ends slope too. Gambrel: each
   * side breaks halfway up, steep below and gentle above, like a barn.
   */
  shape: 'gable' | 'hip' | 'gambrel';
  /** A gambrel's break, in from the eave: shared across a roof so its valleys stay true. */
  bend?: number;
}
export interface Dormer {
  item: Item;
  wing: number;
  /** Which eave it sits on: the low or high side across the ridge. */
  side: 'lo' | 'hi';
  a0: number;
  a1: number;
  /** How far in from the eave the dormer reaches. */
  depth: number;
  /** How far up the slope its face sits. */
  setback: number;
}
export interface RoofPlan {
  wings: Wing[];
  dormers: Dormer[];
}

// --- Wing geometry --------------------------------------------------------------------------

/** Distances along the ridge (a) and across it (c) for a wing. */
export const alongRange = (w: Wing): [number, number] =>
  w.axis === 'x' ? [w.rect.x0, w.rect.x1] : [w.rect.z0, w.rect.z1];
export const crossRange = (w: Wing): [number, number] =>
  w.axis === 'x' ? [w.rect.z0, w.rect.z1] : [w.rect.x0, w.rect.x1];
export const halfSpan = (w: Wing) => (crossRange(w)[1] - crossRange(w)[0]) / 2;
const aOf = (w: Wing, x: number, z: number) => (w.axis === 'x' ? x : z);
const cOf = (w: Wing, x: number, z: number) => (w.axis === 'x' ? z : x);
/** Plan point from along-ridge distance and horizontal distance in from one eave. */
export function wingPoint(w: Wing, side: 'lo' | 'hi', a: number, s: number): [number, number] {
  const [c0, c1] = crossRange(w);
  const c = side === 'lo' ? c0 + s : c1 - s;
  return w.axis === 'x' ? [a, c] : [c, a];
}
/** The along-ridge stretch a wing's roof covers, including the run on into a neighbour. */
function roofAlong(w: Wing): [number, number] {
  const [a0, a1] = alongRange(w);
  const lo = w.joined === (w.axis === 'x' ? 'x0' : 'z0') ? a0 - w.reach : a0;
  const hi = w.joined === (w.axis === 'x' ? 'x1' : 'z1') ? a1 + w.reach : a1;
  return [lo, hi];
}
/** Where a gambrel's slope breaks, as a share of the way from eave to ridge. */
export const GAMBREL_BREAK = 0.5;
/** How much steeper a gambrel's lower slope is than its upper one. */
export const GAMBREL_STEEP = 3;
/** Height of a wing's roof above its eaves, a horizontal distance s in from an eave. */
export function rise(w: Wing, s: number) {
  if (w.shape !== 'gambrel') return s * w.tan;
  const b = Math.min(halfSpan(w), w.bend ?? halfSpan(w) * GAMBREL_BREAK);
  return s <= b ? s * w.tan * GAMBREL_STEEP : b * w.tan * GAMBREL_STEEP + (s - b) * w.tan;
}
/** The ends of a wing that slope down (hip) rather than standing as gable walls. */
export function hippedEnds(w: Wing): { lo: boolean; hi: boolean } {
  if (w.shape !== 'hip') return { lo: false, hi: false };
  return {
    lo: w.joined !== (w.axis === 'x' ? 'x0' : 'z0'),
    hi: w.joined !== (w.axis === 'x' ? 'x1' : 'z1'),
  };
}
/** Height of the underside of a wing's roof over a plan point, or undefined if it isn't over it. */
export function undersideAt(w: Wing, x: number, z: number): number | undefined {
  if (w.flat) return undefined;
  const [c0, c1] = crossRange(w);
  const [lo, hi] = roofAlong(w);
  const a = aOf(w, x, z),
    c = cOf(w, x, z);
  if (a < lo - 1e-6 || a > hi + 1e-6 || c < c0 - 1e-6 || c > c1 + 1e-6) return undefined;
  let d = Math.min(c - c0, c1 - c);
  // Past the joined end, the roof only shows where it rises above the neighbour's.
  const [a0, a1] = alongRange(w);
  const past = a < a0 ? a0 - a : a > a1 ? a - a1 : 0;
  if (past > d + 1e-6) return undefined;
  // A hipped end slopes down just like the sides.
  const hips = hippedEnds(w);
  if (hips.lo) d = Math.min(d, a - a0);
  if (hips.hi) d = Math.min(d, a1 - a);
  return w.base + rise(w, Math.max(0, d));
}

// --- Building the plan -----------------------------------------------------------------------

const EPS = 0.02;
const touches = (a: Rect, b: Rect) => {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (ox > EPS && oz > -EPS) || (oz > EPS && ox > -EPS);
};
const rectOf = (i: Item): Rect => ({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d });
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);

/** Splits the union of some rectangles into as few big rectangles as a greedy pass finds. */
export function decompose(rects: Rect[]): Rect[] {
  if (!rects.length) return [];
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]).map((n) => +n.toFixed(4)))].sort(
    (a, b) => a - b,
  );
  const zs = [...new Set(rects.flatMap((r) => [r.z0, r.z1]).map((n) => +n.toFixed(4)))].sort(
    (a, b) => a - b,
  );
  const nx = xs.length - 1,
    nz = zs.length - 1;
  const free: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    free.push([]);
    for (let j = 0; j < nz; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2,
        cz = (zs[j] + zs[j + 1]) / 2;
      free[i].push(rects.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1));
    }
  }
  const out: Rect[] = [];
  for (;;) {
    // Prefix sums of free cells so any block can be checked in constant time.
    const sum: number[][] = Array.from({ length: nx + 1 }, () => new Array(nz + 1).fill(0));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        sum[i + 1][j + 1] = (free[i][j] ? 1 : 0) + sum[i][j + 1] + sum[i + 1][j] - sum[i][j];
    let best: [number, number, number, number] | null = null,
      bestArea = 0;
    for (let i0 = 0; i0 < nx; i0++)
      for (let i1 = i0 + 1; i1 <= nx; i1++)
        for (let j0 = 0; j0 < nz; j0++)
          for (let j1 = j0 + 1; j1 <= nz; j1++) {
            const cells = (i1 - i0) * (j1 - j0);
            const filled = sum[i1][j1] - sum[i0][j1] - sum[i1][j0] + sum[i0][j0];
            if (filled !== cells) break;
            const a = (xs[i1] - xs[i0]) * (zs[j1] - zs[j0]);
            if (a > bestArea + 1e-9) {
              bestArea = a;
              best = [i0, i1, j0, j1];
            }
          }
    if (!best) break;
    const [i0, i1, j0, j1] = best;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) free[i][j] = false;
    out.push({ x0: xs[i0], x1: xs[i1], z0: zs[j0], z1: zs[j1] });
  }
  return out;
}

/** Which edge of `a` lies against `b`, if any. */
function sharedEdge(a: Rect, b: Rect): Edge | undefined {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (oz > 0.1 && Math.abs(a.x0 - b.x1) < EPS) return 'x0';
  if (oz > 0.1 && Math.abs(a.x1 - b.x0) < EPS) return 'x1';
  if (ox > 0.1 && Math.abs(a.z0 - b.z1) < EPS) return 'z0';
  if (ox > 0.1 && Math.abs(a.z1 - b.z0) < EPS) return 'z1';
  return undefined;
}
const axisAcross = (e: Edge): 'x' | 'z' => (e === 'x0' || e === 'x1' ? 'x' : 'z');
const longer = (r: Rect): 'x' | 'z' => (r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z');
const PITCH = { low: 0.62, medium: 1, steep: 1.5 };
const gableTan = (half: number, pitch: keyof typeof PITCH = 'medium') =>
  Math.min(0.46, 2.2 / Math.max(half, 0.1)) * PITCH[pitch];

const cache = new WeakMap<Project, RoofPlan>();
/** The roof for a project. Projects are replaced, not changed, so each one is worked out once. */
export function planRoof(p: Project): RoofPlan {
  let plan = cache.get(p);
  if (!plan) cache.set(p, (plan = computeRoof(p)));
  return plan;
}
function computeRoof(p: Project): RoofPlan {
  const rooms = p.items.filter((i) => isRoom(i) && i.floor >= 0);
  // Buildings: rooms that touch side by side or stack.
  const parent = rooms.map((_, n) => n);
  const find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])));
  for (let a = 0; a < rooms.length; a++)
    for (let b = a + 1; b < rooms.length; b++) {
      const ra = rooms[a],
        rb = rooms[b];
      if (Math.abs(ra.floor - rb.floor) > 1) continue;
      if (touches(rectOf(ra), rectOf(rb))) parent[find(a)] = find(b);
    }
  const groups = new Map<number, Item[]>();
  rooms.forEach((r, n) => groups.set(find(n), [...(groups.get(find(n)) || []), r]));
  const buildings = [...groups.values()].sort(
    (a, b) =>
      b.reduce((s, r) => s + r.w * r.d, 0) - a.reduce((s, r) => s + r.w * r.d, 0) ||
      a[0].id.localeCompare(b[0].id),
  );

  const wings: Wing[] = [];
  buildings.forEach((members, bi) => {
    const top = Math.max(...members.map((r) => r.floor));
    const levelsHere = [...new Set(members.map((r) => r.floor))].sort((a, b) => b - a);
    for (const level of levelsHere) {
      const here = members.filter((r) => r.floor === level);
      const above = members.filter((r) => r.floor === level + 1).map(rectOf);
      const isTop = level === top;
      const cape = isTop && here.some((r) => halfStorey(p, r));
      const height = (r: Item) => (cape ? KNEE : Math.round(ceilingHeight(p, r) * 100) / 100);
      const base = (rs: Item[]) => level * FLOOR_H + Math.max(...rs.map(height), 0);
      // Rooms with different ceiling heights get roofs of their own, tallest first, so a lower
      // room's roof sits on its own walls and butts against the taller part, rather than the
      // whole floor riding at the tallest room's height.
      const heights = [...new Set(here.map(height))].sort((a, b) => b - a);
      const exposed = heights.flatMap((h) =>
        decompose(
          here.filter((r) => height(r) === h).flatMap((r) => subtractRects(rectOf(r), above)),
        ).map((rect) => ({ rect, h })),
      );
      const firstOfLevel = wings.length;
      exposed.forEach(({ rect, h }, n) => {
        const group = here.filter((r) => height(r) === h);
        const covering = group.filter(
          (r) => touches(rectOf(r), rect) && area(r2(rectOf(r), rect)) > 0.01,
        );
        // A leftover strip beside rooms that do have something above gets a flat roof.
        const partlyCovered =
          !isTop && covering.some((r) => above.some((a) => area(r2(rectOf(r), a)) > 0.01));
        const flat = p.roofStyle === 'flat' || partlyCovered;
        let axis: 'x' | 'z';
        let joined: Edge | undefined;
        if (isTop && n === 0) {
          axis = bi === 0 ? p.roofAxis || 'z' : longer(rect);
        } else {
          // Join the earlier wing (or the taller part) it butts against, gable facing out.
          const taller = wings.slice(firstOfLevel).map((w) => w.rect);
          const neighbours = isTop
            ? taller
            : [...above, ...members.filter((r) => r.floor > level).map(rectOf), ...taller];
          joined = neighbours.map((nb) => sharedEdge(rect, nb)).find(Boolean);
          axis = joined ? axisAcross(joined) : longer(rect);
        }
        const w: Wing = {
          rect,
          level,
          axis,
          cape,
          flat,
          base: base(covering.length ? covering : group),
          tan: 0,
          joined,
          reach: 0,
          top: isTop,
          round: {},
          shape: p.roofStyle === 'hip' ? 'hip' : p.roofStyle === 'gambrel' ? 'gambrel' : 'gable',
        };
        wings.push(w);
      });
      // One pitch per roof so the valleys meet cleanly.
      const mine = wings.slice(firstOfLevel);
      if (!mine.length) continue;
      if (isTop) {
        const tan = cape ? CAPE_TAN : gableTan(halfSpan(mine[0]), p.roofPitch);
        for (const w of mine) {
          w.tan = tan;
          w.bend = halfSpan(mine[0]) * GAMBREL_BREAK;
        }
        for (const w of mine.slice(1)) {
          if (!w.joined) continue;
          const host = mine.find((o) => o !== w && sharedEdge(w.rect, o.rect) === w.joined);
          // Only a wing that meets the host along its eave, at the same height, runs on into it.
          if (host && host.axis !== w.axis && Math.abs(host.base - w.base) < 0.05)
            w.reach = Math.min(halfSpan(w), halfSpan(host));
        }
      } else for (const w of mine) w.tan = gableTan(halfSpan(w), p.roofPitch);
    }
  });

  // Dormers sit on an eave of a pitched top wing on their floor.
  const dormers: Dormer[] = [];
  for (const item of p.items.filter((i) => i.kind === 'dormer')) {
    let best: Dormer | null = null,
      bestGap = 1.2;
    wings.forEach((w, n) => {
      if (w.flat || !w.top || w.level !== item.floor || w.shape === 'gambrel') return;
      const r = rectOf(item);
      const [c0, c1] = crossRange(w);
      const [a0, a1] = alongRange(w);
      const ia0 = aOf(w, r.x0, r.z0),
        ia1 = aOf(w, r.x1, r.z1),
        ic0 = cOf(w, r.x0, r.z0),
        ic1 = cOf(w, r.x1, r.z1);
      const lo = Math.max(ia0, a0 + 0.15),
        hi = Math.min(ia1, a1 - 0.15);
      if (hi - lo < 0.5) return;
      for (const side of ['lo', 'hi'] as const) {
        const gap = side === 'lo' ? Math.abs(ic0 - c0) : Math.abs(c1 - ic1);
        if (gap < bestGap) {
          bestGap = gap;
          const depth = w.cape ? collarRun(w.tan) : Math.min(halfSpan(w) * 0.8, 1.4 / w.tan);
          best = {
            item,
            wing: n,
            side,
            a0: lo,
            a1: hi,
            depth,
            setback: w.cape ? DORMER_SETBACK : 0,
          };
        }
      }
    });
    if (best) dormers.push(best);
  }
  // A wing's roof rounds off over a room corner that is rounded, where the two meet.
  const arcs = cornerArcs(p);
  for (const w of wings) {
    const { x0, z0, x1, z1 } = w.rect;
    const at: Record<Corner, [number, number]> = {
      nw: [x0, z0],
      ne: [x1, z0],
      sw: [x0, z1],
      se: [x1, z1],
    };
    for (const a of arcs) {
      if (a.room.floor !== w.level) continue;
      const [cx, cz] = at[a.corner];
      const { x, z, w: rw, d: rd } = a.room;
      const [rx, rz] =
        a.corner === 'nw'
          ? [x, z]
          : a.corner === 'ne'
            ? [x + rw, z]
            : a.corner === 'sw'
              ? [x, z + rd]
              : [x + rw, z + rd];
      if (Math.abs(rx - cx) < 0.02 && Math.abs(rz - cz) < 0.02) w.round[a.corner] = a.r;
    }
  }
  return { wings, dormers };
}
const r2 = (a: Rect, b: Rect): Rect => ({
  x0: Math.max(a.x0, b.x0),
  z0: Math.max(a.z0, b.z0),
  x1: Math.max(Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)),
  z1: Math.max(Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)),
});

// --- Half storeys ----------------------------------------------------------------------------

/** Inside a dormer's nook, in plan. */
export function dormerRect(plan: RoofPlan, d: Dormer): Rect {
  const w = plan.wings[d.wing];
  const [p0x, p0z] = wingPoint(w, d.side, d.a0, d.setback);
  const [p1x, p1z] = wingPoint(w, d.side, d.a1, d.depth);
  return {
    x0: Math.min(p0x, p1x),
    z0: Math.min(p0z, p1z),
    x1: Math.max(p0x, p1x),
    z1: Math.max(p0z, p1z),
  };
}

/**
 * Ceiling height above the floor of a half storey at a plan point, or undefined where no Cape
 * roof covers that floor. It rises from the knee walls and levels off at CAPE_CEIL.
 */
export function capeCeilingAt(plan: RoofPlan, level: number, x: number, z: number) {
  let best: number | undefined;
  for (const w of plan.wings) {
    if (!w.cape || w.level !== level) continue;
    const h = undersideAt(w, x, z);
    if (h !== undefined) best = Math.max(best ?? -Infinity, h - level * FLOOR_H);
  }
  if (best === undefined) return undefined;
  for (const d of plan.dormers) {
    const w = plan.wings[d.wing];
    if (!w.cape || w.level !== level) continue;
    const r = dormerRect(plan, d);
    if (x > r.x0 - 1e-6 && x < r.x1 + 1e-6 && z > r.z0 - 1e-6 && z < r.z1 + 1e-6) return CAPE_CEIL;
  }
  return Math.min(CAPE_CEIL, best);
}

/** Strips along the eaves of a half storey too low to stand in, as plan rectangles. */
export function lowHeadroom(plan: RoofPlan): { level: number; rect: Rect; low: number }[] {
  const out: { level: number; rect: Rect; low: number }[] = [];
  plan.wings.forEach((w, n) => {
    if (!w.cape) return;
    const run = (HEADROOM - KNEE) / w.tan;
    const [a0, a1] = alongRange(w);
    for (const side of ['lo', 'hi'] as const) {
      // In three bands, each only as tall as the ceiling above it, so someone lower down (on
      // the stairs, say) can pass beneath.
      const bands = [0, 1, 2].map((b) => {
        const [px, pz] = wingPoint(w, side, a0, (run * b) / 3);
        const [qx, qz] = wingPoint(w, side, a1, (run * (b + 1)) / 3);
        const rect: Rect = {
          x0: Math.min(px, qx),
          z0: Math.min(pz, qz),
          x1: Math.max(px, qx),
          z1: Math.max(pz, qz),
        };
        return { rect, low: KNEE + ((run * b) / 3) * w.tan };
      });
      // Dormers, and wings whose roofs carry on over this eave, make room to stand.
      const cuts: Rect[] = plan.dormers
        .filter((d) => d.wing === n && d.side === side)
        .map((d) => dormerRect(plan, d));
      for (const o of plan.wings) {
        if (o === w || !o.cape || o.level !== w.level || !o.joined) continue;
        const [oc0, oc1] = crossRange(o);
        const inner = (HEADROOM - KNEE) / o.tan;
        if (oc1 - oc0 < inner * 2 || !o.reach) continue;
        // Only where its roof runs on past its end, over this wing.
        const [ra0, ra1] = roofAlong(o);
        const [oa0, oa1] = alongRange(o);
        const [b0, b1] = ra0 < oa0 - 1e-6 ? [ra0, oa0] : [oa1, ra1];
        const band =
          o.axis === 'x'
            ? { x0: b0, x1: b1, z0: oc0 + inner, z1: oc1 - inner }
            : { x0: oc0 + inner, x1: oc1 - inner, z0: b0, z1: b1 };
        cuts.push(band);
      }
      for (const { rect: strip, low } of bands)
        for (const rect of subtractRects(strip, cuts)) out.push({ level: w.level, rect, low });
    }
  });
  return out;
}

/** Top surface of the roof over a plan point (for chimneys), if any roof is there. */
export function roofTopAt(plan: RoofPlan, x: number, z: number): number | undefined {
  let best: number | undefined;
  for (const w of plan.wings) {
    const { x0, z0, x1, z1 } = w.rect;
    if (w.flat) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1)
        best = Math.max(best ?? -Infinity, w.base + 0.22);
      continue;
    }
    const h = undersideAt(w, x, z);
    if (h !== undefined) best = Math.max(best ?? -Infinity, h + ROOF_T);
  }
  return best;
}
/** Which corner of a wing sits at one of its ends (0 = low, 1 = high) on one eave side. */
export function wingCorner(w: Wing, end: 0 | 1, side: 'lo' | 'hi'): Corner {
  if (w.axis === 'x') return ((side === 'lo' ? 'n' : 's') + (end === 0 ? 'w' : 'e')) as Corner;
  return ((end === 0 ? 'n' : 's') + (side === 'lo' ? 'w' : 'e')) as Corner;
}
/** Underside of the roof over a plan point on a floor, from any pitched wing of that floor. */
export function roofOver(plan: RoofPlan, level: number, x: number, z: number) {
  let best: number | undefined;
  for (const w of plan.wings) {
    if (w.flat || w.level !== level) continue;
    const h = undersideAt(w, x, z);
    if (h !== undefined) best = Math.max(best ?? -Infinity, h);
  }
  return best;
}
/** Height of a wing's ridge. */
export const ridgeOf = (w: Wing) => w.base + rise(w, halfSpan(w));
