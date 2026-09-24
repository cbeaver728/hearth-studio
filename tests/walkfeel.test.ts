import { describe, it, expect } from 'vitest';
import {
  blankProject,
  createItem,
  FLOOR_H,
  rotateItem,
  sampleProject,
  type Project,
} from '../src/model';
import { layoutFor, stairEnds, toWorld } from '../src/stairs';
import { buildWalkWorld } from '../src/walk';
import { arthurProject } from '../src/arthur';

/** Holds W the way a person does, with the walkthrough's own easing and step smoothing. */
function holdForward(p: Project, start: [number, number], yaw: number, seconds: number, fps = 60) {
  const world = buildWalkWorld(p);
  let [x, z] = start,
    feet = 0,
    fall = 0,
    vx = 0,
    vz = 0;
  const dt = 1 / fps;
  const trace: number[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const dx = -Math.sin(yaw),
      dz = -Math.cos(yaw);
    const ease = Math.min(1, dt * 8);
    vx += (dx * 2.4 - vx) * ease;
    vz += (dz * 2.4 - vz) * ease;
    if (world.free(x + vx * dt, z, feet)) x += vx * dt;
    else vx = 0;
    if (world.free(x, z + vz * dt, feet)) z += vz * dt;
    else vz = 0;
    const ground = world.support(x, z, feet);
    if (ground >= feet) {
      feet += (ground - feet) * Math.min(1, dt * 16);
      fall = 0;
    } else {
      fall = Math.min(fall + dt * 14, 9);
      feet = Math.max(ground, feet - Math.max(fall, 3) * dt);
    }
    trace.push(feet);
  }
  return { x, z, feet, trace };
}

describe('walking up stairs with the keyboard', () => {
  it('lets you walk round to the foot of stairs that end close to a wall', () => {
    // The Sunday House stairs stop about half a meter short of the hall wall.
    const p = sampleProject();
    const s = p.items.find((i) => i.kind === 'stairs')!;
    const world = buildWalkWorld(p);
    const z = s.z + s.d + 0.12;
    for (let x = s.x - 0.5; x <= s.x + s.w - 0.3; x += 0.05)
      expect(world.free(x, z, 0), 'x ' + x.toFixed(2)).toBe(true);
    // Yet a few steps up, the banister still keeps you from stepping off the side.
    expect(world.free(s.x - 0.1, s.z + 1, 2)).toBe(false);
  });
  it('climbs the Sunday House stairs holding W, even a little off straight', () => {
    const p = sampleProject();
    const s = p.items.find((i) => i.kind === 'stairs')!;
    // The hall wall is close behind the bottom step here, so start just in front of it.
    const bx = s.x + s.w / 2,
      bz = s.z + s.d + 0.2;
    for (const off of [0, 0.15, -0.15, 0.3, -0.3]) {
      const r = holdForward(p, [bx, bz], off, 4);
      expect(r.feet, 'yaw ' + off).toBeGreaterThan(FLOOR_H - 0.3);
    }
  });
  for (const fps of [60, 30, 20])
    it('climbs a free-standing straight run at ' + fps + ' fps', () => {
      const p = blankProject();
      p.floors.push({ level: 1, name: 'Upstairs' });
      const below = createItem('room', 0, -4, -4),
        above = createItem('room', 1, -4, -4);
      Object.assign(below, { w: 10, d: 10 });
      Object.assign(above, { w: 10, d: 10 });
      const s = createItem('stairs', 0, 0, 0);
      p.items = [below, above, s];
      const [bx, bz] = stairEnds(s).bottom;
      const r = holdForward(p, [bx, bz], 0, 4, fps);
      expect(r.feet).toBeGreaterThan(FLOOR_H - 0.3);
    });
  it("climbs the first flight of Arthur's stairs", () => {
    const p = arthurProject();
    const s = p.items.find((i) => i.name === 'The stairs')!;
    const [bx, bz] = stairEnds(s).bottom;
    // The first flight runs east.
    const r = holdForward(p, [bx, bz], -Math.PI / 2, 2);
    expect(r.feet).toBeGreaterThan(1);
  });
});

