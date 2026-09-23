import { describe, it, expect } from 'vitest';
import {
  blankProject,
  createItem,
  deleteFloor,
  flipItem,
  FLOOR_H,
  onLevel,
  rotateItem,
  sampleProject,
  stairLevels,
  validateProject,
  type StairStyle,
} from '../src/model';
import {
  layoutFor,
  localSize,
  stairEnds,
  stairHeightAt,
  subtractRects,
  toLocal,
  toWorld,
} from '../src/stairs';
import { buildWalkWorld, floorRects, stairGuards } from '../src/walk';
import { addLevel } from '../src/floors';

const styles: StairStyle[] = ['straight', 'l', 'u', 'spiral'];

describe('stair geometry', () => {
  it('climbs one full floor with 15 treads in every style', () => {
    for (const style of styles) {
      const s = createItem(style === 'straight' ? 'stairs' : `stairs-${style}`, 0, 0, 0);
      const layout = layoutFor(s);
      expect(layout.treads.map((t) => t.k)).toEqual(Array.from({ length: 15 }, (_, n) => n + 1));
    }
  });
  it('maps local and plan coordinates both ways at every rotation', () => {
    let p = blankProject();
    const s = createItem('stairs-l', 0, 2, 3);
    p.items = [s];
    for (let turn = 0; turn < 4; turn++) {
      const i = p.items[0];
      const { LW, LD } = localSize(i);
      for (const [u, v] of [
        [0.1, 0.2],
        [LW - 0.3, LD - 0.1],
      ]) {
        const [x, z] = toWorld(i, u, v);
        expect(x).toBeGreaterThanOrEqual(i.x - 1e-9);
        expect(x).toBeLessThanOrEqual(i.x + i.w + 1e-9);
        const [u2, v2] = toLocal(i, x, z);
        expect(u2).toBeCloseTo(u);
        expect(v2).toBeCloseTo(v);
      }
      p = rotateItem(p, i.id);
    }
    expect(p.items[0].rotation).toBe(0);
  });
  it('turning a straight run points it the other way', () => {
    let p = blankProject();
    const s = createItem('stairs', 0, 0, 0);
    p.items = [s];
    // At rotation 0 the bottom step is at the south end.
    expect(stairHeightAt(s, 0.5, s.d - 0.05)).toBeCloseTo(0.2);
    expect(stairHeightAt(s, 0.5, 0.05)).toBeCloseTo(3.0);
    p = rotateItem(rotateItem(p, s.id), s.id);
    const t = p.items[0];
    expect(stairHeightAt(t, t.x + 0.5, t.z + t.d - 0.05)).toBeCloseTo(3.0);
    expect(stairHeightAt(t, t.x + 0.5, t.z + 0.05)).toBeCloseTo(0.2);
  });
  it('knows which floors down-stairs join', () => {
    const s = createItem('stairs', 1, 0, 0);
    s.dir = 'down';
    expect(stairLevels(s)).toEqual({ lower: 0, upper: 1 });
    expect(onLevel(s, 0) && onLevel(s, 1) && !onLevel(s, 2)).toBe(true);
    expect(stairHeightAt(s, 0.5, s.d - 0.05)).toBeCloseTo(0.2);
  });
  it('flips a turning run, so there are eight positions instead of four', () => {
    let p = blankProject();
    const s = createItem('stairs-l', 0, 0, 0);
    p.items = [s];
    const spots = new Set<string>();
    for (let turn = 0; turn < 8; turn++) {
      const i = p.items[0];
      spots.add(stairEnds(i).top.map((n) => n.toFixed(2)) + '/' + i.rotation);
      p = rotateItem(p, i.id);
    }
    expect(spots.size).toBe(8);
    // Eight turns brings it back to where it started.
    expect(p.items[0].rotation).toBe(0);
    expect(p.items[0].mirror).toBe(false);
  });
  it('leaves straight runs unflipped, since they look the same either way', () => {
    let p = blankProject();
    p.items = [createItem('stairs', 0, 0, 0)];
    for (let turn = 0; turn < 4; turn++) p = rotateItem(p, p.items[0].id);
    expect(p.items[0].mirror).toBeUndefined();
  });
  it('mirrors every flight, and mirroring twice puts them back', () => {
    for (const style of ['l', 'u', 'spiral'] as StairStyle[]) {
      let p = blankProject();
      const s = createItem(`stairs-${style}`, 0, 0, 0);
      p.items = [s];
      const { LW } = localSize(s);
      const plain = layoutFor(s);
      p = flipItem(p, s.id);
      const flipped = layoutFor(p.items[0]);
      // The top step ends up on the other side of the footprint.
      const top = (l: ReturnType<typeof layoutFor>) => l.path[l.path.length - 1][0];
      expect(top(flipped), style).toBeCloseTo(LW - top(plain));
      expect(layoutFor(flipItem(p, s.id).items[0]).path, style).toEqual(plain.path);
      // Every tread is still there, at the same height.
      expect(
        flipped.treads.map((t) => t.k),
        style,
      ).toEqual(plain.treads.map((t) => t.k));
    }
  });
  it('climbs a mirrored run just as well', () => {
    const s = createItem('stairs-l', 0, 0, 0);
    s.mirror = true;
    const layout = layoutFor(s);
    for (const [u, v] of layout.path) {
      const [x, z] = toWorld(s, u, v);
      expect(stairHeightAt(s, x, z)).toBeGreaterThan(0);
    }
    const [bx, bz] = toWorld(s, ...(layout.path[0] as [number, number]));
    const [tx, tz] = toWorld(s, ...(layout.path[layout.path.length - 1] as [number, number]));
    expect(stairHeightAt(s, bx, bz)!).toBeLessThan(0.6);
    expect(stairHeightAt(s, tx, tz)!).toBeGreaterThan(2.7);
  });
  it('subtracts openings from floor slabs', () => {
    const pieces = subtractRects({ x0: 0, z0: 0, x1: 4, z1: 4 }, [{ x0: 1, z0: 1, x1: 2, z1: 3 }]);
    const area = pieces.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    expect(area).toBeCloseTo(14);
  });
});

