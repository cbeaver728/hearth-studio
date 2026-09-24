// Where furniture lands on the plan: inside the room it's set down in, flush against that room's
// walls when it's close to them, and (for pieces with a back) turned to face into the room.
import { isOutside, isRoom, type Corner, type Item, type Opening } from './model';

/** Half a wall: the inside face of a room's wall sits this far in from its edge. */
const HALF_WALL = 0.08;
/** How close to a wall a piece has to be set down to go back against it. */
const REACH = 1.1;
/** How close an edge has to come to a wall to settle flush against it. */
const SNUG = 0.25;

/**
 * Pieces with a back that belongs against a wall. Built at rotation 0, each has its back on its
 * north edge: the headboard of a bed, the back of a sofa, the doors of a wardrobe facing south.
 */
export const BACKED = new Set([
  'bed',
  'platform',
  'canopy',
  'daybed',
  'crib',
  'sofa',
  'sectional',
  'dresser',
  'desk',
  'computer',
  'wardrobe',
  'media',
  'crt',
  'shelf',
  'fireplace',
  'counter',
  'counterPlain',
  'counterSink',
  'kitchen',
  'fridge',
  'range',
  'dishwasher',
  'upright',
  'hutch',
  'wetbar',
  'vanity',
  'toilet',
  'radiator',
]);

type Snap = (v: number) => number;
/** Things that aren't furniture: they go where they're put, across walls if need be. */
const FREE = new Set(['stairs', 'curve', 'landing', 'dormer', 'chimney']);

