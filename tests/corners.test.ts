import { describe, it, expect } from 'vitest';
import { blankProject, buildWalls, createItem, uid, validateProject } from '../src/model';
import { cornerArcs, roomPath } from '../src/corners';
import { buildWalkWorld } from '../src/walk';

function roundRoom(rounded?: ('nw' | 'ne' | 'sw' | 'se')[]) {
  const p = blankProject();
  const r = createItem('room', 0, 0, 0);
  Object.assign(r, { w: 6, d: 4, radius: 1.5, rounded });
  p.items = [r];
  return { p, r };
}

describe('rounded room corners', () => {
  it('stops each wall short of a rounded corner and curves round it', () => {
    const { p } = roundRoom();
    const north = buildWalls(p).find((w) => w.axis === 'x' && w.line === 0)!;
    expect(north.start).toBeCloseTo(1.5);
    expect(north.end).toBeCloseTo(4.5);
    expect(cornerArcs(p)).toHaveLength(4);
  });
  it('rounds only the corners you pick', () => {
    const { p } = roundRoom(['se']);
    const walls = buildWalls(p);
    const north = walls.find((w) => w.axis === 'x' && w.line === 0)!;
    expect([north.start, north.end]).toEqual([0, 6]);
    const south = walls.find((w) => w.axis === 'x' && w.line === 4)!;
    expect(south.end).toBeCloseTo(4.5);
    expect(cornerArcs(p).map((a) => a.corner)).toEqual(['se']);
    expect(roomPath(p.items[0])).toContain('A1.5 1.5');
  });
  it('never rounds more than half the shorter side', () => {
    const { p, r } = roundRoom();
    r.radius = 9;
    expect(cornerArcs(p)[0].r).toBeCloseTo(2);
  });
  it('keeps windows and doors on the straight part of the wall', () => {
    const { p, r } = roundRoom();
    p.openings.push({
      id: uid(),
      roomId: r.id,
      side: 'north',
      offset: 0.02,
      width: 1,
      kind: 'window',
    });
    const north = buildWalls(p).find((w) => w.axis === 'x' && w.line === 0)!;
    expect(north.openings[0].start).toBeGreaterThanOrEqual(1.5);
  });
  it('lets you walk inside the curve but not through it', () => {
    const { p } = roundRoom();
    const world = buildWalkWorld(p);
    // The middle of the room, and just inside the curve at the north-west corner.
    expect(world.free(3, 2, 0)).toBe(true);
    const inside = 1.5 - Math.SQRT1_2 * (1.5 - 0.6);
    expect(world.free(inside, inside, 0)).toBe(true);
    // On the curve itself.
    const on = 1.5 - Math.SQRT1_2 * 1.5;
    expect(world.free(on, on, 0)).toBe(false);
  });
  it('saves and reloads, and refuses nonsense', () => {
    const { p } = roundRoom(['nw', 'se']);
    expect(validateProject(JSON.parse(JSON.stringify(p))).items[0].rounded).toEqual(['nw', 'se']);
    const bad = JSON.parse(JSON.stringify(p));
    bad.items[0].rounded = ['middle'];
    expect(() => validateProject(bad)).toThrow();
  });
});