/** Steers along the plan arrow like a person turning with the keys, holding W the whole way. */
function steer(p: Project, s: ReturnType<typeof createItem>, fps = 60) {
  const world = buildWalkWorld(p);
  const path = [
    stairEnds(s).bottom,
    ...layoutFor(s).path.map(([u, v]) => toWorld(s, u, v)),
    stairEnds(s).top,
  ];
  let [x, z] = path[0],
    feet = 0,
    fall = 0,
    vx = 0,
    vz = 0,
    yaw = Math.atan2(-(path[1][0] - x), -(path[1][1] - z)),
    next = 1,
    stuck = 0;
  const dt = 1 / fps;
  for (let t = 0; t < 14 && next < path.length; t += dt) {
    const [tx, tz] = path[next];
    if (Math.hypot(tx - x, tz - z) < 0.3) {
      next++;
      continue;
    }
    // Turn toward the next point at the keyboard's turning speed.
    const want = Math.atan2(-(tx - x), -(tz - z));
    let d = want - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    yaw += Math.max(-1.7 * dt, Math.min(1.7 * dt, d));
    const forward = Math.abs(d) < 0.8 ? 1 : 0;
    const ease = Math.min(1, dt * (forward ? 8 : 11));
    vx += (-Math.sin(yaw) * 2.4 * forward - vx) * ease;
    vz += (-Math.cos(yaw) * 2.4 * forward - vz) * ease;
    const px = x,
      pz = z;
    if (world.free(x + vx * dt, z, feet)) x += vx * dt;
    else vx = 0;
    if (world.free(x, z + vz * dt, feet)) z += vz * dt;
    else vz = 0;
    stuck = Math.hypot(x - px, z - pz) < 1e-4 && forward ? stuck + dt : 0;
    if (stuck > 1) break;
    const ground = world.support(x, z, feet);
    if (ground >= feet) {
      feet += (ground - feet) * Math.min(1, dt * 16);
      fall = 0;
    } else {
      fall = Math.min(fall + dt * 14, 9);
      feet = Math.max(ground, feet - Math.max(fall, 3) * dt);
    }
  }
  return { feet, reached: next >= path.length, x, z, next };
}

describe('steering up every stair style', () => {
  for (const style of ['stairs', 'stairs-l', 'stairs-winder', 'stairs-u', 'stairs-spiral'])
    for (const turns of [0, 1, 2, 3])
      for (const mirror of [false, true])
        it(`${style}, turned ${turns * 90}°${mirror ? ', flipped' : ''}`, () => {
          const p = blankProject();
          p.floors.push({ level: 1, name: 'Upstairs' });
          const below = createItem('room', 0, -5, -5),
            above = createItem('room', 1, -5, -5);
          Object.assign(below, { w: 12, d: 12 });
          Object.assign(above, { w: 12, d: 12 });
          let s = createItem(style, 0, 0, 0);
          s.mirror = mirror || undefined;
          p.items = [below, above, s];
          for (let n = 0; n < turns; n++) {
            const q = rotateItem(p, s.id);
            p.items = q.items;
            s = p.items.find((i) => i.id === s.id)!;
            s.mirror = mirror || undefined;
          }
          const r = steer(p, s);
          expect(r, JSON.stringify(r)).toMatchObject({ reached: true });
          expect(r.feet).toBeGreaterThan(FLOOR_H - 0.3);
        });
});

/** Walks from point to point like a person with the keys: turn to face, hold W, ease in and out. */
function tour(p: Project, route: [number, number][], feet0 = 0) {
  const world = buildWalkWorld(p);
  let [x, z] = route[0],
    feet = feet0,
    fall = 0,
    vx = 0,
    vz = 0;
  const dt = 1 / 60;
  for (const [tx, tz] of route.slice(1)) {
    for (let t = 0; t < 12 && Math.hypot(tx - x, tz - z) > 0.12; t += dt) {
      const d = Math.hypot(tx - x, tz - z);
      const ease = Math.min(1, dt * 8);
      vx += (((tx - x) / d) * 2.4 - vx) * ease;
      vz += (((tz - z) / d) * 2.4 - vz) * ease;
      if (world.free(x + vx * dt, z, feet)) x += vx * dt;
      else vx = 0;
      if (world.free(x, z + vz * dt, feet)) z += vz * dt;
      else vz = 0;
      const ground = world.support(x, z, feet);
      if (ground >= feet) {
        feet += (ground - feet) * Math.min(1, dt * 16);
        fall = 0;
      } else {
        fall = Math.min(fall + dt * 14, 9);
        feet = Math.max(ground, feet - Math.max(fall, 3) * dt);
      }
    }
    if (Math.hypot(tx - x, tz - z) > 0.2) return { x, z, feet, stuckBefore: [tx, tz] };
  }
  return { x, z, feet, stuckBefore: null };
}

describe("walking round Arthur's House", () => {
  const p = arthurProject();
  it('goes from the front door, through the foyer and up the stairs', () => {
    const r = tour(p, [
      [-0.25, -1],
      [-0.25, -4.4],
      [-2.9, -4.4],
      [-2.9, -7.0],
      [-0.3, -7.0],
      [-0.3, -4.3],
    ]);
    expect(r.stuckBefore).toBeNull();
    expect(r.feet).toBeCloseTo(FLOOR_H, 1);
  });
  it('goes from the kitchen down to the laundry', () => {
    const r = tour(p, [
      [3.0, -8.0],
      [0.05, -8.0],
      [0.05, -11.85],
    ]);
    expect(r.stuckBefore).toBeNull();
    expect(r.feet).toBeCloseTo(-FLOOR_H, 1);
  });
  it("won't let you walk in under the stairs and get stuck there", () => {
    const world = buildWalkWorld(p);
    // Under the upper flight, coming from the front door.
    expect(world.free(-0.3, -5.6, 0)).toBe(false);
  });
});
