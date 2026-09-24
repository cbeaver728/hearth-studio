import { attachCurve, attachOutside, moveFurniture, placeFurniture, roomAt } from './placement';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Compass,
  Copy,
  Crosshair,
  FlipHorizontal2,
  ImageDown,
  Minus,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  catalogEntry,
  openingKinds,
  openingName,
  type OpeningKind,
  contentsOf,
  createItem,
  formatLength,
  hasFloor,
  isOutside,
  isRoom,
  onLevel,
  snap,
  stairLevels,
  uid,
  type Item,
  type Opening,
  type Project,
  type Side,
  type WindowStyle,
  bayDepth,
} from './model';
import { layoutFor, localSize, toWorld } from './stairs';
import { absorbLandings } from './floors';
import { stairGuards } from './walk';
import { roomPath } from './corners';
import { dormerRect, lowHeadroom, planRoof, wingPoint } from './roof';
import { curvePieces, nearestOnCurve, type CurvePiece } from './curve';
/** 'select', 'pan', 'window', 'door', or a catalog id such as 'sofa' or 'stairs-spiral'. */
export type Tool = string;
interface Props {
  project: Project;
  floor: number;
  selected: string | null;
  tool: Tool;
  snapping: boolean;
  onSelect: (id: string | null) => void;
  onChange: (p: Project) => void;
  onTool: (t: Tool) => void;
  onNotice: (s: string) => void;
  onRotate: () => void;
  onFlip: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Which way newly laid stairs lead from this floor. */
  stairDir: 'up' | 'down';
  /** How newly placed windows are glazed. */
  windowStyle?: WindowStyle;
}
type Corner = 'nw' | 'ne' | 'sw' | 'se';
interface Gesture {
  kind: 'draw' | 'move' | 'resize' | 'pan' | 'opening' | 'measure';
  opening?: string;
  x: number;
  z: number;
  item?: Item;
  corner?: Corner;
  carried?: Item[];
  moved?: boolean;
}
/**
 * The tool for placing an opening. A garage door has its own name, so it isn't mistaken for
 * drawing a garage (the 'garage' tool).
 */
export const openingTool = (kind: OpeningKind) => (kind === 'garage' ? 'garage-door' : kind);
export const toolOpening = (tool: string) =>
  openingKinds.find((o) => openingTool(o.kind) === tool)?.kind;
const OPENING_TOOLS = openingKinds.map((o) => openingTool(o.kind)) as string[];
const placing = (tool: Tool) =>
  !['select', 'pan', 'measure', 'room', 'garage', ...OPENING_TOOLS].includes(tool);

