import { describe, it, expect } from 'vitest';
import * as T from 'three';
import {
  blankProject,
  createItem,
  FLOOR_H,
  validateProject,
  WALL_H,
  type Project,
} from '../src/model';
import { GAMBREL_STEEP, halfSpan, planRoof, ridgeOf, rise, undersideAt } from '../src/roof';
import { buildRoofs } from '../src/roof3d';
import { arcOutline, curveFloor, curveRoofGrid } from '../src/curveroof';
import { buildWalkWorld } from '../src/walk';
import { toWorld } from '../src/stairs';

/** A plain 10 × 6 m one-storey house with the ridge running along x. */
function house(style: Project['roofStyle'], pitch?: Project['roofPitch']) {
  const p = blankProject();
  p.roofStyle = style;
  p.roofPitch = pitch;
  p.roofAxis = 'x';
  p.items = [Object.assign(createItem('room', 0, 0, 0), { w: 10, d: 6 })];
  return p;
}

describe('roof shapes', () => {
  it('a hip roof slopes down at the ends as well as the sides', () => {
    const w = planRoof(house('hip')).wings[0];
    expect(w.shape).toBe('hip');
    const middle = undersideAt(w, 5, 3)!,
      nearEnd = undersideAt(w, 0.5, 3)!;
    expect(middle).toBeCloseTo(ridgeOf(w), 5);
    // Half a meter in from the end, the roof is as low as half a meter in from an eave.
    expect(nearEnd).toBeCloseTo(undersideAt(w, 5, 0.5)!, 5);
    // A gable stays at full height right out to its end wall.
    const g = planRoof(house('gable')).wings[0];
    expect(undersideAt(g, 0.5, 3)).toBeCloseTo(ridgeOf(g), 5);
  });
  it('a gambrel is steep below the break and gentle above it', () => {
    const w = planRoof(house('gambrel')).wings[0];
    const half = halfSpan(w);
    const below = (rise(w, 0.5) - rise(w, 0)) / 0.5,
      above = (rise(w, half) - rise(w, half - 0.5)) / 0.5;
    expect(below / above).toBeCloseTo(GAMBREL_STEEP, 5);
    expect(ridgeOf(w)).toBeGreaterThan(ridgeOf(planRoof(house('gable')).wings[0]));
  });
  it('pitch makes the roof lower or steeper', () => {
    const ridge = (pitch?: Project['roofPitch']) =>
      ridgeOf(planRoof(house('gable', pitch)).wings[0]);
    expect(ridge('low')).toBeLessThan(ridge());
    expect(ridge('steep')).toBeGreaterThan(ridge());
  });
  it('builds hip and gambrel roofs without gaps in the mesh', () => {
    for (const style of ['hip', 'gambrel'] as const) {
      const p = house(style);
      const meshes: T.Mesh[] = [];
      const m = new T.MeshBasicMaterial();
      buildRoofs({
        p,
        plan: planRoof(p),
        add: (x) => x && meshes.push(x),
        mat: () => m,
        roof: m,
        roofTile: 1,
        siding: () => m,
        sidingTile: 1,
        ceiling: m,
        paintAt: () => m,
        evening: false,
      });
      // A hip has two sides and two ends; a gambrel two pieces a side; both have a ceiling.
      const roofFaces = meshes.filter(
        (x) => x.material === m && x.geometry.type === 'BufferGeometry',
      );
      expect(roofFaces.length, style).toBeGreaterThanOrEqual(5);
      // The highest point of the roof is the ridge.
      const top = Math.max(...roofFaces.map((x) => new T.Box3().setFromObject(x).max.y));
      expect(top).toBeCloseTo(ridgeOf(planRoof(p).wings[0]) + 0.12, 1);
    }
  });
  it('keeps the new settings through save and load', () => {
    const p = house('hip', 'steep');
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toMatchObject({
      roofStyle: 'hip',
      roofPitch: 'steep',
    });
    expect(() => validateProject({ ...p, roofStyle: 'dome' })).toThrow();
    expect(() => validateProject({ ...p, roofPitch: 'vertical' })).toThrow();
  });
});

describe('the space inside a curved wall', () => {
  // A half-round bay, 4 m across, off the front of a room.
  const bay = () => Object.assign(createItem('curve', 1, -2, 3), { w: 4, d: 2, rotation: 180 });
  it('has a floor you can walk on, even upstairs', () => {
    const p = blankProject();
    p.floors.push({ level: 1, name: 'Upstairs' });
    const room = Object.assign(createItem('room', 1, -5, -3), { w: 10, d: 6 });
    const below = Object.assign(createItem('room', 0, -5, -3), { w: 10, d: 6 });
    const b = bay();
    p.items = [below, room, b];
    p.openings = [
      { id: 'o', roomId: room.id, side: 'south', offset: 0.5, width: 3.6, kind: 'arch' },
    ] as Project['openings'];
    const world = buildWalkWorld(p);
    // Out in the middle of the bay, a meter past the room's wall.
    expect(world.support(0, 4, FLOOR_H)).toBeCloseTo(FLOOR_H, 5);
    // But not outside the curve.
    expect(world.support(-1.9, 4.9, FLOOR_H)).toBeLessThan(0.1);
  });
  it('covers the whole curve with its floor strips', () => {
    const b = bay();
    const strips = curveFloor(b);
    const inside = (x: number, z: number) =>
      strips.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    for (const [u, v] of arcOutline(b, 1.7, 12).slice(1, -1)) {
      const [x, z] = toWorld(b, u, v);
      expect(inside(x, z), `${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true);
    }
  });
  it('gets a cone that rises from the eave to the house, or a dome', () => {
    const b = bay();
    const cone = curveRoofGrid(b, 'cone', 0.3, 1);
    // Half round: the cone peaks right at the house wall, as high as the bay is deep.
    expect(cone.top).toBeCloseTo(WALL_H + 2, 5);
    for (const row of cone.rows) {
      expect(row[0][1]).toBeCloseTo(WALL_H - 0.3, 5);
      expect(row[row.length - 1][1]).toBeGreaterThan(row[0][1]);
    }
    const dome = curveRoofGrid(b, 'dome', 0.3, 1);
    expect(dome.top).toBeGreaterThan(WALL_H + 0.5);
    expect(dome.top).toBeLessThan(cone.top);
  });
});
