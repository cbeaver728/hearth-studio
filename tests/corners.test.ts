import { describe, it, expect } from 'vitest';
import { blankProject, buildWalls, createItem, uid, validateProject } from '../src/model';
import { cornerArcs, roomPath } from '../src/corners';
import { buildWalkWorld } from '../src/walk';
import * as T from 'three';
import { buildRoofs } from '../src/roof3d';
import { planRoof } from '../src/roof';

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

describe('roofs over rounded corners', () => {
  const house = (roofStyle: 'gable' | 'flat' | 'cape') => {
    const p = blankProject();
    p.roofStyle = roofStyle;
    const r = createItem('room', 0, 0, 0);
    Object.assign(r, { w: 8, d: 6, radius: 1.5, rounded: ['sw', 'se'] });
    p.items = [r];
    if (roofStyle === 'cape') {
      p.floors.push({ level: 1, name: 'Upstairs' });
      const up = createItem('room', 1, 0, 0);
      Object.assign(up, { w: 8, d: 6, radius: 1.5, rounded: ['sw', 'se'] });
      p.items.push(up);
    }
    return p;
  };
  /** Every roof vertex in plan, from the real roof builder. */
  const roofPoints = (p: ReturnType<typeof house>) => {
    const pts: [number, number, number][] = [];
    const m = new T.MeshBasicMaterial();
    buildRoofs({
      p,
      plan: planRoof(p),
      add: (mesh) => {
        if (!mesh || mesh.material !== m) return;
        mesh.updateMatrixWorld();
        const pos = mesh.geometry.attributes.position;
        const v = new T.Vector3();
        for (let n = 0; n < pos.count; n++) {
          v.fromBufferAttribute(pos, n).applyMatrix4(mesh.matrixWorld);
          pts.push([v.x, v.y, v.z]);
        }
      },
      mat: () => new T.MeshBasicMaterial(),
      roof: m,
      roofTile: 1.4,
      siding: () => new T.MeshBasicMaterial(),
      sidingTile: 1.6,
      ceiling: new T.MeshBasicMaterial(),
      paintAt: () => new T.MeshBasicMaterial(),
      evening: false,
    });
    return pts;
  };
  for (const style of ['gable', 'flat', 'cape'] as const)
    it(`rounds a ${style} roof where the room below is rounded`, () => {
      const p = house(style);
      const level = style === 'cape' ? 1 : 0;
      const wing = planRoof(p).wings.find((w) => w.top && w.level === level)!;
      expect(wing.round).toEqual({ sw: 1.5, se: 1.5 });
      const pts = roofPoints(p);
      expect(pts.length).toBeGreaterThan(0);
      // No roof reaches the square corners that were rounded off...
      const outside = (x: number, z: number) => {
        const cx = x < 4 ? 1.5 : 6.5,
          cz = 4.5;
        return z > cz && (x < 1.5 || x > 6.5) && Math.hypot(x - cx, z - cz) > 1.5 + 0.35;
      };
      expect(pts.filter(([x, , z]) => outside(x, z))).toEqual([]);
      // ...but the square ones keep their full overhang.
      expect(pts.some(([x, , z]) => x < -0.25 && z < -0.25)).toBe(true);
    });
});