export default function Plan({
  project: p,
  floor,
  selected,
  tool,
  snapping,
  onSelect,
  onChange,
  onTool,
  onNotice,
  onRotate,
  onFlip,
  onDuplicate,
  onDelete,
  stairDir,
  windowStyle,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: -14, z: -12, w: 29, h: 27 });
  // How wide the panel is on screen, so labels can stay a readable size at any zoom.
  const [pixels, setPixels] = useState(600);
  const lastWidth = useRef(0);
  const [draft, setDraft] = useState<Item[] | null>(null);
  const [slide, setSlide] = useState<{ id: string; offset: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // The measuring tape: stays on screen until the next measurement or tool change.
  const [tape, setTape] = useState<{
    a: { x: number; z: number };
    b: { x: number; z: number };
  } | null>(null);
  useEffect(() => {
    if (tool !== 'measure') setTape(null);
  }, [tool]);
  const gesture = useRef<Gesture | null>(null);
  const fitted = useRef(false);

  // Keep the drawing's aspect ratio matched to the panel so overlays line up exactly.
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Keep the zoom and the middle of the view where they were: a wider panel (switching from
      // split view to the full plan, say) shows more around the same spot, not a bigger drawing.
      const before = lastWidth.current;
      lastWidth.current = r.width;
      setPixels(r.width);
      setView((v) => {
        const w = before > 0 ? (v.w * r.width) / before : v.w;
        const h = (w * r.height) / r.width;
        return { x: v.x + (v.w - w) / 2, z: v.z + (v.h - h) / 2, w, h };
      });
      if (!fitted.current) {
        fitted.current = true;
        requestAnimationFrame(() => fit());
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Some pointers (and scripted clicks) can't be captured; dragging still works without it.
  const capture = (id: number) => {
    try {
      svg.current!.setPointerCapture(id);
    } catch {
      /* not capturable */
    }
  };
  const point = (e: { clientX: number; clientY: number }) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: r.x, z: r.y };
  };
  const roomsHere = p.items.filter((i) => isRoom(i) && i.floor === floor);

  // Room edges line up with neighboring rooms and with the floor below, so walls stack and meet.
  const edgeGuides = (except: string) => {
    const guide = floor > 0 ? floor - 1 : floor < 0 ? floor + 1 : null;
    const rooms = p.items.filter(
      (r) => isRoom(r) && r.id !== except && (r.floor === floor || r.floor === guide),
    );
    return {
      xs: rooms.flatMap((r) => [r.x, r.x + r.w]),
      zs: rooms.flatMap((r) => [r.z, r.z + r.d]),
    };
  };
  const nearest = (v: number, list: number[], reach = 0.3) => {
    let best: number | undefined;
    for (const c of list)
      if (Math.abs(v - c) < reach && (best === undefined || Math.abs(v - c) < Math.abs(v - best)))
        best = c;
    return best;
  };
  const roomSnap = (
    i: Item,
    edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean; move?: boolean },
  ) => {
    if (!snapping || !isRoom(i)) return i;
    const { xs, zs } = edgeGuides(i.id);
    const out = { ...i };
    if (edges.move) {
      const l = nearest(i.x, xs),
        r = nearest(i.x + i.w, xs),
        t = nearest(i.z, zs),
        b = nearest(i.z + i.d, zs);
      const dx = [
        l !== undefined ? l - i.x : undefined,
        r !== undefined ? r - i.x - i.w : undefined,
      ]
        .filter((v): v is number => v !== undefined)
        .sort((a, c) => Math.abs(a) - Math.abs(c))[0];
      const dz = [
        t !== undefined ? t - i.z : undefined,
        b !== undefined ? b - i.z - i.d : undefined,
      ]
        .filter((v): v is number => v !== undefined)
        .sort((a, c) => Math.abs(a) - Math.abs(c))[0];
      if (dx !== undefined) out.x += dx;
      if (dz !== undefined) out.z += dz;
      return out;
    }
    const right = i.x + i.w,
      bottom = i.z + i.d;
    const l = edges.l ? nearest(i.x, xs) : undefined,
      r = edges.r ? nearest(right, xs) : undefined,
      t = edges.t ? nearest(i.z, zs) : undefined,
      b = edges.b ? nearest(bottom, zs) : undefined;
    const x0 = l ?? i.x,
      x1 = r ?? right,
      z0 = t ?? i.z,
      z1 = b ?? bottom;
    if (x1 - x0 >= 0.5) Object.assign(out, { x: x0, w: x1 - x0 });
    if (z1 - z0 >= 0.5) Object.assign(out, { z: z0, d: z1 - z0 });
    return out;
  };

  // Pieces nudge flush against the inside face of nearby walls.
  const wallSnap = (i: Item) => {
    if (!snapping || isRoom(i) || isOutside(i)) return i;
    // Only the walls of the room it stands in: the far side of a wall belongs to the next room.
    const host = roomAt(roomsHere, i.x + i.w / 2, i.z + i.d / 2);
    if (!host) return i;
    const xs = [host.x + 0.08, host.x + host.w - 0.08],
      zs = [host.z + 0.08, host.z + host.d - 0.08];
    const near = (v: number, list: number[]) => list.find((c) => Math.abs(v - c) < 0.22);
    const out = { ...i };
    const l = near(i.x, xs),
      r = near(i.x + i.w, xs),
      t = near(i.z, zs),
      b = near(i.z + i.d, zs);
    if (l !== undefined) out.x = l;
    else if (r !== undefined) out.x = r - i.w;
    if (t !== undefined) out.z = t;
    else if (b !== undefined) out.z = b - i.d;
    return out;
  };

  const placeOpening = (a: { x: number; z: number }, kind: OpeningKind) => {
    let best: { r: Item; side: Side; dist: number; offset: number } | undefined;
    const all: { r: Item; side: Side; dist: number; offset: number }[] = [];
    // Curved walls take openings too, measured along the curve.
    let curved: { c: Item; dist: number; t: number } | undefined;
    for (const c of p.items.filter((i) => i.kind === 'curve' && i.floor === floor)) {
      const near = nearestOnCurve(c, a.x, a.z);
      if (!curved || near.distance < curved.dist) curved = { c, dist: near.distance, t: near.t };
    }
    for (const r of roomsHere) {
      const candidates: { side: Side; dist: number; offset: number }[] = [
        {
          side: 'north',
          dist: Math.hypot(Math.max(r.x - a.x, 0, a.x - r.x - r.w), a.z - r.z),
          offset: (a.x - r.x) / r.w,
        },
        {
          side: 'south',
          dist: Math.hypot(Math.max(r.x - a.x, 0, a.x - r.x - r.w), a.z - r.z - r.d),
          offset: (a.x - r.x) / r.w,
        },
        {
          side: 'west',
          dist: Math.hypot(a.x - r.x, Math.max(r.z - a.z, 0, a.z - r.z - r.d)),
          offset: (a.z - r.z) / r.d,
        },
        {
          side: 'east',
          dist: Math.hypot(a.x - r.x - r.w, Math.max(r.z - a.z, 0, a.z - r.z - r.d)),
          offset: (a.z - r.z) / r.d,
        },
      ];
      for (const c of candidates) {
        all.push({ r, ...c });
        if (!best || c.dist < best.dist) best = { r, ...c };
      }
    }
    // A door in a wall two rooms share opens into the more private one: into the bedroom from
    // the hall, not out into the hall.
    if (best && ['door', 'double', 'french'].includes(kind)) {
      const publicness = (r: Item) =>
        /hall|corridor|landing|foyer|entry|stair|mud/i.test(r.name)
          ? 3
          : /living|family|great|kitchen|dining/i.test(r.name)
            ? 2
            : 1;
      const tied = all.filter((c) => c.dist < best!.dist + 0.12);
      tied.sort((a, b) => publicness(a.r) - publicness(b.r) || a.r.w * a.r.d - b.r.w * b.r.d);
      if (tied.length > 1) best = tied[0];
    }
    if (curved && curved.dist < 0.8 && (!best || curved.dist < best.dist)) {
      if (kind === 'open') {
        onNotice('A curved wall is one piece — delete it instead of opening it up.');
        return;
      }
      onChange({
        ...p,
        openings: [
          ...p.openings,
          {
            id: uid(),
            roomId: curved.c.id,
            side: 'north',
            offset: Math.round(Math.max(0.08, Math.min(0.92, curved.t)) * 100) / 100,
            width:
              kind === 'window' && windowStyle === 'round'
                ? 1
                : openingKinds.find((o) => o.kind === kind)!.width,
            kind,
            ...(kind === 'window' && windowStyle && windowStyle !== 'classic'
              ? { style: windowStyle }
              : {}),
          },
        ],
      });
      onSelect(curved.c.id);
      onNotice(`${openingName(kind)} added to the curved wall. Drag it along on the right.`);
      return;
    }
    if (best && best.dist < 0.8) {
      const onThisWall = p.openings.filter((o) => o.roomId === best!.r.id && o.side === best!.side);
      if (kind === 'open' && onThisWall.some((o) => o.kind === 'open')) {
        // Clicking an opened-up wall again puts it back.
        onChange({ ...p, openings: p.openings.filter((o) => !onThisWall.includes(o)) });
        onSelect(best.r.id);
        onNotice('Wall put back. Click it again to open it up.');
        return;
      }
      onChange({
        ...p,
        // Taking a wall out replaces whatever was in it.
        openings: [
          ...(kind === 'open' ? p.openings.filter((o) => !onThisWall.includes(o)) : p.openings),
          {
            id: uid(),
            roomId: best.r.id,
            side: best.side,
            offset: Math.round(Math.max(0.1, Math.min(0.9, best.offset)) * 100) / 100,
            width:
              kind === 'window' && windowStyle === 'round'
                ? 1
                : openingKinds.find((o) => o.kind === kind)!.width,
            kind,
            ...(kind === 'window' && windowStyle && windowStyle !== 'classic'
              ? { style: windowStyle }
              : {}),
          },
        ],
      });
      onSelect(best.r.id);
      onNotice(
        kind === 'open'
          ? 'Wall removed. Click another wall to open it up, or press Esc.'
          : `${openingName(kind)} added. Click another wall for more, or press Esc.`,
      );
    } else onNotice('Click right on a room wall to place an opening.');
  };

  const begin = (e: React.PointerEvent, id?: string, corner?: Corner) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    const a = point(e);
    capture(e.pointerId);
    const item = p.items.find((i) => i.id === id);
    if (
      tool === 'pan' ||
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && e.shiftKey && !item)
    ) {
      gesture.current = { kind: 'pan', x: a.x, z: a.z };
      setPanning(true);
      return;
    }
    if (OPENING_TOOLS.includes(tool)) {
      placeOpening(a, toolOpening(tool)!);
      return;
    }
    if (tool === 'measure') {
      const start = { x: snap(a.x, snapping), z: snap(a.z, snapping) };
      setTape({ a: start, b: start });
      gesture.current = { kind: 'measure', x: start.x, z: start.z };
      return;
    }
    if (tool === 'select') {
      if (item) {
        onSelect(item.id);
        const carried = isRoom(item) && !corner && !e.altKey ? contentsOf(p, item) : [];
        gesture.current = {
          kind: corner ? 'resize' : 'move',
          x: a.x,
          z: a.z,
          item: { ...item },
          corner,
          carried,
        };
      } else {
        onSelect(null);
        gesture.current = { kind: 'pan', x: a.x, z: a.z };
      }
      return;
    }
    if (tool === 'room' || tool === 'garage') {
      const i = createItem(tool, floor, snap(a.x, snapping), snap(a.z, snapping));
      i.w = 0;
      i.d = 0;
      setDraft([i]);
      gesture.current = { kind: 'draw', x: i.x, z: i.z, item: i };
      return;
    }
    const entry = catalogEntry(tool);
    if (!entry) return;
    if (isOutside({ kind: entry.kind } as Item) && floor !== 0) {
      onNotice('Landscaping goes on the ground floor. Switch floors to add it.');
      return;
    }
    let i = createItem(tool, floor, 0, 0);
    // "Landing / balcony" is the catalog's name for the tool; the piece itself is a deck, a balcony or a
    // landing, depending on the floor.
    if (i.kind === 'landing') i.name = floor === 0 ? 'Deck' : floor > 0 ? 'Balcony' : 'Landing';
    // A curved wall by the outside of a room joins it: on the wall, bowing out, opening in.
    if (i.kind === 'curve') {
      const joined = attachCurve(roomsHere, i, a.x, a.z);
      if (joined) {
        onChange({
          ...p,
          items: [...p.items, joined.curve],
          openings: [
            ...p.openings,
            {
              id: uid(),
              roomId: joined.room.id,
              side: joined.side,
              offset: Math.round(joined.offset * 100) / 100,
              width: Math.round(joined.width * 100) / 100,
              kind: 'arch',
            },
          ],
        });
        onSelect(joined.curve.id);
        if (!e.shiftKey) onTool('select');
        onNotice(
          `Curved wall added to the ${joined.room.name.toLowerCase()}, opening into it. Drag its depth to bow it further.`,
        );
        return;
      }
    }
    if (snapping) i = placeFurniture(roomsHere, i, a.x, a.z, (v) => snap(v, true));
    else {
      i.x = snap(a.x - i.w / 2, snapping);
      i.z = snap(a.z - i.d / 2, snapping);
    }
    i = wallSnap(i);
    if (i.kind === 'landing' && snapping) i = attachOutside(roomsHere, i, a.x, a.z);
    if (i.kind === 'stairs') {
      i.dir = stairDir;
      const to = floor + (i.dir === 'up' ? 1 : -1);
      onNotice(
        hasFloor(p, to)
          ? `Stairs ${i.dir} to ${p.floors.find((f) => f.level === to)!.name}. Press E to turn them.`
          : `Stairs placed. There's no floor ${i.dir === 'up' ? 'above' : 'below'} yet — add one from the panel on the right.`,
      );
    }
    onChange({ ...p, items: [...p.items, i] });
    onSelect(i.id);
    if (!e.shiftKey) onTool('select');
  };

  const move = (e: React.PointerEvent) => {
    const a = point(e);
    if (placing(tool)) setHover(a);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      setView((v) => ({ ...v, x: v.x + g.x - a.x, z: v.z + g.z - a.z }));
      return;
    }
    if (g.kind === 'measure') {
      let b = { x: snap(a.x, snapping), z: snap(a.z, snapping) };
      // Shift keeps the tape straight across or up and down.
      if (e.shiftKey)
        b = Math.abs(b.x - g.x) > Math.abs(b.z - g.z) ? { x: b.x, z: g.z } : { x: g.x, z: b.z };
      setTape({ a: { x: g.x, z: g.z }, b });
      return;
    }
    if (g.kind === 'opening') {
      const o = p.openings.find((op) => op.id === g.opening)!;
      const r = g.item!;
      const h = o.side === 'north' || o.side === 'south';
      const along = h ? snap(a.x - r.x, snapping) : snap(a.z - r.z, snapping);
      const len = h ? r.w : r.d;
      setSlide({
        id: o.id,
        offset: Math.round(Math.max(0.1, Math.min(0.9, along / len)) * 1000) / 1000,
      });
      return;
    }
    const src = g.item!;
    let i = { ...src };
    if (g.kind === 'draw') {
      i.x = snap(Math.min(g.x, a.x), snapping);
      i.z = snap(Math.min(g.z, a.z), snapping);
      i.w = Math.abs(snap(a.x - g.x, snapping));
      i.d = Math.abs(snap(a.z - g.z, snapping));
      setDraft([roomSnap(i, { l: true, r: true, t: true, b: true })]);
      return;
    }
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(a.x - g.x, a.z - g.z) < 0.08) return;
      g.moved = true;
      i.x = snap(src.x + a.x - g.x, snapping);
      i.z = snap(src.z + a.z - g.z, snapping);
      i = isRoom(i)
        ? roomSnap(i, { move: true })
        : snapping
          ? wallSnap(moveFurniture(roomsHere, i))
          : i;
      const dx = i.x - src.x,
        dz = i.z - src.z;
      setDraft([i, ...(g.carried || []).map((c) => ({ ...c, x: c.x + dx, z: c.z + dz }))]);
      return;
    }
    const c = g.corner!;
    const min = 0.25;
    const right = src.x + src.w,
      bottom = src.z + src.d;
    if (c === 'ne' || c === 'se') i.w = Math.max(min, snap(right + a.x - g.x, snapping) - src.x);
    else {
      i.x = Math.min(right - min, snap(src.x + a.x - g.x, snapping));
      i.w = right - i.x;
    }
    if (c === 'sw' || c === 'se') i.d = Math.max(min, snap(bottom + a.z - g.z, snapping) - src.z);
    else {
      i.z = Math.min(bottom - min, snap(src.z + a.z - g.z, snapping));
      i.d = bottom - i.z;
    }
    setDraft([roomSnap(i, { l: c[1] === 'w', r: c[1] === 'e', t: c[0] === 'n', b: c[0] === 's' })]);
  };

  const finish = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setPanning(false);
    if (g.kind === 'opening') {
      if (slide)
        onChange({
          ...p,
          openings: p.openings.map((o) => (o.id === slide.id ? { ...o, offset: slide.offset } : o)),
        });
      setSlide(null);
      return;
    }
    if (draft && g.kind !== 'pan') {
      if (g.kind === 'draw') {
        const d = draft[0];
        if (d.w >= 0.75 && d.d >= 0.75) {
          const merged = absorbLandings({ ...p, items: [...p.items, d] }, d.id);
          onChange(merged.project);
          onSelect(d.id);
          onTool('select');
          // The full how-to the first couple of times; after that, just say what happened.
          const what = d.kind === 'garage' ? 'Garage' : 'Room';
          onNotice(
            merged.absorbed.length
              ? `${what} added, taking in the ${merged.absorbed[0].toLowerCase()} round the stairs.`
              : p.items.filter((i) => isRoom(i)).length < 2
                ? `${what} added. Name it on the right, then add doors and windows.`
                : `${what} added.`,
          );
        } else onNotice('Drag across the grid to draw a room.');
      } else {
        const byId = new Map(draft.map((d) => [d.id, d]));
        if (
          draft.some(
            (d) => JSON.stringify(d) !== JSON.stringify(p.items.find((i) => i.id === d.id)),
          )
        ) {
          const next = { ...p, items: p.items.map((i) => byId.get(i.id) || i) };
          // Stretching a room over the landing takes it in, just as drawing over it does.
          const merged =
            g.kind === 'resize' && g.item
              ? absorbLandings(next, g.item.id)
              : { project: next, absorbed: [] };
          onChange(merged.project);
          if (merged.absorbed.length)
            onNotice(`The ${merged.absorbed[0].toLowerCase()} is now part of this room.`);
        }
      }
    }
    setDraft(null);
  };

  const zoomAt = (factor: number, cx?: number, cz?: number) =>
    setView((v) => {
      const w = Math.max(6, Math.min(140, v.w * factor));
      const k = w / v.w;
      const ox = cx ?? v.x + v.w / 2,
        oz = cz ?? v.z + v.h / 2;
      return { x: ox - (ox - v.x) * k, z: oz - (oz - v.z) * k, w, h: v.h * k };
    });
  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = point(e);
      zoomAt(Math.exp(e.deltaY * 0.0012), a.x, a.z);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const fit = () => {
    // Frame the house on this floor; fall back to the yard or the whole project.
    // Frame the outline of the floor above or below too: on a new floor, that's what you draw
    // around.
    const guide = floor > 0 ? floor - 1 : floor < 0 ? floor + 1 : null;
    const indoor = p.items.filter(
      (i) => (onLevel(i, floor) || (isRoom(i) && i.floor === guide)) && !isOutside(i),
    );
    const items = indoor.length ? indoor : p.items.filter((i) => floor === 0 || !isOutside(i));
    const el = wrap.current?.getBoundingClientRect();
    const ratio = el && el.width ? el.height / el.width : 0.9;
    if (!items.length) {
      setView({ x: -12, z: -12 * ratio, w: 24, h: 24 * ratio });
      return;
    }
    // Room to spare all round, so there's space to draw the next room.
    const minX = Math.min(...items.map((i) => i.x)) - 3,
      minZ = Math.min(...items.map((i) => i.z)) - 3,
      maxX = Math.max(...items.map((i) => i.x + i.w)) + 3,
      maxZ = Math.max(...items.map((i) => i.z + i.d)) + 3.5;
    const w = Math.max(maxX - minX, (maxZ - minZ) / ratio, 16),
      h = w * ratio;
    setView({ x: (minX + maxX) / 2 - w / 2, z: (minZ + maxZ) / 2 - h / 2, w, h });
  };

  // Saves this floor's plan as a PNG, framed on the house, with the name and floor as a title.
  const exportPlan = async () => {
    const src = svg.current!;
    const clone = src.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.no-export').forEach((n) => n.remove());
    // Copy the stylesheet-driven text styles onto the clone, which leaves the page's CSS behind.
    const from = src.querySelectorAll('text'),
      to = clone.querySelectorAll('text');
    from.forEach((t, n) => {
      const cs = getComputedStyle(t);
      for (const prop of [
        'fill',
        'stroke',
        'stroke-width',
        'font-family',
        'font-weight',
        'paint-order',
      ])
        to[n]?.setAttribute(prop, cs.getPropertyValue(prop));
    });
    const indoor = p.items.filter((i) => onLevel(i, floor) && !isOutside(i));
    const box = indoor.length ? indoor : p.items;
    if (!box.length) return;
    const minX = Math.min(...box.map((i) => i.x)) - 1.2,
      minZ = Math.min(...box.map((i) => i.z)) - 2.2,
      maxX = Math.max(...box.map((i) => i.x + i.w)) + 1.2,
      maxZ = Math.max(...box.map((i) => i.z + i.d)) + 1.2;
    const w = maxX - minX,
      h = maxZ - minZ,
      px = 2400,
      py = Math.round((px * h) / w);
    clone.setAttribute('viewBox', `${minX} ${minZ} ${w} ${h}`);
    clone.setAttribute('width', String(px));
    clone.setAttribute('height', String(py));
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(minX + 0.4));
    title.setAttribute('y', String(minZ + 1.1));
    title.setAttribute('font-size', String(Math.max(0.5, w / 32)));
    title.setAttribute('font-family', 'Georgia, serif');
    title.setAttribute('fill', '#2e4539');
    title.textContent = `${p.name} · ${p.floors.find((f) => f.level === floor)?.name ?? ''}`;
    clone.appendChild(title);
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
    );
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = py;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#f7f8f2';
      g.fillRect(0, 0, px, py);
      g.drawImage(img, 0, 0, px, py);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${p.name.replace(/[^a-z0-9_-]/gi, '-')}-${(p.floors.find((f) => f.level === floor)?.name ?? 'plan').replace(/[^a-z0-9_-]/gi, '-')}.png`;
      a.click();
      onNotice('Floor plan picture saved.');
    } catch {
      onNotice('Could not save the plan picture.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const overrides = new Map((draft || []).map((d) => [d.id, d]));
  const layer = (i: Item) =>
    isOutside(i) ? 0 : isRoom(i) ? 1 : i.kind === 'rug' ? 2 : i.kind === 'stairs' ? 4 : 3;
  const items = p.items
    .filter((i) => onLevel(i, floor) || (floor === 0 && isOutside(i)))
    .map((i) => overrides.get(i.id) || i)
    .sort((a, b) => layer(a) - layer(b));
  if (draft && gesture.current?.kind === 'draw') items.push(draft[0]);
  // The yard, faintly, from upstairs (handy for balconies); not from down in the basement.
  const faded = floor > 0 ? p.items.filter((i) => isOutside(i)) : [];
  const ghostLevel = floor > 0 ? floor - 1 : floor < 0 ? floor + 1 : null;
  const ghosts =
    ghostLevel === null ? [] : p.items.filter((i) => isRoom(i) && i.floor === ghostLevel);
  const sel = items.find((i) => i.id === selected);
  const px = (x: number) => ((x - view.x) / view.w) * 100,
    pz = (z: number) => ((z - view.z) / view.h) * 100;
  const preview = (() => {
    if (!hover || !placing(tool)) return null;
    const e = catalogEntry(tool);
    if (!e) return null;
    let i = createItem(tool, floor, 0, 0);
    if (snapping) i = placeFurniture(roomsHere, i, hover.x, hover.z, (v) => snap(v, true));
    else {
      i.x = snap(hover.x - i.w / 2, snapping);
      i.z = snap(hover.z - i.d / 2, snapping);
    }
    i = wallSnap(i);
    if (i.kind === 'landing' && snapping) i = attachOutside(roomsHere, i, hover.x, hover.z);
    if (i.kind === 'curve') i = attachCurve(roomsHere, i, hover.x, hover.z)?.curve ?? i;
    return i;
  })();
  const u = p.units;

  return (
    <div
      ref={wrap}
      className={`plan-wrap tool-${tool.replace(/[^a-z]/g, '')} ${panning ? 'panning' : ''}`}
    >
      <svg
        ref={svg}
        data-testid="floor-plan"
        className="plan"
        aria-label="Interactive floor plan. Select Draw room, then drag to create a room."
        viewBox={`${view.x} ${view.z} ${view.w} ${view.h}`}
        onPointerDown={(e) => begin(e)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft(null);
          setPanning(false);
        }}
      >
        <defs>
          <pattern id="small-grid" width="0.25" height="0.25" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.017" fill="#bac5bb" />
          </pattern>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="url(#small-grid)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce3d8" strokeWidth="0.025" />
          </pattern>
          <pattern id="tile" width="0.4" height="0.4" patternUnits="userSpaceOnUse">
            <path
              d="M.4 0H0V.4"
              fill="none"
              stroke="#6f7a74"
              strokeOpacity=".22"
              strokeWidth=".015"
            />
          </pattern>
          <pattern id="stone" width="1.2" height="0.8" patternUnits="userSpaceOnUse">
            <path
              d="M0 0H1.2M0 .4H1.2M.6 0V.4M0 .4V.8M1.2 .4V.8"
              stroke="#6f6a60"
              strokeOpacity=".2"
              strokeWidth=".02"
            />
          </pattern>
          <pattern id="deck" width="0.3" height="0.3" patternUnits="userSpaceOnUse">
            <path d="M0 0H.3" stroke="#796448" strokeOpacity=".25" strokeWidth=".025" />
          </pattern>
          <pattern
            id="hatch"
            width="0.2"
            height="0.2"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path d="M0 0V.2" stroke="#9c653c" strokeOpacity=".35" strokeWidth=".03" />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill="#5a4d3c" />
          </marker>
        </defs>
        <pattern
          id="eaves"
          width="0.16"
          height="0.16"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <path d="M0 0V.16" stroke="#6f7d69" strokeOpacity=".28" strokeWidth=".025" />
        </pattern>
        <rect x="-250" y="-250" width="500" height="500" fill="url(#grid)" />
        {faded.map((i) => (
          <rect
            key={`fade-${i.id}`}
            x={i.x}
            y={i.z}
            width={i.w}
            height={i.d}
            fill={i.color}
            opacity=".18"
            pointerEvents="none"
          />
        ))}
        {ghosts.map((i) => (
          <rect
            key={`ghost-${i.id}`}
            x={i.x}
            y={i.z}
            width={i.w}
            height={i.d}
            fill="none"
            stroke="#9aa89b"
            strokeWidth=".06"
            strokeDasharray=".18 .14"
            pointerEvents="none"
          />
        ))}
        {items.map((i) => (
          <g
            key={i.id}
            role="button"
            tabIndex={0}
            aria-label={`Select ${i.name}`}
            data-testid={`shape-${i.kind}`}
            data-item-id={i.id}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(i.id);
              }
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.shiftKey ? 1 : 0.25;
                const dx = e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0,
                  dz = e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0;
                const moving = new Set([
                  i.id,
                  ...(isRoom(i) ? contentsOf(p, i).map((c) => c.id) : []),
                ]);
                onSelect(i.id);
                onChange({
                  ...p,
                  items: p.items.map((a) =>
                    moving.has(a.id) ? { ...a, x: a.x + dx, z: a.z + dz } : a,
                  ),
                });
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              begin(e, i.id);
            }}
            className={`plan-item ${i.id === selected ? 'is-selected' : ''}`}
          >
            <title>
              {i.name} · {formatLength(i.w, u)} × {formatLength(i.d, u)}
            </title>
            <Shape item={i} floor={floor} openings={p.openings} project={p} />
          </g>
        ))}
        {lowHeadroom(planRoof(p))
          .filter((h) => h.level === floor)
          .map(({ rect: r }, n) => (
            <rect
              key={`eaves-${n}`}
              x={r.x0}
              y={r.z0}
              width={r.x1 - r.x0}
              height={r.z1 - r.z0}
              fill="url(#eaves)"
              pointerEvents="none"
            >
              <title>Low ceiling under the eaves</title>
            </rect>
          ))}
        {preview && (
          <g opacity=".55" pointerEvents="none" className="no-export">
            <Shape item={preview} floor={floor} openings={p.openings} project={p} />
            <rect
              x={preview.x}
              y={preview.z}
              width={preview.w}
              height={preview.d}
              fill="none"
              stroke="#cf874e"
              strokeWidth=".05"
              strokeDasharray=".12 .08"
            />
          </g>
        )}
        {p.openings.map((op) => {
          const o = slide?.id === op.id ? { ...op, offset: slide.offset } : op;
          const r = items.find((i) => i.id === o.roomId);
          if (!r || !isRoom(r)) return null;
          const h = o.side === 'north' || o.side === 'south',
            len = h ? r.w : r.d,
            width = Math.min(o.width, len - 0.2),
            center = Math.max(width / 2 + 0.1, Math.min(len - width / 2 - 0.1, len * o.offset)),
            x = h ? r.x + center - width / 2 : o.side === 'west' ? r.x : r.x + r.w,
            z = h ? (o.side === 'north' ? r.z : r.z + r.d) : r.z + center - width / 2;
          // Doors swing into the room they belong to.
          const into = o.side === 'north' || o.side === 'west' ? 1 : -1;
          return (
            <g
              key={o.id}
              className="plan-opening"
              pointerEvents={tool === 'select' ? 'visibleStroke' : 'none'}
              style={{ cursor: h ? 'ew-resize' : 'ns-resize' }}
              transform={`translate(${x} ${z}) rotate(${h ? 0 : 90})`}
              onPointerDown={(e) => {
                if (tool !== 'select' || e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                capture(e.pointerId);
                onSelect(r.id);
                const a = point(e);
                gesture.current = { kind: 'opening', x: a.x, z: a.z, item: r, opening: o.id };
              }}
            >
              <title>{`${openingName(o.kind)} · drag along the wall to move it`}</title>
              <path d={`M0 0H${width}`} stroke="transparent" strokeWidth=".45" />
              <path
                d={`M0 0H${width}`}
                stroke={o.kind === 'window' || o.kind === 'bay' ? '#8ac0c2' : r.color}
                strokeWidth={o.kind === 'open' ? 0.24 : 0.2}
              />
              {o.kind === 'bay' &&
                (() => {
                  // The bay pushes out, away from its room.
                  const out = -into * (h ? 1 : -1);
                  const d = bayDepth(width);
                  return (
                    <path
                      d={`M0 0L${d} ${out * d}H${width - d}L${width} 0`}
                      fill="#e8f3f2"
                      stroke="#49868d"
                      strokeWidth=".05"
                    />
                  );
                })()}
              {o.kind === 'window' && (
                <path d={`M0 -.075H${width}M0 .075H${width}`} stroke="#49868d" strokeWidth=".025" />
              )}
              {(o.kind === 'arch' || o.kind === 'open') && (
                <path d={`M0 -.14V.14M${width} -.14V.14`} stroke="#9b8970" strokeWidth=".04" />
              )}
              {o.kind === 'garage' && (
                <path
                  d={`M0 ${into * (h ? 1 : -1) * 0.35}H${width}`}
                  stroke="#9b8970"
                  strokeWidth=".03"
                  strokeDasharray=".15 .1"
                />
              )}
              {o.kind === 'slider' && (
                <>
                  <path d={`M0 -.05H${width / 2 + 0.05}`} stroke="#49868d" strokeWidth=".05" />
                  <path
                    d={`M${width / 2 - 0.05} .05H${width}`}
                    stroke="#49868d"
                    strokeWidth=".05"
                  />
                </>
              )}
              {(o.kind === 'door' || o.kind === 'double' || o.kind === 'french') &&
                (o.kind === 'door' ? [0] : [0, 1]).map((n) => {
                  const leaf = o.kind === 'door' ? width : width / 2;
                  const from = n === 0 ? 0 : width;
                  const sweepIn = into > 0 === h ? 0 : 1;
                  const to = n === 0 ? leaf : width - leaf;
                  return (
                    <path
                      key={n}
                      d={`M${from} 0V${into * leaf * (h ? 1 : -1)}M${from} ${into * leaf * (h ? 1 : -1)}A${leaf} ${leaf} 0 0 ${n === 0 ? sweepIn : 1 - sweepIn} ${to} 0`}
                      fill="none"
                      stroke="#9b8970"
                      strokeWidth=".03"
                    />
                  );
                })}
            </g>
          );
        })}
        {items
          .filter((i) => isRoom(i) && i.w > 0.6 && i.d > 0.6)
          .map((i) => {
            // Names stay at least 11px on screen, but never wider than the room.
            const perMeter = pixels / view.w;
            const size = `${formatLength(i.w, u)} × ${formatLength(i.d, u)}`;
            const letters = Math.max(i.name.length, 1);
            // ...and no bigger than 20px however far you zoom in.
            const name = Math.min(
              Math.max(Math.min(0.5, (i.w / letters) * 1.5, 20 / perMeter), 11 / perMeter),
              (i.w * 0.9) / (letters * 0.56),
              i.d * 0.6,
            );
            const small = Math.min(Math.max(0.3, 9.5 / perMeter), 13 / perMeter);
            // The size line only shows when it fits and is big enough to read.
            const sized =
              small * size.length * 0.52 < i.w * 0.94 &&
              name + small * 1.4 < i.d * 0.8 &&
              small * perMeter >= 9;
            const cx = i.x + i.w / 2,
              cz = i.z + i.d / 2;
            return (
              <g key={`label-${i.id}`} pointerEvents="none">
                {/* The name picks the room itself, even when furniture covers its floor. */}
                <text
                  x={cx}
                  y={sized ? cz - small * 0.15 : cz + name * 0.35}
                  textAnchor="middle"
                  className="room-name"
                  fontSize={name}
                  pointerEvents={tool === 'select' ? 'auto' : 'none'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    begin(e, i.id);
                  }}
                >
                  {i.name}
                </text>
                {sized && (
                  <text
                    x={cx}
                    y={cz + small * 1.15}
                    textAnchor="middle"
                    className="room-area"
                    fontSize={small}
                  >
                    {size}
                  </text>
                )}
              </g>
            );
          })}
        {tape && (
          <g className="no-export" pointerEvents="none">
            <line
              x1={tape.a.x}
              y1={tape.a.z}
              x2={tape.b.x}
              y2={tape.b.z}
              stroke="#c7834c"
              strokeWidth=".05"
              strokeDasharray=".2 .08"
            />
            {[tape.a, tape.b].map((pt, n) => (
              <circle
                key={n}
                cx={pt.x}
                cy={pt.z}
                r=".1"
                fill="#c7834c"
                stroke="#fff"
                strokeWidth=".03"
              />
            ))}
            {Math.hypot(tape.b.x - tape.a.x, tape.b.z - tape.a.z) > 0.2 && (
              <g
                transform={`translate(${(tape.a.x + tape.b.x) / 2} ${(tape.a.z + tape.b.z) / 2}) scale(${Math.max(1, view.w / 22)}) translate(0 -.3)`}
              >
                <rect x="-1" y="-.28" width="2" height=".44" rx=".1" fill="#c7834c" />
                <text y=".05" textAnchor="middle" fontSize=".28" fontWeight="700" fill="#fff">
                  {formatLength(Math.hypot(tape.b.x - tape.a.x, tape.b.z - tape.a.z), u)}
                </text>
              </g>
            )}
          </g>
        )}
        {sel && (
          <g key={`selection-${sel.id}`} className="no-export">
            <rect
              x={sel.x - 0.1}
              y={sel.z - 0.1}
              width={sel.w + 0.2}
              height={sel.d + 0.2}
              fill="none"
              stroke="#cf874e"
              strokeWidth=".055"
              strokeDasharray=".12 .08"
              pointerEvents="none"
            />
            {(tool === 'select' ? (['nw', 'ne', 'sw', 'se'] as Corner[]) : []).map((c) => (
              <rect
                key={c}
                data-testid={c === 'se' ? 'resize-handle' : `resize-${c}`}
                x={(c[1] === 'e' ? sel.x + sel.w : sel.x) - 0.22}
                y={(c[0] === 's' ? sel.z + sel.d : sel.z) - 0.22}
                width=".44"
                height=".44"
                rx=".06"
                fill="#cf874e"
                stroke="white"
                strokeWidth=".06"
                style={{ cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (tool === 'select') begin(e, sel.id, c);
                }}
              />
            ))}
            {(() => {
              // Readable at any zoom. A room's sizes sit just inside its walls, clear of the
              // buttons above it and of the room next door; a piece's sit just outside it.
              const perMeter = pixels / view.w;
              const fs = Math.min(Math.max(0.3, 10.5 / perMeter), 13 / perMeter);
              const inside = isRoom(sel);
              const topY = inside ? sel.z + fs * 1.5 : sel.z - fs * 1.1;
              const sideX = inside ? sel.x + sel.w - fs * 1.2 : sel.x + sel.w + fs * 1.3;
              return (
                <>
                  <text
                    x={sel.x + sel.w / 2}
                    y={topY}
                    fontSize={fs}
                    textAnchor="middle"
                    className="dim-label"
                  >
                    {formatLength(sel.w, u)}
                  </text>
                  <text
                    x={sideX}
                    y={sel.z + sel.d / 2}
                    fontSize={fs}
                    className="dim-label"
                    transform={`rotate(90 ${sideX} ${sel.z + sel.d / 2})`}
                    textAnchor="middle"
                  >
                    {formatLength(sel.d, u)}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
      {sel && !gesture.current && tool === 'select' && (
        <div
          className="selection-bar"
          style={{
            left: `${Math.min(92, Math.max(8, px(sel.x + sel.w / 2)))}%`,
            top: `${Math.max(4, pz(sel.z) - 1)}%`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button aria-label="Rotate 90 degrees" title="Rotate 90° (E)" onClick={onRotate}>
            <RotateCw size={15} />
          </button>
          {sel.kind === 'stairs' && (sel.style || 'straight') !== 'straight' && (
            <button
              aria-label="Flip the stairs"
              title="Flip left for right (Shift+E)"
              onClick={onFlip}
            >
              <FlipHorizontal2 size={15} />
            </button>
          )}
          <button aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>
            <Copy size={15} />
          </button>
          <button aria-label="Delete" title="Delete (Del)" className="danger" onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
      {!roomsHere.length && tool === 'select' && (
        <div className="plan-empty">
          <strong>{floor === 0 ? 'Start with your first room' : 'This floor is empty'}</strong>
          <p>
            {floor === 0
              ? 'Drag out the heart of the home first — the kitchen or living room — then build around it.'
              : 'Draw rooms over the dashed outline of the floor below so the walls stack.'}
          </p>
          <button className="primary-button" onClick={() => onTool('room')}>
            Draw a room <kbd>R</kbd>
          </button>
        </div>
      )}
      <div className="panel-corner">
        <span className="live-dot" />
        2D FLOOR PLAN
        <span className="muted">/ {p.floors.find((f) => f.level === floor)?.name}</span>
      </div>
      <div className="plan-bottom">
        <div className="scale">
          <span /> 1 m grid <span className="key">{snapping ? '¼ m snap' : 'Free move'}</span>
        </div>
        <div className="canvas-buttons">
          <button aria-label="Zoom out" onClick={() => zoomAt(1.2)}>
            <Minus size={16} />
          </button>
          <button aria-label="Fit plan" title="Fit to view" onClick={fit}>
            <Crosshair size={17} />
          </button>
          <button aria-label="Zoom in" onClick={() => zoomAt(0.8)}>
            <Plus size={16} />
          </button>
        </div>
        <button
          className="plan-export"
          aria-label="Save plan picture"
          title="Save a picture of this floor plan"
          onClick={exportPlan}
        >
          <ImageDown size={16} />
        </button>
      </div>
      <div className="north">
        <Compass size={23} />
        <span>N</span>
      </div>
      <div className="canvas-hint">
        {tool === 'room' || tool === 'garage'
          ? 'Click and drag to draw. Release to build.'
          : OPENING_TOOLS.includes(tool)
            ? `Click a wall to add ${openingName(toolOpening(tool)!).toLowerCase()} · Esc when done`
            : tool === 'measure'
              ? 'Drag to measure any distance · Shift keeps it straight'
              : tool === 'pan'
                ? 'Drag the canvas to look around.'
                : tool === 'select'
                  ? "Drag to move · Corners resize · Click a room's name to pick the room itself"
                  : `Click to place ${catalogEntry(tool)?.name.toLowerCase()} · Shift-click to place several`}
      </div>
    </div>
  );
}

/** Draws one shape on the plan. */
/** A bowed wall, with its openings left as gaps or marked as glass. */
function CurveShape({ item: i, openings }: { item: Item; openings: Opening[] }) {
  const { LW: W, LD: D } = localSize(i);
  const pieces = curvePieces(i, openings, 48);
  const run = (want: CurvePiece['fill']) => {
    const runs: string[] = [];
    let open = false;
    for (const piece of pieces) {
      const half = piece.len / 2.24;
      const ax = Math.cos(piece.angle) * half,
        az = Math.sin(piece.angle) * half;
      const x0 = piece.u - ax - W / 2,
        z0 = piece.v - az - D / 2,
        x1 = piece.u + ax - W / 2,
        z1 = piece.v + az - D / 2;
      if (piece.fill !== want) {
        open = false;
        continue;
      }
      runs.push(`${open ? 'L' : 'M'}${x0} ${z0}L${x1} ${z1}`);
      open = true;
    }
    return runs.join('');
  };
  return (
    <g transform={`translate(${i.x + i.w / 2} ${i.z + i.d / 2}) rotate(${i.rotation})`}>
      <path
        d={run('solid') + run('window') + run('gap')}
        stroke="transparent"
        strokeWidth=".5"
        fill="none"
      />
      <path d={run('solid')} stroke="#56645d" strokeWidth=".16" fill="none" strokeLinecap="butt" />
      <path d={run('window')} stroke="#8ac0c2" strokeWidth=".16" fill="none" />
      <path d={run('window')} stroke="#49868d" strokeWidth=".03" fill="none" />
    </g>
  );
}
function Shape({
  item: i,
  floor,
  openings,
  project,
}: {
  item: Item;
  floor: number;
  openings: Opening[];
  project: Project;
}) {
  if (i.kind === 'tree')
    return (
      <>
        <circle
          cx={i.x + i.w / 2}
          cy={i.z + i.d / 2}
          r={i.w / 2}
          fill={i.color}
          fillOpacity=".4"
          stroke={i.color}
          strokeWidth=".05"
        />
        <circle
          cx={i.x + i.w / 2}
          cy={i.z + i.d / 2}
          r={i.w * 0.34}
          fill={i.color}
          fillOpacity=".6"
        />
      </>
    );
  if (isRoom(i) && i.radius)
    return (
      <>
        <path d={roomPath(i)} fill={i.color} stroke="#56645d" strokeWidth={0.16} />
        {(i.finish === 'tile' || i.finish === 'stone') && (
          <path d={roomPath(i)} fill={`url(#${i.finish})`} />
        )}
      </>
    );
  if (isRoom(i) || isOutside(i) || i.kind === 'landing')
    return (
      <>
        <rect
          x={i.x}
          y={i.z}
          width={i.w}
          height={i.d}
          rx={isRoom(i) ? 0 : i.kind === 'pool' ? 0.3 : 0.06}
          fill={i.color}
          stroke={isRoom(i) ? '#56645d' : i.kind === 'pool' ? '#ebede4' : '#8a7a62'}
          strokeWidth={
            isRoom(i) ? 0.16 : i.kind === 'landing' ? 0.07 : i.kind === 'pool' ? 0.16 : 0.035
          }
        />
        {(i.kind === 'deck' || i.kind === 'landing') && (
          <rect x={i.x} y={i.z} width={i.w} height={i.d} fill="url(#deck)" />
        )}
        {(i.finish === 'tile' || i.finish === 'stone') && (
          <rect x={i.x} y={i.z} width={i.w} height={i.d} fill={`url(#${i.finish})`} />
        )}
        {i.kind === 'pool' && (
          <rect
            x={i.x + 0.18}
            y={i.z + 0.18}
            width={Math.max(0.1, i.w - 0.36)}
            height={Math.max(0.1, i.d - 0.36)}
            rx=".2"
            fill="none"
            stroke="#bde9e8"
            strokeWidth=".04"
          />
        )}
      </>
    );
  if (i.kind === 'stairs') return <StairsShape item={i} floor={floor} project={project} />;
  if (i.kind === 'dormer') {
    const plan = planRoof(project);
    const d = plan.dormers.find((x) => x.item.id === i.id);
    if (!d)
      return (
        <rect
          x={i.x}
          y={i.z}
          width={i.w}
          height={i.d}
          fill="none"
          stroke="#c47a4a"
          strokeWidth=".05"
          strokeDasharray=".15 .1"
        >
          <title>
            Place a dormer against an outside wall of the top floor, under a pitched roof
          </title>
        </rect>
      );
    const r = dormerRect(plan, d);
    const w = plan.wings[d.wing];
    const eave = wingPoint(w, d.side, d.a0, d.setback)[w.axis === 'x' ? 1 : 0];
    const glass =
      w.axis === 'x'
        ? { x1: (d.a0 + d.a1) / 2 - 0.45, x2: (d.a0 + d.a1) / 2 + 0.45, y1: eave, y2: eave }
        : { x1: eave, x2: eave, y1: (d.a0 + d.a1) / 2 - 0.45, y2: (d.a0 + d.a1) / 2 + 0.45 };
    return (
      <>
        <rect
          x={r.x0}
          y={r.z0}
          width={r.x1 - r.x0}
          height={r.z1 - r.z0}
          fill="#fbf6e8"
          fillOpacity=".7"
          stroke="#8a7a62"
          strokeWidth=".04"
          strokeDasharray=".14 .08"
        />
        <line {...glass} stroke="#7fb4c2" strokeWidth=".12" />
      </>
    );
  }
  if (i.kind === 'chimney')
    return (
      <>
        <rect
          x={i.x}
          y={i.z}
          width={i.w}
          height={i.d}
          fill="#b56d55"
          stroke="#6f4a3a"
          strokeWidth=".04"
        />
        <rect x={i.x} y={i.z} width={i.w} height={i.d} fill="url(#stone)" />
      </>
    );
  if (i.kind === 'curve') return <CurveShape item={i} openings={openings} />;
  const { LW: W, LD: D } = localSize(i);
  const s = '#6f6656',
    sw = 0.03;
  const r = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    rx = 0.04,
    extra?: object,
  ) => (
    <rect
      x={x - W / 2}
      y={y - D / 2}
      width={Math.max(0.01, w)}
      height={Math.max(0.01, h)}
      rx={rx}
      fill={fill}
      stroke={s}
      strokeWidth={sw}
      {...extra}
    />
  );
  const circle = (x: number, y: number, rad: number, fill: string) => (
    <circle cx={x - W / 2} cy={y - D / 2} r={rad} fill={fill} stroke={s} strokeWidth={sw} />
  );
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => (
    <ellipse
      cx={x - W / 2}
      cy={y - D / 2}
      rx={rx}
      ry={ry}
      fill={fill}
      stroke={s}
      strokeWidth={sw}
    />
  );
  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <path
      d={`M${x1 - W / 2} ${y1 - D / 2}L${x2 - W / 2} ${y2 - D / 2}`}
      stroke={s}
      strokeWidth={sw}
    />
  );
  let body: ReactNode;
  const c = i.color;
  switch (i.kind) {
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(0.2, W * 0.15);
      const seats = i.kind === 'armchair' ? 1 : Math.max(2, Math.round((W - 2 * arm) / 0.9));
      body = (
        <>
          {r(0, 0, W, D, c, 0.1)}
          {r(0, 0, W, 0.22, c, 0.06)}
          {r(0, 0, arm, D, c, 0.06)}
          {r(W - arm, 0, arm, D, c, 0.06)}
          {Array.from({ length: seats }, (_, n) => (
            <g key={n}>
              {r(
                arm + ((W - 2 * arm) / seats) * n + 0.02,
                0.24,
                (W - 2 * arm) / seats - 0.04,
                D - 0.28,
                '#ffffff55',
                0.05,
              )}
            </g>
          ))}
        </>
      );
      break;
    }
    case 'platform':
      body = (
        <>
          {r(0, 0, W, D, c, 0.06)}
          {r(0.16, 0.16, W - 0.32, D - 0.42, '#ffffff66', 0.05)}
          {r(0, 0, W, 0.14, '#9b8b7c', 0.02)}
          {r(W * 0.2, 0.24, W * 0.26, 0.36, '#f5f2ed', 0.06)}
          {r(W * 0.52, 0.24, W * 0.26, 0.36, '#f5f2ed', 0.06)}
        </>
      );
      break;
    case 'canopy':
      body = (
        <>
          {r(0.08, 0.08, W - 0.16, D - 0.16, c, 0.06)}
          {r(W * 0.09, 0.2, W * 0.36, 0.38, '#f5f2ed', 0.06)}
          {r(W * 0.55, 0.2, W * 0.36, 0.38, '#f5f2ed', 0.06)}
          {r(0.04, D * 0.5, W - 0.08, D * 0.45, '#a8b9b4aa', 0.04)}
          {[
            [0.07, 0.07],
            [W - 0.07, 0.07],
            [0.07, D - 0.07],
            [W - 0.07, D - 0.07],
          ].map(([u, v], n) => (
            <g key={n}>{circle(u, v, 0.07, '#6b5a45')}</g>
          ))}
        </>
      );
      break;
    case 'daybed':
      body = (
        <>
          {r(0, 0, W, D, c, 0.06)}
          {r(0, 0, W, 0.12, '#9b8b7c', 0.02)}
          {r(0, 0, 0.1, D, '#9b8b7c', 0.02)}
          {r(W - 0.1, 0, 0.1, D, '#9b8b7c', 0.02)}
          {[0, 1, 2].map((n) => (
            <g key={n}>{r(W * (0.12 + n * 0.27), 0.14, W * 0.22, 0.2, '#f0e7d8', 0.04)}</g>
          ))}
        </>
      );
      break;
    case 'loft':
      body = (
        <>
          {r(0, 0, W, D, c, 0.05)}
          {r(0.06, 0.07, W - 0.12, D * 0.86, '#dfe3ea', 0.04)}
          {r(W * 0.14, 0.15, W * 0.72, 0.34, '#f5f2ed', 0.05)}
          {[0, 1, 2].map((n) => (
            <g key={n}>{line(W * 0.12, D - 0.06 - n * 0.09, W * 0.88, D - 0.06 - n * 0.09)}</g>
          ))}
        </>
      );
      break;
    case 'sectional': {
      const run = Math.min(0.95, D * 0.45);
      body = (
        <>
          {r(0, 0, W, run, c, 0.1)}
          {r(W - run, 0, run, D, c, 0.1)}
          {r(0, 0, W, 0.2, c, 0.06)}
          {r(W - 0.2, 0, 0.2, D, c, 0.06)}
          {r(0.22, 0.22, W - run - 0.24, run - 0.26, '#ffffff55', 0.05)}
          {r(W - run + 0.02, run + 0.02, run - 0.24, D - run - 0.24, '#ffffff55', 0.05)}
        </>
      );
      break;
    }
    case 'ottoman':
      body = <>{r(0, 0, W, D, c, 0.12)}</>;
      break;
    case 'pooltable':
      body = (
        <>
          {r(0, 0, W, D, '#6b4b2f', 0.06)}
          {r(0.11, 0.11, W - 0.22, D - 0.22, c, 0.04)}
          {[
            [0.17, 0.17],
            [W / 2, 0.17],
            [W - 0.17, 0.17],
            [0.17, D - 0.17],
            [W / 2, D - 0.17],
            [W - 0.17, D - 0.17],
          ].map(([u, v], n) => (
            <g key={n}>{circle(u, v, 0.06, '#2b2b2b')}</g>
          ))}
        </>
      );
      break;
    case 'wetbar':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {line(0.04, D * 0.78, W - 0.04, D * 0.78)}
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <g key={n}>{circle(0.16 + n * ((W - 0.32) / 5), D * 0.16, 0.035, '#5d3f2c')}</g>
          ))}
        </>
      );
      break;
    case 'stools': {
      const n = Math.max(1, Math.round(W / 0.55));
      body = (
        <>
          {Array.from({ length: n }, (_, k) => (
            <g key={k}>{circle((W / n) * (k + 0.5), D / 2, Math.min(0.2, D * 0.45), c)}</g>
          ))}
        </>
      );
      break;
    }
    case 'toybox':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {line(0.05, D / 2, W - 0.05, D / 2)}
        </>
      );
      break;
    case 'pergola':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04, { fillOpacity: 0.25 })}
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <g key={n}>{line(0.04, (D / 7) * n, W - 0.04, (D / 7) * n)}</g>
          ))}
          {[
            [0.11, 0.11],
            [W - 0.11, 0.11],
            [0.11, D - 0.11],
            [W - 0.11, D - 0.11],
          ].map(([u, v], n) => (
            <g key={n}>{r(u - 0.08, v - 0.08, 0.16, 0.16, c, 0.02)}</g>
          ))}
        </>
      );
      break;
    case 'grill':
      body = (
        <>
          {r(0, 0.08, W * 0.74, D - 0.16, c, 0.06)}
          {r(W * 0.74, D * 0.2, W * 0.24, D * 0.6, '#9aa3a6', 0.04)}
          {circle(W * 0.36, D / 2, Math.min(W * 0.22, D * 0.3), '#3d4143')}
        </>
      );
      break;
    case 'swing':
      body = (
        <>
          {r(0, D / 2 - 0.06, W, 0.12, c, 0.04)}
          {[0.3, 0.7].map((f, n) => (
            <g key={n}>{r(W * f - 0.25, D / 2 - 0.12, 0.5, 0.24, '#c0563a', 0.05)}</g>
          ))}
          {[
            [0.12, 0.14],
            [W - 0.12, 0.14],
            [0.12, D - 0.14],
            [W - 0.12, D - 0.14],
          ].map(([u, v], n) => (
            <g key={n}>{circle(u, v, 0.07, c)}</g>
          ))}
        </>
      );
      break;
    case 'trampoline':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, '#2f3a40')}
          {circle(W / 2, D / 2, Math.min(W, D) / 2 - 0.12, c)}
        </>
      );
      break;
    case 'hoop':
      body = (
        <>
          {r(W * 0.18, D * 0.24, W * 0.64, 0.08, '#d9d2c6', 0.02)}
          {circle(W / 2, D * 0.1, 0.23, '#d4522e')}
          {circle(W / 2, D - 0.16, 0.08, c)}
        </>
      );
      break;
    case 'mailbox':
      body = (
        <>
          {r(W * 0.16, D * 0.1, W * 0.68, D * 0.8, c, 0.05)}
          {circle(W / 2, D / 2, 0.05, '#5a4a3a')}
        </>
      );
      break;
    case 'bed':
      body = (
        <>
          {r(0, 0, W, D, c, 0.06)}
          {r(0, 0, W, 0.1, '#9b8b7c', 0.02)}
          {r(W * 0.06, 0.16, W * 0.4, 0.38, '#f5f2ed', 0.06)}
          {r(W * 0.54, 0.16, W * 0.4, 0.38, '#f5f2ed', 0.06)}
          {r(0.02, D * 0.5, W - 0.04, D * 0.48, '#a8b9b4aa', 0.04)}
        </>
      );
      break;
    case 'table': {
      const n = Math.max(1, Math.floor(W / 0.75));
      body = (
        <>
          {D > 0.7 &&
            W > 1 &&
            Array.from({ length: n }, (_, k) => {
              const x = (W / n) * (k + 0.5);
              return (
                <g key={k}>
                  {r(x - 0.22, -0.48, 0.44, 0.42, '#d8cfbd', 0.06)}
                  {r(x - 0.22, D + 0.06, 0.44, 0.42, '#d8cfbd', 0.06)}
                </g>
              );
            })}
          {r(0, 0, W, D, c, 0.08)}
        </>
      );
      break;
    }
    case 'coffee':
      body = (
        <>
          {r(0, 0, W, D, c, 0.12)}
          {r(0.08, 0.08, W - 0.16, D - 0.16, '#ffffff22', 0.08)}
        </>
      );
      break;
    case 'laundry': {
      const stacked = W < 1.05;
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {stacked
            ? circle(W / 2, D / 2, Math.min(W, D) * 0.28, '#c9d2d2')
            : [0, 1].map((n) => (
                <g key={n}>
                  {circle(W * (0.25 + n * 0.5), D / 2, Math.min(W / 2, D) * 0.3, '#c9d2d2')}
                </g>
              ))}
        </>
      );
      break;
    }
    case 'utility':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {r(W * 0.12, D * 0.12, W * 0.76, D * 0.76, '#c9d2d2', 0.04)}
        </>
      );
      break;
    case 'bunk':
      body = (
        <>
          {r(0, 0, W, D, c, 0.05)}
          {r(0.05, 0.05, W - 0.1, D - 0.1, '#ffffff55', 0.04)}
          {r(W * 0.12, 0.14, W * 0.76, 0.36, '#f5f2ed', 0.05)}
          {/* The ladder at the foot of the bed. */}
          {[0, 1, 2].map((n) => (
            <g key={n}>{line(W * 0.25, D - 0.07 - n * 0.09, W * 0.75, D - 0.07 - n * 0.09)}</g>
          ))}
          {line(W * 0.25, D - 0.25, W * 0.25, D - 0.04)}
          {line(W * 0.75, D - 0.25, W * 0.75, D - 0.04)}
        </>
      );
      break;
    case 'shelf':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0.04, D * 0.55, W - 0.04, D * 0.55)}
        </>
      );
      break;
    case 'counterPlain':
    case 'counterSink':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0, D - 0.04, W, D - 0.04)}
          {i.kind === 'counterSink' &&
            ellipse(W / 2, D / 2, Math.min(0.3, W * 0.22), D * 0.3, '#c9d2d2')}
        </>
      );
      break;
    case 'counterL': {
      const arm = Math.min(0.7, Math.min(W, D) * 0.4);
      body = (
        <>
          {r(0, 0, W, arm, c, 0.02)}
          {r(0, arm, arm, D - arm, c, 0.02)}
        </>
      );
      break;
    }
    case 'islandSink':
    case 'islandStove':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {r(0.06, 0.06, W - 0.12, D - 0.12, '#f1ede0', 0.03)}
          {i.kind === 'islandSink'
            ? ellipse(W / 2, D / 2, Math.min(0.3, W * 0.2), D * 0.2, '#c9d2d2')
            : [0, 1, 2, 3].map((n) => (
                <g key={n}>
                  {circle(
                    W / 2 + (n % 2 ? 0.16 : -0.16),
                    D / 2 + (n > 1 ? 0.13 : -0.13),
                    0.09,
                    '#3a3e3c',
                  )}
                </g>
              ))}
        </>
      );
      break;
    case 'islandL': {
      const arm = Math.min(0.95, Math.min(W, D) * 0.45);
      body = (
        <>
          {r(0, 0, W, arm, c, 0.04)}
          {r(0, arm, arm, D - arm, c, 0.04)}
          {ellipse(W - arm / 2 - 0.35, arm / 2, 0.26, Math.min(0.2, arm / 2 - 0.1), '#c9d2d2')}
        </>
      );
      break;
    }
    case 'islandRound':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
          {circle(W / 2, D / 2, Math.min(W, D) / 2 - 0.1, '#f1ede0')}
        </>
      );
      break;
    case 'range':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <g key={n}>
              {circle(W * (0.26 + (n % 3) * 0.24), D * (n > 2 ? 0.68 : 0.32), 0.07, '#3a3e3c')}
            </g>
          ))}
        </>
      );
      break;
    case 'dishwasher':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {line(0.06, D - 0.07, W - 0.06, D - 0.07)}
        </>
      );
      break;
    case 'cabinet':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0, 0, W, D)}
          {line(W, 0, 0, D)}
        </>
      );
      break;
    case 'uppers':
      body = (
        <>
          <rect
            x={-W / 2}
            y={-D / 2}
            width={W}
            height={D}
            rx=".02"
            fill={c}
            fillOpacity=".5"
            stroke={s}
            strokeWidth={sw}
            strokeDasharray=".12 .08"
          />
          {line(0, D, W, D)}
        </>
      );
      break;
    case 'mirror':
    case 'tvwall':
    case 'picture':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0.05, D * 0.5, W - 0.05, D * 0.5)}
        </>
      );
      break;
    case 'roundTable':
      body = (
        <>
          {[0, 1, 2, 3].map((n) => {
            const a = (n * Math.PI) / 2 + Math.PI / 4;
            return (
              <g key={n}>
                {r(
                  W / 2 + Math.sin(a) * (Math.min(W, D) / 2 + 0.32) - 0.22,
                  D / 2 + Math.cos(a) * (Math.min(W, D) / 2 + 0.32) - 0.22,
                  0.44,
                  0.44,
                  '#d8cfbd',
                  0.06,
                )}
              </g>
            );
          })}
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
        </>
      );
      break;
    case 'chandelier':
    case 'fan':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, '#ffffff00')}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.16, c)}
          {[0, 1, 2, 3].map((n) => {
            const a = (n * Math.PI) / 2 + (i.kind === 'fan' ? 0 : Math.PI / 4);
            return (
              <g key={n}>
                {line(
                  W / 2,
                  D / 2,
                  W / 2 + Math.sin(a) * Math.min(W, D) * 0.48,
                  D / 2 + Math.cos(a) * Math.min(W, D) * 0.48,
                )}
              </g>
            );
          })}
        </>
      );
      break;
    case 'pendant':
      body = (
        <>
          {Array.from({ length: Math.max(1, Math.round(W / 0.55)) }, (_, n) => {
            const lamps = Math.max(1, Math.round(W / 0.55));
            return <g key={n}>{circle((W / lamps) * (n + 0.5), D / 2, 0.11, c)}</g>;
          })}
        </>
      );
      break;
    case 'floorlamp':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.16, '#fff3d0')}
        </>
      );
      break;
    case 'sconce':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {circle(W / 2, D * 0.7, Math.min(W, D) * 0.28, '#fff3d0')}
        </>
      );
      break;
    case 'dresser':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {line(0.05, D - 0.06, W - 0.05, D - 0.06)}
        </>
      );
      break;
    case 'crib':
      body = (
        <>
          {r(0, 0, W, D, c, 0.05)}
          {r(0.08, 0.08, W - 0.16, D - 0.16, '#f8f4e8', 0.04)}
        </>
      );
      break;
    case 'deskL': {
      const arm = Math.min(0.75, Math.min(W, D) * 0.5);
      body = (
        <>
          {r(0, 0, W, arm, c, 0.03)}
          {r(0, arm, arm, D - arm, c, 0.03)}
          {circle(W * 0.6, arm + 0.3, 0.22, '#bdb8b1')}
        </>
      );
      break;
    }
    case 'shed':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {line(0, D * 0.5, W, D * 0.5)}
          {line(W * 0.22, D, W * 0.22, D - 0.12)}
          {line(W * 0.78, D, W * 0.78, D - 0.12)}
        </>
      );
      break;
    case 'firepit':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.28, '#c26a2c')}
        </>
      );
      break;
    case 'hottub':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
          {circle(W / 2, D / 2, Math.min(W, D) / 2 - 0.16, '#9fd8dd')}
        </>
      );
      break;
    case 'planter':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {Array.from({ length: Math.max(1, Math.round(W / 0.4)) }, (_, n) => (
            <g key={n}>
              {circle((W / Math.max(1, Math.round(W / 0.4))) * (n + 0.5), D / 2, 0.14, '#6f9569')}
            </g>
          ))}
        </>
      );
      break;
    case 'bench':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {line(0.05, D - 0.1, W - 0.05, D - 0.1)}
        </>
      );
      break;
    case 'xmas':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) / 2, c)}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.3, '#2f5236')}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.1, '#ffe9a8')}
        </>
      );
      break;
    case 'grand':
      body = (
        <>
          {/* The classic grand outline: straight side, curved bent side, keys at the front. */}
          <path
            d={`M${-W / 2} ${D / 2}L${-W / 2} ${-D / 2 + D * 0.3}Q${-W / 2} ${-D / 2} ${-W / 2 + W * 0.35} ${-D / 2}Q${W / 2} ${-D / 2 + D * 0.08} ${W / 2} ${-D / 2 + D * 0.55}L${W / 2} ${D / 2}Z`}
            fill={c}
            stroke={s}
            strokeWidth={sw}
          />
          {r(0.02, D - 0.2, W - 0.04, 0.16, '#f4f1e8', 0.02)}
          {line(0.02, D - 0.12, W - 0.02, D - 0.12)}
          {r(W * 0.2, D + 0.28, W * 0.6, 0.34, '#d8cfbd', 0.05)}
        </>
      );
      break;
    case 'upright':
      body = (
        <>
          {r(0, 0, W, D * 0.78, c, 0.03)}
          {r(0.04, D * 0.72, W - 0.08, D * 0.26, '#f4f1e8', 0.02)}
          {r(W * 0.2, D + 0.3, W * 0.6, 0.34, '#d8cfbd', 0.05)}
        </>
      );
      break;
    case 'clock':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {circle(W / 2, D * 0.55, Math.min(W, D) * 0.3, '#f4efe0')}
        </>
      );
      break;
    case 'desk':
      body = (
        <>
          {circle(W * 0.3 + 0.22, D + 0.3, 0.24, '#bdb8b1')}
          {r(0, 0, W, D, c, 0.04)}
        </>
      );
      break;
    case 'counter':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {r(0.06, 0.06, W - 0.12, D - 0.12, '#f1ede0', 0.03)}
        </>
      );
      break;
    case 'kitchen':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {r(W * 0.3 - 0.3, 0.1, 0.6, D - 0.2, '#c9d2d2', 0.06)}
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              {circle(
                W * 0.72 + (k % 2 ? 0.14 : -0.14),
                D / 2 + (k > 1 ? 0.14 : -0.14),
                0.09,
                '#3a3e3c',
              )}
            </g>
          ))}
        </>
      );
      break;
    case 'fridge':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {line(0.05, D - 0.08, W - 0.05, D - 0.08)}
        </>
      );
      break;
    case 'wardrobe':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0, 0, W / 2, D)}
          {line(W, 0, W / 2, D)}
        </>
      );
      break;
    case 'media':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {r(W * 0.08, 0.02, W * 0.84, 0.06, '#222', 0.01)}
        </>
      );
      break;
    case 'fireplace':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {r(W * 0.25, D * 0.35, W * 0.5, D * 0.65, '#c26a2c', 0.02)}
        </>
      );
      break;
    case 'plant':
      body = (
        <>
          {circle(W / 2, D / 2, Math.min(W, D) * 0.48, c)}
          {circle(W / 2, D / 2, Math.min(W, D) * 0.2, '#c9b49a')}
        </>
      );
      break;
    case 'crt':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {r(W * 0.1, 0.05, W * 0.8, D - 0.08, '#45484b', 0.03)}
          {line(W * 0.14, D - 0.04, W * 0.7, D - 0.04)}
        </>
      );
      break;
    case 'computer':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {r(W * 0.42, 0.08, W * 0.4, 0.38, '#3aaeb0', 0.08)}
          {r(W * 0.38, 0.52, W * 0.46, 0.12, '#ece8de', 0.02)}
        </>
      );
      break;
    case 'highchair':
    case 'changing':
    case 'hutch':
    case 'dollhouse':
      body = (
        <>
          {r(0, 0, W, D, c, 0.04)}
          {r(0.06, 0.06, W - 0.12, D - 0.12, '#ffffff44', 0.03)}
        </>
      );
      break;
    case 'radiator':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {Array.from({ length: Math.max(3, Math.round(W / 0.12)) }, (_, n) => (
            <g key={n}>
              {line(
                (W / Math.max(3, Math.round(W / 0.12))) * (n + 0.5),
                0.03,
                (W / Math.max(3, Math.round(W / 0.12))) * (n + 0.5),
                D - 0.03,
              )}
            </g>
          ))}
        </>
      );
      break;
    case 'rugRound':
      body = (
        <>
          {[1, 0.8, 0.6, 0.4, 0.2].map((f, n) => (
            <g key={n}>{circle(W / 2, D / 2, (Math.min(W, D) / 2) * f, n % 2 ? c : `${c}bb`)}</g>
          ))}
        </>
      );
      break;
    case 'phonetable':
      body = (
        <>
          {r(0, 0, Math.min(W * 0.62, 0.6), D, c, 0.03)}
          {r(
            Math.min(W * 0.62, 0.6) * 0.25,
            D * 0.3,
            Math.min(W * 0.62, 0.6) * 0.5,
            D * 0.45,
            '#26282b',
            0.04,
          )}
          {circle(Math.min(W * 0.62, 0.6) + (W - Math.min(W * 0.62, 0.6)) / 2, D / 2, 0.15, c)}
        </>
      );
      break;
    case 'curtains':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {r(0, 0, W * 0.2, D, c, 0.02)}
          {r(W * 0.8, 0, W * 0.2, D, c, 0.02)}
        </>
      );
      break;
    case 'rug':
      body = (
        <>
          <rect x={-W / 2} y={-D / 2} width={W} height={D} rx=".06" fill={c} opacity=".7" />
          <rect
            x={-W / 2 + 0.12}
            y={-D / 2 + 0.12}
            width={W - 0.24}
            height={D - 0.24}
            fill="none"
            stroke="#fff"
            strokeOpacity=".6"
            strokeWidth=".04"
          />
        </>
      );
      break;
    case 'bathtub':
      body = (
        <>
          {r(0, 0, W, D, c, 0.12)}
          {ellipse(W / 2, D / 2, W / 2 - 0.12, D / 2 - 0.1, '#d3e7e9')}
        </>
      );
      break;
    case 'shower':
      body = (
        <>
          {r(0, 0, W, D, c, 0.02)}
          {line(0, 0, W, D)}
          {line(W, 0, 0, D)}
          {circle(W / 2, D / 2, 0.06, '#fff')}
        </>
      );
      break;
    case 'toilet':
      body = (
        <>
          {r(W * 0.08, 0, W * 0.84, D * 0.28, c, 0.04)}
          {ellipse(W / 2, D * 0.62, W * 0.36, D * 0.34, c)}
        </>
      );
      break;
    case 'vanity':
      body = (
        <>
          {r(0, 0, W, D, c, 0.03)}
          {ellipse(W / 2, D / 2, Math.min(0.24, W * 0.3), D * 0.3, '#fff')}
        </>
      );
      break;
    default:
      body = r(0, 0, W, D, c);
  }
  return (
    <g transform={`translate(${i.x + i.w / 2} ${i.z + i.d / 2}) rotate(${i.rotation})`}>{body}</g>
  );
}