/** The room on a floor that a plan point falls in. */
export function roomAt(rooms: Item[], x: number, z: number) {
  return rooms.find((r) => isRoom(r) && x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
}

/** Keeps a piece inside a room's walls and settles its edges against walls it has come close to. */
export function settleInRoom(i: Item, room: Item): Item {
  const out = { ...i };
  const x0 = room.x + HALF_WALL,
    x1 = room.x + room.w - HALF_WALL,
    z0 = room.z + HALF_WALL,
    z1 = room.z + room.d - HALF_WALL;
  // Close to a wall: flush against it.
  if (Math.abs(out.x - x0) < SNUG) out.x = x0;
  else if (Math.abs(out.x + out.w - x1) < SNUG) out.x = x1 - out.w;
  if (Math.abs(out.z - z0) < SNUG) out.z = z0;
  else if (Math.abs(out.z + out.d - z1) < SNUG) out.z = z1 - out.d;
  // Never through one, if the piece fits the room at all.
  if (out.w <= x1 - x0) out.x = Math.min(Math.max(out.x, x0), x1 - out.w);
  if (out.d <= z1 - z0) out.z = Math.min(Math.max(out.z, z0), z1 - out.d);
  return out;
}

/**
 * A new piece set down at (x, z). Near a wall, a piece with a back turns to put its back to that
 * wall and sits flush against it; anywhere else it's centered where you clicked. Either way it
 * stays inside the room you put it in.
 */
export function placeFurniture(rooms: Item[], fresh: Item, x: number, z: number, snap: Snap): Item {
  let i: Item = { ...fresh, x: snap(x - fresh.w / 2), z: snap(z - fresh.d / 2) };
  if (isRoom(i) || isOutside(i) || FREE.has(i.kind)) return i;
  const room = roomAt(rooms, x, z);
  if (!room) return i;
  if (BACKED.has(i.kind)) {
    const walls = [
      { rotation: 0, gap: z - room.z },
      { rotation: 90, gap: room.x + room.w - x },
      { rotation: 180, gap: room.z + room.d - z },
      { rotation: 270, gap: x - room.x },
    ].sort((a, b) => a.gap - b.gap);
    const wall = walls[0];
    if (wall.gap < REACH + fresh.d / 2) {
      const turned = wall.rotation % 180 !== 0;
      const w = turned ? fresh.d : fresh.w,
        d = turned ? fresh.w : fresh.d;
      i = { ...i, rotation: wall.rotation, w, d, x: snap(x - w / 2), z: snap(z - d / 2) };
      if (wall.rotation === 0) i.z = room.z + HALF_WALL;
      if (wall.rotation === 180) i.z = room.z + room.d - HALF_WALL - d;
      if (wall.rotation === 90) i.x = room.x + room.w - HALF_WALL - w;
      if (wall.rotation === 270) i.x = room.x + HALF_WALL;
    }
  }
  return settleInRoom(i, room);
}

/** A piece being dragged: kept inside whichever room its middle is over. */
export function moveFurniture(rooms: Item[], i: Item): Item {
  if (isRoom(i) || isOutside(i) || FREE.has(i.kind)) return i;
  const room = roomAt(rooms, i.x + i.w / 2, i.z + i.d / 2);
  return room ? settleInRoom(i, room) : i;
}

const overlapping = (a: Item, b: Item) =>
  a.x < b.x + b.w - 0.01 &&
  a.x + a.w > b.x + 0.01 &&
  a.z < b.z + b.d - 0.01 &&
  a.z + a.d > b.z + 0.01;

/**
 * Where a copy of a piece goes: right beside the original, in the same room, clear of other
 * furniture, trying the four sides in turn. A room's copy goes next door, wall to wall.
 */
export function besideSpot(items: Item[], i: Item): { x: number; z: number } {
  const gap = isRoom(i) ? 0 : 0.1;
  const sides = [
    { x: i.x + i.w + gap, z: i.z },
    { x: i.x - i.w - gap, z: i.z },
    { x: i.x, z: i.z + i.d + gap },
    { x: i.x, z: i.z - i.d - gap },
  ];
  const floorRooms = items.filter((r) => isRoom(r) && r.floor === i.floor);
  if (isRoom(i)) {
    const free = sides.find((s) => !floorRooms.some((r) => overlapping({ ...i, ...s }, r)));
    return free ?? { x: i.x + 1, z: i.z + 1 };
  }
  const home = roomAt(floorRooms, i.x + i.w / 2, i.z + i.d / 2);
  const others = items.filter(
    (o) => o.floor === i.floor && !isRoom(o) && !isOutside(o) && o.kind !== 'rug' && o.id !== i.id,
  );
  for (const s of sides) {
    const c = { ...i, ...s };
    if (
      home &&
      !(
        c.x >= home.x &&
        c.z >= home.z &&
        c.x + c.w <= home.x + home.w &&
        c.z + c.d <= home.z + home.d
      )
    )
      continue;
    if (others.some((o) => overlapping(c, o))) continue;
    return s;
  }
  const fallback = { ...i, x: i.x + 0.5, z: i.z + 0.5 };
  const settled = home ? settleInRoom(fallback, home) : fallback;
  return { x: settled.x, z: settled.z };
}

/**
 * A new width or depth for a room, typed in. The room grows or shrinks away from a neighbour it's
 * built against, so a garage set against the living room doesn't grow into it; with nothing
 * alongside, the top-left corner stays put. Returns the new x, z, w and d.
 */
export function resizeRoom(items: Item[], r: Item, w: number, d: number) {
  const others = items.filter((o) => isRoom(o) && o.id !== r.id && o.floor === r.floor);
  const along = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) - Math.max(a0, b0) > 0.3;
  const touches = (edge: 'l' | 'r' | 't' | 'b') =>
    others.some((o) =>
      edge === 'l'
        ? Math.abs(o.x + o.w - r.x) < 0.05 && along(o.z, o.z + o.d, r.z, r.z + r.d)
        : edge === 'r'
          ? Math.abs(o.x - (r.x + r.w)) < 0.05 && along(o.z, o.z + o.d, r.z, r.z + r.d)
          : edge === 't'
            ? Math.abs(o.z + o.d - r.z) < 0.05 && along(o.x, o.x + o.w, r.x, r.x + r.w)
            : Math.abs(o.z - (r.z + r.d)) < 0.05 && along(o.x, o.x + o.w, r.x, r.x + r.w),
    );
  const x = touches('r') && !touches('l') ? r.x + r.w - w : r.x;
  const z = touches('b') && !touches('t') ? r.z + r.d - d : r.z;
  return { x, z, w, d };
}

