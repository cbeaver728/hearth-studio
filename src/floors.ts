import {
  createItem,
  isOutside,
  isRoom,
  stairEntry,
  stairLevels,
  uid,
  type Item,
  type Project,
  type StairStyle,
} from './model';

const overlaps = (a: Item, b: { x: number; z: number; w: number; d: number }) =>
  a.x < b.x + b.w - 0.01 &&
  a.x + a.w > b.x + 0.01 &&
  a.z < b.z + b.d - 0.01 &&
  a.z + a.d > b.z + 0.01;

/** Finds a clear spot on a level for a staircase footprint, preferring halls and entries. */
export function findStairSpot(p: Project, level: number, w: number, d: number) {
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
  // First look for an empty spot; failing that, allow furniture underfoot (but never other stairs).
  for (const strict of [true, false])
    for (const r of rooms) {
      if (r.w < w + 0.2 || r.d < d + 0.2) continue;
      // Try spots along the walls first, then inward.
      const xs: number[] = [],
        zs: number[] = [];
      for (let x = r.x + 0.1; x <= r.x + r.w - w - 0.1 + 1e-6; x += 0.25) xs.push(x);
      for (let z = r.z + 0.1; z <= r.z + r.d - d - 0.1 + 1e-6; z += 0.25) zs.push(z);
      const edge = (v: number, list: number[]) => Math.min(v - list[0], list[list.length - 1] - v);
      const spots = xs
        .flatMap((x) => zs.map((z) => ({ x, z })))
        .sort(
          (a, b) => Math.min(edge(a.x, xs), edge(a.z, zs)) - Math.min(edge(b.x, xs), edge(b.z, zs)),
        );
      for (const s of spots) {
        const box = { x: s.x, z: s.z, w, d };
        if (!blockers.some((b) => (strict || b.kind === 'stairs') && overlaps(b, box)))
          return { x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100 };
      }
    }
  const all = p.items.filter((i) => isRoom(i) && i.floor === level);
  if (all.length) {
    const maxX = Math.max(...all.map((i) => i.x + i.w)),
      minZ = Math.min(...all.map((i) => i.z));
    return { x: maxX + 0.5, z: minZ };
  }
  return { x: -w / 2, z: -d / 2 };
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
    const spot = findStairSpot({ ...p, items }, from, e.w, e.d);
    stair = createItem(e.id, from, spot.x, spot.z);
    stair.dir = o.type === 'upper' ? 'up' : 'down';
    items.push(stair);
  }
  // A landing gives the new floor somewhere to stand at the top (or bottom) of the stairs.
  if (stair && !items.some((i) => isRoom(i) && i.floor === level && overlaps(i, stair!))) {
    const m = 1.25;
    const landing = createItem('room', level, 0, 0);
    Object.assign(landing, {
      name: o.type === 'upper' ? 'Landing' : 'Stair hall',
      x: Math.floor((stair.x - m) * 4) / 4,
      z: Math.floor((stair.z - m) * 4) / 4,
      w: Math.ceil((stair.w + 2 * m) * 4) / 4,
      d: Math.ceil((stair.d + 2 * m) * 4) / 4,
    });
    items.push(landing);
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
