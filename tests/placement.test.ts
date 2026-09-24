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
