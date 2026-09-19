import { describe, it, expect } from 'vitest';
import {
  blankProject,
  buildWalls,
  ceilingHeight,
  createItem,
  FLOOR_H,
  isPassable,
  openingKinds,
  sampleProject,
  TALL_H,
  validateProject,
  WALL_H,
  type OpeningKind,
} from '../src/model';
import { buildWalkWorld, floorRects, landingRails, wallBoxes } from '../src/walk';

/** Two rooms side by side sharing the wall at x = 4. */
function pair(kind: OpeningKind, width = 1) {
  const p = blankProject();
  const a = createItem('room', 0, 0, 0),
    b = createItem('room', 0, 4, 0);
  p.items = [a, b];
  p.openings = [{ id: 'o', roomId: a.id, side: 'east', offset: 0.5, width, kind }];
  return p;
}

describe('opening kinds', () => {
  it('keeps every kind through a save and reload', () => {
    const p = sampleProject();
    for (const [n, k] of openingKinds.entries())
      if (p.openings[n]) p.openings[n] = { ...p.openings[n], kind: k.kind, width: k.width };
    const back = validateProject(JSON.parse(JSON.stringify(p)));
    expect(back.openings.map((o) => o.kind)).toEqual(p.openings.map((o) => o.kind));
  });
  it('lets you walk through doors, sliders and archways but not windows or garage doors', () => {
    for (const { kind, width } of openingKinds) {
      const p = pair(kind, width);
      const gap = wallBoxes(p).filter((b) => Math.abs(b.x0 - 3.92) < 0.01 && b.z0 < 2 && b.z1 > 2);
      expect(gap.length === 0, kind).toBe(isPassable(kind));
    }
  });
  it('takes the whole wall away when the wall is removed', () => {
    const p = pair('open');
    const shared = buildWalls(p).filter((w) => w.axis === 'z' && w.line === 4);
    expect(shared).toHaveLength(1);
    expect(shared[0].openings[0]).toEqual({ start: 0, end: 4, kind: 'open' });
    expect(wallBoxes(p).some((b) => Math.abs(b.x0 - 3.92) < 0.01)).toBe(false);
  });
  it('still blocks the other walls of the room', () => {
    const p = pair('open');
    expect(wallBoxes(p).some((b) => Math.abs(b.z0 - -0.08) < 0.01)).toBe(true);
  });
});

describe('landings', () => {
  const withLanding = (floor: number) => {
    const p = blankProject();
    if (floor > 0) p.floors.push({ level: 1, name: 'Upstairs' });
    const room = createItem('room', floor, 0, 0);
    Object.assign(room, { w: 4, d: 4 });
    const landing = createItem('landing', floor, 0, 4);
    Object.assign(landing, { w: 3, d: 1.8 });
    p.items = [room, landing];
    return { p, room, landing };
  };
  it('is a floor you can stand on, at its own level', () => {
    const { p, landing } = withLanding(1);
    const rects = floorRects(p, 1);
    expect(rects.some((r) => r.x0 === landing.x && r.z0 === landing.z)).toBe(true);
    const world = buildWalkWorld(p);
    expect(world.support(landing.x + 1, landing.z + 0.9, FLOOR_H + 0.1)).toBeCloseTo(FLOOR_H);
  });
  it('rails every edge except the one against the room', () => {
    const { p, landing } = withLanding(1);
    const rails = landingRails(p, landing);
    expect(rails).toHaveLength(3);
    // The shared edge (z = 4, against the room) is left open to walk through.
    expect(rails.some((r) => Math.abs(r.z0 - (landing.z - 0.06)) < 0.001)).toBe(false);
    const world = buildWalkWorld(p);
    // The far edge is railed off.
    expect(world.free(landing.x + 1.5, landing.z + landing.d, FLOOR_H)).toBe(false);
  });
  it('leaves a patio at ground level open, with no rail', () => {
    const { p, landing } = withLanding(0);
    const world = buildWalkWorld(p);
    expect(world.free(landing.x + 1.5, landing.z + landing.d - 0.05, 0)).toBe(true);
    expect(() => validateProject(p)).not.toThrow();
  });
  it('keeps a porch roof on posts', () => {
    const { p, landing } = withLanding(0);
    landing.covered = true;
    const back = validateProject(JSON.parse(JSON.stringify(p)));
    expect(back.items.find((i) => i.kind === 'landing')!.covered).toBe(true);
    const world = buildWalkWorld(p);
    expect(world.free(landing.x + 0.1, landing.z + 0.1, 0)).toBe(false);
  });
});

describe('ceilings', () => {
  const twoFloors = (ceiling?: 'tall' | 'open', roomAbove = true) => {
    const p = blankProject();
    p.floors.push({ level: 1, name: 'Upstairs' });
    const entry = createItem('room', 0, 0, 0);
    Object.assign(entry, { w: 4, d: 4, name: 'Entry', ceiling });
    const over = createItem('room', 1, 0, 0);
    Object.assign(over, { w: 4, d: 4, name: 'Landing' });
    const beside = createItem('room', 1, 4, 0);
    Object.assign(beside, { w: 4, d: 4, name: 'Bedroom' });
    p.items = roomAbove ? [entry, over, beside] : [entry, beside];
    return { p, entry, over, beside };
  };
  it('stands walls at the usual height by default', () => {
    const { p, entry } = twoFloors();
    expect(ceilingHeight(p, entry)).toBe(WALL_H);
    expect(buildWalls(p).every((w) => w.height === WALL_H)).toBe(true);
  });
  it('runs an open room right up through the floor above', () => {
    const { p, entry } = twoFloors('open', false);
    expect(ceilingHeight(p, entry)).toBeCloseTo(FLOOR_H + WALL_H);
    const wall = buildWalls(p).find((w) => w.floor === 0)!;
    expect(wall.height).toBeCloseTo(FLOOR_H + WALL_H);
    // Walking upstairs, the entry is a void, not a floor.
    expect(floorRects(p, 1).some((r) => r.x0 < 2 && r.x1 > 2 && r.z0 < 2 && r.z1 > 2)).toBe(false);
    const world = buildWalkWorld(p);
    // Nothing to stand on up there; the room's own walls keep you out of the void.
    expect(world.support(2, 2, FLOOR_H + 0.1)).toBeCloseTo(0);
    expect(world.free(4, 2, FLOOR_H)).toBe(false);
  });
  it('raises a tall ceiling only where nothing is built on top', () => {
    expect(ceilingHeight(twoFloors('tall').p, twoFloors('tall').entry)).toBe(WALL_H);
    const open = twoFloors('tall', false);
    expect(ceilingHeight(open.p, open.entry)).toBeCloseTo(TALL_H);
  });
  it('keeps a shared wall as tall as the taller room beside it', () => {
    const { p, entry } = twoFloors('open', false);
    const neighbour = createItem('room', 0, 4, 0);
    Object.assign(neighbour, { w: 4, d: 4 });
    p.items.push(neighbour);
    const shared = buildWalls(p).find((w) => w.floor === 0 && w.axis === 'z' && w.line === 4)!;
    expect(shared.height).toBeCloseTo(ceilingHeight(p, entry));
  });
  it('saves and reloads the setting', () => {
    const { p } = twoFloors('open', false);
    const back = validateProject(JSON.parse(JSON.stringify(p)));
    expect(back.items.find((i) => i.name === 'Entry')!.ceiling).toBe('open');
  });
});
