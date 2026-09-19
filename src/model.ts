export type Kind =
  | 'room'
  | 'garage'
  | 'deck'
  | 'driveway'
  | 'grass'
  | 'pool'
  | 'tree'
  | 'sofa'
  | 'bed'
  | 'table'
  | 'counter'
  | 'stairs'
  | 'fence';
export type Side = 'north' | 'south' | 'east' | 'west';
export interface Item {
  id: string;
  kind: Kind;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floor: number;
  color: string;
  rotation: number;
}
export interface Opening {
  id: string;
  roomId: string;
  side: Side;
  offset: number;
  width: number;
  kind: 'window' | 'door';
}
export interface Floor {
  level: number;
  name: string;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  updated: string;
  floors: Floor[];
  items: Item[];
  openings: Opening[];
  exterior: string;
  roof: string;
  roofStyle: 'gable' | 'flat';
  units: 'ft' | 'm';
}
export const uid = () => crypto.randomUUID();
export const snap = (n: number, enabled = true) =>
  enabled ? Math.round(n * 4) / 4 : Math.round(n * 100) / 100;
export const isRoom = (i: Item) => i.kind === 'room' || i.kind === 'garage';
export const isOutside = (i: Item) =>
  ['deck', 'driveway', 'grass', 'pool', 'tree', 'fence'].includes(i.kind);
