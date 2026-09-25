import {
  buildWalls,
  createItem,
  isPassable,
  isOutside,
  isRoom,
  stairEntry,
  stairLevels,
  uid,
  type Item,
  type Project,
  type StairStyle,
} from './model';
import { layoutFor, stairEnds, toWorld } from './stairs';

const overlaps = (a: Item, b: { x: number; z: number; w: number; d: number }) =>
  a.x < b.x + b.w - 0.01 &&
  a.x + a.w > b.x + 0.01 &&
  a.z < b.z + b.d - 0.01 &&
  a.z + a.d > b.z + 0.01;

/** Finds a clear spot and facing on a level for new stairs, preferring halls and entries.
 * The bottom step must open into the room, not against a wall. */
export function findStairSpot(
  p: Project,
  level: number,
  style: StairStyle,
  dir: 'up' | 'down' = 'up',
) {
  const e = stairEntry(style);
  const rooms = p.items
    .filter((i) => i.kind === 'room' && i.floor === level)
    .sort((a, b) => {
      const pref = (r: Item) => (/hall|entry|foyer|landing|stair|mud/i.test(r.name) ? 1 : 0);
      return pref(b) - pref(a) || b.w * b.d - a.w * a.d;
    });
  const blockers = p.items.filter(
    (i) =>
      !isRoom(i) &&
      !isOutside(i) &&
      i.kind !== 'rug' &&
      (i.kind === 'stairs'
        ? stairLevels(i).lower === level || stairLevels(i).upper === level
        : i.floor === level),
  );
  // Keep a meter clear in front of every door and opening on this floor, both sides of the wall.
  const doorways = buildWalls(p)
    .filter((w) => w.floor === level)
    .flatMap((w) =>
      w.openings
        .filter((o) => isPassable(o.kind))
        .map((o) =>
          w.axis === 'x'
            ? { x: o.start - 0.4, z: w.line - 1, w: o.end - o.start + 0.8, d: 2 }
            : { x: w.line - 1, z: o.start - 0.4, w: 2, d: o.end - o.start + 0.8 },
        ),
    );
  // First look for an empty spot; failing that, allow furniture underfoot (but never other stairs).
  // Clear of furniture and doorways first; then over furniture; then, in a tight spot, across a
  // doorway rather than out in the garden.
  for (const [strict, clearDoors] of [
    [true, true],
    [false, true],
    [false, false],
  ])
    for (const r of rooms)
      for (const rotation of [0, 90, 180, 270]) {
        const w = rotation % 180 ? e.d : e.w,
          d = rotation % 180 ? e.w : e.d;
        if (r.w < w + 0.2 || r.d < d + 0.2) continue;
        // Try spots along the walls first, then inward.
        const xs: number[] = [],
          zs: number[] = [];
        for (let x = r.x + 0.1; x <= r.x + r.w - w - 0.1 + 1e-6; x += 0.25) xs.push(x);
        for (let z = r.z + 0.1; z <= r.z + r.d - d - 0.1 + 1e-6; z += 0.25) zs.push(z);
        const edge = (v: number, list: number[]) =>
          Math.min(v - list[0], list[list.length - 1] - v);
        const spots = xs
          .flatMap((x) => zs.map((z) => ({ x, z })))
          .sort(
            (a, b) =>
              Math.min(edge(a.x, xs), edge(a.z, zs)) - Math.min(edge(b.x, xs), edge(b.z, zs)),
          );
        for (const s of spots) {
          const box = { x: s.x, z: s.z, w, d };
          if (blockers.some((b) => (strict || b.kind === 'stairs') && overlaps(b, box))) continue;
          if (clearDoors && doorways.some((d) => overlaps({ ...box, id: '' } as Item, d))) continue;
          const probe = { ...createItem(e.id, level, s.x, s.z), w, d, rotation };
          // The end of the flight on this floor has to open into the room: the foot of stairs
          // going up, the head of stairs going down to a basement.
          const ends = stairEnds(probe);
          const [bx, bz] = dir === 'up' ? ends.bottom : ends.top;
          if (bx < r.x + 0.5 || bx > r.x + r.w - 0.5 || bz < r.z + 0.5 || bz > r.z + r.d - 0.5)
            continue;
          return { x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, rotation };
        }
      }
  const all = p.items.filter((i) => isRoom(i) && i.floor === level);
  if (all.length) {
    const maxX = Math.max(...all.map((i) => i.x + i.w)),
      minZ = Math.min(...all.map((i) => i.z));
    return { x: maxX + 0.5, z: minZ, rotation: 0 };
  }
  return { x: -e.w / 2, z: -e.d / 2, rotation: 0 };
}

/**
 * A room around a staircase on the floor it arrives at, to step off onto: a little way round the
 * sides, and a couple of meters out past the step you come off at. It keeps within the footprint of
 * the house below (or above, for a basement), so it never hangs out over the garden.
 */
