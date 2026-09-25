// Walking stairs the way people do: hold W, don't steer. Every style, turned every way, laid by
// "Add floor" and "Add basement" in everyday houses, and in the houses that come with the app.
import { describe, it, expect } from 'vitest';
import {
  blankProject,
  createItem,
  FLOOR_H,
  rotateItem,
  sampleProject,
  stairLevels,
  type Item,
  type Project,
} from '../src/model';
import { arthurProject } from '../src/arthur';
import { addLevel } from '../src/floors';
import { layoutFor, stairEnds, stairHeightAt, toWorld } from '../src/stairs';
import { buildWalkWorld, stairGuide, stepWalker, type WalkWorld } from '../src/walk';

type P = [number, number];

/** The walk up a flight: the foot, along the treads, the head. */
function line(s: Item): P[] {
  const pts: P[] = [
    stairEnds(s).bottom,
    ...layoutFor(s).path.map(([u, v]) => toWorld(s, u, v)),
    stairEnds(s).top,
  ];
  const h = (pt: P) => stairHeightAt(s, pt[0], pt[1]) ?? 0;
  return h(pts[1]) <= h(pts[pts.length - 2]) ? pts : [...pts].reverse();
}

/** Holds W and nothing else, with the walkthrough's own easing; the view follows the flight. */
function holdW(world: WalkWorld, x: number, z: number, feet: number, yaw: number, fps: number) {
  let vx = 0,
    vz = 0,
    fall = 0;
  const dt = 1 / fps;
  for (let t = 0; t < 10; t += dt) {
    const g0 = stairGuide(world, x, z, feet, -Math.sin(yaw) * 2.4, -Math.cos(yaw) * 2.4);
    if (g0.heading !== undefined) {
      let e = g0.heading - yaw;
      while (e > Math.PI) e -= Math.PI * 2;
      while (e < -Math.PI) e += Math.PI * 2;
      yaw += Math.max(-3 * dt, Math.min(3 * dt, e));
    }
    const ease = Math.min(1, dt * 8);
    vx += (g0.dx - vx) * ease;
    vz += (g0.dz - vz) * ease;
    const s = stepWalker(world, x, z, feet, vx * dt, vz * dt);
    x = s.x;
    z = s.z;
    if (s.stopX) vx = 0;
    if (s.stopZ) vz = 0;
    const g = world.support(x, z, feet);
    if (g >= feet) {
      feet += (g - feet) * Math.min(1, dt * 16);
      fall = 0;
    } else {
      fall = Math.min(fall + dt * 14, 9);
      feet = Math.max(g, feet - Math.max(fall, 3) * dt);
    }
  }
  return { x, z, feet };
}

/** Every walk up and down every flight in a house, a little off line either way. */
function walkAll(p: Project) {
  const world = buildWalkWorld(p);
  const fails: string[] = [];
  let runs = 0;
  for (const s of p.items.filter((i) => i.kind === 'stairs')) {
    const { lower, upper } = stairLevels(s);
    for (const dir of ['up', 'down'] as const)
      for (const off of [0, 0.3, -0.3])
        for (const fps of [60, 24]) {
          const pts = dir === 'up' ? line(s) : [...line(s)].reverse();
          const [a, b] = pts;
          const f0 = (dir === 'up' ? lower : upper) * FLOOR_H,
            goal = (dir === 'up' ? upper : lower) * FLOOR_H;
          if (!world.free(a[0], a[1], f0)) continue;
          runs++;
          const r = holdW(
            world,
            a[0],
            a[1],
            f0,
            Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) + off,
            fps,
          );
          if (Math.abs(r.feet - goal) > 0.25)
            fails.push(
              `${s.name} ${s.style} r${s.rotation}${s.mirror ? ' flipped' : ''} ${dir} ${off} ${fps}fps`,
            );
        }
  }
  return { runs, fails };
}

describe('holding W up and down stairs', () => {
  for (const style of ['stairs', 'stairs-l', 'stairs-winder', 'stairs-u', 'stairs-spiral'])
    it(`${style}, every way round`, () => {
      for (const turns of [0, 1, 2, 3])
        for (const mirror of [false, true]) {
          const p = blankProject();
          p.floors.push({ level: 1, name: 'Upstairs' });
          let s = createItem(style, 0, 0, 0);
          p.items = [
            Object.assign(createItem('room', 0, -6, -6), { w: 14, d: 14 }),
            Object.assign(createItem('room', 1, -6, -6), { w: 14, d: 14 }),
            s,
          ];
          for (let n = 0; n < turns; n++) {
            p.items = rotateItem(p, s.id).items;
            s = p.items.find((i) => i.id === s.id)!;
          }
          s.mirror = mirror || undefined;
          const { runs, fails } = walkAll(p);
          expect(runs).toBeGreaterThan(0);
          expect(fails).toEqual([]);
        }
    });

  const houses: [string, () => Project][] = [
    [
      'two rooms',
      () => {
        const p = blankProject();
        const living = Object.assign(createItem('room', 0, 0, 0), {
          w: 6,
          d: 5,
          name: 'Living room',
        });
        p.items = [
          living,
          Object.assign(createItem('room', 0, 6, 0), { w: 4, d: 5, name: 'Kitchen' }),
        ];
        p.openings = [
          { id: 'o', roomId: living.id, side: 'east', offset: 0.5, width: 1.2, kind: 'arch' },
        ];
        return p;
      },
    ],
    [
      'a hall house',
      () => {
        const p = blankProject();
        const hall = Object.assign(createItem('room', 0, 3, 0), { w: 2, d: 8, name: 'Hall' });
        p.items = [
          hall,
          Object.assign(createItem('room', 0, 0, 0), { w: 3, d: 4, name: 'Bedroom' }),
          Object.assign(createItem('room', 0, 5, 0), { w: 4, d: 8, name: 'Living room' }),
        ];
        p.openings = [
          { id: 'o1', roomId: hall.id, side: 'west', offset: 0.25, width: 0.9, kind: 'door' },
          { id: 'o2', roomId: hall.id, side: 'east', offset: 0.5, width: 0.9, kind: 'door' },
        ];
        return p;
      },
    ],
  ];
  for (const [name, make] of houses)
    for (const type of ['upper', 'basement'] as const)
      it(`stairs laid by Add ${type === 'upper' ? 'floor' : 'basement'} in ${name}, every style`, () => {
        for (const style of ['straight', 'l', 'winder', 'u', 'spiral'] as const) {
          const { project } = addLevel(make(), { type, stairs: style })!;
          const { runs, fails } = walkAll(project);
          expect(runs, style).toBeGreaterThan(0);
          expect(fails, style).toEqual([]);
        }
      });

  for (const [name, make] of [
    ['the Sunday House', sampleProject],
    ["Arthur's House", arthurProject],
  ] as const)
    it(`every flight in ${name}`, () => {
      const { runs, fails } = walkAll(make());
      expect(runs).toBeGreaterThan(0);
      expect(fails).toEqual([]);
    });

  it('stairs down to a new basement open onto the room at the top, not a wall', () => {
    const p = houses[1][1]();
    for (const style of ['straight', 'l', 'winder', 'u', 'spiral'] as const) {
      const { project } = addLevel(p, { type: 'basement', stairs: style })!;
      const s = project.items.find((i) => i.kind === 'stairs')!;
      const [x, z] = stairEnds(s).top;
      const world = buildWalkWorld(project);
      expect(world.free(x, z, 0), style).toBe(true);
    }
  });
});
