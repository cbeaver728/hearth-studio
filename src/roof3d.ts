// Roof meshes: slopes with their valleys and dormer openings, the sloping ceilings of a half
// storey, gable ends, dormers and chimneys. The shapes come from roof.ts.
import * as T from 'three';
import { CAPE_CEIL, FLOOR_H, type Item, type Project } from './model';
import {
  OVERHANG,
  ROOF_T,
  alongRange,
  collarRun,
  crossRange,
  dormerRect,
  GAMBREL_BREAK,
  GAMBREL_STEEP,
  halfSpan,
  hippedEnds,
  ridgeOf,
  rise,
  roofTopAt,
  wingPoint,
  wingCorner,
  type RoofPlan,
  type Wing,
} from './roof';

/** Points round a quarter circle, from angle t0 to t1 (radians), in a 2D frame. */
function quarter(cx: number, cy: number, r: number, t0: number, t1: number, n = 10): V2[] {
  const out: V2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}
/** A rectangle with some corners rounded, as an outline in plan (x, z). */
function roundedRect(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: Partial<Record<'nw' | 'ne' | 'sw' | 'se', number>>,
): V2[] {
  const nw = r.nw || 0,
    ne = r.ne || 0,
    se = r.se || 0,
    sw = r.sw || 0;
  return [
    ...(nw ? quarter(x0 + nw, z0 + nw, nw, Math.PI, Math.PI * 1.5) : [[x0, z0] as V2]),
    ...(ne ? quarter(x1 - ne, z0 + ne, ne, Math.PI * 1.5, Math.PI * 2) : [[x1, z0] as V2]),
    ...(se ? quarter(x1 - se, z1 - se, se, 0, Math.PI / 2) : [[x1, z1] as V2]),
    ...(sw ? quarter(x0 + sw, z1 - sw, sw, Math.PI / 2, Math.PI) : [[x0, z1] as V2]),
  ];
}

type V2 = [number, number];
type V3 = [number, number, number];

