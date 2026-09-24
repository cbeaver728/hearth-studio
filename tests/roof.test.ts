import { describe, it, expect } from 'vitest';
import {
  blankProject,
  CAPE_CEIL,
  ceilingHeight,
  createItem,
  FLOOR_H,
  halfStorey,
  KNEE,
  sampleProject,
  validateProject,
  type Item,
  type Project,
} from '../src/model';
import {
  capeCeilingAt,
  decompose,
  dormerRect,
  HEADROOM,
  lowHeadroom,
  planRoof,
  roofTopAt,
} from '../src/roof';
import { buildWalkWorld } from '../src/walk';

/** A storey-and-a-half: a 10 × 7 m house with the same footprint upstairs. */
function cape(extra: (p: Project, up: Item) => void = () => {}) {
  const p = blankProject();
  p.roofStyle = 'cape';
  p.roofAxis = 'x';
  p.floors.push({ level: 1, name: 'Upstairs' });
  const down = createItem('room', 0, 0, 0);
  Object.assign(down, { w: 10, d: 7 });
  const up = createItem('room', 1, 0, 0);
  Object.assign(up, { w: 10, d: 7 });
  p.items = [down, up];
  extra(p, up);
  return { p, up };
}

describe('roof wings', () => {
  it('splits an L-shaped footprint into two rectangles, biggest first', () => {
    const parts = decompose([
      { x0: 0, z0: 0, x1: 10, z1: 7 },
      { x0: 4, z0: 7, x1: 10, z1: 11 },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ x0: 0, z0: 0, x1: 10, z1: 7 });
  });
  it('gives a wing out the back its own ridge, running on into the main roof', () => {
    const { p } = cape((p) => {
      for (const level of [0, 1]) {
        const r = createItem('room', level, 4, 7);
        Object.assign(r, { w: 6, d: 4 });
        p.items.push(r);
      }
    });
    const { wings } = planRoof(p);
    const top = wings.filter((w) => w.top);
    expect(top).toHaveLength(2);
    expect(top[0].axis).toBe('x');
    expect(top[1].axis).toBe('z');
    expect(top[1].reach).toBeCloseTo(3);
  });
  it('keeps the old ridge direction for existing gable houses', () => {
    const p = sampleProject();
    const main = planRoof(p).wings.find((w) => w.top)!;
    expect(main.axis).toBe('z');
    expect(main.cape).toBe(false);
  });
  it('roofs a detached garage separately, ridge along its length', () => {
    const { p } = cape((p) => {
      const g = createItem('garage', 0, 14, -6);
      Object.assign(g, { w: 3.5, d: 6 });
      p.items.push(g);
    });
    const wings = planRoof(p).wings;
    const garage = wings.find((w) => w.rect.x0 === 14)!;
    expect(garage.axis).toBe('z');
    expect(garage.cape).toBe(false);
    expect(garage.base).toBeCloseTo(3);
  });
});

describe('Cape Cod half storey', () => {
  it('treats the top floor as a half storey only under a Cape roof', () => {
    const { p, up } = cape();
    expect(halfStorey(p, up)).toBe(true);
    expect(ceilingHeight(p, up)).toBe(CAPE_CEIL);
    expect(halfStorey({ ...p, roofStyle: 'gable' }, up)).toBe(false);
    expect(() => validateProject(JSON.parse(JSON.stringify(p)))).not.toThrow();
  });
  it('slopes the ceiling up from the knee walls and levels it off', () => {
    const { p } = cape();
    const plan = planRoof(p);
    expect(capeCeilingAt(plan, 1, 5, 0)).toBeCloseTo(KNEE);
    expect(capeCeilingAt(plan, 1, 5, 0.5)).toBeGreaterThan(KNEE);
    expect(capeCeilingAt(plan, 1, 5, 3.5)).toBeCloseTo(CAPE_CEIL);
    expect(capeCeilingAt(plan, 0, 5, 3.5)).toBeUndefined();
  });
  it('puts the roof well above the half storey', () => {
    const { p } = cape();
    const top = roofTopAt(planRoof(p), 5, 3.5)!;
    expect(top).toBeGreaterThan(FLOOR_H + CAPE_CEIL + 1);
  });
  it('keeps you out from under the eaves, but not off the stairs below them', () => {
    const { p } = cape();
    const world = buildWalkWorld(p);
    // Standing upstairs right against the knee wall: too low.
    expect(world.free(5, 0.4, FLOOR_H)).toBe(false);
    // In the middle of the room: fine.
    expect(world.free(5, 3.5, FLOOR_H)).toBe(true);
    // Downstairs, the same spot is open.
    expect(world.free(5, 0.4, 0)).toBe(true);
    // The low zone steps up with the slope, so it only stops heads that would hit it.
    const strips = lowHeadroom(planRoof(p));
    expect(new Set(strips.map((s) => s.low.toFixed(2))).size).toBe(3);
    expect(strips.every((s) => s.low >= KNEE - 1e-9 && s.low < HEADROOM)).toBe(true);
  });
  it('opens a nook where a dormer stands, with room to stand at its window', () => {
    const { p } = cape((p) => {
      const d = createItem('dormer', 1, 2, 0);
      Object.assign(d, { w: 1.5, d: 1.4 });
      p.items.push(d);
    });
    const plan = planRoof(p);
    expect(plan.dormers).toHaveLength(1);
    const d = plan.dormers[0];
    expect(d.side).toBe('lo');
    const nook = dormerRect(plan, d);
    const mid = (nook.x0 + nook.x1) / 2;
    expect(capeCeilingAt(plan, 1, mid, (nook.z0 + nook.z1) / 2)).toBe(CAPE_CEIL);
    const world = buildWalkWorld(p);
    // In front of the dormer window you can stand; beside it, under the slope, you can't.
    expect(world.free(mid, nook.z0 + 0.45, FLOOR_H)).toBe(true);
    expect(world.free(nook.x1 + 1, nook.z0 + 0.35, FLOOR_H)).toBe(false);
    // And you can't walk out through its face.
    expect(world.free(mid, nook.z0 - 0.05, FLOOR_H)).toBe(false);
  });
  it('ignores a dormer that is nowhere near an eave', () => {
    const { p } = cape((p) => {
      const d = createItem('dormer', 1, 4, 3);
      p.items.push(d);
    });
    expect(planRoof(p).dormers).toHaveLength(0);
  });
});
