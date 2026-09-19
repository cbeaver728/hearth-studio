import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Camera,
  Footprints,
  Home,
  Pause,
  Play,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import {
  buildWalls,
  floorName,
  FLOOR_H,
  isOutside,
  isRoom,
  stairLevels,
  type Item,
  type Project,
} from './model';
import { layoutFor, localSize, RISE, subtractRects, toWorld, type Rect } from './stairs';
import { buildWalkWorld, EYE, stairHoles, type WalkWorld } from './walk';
import { furniture, tone, type Mat } from './furniture3d';

export type SceneMode = 'dollhouse' | 'exterior' | 'walk';
interface Props {
  project: Project;
  floor: number;
  mode: SceneMode;
  onMode: (m: SceneMode) => void;
  onNotice: (s: string) => void;
  /** Walkthrough only: the level the walker is standing on changed. */
  onLevel?: (level: number) => void;
  /** Clicking something in the dollhouse or exterior view selects it. */
  onPick?: (id: string | null) => void;
}
interface Engine {
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  sun: T.DirectionalLight;
  hemi: T.HemisphereLight;
  ambient: T.AmbientLight;
  /** A soft light that travels with you in the walkthrough, like room lighting. */
  fill: T.PointLight;
  content: T.Group | null;
  dispose: (() => void) | null;
  world: WalkWorld | null;
  bounds: T.Box3;
}
interface TourStop {
  x: number;
  z: number;
  dx: number;
  dz: number;
  yaw: number;
  level: number;
}
const STOP_SECONDS = 5.5;
interface Walker {
  x: number;
  z: number;
  feet: number;
  yaw: number;
  pitch: number;
  level: number;
  fall: number;
}

let plankTexture: T.CanvasTexture | null = null;
function planks() {
  if (plankTexture) return plankTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    g.fillStyle = `rgba(120,95,60,${0.03 + ((row * 37) % 5) * 0.012})`;
    g.fillRect(0, y, 256, 32);
    g.fillStyle = 'rgba(90,70,45,0.28)';
    g.fillRect(0, y, 256, 1.5);
    const off = (row * 97) % 256;
    g.fillRect(off, y, 1.5, 32);
    g.fillRect((off + 128) % 256, y, 1.5, 32);
  }
  plankTexture = new T.CanvasTexture(c);
  plankTexture.wrapS = plankTexture.wrapT = T.RepeatWrapping;
  plankTexture.colorSpace = T.SRGBColorSpace;
  plankTexture.anisotropy = 4;
  return plankTexture;
}

