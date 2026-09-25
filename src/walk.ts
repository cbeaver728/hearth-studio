// Walkthrough physics: which surface you stand on, and what blocks you.
import {
  buildWalls,
  bayDepth,
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
  localSize,
  rectToWorld,
  stairEnds,
  stairHeightAt,
  subtractRects,
  toWorld,
  type Banister,
  type Rect,
  type Segment,
} from './stairs';
import { curvePieces } from './curve';
import { curveFloor } from './curveroof';
import { arcPieces, cornerArcs } from './corners';
import { lowHeadroom, planRoof, wingPoint } from './roof';

export const EYE = 1.62;
const RADIUS = 0.17;
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

/**
 * Where a landing or deck really reaches. One set down a hand's width short of a room (easy to
 * do, snapping to the grid beside a room of any size) still meets its wall: the floor carries
 * on across the gap, and that side counts as joined to the house.
 */
export function landingReach(p: Project, l: Item): Rect {
  const r = { x0: l.x, z0: l.z, x1: l.x + l.w, z1: l.z + l.d };
  const GAP = 0.45;
  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) - Math.max(a0, b0) >= Math.min(0.6, (a1 - a0) * 0.5);
  for (const o of p.items) {
    if (!isRoom(o) || o.floor !== l.floor) continue;
    const o0x = o.x,
      o1x = o.x + o.w,
      o0z = o.z,
      o1z = o.z + o.d;
    if (overlap(l.x, l.x + l.w, o0x, o1x)) {
      if (o1z <= l.z + 0.001 && l.z - o1z < GAP) r.z0 = Math.min(r.z0, o1z);
      if (o0z >= l.z + l.d - 0.001 && o0z - (l.z + l.d) < GAP) r.z1 = Math.max(r.z1, o0z);
    }
    if (overlap(l.z, l.z + l.d, o0z, o1z)) {
      if (o1x <= l.x + 0.001 && l.x - o1x < GAP) r.x0 = Math.min(r.x0, o1x);
      if (o0x >= l.x + l.w - 0.001 && o0x - (l.x + l.w) < GAP) r.x1 = Math.max(r.x1, o0x);
    }
  }
  return r;
}

