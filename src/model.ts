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
  | 'fence'
  | 'armchair'
  | 'rug'
  | 'media'
  | 'wardrobe'
  | 'desk'
  | 'kitchen'
  | 'fridge'
  | 'fireplace'
  | 'bathtub'
  | 'shower'
  | 'toilet'
  | 'vanity'
  | 'plant'
  | 'coffee';
export type StairStyle = 'straight' | 'l' | 'u' | 'spiral';
export type Side = 'north' | 'south' | 'east' | 'west';
/** Floor-to-floor height in meters. */
export const FLOOR_H = 3.2;
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
  /** Which way the piece faces, in quarter turns clockwise (0, 90, 180, 270). The footprint
   * (w × d) is always the axis-aligned box on the plan. For stairs, 0 means you climb
   * heading north (toward the top of the plan). */
  rotation: number;
  /** Stairs only. */
  style?: StairStyle;
  /** Stairs only: whether they lead up or down from the floor they were laid on. */
  dir?: 'up' | 'down';
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
  interior?: string;
  roof: string;
  roofStyle: 'gable' | 'flat';
  units: 'ft' | 'm';
  /** Free-form notes about this version of the design. */
  notes?: string;
  /** Rough building cost per square foot, for the estimate. */
  costPerSqFt?: number;
}
export const uid = () => crypto.randomUUID();
export const snap = (n: number, enabled = true) =>
  enabled ? Math.round(n * 4) / 4 : Math.round(n * 100) / 100;
export const isRoom = (i: Item) => i.kind === 'room' || i.kind === 'garage';
export const isOutside = (i: Item) =>
  ['deck', 'driveway', 'grass', 'pool', 'tree', 'fence'].includes(i.kind);
