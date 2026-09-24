// Walkthrough physics: which surface you stand on, and what blocks you.
import {
  buildWalls,
  CAPE_CEIL,
  type Wall,
  FLOOR_H,
  isPassable,
  isRoom,
  openCeilings,
  stairLevels,
  WALL_H,
  type Item,
  type Project,
} from './model';
import {
  RAIL_H,
  layoutFor,
  rectToWorld,
  stairHeightAt,
  subtractRects,
  toWorld,
  type Banister,
  type Rect,
  type Segment,
} from './stairs';
import { curvePieces } from './curve';
import { arcPieces, cornerArcs } from './corners';
import { lowHeadroom, planRoof, wingPoint } from './roof';

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

/** Room floors and landings on a level, minus stair openings. */
export function floorRects(p: Project, level: number): Rect[] {
  const holes = [...stairHoles(p, level), ...openCeilings(p, level)];
  return p.items
    .filter((i) => (isRoom(i) || i.kind === 'landing') && i.floor === level)
    .flatMap((i) => subtractRects({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d }, holes));
}
/** Which edges of a landing need a rail: those not butted up against a room. */
export function landingRails(p: Project, l: Item) {
  const rooms = p.items.filter((i) => isRoom(i) && i.floor === l.floor);
  const e = 0.06;
  // An edge counts as attached only where a room runs along a real length of it,
  // not where one merely reaches the same corner.
  const attached = (along: 'x' | 'z', line: number, from: number, to: number) =>
    rooms.some((r) => {
      const across = along === 'x' ? [r.z, r.z + r.d] : [r.x, r.x + r.w];
      const span = along === 'x' ? [r.x, r.x + r.w] : [r.z, r.z + r.d];
      const overlap = Math.min(to, span[1]) - Math.max(from, span[0]);
      return across[0] <= line + 0.12 && across[1] >= line - 0.12 && overlap >= 0.6;
    });
  const edges: { rect: Rect; along: 'x' | 'z'; line: number; from: number; to: number }[] = [
    {
      rect: { x0: l.x, z0: l.z - e, x1: l.x + l.w, z1: l.z + e },
      along: 'x',
      line: l.z,
      from: l.x,
      to: l.x + l.w,
    },
    {
      rect: { x0: l.x, z0: l.z + l.d - e, x1: l.x + l.w, z1: l.z + l.d + e },
      along: 'x',
      line: l.z + l.d,
      from: l.x,
      to: l.x + l.w,
    },
    {
      rect: { x0: l.x - e, z0: l.z, x1: l.x + e, z1: l.z + l.d },
      along: 'z',
      line: l.x,
      from: l.z,
      to: l.z + l.d,
    },
    {
      rect: { x0: l.x + l.w - e, z0: l.z, x1: l.x + l.w + e, z1: l.z + l.d },
      along: 'z',
      line: l.x + l.w,
      from: l.z,
      to: l.z + l.d,
    },
  ];
  return edges.filter((e) => !attached(e.along, e.line, e.from, e.to)).map((e) => e.rect);
}

/** Whether a wall on this level runs along the segment, so a rail there would be pointless. */
function wallAlong(walls: Wall[], level: number, a: [number, number], b: [number, number]) {
  return walls.some((w) => {
    if (w.floor !== level) return false;
    const across: [number, number] = w.axis === 'x' ? [a[1], b[1]] : [a[0], b[0]];
    if (Math.abs(across[0] - w.line) > 0.3 || Math.abs(across[1] - w.line) > 0.3) return false;
    const along: [number, number] = w.axis === 'x' ? [a[0], b[0]] : [a[1], b[1]];
    const lo = Math.min(...along),
      hi = Math.max(...along);
    const overlap = Math.min(hi, w.end) - Math.max(lo, w.start);
    return overlap > Math.min(0.6, (hi - lo) * 0.6);
  });
}