export const catalog: {
  kind: Kind;
  name: string;
  hint: string;
  w: number;
  d: number;
  color: string;
  group: 'Build' | 'Furnish' | 'Landscape';
}[] = [
  {
    kind: 'room',
    name: 'Room',
    hint: 'Draw any size',
    w: 4,
    d: 4,
    color: '#e4ddcf',
    group: 'Build',
  },
  {
    kind: 'garage',
    name: 'Garage',
    hint: 'Space for your wheels',
    w: 4,
    d: 6,
    color: '#d5d9d7',
    group: 'Build',
  },
  {
    kind: 'stairs',
    name: 'Stairs',
    hint: 'A visual floor connection',
    w: 1.2,
    d: 3,
    color: '#c7b59e',
    group: 'Build',
  },
  {
    kind: 'sofa',
    name: 'Sofa',
    hint: 'Settle in',
    w: 2.4,
    d: 1,
    color: '#88a79b',
    group: 'Furnish',
  },
  {
    kind: 'bed',
    name: 'Bed',
    hint: 'A restful retreat',
    w: 1.8,
    d: 2.1,
    color: '#b3b9cb',
    group: 'Furnish',
  },
  {
    kind: 'table',
    name: 'Dining table',
    hint: 'Gather together',
    w: 1.8,
    d: 1,
    color: '#c9a87c',
    group: 'Furnish',
  },
  {
    kind: 'counter',
    name: 'Kitchen island',
    hint: 'The heart of your home',
    w: 2.4,
    d: 0.9,
    color: '#d4c7b5',
    group: 'Furnish',
  },
  {
    kind: 'deck',
    name: 'Patio / deck',
    hint: 'Take life outside',
    w: 5,
    d: 3,
    color: '#c2a781',
    group: 'Landscape',
  },
  {
    kind: 'driveway',
    name: 'Driveway',
    hint: 'A warm welcome',
    w: 4,
    d: 6,
    color: '#bcbeb8',
    group: 'Landscape',
  },
  {
    kind: 'grass',
    name: 'Lawn',
    hint: 'A little more green',
    w: 5,
    d: 4,
    color: '#9ab580',
    group: 'Landscape',
  },
  {
    kind: 'pool',
    name: 'Pool',
    hint: 'Your own blue escape',
    w: 3,
    d: 6,
    color: '#80c9cc',
    group: 'Landscape',
  },
  {
    kind: 'tree',
    name: 'Tree',
    hint: 'Room to grow',
    w: 1.8,
    d: 1.8,
    color: '#6f9569',
    group: 'Landscape',
  },
  {
    kind: 'fence',
    name: 'Fence',
    hint: 'Frame your garden',
    w: 5,
    d: 0.15,
    color: '#b4a58b',
    group: 'Landscape',
  },
];
export function createItem(kind: Kind, floor: number, x: number, z: number): Item {
  const c = catalog.find((c) => c.kind === kind)!;
  return {
    id: uid(),
    kind,
    name: c.name,
    x,
    z,
    w: c.w,
    d: c.d,
    color: c.color,
    floor: isOutside({ kind } as Item) ? 0 : floor,
    rotation: 0,
  };
}
export function blankProject(): Project {
  return {
    version: 1,
    id: uid(),
    name: 'My dream home',
    updated: new Date().toISOString(),
    floors: [{ level: 0, name: 'Ground floor' }],
    items: [],
    openings: [],
    exterior: '#f0e9dc',
    roof: '#586662',
    roofStyle: 'gable',
    units: 'ft',
  };
}
export function sampleProject(): Project {
  const p = blankProject();
  p.name = 'The Sunday House';
  const add = (
    kind: Kind,
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    color?: string,
  ) => {
    const i = createItem(kind, 0, x, z);
    Object.assign(i, { name, w, d, ...(color ? { color } : {}) });
    p.items.push(i);
    return i;
  };
  const living = add('room', 'Living room', -6, -4, 6, 5, '#e6ddca');
  const kitchen = add('room', 'Kitchen & dining', 0, -4, 4, 5, '#e9e2d5');
  const bath = add('room', 'Bathroom', 4, -4, 2, 3, '#dbe8e4');
  const entry = add('room', 'Entry', 4, -1, 2, 2, '#eae0d1');
  const bed = add('room', 'Bedroom', -6, 1, 5, 4, '#e2dfea');
  const study = add('room', 'Creative studio', -1, 1, 4, 4, '#e3e6d7');
  const hall = add('room', 'Hallway', 3, 1, 3, 4, '#eae0d1');
  const garage = add('garage', 'Garage', 6, -1, 4, 6);
  add('deck', 'Evening terrace', -6, -7, 10, 3);
  add('driveway', 'Driveway', 6, 5, 4, 6);
  add('pool', 'Plunge pool', -11, -4, 3, 6);
  add('tree', 'Japanese maple', -9, 5, 2, 2);
  add('tree', 'Garden tree', 3, -9, 2.5, 2.5);
  add('tree', 'Garden tree', -10, -8, 2, 2);
  add('tree', 'Garden tree', 10, -5, 2.5, 2.5);
  add('sofa', 'Linen sofa', -5, -2.6, 2.8, 1.1);
  add('table', 'Coffee table', -4.6, -0.9, 1.8, 0.8);
  add('counter', 'Kitchen island', 0.5, -3, 2.6, 0.9);
  add('table', 'Dining table', 0.8, -1.1, 2, 1.2);
  add('bed', 'King bed', -5.2, 1.6, 2, 2.2);
  add('table', 'Writing desk', -0.3, 1.5, 2, 0.8);
  add('stairs', 'Stairs', 4.2, 1.5, 1.1, 2.8);
  const opening = (r: Item, side: Side, offset: number, width: number, kind: 'window' | 'door') =>
    p.openings.push({ id: uid(), roomId: r.id, side, offset, width, kind });
  opening(living, 'north', 0.45, 2.8, 'window');
  opening(living, 'west', 0.55, 2, 'window');
  opening(living, 'east', 0.5, 1.4, 'door');
  opening(living, 'south', 0.7, 1, 'door');
  opening(kitchen, 'north', 0.5, 2.3, 'window');
  opening(kitchen, 'east', 0.8, 1, 'door');
  opening(kitchen, 'south', 0.7, 1, 'door');
  opening(bath, 'north', 0.5, 0.9, 'window');
  opening(bath, 'south', 0.5, 0.9, 'door');
  opening(entry, 'east', 0.5, 1, 'door');
  opening(entry, 'south', 0.5, 1, 'door');
  opening(bed, 'west', 0.5, 1.5, 'window');
  opening(bed, 'east', 0.5, 1, 'door');
  opening(study, 'south', 0.5, 1.7, 'window');
  opening(study, 'east', 0.5, 1, 'door');
  opening(hall, 'east', 0.5, 1, 'door');
  opening(garage, 'south', 0.5, 3, 'door');
  return p;
}
export function formatLength(n: number, units: Project['units']) {
  return units === 'm' ? `${n.toFixed(1)} m` : `${(n * 3.28084).toFixed(1)} ft`;
}
export function area(p: Project, level?: number) {
  const rooms = p.items.filter(
    (i) => i.kind === 'room' && (level === undefined || i.floor === level),
  );
  return rooms.reduce((s, i) => s + i.w * i.d, 0) * (p.units === 'ft' ? 10.7639 : 1);
}
export function validateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a Hearth project.');
  const p = raw as Project;
  const num = (v: unknown, min = -200, max = 200) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 120;
  const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (
    p.version !== 1 ||
    !str(p.name) ||
    !str(p.id) ||
    !str(p.updated) ||
    !Array.isArray(p.floors) ||
    p.floors.length < 1 ||
    p.floors.length > 12 ||
    !Array.isArray(p.items) ||
    p.items.length > 1000 ||
    !Array.isArray(p.openings) ||
    p.openings.length > 2000 ||
    !color(p.exterior) ||
    !color(p.roof) ||
    !['gable', 'flat'].includes(p.roofStyle) ||
    !['ft', 'm'].includes(p.units)
  )
    throw new Error('Unsupported or damaged project file.');
  const levels = new Set<number>();
  const ids = new Set<string>();
  for (const f of p.floors) {
    if (!str(f.name) || !Number.isInteger(f.level) || !num(f.level, -3, 8) || levels.has(f.level))
      throw new Error('Invalid floors.');
    levels.add(f.level);
  }
  for (const i of p.items) {
    if (
      !str(i.id) ||
      ids.has(i.id) ||
      !catalog.some((c) => c.kind === i.kind) ||
      !str(i.name) ||
      !levels.has(i.floor) ||
      !num(i.x) ||
      !num(i.z) ||
      !num(i.w, 0.1, 100) ||
      !num(i.d, 0.1, 100) ||
      !num(i.rotation, 0, 360) ||
      !color(i.color)
    )
      throw new Error('Invalid shape in project.');
    ids.add(i.id);
  }
  const openingIds = new Set<string>();
  for (const o of p.openings) {
    const room = p.items.find((i) => i.id === o.roomId);
    if (
      !str(o.id) ||
      openingIds.has(o.id) ||
      !room ||
      !isRoom(room) ||
      !['north', 'south', 'east', 'west'].includes(o.side) ||
      !['window', 'door'].includes(o.kind) ||
      !num(o.offset, 0, 1) ||
      !num(o.width, 0.3, 10)
    )
      throw new Error('Invalid window or door.');
    openingIds.add(o.id);
  }
  return structuredClone(p);
}
// Shared walls are split at room boundaries, then drawn once. Openings on either
// adjoining room are projected into the shared wall, so doorways stay passable.
export interface Wall {
  axis: 'x' | 'z';
  line: number;
  start: number;
  end: number;
  floor: number;
  openings: { start: number; end: number; kind: 'window' | 'door' }[];
}
export function buildWalls(p: Project): Wall[] {
  const segments: {
    axis: 'x' | 'z';
    line: number;
    start: number;
    end: number;
    floor: number;
    openings: Wall['openings'];
  }[] = [];
  for (const r of p.items.filter(isRoom))
    for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
      const horizontal = side === 'north' || side === 'south',
        start = horizontal ? r.x : r.z,
        len = horizontal ? r.w : r.d;
      const openings = p.openings
        .filter((o) => o.roomId === r.id && o.side === side)
        .map((o) => {
          const width = Math.min(o.width, len - 0.2);
          const c = Math.max(width / 2 + 0.1, Math.min(len - width / 2 - 0.1, len * o.offset));
          return { start: start + c - width / 2, end: start + c + width / 2, kind: o.kind };
        });
      segments.push({
        axis: horizontal ? 'x' : 'z',
        line:
          side === 'north' ? r.z : side === 'south' ? r.z + r.d : side === 'west' ? r.x : r.x + r.w,
        start,
        end: start + len,
        floor: r.floor,
        openings,
      });
    }
  const groups = new Map<string, typeof segments>();
  for (const s of segments) {
    const key = `${s.floor}:${s.axis}:${s.line.toFixed(3)}`;
    groups.set(key, [...(groups.get(key) || []), s]);
  }
  const walls: Wall[] = [];
  for (const group of groups.values()) {
    const cuts = [...new Set(group.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1],
        cover = group.filter((s) => s.start <= start + 0.001 && s.end >= end - 0.001);
      if (!cover.length) continue;
      walls.push({
        ...cover[0],
        start,
        end,
        openings: cover
          .flatMap((s) => s.openings)
          .filter((o) => o.start < end && o.end > start)
          .map((o) => ({ ...o, start: Math.max(start, o.start), end: Math.min(end, o.end) })),
      });
    }
  }
  return walls;
}
export function removeItem(p: Project, id: string): Project {
  return {
    ...p,
    items: p.items.filter((i) => i.id !== id),
    openings: p.openings.filter((o) => o.roomId !== id),
  };
}
