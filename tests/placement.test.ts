import { describe, it, expect } from 'vitest';
import { addLevel } from '../src/floors';
import { blankProject, createItem, isRoom, type Item } from '../src/model';
import { moveFurniture, placeFurniture } from '../src/placement';
import { stairEnds } from '../src/stairs';

const room = (x: number, z: number, w: number, d: number, name = 'Bedroom') =>
  Object.assign(createItem('room', 0, x, z), { w, d, name });
const snap = (v: number) => Math.round(v * 4) / 4;
const inside = (i: Item, r: Item) =>
  i.x >= r.x + 0.07 &&
  i.z >= r.z + 0.07 &&
  i.x + i.w <= r.x + r.w - 0.07 &&
  i.z + i.d <= r.z + r.d - 0.07;

describe('placing furniture', () => {
  const r = room(0, 0, 5, 4);
  it('puts a bed with its headboard to the nearest wall, whichever wall that is', () => {
    const bed = createItem('bed', 0, 0, 0);
    const cases: [number, number, number][] = [
      [2.5, 0.4, 0], // near the north wall
      [4.6, 2, 90], // east
      [2.5, 3.6, 180], // south
      [0.4, 2, 270], // west
    ];
    for (const [x, z, rotation] of cases) {
      const i = placeFurniture([r], bed, x, z, snap);
      expect(i.rotation, `${x}, ${z}`).toBe(rotation);
      expect(inside(i, r), JSON.stringify(i)).toBe(true);
      // Flush against that wall.
      const gap = [i.z - r.z, r.x + r.w - i.x - i.w, r.z + r.d - i.z - i.d, i.x - r.x][
        rotation / 90
      ];
      expect(gap).toBeCloseTo(0.08, 5);
    }
  });
  it('leaves a piece where you click in the middle of the room', () => {
    const i = placeFurniture([r], createItem('bed', 0, 0, 0), 2.5, 2, snap);
    expect(i.rotation).toBe(0);
    expect(i.x + i.w / 2).toBeCloseTo(2.5, 0);
  });
  it('never pokes through a wall', () => {
    for (const kind of ['sofa', 'table', 'rug', 'wardrobe', 'bed']) {
      const i = placeFurniture([r], createItem(kind, 0, 0, 0), 4.95, 3.95, snap);
      expect(inside(i, r), kind).toBe(true);
    }
    const dragged = moveFurniture([r], { ...createItem('table', 0, 0, 0), x: 3.6, z: -0.3 });
    expect(inside(dragged, r)).toBe(true);
  });
  it('leaves stairs, rooms and garden pieces alone', () => {
    const s = placeFurniture([r], createItem('stairs', 0, 0, 0), 4.9, 3.9, snap);
    expect(s.rotation).toBe(0);
    expect(inside(s, r)).toBe(false);
  });
});

describe('a new floor', () => {
  it('gets a landing with room to step off the stairs, within the house below', () => {
    const p = blankProject();
    p.items = [room(-9.5, -12.25, 7.75, 6, 'Living room'), room(-1.75, -12.25, 6, 5, 'Kitchen')];
    const { project } = addLevel(p, { type: 'upper', stairs: 'l' })!;
    const landing = project.items.find((i) => isRoom(i) && i.floor === 1)!;
    const s = project.items.find((i) => i.kind === 'stairs')!;
    const [tx, tz] = stairEnds(s).top;
    expect(tx).toBeGreaterThan(landing.x + 0.3);
    expect(tx).toBeLessThan(landing.x + landing.w - 0.3);
    expect(tz).toBeGreaterThan(landing.z + 0.3);
    expect(tz).toBeLessThan(landing.z + landing.d - 0.3);
    // Not hanging out past the house below.
    expect(landing.x).toBeGreaterThanOrEqual(-9.5);
    expect(landing.z).toBeGreaterThanOrEqual(-12.25);
    expect(landing.x + landing.w).toBeLessThanOrEqual(4.25);
  });
});

