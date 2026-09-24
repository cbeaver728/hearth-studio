// Arthur's house, the Read family home on Main Street in Elwood City, built with Hearth's own
// pieces. The layout follows the show's 1994 production floor plan and the rooms follow the
// Arthur Wiki: a yellow storey-and-a-half Cape with a blue roof and two front dormers, the den to
// the left of the front door and the living room to the right, a white winder stair in the
// foyer, the kitchen in a wing out back, the bedrooms up under the roof, and David's catering
// garage at the end of the driveway.
import {
  blankProject,
  createItem,
  uid,
  type Item,
  type Opening,
  type OpeningKind,
  type Project,
  type Side,
} from './model';

export const ARTHUR_ID = 'arthur-read-house-v5';
/** Earlier builds of the house, kept under another name when a newer one arrives. */
export const OLDER_ARTHUR_IDS = [
  'arthur-read-house-v2',
  'arthur-read-house-v3',
  'arthur-read-house-v4',
];

export function arthurProject(): Project {
  const p = blankProject();
  p.id = ARTHUR_ID;
  p.name = "Arthur's House";
  p.notes =
    "The Reads' house on Main Street, Elwood City. Den to the left of the front door, living room " +
    'to the right, the foyer and its white winder stairs behind. Kitchen out back, laundry in the ' +
    "basement. Upstairs under the roof: Arthur's room over the living room, D.W. and Kate's over " +
    "the den, Mom and Dad's at the back. Dad's catering kitchen is in the garage.";
  p.floors = [
    { level: -1, name: 'Basement' },
    { level: 0, name: 'Main floor' },
    { level: 1, name: 'Upstairs' },
  ];
  p.siding = 'lap';
  p.exterior = '#ecd06e';
  p.interior = '#f4efe6';
  p.roof = '#2f4d6c';
  p.roofFinish = 'shingle';
  p.roofStyle = 'cape';
  p.roofAxis = 'x';
  p.shutterColor = '#28405c';
  p.doorColor = '#8a5a3c';
  p.windowFrames = 'white';
  p.walkStart = 'street';

  const add = (
    kind: string,
    name: string,
    floor: number,
    x: number,
    z: number,
    w: number,
    d: number,
    extra: Partial<Item> = {},
  ): Item => {
    const i = createItem(kind, floor, x, z);
    Object.assign(i, { name, w, d, ...extra });
    i.floor = floor;
    p.items.push(i);
    return i;
  };
  const room = (
    name: string,
    floor: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    extra: Partial<Item> = {},
  ) => add('room', name, floor, x0, z0, x1 - x0, z1 - z0, { color: '#c89a64', ...extra });
  const open = (r: Item, side: Side, offset: number, width: number, kind: OpeningKind) => {
    const o: Opening = { id: uid(), roomId: r.id, side, offset, width, kind };
    p.openings.push(o);
  };
  const door = (r: Item, side: Side, offset = 0.5, width = 0.9) =>
    open(r, side, offset, width, 'door');
  const win = (r: Item, side: Side, offset = 0.5, width = 1) => {
    // Many-paned sashes, as the show draws them.
    open(r, side, offset, width, 'window');
    p.openings[p.openings.length - 1].style = 'grid';
  };

  // Plan: x runs east, z runs south, and the front of the house faces the street to the south.
  // The main block is 11 m wide and 7.5 m deep; the kitchen wing runs 4.5 m out the back.

  // ---- Main floor -------------------------------------------------------------------------
  const green = '#8cc49a';
  const den = room('The den', 0, -5.5, -3.75, -1.05, 0, {
    wallColor: '#6fb6d8',
    wallpaper: 'check',
    wainscot: '#f7f4ec',
  });
  const entry = room('Entry hall', 0, -1.05, -3.75, 0.5, 0, {
    wallColor: green,
    wainscot: '#f7f4ec',
  });
  const living = room('Living room', 0, 0.5, -3.75, 5.5, 0, {
    wallColor: '#63b27a',
    wainscot: '#d8d4e6',
  });
  const foyer = room('Foyer', 0, -5.5, -7.5, 0.2, -3.75, { wallColor: green, wainscot: '#f7f4ec' });
  const dining = room('Dining room', 0, 0.2, -7.5, 5.5, -3.75, {
    wallColor: '#f2b3b0',
    wallpaper: 'stripes',
    wainscot: '#c9c0e4',
  });
  const cellarStair = room('Basement stairs', 0, -0.6, -12, 1.0, -7.5, { wallColor: '#e8e2d6' });
  const kitchen = room('Kitchen', 0, 1.0, -12, 5.5, -7.5, {
    color: '#e8c79a',
    finish: 'tile',
    wallColor: '#f3a24a',
    wallpaper: 'check',
  });

  // The front door, between the den and the living room, and the windows either side of it.
  door(entry, 'south', 0.5, 1);
  open(entry, 'north', 0.5, 1.2, 'arch');
  door(entry, 'east', 0.62, 0.85);
  for (const at of [0.28, 0.74]) win(den, 'south', at, 1);
  for (const at of [0.25, 0.73]) win(living, 'south', at, 1);
  win(den, 'west', 0.72);
  win(living, 'east', 0.2);
  door(den, 'north', 0.55);
  open(living, 'north', 0.3, 1.8, 'arch');
  // The foyer: the back entrance by the stairs, the dining room past them.
  door(foyer, 'north', 0.3);
  win(foyer, 'west', 0.45);
  door(dining, 'west', 0.83, 1);
  win(dining, 'east', 0.5);
  door(dining, 'north', 0.4);
  // The kitchen: its own door out to the driveway, the sink window, the basement door.
  door(kitchen, 'east', 0.8);
  win(kitchen, 'east', 0.3);
  win(kitchen, 'north', 0.58, 1.2);
  door(cellarStair, 'east', 0.89, 0.8);

  // The white winder stairs, climbing along the back of the foyer and turning toward the front.
  add('stairs-winder', 'The stairs', 0, -2.4, -7.5, 2.6, 2.5, {
    rotation: 90,
    color: '#b07a4a',
    trimColor: '#f7f4ec',
  });
  // Through the kitchen door onto the landing, then straight down, heading for the back.
  add('stairs', 'Stairs to the basement', 0, -0.45, -11.4, 1.1, 2.9, {
    rotation: 180,
    dir: 'down',
    color: '#a88a66',
  });

  // Living room: the pink sofa under the front windows, the piano, the grandfather clock and the
  // fireplace.
  add('sofa', 'Pink sofa', 0, 2.05, -1.05, 2.3, 1, {
    rotation: 180,
    color: '#f09cc0',
    fabric: 'floral',
  });
  add('coffee', 'Coffee table', 0, 2.55, -2.35, 1.3, 0.6, { color: '#d9a55c' });
  add('rugRound', 'Pink rug', 0, 1.7, -3.35, 2.9, 2.9, { color: '#f0a3b8' });
  add('upright', 'Upright piano', 0, 4.8, -1.9, 0.68, 1.5, { rotation: 90, color: '#9a5f38' });
  add('clock', 'Grandfather clock', 0, 0.6, -0.4, 0.52, 0.36, { rotation: 180, color: '#c9933f' });
  add('fireplace', 'Fireplace', 0, 0.52, -3.6, 0.55, 1.6, { rotation: 270, color: '#e7c35a' });
  add('floorlamp', 'Reading lamp', 0, 1.35, -0.6, 0.45, 0.45, { color: '#4b6d9a' });
  add('ottoman', 'Footstool', 0, 4.0, -2.95, 0.6, 0.6, { color: '#f09cc0', fabric: 'floral' });
  for (const [x, name] of [
    [1.0, 'Yellow curtains'],
    [3.4, 'Yellow curtains'],
  ] as const)
    add('curtains', name, 0, x, -0.14, 1.5, 0.12, {
      rotation: 180,
      color: '#f4d33d',
      fabric: 'check',
    });
  add('radiator', 'Radiator', 0, 5.26, -3.5, 0.22, 1, { rotation: 90 });
  add('picture', 'Family photos', 0, 3.4, -3.73, 0.9, 0.12, { color: '#8a6a4e' });

  // The den: green striped sofa, the TV, the big braided rug, and Mom's computer corner.
  add('sofa', 'Striped sofa', 0, -2.1, -3.2, 1, 2.4, {
    rotation: 90,
    color: '#5cb85c',
    fabric: 'stripes',
  });
  add('crt', 'Television', 0, -5.45, -2.7, 0.55, 1, { rotation: 270, color: '#2f7a5a' });
  add('rugRound', 'Braided rug', 0, -4.6, -3.35, 2.9, 2.9, { color: '#e8c24a' });
  add('coffee', 'Red coffee table', 0, -3.8, -2.2, 1.1, 0.55, { color: '#c0503c' });
  add('floorlamp', 'Arc lamp', 0, -1.6, -0.6, 0.45, 0.45, { color: '#7c8fa8' });
  add('computer', "Mom's computer", 0, -5.4, -3.7, 1.2, 0.65, { color: '#b38a5e' });
  add('picture', 'Ship painting', 0, -1.17, -2.45, 0.12, 0.9, { rotation: 90, color: '#7a5a3a' });
  for (const x of [-4.95, -2.91])
    add('curtains', 'Den curtains', 0, x, -0.14, 1.4, 0.12, { rotation: 180, color: '#e8d27a' });

  // Entry and foyer.
  add('rug', 'Hall runner', 0, -0.8, -3.4, 1.05, 3.0, { color: '#8a78b8' });
  add('phonetable', 'Telephone table', 0, -5.45, -5.25, 0.4, 0.95, {
    rotation: 270,
    color: '#b8844f',
  });
  add('rug', 'Foyer rug', 0, -4.4, -6.3, 1.9, 1.3, { color: '#a78fcf', fabric: 'floral' });
  add('picture', 'Hall picture', 0, -5.38, -6.9, 0.12, 0.8, { rotation: 270, color: '#a88a66' });

  // Dining room: the round table under its green cloth, and a big mirror.
  add('roundTable', 'Dining table', 0, 2.2, -6.3, 1.45, 1.45, { color: '#8fcf8a' });
  add('rug', 'Green rug', 0, 1.6, -7.0, 2.6, 2.6, { color: '#4f8f52' });
  add('mirror', 'Dining mirror', 0, 3.6, -7.4, 1, 0.12, { color: '#dfe7e8' });
  add('picture', 'Plates', 0, 5.36, -6.9, 0.12, 0.5, { rotation: 90, color: '#7f8fcf' });

  // Kitchen: lavender cupboards, white uppers, the blue fridge, the green hutch, the table where
  // everyone eats, and Kate's highchair.
  add('counterPlain', 'Counter', 0, 1.5, -11.95, 0.8, 0.65, { color: '#a99ad6' });
  add('counterSink', 'Sink under the window', 0, 2.3, -11.95, 2.25, 0.65, { color: '#a99ad6' });
  add('range', 'Stove', 0, 4.55, -11.97, 0.9, 0.68, { color: '#e8e4da' });
  add('uppers', 'Wall cupboards', 0, 1.05, -11.95, 1.25, 0.35, { color: '#f7f4ec' });
  add('fridge', 'Refrigerator', 0, 1.02, -9.45, 0.75, 0.85, { rotation: 270, color: '#9fd0ea' });
  add('hutch', 'Green hutch', 0, 1.02, -10.95, 0.5, 1.2, { rotation: 270, color: '#3f9a7a' });
  add('table', 'Kitchen table', 0, 2.55, -10.0, 1.6, 1.0, { color: '#6aaee0', fabric: 'check' });
  add('highchair', "Kate's highchair", 0, 4.5, -9.8, 0.6, 0.55, {
    rotation: 270,
    color: '#3f9a7a',
  });
  add('curtains', 'Kitchen curtains', 0, 2.69, -11.92, 1.5, 0.12, { color: '#6aaee0' });

  // ---- Upstairs, under the roof ------------------------------------------------------------
  const dw = room("D.W. and Kate's bedroom", 1, -5.5, -7.5, -2.4, 0, {
    color: '#e7a060',
    finish: 'carpet',
    wallColor: '#f3a5bf',
    wainscot: '#a88fc4',
  });
  const hall = room('Upstairs hall', 1, -2.4, -7.5, 1.6, -1.6, { wallColor: '#9fcfa8' });
  const closetA = room('Closet', 1, -2.4, -1.6, -0.4, 0, { wallColor: '#e8e2d6' });
  const closetB = room('Closet', 1, -0.4, -1.6, 1.6, 0, { wallColor: '#e8e2d6' });
  const arthur = room("Arthur's bedroom", 1, 1.6, -3.8, 5.5, 0, { wallColor: '#6fbf73' });
  const bath = room('Bathroom', 1, 1.6, -7.5, 5.5, -3.8, {
    color: '#e6eef0',
    finish: 'tile',
    wallColor: '#9fd3de',
    wainscot: '#f7f4ec',
  });
  const parents = room("Mom and Dad's bedroom", 1, 0.4, -12, 5.5, -7.5, { wallColor: '#e9dcc0' });
  // The strip under the west eave is too low to stand in: eaves storage behind the knee wall, not a
  // walk-in closet. Mom and Dad keep their clothes in a wardrobe.
  room('Eaves storage', 1, -0.6, -12, 0.4, -7.5, { wallColor: '#e8e2d6' });

  door(hall, 'west', 0.678);
  door(hall, 'east', 0.844);
  door(hall, 'east', 0.385);
  door(hall, 'north', 0.85, 0.8);
  door(closetA, 'north', 0.5, 0.75);
  door(closetB, 'north', 0.5, 0.75);
  // Gable windows at the ends of the house, and at the back of Mom and Dad's room.
  win(dw, 'west', 0.3);
  win(dw, 'west', 0.72);
  win(arthur, 'east', 0.5);
  win(bath, 'east', 0.55, 0.8);
  win(parents, 'north', 0.216, 0.9);
  win(parents, 'north', 0.696, 0.8);

  // Dormers: one each for D.W. (left) and Arthur (right) on the front, and D.W.'s window onto the
  // backyard.
  add('dormer', "D.W.'s dormer", 1, -4.6, -1.4, 1.5, 1.4);
  add('dormer', "Arthur's dormer", 1, 2.85, -1.4, 1.5, 1.4);
  add('dormer', "D.W.'s back dormer", 1, -4.75, -7.5, 1.7, 1.4);
  add('chimney', 'Chimney', 0, 0.55, -3.75, 0.75, 0.6, { color: '#b5644c' });

  // Arthur's room: his bed, books, Bionic Bunny, and a clear spot at the dormer window.
  add('bed-twin', "Arthur's bed", 1, 4.2, -3.75, 1, 1.95, { color: '#58a6d6' });
  add('desk', 'Homework desk', 1, 1.62, -1.55, 0.6, 1.3, { rotation: 270, color: '#b8844f' });
  add('shelf', 'Bookshelf', 1, 1.62, -3.75, 0.32, 0.8, { rotation: 270, color: '#a8744a' });
  add('picture', 'Bionic Bunny poster', 1, 1.62, -2.05, 0.12, 0.8, {
    rotation: 270,
    color: '#2f5fa8',
    posterText: 'BIONIC BUNNY',
  });
  add('rug', 'Orange rug', 1, 2.5, -3.1, 1.5, 1.1, { color: '#e8863f' });
  add('radiator', 'Radiator', 1, 5.26, -2.3, 0.22, 0.9, { rotation: 90 });
  add('toybox', 'Toy chest', 1, 2.9, -3.75, 0.9, 0.45, { color: '#c0503c' });

  // D.W. and Kate: pink walls, purple wainscot, D.W.'s bed under her dormer, Kate's crib.
  add('bed-twin', "D.W.'s bed", 1, -4.35, -2.62, 1, 1.95, { rotation: 180, color: '#58a6d6' });
  add('crib', "Kate's crib", 1, -5.45, -4.6, 0.75, 1.35, { rotation: 270, color: '#f2d24a' });
  add('changing', 'Changing table', 1, -5.45, -6.95, 0.5, 0.9, { rotation: 270, color: '#f0e6d2' });
  add('dollhouse', 'Dollhouse', 1, -2.87, -5.6, 0.45, 0.9, { rotation: 90, color: '#c0503c' });
  add('nightstand', 'Nightstand', 1, -3.3, -1.1, 0.5, 0.45, { color: '#e8863f' });
  add('toybox', 'Toy crate', 1, -4.1, -3.9, 0.7, 0.5, { color: '#8f6fc4' });
  add('picture', 'Mary Moo Cow poster', 1, -2.52, -6.4, 0.12, 0.8, {
    rotation: 90,
    color: '#c46fae',
    posterText: 'MARY MOO COW',
  });
  add('curtains', "D.W.'s curtains", 1, -4.6, -0.62, 1.5, 0.12, {
    rotation: 180,
    color: '#8fd07a',
  });
  add('rug', 'Play rug', 1, -4.7, -5.9, 1.6, 1.2, { color: '#6ab0e0' });

  // The bathroom, with the tub tucked under the slope.
  add('bathtub', 'Bathtub', 1, 2.3, -7.45, 1.7, 0.8, { color: '#f7f4ec' });
  add('toilet', 'Toilet', 1, 4.78, -6.3, 0.7, 0.45, { rotation: 90, color: '#f7f4ec' });
  add('vanity', 'Sink', 1, 4.35, -4.4, 1, 0.55, { rotation: 180, color: '#f7f4ec' });
  add('mirror', 'Bathroom mirror', 1, 4.45, -3.95, 0.8, 0.12, { rotation: 180 });

  // Mom and Dad's room at the back.
  add('bed', 'Big bed', 1, 2.1, -11.95, 1.35, 2.0, { color: '#c9a0c8' });
  add('nightstand', 'Nightstand', 1, 1.55, -11.95, 0.5, 0.45, { color: '#8a6a4e' });
  add('nightstand', 'Nightstand', 1, 3.5, -11.95, 0.45, 0.45, { color: '#8a6a4e' });
  add('dresser', 'Dresser', 1, 3.8, -7.95, 1.4, 0.5, { rotation: 180, color: '#8a6a4e' });
  add('armchair', 'Reading chair', 1, 4.45, -10.2, 0.9, 0.9, { rotation: 90, color: '#b88fc4' });
  add('wardrobe', 'Wardrobe', 1, 2.4, -8.18, 1.4, 0.6, { rotation: 180, color: '#8a6a4e' });

  // ---- Basement ----------------------------------------------------------------------------
  const laundry = room('Laundry room', -1, -0.6, -12, 5.5, -7.5, {
    color: '#b8b4aa',
    finish: 'stone',
    wallColor: '#e8e2d6',
  });
  void laundry;
  add('laundry', 'Washer and dryer', -1, 1.2, -11.95, 1.4, 0.68, { color: '#eceae4' });
  add('utility', 'Laundry sink', -1, 2.8, -11.95, 0.6, 0.55);
  add('shelf-wall', 'Shelves', -1, 3.6, -11.95, 1.8, 0.35, { color: '#9b886f' });

  // ---- Outside -----------------------------------------------------------------------------
  // Dad's catering kitchen is in the garage at the end of the drive.
  const garage = add('garage', "Dad's catering garage", 0, 6.3, -19.5, 3.6, 6);
  open(garage, 'south', 0.5, 2.7, 'garage');
  win(garage, 'west', 0.65, 0.9);
  // A side door from the backyard, so you can walk in and see the catering kitchen.
  door(garage, 'west', 0.25, 0.85);
  add('kitchen', 'Catering kitchen', 0, 6.4, -19.45, 3, 0.65, { color: '#e8e4da' });
  add('driveway', 'Driveway', 0, 6.4, -13.5, 3.2, 21.6, { color: '#b9b4a6' });
  add('driveway', 'Front walk', 0, -0.85, 0.7, 1.2, 7.4, { color: '#c9c1ae' });
  add('landing', 'Front step', 0, -1.1, 0, 1.7, 0.7, { color: '#c9c1ae' });
  add('driveway', 'Sidewalk', 0, -13, 8.1, 26, 1.6, { color: '#d6d2c6' });
  add('driveway', 'Main Street', 0, -13, 9.7, 26, 7, { color: '#5f6468' });
  add('grass', 'Front lawn', 0, -10, 0.3, 9.15, 7.4, { color: '#8fc06a' });
  add('grass', 'Front lawn', 0, 0.35, 0.3, 6, 7.4, { color: '#8fc06a' });
  add('grass', 'Backyard', 0, -10, -21, 16.3, 9, { color: '#96c46e' });
  add('grass', 'Side yard', 0, -10, -12, 4.5, 12.3, { color: '#96c46e' });
  add('grass', 'Back lawn', 0, -5.5, -12, 4.9, 4.5, { color: '#96c46e' });
  add('grass', 'Strip by the drive', 0, 5.5, -12, 0.9, 12.3, { color: '#96c46e' });
  // Pickets along the front with a gate at the walk, and round the back.
  const fence = (name: string, x: number, z: number, w: number, d: number) =>
    add('picket-fence', name, 0, x, z, w, d, { color: '#f7f5ec' });
  fence('Picket fence', -10, 7.7, 8.95, 0.15);
  fence('Picket fence', 0.55, 7.7, 5.75, 0.15);
  fence('Side fence', -10.1, -21, 0.15, 28.7);
  fence('Back fence', -10, -21.1, 16.3, 0.15);
  add('mailbox', 'Mailbox', 0, 5.9, 7.1, 0.4, 0.4, { color: '#3f5f9f' });
  for (const x of [-5.2, -4.1, -3.0, -2.1, 0.7, 1.8, 2.9, 4.0, 4.45])
    add('planter', 'Shrubs', 0, x, 0.15, 1.0, 0.5, { color: '#5b8c50' });
  add('tree', 'Big maple', 0, -8.8, 1.5, 3.4, 3.4, { color: '#5f9b50' });
  add('tree', 'Backyard tree', 0, 1.5, -18.5, 3.6, 3.6, { color: '#63a456' });
  add('tree', 'Pine', 0, -8.6, -18.8, 2.2, 2.2, { color: '#3f7a52' });
  add('table', 'Picnic table', 0, 2.5, -15.0, 1.8, 0.9, { color: '#b8844f' });
  add('swing', 'Swing set', 0, -8.8, -14.5, 2.6, 1.6, { color: '#6f8f9a' });
  return p;
}