export interface CatalogEntry {
  id: string;
  kind: Kind;
  name: string;
  hint: string;
  w: number;
  d: number;
  color: string;
  group: 'Build' | 'Furnish' | 'Landscape';
  section?: string;
  style?: StairStyle;
}
const entry = (
  id: string,
  kind: Kind,
  name: string,
  hint: string,
  w: number,
  d: number,
  color: string,
  group: CatalogEntry['group'],
  section?: string,
  style?: StairStyle,
): CatalogEntry => ({ id, kind, name, hint, w, d, color, group, section, style });
export const catalog: CatalogEntry[] = [
  entry('room', 'room', 'Room', 'Draw any size', 4, 4, '#e4ddcf', 'Build'),
  entry('garage', 'garage', 'Garage', 'Space for your wheels', 4, 6, '#d5d9d7', 'Build'),
  entry(
    'stairs',
    'stairs',
    'Straight',
    'One simple run',
    1.1,
    4.1,
    '#c7b59e',
    'Build',
    'Stairs',
    'straight',
  ),
  entry(
    'stairs-l',
    'stairs',
    'L-shaped',
    'Turns at a landing',
    2.9,
    2.9,
    '#c7b59e',
    'Build',
    'Stairs',
    'l',
  ),
  entry(
    'stairs-u',
    'stairs',
    'Switchback',
    'Cuts back on itself',
    2.3,
    3,
    '#c7b59e',
    'Build',
    'Stairs',
    'u',
  ),
  entry(
    'stairs-spiral',
    'stairs',
    'Spiral',
    'Compact and dramatic',
    2.1,
    2.1,
    '#b9a58a',
    'Build',
    'Stairs',
    'spiral',
  ),
  entry('sofa', 'sofa', 'Sofa', 'Settle in', 2.4, 1, '#88a79b', 'Furnish', 'Living'),
  entry(
    'armchair',
    'armchair',
    'Armchair',
    'A favorite seat',
    0.9,
    0.9,
    '#b8a58a',
    'Furnish',
    'Living',
  ),
  entry('coffee', 'coffee', 'Coffee table', 'Feet up', 1.2, 0.6, '#b8976f', 'Furnish', 'Living'),
  entry('rug', 'rug', 'Rug', 'Soften the floor', 2.4, 1.7, '#c9b8a0', 'Furnish', 'Living'),
  entry('media', 'media', 'TV & console', 'Movie night', 1.8, 0.45, '#6d625a', 'Furnish', 'Living'),
  entry(
    'fireplace',
    'fireplace',
    'Fireplace',
    'The hearth of the home',
    1.6,
    0.6,
    '#b9b2a6',
    'Furnish',
    'Living',
  ),
  entry('plant', 'plant', 'House plant', 'A little life', 0.6, 0.6, '#6f9569', 'Furnish', 'Living'),
  entry(
    'table',
    'table',
    'Dining table',
    'Gather together',
    1.8,
    1,
    '#c9a87c',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'counter',
    'counter',
    'Kitchen island',
    'The heart of the home',
    2.4,
    0.9,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'kitchen',
    'kitchen',
    'Kitchen counter',
    'Sink, cooktop, cabinets',
    3,
    0.65,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'fridge',
    'fridge',
    'Refrigerator',
    'Keep it cool',
    0.9,
    0.75,
    '#dfe2e0',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'bed',
    'bed',
    'Bed',
    'A restful retreat',
    1.8,
    2.1,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'wardrobe',
    'wardrobe',
    'Wardrobe',
    'A place for everything',
    1.6,
    0.6,
    '#b59d80',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'desk',
    'desk',
    'Desk',
    'Room to create',
    1.4,
    0.7,
    '#b8976f',
    'Furnish',
    'Bedroom & office',
  ),
  entry('bathtub', 'bathtub', 'Bathtub', 'A long soak', 1.7, 0.8, '#f3f3ef', 'Furnish', 'Bathroom'),
  entry('shower', 'shower', 'Shower', 'Glass walk-in', 1.2, 1, '#dde9ea', 'Furnish', 'Bathroom'),
  entry(
    'toilet',
    'toilet',
    'Toilet',
    'The essentials',
    0.45,
    0.7,
    '#f3f3ef',
    'Furnish',
    'Bathroom',
  ),
  entry(
    'vanity',
    'vanity',
    'Vanity',
    'Sink and storage',
    1.2,
    0.55,
    '#b9a58a',
    'Furnish',
    'Bathroom',
  ),
  entry('deck', 'deck', 'Patio / deck', 'Take life outside', 5, 3, '#c2a781', 'Landscape'),
  entry('driveway', 'driveway', 'Driveway', 'A warm welcome', 4, 6, '#bcbeb8', 'Landscape'),
  entry('grass', 'grass', 'Lawn', 'A little more green', 5, 4, '#9ab580', 'Landscape'),
  entry('pool', 'pool', 'Pool', 'Your own blue escape', 3, 6, '#80c9cc', 'Landscape'),
  entry('tree', 'tree', 'Tree', 'Room to grow', 1.8, 1.8, '#6f9569', 'Landscape'),
  entry('fence', 'fence', 'Fence', 'Frame your garden', 5, 0.15, '#b4a58b', 'Landscape'),
];
export const catalogEntry = (id: string) =>
  catalog.find((e) => e.id === id) || catalog.find((e) => e.kind === id);
export const stairEntry = (style: StairStyle = 'straight') =>
  catalog.find((e) => e.kind === 'stairs' && e.style === style)!;
