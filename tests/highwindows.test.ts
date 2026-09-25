import { describe, it, expect } from 'vitest';
import {
  blankProject,
  catalog,
  createItem,
  FLOOR_H,
  TALL_H,
  validateProject,
  WALL_H,
  windowBands,
  type Project,
} from '../src/model';
import { planRoof } from '../src/roof';
import { buildWalkWorld } from '../src/walk';

describe('windows up high', () => {
  const OPEN = FLOOR_H + WALL_H;
  it('sits the usual window at the usual height', () => {
    for (const top of [WALL_H, TALL_H, OPEN]) expect(windowBands({}, top)).toEqual([[0.95, 2.25]]);
  });
  it('puts a high window up under the ceiling, bigger the taller the wall', () => {
    const [[s1, h1]] = windowBands({ elevation: 'high' }, WALL_H);
    const [[s2, h2]] = windowBands({ elevation: 'high' }, TALL_H);
    const [[s3, h3]] = windowBands({ elevation: 'high' }, OPEN);
    // A slim strip under an everyday ceiling...
    expect(h1).toBeCloseTo(WALL_H - 0.3, 5);
    expect(h1 - s1).toBeLessThan(0.6);
    expect(s1).toBeGreaterThan(2);
    // ...a proper window high on a tall wall, and right up in a room open to the floor above.
    expect(h2 - s2).toBeGreaterThan(h1 - s1);
    expect(h3).toBeCloseTo(OPEN - 0.3, 5);
    expect(s3).toBeGreaterThan(FLOOR_H);
  });
  it('stacks a second window above the usual one when the wall has room', () => {
    expect(windowBands({ elevation: 'stacked' }, WALL_H)).toHaveLength(1);
    for (const top of [TALL_H, OPEN]) {
      const [low, high] = windowBands({ elevation: 'stacked' }, top);
      expect(low).toEqual([0.95, 2.25]);
      expect(high[0]).toBeGreaterThan(low[1] + 0.3);
      expect(high[1]).toBeLessThanOrEqual(top - 0.25);
    }
  });
  it('keeps the setting through save and load, and turns away nonsense', () => {
    const p = blankProject();
    const r = createItem('room', 0, 0, 0);
    p.items = [r];
    p.openings = [
      {
        id: 'w',
        roomId: r.id,
        side: 'south',
        offset: 0.5,
        width: 1.4,
        kind: 'window',
        elevation: 'high',
      },
    ];
    expect(validateProject(JSON.parse(JSON.stringify(p))).openings[0].elevation).toBe('high');
    expect(() =>
      validateProject({ ...p, openings: [{ ...p.openings[0], elevation: 'attic' as never }] }),
    ).toThrow();
  });
});

describe('a carport', () => {
  const house = (): Project => {
    const p = blankProject();
    const carport = Object.assign(createItem('carport', 0, 0, 0), { w: 3.4, d: 6 });
    const car = Object.assign(createItem('car', 0, 0.8, 0.7), { w: 1.85, d: 4.6 });
    p.items = [carport, car];
    return p;
  };
  it('is in the Outside catalog, with a car to park in it', () => {
    expect(catalog.find((c) => c.kind === 'carport')?.group).toBe('Landscape');
    expect(catalog.find((c) => c.kind === 'car')?.group).toBe('Landscape');
    expect(() => validateProject(JSON.parse(JSON.stringify(house())))).not.toThrow();
  });
  it('lets you walk in under it, but not through its posts or the car', () => {
    const world = buildWalkWorld(house());
    // Under the roof beside the car.
    expect(world.free(0.45, 3, 0)).toBe(true);
    // Its corner posts, and the car's bonnet.
    expect(world.free(0.1, 0.15, 0)).toBe(false);
    expect(world.free(3.3, 5.85, 0)).toBe(false);
    expect(world.free(1.7, 1.2, 0)).toBe(false);
  });
});

describe('roofs over rooms of different heights', () => {
  it('gives a tall-ceilinged wing its own roof beside a room open to the floor above', () => {
    const p = blankProject();
    p.floors.push({ level: 1, name: 'Upstairs' });
    const living = Object.assign(createItem('room', 0, 0, 0), {
      w: 6,
      d: 5,
      ceiling: 'open' as const,
    });
    const kitchen = Object.assign(createItem('room', 0, 0, -4), { w: 6, d: 4 });
    const hall = Object.assign(createItem('room', 1, 0, -4), { w: 6, d: 4 });
    const studio = Object.assign(createItem('room', 0, 6, -4), {
      w: 4,
      d: 9,
      ceiling: 'tall' as const,
    });
    p.items = [living, kitchen, hall, studio];
    const wings = planRoof(p).wings;
    // Every bit of the studio is under a roof sitting on its own walls.
    const over = (x: number, z: number) =>
      wings.filter((w) => x > w.rect.x0 && x < w.rect.x1 && z > w.rect.z0 && z < w.rect.z1);
    for (const [x, z] of [
      [8, -2],
      [8, 2.5],
      [8, 4.5],
    ]) {
      const w = over(x, z);
      expect(w).toHaveLength(1);
      expect(w[0].base).toBeCloseTo(TALL_H, 5);
    }
    // And the living room's roof still rides at the top of its two storeys.
    expect(over(3, 2.5)[0].base).toBeCloseTo(FLOOR_H + WALL_H, 5);
  });
});
