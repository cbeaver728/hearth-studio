// Stairs make their own way through walls. A wall that cuts across a flight, or across the step
// where you get on or off it, opens up there, so no stairway is ever walled in. Walls running
// along the side of a flight stay (stairs against a wall are the usual thing), and outside walls
// are never opened: stairs poking past the house don't knock a hole in it.
import { isRoom, stairLevels, type Item, type Project, type Wall } from './model';
import { layoutFor, rectToWorld, stairEnds, toWorld, type Rect, type Tread } from './stairs';

/** A span of wall to leave open for stairs. */
export interface StairGap {
  floor: number;
  axis: 'x' | 'z';
  line: number;
  from: number;
  to: number;
}

/** Plan box round one tread. */
function treadBox(s: Item, t: Tread): Rect {
  let local: Rect;
  if (t.rect) local = t.rect;
  else if (t.poly) {
    const us = t.poly.map((p) => p[0]),
      vs = t.poly.map((p) => p[1]);
    local = { x0: Math.min(...us), z0: Math.min(...vs), x1: Math.max(...us), z1: Math.max(...vs) };
  } else {
    // A spiral wedge: its corners and the middle of its outer arc.
    const w = t.wedge!;
    const pts: [number, number][] = [];
    for (const a of [w.a0, (w.a0 + w.a1) / 2, w.a1])
      for (const r of [w.r0, w.r1]) pts.push([w.cu + r * Math.sin(a), w.cv + r * Math.cos(a)]);
    local = {
      x0: Math.min(...pts.map((p) => p[0])),
      z0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      z1: Math.max(...pts.map((p) => p[1])),
    };
  }
  return rectToWorld(s, local);
}

/** The side of the footprint a walk off (or onto) the flight crosses, and how wide it is there. */
function endGap(s: Item, floor: number, end: [number, number], next: [number, number], t: Tread) {
  const box = treadBox(s, t);
  const F = { x0: s.x, z0: s.z, x1: s.x + s.w, z1: s.z + s.d };
  const dx = end[0] - next[0],
    dz = end[1] - next[1];
  if (Math.abs(dx) > Math.abs(dz))
    return {
      floor,
      axis: 'z' as const,
      line: dx > 0 ? F.x1 : F.x0,
      from: box.z0 - 0.05,
      to: box.z1 + 0.05,
    };
  return {
    floor,
    axis: 'x' as const,
    line: dz > 0 ? F.z1 : F.z0,
    from: box.x0 - 0.05,
    to: box.x1 + 0.05,
  };
}

/** The step-on and step-off spans each flight needs open, floor by floor. */
export function stairGaps(p: Project): StairGap[] {
  const out: StairGap[] = [];
  for (const s of p.items.filter((i) => i.kind === 'stairs')) {
    const { lower, upper } = stairLevels(s);
    const layout = layoutFor(s);
    const path = layout.path.map(([u, v]) => toWorld(s, u, v));
    const ends = stairEnds(s);
    const first = layout.treads.reduce((a, b) => (b.k < a.k ? b : a));
    const last = layout.treads.reduce((a, b) => (b.k > a.k ? b : a));
    out.push(endGap(s, lower, ends.bottom, path[0], first));
    out.push(endGap(s, upper, ends.top, path[path.length - 1], last));
  }
  return out;
}

/**
 * The walls with their stair openings added (as 'open' spans marked auto). Only walls with a room
 * on both sides are opened.
 */
export function openForStairs(p: Project, walls: Wall[]): Wall[] {
  const stairs = p.items.filter((i) => i.kind === 'stairs');
  if (!stairs.length) return walls;
  const rooms = p.items.filter(isRoom);
  const inRoom = (floor: number, x: number, z: number) =>
    rooms.some((r) => r.floor === floor && x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
  const gaps = stairGaps(p);
  const inset = 0.12;
  return walls.map((w) => {
    const spans: [number, number][] = [];
    // Across a flight's first or last step.
    for (const g of gaps)
      if (g.floor === w.floor && g.axis === w.axis && Math.abs(g.line - w.line) < 0.2)
        spans.push([g.from, g.to]);
    // Straight through a flight's footprint.
    for (const s of stairs) {
      const { lower, upper } = stairLevels(s);
      if (w.floor !== lower && w.floor !== upper) continue;
      const [a0, a1, c0, c1] =
        w.axis === 'x' ? [s.x, s.x + s.w, s.z, s.z + s.d] : [s.z, s.z + s.d, s.x, s.x + s.w];
      if (w.line > c0 + inset && w.line < c1 - inset) spans.push([a0, a1]);
    }
    const openings = [...w.openings];
    for (const [from, to] of spans) {
      const start = Math.max(w.start, from),
        end = Math.min(w.end, to);
      if (end - start < 0.1) continue;
      const mid = (start + end) / 2;
      const [ax, az, bx, bz] =
        w.axis === 'x'
          ? [mid, w.line - 0.25, mid, w.line + 0.25]
          : [w.line - 0.25, mid, w.line + 0.25, mid];
      if (!inRoom(w.floor, ax, az) || !inRoom(w.floor, bx, bz)) continue;
      openings.push({ start, end, kind: 'open', auto: true });
    }
    return openings.length === w.openings.length ? w : { ...w, openings };
  });
}

/** The spans a floor's walls leave open for stairs, for drawing on the plan. */
export function stairOpenings(p: Project, walls: Wall[], floor: number) {
  return openForStairs(p, walls)
    .filter((w) => w.floor === floor)
    .flatMap((w) =>
      w.openings
        .filter((o) => o.auto)
        .map((o) => ({ axis: w.axis, line: w.line, start: o.start, end: o.end })),
    );
}