/** The corners of a room with no other room against either wall beside them. */
export function freeCorners(p: { items: Item[] }, r: Item): Corner[] {
  const others = p.items.filter((o) => isRoom(o) && o.id !== r.id && o.floor === r.floor);
  const covered = (x: number, z: number) =>
    others.some((o) => x > o.x && x < o.x + o.w && z > o.z && z < o.z + o.d);
  const e = 0.25;
  const corners: [Corner, number, number, number, number][] = [
    ['nw', r.x, r.z, 1, 1],
    ['ne', r.x + r.w, r.z, -1, 1],
    ['sw', r.x, r.z + r.d, 1, -1],
    ['se', r.x + r.w, r.z + r.d, -1, -1],
  ];
  return corners
    .filter(
      ([, x, z, sx, sz]) =>
        // Just outside each of the two walls that meet here, a little way along them.
        !covered(x - sx * e, z + sz * e) &&
        !covered(x + sx * e, z - sz * e) &&
        !covered(x - sx * e, z - sz * e),
    )
    .map(([c]) => c);
}

/**
 * A curved wall set down near the outside of a room's wall: it sits on that wall, centered where
 * you clicked, bowing away from the room, and the room opens into it. Returns the placed curve and
 * the room and side it joins, or null when there's no wall close by.
 */
export function attachCurve(rooms: Item[], c: Item, x: number, z: number) {
  const reach = 1.2;
  let best: { r: Item; side: 'north' | 'south' | 'east' | 'west'; gap: number } | null = null;
  for (const r of rooms.filter(isRoom)) {
    const inX = x > r.x + 0.3 && x < r.x + r.w - 0.3,
      inZ = z > r.z + 0.3 && z < r.z + r.d - 0.3;
    const sides = [
      { side: 'north' as const, gap: r.z - z, ok: inX },
      { side: 'south' as const, gap: z - (r.z + r.d), ok: inX },
      { side: 'west' as const, gap: r.x - x, ok: inZ },
      { side: 'east' as const, gap: x - (r.x + r.w), ok: inZ },
    ];
    for (const s of sides)
      if (s.ok && s.gap > -0.3 && s.gap < reach && (!best || s.gap < best.gap))
        best = { r, side: s.side, gap: s.gap };
  }
  if (!best) return null;
  const { r, side } = best;
  // The curve's chord runs along the wall: as wide as asked, but no wider than the wall.
  const along = side === 'north' || side === 'south' ? r.w : r.d;
  const width = Math.min(Math.max(c.w, c.d), along - 0.2);
  const bow = Math.min(Math.min(c.w, c.d), width / 2);
  const mid =
    side === 'north' || side === 'south'
      ? Math.min(Math.max(x, r.x + width / 2 + 0.1), r.x + r.w - width / 2 - 0.1)
      : Math.min(Math.max(z, r.z + width / 2 + 0.1), r.z + r.d - width / 2 - 0.1);
  const placed: Item =
    side === 'north'
      ? { ...c, rotation: 0, w: width, d: bow, x: mid - width / 2, z: r.z - bow }
      : side === 'south'
        ? { ...c, rotation: 180, w: width, d: bow, x: mid - width / 2, z: r.z + r.d }
        : side === 'east'
          ? { ...c, rotation: 90, w: bow, d: width, x: r.x + r.w, z: mid - width / 2 }
          : { ...c, rotation: 270, w: bow, d: width, x: r.x - bow, z: mid - width / 2 };
  // Where along the room's wall the opening goes, as a share of its length.
  const offset = side === 'north' || side === 'south' ? (mid - r.x) / r.w : (mid - r.z) / r.d;
  return { curve: placed, room: r, side, offset, width: width - 0.1 };
}