/** Room floors and landings on a level, minus stair openings. */
export function floorRects(p: Project, level: number): Rect[] {
  const holes = [...stairHoles(p, level), ...openCeilings(p, level)];
  return p.items
    .filter((i) => (isRoom(i) || i.kind === 'landing') && i.floor === level)
    .flatMap((i) =>
      subtractRects(
        i.kind === 'landing'
          ? landingReach(p, i)
          : { x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d },
        holes,
      ),
    )
    .concat(
      // The floor inside a curved wall.
      p.items
        .filter((i) => i.kind === 'curve' && i.floor === level)
        .flatMap((i) => curveFloor(i).flatMap((r) => subtractRects(r, holes))),
    );
}
/** Which edges of a landing need a rail: those not butted up against a room. */
export function landingRails(p: Project, l: Item) {
  const rooms = p.items.filter(
    (i) => (isRoom(i) || (i.kind === 'landing' && i.id !== l.id)) && i.floor === l.floor,
  );
  const e = 0.06;
  const reach = landingReach(p, l);
  l = { ...l, x: reach.x0, z: reach.z0, w: reach.x1 - reach.x0, d: reach.z1 - reach.z0 };
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
  // Stairs that come up onto this landing leave a gap in the rail as wide as the flight.
  const arriving = p.items
    .filter((i) => i.kind === 'stairs' && stairLevels(i).upper === l.floor)
    .map((s) => {
      const path = layoutFor(s).path.map(([u, v]) => toWorld(s, u, v));
      const last = path[path.length - 1],
        top = stairEnds(s).top;
      return { last, top, xs: [s.x, s.x + s.w], zs: [s.z, s.z + s.d] };
    });
  const rails: Rect[] = [];
  for (const edge of edges) {
    if (attached(edge.along, edge.line, edge.from, edge.to)) continue;
    const gaps: [number, number][] = [];
    for (const s of arriving) {
      // The flight has to cross this edge on its way up onto the landing.
      const across = (pt: [number, number]) => (edge.along === 'x' ? pt[1] : pt[0]) - edge.line;
      const a = across(s.last),
        b = across(s.top);
      if (a * b > 0 && Math.min(Math.abs(a), Math.abs(b)) > 0.15) continue;
      const span = edge.along === 'x' ? s.xs : s.zs;
      gaps.push([Math.min(...span) - 0.02, Math.max(...span) + 0.02]);
    }
    let at = edge.from;
    const piece = (from: number, to: number) => {
      if (to - from < 0.05) return;
      rails.push(
        edge.along === 'x'
          ? { x0: from, x1: to, z0: edge.rect.z0, z1: edge.rect.z1 }
          : { x0: edge.rect.x0, x1: edge.rect.x1, z0: from, z1: to },
      );
    };
    for (const [g0, g1] of gaps.sort((m, n) => m[0] - n[0])) {
      piece(at, Math.min(g0, edge.to));
      at = Math.max(at, g1);
    }
    piece(at, edge.to);
  }
  return rails;
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
  // A flight going on up from this level can sit right over the opening, like a main stair
  // stacked over the basement stair. Where its steps are lower than your head, the steps
  // themselves are the edge, so the rail stops there.
  const over = p.items.filter(
    (t) => t.kind === 'stairs' && t.id !== s.id && stairLevels(t).lower === upper,
  );
  const covered = (u: number, v: number) => {
    const [x, z] = toWorld(s, u + (hu - u) * 0.1, v + (hv - v) * 0.1);
    return over.some((t) => {
      const h = stairHeightAt(t, x, z);
      return h !== undefined && h - upper * FLOOR_H < 1.9;
    });
  };
  const kept: Segment[] = [];
  for (const r of rails) {
    if (!over.length) {
      kept.push(r);
      continue;
    }
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    const pieces = Math.max(1, Math.ceil(len / 0.2));
    let run: [number, number] | null = null;
    const flush = () => {
      if (run && run[1] - run[0] > 1e-6) {
        const at = (f: number): [number, number] => [
          r.a[0] + (r.b[0] - r.a[0]) * f,
          r.a[1] + (r.b[1] - r.a[1]) * f,
        ];
        kept.push({ ...r, a: at(run[0]), b: at(run[1]) });
      }
      run = null;
    };
    for (let n = 0; n < pieces; n++) {
      const f0 = n / pieces,
        f1 = (n + 1) / pieces;
      const mid = (f0 + f1) / 2;
      if (covered(r.a[0] + (r.b[0] - r.a[0]) * mid, r.a[1] + (r.b[1] - r.a[1]) * mid)) flush();
      else if (run) run[1] = f1;
      else run = [f0, f1];
    }
    flush();
  }
  const banisters = layout.banisters.filter((r) => !wallAlong(walls, lower, ...ends(r)));
  return { rails: kept, banisters };
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
  'car',
]);

/**
 * Moves the walker by (dx, dz) as far as the world allows. Blocked, it slides along walls, and
 * glances off corners (door frames, newel posts, the end of a banister) rather than stopping
 * dead, so a step that's slightly off line still carries you onto the stairs or through the door.
 * Walking straight into a wall still stops you.
 */
export function stepWalker(
  world: WalkWorld,
  x: number,
  z: number,
  feet: number,
  dx: number,
  dz: number,
) {
  const len = Math.hypot(dx, dz);
  if (!len) return { x, z, stopX: false, stopZ: false };
  if (world.free(x + dx, z + dz, feet)) return { x: x + dx, z: z + dz, stopX: false, stopZ: false };
  let nx = x,
    nz = z,
    stopX = false,
    stopZ = false;
  if (world.free(x + dx, z, feet)) nx = x + dx;
  else stopX = true;
  if (world.free(nx, z + dz, feet)) nz = z + dz;
  else stopZ = true;
  if (Math.hypot(nx - x, nz - z) >= len * 0.5) return { x: nx, z: nz, stopX, stopZ };
  for (const a of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
    const c = Math.cos(a),
      s = Math.sin(a);
    const rx = (dx * c - dz * s) * c,
      rz = (dx * s + dz * c) * c;
    if (world.free(x + rx, z + rz, feet))
      return { x: x + rx, z: z + rz, stopX: false, stopZ: false };
  }
  // Just clipping the edge of a door frame or the end of a rail: if the way ahead opens up a
  // hand's width to one side, ease over toward it.
  const px = -dz / len,
    pz = dx / len;
  for (const shift of [0.03, 0.06, 0.09, 0.12])
    for (const side of [1, -1]) {
      if (!world.free(x + px * shift * side + dx, z + pz * shift * side + dz, feet)) continue;
      const nudge = Math.min(shift, len * 0.7) * side;
      if (world.free(x + px * nudge, z + pz * nudge, feet))
        return { x: x + px * nudge, z: z + pz * nudge, stopX: false, stopZ: false };
    }
  return { x: nx, z: nz, stopX, stopZ };
}