/** Keeps the part of a polygon where side(u, v) <= 0, cutting straight across the rest. */
export function clipPoly(poly: V2[], side: (u: number, v: number) => number): V2[] {
  const out: V2[] = [];
  for (let n = 0; n < poly.length; n++) {
    const p = poly[n],
      q = poly[(n + 1) % poly.length];
    const fp = side(...p),
      fq = side(...q);
    if (fp <= 1e-9) out.push(p);
    if ((fp < -1e-9 && fq > 1e-9) || (fp > 1e-9 && fq < -1e-9)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * A slab following a flat outline in some 2D frame, mapped into the world. With no thickness it
 * is a single surface (a ceiling or lining).
 */
export function sheet(
  outline: V2[],
  map: (u: number, v: number) => V3,
  thickness: number,
  material: T.Material,
  uv: (u: number, v: number) => V2 = (u, v) => [u, v],
  holes: V2[][] = [],
): T.Mesh | null {
  const clean = (ring: V2[]) => {
    const r = ring.filter(
      (p, n) => n === 0 || Math.hypot(p[0] - ring[n - 1][0], p[1] - ring[n - 1][1]) > 1e-5,
    );
    if (r.length > 2 && Math.hypot(r[0][0] - r.at(-1)![0], r[0][1] - r.at(-1)![1]) < 1e-5) r.pop();
    return r;
  };
  const outer = clean(outline);
  if (outer.length < 3) return null;
  const inner = holes.map(clean).filter((h) => h.length > 2);
  const tris = T.ShapeUtils.triangulateShape(
    outer.map(([u, v]) => new T.Vector2(u, v)),
    inner.map((h) => h.map(([u, v]) => new T.Vector2(u, v))),
  );
  if (!tris.length) return null;
  // triangulateShape numbers the outline's points first, then each hole's in turn.
  const pts = [...outer, ...inner.flat()];
  const rings = [outer, ...inner];
  const position: number[] = [],
    uvs: number[] = [];
  const push = (p: V3, t: V2) => {
    position.push(...p);
    uvs.push(...t);
  };
  const lift = (p: V3, h: number): V3 => [p[0], p[1] + h, p[2]];
  for (const [a, b, c] of tris) for (const n of [a, b, c]) push(map(...pts[n]), uv(...pts[n]));
  if (thickness > 0) {
    for (const [a, b, c] of tris)
      for (const n of [a, c, b]) push(lift(map(...pts[n]), thickness), uv(...pts[n]));
    // The edges all round, and round each hole.
    for (const ring of rings)
      for (let n = 0; n < ring.length; n++) {
        const p = map(...ring[n]),
          q = map(...ring[(n + 1) % ring.length]);
        const P = lift(p, thickness),
          Q = lift(q, thickness);
        for (const v of [p, q, Q, p, Q, P]) push(v, [0, 0]);
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  const m = new T.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A flat, upright panel drawn from an outline in (along, height), with optional holes. */
export function uprightPanel(
  outline: V2[],
  holes: V2[][],
  axis: 'x' | 'z',
  line: number,
  from: number,
  to: number,
  material: T.Material,
  tile: number,
): T.Mesh {
  const shape = new T.Shape(outline.map(([a, h]) => new T.Vector2(a, h)));
  for (const h of holes) shape.holes.push(new T.Path(h.map(([a, y]) => new T.Vector2(a, y))));
  const depth = Math.abs(to - from);
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const uv = g.attributes.uv as T.BufferAttribute;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) / tile, uv.getY(n) / tile);
  const m = new T.Mesh(g, material);
  const lo = Math.min(from, to);
  if (axis === 'x') m.position.set(0, 0, line + lo);
  else {
    // Local x runs along world z, and the extrusion runs toward -x.
    m.rotation.y = -Math.PI / 2;
    m.position.set(line + lo + depth, 0, 0);
  }
  m.castShadow = m.receiveShadow = true;
  return m;
}

export interface RoofKit {
  p: Project;
  plan: RoofPlan;
  add: (m: T.Mesh | null) => void;
  mat: (color: string, o?: { double?: boolean; opacity?: number; rough?: number }) => T.Material;
  roof: T.Material;
  roofTile: number;
  siding: (double?: boolean) => T.Material;
  sidingTile: number;
  ceiling: T.Material;
  /** Paint of the room at a plan point on a floor, for the inside of dormers. */
  paintAt: (level: number, x: number, z: number) => T.Material;
  evening: boolean;
}

const WALL_T = 0.16;

export function buildRoofs(k: RoofKit) {
  const { plan, add } = k;
  plan.wings.forEach((w, n) => {
    if (w.flat) return flatRoof(k, w);
    pitchedRoof(k, w, n);
  });
  plan.dormers.forEach((d) => dormer(k, d));
  for (const c of k.p.items.filter((i) => i.kind === 'chimney')) chimney(k, c);
  void add;
}

function flatRoof(k: RoofKit, w: Wing) {
  const ov = w.top ? OVERHANG : 0.12;
  const { x0, z0, x1, z1 } = w.rect;
  const grow = Object.fromEntries(Object.entries(w.round).map(([c, r]) => [c, (r || 0) + ov]));
  k.add(
    sheet(
      roundedRect(x0 - ov, z0 - ov, x1 + ov, z1 + ov, grow),
      (x, z) => [x, w.base, z],
      0.22,
      k.roof,
      (x, z) => [x / k.roofTile, z / k.roofTile],
    ),
  );
}

function pitchedRoof(k: RoofKit, w: Wing, index: number) {
  const { plan } = k;
  const half = halfSpan(w);
  const [a0, a1] = alongRange(w);
  const [c0, c1] = crossRange(w);
  const lowEnd = w.axis === 'x' ? 'x0' : 'z0',
    highEnd = w.axis === 'x' ? 'x1' : 'z1';
  const joinedLo = w.joined === lowEnd,
    joinedHi = w.joined === highEnd;
  const ov = OVERHANG;
  const sc = w.cape ? collarRun(w.tan) : 0;
  const slope = Math.sqrt(1 + w.tan * w.tan);
  const hips = hippedEnds(w);
  const bend = w.shape === 'gambrel' ? Math.min(half, w.bend ?? half * GAMBREL_BREAK) : 0;
  const steep = Math.sqrt(1 + (w.tan * GAMBREL_STEEP) ** 2);
  /** Distance up the slope from the eave line, for laying the roofing texture. */
  const upSlope = (s: number) =>
    bend ? (s <= bend ? s * steep : bend * steep + (s - bend) * slope) : s * slope;
  const levelY = w.level * FLOOR_H;

  // Wings whose roofs run on into this one, and the side of this roof they meet.
  const children = plan.wings
    .filter((o) => o !== w && o.top && o.level === w.level && o.reach > 0 && o.axis !== w.axis)
    .map((o) => {
      const [oa0, oa1] = alongRange(o);
      const end = o.joined === (o.axis === 'x' ? 'x0' : 'z0') ? oa0 : oa1;
      const side = Math.abs(end - c0) < 0.03 ? 'lo' : Math.abs(end - c1) < 0.03 ? 'hi' : null;
      const [ca0, ca1] = crossRange(o);
      return side ? { side, ca0, ca1, reach: o.reach, half: halfSpan(o) } : null;
    })
    .filter(Boolean) as {
    side: 'lo' | 'hi';
    ca0: number;
    ca1: number;
    reach: number;
    half: number;
  }[];
  const dormers = plan.dormers.filter((d) => d.wing === index);

  for (const side of ['lo', 'hi'] as const) {
    const map =
      (lift: number) =>
      (a: number, s: number): V3 => {
        const [x, z] = wingPoint(w, side, a, s);
        return [x, w.base + rise(w, s) + lift, z];
      };
    const leftA = joinedLo ? a0 : a0 - ov,
      rightA = joinedHi ? a1 : a1 + ov;
    type Notch = { from: number; to: number; inner: V2[] };
    const notches: Notch[] = [
      ...dormers
        .filter((d) => d.side === side && !d.setback)
        .map((d) => ({
          from: d.a0,
          to: d.a1,
          inner: [
            [d.a0, d.depth],
            [d.a1, d.depth],
          ] as V2[],
        })),
      ...children
        .filter((c) => c.side === side)
        .map((c) => {
          const r = Math.min(c.reach, (c.ca1 - c.ca0) / 2);
          const inner: V2[] = [
            [c.ca0, 0],
            [c.ca0 + r, r],
          ];
          if (c.ca1 - r > c.ca0 + r + 1e-6) inner.push([c.ca1 - r, r]);
          inner.push([c.ca1, 0]);
          return { from: c.ca0, to: c.ca1, inner };
        }),
    ]
      .map((nt) => ({ ...nt, from: Math.max(nt.from, leftA), to: Math.min(nt.to, rightA) }))
      .filter((nt) => nt.to - nt.from > 0.05)
      .sort((a, b) => a.from - b.from);

    // The outside of the roof.
    const outline: V2[] = [];
    // A rounded room corner at either end of this eave: the eave follows the curve, out by the
    // overhang, round onto the gable end.
    const rLo =
      joinedLo || hips.lo ? 0 : Math.min(w.round[wingCorner(w, 0, side)] || 0, half - 0.05);
    const rHi =
      joinedHi || hips.hi ? 0 : Math.min(w.round[wingCorner(w, 1, side)] || 0, half - 0.05);
    if (joinedLo && w.reach) {
      outline.push([a0 - w.reach, half]);
      if (w.reach < half - 1e-6) outline.push([a0 - w.reach, w.reach]);
      outline.push([a0, 0], [a0, -ov]);
    } else if (rLo > 0) {
      outline.push([leftA, half]);
      outline.push(...quarter(a0 + rLo, rLo, rLo + ov, Math.PI, Math.PI * 1.5));
    } else outline.push([leftA, half], [leftA, -ov]);
    let at = rLo > 0 ? a0 + rLo : leftA;
    for (const nt of notches) {
      if (nt.from < at + 0.02) continue;
      outline.push([nt.from, -ov], ...nt.inner, [nt.to, -ov]);
      at = nt.to;
    }
    if (joinedHi && w.reach) {
      outline.push([a1, -ov], [a1, 0]);
      if (w.reach < half - 1e-6) outline.push([a1 + w.reach, w.reach]);
      outline.push([a1 + w.reach, half]);
    } else if (rHi > 0) {
      outline.push(...quarter(a1 - rHi, rHi, rHi + ov, Math.PI * 1.5, Math.PI * 2));
      outline.push([rightA, half]);
    } else outline.push([rightA, -ov], [rightA, half]);
    // A hipped end cuts the side off along the hip, where the end's slope takes over; a
    // gambrel side is laid in two pieces, so the break between its slopes stays sharp.
    let faces: V2[][] = [outline];
    if (hips.lo) faces = faces.map((f) => clipPoly(f, (a, s) => s - (a - a0)));
    if (hips.hi) faces = faces.map((f) => clipPoly(f, (a, s) => s - (a1 - a)));
    if (bend)
      faces = faces.flatMap((f) => [
        clipPoly(f, (_, s) => s - bend),
        clipPoly(f, (_, s) => bend - s),
      ]);
    const whole = faces.length === 1 && !hips.lo && !hips.hi;
    for (const face of faces)
      k.add(
        sheet(
          face,
          map(0),
          ROOF_T,
          k.roof,
          (a, s) => [a / k.roofTile, upSlope(s) / k.roofTile],
          // A dormer set up the slope opens a hole in it, with roof still running below.
          whole
            ? dormers
                .filter((d) => d.side === side && d.setback)
                .map((d) => [
                  [d.a0, d.setback],
                  [d.a1, d.setback],
                  [d.a1, d.depth],
                  [d.a0, d.depth],
                ])
            : [],
        ),
      );

    if (!w.cape) continue;
    // The sloping ceiling inside, from the knee wall up to where it levels off.
    const lining = map(-0.012);
    const pieces: V2[][] = [];
    const rc = Math.min(w.reach, sc);
    if (joinedLo && w.reach) {
      const piece: V2[] = [
        [a0, 0],
        [a0, sc],
        [a0 - rc, sc],
      ];
      if (rc < sc - 1e-6) piece.push([a0 - rc, rc]);
      pieces.push(piece);
    }
    if (joinedHi && w.reach) {
      const piece: V2[] = [
        [a1, 0],
        [a1 + rc, rc],
      ];
      if (rc < sc - 1e-6) piece.push([a1 + rc, sc]);
      piece.push([a1, sc]);
      pieces.push(piece);
    }
    let from = a0;
    const inside = [
      ...notches,
      ...dormers
        .filter((d) => d.side === side && d.setback)
        .map((d) => ({ from: d.a0, to: d.a1, inner: [] as V2[] })),
    ]
      .sort((a, b) => a.from - b.from)
      .map((nt) => ({ ...nt, from: Math.max(nt.from, a0), to: Math.min(nt.to, a1) }))
      .filter((nt) => nt.to > nt.from);
    for (const nt of inside) {
      if (nt.from > from + 0.01)
        pieces.push([
          [from, 0],
          [nt.from, 0],
          [nt.from, sc],
          [from, sc],
        ]);
      // Beside a valley the ceiling carries on above the diagonal where it meets the other roof.
      if (nt.inner.length > 2) {
        const r = Math.min(sc, nt.inner[1][1]);
        pieces.push([
          [nt.from, 0],
          [nt.from + r, r],
          [nt.from + r, sc],
          [nt.from, sc],
        ]);
        pieces.push([
          [nt.to, 0],
          [nt.to, sc],
          [nt.to - r, sc],
          [nt.to - r, r],
        ]);
        if (nt.to - r > nt.from + r + 0.01 && r < sc)
          pieces.push([
            [nt.from + r, r],
            [nt.to - r, r],
            [nt.to - r, sc],
            [nt.from + r, sc],
          ]);
      }
      from = Math.max(from, nt.to);
    }
    if (a1 > from + 0.01)
      pieces.push([
        [from, 0],
        [a1, 0],
        [a1, sc],
        [from, sc],
      ]);
    const rounded = pieces.map((piece) => roundLining(piece, a0, a1, sc, rLo, rHi));
    for (const piece of rounded) k.add(sheet(piece, lining, 0, k.ceiling));
  }

  if (w.cape) {
    // The flat middle of the ceiling, carried on into a neighbour as far as its slope reaches.
    const lo = joinedLo ? a0 - Math.min(w.reach, sc) : a0,
      hi = joinedHi ? a1 + Math.min(w.reach, sc) : a1;
    if (c1 - c0 > sc * 2 + 0.01) {
      const y = levelY + CAPE_CEIL;
      k.add(
        sheet(
          [
            [lo, c0 + sc],
            [hi, c0 + sc],
            [hi, c1 - sc],
            [lo, c1 - sc],
          ],
          (a, c) => (w.axis === 'x' ? [a, y, c] : [c, y, a]),
          0,
          k.ceiling,
        ),
      );
    }
  } else {
    // A flat ceiling hides the attic.
    const { x0, z0, x1, z1 } = w.rect;
    k.add(
      sheet(roundedRect(x0, z0, x1, z1, w.round), (x, z) => [x, w.base - 0.01, z], 0, k.ceiling),
    );
  }

  // Hipped ends: the roof slopes down to the eave here too.
  for (const lo of [true, false]) {
    if (!(lo ? hips.lo : hips.hi)) continue;
    const length = a1 - a0;
    const cap = hips.lo && hips.hi ? length / 2 : length;
    let face: V2[] = [
      [c0 - ov, -ov],
      [c1 + ov, -ov],
      [c1 + ov, cap],
      [c0 - ov, cap],
    ];
    face = clipPoly(face, (c, t) => t - (c - c0));
    face = clipPoly(face, (c, t) => t - (c1 - c));
    k.add(
      sheet(
        face,
        (c, t) => {
          const a = lo ? a0 + t : a1 - t;
          const y = w.base + rise(w, t);
          return w.axis === 'x' ? [a, y, c] : [c, y, a];
        },
        ROOF_T,
        k.roof,
        (c, t) => [c / k.roofTile, (t * slope) / k.roofTile],
      ),
    );
  }

  // Gable ends, in the siding, where the ends aren't joined to anything.
  const ridge = ridgeOf(w);
  const bottom = w.cape ? levelY + CAPE_CEIL : w.base;
  const inset = w.cape ? sc : 0;
  for (const end of [lowEnd, highEnd]) {
    if (end === w.joined || (end === lowEnd ? hips.lo : hips.hi)) continue;
    const line = end === lowEnd ? a0 : a1;
    const e = end === lowEnd ? 0 : 1;
    const inLo = Math.max(inset, Math.min(w.round[wingCorner(w, e, 'lo')] || 0, half - 0.05)),
      inHi = Math.max(inset, Math.min(w.round[wingCorner(w, e, 'hi')] || 0, half - 0.05));
    if (c1 - c0 <= inLo + inHi + 0.01) continue;
    const tri: V2[] = [[c0 + inLo, bottom]];
    if (inLo > inset + 1e-6) tri.push([c0 + inLo, w.base + rise(w, inLo)]);
    // A gambrel's end follows its broken slope.
    if (bend > inLo + 1e-6 && bend < half - 1e-6) tri.push([c0 + bend, w.base + rise(w, bend)]);
    tri.push([(c0 + c1) / 2, ridge + 0.02]);
    if (bend > inHi + 1e-6 && bend < half - 1e-6) tri.push([c1 - bend, w.base + rise(w, bend)]);
    if (inHi > inset + 1e-6) tri.push([c1 - inHi, w.base + rise(w, inHi)]);
    tri.push([c1 - inHi, bottom]);
    tri.reverse();
    k.add(
      uprightPanel(
        tri,
        [],
        w.axis === 'x' ? 'z' : 'x',
        line,
        -WALL_T / 2,
        WALL_T / 2,
        k.siding(true),
        k.sidingTile,
      ),
    );
  }
}

/** Rounds a lining piece's eave corners at the ends of the wing, following the wall below. */
function roundLining(piece: V2[], a0: number, a1: number, sc: number, rLo: number, rHi: number) {
  let out = piece;
  const swap = (at: V2, arc: V2[], drop: V2) => {
    const n = out.findIndex(([u, v]) => Math.abs(u - at[0]) < 1e-6 && Math.abs(v - at[1]) < 1e-6);
    if (n < 0) return;
    const kept = out.filter(
      ([u, v], m) => m === n || !(Math.abs(u - drop[0]) < 1e-6 && Math.abs(v - drop[1]) < 1e-6),
    );
    const k = kept.findIndex(([u, v]) => Math.abs(u - at[0]) < 1e-6 && Math.abs(v - at[1]) < 1e-6);
    out = [...kept.slice(0, k), ...arc, ...kept.slice(k + 1)];
  };
  // Only as far up as the lining goes: past that the flat ceiling takes over.
  const clip = (arc: V2[]) => arc.filter(([, v]) => v <= sc + 1e-6);
  if (rLo > 0) {
    const start = rLo > sc ? Math.PI + Math.asin((rLo - sc) / rLo) : Math.PI;
    swap([a0, 0], clip(quarter(a0 + rLo, rLo, rLo, start, Math.PI * 1.5)), [a0, sc]);
  }
  if (rHi > 0) {
    const stop = rHi > sc ? Math.PI * 2 - Math.asin((rHi - sc) / rHi) : Math.PI * 2;
    swap([a1, 0], clip(quarter(a1 - rHi, rHi, rHi, Math.PI * 1.5, stop)), [a1, sc]);
  }
  return out;
}

/** A gabled dormer pushing out of the slope, with a window and a nook inside. */
function dormer(k: RoofKit, d: RoofPlan['dormers'][number]) {
  const w = k.plan.wings[d.wing];
  const levelY = w.level * FLOOR_H;
  const floorY = w.cape ? levelY : w.base;
  const top = w.base + d.depth * w.tan; // Where the eaves of the dormer meet the main roof.
  const width = d.a1 - d.a0,
    mid = (d.a0 + d.a1) / 2,
    pitch = 0.8,
    peak = top + (width / 2) * pitch;
  // The face stands where the dormer meets the slope, a little way up from the eave.
  const eave = wingPoint(w, d.side, mid, d.setback)[w.axis === 'x' ? 1 : 0];
  // Outward from the house, across the eave.
  const out = d.side === 'lo' ? -1 : 1;
  const wallAxis = w.axis; // The face runs along the ridge direction.
  const inner = k.paintAt(w.level, ...wingPoint(w, d.side, mid, d.depth / 2));

  // The face, with its window.
  // The sill clears the roof running below the dormer, so the window looks out, not down.
  const sill = Math.max(floorY + (w.cape ? 0.72 : 0.3), w.base + d.setback * w.tan + 0.12),
    head = Math.min(top - 0.18, sill + 1.3),
    ww = Math.min(width * 0.62, 1.05);
  const face: V2[] = [
    [d.a0, floorY],
    [d.a1, floorY],
    [d.a1, top],
    [mid, peak],
    [d.a0, top],
  ];
  const hole: V2[] = [
    [mid - ww / 2, sill],
    [mid - ww / 2, head],
    [mid + ww / 2, head],
    [mid + ww / 2, sill],
  ];
  const outerHalf: [number, number] = out < 0 ? [-WALL_T / 2, 0] : [0, WALL_T / 2];
  const innerHalf: [number, number] = out < 0 ? [0, WALL_T / 2] : [-WALL_T / 2, 0];
  k.add(uprightPanel(face, [hole], wallAxis, eave, ...outerHalf, k.siding(true), k.sidingTile));
  k.add(uprightPanel(face, [hole], wallAxis, eave, ...innerHalf, inner, k.sidingTile));
  // Glass, sash and muntins: six panes, like the rest of the windows.
  const glass = k.mat(k.evening ? '#f3d19a' : '#a9d0d6', {
    opacity: k.evening ? 0.8 : 0.3,
    rough: 0.1,
  });
  const trim = k.mat('#fbf8f1');
  const pane = (a: number, b: number, y0: number, y1: number, depth: number, m: T.Material) => {
    const [px, pz] = wingPoint(w, d.side, (a + b) / 2, d.setback);
    const box = new T.Mesh(
      wallAxis === 'x'
        ? new T.BoxGeometry(b - a, y1 - y0, depth)
        : new T.BoxGeometry(depth, y1 - y0, b - a),
      m,
    );
    box.position.set(px, (y0 + y1) / 2, pz);
    k.add(box);
  };
  pane(mid - ww / 2, mid + ww / 2, sill, head, 0.03, glass);
  for (const a of [mid - ww / 2, mid, mid + ww / 2])
    pane(a - 0.03, a + 0.03, sill, head, 0.07, trim);
  for (const y of [sill + (head - sill) / 3, sill + ((head - sill) * 2) / 3])
    pane(mid - ww / 2, mid + ww / 2, y - 0.02, y + 0.02, 0.06, trim);
  pane(mid - ww / 2 - 0.05, mid + ww / 2 + 0.05, head, head + 0.07, WALL_T + 0.04, trim);
  pane(mid - ww / 2 - 0.07, mid + ww / 2 + 0.07, sill - 0.05, sill, WALL_T + 0.1, trim);

  // Cheeks: the triangles between the main roof and the dormer's eaves.
  for (const a of [d.a0, d.a1]) {
    const tri: V2[] = [
      [d.setback, w.base + d.setback * w.tan],
      [d.depth, top],
      [d.setback, top],
    ];
    // In the cheek's own plane, the first coordinate runs in from the eave.
    const outline = tri.map(
      ([s, y]) => [wingPoint(w, d.side, a, s)[w.axis === 'x' ? 1 : 0], y] as V2,
    );
    const across = w.axis === 'x' ? 'z' : 'x';
    const outside = a === d.a0 ? -1 : 1;
    k.add(
      uprightPanel(
        outline,
        [],
        across,
        a,
        outside < 0 ? -WALL_T / 2 : 0,
        outside < 0 ? 0 : WALL_T / 2,
        k.siding(true),
        k.sidingTile,
      ),
    );
    k.add(
      uprightPanel(
        outline,
        [],
        across,
        a,
        outside < 0 ? 0 : -WALL_T / 2,
        outside < 0 ? WALL_T / 2 : 0,
        inner,
        k.sidingTile,
      ),
    );
  }

  // The dormer's own little gable roof, running back until it dies into the main roof.
  const back = d.depth + ((width / 2) * pitch) / w.tan;
  const slope = Math.sqrt(1 + pitch * pitch);
  for (const left of [true, false]) {
    const front = d.setback - 0.16;
    const outline: V2[] = [
      [front, -0.12],
      [d.depth, -0.12],
      [d.depth, 0],
      [back, width / 2],
      [front, width / 2],
    ];
    const map = (s: number, l: number): V3 => {
      const [x, z] = wingPoint(w, d.side, left ? d.a0 + l : d.a1 - l, s);
      return [x, top + l * pitch, z];
    };
    k.add(
      sheet(outline, map, ROOF_T * 0.8, k.roof, (s, l) => [
        s / k.roofTile,
        (l * slope) / k.roofTile,
      ]),
    );
  }
  if (w.cape) {
    // The ceiling over the nook.
    const r = dormerRect(k.plan, d);
    k.add(
      sheet(
        [
          [r.x0, r.z0],
          [r.x1, r.z0],
          [r.x1, r.z1],
          [r.x0, r.z1],
        ],
        (x, z) => [x, levelY + CAPE_CEIL, z],
        0,
        k.ceiling,
      ),
    );
  }
}

function chimney(k: RoofKit, c: Item) {
  const cx = c.x + c.w / 2,
    cz = c.z + c.d / 2;
  const roof = roofTopAt(k.plan, cx, cz);
  if (roof === undefined) return;
  const ridge = Math.max(
    roof,
    ...k.plan.wings
      .filter((w) => !w.flat && roofTopAt({ ...k.plan, wings: [w] }, cx, cz) !== undefined)
      .map((w) => ridgeOf(w) + ROOF_T),
  );
  const bottom = roof - 1.2,
    top = Math.max(roof + 1.1, ridge + 0.7);
  const brick = k.mat(c.color);
  const shaft = new T.Mesh(new T.BoxGeometry(c.w, top - bottom, c.d), brick);
  shaft.position.set(cx, (top + bottom) / 2, cz);
  shaft.userData.itemId = c.id;
  k.add(shaft);
  const cap = new T.Mesh(new T.BoxGeometry(c.w + 0.12, 0.12, c.d + 0.12), k.mat('#d6c7ad'));
  cap.position.set(cx, top + 0.06, cz);
  k.add(cap);
  for (const dx of [-0.14, 0.14]) {
    const flue = new T.Mesh(new T.BoxGeometry(0.2, 0.22, 0.2), k.mat('#8a5a44'));
    flue.position.set(cx + (c.w > c.d ? dx * c.w : 0), top + 0.23, cz + (c.w > c.d ? 0 : dx * c.d));
    k.add(flue);
  }
}
