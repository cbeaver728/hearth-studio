import { describe, it, expect } from 'vitest';
import { blankProject, createItem, rotateItem, validateProject, WALL_H } from '../src/model';
import { arcOf, curvePieces, nearestOnCurve, pointAt } from '../src/curve';
import { buildWalkWorld } from '../src/walk';

/** A curved wall 3.2 m across, bowed 0.8 m, in a room. */
function curved(bow = 0.8) {
  const p = blankProject();
  const room = createItem('room', 0, -2, -2);
  Object.assign(room, { w: 9, d: 9 });
  const wall = createItem('curve', 0, 0, 0);
  Object.assign(wall, { w: 3.2, d: bow });
  p.items = [room, wall];
  return { p, wall };
}

describe('curved walls', () => {
  it('springs from the footprint corners and bows to the middle', () => {
    const { wall } = curved();
    const a = arcOf(wall);
    const [u0, v0] = pointAt(a, 0);
    const [um, vm] = pointAt(a, 0.5);
    const [u1, v1] = pointAt(a, 1);
    expect(u0).toBeCloseTo(0);
    expect(v0).toBeCloseTo(wall.d);
    expect(u1).toBeCloseTo(wall.w);
    expect(v1).toBeCloseTo(wall.d);
    expect(um).toBeCloseTo(wall.w / 2);
    expect(vm).toBeCloseTo(0);
    // The curve is longer than the straight line it replaces.
    expect(a.length).toBeGreaterThan(wall.w);
  });
  it('makes a half-round when the depth is half the width', () => {
    const { wall } = curved(1.6);
    const a = arcOf(wall);
    expect(a.r).toBeCloseTo(1.6);
    expect(a.length).toBeCloseTo(Math.PI * 1.6, 1);
  });
  it('blocks you like any other wall', () => {
    const { p, wall } = curved();
    const world = buildWalkWorld(p);
    const a = arcOf(wall);
    const [u, v] = pointAt(a, 0.5);
    expect(world.free(wall.x + u, wall.z + v, 0)).toBe(false);
    // Well clear of it, you can walk.
    expect(world.free(wall.x + u, wall.z + v + 1.5, 0)).toBe(true);
  });
  it('leaves a doorway open but keeps a window solid', () => {
    for (const [kind, blocked] of [
      ['door', false],
      ['window', true],
    ] as const) {
      const { p, wall } = curved();
      p.openings = [{ id: 'o', roomId: wall.id, side: 'north', offset: 0.5, width: 1, kind }];
      const world = buildWalkWorld(p);
      const [u, v] = pointAt(arcOf(wall), 0.5);
      expect(world.free(wall.x + u, wall.z + v, 0), kind).toBe(!blocked);
      // The far end of the curve still stands.
      const [eu, ev] = pointAt(arcOf(wall), 0.04);
      expect(world.free(wall.x + eu, wall.z + ev, 0), kind).toBe(false);
    }
  });
  it('marks the pieces a window covers', () => {
    const { p, wall } = curved();
    p.openings = [
      { id: 'o', roomId: wall.id, side: 'north', offset: 0.5, width: 1.2, kind: 'window' },
    ];
    const pieces = curvePieces(wall, p.openings);
    expect(pieces.some((piece) => piece.fill === 'window')).toBe(true);
    expect(pieces.filter((piece) => piece.fill === 'window').length).toBeLessThan(pieces.length);
    expect(pieces.every((piece) => piece.fill !== 'gap')).toBe(true);
  });
  it('finds where a click lands along the curve, at any rotation', () => {
    let { p, wall } = curved();
    for (let turn = 0; turn < 4; turn++) {
      const a = arcOf(wall);
      for (const t of [0.15, 0.5, 0.85]) {
        const [u, v] = pointAt(a, t);
        // Turn the local point into a plan point the way the renderer does.
        const [x, z] =
          wall.rotation === 90
            ? [wall.x + wall.w - v, wall.z + u]
            : wall.rotation === 180
              ? [wall.x + wall.w - u, wall.z + wall.d - v]
              : wall.rotation === 270
                ? [wall.x + v, wall.z + wall.d - u]
                : [wall.x + u, wall.z + v];
        const near = nearestOnCurve(wall, x, z);
        expect(near.distance, `${wall.rotation}°`).toBeLessThan(0.05);
        expect(near.t, `${wall.rotation}°`).toBeCloseTo(t, 1);
      }
      p = rotateItem(p, wall.id);
      wall = p.items.find((i) => i.kind === 'curve')!;
    }
  });
  it('saves and reloads, windows and all', () => {
    const { p, wall } = curved();
    p.openings = [
      { id: 'o', roomId: wall.id, side: 'north', offset: 0.5, width: 1, kind: 'window' },
    ];
    const back = validateProject(JSON.parse(JSON.stringify(p)));
    expect(back.items.some((i) => i.kind === 'curve')).toBe(true);
    expect(back.openings[0].roomId).toBe(wall.id);
    expect(WALL_H).toBe(3);
  });
});