export function buildWalkWorld(p: Project): WalkWorld {
  const levels = p.floors.map((f) => f.level);
  const slabs = levels.map((level) => ({ y: level * FLOOR_H, rects: floorRects(p, level) }));
  const stairs = p.items.filter((i) => i.kind === 'stairs');
  const boxes = wallBoxes(p);
  for (const i of p.items) {
    const y = i.floor * FLOOR_H;
    if (SOLID.has(i.kind))
      boxes.push({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d, y0: y, y1: y + 1 });
    if (i.kind === 'carport' || i.kind === 'pergola') {
      const { LW, LD } = localSize(i);
      const count = i.kind === 'carport' ? Math.max(2, Math.round(LD / 2.6) + 1) : 2;
      const inset = i.kind === 'carport' ? [0.1, 0.15] : [0.11, 0.11];
      for (const u of [inset[0], LW - inset[0]])
        for (let n = 0; n < count; n++) {
          const v = inset[1] + ((LD - inset[1] * 2) * n) / (count - 1);
          const [px, pz] = toWorld(i, u, v);
          boxes.push({
            x0: px - 0.09,
            z0: pz - 0.09,
            x1: px + 0.09,
            z1: pz + 0.09,
            y0: y,
            y1: y + 2.4,
          });
        }
    }
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
  // Bay windows push out past the wall: outside, you walk round them.
  for (const wall of buildWalls(p))
    for (const o of wall.openings) {
      if (o.kind !== 'bay') continue;
      const mid = (o.start + o.end) / 2;
      const inRoom = (x: number, z: number) =>
        p.items.some(
          (r) =>
            isRoom(r) &&
            r.floor === wall.floor &&
            x > r.x &&
            x < r.x + r.w &&
            z > r.z &&
            z < r.z + r.d,
        );
      const probe = (s: number) =>
        wall.axis === 'x' ? inRoom(mid, wall.line + s * 0.25) : inRoom(wall.line + s * 0.25, mid);
      const sign = !probe(1) ? 1 : !probe(-1) ? -1 : 0;
      if (!sign) continue;
      const d = bayDepth(o.end - o.start) + 0.08;
      const [n0, n1] = sign > 0 ? [wall.line, wall.line + d] : [wall.line - d, wall.line];
      const y = wall.floor * FLOOR_H;
      boxes.push(
        wall.axis === 'x'
          ? { x0: o.start, x1: o.end, z0: n0, z1: n1, y0: y, y1: y + 2.6 }
          : { x0: n0, x1: n1, z0: o.start, z1: o.end, y0: y, y1: y + 2.6 },
      );
    }
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
    // A surface too high to step onto but lower than your head blocks you.
    for (const y of surfaces(x, z)) if (y > feet + STEP_UP && y < feet + 1.9) return false;
    // Stairs are closed underneath: step on at the bottom, not in under the flight, where
    // there'd be no way up.
    for (const s of stairs) {
      const h = stairHeightAt(s, x, z);
      if (h === undefined || h <= feet + STEP_UP) continue;
      const onAnother = stairs.some((t) => {
        if (t === s) return false;
        const ht = stairHeightAt(t, x, z);
        return ht !== undefined && Math.abs(ht - feet) <= STEP_UP;
      });
      if (!onAnother) return false;
    }
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

/** The line up a flight, in plan: from where you stand at the foot, along the treads, to the head. */
function stairLine(s: Item): [number, number][] {
  const ends = stairEnds(s);
  return [ends.bottom, ...layoutFor(s).path.map(([u, v]) => toWorld(s, u, v)), ends.top];
}

/** How far ahead along the stairs the guide aims: far enough to round a corner smoothly. */
const LOOK_AHEAD = 0.7;

/**
 * Stairs carry you along them. On a flight (or stepping onto either end of one) and heading up
 * or down it, the move aims at a point a little further along the flight's own line, so W alone
 * climbs a spiral, rounds the corner of an L or the landing of a U, and eases you back to the
 * middle; nobody has to steer a 60 cm radius with the arrow keys. Sideways across a step, the
 * move is left as it is. Returns the move to make and, when guided, the heading for the view to
 * settle toward.
 */
export function stairGuide(
  world: WalkWorld,
  x: number,
  z: number,
  feet: number,
  dx: number,
  dz: number,
): { dx: number; dz: number; heading?: number } {
  const speed = Math.hypot(dx, dz);
  if (speed < 1e-6) return { dx, dz };
  const ux = dx / speed,
    uz = dz / speed;
  let best: { d: number; tx: number; tz: number } | null = null;
  for (const s of world.stairs) {
    const { lower, upper } = stairLevels(s);
    const line = stairLine(s);
    const h = stairHeightAt(s, x, z);
    const on = h !== undefined && Math.abs(h - feet) < 0.45;
    const last = line[line.length - 1];
    const atFoot =
      !on &&
      Math.abs(feet - lower * FLOOR_H) < 0.25 &&
      Math.hypot(x - line[0][0], z - line[0][1]) < 0.9;
    const atHead =
      !on && Math.abs(feet - upper * FLOOR_H) < 0.25 && Math.hypot(x - last[0], z - last[1]) < 0.9;
    if (!on && !atFoot && !atHead) continue;
    // Lengths along the line, and the nearest point on it.
    const cum = [0];
    for (let k = 1; k < line.length; k++)
      cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    const total = cum[cum.length - 1];
    let near = { d: Infinity, at: 0, tx: 0, tz: 0 };
    for (let k = 0; k < line.length - 1; k++) {
      const [a, b] = [line[k], line[k + 1]];
      const lx = b[0] - a[0],
        lz = b[1] - a[1],
        L2 = lx * lx + lz * lz || 1;
      const f = Math.max(0, Math.min(1, ((x - a[0]) * lx + (z - a[1]) * lz) / L2));
      const d = Math.hypot(a[0] + lx * f - x, a[1] + lz * f - z);
      if (d < near.d - 1e-9) {
        const L = Math.sqrt(L2);
        near = { d, at: cum[k] + f * L, tx: lx / L, tz: lz / L };
      }
    }
    // Which way along the line: up if you're heading the way it climbs here, down if against.
    const pointAt = (t: number): [number, number] => {
      if (t <= 0) {
        const [a, b] = [line[0], line[1]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [a[0] + ((b[0] - a[0]) / L) * t, a[1] + ((b[1] - a[1]) / L) * t];
      }
      for (let k = 1; k < line.length; k++)
        if (t <= cum[k] || k === line.length - 1) {
          const [a, b] = [line[k - 1], line[k]];
          const L = cum[k] - cum[k - 1] || 1;
          const f = (t - cum[k - 1]) / L;
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
      return line[line.length - 1];
    };
    const aim = (sign: number) => {
      const t = near.at + sign * LOOK_AHEAD;
      // Past either end, keep going the way the line leaves it.
      let [px, pz] = pointAt(Math.max(0, Math.min(total, t)));
      if (t > total) {
        const [a, b] = [line[line.length - 2], line[line.length - 1]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        px += ((b[0] - a[0]) / L) * (t - total);
        pz += ((b[1] - a[1]) / L) * (t - total);
      } else if (t < 0) [px, pz] = pointAt(t);
      const ax = px - x,
        az = pz - z,
        L = Math.hypot(ax, az) || 1;
      return { tx: ax / L, tz: az / L };
    };
    const upward = aim(1),
      downward = aim(-1);
    const alongUp = ux * upward.tx + uz * upward.tz,
      alongDown = ux * downward.tx + uz * downward.tz;
    let pick: { tx: number; tz: number } | null = null;
    if (atFoot) pick = alongUp > 0.45 ? upward : null;
    else if (atHead) pick = alongDown > 0.45 ? downward : null;
    else if (Math.max(alongUp, alongDown) > 0.35) pick = alongUp >= alongDown ? upward : downward;
    if (!pick) continue;
    if (!best || near.d < best.d) best = { d: near.d, ...pick };
  }
  if (!best) return { dx, dz };
  return {
    dx: best.tx * speed,
    dz: best.tz * speed,
    heading: Math.atan2(-best.tx, -best.tz),
  };
}