/** Builds every mesh for the current project and view. */
function buildContent(p: Project, mode: SceneMode, floor: number, evening: boolean) {
  const group = new T.Group();
  const materials = new Map<string, T.Material>();
  const mat: Mat = (color, o = {}) => {
    const key = JSON.stringify([color, o]);
    let m = materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color,
        roughness: o.rough ?? 0.8,
        metalness: o.metal ?? 0,
        transparent: o.opacity !== undefined,
        opacity: o.opacity ?? 1,
        emissive: o.emissive || '#000000',
        emissiveIntensity: o.emissive ? 1.2 : 0,
        side: o.double ? T.DoubleSide : T.FrontSide,
        depthWrite: o.opacity === undefined,
      });
      materials.set(key, m);
    }
    return m;
  };
  const add = (mesh: T.Mesh, cast = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: string | T.Material | T.Material[],
  ) => {
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const mesh = add(
      new T.Mesh(
        new T.BoxGeometry(w, h, d),
        typeof material === 'string' ? mat(material) : material,
      ),
    );
    mesh.position.set(x, y, z);
    return mesh;
  };
  /** Box from plan rectangle and heights. */
  const slab = (r: Rect, y0: number, y1: number, material: string | T.Material) =>
    box(
      (r.x0 + r.x1) / 2,
      (y0 + y1) / 2,
      (r.z0 + r.z1) / 2,
      r.x1 - r.x0,
      y1 - y0,
      r.z1 - r.z0,
      material,
    );
  const sphere = (x: number, y: number, z: number, r: number, color: string) =>
    add(new T.Mesh(new T.IcosahedronGeometry(r, 1), mat(color))).position.set(x, y, z);

  const levels = p.floors.map((f) => f.level).sort((a, b) => a - b);
  const shown =
    mode === 'walk'
      ? levels
      : mode === 'exterior'
        ? levels.filter((l) => l >= 0)
        : floor >= 0
          ? levels.filter((l) => l >= 0 && l <= floor)
          : [floor];
  const showsOutside = mode !== 'dollhouse' || floor >= 0;
  const wallHeight = (level: number) => (mode === 'dollhouse' && level === floor ? 1.15 : 3);
  const interior = p.interior || '#f4efe6';
  const roomsOn = (level: number) => p.items.filter((i) => isRoom(i) && i.floor === level);
  const insideRoom = (level: number, x: number, z: number) =>
    roomsOn(level).some((r) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);

  // Ground. Basements cut through it in the walkthrough so their stairs stay open.
  const groundTop =
    mode === 'walk' ? -0.02 : Math.min(0, mode === 'dollhouse' ? floor * FLOOR_H : 0) - 0.19;
  const groundColor = evening ? '#7c906c' : '#a3b590';
  const basementCuts =
    mode === 'walk'
      ? levels
          .filter((l) => l < 0)
          .flatMap((l) =>
            roomsOn(l).map((r) => ({ x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d })),
          )
      : [];
  for (const r of subtractRects({ x0: -60, z0: -60, x1: 60, z1: 60 }, basementCuts))
    slab(r, groundTop - 0.4, groundTop, groundColor);
  if (mode !== 'walk') {
    box(0, groundTop - 0.15, 0, 33, 0.32, 29, '#728d69');
    box(0, groundTop + 0.01, 0, 32.5, 0.02, 28.5, '#b0bf99');
  }

  // Landscape.
  if (showsOutside)
    for (const i of p.items.filter(isOutside)) {
      const x = i.x + i.w / 2,
        z = i.z + i.d / 2;
      switch (i.kind) {
        case 'grass':
          box(x, 0.0, z, i.w, 0.05, i.d, i.color);
          break;
        case 'driveway':
          box(x, 0.01, z, i.w, 0.06, i.d, i.color);
          for (let dz = 1.5; dz < i.d; dz += 1.5)
            box(x, 0.042, i.z + dz, i.w, 0.005, 0.024, '#989e94');
          break;
        case 'deck':
          box(x, 0.07, z, i.w, 0.2, i.d, i.color);
          for (let dx = 0.2; dx < i.w; dx += 0.2)
            box(i.x + dx, 0.172, z, 0.013, 0.006, i.d, '#978467');
          break;
        case 'pool': {
          box(x, 0.04, z, i.w + 0.3, 0.14, i.d + 0.3, '#e4dfce');
          box(x, 0.1, z, i.w, 0.03, i.d, mat(i.color, { rough: 0.12, metal: 0.25 }));
          break;
        }
        case 'tree':
          box(x, 0.65, z, 0.2, 1.3, 0.2, '#8b7658');
          sphere(x, 1.5 + i.w * 0.3, z, i.w * 0.48, i.color);
          sphere(x - i.w * 0.25, 1.4, z + 0.15, i.w * 0.3, '#89a674');
          sphere(x + i.w * 0.2, 1.8, z - 0.15, i.w * 0.28, '#a0b780');
          break;
        case 'fence': {
          const along = i.w >= i.d;
          const len = along ? i.w : i.d;
          for (let t = 0; t < len; t += 0.18)
            along
              ? box(i.x + t + 0.06, 0.65, z, 0.12, 1.3, Math.max(0.06, i.d), i.color)
              : box(x, 0.65, i.z + t + 0.06, Math.max(0.06, i.w), 1.3, 0.12, i.color);
          break;
        }
      }
    }

  // Floors, with openings where stairs arrive.
  const plank = planks();
  for (const level of shown) {
    const y = level * FLOOR_H,
      holes = stairHoles(p, level);
    for (const r of roomsOn(level))
      for (const piece of subtractRects(
        { x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d },
        holes,
      )) {
        const base = slab(
          piece,
          y - 0.18,
          y - 0.01,
          level === levels[0] || mode !== 'walk' ? tone(r.color, -20) : '#f3f0ea',
        );
        if (base) base.userData.itemId = r.id;
        const w = piece.x1 - piece.x0,
          d = piece.z1 - piece.z0;
        const top = new T.PlaneGeometry(w, d);
        top.rotateX(-Math.PI / 2);
        if (r.kind === 'room') {
          const uv = top.attributes.uv as T.BufferAttribute;
          for (let n = 0; n < uv.count; n++)
            uv.setXY(n, (uv.getX(n) * w + piece.x0) / 1.6, (uv.getY(n) * d + piece.z0) / 1.6);
        }
        const m = add(
          new T.Mesh(
            top,
            r.kind === 'room'
              ? new T.MeshStandardMaterial({ color: r.color, map: plank, roughness: 0.7 })
              : mat(r.color),
          ),
          false,
        );
        m.position.set((piece.x0 + piece.x1) / 2, y, (piece.z0 + piece.z1) / 2);
        m.userData.itemId = r.id;
      }
  }

  // Walls: exterior finish outside, interior paint inside, trim at every opening.
  const trim = '#fbf8f1';
  for (const wall of buildWalls(p).filter((w) => shown.includes(w.floor))) {
    const y = wall.floor * FLOOR_H,
      height = wallHeight(wall.floor),
      thick = 0.16;
    const mid = (wall.start + wall.end) / 2;
    const sideA =
      wall.axis === 'x'
        ? insideRoom(wall.floor, mid, wall.line - 0.25)
        : insideRoom(wall.floor, wall.line - 0.25, mid);
    const sideB =
      wall.axis === 'x'
        ? insideRoom(wall.floor, mid, wall.line + 0.25)
        : insideRoom(wall.floor, wall.line + 0.25, mid);
    const neg = mat(sideA ? interior : p.exterior),
      pos = mat(sideB ? interior : p.exterior),
      edge = mat(mode === 'dollhouse' ? '#f5f0e5' : interior);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
    const faces =
      wall.axis === 'x' ? [edge, edge, edge, edge, pos, neg] : [pos, neg, edge, edge, edge, edge];
    const piece = (
      a: number,
      b: number,
      bottom: number,
      top: number,
      material: T.Material | T.Material[] | string = faces,
      t = thick,
    ) =>
      wall.axis === 'x'
        ? box((a + b) / 2, y + (bottom + top) / 2, wall.line, b - a, top - bottom, t, material)
        : box(wall.line, y + (bottom + top) / 2, (a + b) / 2, t, top - bottom, b - a, material);
    const cuts = [
      ...new Set([wall.start, wall.end, ...wall.openings.flatMap((o) => [o.start, o.end])]),
    ].sort((a, b) => a - b);
    for (let n = 0; n < cuts.length - 1; n++) {
      const a = cuts[n],
        b = cuts[n + 1];
      const openings = wall.openings.filter((o) => o.start <= a + 0.001 && o.end >= b - 0.001);
      const open = openings.find((o) => o.kind === 'door') || openings[0];
      if (!open) {
        piece(a, b, 0, height);
        piece(a, b, 0, 0.09, '#d2caba', thick + 0.02);
        continue;
      }
      const bottom = open.kind === 'window' ? 0.95 : 0,
        top = open.kind === 'window' ? 2.25 : 2.2;
      if (bottom > 0) piece(a, b, 0, Math.min(bottom, height));
      if (height > top) piece(a, b, top, height);
      if (open.kind === 'window' && height > bottom) {
        piece(
          a,
          b,
          bottom,
          Math.min(top, height),
          mat(evening ? '#f3d19a' : '#a9d0d6', {
            opacity: evening ? 0.8 : 0.3,
            rough: 0.1,
            metal: 0.1,
            emissive: evening ? '#be874a' : undefined,
          }),
          0.03,
        );
        for (const xx of [a, b, (a + b) / 2])
          piece(xx - 0.03, xx + 0.03, bottom, Math.min(top, height), '#52675f', 0.06);
        piece(a - 0.04, b + 0.04, bottom - 0.04, bottom, trim, thick + 0.08);
        if (height >= top) piece(a, b, top - 0.05, top, '#52675f', 0.06);
      }
    }
    // Door casings.
    for (const o of wall.openings.filter((o) => o.kind === 'door')) {
      if (height < 1) continue;
      piece(o.start - 0.06, o.start, 0, 2.2, trim, thick + 0.04);
      piece(o.end, o.end + 0.06, 0, 2.2, trim, thick + 0.04);
      if (height > 2.2) piece(o.start - 0.06, o.end + 0.06, 2.2, 2.28, trim, thick + 0.04);
      const width = o.end - o.start;
      if (width > 1.8 && !o.garage) continue; // A wide opening between rooms: just the casing.
      if (height >= 2.2 && width > 1.8) {
        // Wide garage doors: a closed sectional panel with grooves.
        const panel = mat(tone(p.exterior, 10), { rough: 0.6 });
        piece(o.start, o.end, 0.02, 2.2, panel, 0.05);
        for (let g = 1; g < 4; g++)
          piece(o.start, o.end, g * 0.55, g * 0.55 + 0.02, tone(p.exterior, -25), 0.07);
        continue;
      }
      if (height < 2.2) continue;
      // An open door leaf, swung into a room (the one on the negative side when both are rooms).
      const dir = sideA ? -1 : 1;
      const leaf = mat(tone(interior, -14));
      const t = 0.04;
      if (wall.axis === 'x')
        box(
          o.start + t / 2 + 0.01,
          y + 1.05,
          wall.line + dir * (thick / 2 + width / 2),
          t,
          2.1,
          width,
          leaf,
        );
      else
        box(
          wall.line + dir * (thick / 2 + width / 2),
          y + 1.05,
          o.start + t / 2 + 0.01,
          width,
          2.1,
          t,
          leaf,
        );
    }
    if (mode === 'dollhouse' && wall.floor === floor)
      piece(wall.start, wall.end, height, height + 0.02, '#f5f0e5', thick + 0.005);
  }

  // Stairs.
  for (const s of p.items.filter((i) => i.kind === 'stairs')) {
    const { lower, upper } = stairLevels(s);
    if (!shown.includes(lower) && !(mode === 'dollhouse' && upper === floor)) continue;
    buildStairs(s, lower, upper, shown.includes(upper), group, mat, interior);
  }

  // Furniture.
  for (const i of p.items) {
    if (isRoom(i) || isOutside(i) || i.kind === 'stairs' || !shown.includes(i.floor)) continue;
    const g = furniture(i, i.floor * FLOOR_H, mat);
    if (g) {
      g.userData.itemId = i.id;
      group.add(g);
    }
  }

  // Roofs: a gable (or flat) roof over the top of each stack, flat roofs over lower parts.
  if (mode !== 'dollhouse') {
    const roofMat = mat(p.roof, { double: true });
    for (const level of levels.filter((l) => l >= 0))
      for (const kind of ['room', 'garage'] as const) {
        const rooms = p.items.filter((i) => i.floor === level && i.kind === kind);
        if (!rooms.length) continue;
        const y = level * FLOOR_H + 3.0;
        const above = p.items.filter(
          (i) =>
            isRoom(i) &&
            i.floor === level + 1 &&
            rooms.some(
              (r) => i.x < r.x + r.w && i.x + i.w > r.x && i.z < r.z + r.d && i.z + i.d > r.z,
            ),
        );
        if (above.length) {
          const cover = above.map((r) => ({ x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d }));
          for (const r of rooms)
            for (const piece of subtractRects(
              { x0: r.x - 0.12, z0: r.z - 0.12, x1: r.x + r.w + 0.12, z1: r.z + r.d + 0.12 },
              cover,
            ))
              slab(piece, y, y + 0.22, roofMat);
          continue;
        }
        const minX = Math.min(...rooms.map((i) => i.x)) - 0.3,
          maxX = Math.max(...rooms.map((i) => i.x + i.w)) + 0.3,
          minZ = Math.min(...rooms.map((i) => i.z)) - 0.3,
          maxZ = Math.max(...rooms.map((i) => i.z + i.d)) + 0.3,
          w = maxX - minX,
          d = maxZ - minZ,
          x = (minX + maxX) / 2,
          z = (minZ + maxZ) / 2;
        if (p.roofStyle === 'flat') {
          box(x, y + 0.11, z, w, 0.22, d, roofMat);
          continue;
        }
        const rise = Math.min(2.2, w * 0.23);
        const shape = new T.Shape();
        shape.moveTo(-w / 2, 0);
        shape.lineTo(w / 2, 0);
        shape.lineTo(0, rise);
        shape.closePath();
        const roof = add(
          new T.Mesh(
            new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }),
            mat(tone(p.exterior, -8), { double: true }),
          ),
        );
        roof.position.set(x, y + 0.02, minZ);
        const length = Math.hypot(w / 2, rise),
          angle = Math.atan2(rise, w / 2);
        for (const side of [-1, 1]) {
          const panel = box(
            x + (side * w) / 4,
            y + rise / 2 + 0.1,
            z,
            length + 0.1,
            0.11,
            d + 0.12,
            roofMat,
          );
          if (panel) panel.rotation.z = -side * angle;
        }
      }
  }

  const bounds = new T.Box3();
  const framed = p.items.filter((i) => isRoom(i) && shown.includes(i.floor));
  for (const r of framed.length ? framed : p.items) {
    bounds.expandByPoint(new T.Vector3(r.x, r.floor * FLOOR_H, r.z));
    bounds.expandByPoint(new T.Vector3(r.x + r.w, r.floor * FLOOR_H + 3, r.z + r.d));
  }
  if (bounds.isEmpty()) bounds.set(new T.Vector3(-6, 0, -6), new T.Vector3(6, 3, 6));
  const dispose = () => {
    const cached = new Set(materials.values());
    group.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) if (!cached.has(m)) m.dispose();
    });
    cached.forEach((m) => m.dispose());
  };
  return { group, dispose, bounds };
}