/** Where a curve's chord (its straight side) runs, in plan: the middle, its axis and its line. */
function chordOf(c: Item) {
  switch (c.rotation) {
    case 90:
      return { axis: 'z' as const, line: c.x, mid: c.z + c.d / 2 };
    case 180:
      return { axis: 'x' as const, line: c.z, mid: c.x + c.w / 2 };
    case 270:
      return { axis: 'z' as const, line: c.x + c.w, mid: c.z + c.d / 2 };
    default:
      return { axis: 'x' as const, line: c.z + c.d, mid: c.x + c.w / 2 };
  }
}

/**
 * A curved wall resized: its straight side stays on the wall it stands on and keeps its middle,
 * so it grows outward and to both sides, and a wide opening joining it to a room widens with it.
 */
export function resizeCurve(
  p: { items: Item[]; openings: Opening[] },
  c: Item,
  w: number,
  d: number,
): { items: Item[]; openings: Opening[] } {
  const before = chordOf(c);
  const next: Item = { ...c, w, d };
  if (before.axis === 'x') next.x = before.mid - w / 2;
  else next.z = before.mid - d / 2;
  if (c.rotation === 0) next.z = before.line - d;
  if (c.rotation === 270) next.x = before.line - w;
  const span = before.axis === 'x' ? w : d;
  const openings = p.openings.map((o) => {
    if (o.kind !== 'arch') return o;
    const r = p.items.find((i) => i.id === o.roomId);
    if (!r || !isRoom(r)) return o;
    const horizontal = o.side === 'north' || o.side === 'south';
    if ((before.axis === 'x') !== horizontal) return o;
    const line =
      o.side === 'north'
        ? r.z
        : o.side === 'south'
          ? r.z + r.d
          : o.side === 'west'
            ? r.x
            : r.x + r.w;
    const mid = horizontal ? r.x + o.offset * r.w : r.z + o.offset * r.d;
    if (Math.abs(line - before.line) > 0.05 || Math.abs(mid - before.mid) > 0.3) return o;
    const wall = horizontal ? r.w : r.d;
    return { ...o, width: Math.round(Math.min(span - 0.1, wall - 0.2) * 100) / 100 };
  });
  return { items: p.items.map((i) => (i.id === c.id ? next : i)), openings };
}

/**
 * A porch, deck or balcony set down just outside a room: flush against that wall, centered where
 * you clicked. Anywhere else it goes where it was put.
 */
export function attachOutside(rooms: Item[], i: Item, x: number, z: number): Item {
  const reach = 1.2 + Math.max(i.w, i.d) / 2;
  let best: { r: Item; side: string; gap: number } | null = null;
  for (const r of rooms.filter(isRoom)) {
    const inX = x > r.x && x < r.x + r.w,
      inZ = z > r.z && z < r.z + r.d;
    for (const s of [
      { side: 'north', gap: r.z - z, ok: inX },
      { side: 'south', gap: z - (r.z + r.d), ok: inX },
      { side: 'west', gap: r.x - x, ok: inZ },
      { side: 'east', gap: x - (r.x + r.w), ok: inZ },
    ])
      if (s.ok && s.gap > 0 && s.gap < reach && (!best || s.gap < best.gap))
        best = { r, side: s.side, gap: s.gap };
  }
  if (!best) return i;
  // Nothing else is already built there.
  const { r, side } = best;
  const out = { ...i, x: x - i.w / 2, z: z - i.d / 2 };
  if (side === 'north') out.z = r.z - i.d;
  if (side === 'south') out.z = r.z + r.d;
  if (side === 'west') out.x = r.x - i.w;
  if (side === 'east') out.x = r.x + r.w;
  return out;
}
