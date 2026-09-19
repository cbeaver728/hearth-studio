// Walkthrough physics: which surface you stand on, and what blocks you.
import { buildWalls, FLOOR_H, isRoom, stairLevels, type Item, type Project } from './model';
import { layoutFor, rectToWorld, stairHeightAt, subtractRects, toWorld, type Rect } from './stairs';

export const EYE = 1.62;
const RADIUS = 0.24;
const STEP_UP = 0.36;
export interface Box extends Rect {
  y0: number;
  y1: number;
}
export interface WalkWorld {
  slabs: { y: number; rects: Rect[] }[];
  stairs: Item[];
  boxes: Box[];
  /** Surfaces are found at a point; returns the one the walker should stand on. */
  support: (x: number, z: number, feet: number) => number;
  /** Whether a body standing with feet at `feet` fits at (x, z). */
  free: (x: number, z: number, feet: number) => boolean;
  levelOf: (feet: number) => number;
}

/** Holes that each staircase cuts in the floor above it. */
export function stairHoles(p: Project, level: number): Rect[] {
  return p.items
    .filter((i) => i.kind === 'stairs' && stairLevels(i).upper === level)
    .flatMap((i) => layoutFor(i).holes.map((h) => rectToWorld(i, h)));
}

/** Room floors on a level, minus stair openings. */
export function floorRects(p: Project, level: number): Rect[] {
  const holes = stairHoles(p, level);
  return p.items
    .filter((i) => isRoom(i) && i.floor === level)
    .flatMap((i) => subtractRects({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d }, holes));
}

const segBox = (a: [number, number], b: [number, number], t: number, y0: number, y1: number) => ({
  x0: Math.min(a[0], b[0]) - t,
  z0: Math.min(a[1], b[1]) - t,
  x1: Math.max(a[0], b[0]) + t,
  z1: Math.max(a[1], b[1]) + t,
  y0,
  y1,
});

/** Solid wall pieces (doors are gaps; windows are solid). */
export function wallBoxes(p: Project): Box[] {
  const boxes: Box[] = [];
  for (const w of buildWalls(p)) {
    const y = w.floor * FLOOR_H;
    const doors = w.openings.filter((o) => o.kind === 'door').sort((a, b) => a.start - b.start);
    let at = w.start;
    const push = (a: number, b: number) => {
      if (b - a < 0.02) return;
      boxes.push(
        w.axis === 'x'
          ? { x0: a, x1: b, z0: w.line - 0.08, z1: w.line + 0.08, y0: y, y1: y + 3 }
          : { x0: w.line - 0.08, x1: w.line + 0.08, z0: a, z1: b, y0: y, y1: y + 3 },
      );
    };
    for (const d of doors) {
      push(at, d.start);
      at = Math.max(at, d.end);
    }
    push(at, w.end);
  }
  return boxes;
}

const SOLID = new Set([
  'sofa',
  'bed',
  'table',
  'counter',
  'kitchen',
  'fridge',
  'wardrobe',
  'desk',
  'coffee',
  'media',
  'fireplace',
  'bathtub',
  'toilet',
  'vanity',
  'armchair',
  'pool',
  'fence',
]);

export function buildWalkWorld(p: Project): WalkWorld {
  const levels = p.floors.map((f) => f.level);
  const slabs = levels.map((level) => ({ y: level * FLOOR_H, rects: floorRects(p, level) }));
  const stairs = p.items.filter((i) => i.kind === 'stairs');
  const boxes = wallBoxes(p);
  for (const i of p.items) {
    const y = i.floor * FLOOR_H;
    if (SOLID.has(i.kind))
      boxes.push({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d, y0: y, y1: y + 1 });
    if (i.kind === 'tree') {
      const cx = i.x + i.w / 2,
        cz = i.z + i.d / 2;
      boxes.push({ x0: cx - 0.15, z0: cz - 0.15, x1: cx + 0.15, z1: cz + 0.15, y0: 0, y1: 3 });
    }
  }
  for (const s of stairs) {
    const layout = layoutFor(s),
      { lower, upper } = stairLevels(s);
    const w = (pt: [number, number]) => toWorld(s, pt[0], pt[1]);
    for (const r of layout.rails)
      boxes.push(segBox(w(r.a), w(r.b), 0.03, upper * FLOOR_H, upper * FLOOR_H + 1));
    for (const r of layout.dividers)
      boxes.push(segBox(w(r.a), w(r.b), 0.04, lower * FLOOR_H, upper * FLOOR_H + 1));
    if (layout.pole) {
      const [x, z] = w([layout.pole.u, layout.pole.v]);
      boxes.push(segBox([x, z], [x, z], 0.1, lower * FLOOR_H, upper * FLOOR_H + 1));
    }
  }
  const inside = (r: Rect, x: number, z: number) =>
    x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const surfaces = (x: number, z: number) => {
    const ys: number[] = [];
    for (const s of slabs) if (s.rects.some((r) => inside(r, x, z))) ys.push(s.y);
    for (const s of stairs) {
      const h = stairHeightAt(s, x, z);
      if (h !== undefined) ys.push(h);
    }
    // Open ground outside, unless you're above a basement's footprint.
    if (!slabs.some((s) => s.y < 0 && s.rects.some((r) => inside(r, x, z)))) ys.push(-0.02);
    return ys;
  };
  const support = (x: number, z: number, feet: number) => {
    let best = -Infinity;
    for (const y of surfaces(x, z)) if (y <= feet + STEP_UP && y > best) best = y;
    return best === -Infinity ? Math.min(...surfaces(x, z), feet) : best;
  };
  const free = (x: number, z: number, feet: number) => {
    // A surface too high to step onto but lower than your head blocks you (the side of a stair).
    for (const y of surfaces(x, z)) if (y > feet + STEP_UP && y < feet + 1.9) return false;
    const top = feet + 1.8,
      bottom = feet + 0.25;
    return !boxes.some(
      (b) =>
        b.y1 > bottom &&
        b.y0 < top &&
        x + RADIUS > b.x0 &&
        x - RADIUS < b.x1 &&
        z + RADIUS > b.z0 &&
        z - RADIUS < b.z1,
    );
  };
  const levelOf = (feet: number) => {
    const guess = Math.floor((feet + 0.8) / FLOOR_H);
    return levels.reduce((a, b) => (Math.abs(b - guess) < Math.abs(a - guess) ? b : a), 0);
  };
  return { slabs, stairs, boxes, support, free, levelOf };
}