function buildStairs(
  s: Item,
  lower: number,
  upper: number,
  upperShown: boolean,
  group: T.Group,
  mat: Mat,
  interior: string,
) {
  const layout = layoutFor(s);
  const { LW, LD } = localSize(s);
  const g = new T.Group();
  g.position.set(s.x + s.w / 2, lower * FLOOR_H, s.z + s.d / 2);
  g.userData.itemId = s.id;
  g.rotation.y = (-s.rotation * Math.PI) / 180;
  group.add(g);
  const put = (m: T.Mesh) => {
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const b = (
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    v0: number,
    v1: number,
    material: T.Material,
  ) => {
    const m = put(new T.Mesh(new T.BoxGeometry(u1 - u0, y1 - y0, v1 - v0), material));
    m.position.set((u0 + u1) / 2 - LW / 2, (y0 + y1) / 2, (v0 + v1) / 2 - LD / 2);
    return m;
  };
  const body = mat(tone(s.color, -18)),
    tread = mat(s.color),
    rail = mat('#6b5a45'),
    glass = mat('#d6e8ea', { opacity: 0.3, rough: 0.05 });
  for (const t of layout.treads) {
    const top = t.k * RISE;
    if (t.rect) {
      const r = t.rect;
      b(r.x0, r.x1, Math.max(0, top - 0.45), top - 0.035, r.z0, r.z1, body);
      b(r.x0 - 0.01, r.x1 + 0.01, top - 0.035, top, r.z0 - 0.015, r.z1 + 0.015, tread);
    } else if (t.wedge) {
      const w = t.wedge;
      const geo = new T.CylinderGeometry(w.r1, w.r1, 0.05, 8, 1, false, w.a0, w.a1 - w.a0 + 0.02);
      const m = put(new T.Mesh(geo, tread));
      m.position.set(w.cu - LW / 2, top - 0.025, w.cv - LD / 2);
    }
  }
  if (layout.pole) {
    const h = (upper - lower) * FLOOR_H + 1;
    const m = put(new T.Mesh(new T.CylinderGeometry(layout.pole.r, layout.pole.r, h, 16), rail));
    m.position.set(layout.pole.u - LW / 2, h / 2, layout.pole.v - LD / 2);
    // Handrail spiralling up the outside edge.
    const w0 = layout.treads[0].wedge!;
    const pts: T.Vector3[] = [];
    for (const t of layout.treads) {
      const a = (t.wedge!.a0 + t.wedge!.a1) / 2;
      pts.push(
        new T.Vector3(
          (w0.r1 - 0.04) * Math.sin(a) + w0.cu - LW / 2,
          t.k * RISE + 0.9,
          (w0.r1 - 0.04) * Math.cos(a) + w0.cv - LD / 2,
        ),
      );
    }
    put(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 64, 0.025, 6), rail));
    for (const t of layout.treads.filter((_, n) => n % 2 === 0)) {
      const a = (t.wedge!.a0 + t.wedge!.a1) / 2;
      const post = put(new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.9, 6), rail));
      post.position.set(
        (w0.r1 - 0.04) * Math.sin(a) + w0.cu - LW / 2,
        t.k * RISE + 0.45,
        (w0.r1 - 0.04) * Math.cos(a) + w0.cv - LD / 2,
      );
    }
  }
  const segment = (
    a: [number, number],
    bb: [number, number],
    y0: number,
    y1: number,
    material: T.Material,
    t: number,
  ) => {
    const u0 = Math.min(a[0], bb[0]) - t / 2,
      u1 = Math.max(a[0], bb[0]) + t / 2,
      v0 = Math.min(a[1], bb[1]) - t / 2,
      v1 = Math.max(a[1], bb[1]) + t / 2;
    b(u0, u1, y0, y1, v0, v1, material);
  };
  for (const d of layout.dividers)
    segment(d.a, d.b, 0, (upper - lower) * FLOOR_H + 1, mat(interior), 0.1);
  if (upperShown) {
    const y = (upper - lower) * FLOOR_H;
    for (const r of layout.rails) {
      segment(r.a, r.b, y, y + 0.92, glass, 0.02);
      segment(r.a, r.b, y + 0.92, y + 0.97, rail, 0.06);
    }
  }
  // A handrail along the open side of straight flights.
  if (s.style === 'straight' || !s.style) {
    const h = (upper - lower) * FLOOR_H;
    const len = Math.hypot(LD, h);
    const m = put(new T.Mesh(new T.BoxGeometry(0.05, 0.05, len), rail));
    m.position.set(LW / 2 - 0.04, h / 2 + 0.9, 0);
    m.rotation.x = Math.atan2(h, LD);
  }
}

