// Where furniture lands on the plan: inside the room it's set down in, flush against that room's
// walls when it's close to them, and (for pieces with a back) turned to face into the room.
import { isOutside, isRoom, type Item } from './model';

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