function StairsShape({ item: i, floor, project }: { item: Item; floor: number; project: Project }) {
  const layout = layoutFor(i);
  const guards = stairGuards(project, i);
  const { lower } = stairLevels(i);
  const upperView = floor !== lower;
  const W = layout.LW,
    D = layout.LD;
  const path = layout.path.map(([u, v]) => `${u - W / 2} ${v - D / 2}`).join('L');
  const label = upperView ? 'DN' : 'UP';
  // Labels stay upright: place them at the bottom (UP) or top (DN) of the run, in plan space.
  const [lu, lv] = upperView ? layout.path[layout.path.length - 1] : layout.path[0];
  const [lx, lz] = toWorld(i, lu, lv);
  return (
    <>
      <g
        transform={`translate(${i.x + i.w / 2} ${i.z + i.d / 2}) rotate(${i.rotation})`}
        opacity={upperView ? 0.6 : 1}
      >
        {upperView && <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="#f7f4ec" />}
        {layout.treads.map((t) => {
          if (t.rect) {
            const r = t.rect;
            return (
              <rect
                key={t.k}
                x={r.x0 - W / 2}
                y={r.z0 - D / 2}
                width={r.x1 - r.x0}
                height={r.z1 - r.z0}
                fill={i.color}
                stroke="#857a67"
                strokeWidth=".025"
              />
            );
          }
          if (t.poly)
            return (
              <path
                key={t.k}
                d={'M' + t.poly.map(([pu, pv]) => `${pu - W / 2} ${pv - D / 2}`).join('L') + 'Z'}
                fill={i.color}
                stroke="#857a67"
                strokeWidth=".025"
              />
            );
          const w = t.wedge!;
          const pt = (a: number, rad: number) =>
            `${w.cu - W / 2 + rad * Math.sin(a)} ${w.cv - D / 2 + rad * Math.cos(a)}`;
          return (
            <path
              key={t.k}
              d={`M${pt(w.a0, w.r0)}L${pt(w.a0, w.r1)}A${w.r1} ${w.r1} 0 0 0 ${pt(w.a1, w.r1)}L${pt(w.a1, w.r0)}Z`}
              fill={i.color}
              stroke="#857a67"
              strokeWidth=".025"
            />
          );
        })}
        {layout.pole && (
          <circle
            cx={layout.pole.u - W / 2}
            cy={layout.pole.v - D / 2}
            r={layout.pole.r + 0.03}
            fill="#6b5a45"
          />
        )}
        {!upperView &&
          guards.banisters.map((r, n) => (
            <path
              key={'b' + n}
              d={`M${r.a[0] - W / 2} ${r.a[1] - D / 2}L${r.b[0] - W / 2} ${r.b[1] - D / 2}`}
              stroke="#8a7a62"
              strokeWidth=".05"
              strokeLinecap="round"
            />
          ))}
        {layout.dividers.map((d, n) => (
          <path
            key={n}
            d={`M${d.a[0] - W / 2} ${d.a[1] - D / 2}L${d.b[0] - W / 2} ${d.b[1] - D / 2}`}
            stroke="#6f6656"
            strokeWidth=".08"
          />
        ))}
        {upperView &&
          guards.rails.map((r, n) => (
            <path
              key={n}
              d={`M${r.a[0] - W / 2} ${r.a[1] - D / 2}L${r.b[0] - W / 2} ${r.b[1] - D / 2}`}
              stroke="#6b5a45"
              strokeWidth=".06"
            />
          ))}
        {upperView && <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="url(#hatch)" />}
        <path
          d={`M${path}`}
          fill="none"
          stroke="#5a4d3c"
          strokeWidth=".045"
          markerEnd="url(#arrow)"
          strokeDasharray={upperView ? '.12 .08' : undefined}
        />
        {!upperView && (
          <circle
            cx={layout.path[0][0] - W / 2}
            cy={layout.path[0][1] - D / 2}
            r=".07"
            fill="#5a4d3c"
          />
        )}
      </g>
      <g pointerEvents="none">
        <rect
          x={lx - 0.28}
          y={lz - 0.17}
          width=".56"
          height=".34"
          rx=".08"
          fill={upperView ? '#6f7d75' : '#cf874e'}
        />
        <text x={lx} y={lz + 0.09} textAnchor="middle" fontSize=".24" fontWeight="700" fill="#fff">
          {label}
        </text>
      </g>
    </>
  );
}