/** Finds the main entrance: an outside door on the ground floor, preferring an entry room. */
function frontDoor(p: Project) {
  const rooms = p.items.filter((i) => i.kind === 'room' && i.floor === 0);
  const inside = (x: number, z: number) =>
    p.items.some(
      (r) => isRoom(r) && r.floor === 0 && x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d,
    );
  const doors = p.openings
    .filter((o) => o.kind === 'door')
    .map((o) => {
      const r = rooms.find((i) => i.id === o.roomId);
      if (!r) return null;
      const h = o.side === 'north' || o.side === 'south',
        len = h ? r.w : r.d,
        width = Math.min(o.width, len - 0.2),
        c = Math.max(width / 2 + 0.1, Math.min(len - width / 2 - 0.1, len * o.offset));
      const x = h ? r.x + c : o.side === 'west' ? r.x : r.x + r.w,
        z = h ? (o.side === 'north' ? r.z : r.z + r.d) : r.z + c;
      const n = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[o.side];
      if (inside(x + n[0] * 0.3, z + n[1] * 0.3)) return null;
      const score = /entry|foyer|front|mud/i.test(r.name) ? 2 : o.side === 'south' ? 1 : 0;
      return { x, z, nx: n[0], nz: n[1], score };
    })
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => b.score - a.score);
  return doors[0];
}