describe('walkthrough', () => {
  const walk = (
    world: ReturnType<typeof buildWalkWorld>,
    start: [number, number, number],
    moves: [number, number, number][],
  ) => {
    let [x, z, feet] = start;
    for (const [dx, dz, secs] of moves)
      for (let t = 0; t < secs; t += 1 / 60) {
        const vx = dx * 2.4 * (1 / 60),
          vz = dz * 2.4 * (1 / 60);
        if (world.free(x + vx, z, feet)) x += vx;
        if (world.free(x, z + vz, feet)) z += vz;
        const g = world.support(x, z, feet);
        feet = g >= feet ? feet + (g - feet) * 0.3 : Math.max(g, feet - 0.05);
      }
    return { x, z, feet };
  };
  it('walks up the sample stairs to the next floor and back down', () => {
    const p = sampleProject();
    const world = buildWalkWorld(p);
    const up = walk(world, [5.35, 4.6, 0], [[0, -1, 3.5]]);
    expect(up.feet).toBeCloseTo(FLOOR_H, 1);
    expect(world.levelOf(up.feet)).toBe(1);
    const down = walk(world, [up.x, up.z, up.feet], [[0, 1, 3.5]]);
    expect(down.feet).toBeCloseTo(0, 1);
  });
  it('climbs every stair style', () => {
    for (const style of styles) {
      const p = blankProject();
      p.floors.push({ level: 1, name: 'Upstairs' });
      const s = createItem(style === 'straight' ? 'stairs' : `stairs-${style}`, 0, 0, 0);
      const below = createItem('room', 0, -3, -3),
        above = createItem('room', 1, -3, -3);
      Object.assign(below, { w: 10, d: 10 });
      Object.assign(above, { w: 10, d: 10 });
      p.items = [below, above, s];
      const world = buildWalkWorld(p);
      // Follow the plan arrow from the bottom step to the top, then step off.
      const path = layoutFor(s).path.map(([u, v]) => toWorld(s, u, v));
      let pos = { x: path[0][0], z: path[0][1], feet: 0 };
      for (let n = 1; n < path.length; n++) {
        const [tx, tz] = path[n];
        for (let k = 0; k < 400 && Math.hypot(tx - pos.x, tz - pos.z) > 0.05; k++) {
          const d = Math.hypot(tx - pos.x, tz - pos.z);
          pos = walk(
            world,
            [pos.x, pos.z, pos.feet],
            [[(tx - pos.x) / d, (tz - pos.z) / d, 1 / 60]],
          );
        }
      }
      expect(pos.feet, style).toBeGreaterThan(2.7);
    }
  });
  it('only rails the sides that need one', () => {
    const p = blankProject();
    p.floors.push({ level: 1, name: 'Upstairs' });
    const below = createItem('room', 0, 0, 0),
      above = createItem('room', 1, 0, 0);
    Object.assign(below, { w: 6, d: 6 });
    Object.assign(above, { w: 6, d: 6 });
    // Flush against the west wall of the room.
    const s = createItem('stairs', 0, 0, 1);
    p.items = [below, above, s];
    const guards = stairGuards(p, s);
    const atWall = (r: { a: [number, number]; b: [number, number] }) =>
      r.a[0] === 0 && r.b[0] === 0;
    const atOpenSide = (r: { a: [number, number]; b: [number, number] }) =>
      r.a[0] === s.w && r.b[0] === s.w;
    expect(guards.rails.some(atWall)).toBe(false);
    expect(guards.banisters.some(atWall)).toBe(false);
    expect(guards.rails.some(atOpenSide)).toBe(true);
    expect(guards.banisters.some(atOpenSide)).toBe(true);
  });
  it('leaves rails off an opening nobody can walk up to', () => {
    const p = blankProject();
    p.floors.push({ level: 1, name: 'Upstairs' });
    const below = createItem('room', 0, 0, 0);
    Object.assign(below, { w: 6, d: 6 });
    const s = createItem('stairs', 0, 1, 1);
    p.items = [below, s];
    // Nothing is built upstairs yet, so there is no floor beside the opening.
    expect(stairGuards(p, s).rails).toHaveLength(0);
  });
  it('cuts the stair opening out of the upper floor and guards it', () => {
    const p = sampleProject();
    const s = p.items.find((i) => i.kind === 'stairs')!;
    const holes = floorRects(p, 1).filter(
      (r) =>
        r.x0 < s.x + s.w / 2 &&
        r.x1 > s.x + s.w / 2 &&
        r.z0 < s.z + s.d / 2 &&
        r.z1 > s.z + s.d / 2,
    );
    expect(holes).toHaveLength(0);
    const world = buildWalkWorld(p);
    // Walking sideways into the opening from the landing is blocked by the rail.
    expect(world.free(s.x - 0.1, s.z + s.d / 2, FLOOR_H)).toBe(false);
  });
});