describe('more building fixes', () => {
  it('counts floor area once where rooms overlap', async () => {
    const { area } = await import('../src/model');
    const p = blankProject();
    p.units = 'm';
    p.items = [room(0, 0, 10, 8), room(0, 0, 2, 3, 'Closet')];
    expect(area(p)).toBeCloseTo(80, 5);
  });
  it('takes in the landing when a room is drawn right over it', async () => {
    const { absorbLandings } = await import('../src/floors');
    const p = blankProject();
    const landing = room(0, 0, 2, 6, 'Stair hall');
    const big = room(0, 0, 16, 9, 'Family room');
    p.items = [landing, big];
    const r = absorbLandings(p, big.id);
    expect(r.absorbed).toEqual(['Stair hall']);
    expect(r.project.items.map((i) => i.name)).toEqual(['Family room']);
    // A landing someone has made their own, with a door, stays.
    p.openings = [
      { id: 'o', roomId: landing.id, side: 'east', offset: 0.5, width: 0.9, kind: 'door' },
    ];
    expect(absorbLandings(p, big.id).absorbed).toEqual([]);
  });
  it('puts a copy beside the original, clear of other furniture and in the same room', async () => {
    const { besideSpot } = await import('../src/placement');
    const r = room(0, 0, 5, 4);
    const chair = { ...createItem('armchair', 0, 3, 1), w: 0.9, d: 0.9 };
    const lamp = { ...createItem('table', 0, 4, 1), w: 0.9, d: 0.9 };
    const spot = besideSpot([r, chair, lamp], chair);
    const copy = { ...chair, ...spot };
    expect(inside(copy, r)).toBe(true);
    const clash = (a: Item, b: Item) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
    expect(clash(copy, chair)).toBe(false);
    expect(clash(copy, lamp)).toBe(false);
  });
  it('keeps new stairs out of doorways', async () => {
    const { findStairSpot } = await import('../src/floors');
    const p = blankProject();
    const hall = room(0, 0, 8, 6, 'Hall');
    p.items = [hall];
    // A wide door in the middle of every wall.
    p.openings = (['north', 'south', 'east', 'west'] as const).map((side, n) => ({
      id: 'd' + n,
      roomId: hall.id,
      side,
      offset: 0.5,
      width: 1.2,
      kind: 'door' as const,
    }));
    const spot = findStairSpot(p, 0, 'straight');
    const s = { ...createItem('stairs', 0, spot.x, spot.z), rotation: spot.rotation };
    if (spot.rotation % 180) [s.w, s.d] = [s.d, s.w];
    const doorways = [
      { x: 3.4, z: -1, w: 1.2, d: 2 },
      { x: 3.4, z: 5, w: 1.2, d: 2 },
      { x: -1, z: 2.4, w: 2, d: 1.2 },
      { x: 7, z: 2.4, w: 2, d: 1.2 },
    ];
    for (const d of doorways)
      expect(
        s.x < d.x + d.w && s.x + s.w > d.x && s.z < d.z + d.d && s.z + s.d > d.z,
        JSON.stringify({ s, d }),
      ).toBe(false);
  });
});

describe('building a modern ranch', () => {
  it('grows a room typed bigger away from the room it is built against', async () => {
    const { resizeRoom } = await import('../src/placement');
    const living = room(0, 0, 9, 5.5, 'Living room');
    const garage = { ...room(-2.75, 1.5, 2.75, 4), kind: 'garage' as const };
    const r = resizeRoom([living, garage], garage, 6.1, 6.7);
    expect(r.x + r.w).toBeCloseTo(0, 5); // still against the living room
    expect(r.x).toBeCloseTo(-6.1, 5);
    // With nothing alongside, the top-left corner stays put.
    const alone = room(10, 10, 3, 3);
    expect(resizeRoom([alone], alone, 5, 4)).toMatchObject({ x: 10, z: 10, w: 5, d: 4 });
  });
  it('rounds only the corners that stand free', async () => {
    const { freeCorners } = await import('../src/placement');
    const living = room(0, 0, 9, 5.5, 'Living room');
    const bed = room(9, 0, 4, 5.5);
    const kitchen = room(1, 5.5, 7, 1.5, 'Kitchen');
    expect(freeCorners({ items: [living, bed, kitchen] }, living).sort()).toEqual(['nw', 'sw']);
    expect(freeCorners({ items: [living] }, living)).toHaveLength(4);
  });
  it('sets a curved wall on the wall you click beside, bowing out, with an opening', async () => {
    const { attachCurve } = await import('../src/placement');
    const living = room(0, 0, 9, 5.5, 'Living room');
    const c = { ...createItem('curve', 0, 0, 0), w: 3.2, d: 0.8 };
    const north = attachCurve([living], c, 4.5, -0.6)!;
    expect(north.side).toBe('north');
    expect(north.curve.rotation).toBe(0);
    expect(north.curve.z + north.curve.d).toBeCloseTo(0, 5);
    expect(north.curve.x + north.curve.w / 2).toBeCloseTo(4.5, 5);
    const east = attachCurve([living], c, 9.5, 2.75)!;
    expect(east.side).toBe('east');
    expect(east.curve.x).toBeCloseTo(9, 5);
    // Far from any wall it's left alone.
    expect(attachCurve([living], c, 20, 20)).toBeNull();
  });
  it('keeps a resized curve on its wall and widens the opening into it', async () => {
    const { attachCurve, resizeCurve } = await import('../src/placement');
    const living = room(0, 0, 9, 5.5, 'Living room');
    const j = attachCurve(
      [living],
      { ...createItem('curve', 0, 0, 0), w: 3.2, d: 0.8 },
      4.5,
      -0.5,
    )!;
    const arch = {
      id: 'a',
      roomId: living.id,
      side: j.side,
      offset: j.offset,
      width: j.width,
      kind: 'arch' as const,
    };
    const out = resizeCurve({ items: [living, j.curve], openings: [arch] }, j.curve, 3.66, 1.83);
    const c = out.items.find((i) => i.kind === 'curve')!;
    expect(c.z + c.d).toBeCloseTo(0, 5);
    expect(c.x + c.w / 2).toBeCloseTo(4.5, 5);
    expect(out.openings[0].width).toBeCloseTo(3.56, 2);
  });
  it('sets a deck flush against the outside wall', async () => {
    const { attachOutside } = await import('../src/placement');
    const bed = room(0, 0, 4, 5.5);
    const deck = { ...createItem('landing', 0, 0, 0), w: 3, d: 1.8 };
    const d = attachOutside([bed], deck, 2, -1.2);
    expect(d.z + d.d).toBeCloseTo(0, 5);
  });
});