export const stairNames: Record<StairStyle, string> = {
  straight: 'Straight stairs',
  l: 'L-shaped stairs',
  u: 'Switchback stairs',
  spiral: 'Spiral stairs',
};
/** Creates a shape from a catalog id (or a kind, which uses that kind's first entry). */
export function createItem(id: string, floor: number, x: number, z: number): Item {
  const c = catalogEntry(id)!;
  const item: Item = {
    id: uid(),
    kind: c.kind,
    name: c.kind === 'stairs' ? stairNames[c.style || 'straight'] : c.name,
    x,
    z,
    w: c.w,
    d: c.d,
    color: c.color,
    floor: isOutside({ kind: c.kind } as Item) ? 0 : floor,
    rotation: 0,
  };
  if (c.kind === 'stairs') {
    item.style = c.style || 'straight';
    item.dir = 'up';
  }
  return item;
}
/** The two levels a staircase joins. */
export function stairLevels(i: Item) {
  const lower = i.dir === 'down' ? i.floor - 1 : i.floor;
  return { lower, upper: lower + 1 };
}
/** Whether a shape belongs on a level's plan. Stairs show on both levels they join. */
export function onLevel(i: Item, level: number) {
  if (i.kind !== 'stairs') return i.floor === level;
  const { lower, upper } = stairLevels(i);
  return level === lower || level === upper;
}
export const hasFloor = (p: Project, level: number) => p.floors.some((f) => f.level === level);
export const floorName = (p: Project, level: number) =>
  p.floors.find((f) => f.level === level)?.name ||
  (level < 0 ? `Basement ${-level}` : level === 0 ? 'Ground floor' : `Floor ${level + 1}`);
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
    interior: '#f4efe6',
    roof: '#586662',
    roofStyle: 'gable',
    units: 'ft',
  };
}
export function sampleProject(): Project {
  const p = blankProject();
  p.name = 'The Sunday House';
  const add = (
    kind: string,
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    color?: string,
    rotation = 0,
  ) => {
    const i = createItem(kind, 0, x, z);
    Object.assign(i, { name, w, d, rotation, ...(color ? { color } : {}) });
    p.items.push(i);
    return i;
  };
  const living = add('room', 'Living room', -6, -4, 6, 5, '#e6ddca');
  const kitchen = add('room', 'Kitchen & dining', 0, -4, 4, 5, '#e9e2d5');
  const bath = add('room', 'Bathroom', 4, -4, 2, 3, '#dbe8e4');
  const entryRoom = add('room', 'Entry', 4, -1, 2, 2, '#eae0d1');
  const bed = add('room', 'Bedroom', -6, 1, 5, 4, '#e2dfea');
  const study = add('room', 'Creative studio', -1, 1, 4, 4, '#e3e6d7');
  const hall = add('room', 'Front hall', 3, 1, 3, 4, '#eae0d1');
  const garage = add('garage', 'Garage', 6, -1, 4, 6);
  add('deck', 'Evening terrace', -6, -7, 10, 3);
  add('driveway', 'Driveway', 6, 5, 4, 6);
  add('pool', 'Plunge pool', -11, -4, 3, 6);
  add('tree', 'Japanese maple', -9, 5, 2, 2);
  add('tree', 'Garden tree', 3, -9, 2.5, 2.5);
  add('tree', 'Garden tree', -10, -8, 2, 2);
  add('tree', 'Garden tree', 10, -5, 2.5, 2.5);
  add('rug', 'Wool rug', -4.6, -2.9, 3.2, 2.6);
  add('sofa', 'Linen sofa', -4.4, -1.2, 2.8, 1, undefined, 180);
  add('coffee', 'Coffee table', -3.8, -2.45, 1.6, 0.7);
  add('fireplace', 'Fireplace', -3.8, -3.95, 1.6, 0.55);
  add('armchair', 'Reading chair', -1.2, -2.6, 0.9, 0.9, undefined, 90);
  add('kitchen', 'Kitchen counter', 0.1, -3.92, 2.9, 0.65);
  add('fridge', 'Refrigerator', 3.05, -3.9, 0.85, 0.75);
  add('counter', 'Kitchen island', 0.7, -2.85, 2.6, 0.9);
  add('table', 'Dining table', 0.8, -1.1, 2, 1.2);
  add('bathtub', 'Bathtub', 4.1, -3.9, 1.8, 0.8);
  add('toilet', 'Toilet', 5.2, -2.4, 0.7, 0.45, undefined, 90);
  add('vanity', 'Vanity', 4.08, -2.9, 0.5, 1, undefined, 270);
  add('bed', 'King bed', -5.2, 1.1, 2, 2.2);
  add('wardrobe', 'Wardrobe', -2.8, 4.35, 1.6, 0.6, undefined, 180);
  add('desk', 'Writing desk', -0.3, 1.2, 2, 0.8);
  add('plant', 'Fiddle-leaf fig', 1.9, 4.1, 0.6, 0.6);
  add('stairs', 'Stairs', 4.8, 1.05, 1.1, 3.4);
  // Upstairs: bedrooms around a landing at the top of the stairs.
  p.floors.push({ level: 1, name: 'Upstairs' });
  const up = (
    kind: string,
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    color?: string,
    rotation = 0,
  ) => {
    const i = add(kind, name, x, z, w, d, color, rotation);
    i.floor = 1;
    return i;
  };
  const landing = up('room', 'Landing', 3, -1, 3, 6, '#eae0d1');
  const suite = up('room', 'Primary suite', -6, -4, 5, 9, '#e2dfea');
  const loft = up('room', 'Reading loft', -1, -4, 4, 5, '#e6ddca');
  const kids = up('room', "Kids' room", -1, 1, 4, 4, '#e3e6d7');
  const upBath = up('room', 'Upstairs bath', 3, -4, 3, 3, '#dbe8e4');
  up('bed', 'King bed', -4.5, -3.8, 2, 2.2);
  up('wardrobe', 'Wardrobe', -5.9, 1.5, 0.6, 1.8, undefined, 270);
  up('armchair', 'Chair', -2.2, 3.6, 0.9, 0.9, undefined, 270);
  up('sofa', 'Loft sofa', -0.4, -3.9, 2.4, 1, '#b8a58a');
  up('rug', 'Rug', -0.2, -2.6, 2.4, 1.7);
  up('bed', 'Twin bed', 0.8, 3.7, 2.1, 1.1, '#d9b9a5', 90);
  up('desk', 'Homework desk', -0.9, 1.1, 1.3, 0.6);
  up('bathtub', 'Bathtub', 4.15, -3.9, 1.75, 0.8);
  up('vanity', 'Vanity', 3.08, -2.7, 0.5, 1, undefined, 270);
  up('toilet', 'Toilet', 5.2, -2.3, 0.7, 0.45, undefined, 90);
  const opening = (r: Item, side: Side, offset: number, width: number, kind: 'window' | 'door') =>
    p.openings.push({ id: uid(), roomId: r.id, side, offset, width, kind });
  opening(landing, 'east', 0.5, 1.2, 'window');
  opening(suite, 'west', 0.35, 1.8, 'window');
  opening(suite, 'north', 0.5, 1.6, 'window');
  opening(suite, 'east', 0.28, 0.9, 'door');
  opening(loft, 'north', 0.5, 2.2, 'window');
  opening(loft, 'east', 0.8, 0.9, 'door');
  opening(kids, 'south', 0.5, 1.4, 'window');
  opening(kids, 'east', 0.5, 0.9, 'door');
  opening(upBath, 'north', 0.5, 0.8, 'window');
  opening(upBath, 'south', 0.5, 0.8, 'door');
  opening(living, 'north', 0.45, 2.8, 'window');
  opening(living, 'west', 0.55, 2, 'window');
  opening(living, 'east', 0.5, 1.4, 'door');
  opening(living, 'south', 0.7, 1, 'door');
  opening(kitchen, 'north', 0.5, 2.3, 'window');
  opening(kitchen, 'east', 0.8, 1, 'door');
  opening(kitchen, 'south', 0.7, 1, 'door');
  opening(bath, 'north', 0.5, 0.9, 'window');
  opening(bath, 'south', 0.5, 0.9, 'door');
  opening(entryRoom, 'east', 0.5, 1, 'door');
  opening(entryRoom, 'south', 0.5, 1, 'door');
  opening(bed, 'west', 0.5, 1.5, 'window');
  opening(bed, 'east', 0.5, 1, 'door');
  opening(study, 'south', 0.5, 1.7, 'window');
  opening(study, 'east', 0.5, 1, 'door');
  opening(hall, 'south', 0.25, 1, 'door');
  opening(garage, 'south', 0.5, 3, 'door');
  return p;
}
export function formatLength(n: number, units: Project['units']) {
  if (units === 'm') return `${n.toFixed(2).replace(/0$/, '')} m`;
  const inches = Math.round(n * 39.3701);
  const ft = Math.floor(inches / 12),
    rest = inches % 12;
  return rest ? `${ft}′ ${rest}″` : `${ft}′`;
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
    (p.interior !== undefined && !color(p.interior)) ||
    !color(p.roof) ||
    !['gable', 'flat'].includes(p.roofStyle) ||
    !['ft', 'm'].includes(p.units) ||
    (p.notes !== undefined && (typeof p.notes !== 'string' || p.notes.length > 4000)) ||
    (p.costPerSqFt !== undefined && !num(p.costPerSqFt, 0, 5000))
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
      !color(i.color) ||
      (i.style !== undefined && !['straight', 'l', 'u', 'spiral'].includes(i.style)) ||
      (i.dir !== undefined && !['up', 'down'].includes(i.dir))
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
  const clean = structuredClone(p);
  // Projects saved before stairs had styles and directions open as straight, upward runs.
  for (const i of clean.items) {
    i.rotation = (((Math.round(i.rotation / 90) * 90) % 360) + 360) % 360;
    if (i.kind === 'stairs') {
      i.style ||= 'straight';
      i.dir ||= 'up';
    }
  }
  clean.interior ||= '#f4efe6';
  return clean;
}
// Shared walls are split at room boundaries, then drawn once. Openings on either
// adjoining room are projected into the shared wall, so doorways stay passable.
export interface Wall {
  axis: 'x' | 'z';
  line: number;
  start: number;
  end: number;
  floor: number;
  /** Garage doors are marked so they can be drawn closed; other wide doors are open archways. */
  openings: { start: number; end: number; kind: 'window' | 'door'; garage?: true }[];
}
export function buildWalls(p: Project): Wall[] {
  const segments: Wall[] = [];
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
          return {
            start: start + c - width / 2,
            end: start + c + width / 2,
            kind: o.kind,
            ...(r.kind === 'garage' && o.kind === 'door' ? { garage: true as const } : {}),
          };
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
  const groups = new Map<string, Wall[]>();
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
/** Rotates a shape a quarter turn clockwise about its center, carrying its openings along. */
export function rotateItem(p: Project, id: string): Project {
  const i = p.items.find((a) => a.id === id);
  if (!i) return p;
  const cx = i.x + i.w / 2,
    cz = i.z + i.d / 2;
  const rotated: Item = {
    ...i,
    w: i.d,
    d: i.w,
    x: Math.round((cx - i.d / 2) * 100) / 100,
    z: Math.round((cz - i.w / 2) * 100) / 100,
    rotation: (i.rotation + 90) % 360,
  };
  const sides = { north: 'east', east: 'south', south: 'west', west: 'north' } as const;
  return {
    ...p,
    items: p.items.map((a) => (a.id === id ? rotated : a)),
    openings: p.openings.map((o) =>
      o.roomId === id
        ? {
            ...o,
            side: sides[o.side],
            offset: o.side === 'south' || o.side === 'north' ? o.offset : 1 - o.offset,
          }
        : o,
    ),
  };
}
/** Removes a level. Levels further from the ground shift one step closer so floors stay stacked. */
export function deleteFloor(p: Project, level: number): Project {
  if (level === 0 || !hasFloor(p, level)) return p;
  const shift = (n: number) =>
    level > 0 && n > level ? n - 1 : level < 0 && n < level ? n + 1 : n;
  const items = p.items.filter((i) => {
    if (i.kind === 'stairs') {
      const { lower, upper } = stairLevels(i);
      return lower !== level && upper !== level;
    }
    return i.floor !== level;
  });
  const kept = new Set(items.map((i) => i.id));
  return {
    ...p,
    floors: p.floors.filter((f) => f.level !== level).map((f) => ({ ...f, level: shift(f.level) })),
    items: items.map((i) => ({ ...i, floor: shift(i.floor) })),
    openings: p.openings.filter((o) => kept.has(o.roomId)),
  };
}
export function removeItem(p: Project, id: string): Project {
  return {
    ...p,
    items: p.items.filter((i) => i.id !== id),
    openings: p.openings.filter((o) => o.roomId !== id),
  };
}
/** Items (not rooms) whose footprint sits entirely inside a room, on the same floor. */
export function contentsOf(p: Project, room: Item) {
  return p.items.filter(
    (i) =>
      i.id !== room.id &&
      !isRoom(i) &&
      !isOutside(i) &&
      i.floor === room.floor &&
      i.x >= room.x - 0.01 &&
      i.z >= room.z - 0.01 &&
      i.x + i.w <= room.x + room.w + 0.01 &&
      i.z + i.d <= room.z + room.d + 0.01,
  );
}
/** Total heated floor area (rooms, not garages) in square feet. */
export const squareFeet = (p: Project) => area({ ...p, units: 'ft' });
export const DEFAULT_COST = 250;
/** "$581k" style money. */
export function money(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 2)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}
/** Reads 12'6", 12′ 6″, 12 6, 12ft 6in, or 12.5 as feet; NaN if it can't. */
export function readFeet(text: string) {
  const m = text
    .trim()
    .toLowerCase()
    .match(
      /^(\d+(?:\.\d+)?)\s*(?:'|′|ft|feet|foot)?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)?)?$/,
    );
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0) : NaN;
}
