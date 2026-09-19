import { describe, it, expect } from 'vitest';
import {
  blankProject,
  buildWalls,
  createItem,
  removeItem,
  sampleProject,
  readFeet,
  area,
  money,
  squareFeet,
  snap,
  validateProject,
} from '../src/model';
describe('project integrity', () => {
  it('round trips a furnished house and preserves every opening', () => {
    const p = sampleProject();
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('rejects malformed and nonfinite geometry before it reaches the renderer', () => {
    const p = sampleProject();
    p.items[0].w = Infinity;
    expect(() => validateProject(p)).toThrow('Invalid shape');
    p.items[0].w = -1;
    expect(() => validateProject(p)).toThrow();
  });
  it('rejects dangling openings and duplicate IDs', () => {
    const p = sampleProject();
    p.openings[0].roomId = 'missing';
    expect(() => validateProject(p)).toThrow('Invalid window');
    const q = sampleProject();
    q.items[1].id = q.items[0].id;
    expect(() => validateProject(q)).toThrow();
  });
  it('deletes dependent windows when removing a room', () => {
    const p = sampleProject(),
      id = p.items[0].id;
    const next = removeItem(p, id);
    expect(next.items.some((i) => i.id === id)).toBe(false);
    expect(next.openings.some((o) => o.roomId === id)).toBe(false);
    expect(() => validateProject(next)).not.toThrow();
  });
});
describe('shared walls', () => {
  it('emits one common wall and projects a doorway from either room', () => {
    const p = blankProject();
    const a = createItem('room', 0, 0, 0),
      b = createItem('room', 0, 4, 0);
    p.items = [a, b];
    p.openings = [{ id: 'door', roomId: b.id, side: 'west', offset: 0.5, width: 1, kind: 'door' }];
    const walls = buildWalls(p),
      common = walls.filter((w) => w.axis === 'z' && w.line === 4);
    expect(common).toHaveLength(1);
    expect(common[0].openings).toEqual([{ start: 1.5, end: 2.5, kind: 'door' }]);
    expect(walls).toHaveLength(7);
  });
  it('splits partially shared walls without duplicating them', () => {
    const p = blankProject();
    const a = createItem('room', 0, 0, 0),
      b = createItem('room', 0, 4, 2);
    p.items = [a, b];
    const common = buildWalls(p).filter((w) => w.axis === 'z' && w.line === 4);
    expect(common.map((w) => [w.start, w.end])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
  });
  it('keeps matching wall positions on different floors separate', () => {
    const p = blankProject();
    p.items = [createItem('room', 0, 0, 0), createItem('room', 1, 0, 0)];
    expect(buildWalls(p)).toHaveLength(8);
  });
  it('clamps an oversized window to fit the host wall', () => {
    const p = blankProject();
    const room = createItem('room', 0, 0, 0);
    p.items = [room];
    p.openings = [
      { id: 'window', roomId: room.id, side: 'north', offset: 0, width: 8, kind: 'window' },
    ];
    const o = buildWalls(p).find((w) => w.openings.length)!.openings[0];
    expect(o.start).toBeCloseTo(0.1);
    expect(o.end).toBeCloseTo(3.9);
  });
});
it('snaps consistently in every drawing direction', () => {
  expect(snap(1.13)).toBe(1.25);
  expect(snap(-1.13)).toBe(-1.25);
  expect(snap(1.134, false)).toBe(1.13);
});
it('reads lengths typed in feet and inches', () => {
  expect(readFeet('12')).toBe(12);
  expect(readFeet('12.5')).toBe(12.5);
  expect(readFeet(`12'6"`)).toBe(12.5);
  expect(readFeet('12′ 6″')).toBe(12.5);
  expect(readFeet('12 6')).toBe(12.5);
  expect(readFeet('12ft 3in')).toBe(12.25);
  expect(readFeet('twelve')).toBeNaN();
});
it('estimates cost from finished square footage', () => {
  const p = sampleProject();
  expect(Math.round(squareFeet(p))).toBe(Math.round(area({ ...p, units: 'ft' })));
  expect(money(581234)).toBe('$581k');
  expect(money(1250000)).toBe('$1.25M');
  expect(money(950)).toBe('$950');
  const withNotes = { ...p, notes: 'Bigger pantry', costPerSqFt: 300 };
  expect(validateProject(JSON.parse(JSON.stringify(withNotes))).notes).toBe('Bigger pantry');
  expect(() => validateProject({ ...p, costPerSqFt: -5 })).toThrow();
});