export default function Scene({
  project: p,
  floor,
  mode,
  onMode,
  onNotice,
  onLevel,
  onPick,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const walker = useRef<Walker>({ x: 0, z: 0, feet: 0, yaw: Math.PI, pitch: 0, level: 0, fall: 0 });
  const keys = useRef(new Set<string>());
  const pad = useRef({ forward: 0, turn: 0 });
  // Guided tour: a slow look around each room in turn.
  const tour = useRef<{ stops: TourStop[]; i: number; t: number } | null>(null);
  const [touring, setTouring] = useState(false);
  const [stop, setStop] = useState(0);
  const [fading, setFading] = useState(false);
  // A brief dip to dark between tour stops, then out of the way.
  useEffect(() => {
    if (!touring) return;
    setFading(true);
    const t = setTimeout(() => setFading(false), 700);
    return () => clearTimeout(t);
  }, [stop, touring]);
  const live = useRef({ mode, floor, p, onLevel, onPick, onMode });
  live.current = { mode, floor, p, onLevel, onPick, onMode };
  // Double-clicking the house starts the walkthrough at that spot.
  const walkFrom = useRef<{ x: number; z: number; level: number; yaw: number } | null>(null);
  const [error, setError] = useState(false);
  const [evening, setEvening] = useState(false);
  const [hint, setHint] = useState(true);
  const [walkLevel, setWalkLevel] = useState(floor);
  // Until you orbit, the camera re-frames the house when the panel changes size.
  const framing = useRef({ touched: false, frame: () => {} });
  // Frames are drawn only when something changed, so an idle view costs nothing.
  const dirty = useRef(true);
  const [roomName, setRoomName] = useState('');
  const mapFrame = useRef<{
    minX: number;
    minZ: number;
    scale: number;
    ox: number;
    oz: number;
  } | null>(null);

  // One renderer for the lifetime of the view.
  useEffect(() => {
    const node = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    node.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(45, 1, 0.05, 300);
    camera.rotation.order = 'YXZ';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.addEventListener('start', () => (framing.current.touched = true));
    controls.minDistance = 3;
    controls.maxDistance = 110;
    controls.maxPolarAngle = Math.PI / 2 - 0.035;
    const sun = new T.DirectionalLight('#fff5df', 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -32,
      right: 32,
      top: 32,
      bottom: -32,
      near: 1,
      far: 120,
    });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    const hemi = new T.HemisphereLight('#d6eaff', '#64745c', 2.2);
    const ambient = new T.AmbientLight('#fff4e6', 0);
    const fill = new T.PointLight('#fff1dc', 0, 11, 1.4);
    scene.add(sun, sun.target, hemi, ambient, fill);
    engine.current = {
      renderer,
      scene,
      camera,
      controls,
      sun,
      hemi,
      ambient,
      fill,
      content: null,
      dispose: null,
      world: null,
      bounds: new T.Box3(),
    };
    if (import.meta.env.DEV) Object.assign(window, { __hearth: { engine, walker } });
    const resize = new ResizeObserver(() => {
      const w = node.clientWidth,
        h = node.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty.current = true;
      if (!framing.current.touched && live.current.mode !== 'walk') framing.current.frame();
    });
    resize.observe(node);

    let dragging = false,
      lastX = 0,
      lastY = 0;
    const down = (e: PointerEvent) => {
      if (live.current.mode !== 'walk') return;
      endTour.current();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const w = walker.current;
      w.yaw -= (e.clientX - lastX) * 0.0045;
      w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (e.clientY - lastY) * 0.0045));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => (dragging = false);
    const ray = new T.Raycaster();
    const pick = (e: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const content = engine.current?.content;
      if (!content) return null;
      for (const hit of ray.intersectObject(content, true)) {
        let o: T.Object3D | null = hit.object;
        while (o && !o.userData.itemId) o = o.parent;
        if (o) return { id: o.userData.itemId as string, point: hit.point };
      }
      return null;
    };
    let pressX = 0,
      pressY = 0;
    const press = (e: PointerEvent) => {
      pressX = e.clientX;
      pressY = e.clientY;
    };
    const release = (e: PointerEvent) => {
      if (live.current.mode === 'walk' || e.button !== 0) return;
      if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 4) return;
      live.current.onPick?.(pick(e)?.id ?? null);
    };
    const dblclick = (e: MouseEvent) => {
      if (live.current.mode === 'walk') return;
      const hit = pick(e);
      if (!hit) return;
      const item = live.current.p.items.find((i) => i.id === hit.id);
      if (!item || isOutside(item)) return;
      const level = item.kind === 'stairs' ? stairLevels(item).lower : item.floor;
      const dx = hit.point.x - camera.position.x,
        dz = hit.point.z - camera.position.z;
      walkFrom.current = { x: hit.point.x, z: hit.point.z, level, yaw: Math.atan2(-dx, -dz) };
      live.current.onMode?.('walk');
    };
    renderer.domElement.addEventListener('pointerdown', press);
    renderer.domElement.addEventListener('pointerup', release);
    renderer.domElement.addEventListener('dblclick', dblclick);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', up);
    const keydown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches?.('input,textarea,select') ||
        live.current.mode !== 'walk'
      )
        return;
      const k = e.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'q',
          'e',
          'shift',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
        ].includes(k)
      ) {
        e.preventDefault();
        keys.current.add(k);
        setHint(false);
        endTour.current();
      }
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);

    let frame = 0,
      last = performance.now(),
      tickCount = 0,
      seen = '';
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const e = engine.current!;
      if (live.current.mode === 'walk' && e.world && tour.current) {
        const tr = tour.current,
          w = walker.current;
        tr.t += dt;
        if (tr.t > STOP_SECONDS) {
          tr.t = 0;
          tr.i++;
          if (tr.i >= tr.stops.length) {
            tour.current = null;
            setTouring(false);
          } else setStop(tr.i);
        }
        const st = tr.stops[Math.min(tr.i, tr.stops.length - 1)];
        const k = Math.min(1, tr.t / STOP_SECONDS),
          ease = k * k * (3 - 2 * k);
        Object.assign(w, {
          x: st.x + st.dx * ease,
          z: st.z + st.dz * ease,
          feet: st.level * FLOOR_H,
          yaw: st.yaw + 0.35 - 0.7 * ease,
          pitch: -0.08,
          fall: 0,
        });
      }
      if (live.current.mode === 'walk' && e.world) {
        const w = walker.current,
          k = keys.current;
        const turn =
          (k.has('arrowleft') || k.has('q') ? 1 : 0) -
          (k.has('arrowright') || k.has('e') ? 1 : 0) +
          pad.current.turn;
        if (turn || pad.current.forward) endTour.current();
        w.yaw += turn * dt * 1.6;
        const forward =
            (k.has('w') || k.has('arrowup') ? 1 : 0) -
            (k.has('s') || k.has('arrowdown') ? 1 : 0) +
            pad.current.forward,
          strafe = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
        let vx = -Math.sin(w.yaw) * forward + Math.cos(w.yaw) * strafe,
          vz = -Math.cos(w.yaw) * forward - Math.sin(w.yaw) * strafe;
        const len = Math.hypot(vx, vz);
        if (len > 0) {
          const speed = (k.has('shift') ? 4.2 : 2.4) * dt;
          vx = (vx / len) * speed;
          vz = (vz / len) * speed;
          if (e.world.free(w.x + vx, w.z, w.feet)) w.x += vx;
          if (e.world.free(w.x, w.z + vz, w.feet)) w.z += vz;
        }
        const ground = e.world.support(w.x, w.z, w.feet);
        if (ground >= w.feet) {
          w.feet += (ground - w.feet) * Math.min(1, dt * 16);
          w.fall = 0;
        } else {
          w.fall = Math.min(w.fall + dt * 14, 9);
          w.feet = Math.max(ground, w.feet - Math.max(w.fall, 3) * dt);
        }
        const pose = [w.x, w.z, w.feet, w.yaw, w.pitch].map((n) => n.toFixed(4)).join();
        const force = dirty.current;
        if (pose === seen && !force) return;
        seen = pose;
        camera.position.set(w.x, w.feet + EYE, w.z);
        camera.rotation.set(w.pitch, w.yaw, 0);
        e.fill.position.set(w.x, w.feet + 2.3, w.z);
        const level = e.world.levelOf(w.feet);
        if (level !== w.level) {
          w.level = level;
          setWalkLevel(level);
          live.current.onLevel?.(level);
        }
        if (++tickCount % 3 === 0 || force) drawMap();
        if (tickCount % 12 === 0 || force) {
          const here = live.current.p.items.find(
            (i) =>
              isRoom(i) &&
              i.floor === w.level &&
              w.x > i.x &&
              w.x < i.x + i.w &&
              w.z > i.z &&
              w.z < i.z + i.d,
          );
          setRoomName(here ? here.name : w.level === 0 && w.feet < 0.5 ? 'Outside' : '');
        }
      } else if (!controls.update() && !dirty.current) return;
      dirty.current = false;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      controls.dispose();
      engine.current?.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      node.removeChild(renderer.domElement);
      engine.current = null;
    };
  }, []);

  const drawMap = () => {
    const canvas = map.current,
      e = engine.current;
    if (!canvas || !e) return;
    const g = canvas.getContext('2d')!;
    const { p } = live.current;
    const w = walker.current;
    const size = canvas.width;
    g.clearRect(0, 0, size, size);
    const rooms = p.items.filter((i) => isRoom(i) && i.floor === w.level);
    const all = p.items.filter(isRoom);
    if (!all.length) return;
    const minX = Math.min(...all.map((i) => i.x)) - 1.5,
      maxX = Math.max(...all.map((i) => i.x + i.w)) + 1.5,
      minZ = Math.min(...all.map((i) => i.z)) - 1.5,
      maxZ = Math.max(...all.map((i) => i.z + i.d)) + 1.5;
    const scale = Math.min(size / (maxX - minX), size / (maxZ - minZ));
    const ox = (size - (maxX - minX) * scale) / 2,
      oz = (size - (maxZ - minZ) * scale) / 2;
    mapFrame.current = { minX, minZ, scale, ox, oz };
    const X = (x: number) => ox + (x - minX) * scale,
      Z = (z: number) => oz + (z - minZ) * scale;
    for (const r of rooms) {
      g.fillStyle = r.color;
      g.fillRect(X(r.x), Z(r.z), r.w * scale, r.d * scale);
      g.strokeStyle = '#56645d';
      g.lineWidth = 1.5;
      g.strokeRect(X(r.x), Z(r.z), r.w * scale, r.d * scale);
    }
    for (const s of p.items.filter((i) => i.kind === 'stairs')) {
      const { lower, upper } = stairLevels(s);
      if (lower !== w.level && upper !== w.level) continue;
      g.fillStyle = 'rgba(199,133,81,0.55)';
      g.fillRect(X(s.x), Z(s.z), s.w * scale, s.d * scale);
    }
    const px = X(w.x),
      pz = Z(w.z);
    const dx = -Math.sin(w.yaw),
      dz = -Math.cos(w.yaw);
    g.fillStyle = 'rgba(207,135,78,0.25)';
    g.beginPath();
    g.moveTo(px, pz);
    const a = Math.atan2(dz, dx);
    g.arc(px, pz, 26, a - 0.55, a + 0.55);
    g.closePath();
    g.fill();
    g.fillStyle = '#cf874e';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, pz, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };

  const endTour = useRef(() => {});
  endTour.current = () => {
    if (!tour.current) return;
    tour.current = null;
    setTouring(false);
  };
  const startTour = () => {
    const world = engine.current?.world;
    if (!world) return;
    const w = walker.current;
    const order = [...p.floors.map((f) => f.level)].sort((a, b) =>
      a >= 0 && b >= 0 ? a - b : a >= 0 ? -1 : b >= 0 ? 1 : b - a,
    );
    const stops: TourStop[] = [];
    let from = { x: w.x, z: w.z };
    for (const level of order) {
      const left = p.items.filter(
        (i) => i.kind === 'room' && i.floor === level && Math.min(i.w, i.d) >= 2.2,
      );
      // Visit the nearest unvisited room next, so the tour flows through the house.
      while (left.length) {
        left.sort(
          (a, b) =>
            Math.hypot(a.x + a.w / 2 - from.x, a.z + a.d / 2 - from.z) -
            Math.hypot(b.x + b.w / 2 - from.x, b.z + b.d / 2 - from.z),
        );
        const r = left.shift()!;
        const cx = r.x + r.w / 2,
          cz = r.z + r.d / 2,
          feet = level * FLOOR_H;
        // Stand in the corner nearest where we came from and look across the room.
        const corners = [
          [r.x + 0.55, r.z + 0.55],
          [r.x + r.w - 0.55, r.z + 0.55],
          [r.x + 0.55, r.z + r.d - 0.55],
          [r.x + r.w - 0.55, r.z + r.d - 0.55],
        ].sort(
          (a, b) =>
            Math.hypot(a[0] - from.x, a[1] - from.z) - Math.hypot(b[0] - from.x, b[1] - from.z),
        );
        const spot = corners.find(
          ([x, z]) =>
            world.free(x, z, feet) && Math.abs(world.support(x, z, feet + 0.1) - feet) < 0.05,
        ) || [cx, cz];
        const dx = cx - spot[0],
          dz = cz - spot[1],
          len = Math.hypot(dx, dz) || 1;
        const drift = Math.min(0.6, len * 0.25);
        const end = [spot[0] + (dx / len) * drift, spot[1] + (dz / len) * drift];
        const ok = world.free(end[0], end[1], feet);
        stops.push({
          x: spot[0],
          z: spot[1],
          dx: ok ? end[0] - spot[0] : 0,
          dz: ok ? end[1] - spot[1] : 0,
          yaw: Math.atan2(-dx, -dz),
          level,
        });
        from = { x: cx, z: cz };
      }
    }
    if (!stops.length) return;
    tour.current = { stops, i: 0, t: 0 };
    setTouring(true);
    setStop(0);
    setHint(false);
    dirty.current = true;
  };
  const spawn = (level: number, at?: { x: number; z: number; yaw: number }) => {
    endTour.current();
    const e = engine.current;
    if (!e?.world) return;
    const world = e.world;
    const w = walker.current;
    let x = 0,
      z = 0,
      yaw = Math.PI,
      found = false;
    const face = (dx: number, dz: number) => Math.atan2(-dx, -dz);
    if (at) {
      x = at.x;
      z = at.z;
      yaw = at.yaw;
      found = true;
    } else if (level === 0) {
      const d = frontDoor(p);
      if (d) {
        x = d.x + d.nx * 2.2;
        z = d.z + d.nz * 2.2;
        yaw = face(-d.nx, -d.nz);
        found = true;
      }
    }
    if (!found) {
      const arriving = p.items.find((i) => i.kind === 'stairs' && stairLevels(i).upper === level);
      const leaving = p.items.find((i) => i.kind === 'stairs' && stairLevels(i).lower === level);
      const s = arriving || leaving;
      if (s) {
        const path = layoutFor(s).path.map(([u, v]) => toWorld(s, u, v));
        const [a, b] = arriving
          ? [path[path.length - 2], path[path.length - 1]]
          : [path[1], path[0]];
        const dx = b[0] - a[0],
          dz = b[1] - a[1],
          len = Math.hypot(dx, dz) || 1;
        x = b[0] + (dx / len) * 0.9;
        z = b[1] + (dz / len) * 0.9;
        yaw = arriving ? face(dx, dz) : face(-dx, -dz);
        found = true;
      }
    }
    if (!found) {
      const rooms = p.items
        .filter((i) => i.kind === 'room' && i.floor === level)
        .sort((a, b) => b.w * b.d - a.w * a.d);
      if (rooms[0]) {
        x = rooms[0].x + rooms[0].w / 2;
        z = rooms[0].z + rooms[0].d / 2;
      }
    }
    // Nudge to the nearest open spot if furniture or a wall is in the way. Indoors, stay inside.
    const feet0 = level * FLOOR_H;
    const rooms = p.items.filter((i) => isRoom(i) && i.floor === level);
    const indoors = !at && !(level === 0 && found && frontDoor(p)) && rooms.length > 0;
    const inRoom = (tx: number, tz: number) =>
      !indoors ||
      rooms.some(
        (r) => tx > r.x + 0.3 && tx < r.x + r.w - 0.3 && tz > r.z + 0.3 && tz < r.z + r.d - 0.3,
      );
    search: for (let r = 0; r < 6; r += 0.25)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const tx = x + Math.cos(a) * r,
          tz = z + Math.sin(a) * r;
        const f = world.support(tx, tz, feet0 + 0.1);
        if (Math.abs(f - feet0) < 0.05 && inRoom(tx, tz) && world.free(tx, tz, f)) {
          x = tx;
          z = tz;
          break search;
        }
        if (r === 0) break;
      }
    Object.assign(w, {
      x,
      z,
      yaw,
      pitch: -0.05,
      feet: world.support(x, z, feet0 + 0.1),
      level,
      fall: 0,
    });
    setWalkLevel(level);
    setHint(true);
    dirty.current = true;
  };

  // Rebuild the house whenever the design or view changes.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.dispose?.();
    if (e.content) e.scene.remove(e.content);
    const built = buildContent(p, mode, floor, evening);
    e.content = built.group;
    e.dispose = built.dispose;
    e.bounds = built.bounds;
    e.scene.add(built.group);
    dirty.current = true;
    e.world = mode === 'walk' ? buildWalkWorld(p) : null;
    // A wider lens indoors keeps rooms from feeling cramped.
    const fov = mode === 'walk' ? 68 : 45;
    if (e.camera.fov !== fov) {
      e.camera.fov = fov;
      e.camera.updateProjectionMatrix();
    }
    const sky = evening ? '#8a8f94' : mode === 'walk' ? '#dfe9ee' : '#e4eae3';
    e.scene.background = new T.Color(sky);
    e.scene.fog = new T.Fog(sky, 60, 160);
    e.renderer.toneMappingExposure = mode === 'walk' ? (evening ? 1.0 : 1.1) : evening ? 1.1 : 1.25;
    e.sun.color.set(evening ? '#ffc792' : '#fff5df');
    e.sun.intensity = evening ? 2.2 : 3;
    e.sun.position.set(-14, evening ? 10 : 26, 12);
    e.hemi.intensity = mode === 'walk' ? (evening ? 0.9 : 1.5) : evening ? 1.1 : 2.1;
    e.ambient.intensity = mode === 'walk' ? (evening ? 0.5 : 0.7) : 0;
    e.fill.intensity = mode === 'walk' ? (evening ? 12 : 6) : 0;
  }, [p, mode, floor, evening]);

  // Frame the camera when switching views.
  const frameCamera = () => {
    const e = engine.current;
    if (!e) return;
    if (live.current.mode === 'walk') {
      spawn(live.current.floor);
      return;
    }
    const c = e.bounds.getCenter(new T.Vector3()),
      size = e.bounds.getSize(new T.Vector3());
    // Back off far enough for the house to fit the narrower of the two view angles.
    const span = Math.max(size.x, size.z, 10);
    const distance = (span * 1.7) / Math.min(1, e.camera.aspect);
    const targetY = mode === 'exterior' ? 1.4 : floor * FLOOR_H;
    const dir = new T.Vector3(0.62, 0.62, 0.78).normalize();
    e.controls.target.set(c.x, targetY, c.z);
    e.camera.position.copy(e.controls.target).addScaledVector(dir, distance);
    framing.current.touched = false;
    dirty.current = true;
    e.camera.rotation.order = 'YXZ';
    e.controls.enabled = true;
    e.controls.update();
  };
  framing.current.frame = frameCamera;
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.controls.enabled = mode !== 'walk';
    if (mode === 'walk') {
      const from = walkFrom.current;
      walkFrom.current = null;
      if (from) {
        spawn(from.level, from);
        if (from.level !== floor) onLevel?.(from.level);
      } else spawn(floor);
    } else frameCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Choosing another floor during a walkthrough takes you there; in the dollhouse it refocuses.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (mode === 'walk') {
      if (floor !== walker.current.level) spawn(floor);
    } else {
      const dy = floor * FLOOR_H - e.controls.target.y;
      if (mode === 'dollhouse' && Math.abs(dy) > 0.01) {
        e.controls.target.y += dy;
        e.camera.position.y += dy;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);
  useEffect(() => {
    if (!hint || mode !== 'walk') return;
    const t = setTimeout(() => setHint(false), 7000);
    return () => clearTimeout(t);
  }, [hint, mode]);

  const snapshot = () => {
    const e = engine.current;
    if (!e) return;
    e.renderer.render(e.scene, e.camera);
    const a = document.createElement('a');
    a.href = e.renderer.domElement.toDataURL('image/png');
    a.download = `${p.name.replace(/[^a-z0-9_-]/gi, '-')}-${mode}.png`;
    a.click();
    onNotice('Your 3D snapshot has been exported.');
  };
  const hold = (key: 'forward' | 'turn', value: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      endTour.current();
      pad.current[key] = value;
      setHint(false);
    },
    onPointerUp: () => (pad.current[key] = 0),
    onPointerCancel: () => (pad.current[key] = 0),
    onLostPointerCapture: () => (pad.current[key] = 0),
  });
  const levels = [...p.floors].sort((a, b) => b.level - a.level);
  return (
    <div className={`scene-wrap ${mode === 'walk' ? 'walking' : ''}`}>
      <div ref={host} className="scene" data-testid="three-scene" />
      {fading && <div className="walk-fade" key={stop} />}
      {error && (
        <div className="scene-error">
          3D needs WebGL. Try enabling hardware acceleration in your browser. Your 2D plan is still
          available.
        </div>
      )}
      {mode !== 'walk' ? (
        <>
          <div className="panel-corner">
            <span className="live-dot" />
            LIVE 3D
            <span className="muted">/ {mode === 'exterior' ? 'Exterior' : 'Dollhouse'}</span>
          </div>
          <div className="scene-controls">
            <div className="segmented">
              <button
                className={mode === 'dollhouse' ? 'active' : ''}
                onClick={() => onMode('dollhouse')}
              >
                <Box size={14} />
                Dollhouse
              </button>
              <button
                className={mode === 'exterior' ? 'active' : ''}
                onClick={() => onMode('exterior')}
              >
                <Home size={14} />
                Exterior
              </button>
            </div>
            <button
              className="icon-button glass"
              aria-label="Toggle golden hour"
              title="Toggle golden hour"
              onClick={() => setEvening((v) => !v)}
            >
              <Sun size={17} />
            </button>
          </div>
          <div className="scene-bottom">
            <button
              className="icon-button glass"
              aria-label="Reset 3D camera"
              title="Reset camera"
              onClick={frameCamera}
            >
              <RotateCcw size={17} />
            </button>
            <span>Drag to orbit · Click to select · Double-click to walk in</span>
            <button
              className="icon-button glass"
              aria-label="Export 3D image"
              title="Export a 3D image"
              onClick={snapshot}
            >
              <Camera size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="walk-top">
            <button className="walk-exit" onClick={() => onMode('dollhouse')}>
              <X size={16} />
              Back to editing <kbd>Esc</kbd>
            </button>
            <div className="walk-levels" role="group" aria-label="Go to floor">
              {levels.map((f) => (
                <button
                  key={f.level}
                  className={walkLevel === f.level ? 'active' : ''}
                  onClick={() => {
                    spawn(f.level);
                    onLevel?.(f.level);
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="walk-tools">
              <button
                className={`walk-tour ${touring ? 'on' : ''}`}
                onClick={() => (touring ? endTour.current() : startTour())}
                title={
                  touring
                    ? 'Stop the tour and walk yourself'
                    : 'Glide through each room, hands-free'
                }
              >
                {touring ? <Pause size={15} /> : <Play size={15} />}
                {touring ? 'Stop tour' : 'Tour'}
              </button>
              <button
                className="icon-button glass"
                aria-label="Toggle golden hour"
                title="Golden hour"
                onClick={() => setEvening((v) => !v)}
              >
                <Sun size={17} />
              </button>
              <button
                className="icon-button glass"
                aria-label="Export 3D image"
                title="Save a picture of this view"
                onClick={snapshot}
              >
                <Camera size={18} />
              </button>
              <button
                className="icon-button glass"
                aria-label="Start the tour over"
                title="Start over at the front door"
                onClick={() => spawn(0)}
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </div>
          {hint && (
            <div className="walk-hint" role="status">
              <Footprints size={16} />
              <strong>You're home.</strong>
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> walk · drag to look · <kbd>Shift</kbd> hurry · walk onto stairs to
                change floors
              </span>
            </div>
          )}
          {roomName && (
            <div className="walk-room" key={roomName}>
              {roomName}
            </div>
          )}
          <div className="walk-map" title="Click the map to jump there">
            <canvas
              ref={map}
              width={170}
              height={170}
              aria-label="Map of this floor. Click to jump there."
              onPointerDown={(e) => {
                const f = mapFrame.current,
                  world = engine.current?.world;
                if (!f || !world) return;
                const r = e.currentTarget.getBoundingClientRect();
                const k = e.currentTarget.width / r.width;
                const x = ((e.clientX - r.left) * k - f.ox) / f.scale + f.minX,
                  z = ((e.clientY - r.top) * k - f.oz) / f.scale + f.minZ;
                const w = walker.current;
                const feet = world.support(x, z, w.level * FLOOR_H + 0.1);
                if (Math.abs(feet - w.level * FLOOR_H) < 0.3 && world.free(x, z, feet)) {
                  Object.assign(w, { x, z, feet, fall: 0 });
                  setHint(false);
                }
              }}
            />
            <span>{floorName(p, walkLevel)}</span>
          </div>
          <div className="walk-pad" aria-label="Movement controls">
            <button aria-label="Walk forward" {...hold('forward', 1)}>
              <ArrowUp size={20} />
            </button>
            <button aria-label="Turn left" {...hold('turn', 1)}>
              <ArrowLeft size={20} />
            </button>
            <button aria-label="Walk backward" {...hold('forward', -1)}>
              <ArrowDown size={20} />
            </button>
            <button aria-label="Turn right" {...hold('turn', -1)}>
              <ArrowRight size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