/**
 * The rails a staircase actually needs. A guard rail earns its place where someone could walk
 * up to the opening and fall in; a handrail earns its place where the flight is open to the
 * room. Rails that would stand inside a wall, or out in thin air, are dropped.
 */
export function stairGuards(p: Project, s: Item, walls: Wall[] = buildWalls(p)) {
  const layout = layoutFor(s);
  const { lower, upper } = stairLevels(s);
  const floors = floorRects(p, upper);
  // Outward is away from the middle of the opening the stairs cut.
  const area = layout.holes.reduce((n, h) => n + (h.x1 - h.x0) * (h.z1 - h.z0), 0) || 1;
  const hu =
    layout.holes.reduce((n, h) => n + ((h.x0 + h.x1) / 2) * (h.x1 - h.x0) * (h.z1 - h.z0), 0) /
    area;
  const hv =
    layout.holes.reduce((n, h) => n + ((h.z0 + h.z1) / 2) * (h.x1 - h.x0) * (h.z1 - h.z0), 0) /
    area;
  const ends = (r: Segment) =>
    [toWorld(s, r.a[0], r.a[1]), toWorld(s, r.b[0], r.b[1])] as [
      [number, number],
      [number, number],
    ];
  const rails = layout.rails.filter((r) => {
    const mu = (r.a[0] + r.b[0]) / 2,
      mv = (r.a[1] + r.b[1]) / 2;
    let nu = -(r.b[1] - r.a[1]),
      nv = r.b[0] - r.a[0];
    const len = Math.hypot(nu, nv) || 1;
    nu /= len;
    nv /= len;
    if ((mu - hu) * nu + (mv - hv) * nv < 0) {
      nu = -nu;
      nv = -nv;
    }
    const [x, z] = toWorld(s, mu + nu * 0.45, mv + nv * 0.45);
    const standable = floors.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);
    return standable && !wallAlong(walls, upper, ...ends(r));
  });
  const banisters = layout.banisters.filter((r) => !wallAlong(walls, lower, ...ends(r)));
  return { rails, banisters };
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
    const doors = w.openings.filter((o) => isPassable(o.kind)).sort((a, b) => a.start - b.start);
    let at = w.start;
    const push = (a: number, b: number) => {
      if (b - a < 0.02) return;
      boxes.push(
        w.axis === 'x'
          ? { x0: a, x1: b, z0: w.line - 0.08, z1: w.line + 0.08, y0: y, y1: y + w.height }
          : { x0: w.line - 0.08, x1: w.line + 0.08, z0: a, z1: b, y0: y, y1: y + w.height },
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
  'laundry',
  'bunk',
  'utility',
  'shelf',
  'islandSink',
  'islandStove',
  'islandL',
  'islandRound',
  'range',
  'dishwasher',
  'cabinet',
  'roundTable',
  'dresser',
  'crib',
  'deskL',
  'shed',
  'firepit',
  'hottub',
  'planter',
  'bench',
  'xmas',
  'grand',
  'upright',
  'clock',
  'counterPlain',
  'counterSink',
  'counterL',
  'crt',
  'computer',
  'highchair',
  'changing',
  'radiator',
  'phonetable',
  'hutch',
  'dollhouse',
  'canopy',
  'platform',
  'daybed',
  'loft',
  'sectional',
  'ottoman',
  'pooltable',
  'wetbar',
  'stools',
  'toybox',
  'grill',
  'swing',
  'trampoline',
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
  // Curved walls, chopped into short lengths that keep their openings open.
  for (const c of p.items.filter((i) => i.kind === 'curve')) {
    const y = c.floor * FLOOR_H;
    for (const piece of curvePieces(c, p.openings)) {
      if (piece.fill === 'gap') continue;
      const [x, z] = toWorld(c, piece.u, piece.v);
      const half = piece.len / 2;
      const ax = Math.abs(Math.cos(piece.angle)) * half + 0.09,
        az = Math.abs(Math.sin(piece.angle)) * half + 0.09;
      boxes.push({ x0: x - ax, z0: z - az, x1: x + ax, z1: z + az, y0: y, y1: y + WALL_H });
    }
  }
  // Under a Cape Cod roof you can't stand right up against the knee walls.
  const roof = planRoof(p);
  // The faces of dormers set up the slope are walls you stop at, window in front of you.
  for (const d of roof.dormers) {
    if (!d.setback) continue;
    const wing = roof.wings[d.wing];
    const [ax, az] = wingPoint(wing, d.side, d.a0, d.setback),
      [bx, bz] = wingPoint(wing, d.side, d.a1, d.setback);
    const y = wing.level * FLOOR_H;
    boxes.push({ ...segBox([ax, az], [bx, bz], 0.08, y, y + CAPE_CEIL) });
  }
  for (const { level, rect, low } of lowHeadroom(roof))
    boxes.push({ ...rect, y0: level * FLOOR_H + low, y1: level * FLOOR_H + CAPE_CEIL });
  // Rounded room corners.
  for (const arc of cornerArcs(p)) {
    const y = arc.room.floor * FLOOR_H;
    for (const piece of arcPieces(arc)) {
      const half = piece.len / 2;
      const ax = Math.abs(Math.cos(piece.angle)) * half + 0.09,
        az = Math.abs(Math.sin(piece.angle)) * half + 0.09;
      boxes.push({
        x0: piece.x - ax,
        z0: piece.z - az,
        x1: piece.x + ax,
        z1: piece.z + az,
        y0: y,
        y1: y + WALL_H,
      });
    }
  }
  // Landing rails and porch posts.
  for (const l of p.items.filter((i) => i.kind === 'landing')) {
    const y = l.floor * FLOOR_H;
    if (l.floor > 0) for (const r of landingRails(p, l)) boxes.push({ ...r, y0: y, y1: y + 1 });
    if (l.covered)
      for (const [cx, cz] of [
        [l.x + 0.1, l.z + 0.1],
        [l.x + l.w - 0.1, l.z + 0.1],
        [l.x + 0.1, l.z + l.d - 0.1],
        [l.x + l.w - 0.1, l.z + l.d - 0.1],
      ])
        boxes.push({
          x0: cx - 0.08,
          z0: cz - 0.08,
          x1: cx + 0.08,
          z1: cz + 0.08,
          y0: y,
          y1: y + 2.6,
        });
  }
  const walls = buildWalls(p);
  for (const s of stairs) {
    const layout = layoutFor(s),
      { lower, upper } = stairLevels(s);
    const w = (pt: [number, number]) => toWorld(s, pt[0], pt[1]);
    const guards = stairGuards(p, s, walls);
    for (const r of guards.rails)
      boxes.push(segBox(w(r.a), w(r.b), 0.03, upper * FLOOR_H, upper * FLOOR_H + 1));
    // A banister stops you stepping off the side once you're a few steps up. It follows the
    // flight in short lengths, each only as low as the treads beside it, and leaves the bottom
    // steps open, so you can come at the stairs from the side in a tight hall.
    for (const r of guards.banisters) {
      const [ax, az] = w(r.a),
        [bx, bz] = w(r.b);
      const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3));
      for (let n = 0; n < pieces; n++) {
        const f0 = n / pieces,
          f1 = (n + 1) / pieces;
        const y0 = r.y0 + (r.y1 - r.y0) * f0,
          y1 = r.y0 + (r.y1 - r.y0) * f1;
        const tread = Math.min(y0, y1) - RAIL_H;
        if (tread < 0.45) continue;
        boxes.push(
          segBox(
            [ax + (bx - ax) * f0, az + (bz - az) * f0],
            [ax + (bx - ax) * f1, az + (bz - az) * f1],
            0.04,
            lower * FLOOR_H + tread,
            lower * FLOOR_H + Math.max(y0, y1),
          ),
        );
      }
    }
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
