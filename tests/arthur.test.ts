import { describe, expect, it } from 'vitest';
import { arthurProject } from '../src/arthur';
import { buildWalkWorld } from '../src/walk';
import {
  bedsAndBaths,
  FLOOR_H,
  halfStorey,
  isRoom,
  stairLevels,
  validateProject,
  type Item,
} from '../src/model';
import { layoutFor, stairEnds, toWorld } from '../src/stairs';
import { dormerRect, planRoof } from '../src/roof';

const p = arthurProject();
const named = (name: string) => p.items.find((i) => i.name === name)!;
const centre = (i: Item): [number, number] => [i.x + i.w / 2, i.z + i.d / 2];
const roomAt = (level: number, [x, z]: [number, number]) =>
  p.items.find(
    (r) => isRoom(r) && r.floor === level && x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d,
  );

describe("Arthur's house", () => {
  it('saves and reloads exactly', () => {
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('is a yellow storey-and-a-half with a blue roof and two dormers on the front', () => {
    expect(p.roofStyle).toBe('cape');
    expect(p.siding).toBe('lap');
    const plan = planRoof(p);
    const main = plan.wings[0];
    expect(main.cape).toBe(true);
    expect(main.axis).toBe('x');
    // The front faces the street to the south: the high side of the main wing.
    const front = plan.dormers.filter((d) => d.wing === 0 && d.side === 'hi');
    expect(front).toHaveLength(2);
    // A kitchen wing out back with its own ridge, and the garage roofed on its own.
    expect(plan.wings.filter((w) => w.top && w.cape)).toHaveLength(2);
    expect(plan.wings.some((w) => !w.cape && w.rect.x0 > 6)).toBe(true);
  });
  it('puts the den left of the front door and the living room right, as seen from the street', () => {
    const door = p.openings.find(
      (o) => o.kind === 'door' && o.side === 'south' && named('Entry hall').id === o.roomId,
    );
    expect(door).toBeTruthy();
    expect(centre(named('The den'))[0]).toBeLessThan(named('Entry hall').x);
    expect(centre(named('Living room'))[0]).toBeGreaterThan(named('Entry hall').x);
  });
  it("puts Arthur's room over the living room and D.W.'s over the den", () => {
    // Just behind the front wall, under each dormer.
    expect(roomAt(0, [centre(named("Arthur's bedroom"))[0], -1.5])?.name).toBe('Living room');
    expect(roomAt(0, [centre(named("D.W. and Kate's bedroom"))[0], -1.5])?.name).toBe('The den');
    for (const name of ["Arthur's bedroom", "D.W. and Kate's bedroom", "Mom and Dad's bedroom"])
      expect(halfStorey(p, named(name))).toBe(true);
    expect(bedsAndBaths(p)).toEqual({ beds: 3, baths: 1 });
  });
  it('gives D.W. and Kate the biggest bedroom and Arthur the smallest', () => {
    const size = (n: string) => named(n).w * named(n).d;
    expect(size("D.W. and Kate's bedroom")).toBeGreaterThan(size("Mom and Dad's bedroom"));
    expect(size("Arthur's bedroom")).toBeLessThan(size("Mom and Dad's bedroom"));
  });
  it('has white winder stairs from the foyer that land in the upstairs hall', () => {
    const s = named('The stairs');
    expect(s.style).toBe('winder');
    expect(s.trimColor).toBeTruthy();
    expect(stairLevels(s)).toEqual({ lower: 0, upper: 1 });
    const ends = stairEnds(s);
    expect(roomAt(0, ends.bottom)?.name).toBe('Foyer');
    expect(roomAt(1, ends.top)?.name).toBe('Upstairs hall');
    const cellar = named('Stairs to the basement');
    expect(roomAt(0, stairEnds(cellar).top)?.name).toBe('Basement stairs');
    expect(roomAt(-1, stairEnds(cellar).bottom)?.name).toBe('Laundry room');
  });
  it("can be walked: up the stairs, and to the window in Arthur's dormer", () => {
    const world = buildWalkWorld(p);
    const step = (from: { x: number; z: number; feet: number }, to: [number, number]) => {
      let { x, z, feet } = from;
      for (let k = 0; k < 600 && Math.hypot(to[0] - x, to[1] - z) > 0.05; k++) {
        const d = Math.hypot(to[0] - x, to[1] - z);
        const vx = ((to[0] - x) / d) * 0.04,
          vz = ((to[1] - z) / d) * 0.04;
        if (world.free(x + vx, z, feet)) x += vx;
        if (world.free(x, z + vz, feet)) z += vz;
        const g = world.support(x, z, feet);
        feet = g >= feet ? feet + (g - feet) * 0.3 : Math.max(g, feet - 0.05);
      }
      return { x, z, feet };
    };
    const s = named('The stairs');
    const path = layoutFor(s).path.map(([u, v]) => toWorld(s, u, v));
    let at = { x: stairEnds(s).bottom[0], z: stairEnds(s).bottom[1], feet: 0 };
    for (const pt of [...path, stairEnds(s).top]) at = step(at, pt);
    expect(at.feet).toBeCloseTo(FLOOR_H, 1);
    // Along the hall, through Arthur's door, and into the nook under his dormer.
    at = step(at, [1.1, -2.5]);
    at = step(at, [2.3, -2.5]);
    const plan = planRoof(p);
    const nook = dormerRect(
      plan,
      plan.dormers.find((d) => d.item.name === "Arthur's dormer")!,
    );
    const window: [number, number] = [(nook.x0 + nook.x1) / 2, nook.z1 - 0.5];
    at = step(at, [window[0], -2.0]);
    at = step(at, window);
    expect(Math.hypot(at.x - window[0], at.z - window[1])).toBeLessThan(0.2);
    expect(at.feet).toBeCloseTo(FLOOR_H, 1);
  });
});