export function landingFor(stair: Item, level: number, name: string, rooms: Item[] = []) {
  const { lower, upper } = stairLevels(stair);
  const path = layoutFor(stair).path.map(([u, v]) => toWorld(stair, u, v));
  const ends = stairEnds(stair);
  // The step you come off at on this level, and which way you're heading as you do.
  const [from, to] = level === upper ? [path[path.length - 1], ends.top] : [path[0], ends.bottom];
  const ex = to[0] - from[0],
    ez = to[1] - from[1];
  const side = 0.9,
    ahead = 2.2;
  let x0 = stair.x - side,
    x1 = stair.x + stair.w + side,
    z0 = stair.z - side,
    z1 = stair.z + stair.d + side;
  if (Math.abs(ex) > Math.abs(ez)) {
    if (ex > 0) x1 = Math.max(x1, to[0] + ahead);
    else x0 = Math.min(x0, to[0] - ahead);
  } else if (ez > 0) z1 = Math.max(z1, to[1] + ahead);
  else z0 = Math.min(z0, to[1] - ahead);
  // Trim to the house on the neighbouring floor, but never smaller than the stairs themselves.
  const other = rooms.filter((r) => isRoom(r) && r.floor === (level === upper ? lower : upper));
  if (other.length) {
    x0 = Math.min(Math.max(x0, Math.min(...other.map((r) => r.x))), stair.x);
    z0 = Math.min(Math.max(z0, Math.min(...other.map((r) => r.z))), stair.z);
    x1 = Math.max(Math.min(x1, Math.max(...other.map((r) => r.x + r.w))), stair.x + stair.w);
    z1 = Math.max(Math.min(z1, Math.max(...other.map((r) => r.z + r.d))), stair.z + stair.d);
  }
  // Whatever the trim, there's always somewhere to step off onto.
  const room = 0.35;
  x0 = Math.min(x0, to[0] - room);
  x1 = Math.max(x1, to[0] + room);
  z0 = Math.min(z0, to[1] - room);
  z1 = Math.max(z1, to[1] + room);
  const landing = createItem('room', level, 0, 0);
  const x = Math.floor(x0 * 4) / 4,
    z = Math.floor(z0 * 4) / 4;
  Object.assign(landing, {
    name,
    x,
    z,
    w: Math.ceil((x1 - x) * 4) / 4,
    d: Math.ceil((z1 - z) * 4) / 4,
  });
  return landing;
}

export const defaultFloorName = (level: number) =>
  level < 0
    ? `Basement${level < -1 ? ` ${-level}` : ''}`
    : level === 1
      ? 'Upstairs'
      : `Floor ${level + 1}`;
/** The level a new upper floor or basement would get. */
export const nextLevel = (p: Project, type: 'upper' | 'basement') =>
  type === 'upper'
    ? Math.max(0, ...p.floors.map((f) => f.level)) + 1
    : Math.min(0, ...p.floors.map((f) => f.level)) - 1;

export interface AddLevelOptions {
  type: 'upper' | 'basement';
  name?: string;
  /** Copy rooms, doors, and furniture from this level. */
  copyFrom?: number;
  /** Lay stairs from the neighboring floor, with a landing on the new floor. */
  stairs?: StairStyle | null;
  /** Use this existing staircase instead of laying a new one. */
  stairId?: string;
}

export function addLevel(p: Project, o: AddLevelOptions) {
  const level = nextLevel(p, o.type);
  if (level > 8 || level < -3) return null;
  const from = o.type === 'upper' ? level - 1 : level + 1;
  const source = o.copyFrom ?? null;
  const originals =
    source === null
      ? []
      : p.items.filter((i) => i.floor === source && !isOutside(i) && i.kind !== 'stairs');
  const ids = new Map(originals.map((i) => [i.id, uid()]));
  const items: Item[] = [
    ...p.items,
    ...originals.map((i) => ({ ...i, id: ids.get(i.id)!, floor: level })),
  ];
  const openings = [
    ...p.openings,
    ...p.openings
      .filter((op) => ids.has(op.roomId))
      .map((op) => ({ ...op, id: uid(), roomId: ids.get(op.roomId)! })),
  ];
  let stair: Item | undefined = o.stairId ? items.find((i) => i.id === o.stairId) : undefined;
  if (!stair && o.stairs) {
    const e = stairEntry(o.stairs);
    const spot = findStairSpot({ ...p, items }, from, o.stairs, o.type === 'upper' ? 'up' : 'down');
    stair = createItem(e.id, from, spot.x, spot.z);
    if (spot.rotation % 180) [stair.w, stair.d] = [stair.d, stair.w];
    stair.rotation = spot.rotation;
    stair.dir = o.type === 'upper' ? 'up' : 'down';
    items.push(stair);
  }
  // A landing gives the new floor somewhere to stand at the top (or bottom) of the stairs.
  if (stair && !items.some((i) => isRoom(i) && i.floor === level && overlaps(i, stair!))) {
    items.push(landingFor(stair, level, o.type === 'upper' ? 'Landing' : 'Stair hall', items));
  }
  const name = o.name?.trim() || defaultFloorName(level);
  return {
    level,
    project: {
      ...p,
      floors: [...p.floors, { level, name }].sort((a, b) => a.level - b.level),
      items,
      openings,
    } as Project,
  };
}

/**
 * Drawing a room right over the landing (or stair hall) Hearth made for a new floor takes it in:
 * the two become one room, so no walls are left standing round the stairs with no way out.
 * Only a landing that is still as it was made, with no doors of its own, goes.
 */
export function absorbLandings(p: Project, roomId: string) {
  const room = p.items.find((i) => i.id === roomId);
  if (!room || !isRoom(room)) return { project: p, absorbed: [] as string[] };
  const swallowed = p.items.filter(
    (i) =>
      i.id !== room.id &&
      i.kind === 'room' &&
      i.floor === room.floor &&
      /^(landing|stair hall)$/i.test(i.name.trim()) &&
      !p.openings.some((o) => o.roomId === i.id) &&
      i.x >= room.x - 0.01 &&
      i.z >= room.z - 0.01 &&
      i.x + i.w <= room.x + room.w + 0.01 &&
      i.z + i.d <= room.z + room.d + 0.01,
  );
  if (!swallowed.length) return { project: p, absorbed: [] as string[] };
  const gone = new Set(swallowed.map((i) => i.id));
  return {
    project: { ...p, items: p.items.filter((i) => !gone.has(i.id)) },
    absorbed: swallowed.map((i) => i.name),
  };
}
