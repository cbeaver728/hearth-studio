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
  | 'coffee'
  | 'landing'
  | 'laundry'
  | 'bunk'
  | 'utility'
  | 'shelf'
  | 'islandSink'
  | 'islandStove'
  | 'islandL'
  | 'islandRound'
  | 'range'
  | 'dishwasher'
  | 'cabinet'
  | 'uppers'
  | 'mirror'
  | 'picture'
  | 'tvwall'
  | 'roundTable'
  | 'chandelier'
  | 'pendant'
  | 'fan'
  | 'floorlamp'
  | 'sconce'
  | 'dresser'
  | 'crib'
  | 'deskL'
  | 'shed'
  | 'firepit'
  | 'hottub'
  | 'planter'
  | 'bench'
  | 'xmas'
  | 'curve'
  | 'grand'
  | 'upright'
  | 'clock'
  | 'counterPlain'
  | 'counterSink'
  | 'counterL'
  | 'canopy'
  | 'platform'
  | 'daybed'
  | 'loft'
  | 'sectional'
  | 'ottoman'
  | 'pooltable'
  | 'wetbar'
  | 'stools'
  | 'toybox'
  | 'pergola'
  | 'grill'
  | 'swing'
  | 'trampoline'
  | 'hoop'
  | 'mailbox';
export type StairStyle = 'straight' | 'l' | 'u' | 'spiral';
/** Ceiling height: the usual 10 ft, a taller 12 ft, or open all the way to the floor above. */
export type Ceiling = 'standard' | 'tall' | 'open';
export const WALL_H = 3;
export const TALL_H = 3.7;
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
  /** Stairs only: flipped left-for-right, so an L or switchback turns the other way. */
  mirror?: boolean;
  /** Rooms only: what the floor is made of (wood when unset). */
  finish?: FloorFinish;
  /** Landings only: a roof on posts over the platform. */
  covered?: boolean;
  /** Rooms only: how high the ceiling goes (standard when unset). */
  ceiling?: Ceiling;
}
export type FloorFinish = 'wood' | 'tile' | 'carpet' | 'stone';
/** What the outside walls are made of. */
export type Siding = 'painted' | 'lap' | 'board' | 'shingle' | 'brick' | 'stone' | 'stucco';
export const sidings: { id: Siding; name: string; hint: string; color: string }[] = [
  { id: 'painted', name: 'Painted', hint: 'Smooth, flat color', color: '#f0e9dc' },
  { id: 'lap', name: 'Lap siding', hint: 'Horizontal boards', color: '#dad4c7' },
  { id: 'board', name: 'Board & batten', hint: 'Vertical boards and battens', color: '#a5b0a0' },
  { id: 'shingle', name: 'Cedar shingle', hint: 'Staggered shakes', color: '#b39069' },
  { id: 'brick', name: 'Brick', hint: 'Running bond, pale mortar', color: '#a8583f' },
  { id: 'stone', name: 'Stone', hint: 'Rough-cut courses', color: '#9d9689' },
  { id: 'stucco', name: 'Stucco', hint: 'Hand-troweled render', color: '#e8dcc6' },
];
/** What the roof is covered with. */
export type RoofFinish = 'plain' | 'shingle' | 'metal' | 'tile';
export const roofFinishes: { id: RoofFinish; name: string; hint: string }[] = [
  { id: 'shingle', name: 'Shingles', hint: 'Asphalt or cedar courses' },
  { id: 'metal', name: 'Standing seam', hint: 'Ribbed metal panels' },
  { id: 'tile', name: 'Clay tile', hint: 'Rolled barrel tiles' },
  { id: 'plain', name: 'Plain', hint: 'Flat color, no texture' },
];
export const sidingName = (s: Siding = 'painted') =>
  sidings.find((x) => x.id === s)?.name ?? 'Painted';
/** Ways through (or into) a wall. 'open' takes the wall away entirely. */
export type OpeningKind = 'door' | 'double' | 'slider' | 'garage' | 'window' | 'arch' | 'open';
export interface Opening {
  id: string;
  roomId: string;
  side: Side;
  offset: number;
  width: number;
  kind: OpeningKind;
}
export const openingKinds: {
  kind: OpeningKind;
  name: string;
  hint: string;
  width: number;
}[] = [
  { kind: 'door', name: 'Door', hint: 'A single swinging door', width: 0.9 },
  { kind: 'double', name: 'Double doors', hint: 'A pair that swing open', width: 1.8 },
  { kind: 'slider', name: 'Sliding glass', hint: 'Out to a deck or patio', width: 2.4 },
  { kind: 'garage', name: 'Garage door', hint: 'Wide and closed', width: 3 },
  { kind: 'window', name: 'Window', hint: 'Let the light in', width: 1.5 },
  { kind: 'arch', name: 'Wide opening', hint: 'A cased opening, no door', width: 2.4 },
  { kind: 'open', name: 'Remove wall', hint: 'Open two rooms right up', width: 12 },
];
export const openingName = (k: OpeningKind) =>
  openingKinds.find((o) => o.kind === k)?.name ?? 'Opening';