describe('floors', () => {
  it('adds an upper floor with connecting stairs and a landing', () => {
    const p = blankProject();
    const room = createItem('room', 0, 0, 0);
    Object.assign(room, { w: 6, d: 6, name: 'Hall' });
    p.items = [room];
    const result = addLevel(p, { type: 'upper', stairs: 'u' })!;
    expect(result.level).toBe(1);
    const stairs = result.project.items.find((i) => i.kind === 'stairs')!;
    expect(stairs.style).toBe('u');
    expect(stairLevels(stairs)).toEqual({ lower: 0, upper: 1 });
    expect(stairs.x).toBeGreaterThanOrEqual(0);
    expect(stairs.x + stairs.w).toBeLessThanOrEqual(6);
    const landing = result.project.items.find((i) => i.kind === 'room' && i.floor === 1)!;
    expect(landing.x).toBeLessThanOrEqual(stairs.x);
    expect(landing.x + landing.w).toBeGreaterThanOrEqual(stairs.x + stairs.w);
    expect(() => validateProject(result.project)).not.toThrow();
  });
  it('lays new stairs so both ends open into rooms, in every style', () => {
    for (const style of styles) {
      const p = blankProject();
      const hall = createItem('room', 0, 0, 0);
      Object.assign(hall, { w: 5, d: 4, name: 'Hall' });
      p.items = [hall];
      const { project } = addLevel(p, { type: 'upper', stairs: style })!;
      const s = project.items.find((i) => i.kind === 'stairs')!;
      const inside = (level: number, [x, z]: [number, number]) =>
        project.items.some(
          (r) =>
            r.kind === 'room' &&
            r.floor === level &&
            x > r.x &&
            x < r.x + r.w &&
            z > r.z &&
            z < r.z + r.d,
        );
      const ends = stairEnds(s);
      expect(inside(0, ends.bottom), style).toBe(true);
      expect(inside(1, ends.top), style).toBe(true);
    }
  });
  it('adds a basement with stairs leading down', () => {
    const p = sampleProject();
    const result = addLevel(p, { type: 'basement', stairs: 'spiral' })!;
    expect(result.level).toBe(-1);
    const stairs = result.project.items.filter(
      (i) => i.kind === 'stairs' && stairLevels(i).lower === -1,
    );
    expect(stairs).toHaveLength(1);
    expect(stairs[0].floor).toBe(0);
    expect(stairs[0].dir).toBe('down');
  });
  it('deletes a middle floor and closes the gap', () => {
    let p = blankProject();
    p = addLevel(p, { type: 'upper', stairs: 'straight' })!.project;
    p = addLevel(p, { type: 'upper', stairs: null })!.project;
    const top = createItem('room', 2, 0, 0);
    p.items.push(top);
    const next = deleteFloor(p, 1);
    expect(next.floors.map((f) => f.level)).toEqual([0, 1]);
    expect(next.items.find((i) => i.id === top.id)!.floor).toBe(1);
    expect(next.items.some((i) => i.kind === 'stairs')).toBe(false);
    expect(() => validateProject(next)).not.toThrow();
  });
  it('opens older projects whose stairs had no style or direction', () => {
    const p = sampleProject();
    const s = p.items.find((i) => i.kind === 'stairs')!;
    delete s.style;
    delete s.dir;
    s.rotation = 0;
    const loaded = validateProject(JSON.parse(JSON.stringify(p)));
    const t = loaded.items.find((i) => i.kind === 'stairs')!;
    expect(t.style).toBe('straight');
    expect(t.dir).toBe('up');
  });
});