/** Whether you can walk through it. Windows and closed garage doors stop you. */
export const isPassable = (k: OpeningKind) => k !== 'window' && k !== 'garage';
/** A removed wall spans its whole side rather than a set width. */
export const spansWall = (k: OpeningKind) => k === 'open';
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
  /** What the outside walls are made of (painted when unset). */
  siding?: Siding;
  interior?: string;
  roof: string;
  /** What the roof is covered with (shingles when unset). */
  roofFinish?: RoofFinish;
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
  entry(
    'shelf',
    'shelf',
    'Bookshelf',
    'Room for a library',
    0.9,
    0.32,
    '#a8845c',
    'Furnish',
    'Living',
  ),
  entry(
    'shelf-wall',
    'shelf',
    'Built-in shelves',
    'A whole wall of books',
    2.4,
    0.35,
    '#a8845c',
    'Furnish',
    'Living',
  ),
  entry(
    'sectional',
    'sectional',
    'Sectional sofa',
    'Wraps around the corner',
    2.8,
    2.2,
    '#88a79b',
    'Furnish',
    'Living',
  ),
  entry(
    'ottoman',
    'ottoman',
    'Ottoman',
    'Put your feet up',
    0.8,
    0.8,
    '#b8a58a',
    'Furnish',
    'Living',
  ),
  entry(
    'pooltable',
    'pooltable',
    'Pool table',
    'Rack them up',
    2.5,
    1.4,
    '#4f7a58',
    'Furnish',
    'Living',
  ),
  entry('wetbar', 'wetbar', 'Wet bar', 'Pour a drink', 1.6, 0.6, '#8a6a4e', 'Furnish', 'Living'),
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
    'Counter, sink & cooktop',
    'The works, with wall cabinets',
    3,
    0.65,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'islandSink',
    'islandSink',
    'Island with sink',
    'Wash up facing the room',
    2.4,
    1,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'islandStove',
    'islandStove',
    'Island with cooktop',
    'Cook facing the room',
    2.4,
    1,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'islandL',
    'islandL',
    'L-shaped island',
    'Wraps around a corner',
    2.8,
    2.2,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'islandRound',
    'islandRound',
    'Round island',
    'A curved breakfast bar',
    1.8,
    1.8,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'range',
    'range',
    'Range & oven',
    'Six burners and a hood',
    0.9,
    0.68,
    '#cfd3d2',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'dishwasher',
    'dishwasher',
    'Dishwasher',
    'Tucked under the counter',
    0.6,
    0.62,
    '#dfe2e0',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'pantry',
    'cabinet',
    'Pantry cupboard',
    'Floor to ceiling storage',
    0.9,
    0.6,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'uppers',
    'uppers',
    'Wall cabinets',
    'Cupboards above the counter',
    1.8,
    0.35,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'roundTable',
    'roundTable',
    'Round table',
    'Four chairs around it',
    1.2,
    1.2,
    '#c9a87c',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'counterPlain',
    'counterPlain',
    'Plain counter',
    'Cabinets and a worktop',
    3,
    0.65,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'counterSink',
    'counterSink',
    'Counter with sink',
    'No cooktop, no cupboards above',
    2.4,
    0.65,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'counterL',
    'counterL',
    'L-shaped counter',
    'Plain, around a corner',
    2.8,
    2,
    '#d4c7b5',
    'Furnish',
    'Kitchen & dining',
  ),
  entry(
    'stools',
    'stools',
    'Bar stools',
    'A row along the island',
    1.7,
    0.45,
    '#b8976f',
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
    'Queen bed',
    'A restful retreat',
    1.6,
    2.05,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'bed-king',
    'bed',
    'King bed',
    'Room to stretch out',
    1.95,
    2.1,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'bed-twin',
    'bed',
    'Twin bed',
    'For one sleeper',
    1,
    1.95,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'platform',
    'platform',
    'Platform bed',
    'Low, wide and modern',
    1.95,
    2.3,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'canopy',
    'canopy',
    'Four-poster bed',
    'Posts, frame and drapes',
    1.8,
    2.2,
    '#b3b9cb',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'daybed',
    'daybed',
    'Daybed',
    'A sofa by day, a bed by night',
    2,
    0.95,
    '#c9b49a',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'loft',
    'loft',
    'Loft bed',
    'A desk tucked underneath',
    1.1,
    2.05,
    '#b59d80',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'bunk',
    'bunk',
    'Bunk beds',
    'Two beds, one footprint',
    1.05,
    2.05,
    '#b59d80',
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
  entry(
    'laundry',
    'laundry',
    'Washer & dryer',
    'Side by side',
    1.4,
    0.68,
    '#e4e7e6',
    'Furnish',
    'Laundry & utility',
  ),
  entry(
    'laundry-stacked',
    'laundry',
    'Stacked laundry',
    'One on top of the other',
    0.7,
    0.68,
    '#e4e7e6',
    'Furnish',
    'Laundry & utility',
  ),
  entry(
    'utility',
    'utility',
    'Utility sink',
    'For the messy jobs',
    0.6,
    0.55,
    '#dfe2e0',
    'Furnish',
    'Laundry & utility',
  ),
  entry(
    'vanity-double',
    'vanity',
    'Double vanity',
    'Two basins, one cabinet',
    1.9,
    0.55,
    '#b9a58a',
    'Furnish',
    'Bathroom',
  ),
  entry(
    'linen',
    'cabinet',
    'Linen cupboard',
    'Towels and spares',
    0.8,
    0.55,
    '#d9d2c6',
    'Furnish',
    'Bathroom',
  ),
  entry(
    'medicine',
    'mirror',
    'Mirror cabinet',
    'Over the basin',
    0.8,
    0.14,
    '#dfe7e8',
    'Furnish',
    'Bathroom',
  ),
  entry(
    'picture',
    'picture',
    'Framed picture',
    'Hang it on a wall',
    0.8,
    0.12,
    '#9b8970',
    'Furnish',
    'On the walls',
  ),
  entry(
    'gallery',
    'picture',
    'Gallery wall',
    'A row of frames',
    2.2,
    0.12,
    '#9b8970',
    'Furnish',
    'On the walls',
  ),
  entry(
    'mirror',
    'mirror',
    'Wall mirror',
    'Opens up a room',
    1,
    0.12,
    '#dfe7e8',
    'Furnish',
    'On the walls',
  ),
  entry(
    'tvwall',
    'tvwall',
    'Wall-mounted TV',
    'Up out of the way',
    1.5,
    0.12,
    '#1d2123',
    'Furnish',
    'On the walls',
  ),
  entry(
    'sconce',
    'sconce',
    'Wall light',
    'A soft glow beside a bed',
    0.3,
    0.16,
    '#d9cdb8',
    'Furnish',
    'Lighting',
  ),
  entry(
    'chandelier',
    'chandelier',
    'Chandelier',
    'Hangs over the table',
    0.9,
    0.9,
    '#d9c48a',
    'Furnish',
    'Lighting',
  ),
  entry(
    'pendant',
    'pendant',
    'Pendant lights',
    'A row over an island',
    1.6,
    0.3,
    '#c9b49a',
    'Furnish',
    'Lighting',
  ),
  entry(
    'fan',
    'fan',
    'Ceiling fan',
    'With a light below',
    1.3,
    1.3,
    '#d9d2c6',
    'Furnish',
    'Lighting',
  ),
  entry(
    'floorlamp',
    'floorlamp',
    'Floor lamp',
    'Beside a chair',
    0.45,
    0.45,
    '#d9cdb8',
    'Furnish',
    'Lighting',
  ),
  entry(
    'nightstand',
    'dresser',
    'Nightstand',
    'Beside the bed',
    0.5,
    0.45,
    '#b59d80',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'dresser',
    'dresser',
    'Dresser',
    'A chest of drawers',
    1.4,
    0.5,
    '#b59d80',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'crib',
    'crib',
    'Crib',
    'For the littlest one',
    1.35,
    0.75,
    '#c9b49a',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'toybox',
    'toybox',
    'Toy chest',
    'Tidy, at last',
    0.9,
    0.45,
    '#c08f6a',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'deskL',
    'deskL',
    'Corner desk',
    'Wraps around a corner',
    1.6,
    1.5,
    '#b8976f',
    'Furnish',
    'Bedroom & office',
  ),
  entry(
    'console',
    'table',
    'Console table',
    'Along a wall or hallway',
    1.2,
    0.38,
    '#c9a87c',
    'Furnish',
    'Living',
  ),
  entry(
    'side',
    'table',
    'Side table',
    'Next to the sofa',
    0.5,
    0.5,
    '#c9a87c',
    'Furnish',
    'Living',
  ),
  entry(
    'grand',
    'grand',
    'Grand piano',
    'With the lid up',
    1.5,
    1.9,
    '#26282a',
    'Furnish',
    'Living',
  ),
  entry(
    'upright',
    'upright',
    'Upright piano',
    'Against a wall',
    1.5,
    0.68,
    '#3b2f2a',
    'Furnish',
    'Living',
  ),
  entry(
    'clock',
    'clock',
    'Grandfather clock',
    'Chimes on the hour',
    0.52,
    0.36,
    '#6b4b2f',
    'Furnish',
    'Living',
  ),
  entry(
    'xmas',
    'xmas',
    'Christmas tree',
    'Lights, baubles, and a star',
    1.3,
    1.3,
    '#3f6b46',
    'Furnish',
    'Living',
  ),
  entry('shed', 'shed', 'Garden shed', 'Mower and tools', 3, 2.4, '#b4a58b', 'Landscape'),
  entry('firepit', 'firepit', 'Fire pit', 'Evenings outside', 1.2, 1.2, '#8d8378', 'Landscape'),
  entry('hottub', 'hottub', 'Hot tub', 'A warm soak', 2.2, 2.2, '#7fb7bd', 'Landscape'),
  entry('planter', 'planter', 'Planter box', 'Herbs and flowers', 1.6, 0.6, '#a8845c', 'Landscape'),
  entry('bench', 'bench', 'Garden bench', 'Somewhere to sit', 1.5, 0.6, '#a8845c', 'Landscape'),
  entry('pergola', 'pergola', 'Pergola', 'Dappled shade', 3.6, 3, '#c2a781', 'Landscape'),
  entry('grill', 'grill', 'Barbecue', 'Cook outside', 1.3, 0.7, '#5d6163', 'Landscape'),
  entry('swing', 'swing', 'Swing set', 'Push me higher', 3, 1.8, '#8d9aa2', 'Landscape'),
  entry('trampoline', 'trampoline', 'Trampoline', 'Bounce', 3.4, 3.4, '#5b6a72', 'Landscape'),
  entry('hoop', 'hoop', 'Basketball hoop', 'Shoot some hoops', 1.4, 0.9, '#9aa3a6', 'Landscape'),
  entry('mailbox', 'mailbox', 'Mailbox', 'Down by the driveway', 0.4, 0.4, '#7a6a58', 'Landscape'),
  entry('deck', 'deck', 'Patio / deck', 'Take life outside', 5, 3, '#c2a781', 'Landscape'),
  entry(
    'curve',
    'curve',
    'Curved wall',
    'Bow it as much as you like',
    3.2,
    0.8,
    '#f0e9dc',
    'Build',
    'Curved walls',
  ),
  entry(
    'landing',
    'landing',
    'Landing / balcony',
    'A platform on any floor',
    3,
    1.8,
    '#c2a781',
    'Build',
    'Decks & landings',
  ),
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
/** Rooms directly over this one. */
export const roomsAbove = (p: Project, r: Item) =>
  p.items.filter(
    (i) =>
      isRoom(i) &&
      i.floor === r.floor + 1 &&
      i.x < r.x + r.w - 0.01 &&
      i.x + i.w > r.x + 0.01 &&
      i.z < r.z + r.d - 0.01 &&
      i.z + i.d > r.z + 0.01,
  );
/** How tall this room's walls stand. Open rooms reach through the floor above. */
export function ceilingHeight(p: Project, r: Item) {
  if (r.ceiling === 'open' && hasFloor(p, r.floor + 1)) return FLOOR_H + WALL_H;
  // A taller ceiling only fits where nothing is built on top.
  if (r.ceiling === 'tall' && !roomsAbove(p, r).length) return TALL_H;
  return WALL_H;
}
/** Footprints of rooms whose ceiling is open, cut out of the floor above. */
export const openCeilings = (p: Project, level: number) =>
  p.items
    .filter(
      (i) =>
        isRoom(i) &&
        i.floor === level - 1 &&
        ceilingHeight(p, i) > WALL_H + 0.1 &&
        i.ceiling === 'open',
    )
    .map((i) => ({ x0: i.x, z0: i.z, x1: i.x + i.w, z1: i.z + i.d }));
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
  p.siding = 'lap';
  p.exterior = '#f4f0e7';
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
  kitchen.finish = 'tile';
  const bath = add('room', 'Bathroom', 4, -4, 2, 3, '#dbe8e4');
  bath.finish = 'tile';
  const entryRoom = add('room', 'Entry', 4, -1, 2, 2, '#eae0d1');
  const bed = add('room', 'Bedroom', -6, 1, 5, 4, '#e2dfea');
  bed.finish = 'carpet';
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
  add('shed', 'Garden shed', -11.5, 3, 3, 2.4);
  add('grill', 'Barbecue', -1.2, -7.4, 1.3, 0.7);
  add('pergola', 'Pergola', -4.4, -10.6, 3.6, 3);
  add('mailbox', 'Mailbox', 8.6, 8.4, 0.4, 0.4);
  add('firepit', 'Fire pit', -8.5, -7.5, 1.2, 1.2);
  add('rug', 'Wool rug', -4.6, -2.9, 3.2, 2.6);
  add('sofa', 'Linen sofa', -4.4, -1.2, 2.8, 1, undefined, 180);
  add('coffee', 'Coffee table', -3.8, -2.45, 1.6, 0.7);
  add('fireplace', 'Fireplace', -3.8, -3.95, 1.6, 0.55);
  add('armchair', 'Reading chair', -1.2, -2.6, 0.9, 0.9, undefined, 90);
  add('kitchen', 'Kitchen counter', 0.1, -3.92, 2.9, 0.65);
  add('fridge', 'Refrigerator', 3.05, -3.9, 0.85, 0.75);
  add('counter', 'Kitchen island', 0.7, -2.85, 2.6, 0.9);
  add('table', 'Dining table', 0.8, -1.1, 2, 1.2);
  add('stools', 'Bar stools', 0.9, -1.95, 1.7, 0.45, undefined, 180);
  add('chandelier', 'Dining chandelier', 1.35, -0.85, 0.9, 0.9);
  add('picture', 'Family photos', 3.05, 4.86, 2.2, 0.12, undefined, 180);
  add('bathtub', 'Bathtub', 4.1, -3.9, 1.8, 0.8);
  add('toilet', 'Toilet', 5.2, -2.4, 0.7, 0.45, undefined, 90);
  add('vanity', 'Vanity', 4.08, -2.9, 0.5, 1, undefined, 270);
  add('bed', 'King bed', -5.2, 1.1, 2, 2.2);
  add('wardrobe', 'Wardrobe', -2.8, 4.35, 1.6, 0.6, undefined, 180);
  add('desk', 'Writing desk', -0.3, 1.2, 2, 0.8);
  add('shelf', 'Bookshelf', -0.9, 4.63, 0.9, 0.32);
  add('upright', 'Upright piano', 1.35, 1.12, 1.5, 0.68);
  add('clock', 'Grandfather clock', 3.14, 1.12, 0.52, 0.36);
  add('plant', 'Fiddle-leaf fig', 1.9, 4.1, 0.6, 0.6);
  add('laundry-stacked', 'Laundry', 3.2, 1.1, 0.7, 0.68);
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
  suite.finish = 'carpet';
  suite.ceiling = 'tall';
  const loft = up('room', 'Reading loft', -1, -4, 4, 5, '#e6ddca');
  const kids = up('room', "Kids' room", -1, 1, 4, 4, '#e3e6d7');
  kids.finish = 'carpet';
  const upBath = up('room', 'Upstairs bath', 3, -4, 3, 3, '#dbe8e4');
  upBath.finish = 'tile';
  up('platform', 'Platform bed', -4.6, -3.85, 1.95, 2.3);
  up('wardrobe', 'Wardrobe', -5.9, 1.5, 0.6, 1.8, undefined, 270);
  up('armchair', 'Chair', -2.2, 3.6, 0.9, 0.9, undefined, 270);
  up('sofa', 'Loft sofa', -0.4, -3.9, 2.4, 1, '#b8a58a');
  up('rug', 'Rug', -0.2, -2.6, 2.4, 1.7);
  up('shelf-wall', 'Built-in shelves', -0.85, -0.42, 2.4, 0.35, undefined, 180);
  up('bunk', 'Bunk beds', 0.85, 3.6, 2.05, 1.05, '#c08f6a', 90);
  up('desk', 'Homework desk', -0.9, 1.1, 1.3, 0.6);
  up('toybox', 'Toy chest', 1.5, 1.12, 0.9, 0.45);
  up('bathtub', 'Bathtub', 4.15, -3.9, 1.75, 0.8);
  up('vanity', 'Vanity', 3.08, -2.7, 0.5, 1, undefined, 270);
  up('toilet', 'Toilet', 5.2, -2.3, 0.7, 0.45, undefined, 90);
  const opening = (r: Item, side: Side, offset: number, width: number, kind: OpeningKind) =>
    p.openings.push({ id: uid(), roomId: r.id, side, offset, width, kind });
  opening(landing, 'east', 0.5, 1.2, 'window');
  opening(suite, 'west', 0.35, 1.8, 'window');
  opening(suite, 'north', 0.5, 1.6, 'window');
  opening(suite, 'east', 0.28, 1.6, 'double');
  opening(loft, 'north', 0.5, 2.2, 'window');
  opening(loft, 'east', 0.8, 0.9, 'door');
  opening(kids, 'south', 0.5, 1.4, 'window');
  opening(kids, 'east', 0.5, 0.9, 'door');
  opening(upBath, 'north', 0.5, 0.8, 'window');
  opening(upBath, 'south', 0.5, 0.8, 'door');
  opening(living, 'north', 0.45, 2.6, 'slider');
  opening(living, 'west', 0.55, 2, 'window');
  opening(living, 'east', 0.5, 2.2, 'arch');
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
  opening(garage, 'south', 0.5, 3, 'garage');
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
    (p.siding !== undefined && !sidings.some((s) => s.id === p.siding)) ||
    (p.roofFinish !== undefined && !roofFinishes.some((r) => r.id === p.roofFinish)) ||
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
      (i.dir !== undefined && !['up', 'down'].includes(i.dir)) ||
      (i.mirror !== undefined && typeof i.mirror !== 'boolean') ||
      (i.finish !== undefined && !['wood', 'tile', 'carpet', 'stone'].includes(i.finish)) ||
      (i.covered !== undefined && typeof i.covered !== 'boolean') ||
      (i.ceiling !== undefined && !['standard', 'tall', 'open'].includes(i.ceiling))
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
      !(isRoom(room) || room.kind === 'curve') ||
      !['north', 'south', 'east', 'west'].includes(o.side) ||
      !openingKinds.some((k) => k.kind === o.kind) ||
      !num(o.offset, 0, 1) ||
      !num(o.width, 0.3, 12)
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
  /** How tall this piece stands, from the room with the highest ceiling beside it. */
  height: number;
  /** Garage doors are marked so they can be drawn closed; other wide doors are open archways. */
  openings: { start: number; end: number; kind: OpeningKind }[];
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
          // Taking a wall out opens the whole side; everything else is centered on its offset.
          if (spansWall(o.kind)) return { start, end: start + len, kind: o.kind };
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
        height: ceilingHeight(p, r),
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
        height: Math.max(...cover.map((s) => s.height)),
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
  const rotation = (i.rotation + 90) % 360;
  // Stairs that turn a corner have eight positions: four each way round. A full circle flips them.
  const handed = i.kind === 'stairs' && (i.style || 'straight') !== 'straight';
  const rotated: Item = {
    ...i,
    w: i.d,
    d: i.w,
    x: Math.round((cx - i.d / 2) * 100) / 100,
    z: Math.round((cz - i.w / 2) * 100) / 100,
    rotation,
    ...(handed && rotation === 0 ? { mirror: !i.mirror } : {}),
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
/** Flips a staircase left-for-right, so its flights turn the other way. */
export function flipItem(p: Project, id: string): Project {
  return {
    ...p,
    items: p.items.map((i) => (i.id === id ? { ...i, mirror: !i.mirror } : i)),
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
/** Bedrooms and bathrooms, read from room names ("Primary suite", "Powder room" = half bath). */
export function bedsAndBaths(p: Project) {
  let beds = 0,
    baths = 0;
  for (const r of p.items.filter((i) => i.kind === 'room')) {
    const n = r.name.toLowerCase();
    if (/powder|half bath/.test(n)) baths += 0.5;
    else if (/bath|ensuite|en-suite/.test(n)) baths += 1;
    else if (/bed|suite|nursery|guest room|kids/.test(n)) beds += 1;
  }
  return { beds, baths };
}
export const bedBathLabel = (p: Project) => {
  const { beds, baths } = bedsAndBaths(p);
  return `${beds} bed · ${baths} bath`;
};
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
