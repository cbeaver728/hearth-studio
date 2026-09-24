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
  ceilingHeight,
  floorName,
  hasFloor,
  WALL_H,
  isPassable,
  openCeilings,
  FLOOR_H,
  isOutside,
  isRoom,
  stairLevels,
  type FloorFinish,
  type Item,
  type Project,
  type RoofFinish,
  type Siding,
  type Wallpaper,
  KNEE,
  CORNERS,
  bayDepth,
} from './model';
import { capeCeilingAt, crossRange, planRoof, roofOver } from './roof';
import { buildRoofs, sheet, uprightPanel } from './roof3d';
import {
  layoutFor,
  localSize,
  RAIL_H,
  RISE,
  subtractRects,
  toWorld,
  type Banister,
  type Rect,
  type Segment,
} from './stairs';
import { curvePieces } from './curve';
import { arcPieces, cornerArc, cornerArcs } from './corners';
import { buildWalkWorld, EYE, landingRails, stairGuards, stairHoles, type WalkWorld } from './walk';
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

// Grayscale floor patterns, tinted by each room's color. Each covers 1.6 m of floor.
const floorTextures = new Map<FloorFinish, T.CanvasTexture>();
function floorTexture(finish: FloorFinish) {
  const hit = floorTextures.get(finish);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  if (finish === 'wood') {
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
  } else if (finish === 'tile') {
    // 40 cm tiles with grout lines.
    for (let n = 0; n < 4; n++)
      for (let m = 0; m < 4; m++) {
        g.fillStyle = `rgba(0,0,0,${0.02 + ((n * 3 + m * 5) % 4) * 0.01})`;
        g.fillRect(n * 64, m * 64, 64, 64);
      }
    g.fillStyle = 'rgba(80,80,80,0.35)';
    for (let n = 0; n < 4; n++) {
      g.fillRect(n * 64, 0, 2, 256);
      g.fillRect(0, n * 64, 256, 2);
    }
  } else if (finish === 'carpet') {
    // A soft, even speckle.
    for (let n = 0; n < 5000; n++) {
      const x = (n * 73) % 256,
        y = (n * 151 + ((n * n) % 97)) % 256;
      g.fillStyle = `rgba(0,0,0,${0.02 + (n % 5) * 0.012})`;
      g.fillRect(x, y, 2, 2);
    }
  } else {
    // Large stone slabs, offset like a running bond.
    for (let row = 0; row < 3; row++) {
      const y = Math.round(row * 85.3);
      const off = row % 2 ? 64 : 0;
      g.fillStyle = `rgba(60,55,50,${0.03 + row * 0.02})`;
      g.fillRect(0, y, 256, 86);
      g.fillStyle = 'rgba(70,65,60,0.35)';
      g.fillRect(0, y, 256, 2);
      g.fillRect(off, y, 2, 86);
      g.fillRect(off + 128, y, 2, 86);
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  floorTextures.set(finish, t);
  return t;
}

// Outside wall finishes, drawn once and tiled over the walls. Each covers SIDING_TILE meters.
const SIDING_TILE = 1.6;
const sidingTextures = new Map<string, T.CanvasTexture>();
/** A repeating panel of the chosen material in the chosen color; null for plain paint. */
function sidingTexture(siding: Siding, color: string): T.CanvasTexture | null {
  if (!siding || siding === 'painted') return null;
  const key = siding + color;
  const hit = sidingTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  const shade = (a: number) => `rgba(28,22,16,${a})`;
  const light = (a: number) => `rgba(255,252,245,${a})`;
  if (siding === 'lap') {
    // Horizontal boards about 7 inches to the weather, each with a shadow under its edge.
    for (let n = 0; n < 8; n++) {
      const y = n * 32;
      g.fillStyle = shade(0.05 + (n % 3) * 0.012);
      g.fillRect(0, y, 256, 32);
      g.fillStyle = shade(0.22);
      g.fillRect(0, y + 29, 256, 3);
      g.fillStyle = light(0.3);
      g.fillRect(0, y, 256, 1.5);
    }
  } else if (siding === 'board') {
    // Wide boards with a batten over every joint.
    for (let n = 0; n < 6; n++) {
      const x = n * 42.6;
      g.fillStyle = shade(0.05 + (n % 2) * 0.03);
      g.fillRect(x, 0, 42.6, 256);
      g.fillStyle = shade(0.2);
      g.fillRect(x - 5, 0, 4, 256);
      g.fillStyle = light(0.35);
      g.fillRect(x + 5, 0, 5, 256);
      g.fillRect(x - 1, 0, 1.5, 256);
    }
  } else if (siding === 'shingle') {
    // Staggered shakes, each a slightly different tone.
    for (let row = 0; row < 8; row++) {
      const y = row * 32,
        off = (row % 2) * 21;
      for (let n = -1; n < 7; n++) {
        const x = off + n * 42;
        g.fillStyle = shade(0.03 + ((row * 7 + n * 5) % 5) * 0.022);
        g.fillRect(x + 1, y, 40, 30);
        g.fillStyle = shade(0.28);
        g.fillRect(x, y, 1.5, 30);
        g.fillRect(x, y + 29, 42, 3);
      }
    }
  } else if (siding === 'brick') {
    // Running bond: pale mortar, bricks a little different from each other.
    g.fillStyle = '#e7e2d6';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row++) {
      const y = row * 16,
        off = (row % 2) * 26;
      for (let n = -1; n < 6; n++) {
        g.fillStyle = color;
        g.globalAlpha = 0.78 + ((row * 5 + n * 3) % 5) * 0.055;
        g.fillRect(off + n * 52 + 2, y + 2, 48, 12.4);
        g.globalAlpha = 1;
        g.fillStyle = shade(0.08 + ((row + n) % 3) * 0.03);
        g.fillRect(off + n * 52 + 2, y + 10.4, 48, 4);
      }
    }
  } else if (siding === 'stone') {
    // Rough courses of cut stone with deep joints.
    g.fillStyle = shade(0.4);
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let row = 0; row < 6; row++) {
      const y = row * 42.6;
      let x = -20 * rnd();
      while (x < 256) {
        const w = 40 + rnd() * 46;
        g.fillStyle = color;
        g.globalAlpha = 0.72 + rnd() * 0.28;
        g.fillRect(x + 3, y + 3, w - 5, 37);
        g.globalAlpha = 1;
        g.fillStyle = light(0.12 + rnd() * 0.14);
        g.fillRect(x + 4, y + 4, w - 7, 6);
        x += w;
      }
    }
  } else {
    // Stucco: a fine hand-troweled speckle.
    for (let n = 0; n < 9000; n++) {
      const x = (n * 97 + ((n * n) % 131)) % 256,
        y = (n * 53 + ((n * n * 3) % 173)) % 256;
      g.fillStyle = n % 3 ? shade(0.02 + (n % 4) * 0.012) : light(0.05 + (n % 3) * 0.02);
      g.fillRect(x, y, 3, 2);
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  sidingTextures.set(key, t);
  return t;
}

// Roof coverings, tiled like the wall finishes. Each panel covers ROOF_TILE meters.
const ROOF_TILE = 1.4;
const roofTextures = new Map<string, T.CanvasTexture>();
function roofTexture(finish: RoofFinish, color: string): T.CanvasTexture | null {
  if (finish === 'plain') return null;
  const key = finish + color;
  const hit = roofTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  const shade = (a: number) => `rgba(16,16,18,${a})`;
  const light = (a: number) => `rgba(255,255,250,${a})`;
  if (finish === 'shingle') {
    // Courses of tabs, offset row by row.
    for (let row = 0; row < 10; row++) {
      const y = row * 25.6,
        off = (row % 2) * 16;
      for (let n = -1; n < 9; n++) {
        g.fillStyle = shade(0.04 + ((row * 5 + n * 7) % 5) * 0.03);
        g.fillRect(off + n * 32 + 1, y, 30, 24);
      }
      g.fillStyle = shade(0.3);
      g.fillRect(0, y + 23, 256, 3);
    }
  } else if (finish === 'metal') {
    // Standing seams every 40 cm, catching the light on one side.
    for (let n = 0; n < 7; n++) {
      const x = n * 36.6;
      g.fillStyle = light(0.16);
      g.fillRect(x + 2, 0, 8, 256);
      g.fillStyle = shade(0.26);
      g.fillRect(x, 0, 3, 256);
    }
  } else {
    // Barrel tiles: rounded ridges in courses.
    for (let n = 0; n < 8; n++) {
      const x = n * 32;
      const grad = g.createLinearGradient(x, 0, x + 32, 0);
      grad.addColorStop(0, shade(0.28));
      grad.addColorStop(0.45, light(0.16));
      grad.addColorStop(1, shade(0.28));
      g.fillStyle = grad;
      g.fillRect(x, 0, 32, 256);
    }
    for (let row = 0; row < 5; row++) {
      g.fillStyle = shade(0.22);
      g.fillRect(0, row * 51.2 + 47, 256, 5);
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  roofTextures.set(key, t);
  return t;
}

// Wallpapers and wainscot, drawn over a room's own colors on the same 1.6 m tiles as siding.
const wallTextures = new Map<string, T.CanvasTexture>();
function wallTexture(kind: Wallpaper | 'wainscot', color: string): T.CanvasTexture {
  const key = kind + color;
  const hit = wallTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  const shade = (a: number) => `rgba(30,26,40,${a})`;
  const light = (a: number) => `rgba(255,255,250,${a})`;
  if (kind === 'stripes') {
    // Wide and narrow stripes, like an old-fashioned papered dining room.
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = light(0.28);
      g.fillRect(x, 0, 12, 256);
      g.fillStyle = shade(0.12);
      g.fillRect(x + 20, 0, 3, 256);
    }
  } else if (kind === 'check') {
    for (let n = 0; n < 256; n += 32) {
      g.fillStyle = shade(0.16);
      g.fillRect(n, 0, 3, 256);
      g.fillRect(0, n, 256, 3);
      g.fillStyle = light(0.14);
      g.fillRect(n + 16, 0, 2, 256);
      g.fillRect(0, n + 16, 256, 2);
    }
  } else if (kind === 'floral') {
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const x = col * 32 + (row % 2) * 16 + 16,
          y = row * 32 + 16;
        g.fillStyle = light(0.4);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5, 3.4, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = shade(0.2);
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fill();
      }
  } else if (kind === 'wainscot') {
    // Raised panels in the bottom 0.95 m of the tile: two to a tile, with a lit and a shaded edge.
    const top = 256 - Math.round((0.95 / 1.6) * 256);
    g.fillStyle = shade(0.1);
    g.fillRect(0, top, 256, 3);
    for (const x of [14, 142]) {
      const y0 = top + 14,
        y1 = 256 - 22,
        w = 100;
      g.fillStyle = shade(0.16);
      g.fillRect(x, y0, w, 3);
      g.fillRect(x, y0, 3, y1 - y0);
      g.fillStyle = light(0.45);
      g.fillRect(x, y1 - 3, w, 3);
      g.fillRect(x + w - 3, y0, 3, y1 - y0);
      g.fillStyle = light(0.12);
      g.fillRect(x + 8, y0 + 8, w - 16, y1 - y0 - 16);
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  wallTextures.set(key, t);
  return t;
}

/** Builds every mesh for the current project and view. */
function buildContent(p: Project, mode: SceneMode, floor: number, evening: boolean) {
  const group = new T.Group();
  const autoDoors: { closed: T.Mesh; open: T.Mesh; x: number; z: number }[] = [];
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

  // The outside finish: a tiled material for brick and the rest, plain paint otherwise.
  const sidingMap = sidingTexture(p.siding || 'painted', p.exterior);
  const sidingMat = (double = false) => {
    if (!sidingMap) return mat(p.exterior, double ? { double: true } : {});
    const key = `siding:${p.siding}:${p.exterior}:${double}`;
    let m = materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({
        map: sidingMap,
        roughness: p.siding === 'stucco' || p.siding === 'stone' ? 0.95 : 0.85,
        side: double ? T.DoubleSide : T.FrontSide,
      });
      materials.set(key, m);
    }
    return m;
  };
  /** Tiles a box's texture at real-world size, carrying on from where the last piece left off. */
  const tileUv = (mesh: T.Mesh | null, su: number, sv: number, ou = 0, ov = 0) => {
    if (!mesh || !sidingMap) return;
    const uv = mesh.geometry.attributes.uv as T.BufferAttribute;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * su + ou, uv.getY(n) * sv + ov);
    uv.needsUpdate = true;
  };

  const levels = p.floors.map((f) => f.level).sort((a, b) => a - b);
  const plan = planRoof(p);
  const capeLevels = new Set(plan.wings.filter((w) => w.cape).map((w) => w.level));
  /** The inside face of a wall in a room: its paint, papered if it has a paper. */
  const wallMat = (room: Item) => {
    const color = room.wallColor || p.interior || '#f4efe6';
    if (!room.wallpaper || room.wallpaper === 'plain') return mat(color);
    const key = `paper:${room.wallpaper}:${color}`;
    let m = materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ map: wallTexture(room.wallpaper, color), roughness: 0.85 });
      materials.set(key, m);
    }
    return m;
  };
  const wainscotMat = (color: string) => {
    const key = `wainscot:${color}`;
    let m = materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ map: wallTexture('wainscot', color), roughness: 0.7 });
      materials.set(key, m);
    }
    return m;
  };
  const roofMaterial = () => {
    const roofMap = roofTexture(p.roofFinish || 'shingle', p.roof);
    const roofKey = `roof:${p.roofFinish}:${p.roof}`;
    let m = materials.get(roofKey);
    if (!m) {
      m = roofMap
        ? new T.MeshStandardMaterial({
            map: roofMap,
            roughness: p.roofFinish === 'metal' ? 0.45 : 0.9,
            metalness: p.roofFinish === 'metal' ? 0.35 : 0,
            side: T.DoubleSide,
          })
        : mat(p.roof, { double: true });
      materials.set(roofKey, m);
    }
    return m;
  };
  /** Wall textures follow the wall in world space, so patterns carry on from piece to piece. */
  const wallUv = (mesh: T.Mesh | null, axis: 'x' | 'z') => {
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position as T.BufferAttribute;
    const uv = mesh.geometry.attributes.uv as T.BufferAttribute;
    for (let n = 0; n < uv.count; n++) {
      const wx = pos.getX(n) + mesh.position.x,
        wy = pos.getY(n) + mesh.position.y,
        wz = pos.getZ(n) + mesh.position.z;
      uv.setXY(n, (axis === 'x' ? wx : wz) / SIDING_TILE, wy / SIDING_TILE);
    }
    uv.needsUpdate = true;
  };
  const shown =
    mode === 'walk'
      ? levels
      : mode === 'exterior'
        ? levels.filter((l) => l >= 0)
        : floor >= 0
          ? levels.filter((l) => l >= 0 && l <= floor)
          : [floor];
  const showsOutside = mode !== 'dollhouse' || floor >= 0;
  const interior = p.interior || '#f4efe6';
  const roomsOn = (level: number) => p.items.filter((i) => isRoom(i) && i.floor === level);
  // Where the roof sits on a level: as high as that level's tallest ceiling.
  const topLevel = Math.max(0, ...levels.filter((l) => l >= 0));
  const roofBase = (level: number) => {
    const rooms = roomsOn(level);
    return rooms.length ? Math.max(...rooms.map((r) => ceilingHeight(p, r))) : WALL_H;
  };
  /** Outside walls carry on up to the roof, so a tall room next door leaves no gap. */
  const wallHeight = (w: { floor: number; height: number }, outside: boolean) => {
    if (mode === 'dollhouse' && w.floor === floor) return 1.15;
    if (!outside) return w.height;
    const opensUp = w.height > WALL_H + 0.1 && hasFloor(p, w.floor + 1);
    const level = w.floor + (opensUp ? 1 : 0);
    if (level !== topLevel) return w.height;
    return Math.max(w.height, (opensUp ? FLOOR_H : 0) + roofBase(level));
  };
  const insideRoom = (level: number, x: number, z: number) =>
    roomsOn(level).find((r) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);

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
          if (i.fenceStyle === 'picket') {
            for (const h of [0.34, 0.82])
              along
                ? box(x, h, z, len, 0.09, 0.08, i.color)
                : box(x, h, z, 0.08, 0.09, len, i.color);
            for (let t = 0; t <= len - 0.06; t += 0.25) {
              const at = Math.min(len - 0.06, t + 0.04);
              const px = along ? i.x + at : x;
              const pz = along ? z : i.z + at;
              box(px, 0.5, pz, along ? 0.13 : 0.09, 1, along ? 0.09 : 0.13, i.color);
              const tip = new T.Mesh(new T.ConeGeometry(0.095, 0.18, 4), mat(i.color));
              tip.rotation.y = Math.PI / 4;
              tip.position.set(px, 1.08, pz);
              add(tip);
            }
            for (const at of [0, len])
              along
                ? box(i.x + at, 0.62, z, 0.15, 1.24, 0.15, i.color)
                : box(x, 0.62, i.z + at, 0.15, 1.24, 0.15, i.color);
          } else {
            for (let t = 0; t < len; t += 0.18)
              along
                ? box(i.x + t + 0.06, 0.65, z, 0.12, 1.3, Math.max(0.06, i.d), i.color)
                : box(x, 0.65, i.z + t + 0.06, Math.max(0.06, i.w), 1.3, 0.12, i.color);
          }
          break;
        }
      }
    }

  // Floors, with openings where stairs arrive.
  for (const level of shown) {
    const y = level * FLOOR_H,
      holes = [...stairHoles(p, level), ...openCeilings(p, level)];
    for (const r of roomsOn(level)) {
      const arcs = CORNERS.map((c) => cornerArc(r, c)).filter(Boolean) as NonNullable<
        ReturnType<typeof cornerArc>
      >[];
      const corners = arcs.map((a) => ({
        x0: Math.min(a.cx, a.cx + Math.cos(a.a0 + Math.PI / 4) * a.r * Math.SQRT2),
        x1: Math.max(a.cx, a.cx + Math.cos(a.a0 + Math.PI / 4) * a.r * Math.SQRT2),
        z0: Math.min(a.cz, a.cz + Math.sin(a.a0 + Math.PI / 4) * a.r * Math.SQRT2),
        z1: Math.max(a.cz, a.cz + Math.sin(a.a0 + Math.PI / 4) * a.r * Math.SQRT2),
      }));
      for (const a of arcs) {
        // CircleGeometry sweeps counter-clockwise in its own plane, which lies flat here with
        // its y axis along -z; so the plan angle a becomes -a.
        const disc = new T.CircleGeometry(a.r, 12, -a.a1, a.a1 - a.a0);
        disc.rotateX(-Math.PI / 2);
        const pos = disc.attributes.position as T.BufferAttribute;
        const uv = disc.attributes.uv as T.BufferAttribute;
        for (let n = 0; n < uv.count; n++)
          uv.setXY(n, (pos.getX(n) + a.cx) / 1.6, (pos.getZ(n) + a.cz) / 1.6);
        const m = add(
          new T.Mesh(
            disc,
            r.kind === 'room'
              ? new T.MeshStandardMaterial({
                  color: r.color,
                  map: floorTexture(r.finish || 'wood'),
                  roughness: r.finish === 'tile' ? 0.35 : r.finish === 'carpet' ? 0.95 : 0.7,
                })
              : mat(r.color),
          ),
          false,
        );
        m.position.set(a.cx, y, a.cz);
        m.userData.itemId = r.id;
        const base = add(
          new T.Mesh(
            new T.CylinderGeometry(a.r, a.r, 0.17, 12, 1, false, Math.PI / 2 - a.a1, a.a1 - a.a0),
            mat(level === levels[0] || mode !== 'walk' ? tone(r.color, -20) : '#f3f0ea'),
          ),
        );
        base.position.set(a.cx, y - 0.095, a.cz);
      }
      for (const piece of subtractRects({ x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d }, [
        ...holes,
        ...corners,
      ])) {
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
              ? new T.MeshStandardMaterial({
                  color: r.color,
                  map: floorTexture(r.finish || 'wood'),
                  roughness: r.finish === 'tile' ? 0.35 : r.finish === 'carpet' ? 0.95 : 0.7,
                })
              : mat(r.color),
          ),
          false,
        );
        m.position.set((piece.x0 + piece.x1) / 2, y, (piece.z0 + piece.z1) / 2);
        m.userData.itemId = r.id;
      }
    }
  }

  // Walls: exterior finish outside, interior paint inside, trim at every opening.
  const trim = '#fbf8f1';
  for (const wall of buildWalls(p).filter((w) => shown.includes(w.floor))) {
    const y = wall.floor * FLOOR_H,
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
    const height = wallHeight(wall, !sideA || !sideB);
    const neg = sideA ? wallMat(sideA) : sidingMat(),
      pos = sideB ? wallMat(sideB) : sidingMat(),
      edge = mat(mode === 'dollhouse' ? '#f5f0e5' : interior);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
    const faces =
      wall.axis === 'x' ? [edge, edge, edge, edge, pos, neg] : [pos, neg, edge, edge, edge, edge];
    // Paneled wainscot below a chair rail, on whichever side has it.
    const WAIN = 0.95;
    const wainA = sideA?.wainscot,
      wainB = sideB?.wainscot;
    const negLow = wainA ? wainscotMat(wainA) : neg,
      posLow = wainB ? wainscotMat(wainB) : pos;
    const lowFaces =
      wall.axis === 'x'
        ? [edge, edge, edge, edge, posLow, negLow]
        : [posLow, negLow, edge, edge, edge, edge];
    // In a half storey, walls stop at the sloping ceiling.
    const sloped = capeLevels.has(wall.floor);
    const ceilingAt = (t: number) =>
      capeCeilingAt(
        plan,
        wall.floor,
        wall.axis === 'x' ? t : wall.line,
        wall.axis === 'x' ? wall.line : t,
      );
    const solid = (
      a: number,
      b: number,
      bottom: number,
      top: number,
      material: T.Material | T.Material[] | string,
      t: number,
    ): T.Mesh | null => {
      if (sloped && top > KNEE - 0.01 && b - a > 0.005) {
        const ts: number[] = [];
        for (let u = a; u < b - 0.02; u += 0.1) ts.push(u);
        ts.push(b);
        const hs = ts.map((u) => Math.min(top, ceilingAt(u) ?? top));
        if (hs.some((h) => h < top - 0.005)) {
          if (hs.every((h) => h <= bottom + 0.02)) return null;
          const outline: [number, number][] = [
            [a, y + bottom],
            [b, y + bottom],
            ...ts
              .map((u, n) => [u, y + Math.max(bottom + 0.02, hs[n])] as [number, number])
              .reverse(),
          ];
          const halves: [number, number, T.Material][] = Array.isArray(material)
            ? [
                [-t / 2, 0, material === lowFaces ? negLow : neg],
                [0, t / 2, material === lowFaces ? posLow : pos],
              ]
            : [[-t / 2, t / 2, typeof material === 'string' ? mat(material) : material]];
          let first: T.Mesh | null = null;
          for (const [from, to, m] of halves) {
            const mesh = uprightPanel(outline, [], wall.axis, wall.line, from, to, m, SIDING_TILE);
            add(mesh);
            first ||= mesh;
          }
          return first;
        }
      }
      const mesh =
        wall.axis === 'x'
          ? box((a + b) / 2, y + (bottom + top) / 2, wall.line, b - a, top - bottom, t, material)
          : box(wall.line, y + (bottom + top) / 2, (a + b) / 2, t, top - bottom, b - a, material);
      if (Array.isArray(material)) wallUv(mesh, wall.axis);
      return mesh;
    };
    const piece = (
      a: number,
      b: number,
      bottom: number,
      top: number,
      material: T.Material | T.Material[] | string = faces,
      t = thick,
    ) => {
      if (material !== faces || !(wainA || wainB) || bottom >= WAIN - 0.01)
        return solid(a, b, bottom, top, material, t);
      const low = solid(a, b, bottom, Math.min(top, WAIN), lowFaces, t);
      if (top > WAIN + 0.01) {
        solid(a, b, WAIN, top, faces, t);
        // The chair rail.
        for (const [color, sign] of [
          [wainA, -1],
          [wainB, 1],
        ] as const) {
          if (!color) continue;
          const at = wall.line + sign * (t / 2 + 0.012);
          // Under a sloping ceiling the rail stops where the wall drops below it.
          const spans: [number, number][] = [];
          for (let u = a; u < b - 1e-6; u += 0.1) {
            const v = Math.min(b, u + 0.1);
            if (sloped && (ceilingAt((u + v) / 2) ?? top) < WAIN + 0.06) continue;
            const last = spans.at(-1);
            if (last && Math.abs(last[1] - u) < 1e-6) last[1] = v;
            else spans.push([u, v]);
          }
          for (const [u, v] of spans)
            if (wall.axis === 'x')
              box((u + v) / 2, y + WAIN, at, v - u, 0.05, 0.03, tone(color, 14));
            else box(at, y + WAIN, (u + v) / 2, 0.03, 0.05, v - u, tone(color, 14));
        }
      }
      return low;
    };
    /** A box set off from the wall line by `off` across it, spanning u0..u1 along it. */
    const across = (
      u0: number,
      u1: number,
      h0: number,
      h1: number,
      off: number,
      t: number,
      material: string | T.Material,
    ) =>
      wall.axis === 'x'
        ? box((u0 + u1) / 2, y + (h0 + h1) / 2, wall.line + off, u1 - u0, h1 - h0, t, material)
        : box(wall.line + off, y + (h0 + h1) / 2, (u0 + u1) / 2, t, h1 - h0, u1 - u0, material);
    /** A flat outline in (along, height), with holes, through the wall or set off from it. */
    const flat = (
      outline: [number, number][],
      holes: [number, number][][],
      from: number,
      to: number,
      material: T.Material,
    ) => {
      const lift = (pts: [number, number][]) => pts.map(([u, h]) => [u, y + h] as [number, number]);
      add(
        uprightPanel(
          lift(outline),
          holes.map(lift),
          wall.axis,
          wall.line,
          from,
          to,
          material,
          SIDING_TILE,
        ),
      );
    };
    const ring = (cx: number, cy: number, r: number, from = 0, to = Math.PI * 2, n = 28, ry = r) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const t = from + ((to - from) * k) / n;
        return [cx + Math.cos(t) * r, cy + Math.sin(t) * ry] as [number, number];
      });
    const drawWindow = (
      open: (typeof wall.openings)[number],
      a: number,
      b: number,
      bottom: number,
      top: number,
    ) => {
      const style = open.style || 'classic';
      const glass = mat(evening ? '#f3d19a' : '#a9d0d6', {
        opacity: evening ? 0.8 : 0.3,
        rough: 0.1,
        metal: 0.1,
        emissive: evening ? '#be874a' : undefined,
      });
      const frameColor = p.windowFrames === 'white' ? '#f7f4ec' : '#52675f';
      const frame = mat(frameColor);
      const mid = (a + b) / 2,
        w = b - a;
      // Round and arched windows cut their shape out of the wall above the sill.
      const r = Math.min(w / 2, (top - bottom) / 2);
      const cy = (bottom + top) / 2;
      // Arches are half-round, or flatter when the window is wide.
      const rise = Math.min(w / 2, top - bottom - 0.35);
      const spring = top - rise;
      let shape: [number, number][];
      if (style === 'round') {
        shape = ring(mid, cy, r).reverse();
        flat(
          [
            [a, bottom],
            [b, bottom],
            [b, top],
            [a, top],
          ],
          [shape],
          -thick / 2,
          0,
          neg,
        );
        flat(
          [
            [a, bottom],
            [b, bottom],
            [b, top],
            [a, top],
          ],
          [shape],
          0,
          thick / 2,
          pos,
        );
      } else if (style === 'arched') {
        const arc = ring(mid, spring, w / 2, 0, Math.PI, 24, rise);
        shape = [[a, bottom], [b, bottom], ...arc, [a, bottom]];
        shape.pop();
        // The corners above the arch are wall.
        const spandrel: [number, number][] = [
          [b, spring],
          [b, top],
          [a, top],
          ...arc.slice().reverse(),
        ];
        spandrel.pop();
        if (top > spring) {
          const cut = spandrel.map(([u, h]) => [u, Math.min(h, top)] as [number, number]);
          flat(cut, [], -thick / 2, 0, neg);
          flat(cut, [], 0, thick / 2, pos);
        }
      } else
        shape = [
          [a, bottom],
          [b, bottom],
          [b, top],
          [a, top],
        ];
      // Glass.
      flat(shape, [], -0.015, 0.015, glass);
      // Frames and bars.
      const bar = (u0: number, u1: number, h0: number, h1: number, t = 0.06) =>
        across(u0, u1, h0, h1, 0, t, frameColor);
      if (style === 'round') {
        const outer = ring(mid, cy, r);
        const inner = ring(mid, cy, r - 0.06).reverse();
        flat(outer, [inner], -0.035, 0.035, frame);
        if (r > 0.3) {
          bar(mid - 0.02, mid + 0.02, cy - r, cy + r, 0.05);
          bar(mid - r, mid + r, cy - 0.02, cy + 0.02, 0.05);
        }
      } else if (style === 'arched') {
        const outer = ring(mid, spring, w / 2, 0, Math.PI, 24, rise);
        const inner = ring(mid, spring, w / 2 - 0.06, 0, Math.PI, 24, rise - 0.06).reverse();
        flat([...outer, ...inner], [], -0.035, 0.035, frame);
        for (const u of [a, b]) bar(u - 0.03, u + 0.03, bottom, spring);
        bar(a, b, spring - 0.03, spring + 0.03, 0.07);
        bar(mid - 0.025, mid + 0.025, bottom, top);
        // A fan of bars in the half-round.
        for (const t of [Math.PI / 4, (Math.PI * 3) / 4]) {
          const len = Math.hypot((Math.cos(t) * w) / 2, Math.sin(t) * rise) - 0.05;
          const m = across(mid - 0.02, mid + 0.02, spring, spring + len, 0, 0.05, frameColor);
          if (m) {
            const pivot = y + spring;
            m.geometry.translate(0, len / 2, 0);
            m.position.y = pivot;
            if (wall.axis === 'x') m.rotation.z = Math.PI / 2 - t;
            else m.rotation.x = -(Math.PI / 2 - t);
          }
        }
      } else {
        for (const u of [a, b]) bar(u - 0.03, u + 0.03, bottom, top);
        bar(a, b, top - 0.05, top);
        if (style === 'classic' || style === 'grid') {
          bar(mid - 0.03, mid + 0.03, bottom, top);
          bar(a, b, cy - 0.025, cy + 0.025, 0.07);
        }
        if (style === 'grid') {
          for (const u of [a + w / 4, b - w / 4]) bar(u - 0.015, u + 0.015, bottom, top, 0.05);
          for (const h of [bottom + (top - bottom) / 4, top - (top - bottom) / 4])
            bar(a, b, h - 0.015, h + 0.015, 0.05);
        }
      }
      if (style !== 'round')
        across(a - 0.04, b + 0.04, bottom - 0.04, bottom, 0, thick + 0.08, trim);

      // Curtains, on whichever sides have a room.
      if (open.curtains) {
        const cloth = mat(open.curtains, { rough: 0.95 });
        const head = style === 'round' ? cy + r : top;
        const low = style === 'round' ? cy - r : bottom;
        for (const [room, sign] of [
          [sideA, -1],
          [sideB, 1],
        ] as const) {
          if (!room) continue;
          const off = sign * (thick / 2 + 0.07);
          across(
            a - 0.28,
            b + 0.28,
            head + 0.14,
            head + 0.17,
            sign * (thick / 2 + 0.1),
            0.03,
            '#b8a27a',
          );
          across(a - 0.25, b + 0.25, head - 0.08, head + 0.14, off, 0.05, cloth);
          for (const [u0, u1] of [
            [a - 0.25, a + Math.min(0.12, w * 0.15)],
            [b - Math.min(0.12, w * 0.15), b + 0.25],
          ])
            across(u0, u1, Math.max(0.05, low - 0.12), head - 0.08, off, 0.05, cloth);
        }
      }

      // Dressing on the outside.
      const outSign = !sideB ? 1 : !sideA ? -1 : 0;
      if (!outSign) return;
      const dress = open.outside ?? (p.shutterColor ? ['shutters'] : []);
      const face = outSign * (thick / 2);
      if (dress.includes('shutters') && style !== 'round') {
        const color = p.shutterColor || '#2f4d6c';
        const sw = Math.min(0.45, Math.max(0.25, w / 2));
        const h0 = bottom,
          h1 = style === 'arched' ? spring : top;
        for (const [u0, u1] of [
          [a - 0.06 - sw, a - 0.06],
          [b + 0.06, b + 0.06 + sw],
        ]) {
          across(u0, u1, h0, h1, face + outSign * 0.02, 0.04, color);
          // Louvers.
          for (let h = h0 + 0.1; h < h1 - 0.08; h += 0.09)
            across(
              u0 + 0.04,
              u1 - 0.04,
              h,
              h + 0.025,
              face + outSign * 0.045,
              0.02,
              tone(color, 18),
            );
        }
      }
      if (dress.includes('panel') && bottom > 0.5) {
        across(a, b, 0.3, bottom - 0.08, face + outSign * 0.015, 0.03, trim);
        across(
          a + 0.07,
          b - 0.07,
          0.37,
          bottom - 0.15,
          face + outSign * 0.035,
          0.02,
          tone(trim, -14),
        );
      }
      if (dress.includes('flowerbox') && bottom > 0.4) {
        const depth = 0.24;
        across(
          a - 0.05,
          b + 0.05,
          bottom - 0.3,
          bottom - 0.06,
          face + outSign * (depth / 2),
          depth,
          '#8a5a3c',
        );
        const colors = ['#d9485f', '#f2c14e', '#e889b0', '#f7f4ec'];
        for (let u = a + 0.05, n = 0; u < b - 0.02; u += 0.12, n++) {
          across(
            u - 0.05,
            u + 0.05,
            bottom - 0.06,
            bottom + 0.04,
            face + outSign * (depth / 2),
            0.16,
            '#4f8a4a',
          );
          const m = new T.Mesh(new T.IcosahedronGeometry(0.05, 0), mat(colors[n % colors.length]));
          const out = wall.line + face + outSign * (depth / 2);
          m.position.set(
            wall.axis === 'x' ? u : out,
            y + bottom + 0.07,
            wall.axis === 'x' ? out : u,
          );
          add(m);
        }
      }
      if (dress.includes('crown')) {
        const head = style === 'round' ? cy + r : top;
        across(a - 0.14, b + 0.14, head + 0.03, head + 0.2, face + outSign * 0.05, 0.1, trim);
        across(a - 0.2, b + 0.2, head + 0.2, head + 0.26, face + outSign * 0.08, 0.16, trim);
      }
    };
    /** A bay window: three angled faces of glass on a paneled base, a seat, and a little roof. */
    const drawBay = (
      open: (typeof wall.openings)[number],
      a: number,
      b: number,
      seat: number,
      head: number,
    ) => {
      const outSign = !sideB ? 1 : !sideA ? -1 : 0;
      // Between two rooms there's nowhere for it to go; it stays a plain window.
      if (!outSign) return drawWindow({ ...open, style: 'plain' }, a, b, seat, head);
      const room = outSign > 0 ? sideA : sideB;
      const inner = room ? wallMat(room) : mat(interior);
      const depth = bayDepth(b - a);
      const at = (u: number, n: number): [number, number] =>
        wall.axis === 'x'
          ? [u, wall.line + outSign * (thick / 2 + n)]
          : [wall.line + outSign * (thick / 2 + n), u];
      const outline: [number, number][] = [
        [a, 0],
        [a + depth, depth],
        [b - depth, depth],
        [b, 0],
      ];
      const corners = outline.map(([u, n]) => at(u, n));
      const [cx, cz] = at((a + b) / 2, depth * 0.3);
      const frameColor = p.windowFrames === 'white' ? '#f7f4ec' : '#52675f';
      const glass = mat(evening ? '#f3d19a' : '#a9d0d6', {
        opacity: evening ? 0.8 : 0.3,
        rough: 0.1,
        metal: 0.1,
        emissive: evening ? '#be874a' : undefined,
      });
      const siding = sidingMat();
      const edgeMat = mat(interior);
      /** A length of the bay's side from p to q, its +z face turned outward. */
      const facet = (
        pt: [number, number],
        qt: [number, number],
        h0: number,
        h1: number,
        t: number,
        material: T.Material | T.Material[],
      ) => {
        const dx = qt[0] - pt[0],
          dz = qt[1] - pt[1];
        const m = new T.Mesh(new T.BoxGeometry(Math.hypot(dx, dz) + 0.02, h1 - h0, t), material);
        m.position.set((pt[0] + qt[0]) / 2, y + (h0 + h1) / 2, (pt[1] + qt[1]) / 2);
        m.rotation.y = -Math.atan2(dz, dx);
        if (
          Math.sin(m.rotation.y) * (m.position.x - cx) +
            Math.cos(m.rotation.y) * (m.position.z - cz) <
          0
        )
          m.rotation.y += Math.PI;
        m.castShadow = m.receiveShadow = true;
        group.add(m);
        wallUv(m, Math.abs(dx) > Math.abs(dz) ? 'x' : 'z');
        return m;
      };
      const walls = [edgeMat, edgeMat, edgeMat, edgeMat, siding, inner];
      for (let n = 0; n < 3; n++) {
        const [pt, qt] = [corners[n], corners[n + 1]];
        facet(pt, qt, 0, seat, 0.12, walls);
        facet(pt, qt, seat - 0.04, seat + 0.03, 0.18, mat(trim));
        facet(pt, qt, seat + 0.03, head - 0.1, 0.02, glass);
        facet(pt, qt, head - 0.1, head, 0.08, mat(frameColor));
        facet(pt, qt, head, head + 0.2, 0.12, walls);
        if (n === 1) {
          // A bar down the middle of the front pane.
          const mx = (pt[0] + qt[0]) / 2,
            mz = (pt[1] + qt[1]) / 2;
          box(mx, y + (seat + head) / 2, mz, 0.05, head - seat, 0.05, frameColor);
        }
      }
      for (const [px, pz] of corners)
        box(px, y + (seat + head) / 2, pz, 0.08, head - seat, 0.08, frameColor);
      const flatAt =
        (h: number) =>
        (u: number, n: number): [number, number, number] => {
          const [x, z] = at(u, n);
          return [x, y + h, z];
        };
      // The seat, the ceiling over it, and a little roof sloping away from the wall.
      const seatTop = sheet(
        outline,
        flatAt(seat),
        0.05,
        mat(open.curtains ? tone(open.curtains, 20) : '#eadfca'),
      );
      const ceiling = sheet(outline, flatAt(head + 0.19), 0, mat('#f3f0ea', { double: true }));
      for (const m of [seatTop, ceiling]) if (m) add(m);
      const eaves: [number, number][] = [
        [a - 0.1, 0],
        [a + depth - 0.04, depth + 0.1],
        [b - depth + 0.04, depth + 0.1],
        [b + 0.1, 0],
      ];
      const lid = sheet(
        eaves,
        (u, n) => {
          const [x, z] = at(u, n);
          return [x, y + head + 0.2 + (depth + 0.1 - n) * 0.55, z];
        },
        0.07,
        roofMaterial(),
        (u, n) => [u / 1.4, n / 1.4],
      );
      if (lid) add(lid);
      // Close in the sides under the sloping roof, so you can't see through to the wall.
      const lidAt = (n: number) => y + head + 0.2 + (depth + 0.1 - n) * 0.55;
      for (let n = 0; n < 3; n++) {
        const [u0, n0] = outline[n],
          [u1, n1] = outline[n + 1];
        const [x0, z0] = at(u0, n0),
          [x1, z1] = at(u1, n1);
        const base = y + head + 0.19;
        const g = new T.BufferGeometry();
        g.setAttribute(
          'position',
          new T.Float32BufferAttribute(
            [
              x0,
              base,
              z0,
              x1,
              base,
              z1,
              x1,
              lidAt(n1),
              z1,
              x0,
              base,
              z0,
              x1,
              lidAt(n1),
              z1,
              x0,
              lidAt(n0),
              z0,
            ],
            3,
          ),
        );
        g.setAttribute('uv', new T.Float32BufferAttribute(new Array(12).fill(0), 2));
        g.computeVertexNormals();
        const infill = new T.Mesh(g, sidingMat(true));
        infill.castShadow = infill.receiveShadow = true;
        wallUv(infill, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z');
        group.add(infill);
      }
      // Curtains inside, across the opening in the wall.
      if (open.curtains) {
        const cloth = mat(open.curtains, { rough: 0.95 });
        const sign = -outSign;
        const off = sign * (thick / 2 + 0.07);
        across(
          a - 0.28,
          b + 0.28,
          head + 0.12,
          head + 0.15,
          sign * (thick / 2 + 0.1),
          0.03,
          '#b8a27a',
        );
        across(a - 0.25, b + 0.25, head - 0.1, head + 0.12, off, 0.05, cloth);
        for (const [u0, u1] of [
          [a - 0.25, a + 0.12],
          [b - 0.12, b + 0.25],
        ])
          across(u0, u1, seat + 0.1, head - 0.1, off, 0.05, cloth);
      }
    };
    // Dormers take the place of the knee wall where they stand.
    const dormerSpans = plan.dormers
      .filter((d) => {
        const w = plan.wings[d.wing];
        const eave = d.side === 'lo' ? crossRange(w)[0] : crossRange(w)[1];
        return (
          w.cape &&
          !d.setback &&
          w.level === wall.floor &&
          w.axis === wall.axis &&
          Math.abs(eave - wall.line) < 0.03
        );
      })
      .map((d) => [d.a0, d.a1] as [number, number]);
    // Outside walls upstairs carry on down over the edge of the floor, so no slit shows between
    // one storey and the next.
    if (wall.floor > 0 && (!sideA || !sideB)) piece(wall.start, wall.end, -FLOOR_H + WALL_H, 0);
    const cuts = [
      ...new Set([
        wall.start,
        wall.end,
        ...wall.openings.flatMap((o) => [o.start, o.end]),
        ...dormerSpans.flat().filter((c) => c > wall.start && c < wall.end),
      ]),
    ].sort((a, b) => a - b);
    for (let n = 0; n < cuts.length - 1; n++) {
      const a = cuts[n],
        b = cuts[n + 1];
      if (dormerSpans.some(([d0, d1]) => a >= d0 - 0.001 && b <= d1 + 0.001)) continue;
      const openings = wall.openings.filter((o) => o.start <= a + 0.001 && o.end >= b - 0.001);
      // A removed wall wins over anything else sharing the span.
      const open =
        openings.find((o) => o.kind === 'open') ||
        openings.find((o) => isPassable(o.kind)) ||
        openings[0];
      if (!open) {
        piece(a, b, 0, height);
        // Baseboards stand proud of the wall indoors only; outside they'd show as a pale strip.
        const outward = !sideB ? 1 : !sideA ? -1 : 0;
        if (outward) across(a, b, 0, 0.09, -outward * 0.01, thick, '#d2caba');
        else piece(a, b, 0, 0.09, '#d2caba', thick + 0.02);
        continue;
      }
      if (open.kind === 'open') continue; // The wall is gone here.
      const bottom = open.kind === 'window' ? 0.95 : open.kind === 'bay' ? 0.45 : 0,
        top =
          open.kind === 'window'
            ? 2.25
            : open.kind === 'bay'
              ? 2.3
              : open.kind === 'slider'
                ? 2.15
                : 2.2;
      if (bottom > 0) piece(a, b, 0, Math.min(bottom, height));
      if (height > top) piece(a, b, top, height);
      if (open.kind === 'window' && height > bottom)
        drawWindow(open, a, b, bottom, Math.min(top, height));
      if (open.kind === 'bay' && height > top) drawBay(open, a, b, bottom, top);
    }
    // Casings, door leaves, sliding glass, and garage panels.
    for (const o of wall.openings) {
      if (height < 1 || o.kind === 'window' || o.kind === 'bay' || o.kind === 'open') continue;
      // No casing where the wall itself was taken out.
      if (wall.openings.some((x) => x.kind === 'open' && x.start <= o.start && x.end >= o.end))
        continue;
      const headTop = o.kind === 'slider' ? 2.15 : 2.2;
      piece(o.start - 0.06, o.start, 0, headTop, trim, thick + 0.04);
      piece(o.end, o.end + 0.06, 0, headTop, trim, thick + 0.04);
      if (height > headTop)
        piece(o.start - 0.06, o.end + 0.06, headTop, headTop + 0.08, trim, thick + 0.04);
      const width = o.end - o.start;
      if (height < headTop || o.kind === 'arch') continue;
      if (o.kind === 'garage') {
        // A painted door reads as part of the wall; against brick or stone it takes a trim color.
        const doorColor = sidingMap ? '#e4dfd2' : tone(p.exterior, 10);
        const panel = mat(doorColor, { rough: 0.6 });
        piece(o.start, o.end, 0.02, 2.2, panel, 0.05);
        for (let g = 1; g < 4; g++)
          piece(o.start, o.end, g * 0.55, g * 0.55 + 0.02, tone(doorColor, -25), 0.07);
        continue;
      }
      if (o.kind === 'slider') {
        // Two glass panels in a frame; one slides behind the other.
        const glass = mat('#a9d0d6', { opacity: 0.32, rough: 0.08, metal: 0.1 });
        const frame = '#52675f';
        piece(o.start, o.start + width / 2, 0.06, 2.1, glass, 0.03);
        piece(o.start + width / 2, o.end, 0.06, 2.1, glass, 0.03);
        for (const xx of [o.start, o.start + width / 2, o.end])
          piece(xx - 0.035, xx + 0.035, 0.06, 2.1, frame, 0.07);
        piece(o.start, o.end, 0.06, 0.12, frame, 0.09);
        piece(o.start, o.end, 2.04, 2.1, frame, 0.09);
        continue;
      }
      // Door leaves, swung open into a room (the negative side when both are rooms).
      const dir = sideA ? -1 : 1;
      const leaf = mat(p.doorColor || tone(interior, -14));
      const automatic = o.kind === 'door' && (!sideA || !sideB) && mode !== 'dollhouse';
      const closed = automatic
        ? piece(o.start + 0.02, o.end - 0.02, 0.03, 2.12, leaf, 0.065)
        : null;
      const t = 0.04;
      const leaves: [number, number][] =
        o.kind === 'double' || o.kind === 'french'
          ? [
              [o.start + t / 2 + 0.01, width / 2],
              [o.end - t / 2 - 0.01, width / 2],
            ]
          : [[o.start + t / 2 + 0.01, width]];
      for (const [hinge, leafWidth] of leaves) {
        const away = hinge > (o.start + o.end) / 2 ? -1 : 1;
        const center = wall.line + dir * (thick / 2 + leafWidth / 2);
        if (o.kind === 'french') {
          // A glazed leaf: stiles and rails round ten small panes.
          const frameColor = '#f7f4ec';
          const part = (
            l0: number,
            l1: number,
            h0: number,
            h1: number,
            d: number,
            m: string | T.Material,
          ) => {
            const c = wall.line + dir * (thick / 2 + (l0 + l1) / 2);
            return wall.axis === 'x'
              ? box(hinge, y + (h0 + h1) / 2, c, d, h1 - h0, l1 - l0, m)
              : box(c, y + (h0 + h1) / 2, hinge, l1 - l0, h1 - h0, d, m);
          };
          const s = 0.07;
          part(0, s, 0, 2.1, 0.045, frameColor);
          part(leafWidth - s, leafWidth, 0, 2.1, 0.045, frameColor);
          part(s, leafWidth - s, 0, 0.25, 0.045, frameColor);
          part(s, leafWidth - s, 2.02, 2.1, 0.045, frameColor);
          part(
            s,
            leafWidth - s,
            0.25,
            2.02,
            0.012,
            mat('#a9d0d6', { opacity: 0.3, rough: 0.08, metal: 0.1 }),
          );
          part(leafWidth / 2 - 0.013, leafWidth / 2 + 0.013, 0.25, 2.02, 0.035, frameColor);
          for (let k = 1; k < 5; k++) {
            const h = 0.25 + (1.77 * k) / 5;
            part(s, leafWidth - s, h - 0.013, h + 0.013, 0.035, frameColor);
          }
          void away;
          continue;
        }
        const openLeaf =
          wall.axis === 'x'
            ? box(hinge, y + 1.05, center, t, 2.1, leafWidth, leaf)
            : box(center, y + 1.05, hinge, leafWidth, 2.1, t, leaf);
        if (closed && openLeaf) {
          openLeaf.visible = false;
          autoDoors.push({
            closed,
            open: openLeaf,
            x: wall.axis === 'x' ? (o.start + o.end) / 2 : wall.line,
            z: wall.axis === 'x' ? wall.line : (o.start + o.end) / 2,
          });
        }
        void away;
      }
    }
    if (mode === 'dollhouse' && wall.floor === floor)
      piece(wall.start, wall.end, height, height + 0.02, '#f5f0e5', thick + 0.005);
  }

  // Stairs.
  for (const s of p.items.filter((i) => i.kind === 'stairs')) {
    const { lower, upper } = stairLevels(s);
    if (!shown.includes(lower) && !(mode === 'dollhouse' && upper === floor)) continue;
    buildStairs(s, lower, upper, shown.includes(upper), group, mat, interior, stairGuards(p, s));
  }

  // Curved walls: short straight lengths set along the arc, with glass where windows fall.
  for (const cw of p.items.filter((i) => i.kind === 'curve' && shown.includes(i.floor))) {
    const y = cw.floor * FLOOR_H;
    const { LW, LD } = localSize(cw);
    const g = new T.Group();
    g.position.set(cw.x + cw.w / 2, y, cw.z + cw.d / 2);
    g.rotation.y = (-cw.rotation * Math.PI) / 180;
    g.userData.itemId = cw.id;
    group.add(g);
    const height = mode === 'dollhouse' && cw.floor === floor ? 1.15 : WALL_H;
    const thick = 0.16;
    const faces = [
      mat(cw.color),
      mat(cw.color),
      mat(interior),
      mat(interior),
      mat(interior),
      mat(cw.color),
    ];
    const glass = mat(evening ? '#f3d19a' : '#a9d0d6', {
      opacity: evening ? 0.8 : 0.3,
      rough: 0.1,
      metal: 0.1,
      emissive: evening ? '#be874a' : undefined,
    });
    const put = (
      piece: { u: number; v: number; angle: number; len: number },
      y0: number,
      y1: number,
      material: T.Material | T.Material[],
      t = thick,
    ) => {
      if (y1 - y0 < 0.01) return;
      const m = new T.Mesh(new T.BoxGeometry(piece.len, y1 - y0, t), material);
      m.position.set(piece.u - LW / 2, (y0 + y1) / 2, piece.v - LD / 2);
      m.rotation.y = -piece.angle;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    for (const piece of curvePieces(cw, p.openings)) {
      if (piece.fill === 'solid') {
        put(piece, 0, height, faces);
        put(piece, 0, Math.min(0.09, height), mat('#d2caba'), thick + 0.02);
      } else if (piece.fill === 'window') {
        put(piece, 0, Math.min(0.95, height), faces);
        if (height > 2.25) put(piece, 2.25, height, faces);
        put(piece, 0.95, Math.min(2.25, height), glass, 0.04);
        put(piece, 0.95, Math.min(1, height), mat('#52675f'), thick + 0.04);
        if (height >= 2.25) put(piece, 2.2, 2.25, mat('#52675f'), thick + 0.04);
      } else if (height > 2.2) put(piece, 2.2, height, faces);
    }
  }

  // Rounded corners: short lengths of wall following each curve, paint in and siding out.
  for (const arc of cornerArcs(p).filter((a) => shown.includes(a.room.floor))) {
    const room = arc.room;
    const y = room.floor * FLOOR_H;
    // Just beyond the square corner the curve cuts off: is another room there?
    const outX = arc.cx + Math.cos((arc.a0 + arc.a1) / 2) * (arc.r * Math.SQRT2 + 0.3),
      outZ = arc.cz + Math.sin((arc.a0 + arc.a1) / 2) * (arc.r * Math.SQRT2 + 0.3);
    const next = insideRoom(room.floor, outX, outZ);
    const neighbour = next && next.id !== room.id ? next : undefined;
    const height = wallHeight({ floor: room.floor, height: ceilingHeight(p, room) }, !neighbour);
    const inside = wallMat(room),
      outside = neighbour ? wallMat(neighbour) : sidingMat(),
      edge = mat(mode === 'dollhouse' ? '#f5f0e5' : interior);
    const low = room.wainscot ? wainscotMat(room.wainscot) : inside;
    for (const piece of arcPieces(arc)) {
      // Local +z faces out from the curve's center.
      const faces = (inner: T.Material) => [edge, edge, edge, edge, outside, inner];
      const put = (y0: number, y1: number, material: T.Material[] | T.Material, t = 0.16) => {
        if (y1 - y0 < 0.01) return;
        const m = new T.Mesh(new T.BoxGeometry(piece.len, y1 - y0, t), material);
        m.position.set(piece.x, y + (y0 + y1) / 2, piece.z);
        m.rotation.y = -piece.angle;
        // BoxGeometry's +z side should face away from the center; turn it round if it doesn't.
        const nx = Math.cos(piece.normal),
          nz = Math.sin(piece.normal);
        const fz = Math.cos(m.rotation.y),
          fx = Math.sin(m.rotation.y);
        if (fx * nx + fz * nz < 0) m.rotation.y += Math.PI;
        m.castShadow = m.receiveShadow = true;
        m.userData.itemId = room.id;
        group.add(m);
        wallUv(m, Math.abs(Math.cos(piece.angle)) > 0.7 ? 'x' : 'z');
      };
      // Under a pitched roof, an outside curve carries on up to meet it, as a gable wall does.
      let top = height;
      if (!neighbour && mode !== 'dollhouse') {
        const ends = [piece.len / 2, -piece.len / 2].map((d) =>
          roofOver(
            plan,
            room.floor,
            piece.x + Math.cos(piece.angle) * d,
            piece.z + Math.sin(piece.angle) * d,
          ),
        );
        if (ends.every((h) => h !== undefined))
          top = Math.max(height, Math.max(...(ends as number[])) - y + 0.05);
      }
      if (room.wainscot && height > 0.95) {
        put(0, 0.95, faces(low));
        put(0.95, top, faces(inside));
      } else put(0, top, faces(inside));
      put(0, Math.min(0.09, height), mat('#d2caba'), 0.18);
    }
  }

  // Landings and balconies.
  for (const l of p.items.filter((i) => i.kind === 'landing' && shown.includes(i.floor))) {
    const y = l.floor * FLOOR_H;
    slab({ x0: l.x, z0: l.z, x1: l.x + l.w, z1: l.z + l.d }, y - 0.2, y, l.color)!.userData.itemId =
      l.id;
    for (let dx = 0.2; dx < l.w; dx += 0.2)
      box(l.x + dx, y + 0.002, l.z + l.d / 2, 0.012, 0.006, l.d, tone(l.color, -25));
    if (l.floor > 0)
      for (const r of landingRails(p, l)) {
        const cx = (r.x0 + r.x1) / 2,
          cz = (r.z0 + r.z1) / 2,
          rw = Math.max(0.06, r.x1 - r.x0),
          rd = Math.max(0.06, r.z1 - r.z0);
        box(cx, y + 0.45, cz, rw, 0.9, rd, mat('#d6e8ea', { opacity: 0.3, rough: 0.05 }));
        box(cx, y + 0.95, cz, rw + 0.04, 0.06, rd + 0.04, '#6b5a45');
      }
    if (l.covered) {
      for (const [cx, cz] of [
        [l.x + 0.12, l.z + 0.12],
        [l.x + l.w - 0.12, l.z + 0.12],
        [l.x + 0.12, l.z + l.d - 0.12],
        [l.x + l.w - 0.12, l.z + l.d - 0.12],
      ])
        box(cx, y + 1.3, cz, 0.14, 2.6, 0.14, tone(l.color, 15));
      box(l.x + l.w / 2, y + 2.7, l.z + l.d / 2, l.w + 0.3, 0.18, l.d + 0.3, p.roof);
    }
  }

  // Furniture.
  for (const i of p.items) {
    if (
      isRoom(i) ||
      isOutside(i) ||
      i.kind === 'stairs' ||
      i.kind === 'landing' ||
      i.kind === 'curve' ||
      !shown.includes(i.floor)
    )
      continue;
    const room = roomsOn(i.floor).find(
      (r) =>
        i.x + i.w / 2 > r.x &&
        i.x + i.w / 2 < r.x + r.w &&
        i.z + i.d / 2 > r.z &&
        i.z + i.d / 2 < r.z + r.d,
    );
    const g = furniture(i, i.floor * FLOOR_H, mat, room ? ceilingHeight(p, room) : WALL_H);
    if (g) {
      g.userData.itemId = i.id;
      group.add(g);
    }
  }

  // Roofs: one per wing, with valleys, dormers and chimneys; see roof.ts.
  if (mode !== 'dollhouse') {
    const roofMat = roofMaterial();
    buildRoofs({
      p,
      plan,
      add: (m) => {
        if (m) add(m);
      },
      mat: (color, o) => mat(color, o),
      roof: roofMat,
      roofTile: ROOF_TILE,
      siding: (double) => sidingMat(double),
      sidingTile: SIDING_TILE,
      ceiling: mat('#f3f0ea', { double: true }),
      paintAt: (level, x, z) => {
        const r = insideRoom(level, x, z);
        return r ? wallMat(r) : mat(interior);
      },
      evening,
    });
  }

  const bounds = new T.Box3();
  const framed = p.items.filter((i) => isRoom(i) && shown.includes(i.floor));
  for (const r of framed.length ? framed : p.items) {
    bounds.expandByPoint(new T.Vector3(r.x, r.floor * FLOOR_H, r.z));
    bounds.expandByPoint(new T.Vector3(r.x + r.w, r.floor * FLOOR_H + 3, r.z + r.d));
  }
  if (bounds.isEmpty()) bounds.set(new T.Vector3(-6, 0, -6), new T.Vector3(6, 3, 6));
  group.userData.autoDoors = autoDoors;
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
  guards: { rails: Segment[]; banisters: Banister[] },
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
  // Painted stairs: risers, stringers and spindles in the trim color, the treads left natural.
  const painted = !!s.trimColor;
  const body = mat(painted ? s.trimColor! : tone(s.color, -18)),
    tread = mat(s.color),
    rail = mat(painted ? tone(s.trimColor!, -8) : '#6b5a45'),
    spindle = mat(painted ? s.trimColor! : '#6b5a45'),
    glass = mat('#d6e8ea', { opacity: 0.3, rough: 0.05 });
  /** A flat outline in local (u, v), raised between two heights. */
  const slabOf = (poly: [number, number][], y0: number, y1: number, material: T.Material) => {
    const shape = new T.Shape(poly.map(([u, v]) => new T.Vector2(u - LW / 2, LD / 2 - v)));
    const geo = new T.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const m = put(new T.Mesh(geo, material));
    m.position.y = y0;
    return m;
  };
  for (const t of layout.treads) {
    const top = t.k * RISE;
    if (t.poly) {
      slabOf(t.poly, painted ? 0 : Math.max(0, top - 0.45), top - 0.035, body);
      slabOf(t.poly, top - 0.035, top, tread);
    } else if (t.rect) {
      const r = t.rect;
      b(r.x0, r.x1, painted ? 0 : Math.max(0, top - 0.45), top - 0.035, r.z0, r.z1, body);
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
    for (const r of guards.rails) {
      if (painted) {
        const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
        const count = Math.max(2, Math.round(len / 0.12));
        for (let n = 0; n <= count; n++) {
          const f = n / count;
          const u = r.a[0] + (r.b[0] - r.a[0]) * f,
            v = r.a[1] + (r.b[1] - r.a[1]) * f;
          b(u - 0.018, u + 0.018, y, y + 0.92, v - 0.018, v + 0.018, spindle);
        }
        for (const [u, v] of [r.a, r.b])
          b(u - 0.05, u + 0.05, y, y + 1.02, v - 0.05, v + 0.05, spindle);
      } else segment(r.a, r.b, y, y + 0.92, glass, 0.02);
      segment(r.a, r.b, y + 0.92, y + 0.97, rail, 0.06);
    }
  }
  // Handrails climbing beside each flight, with posts under them.
  for (const r of guards.banisters) {
    const [du, dv] = [r.b[0] - r.a[0], r.b[1] - r.a[1]];
    const run = Math.hypot(du, dv);
    if (run < 0.2) continue;
    const drop = r.y1 - r.y0;
    const m = put(new T.Mesh(new T.BoxGeometry(0.05, 0.05, Math.hypot(run, drop)), rail));
    m.position.set(
      (r.a[0] + r.b[0]) / 2 - LW / 2,
      (r.y0 + r.y1) / 2,
      (r.a[1] + r.b[1]) / 2 - LD / 2,
    );
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(du, dv);
    m.rotation.x = -Math.atan2(drop, run);
    // Posts stand on the treads below the rail, not on the floor far underneath.
    const posts = Math.max(2, Math.round(run / (painted ? 0.13 : 0.42)));
    for (let n = 0; n <= posts; n++) {
      const t = n / posts;
      const top = r.y0 + drop * t;
      const post = put(new T.Mesh(new T.BoxGeometry(0.035, RAIL_H, 0.035), spindle));
      post.position.set(r.a[0] + du * t - LW / 2, top - RAIL_H / 2, r.a[1] + dv * t - LD / 2);
    }
    if (painted) {
      // A turned newel post at the foot of the flight, with a ball on top.
      const [u, v] = r.y0 < r.y1 ? r.a : r.b;
      const foot = Math.min(r.y0, r.y1) - RAIL_H;
      const newel = put(new T.Mesh(new T.BoxGeometry(0.11, RAIL_H + 0.22, 0.11), spindle));
      newel.position.set(u - LW / 2, foot + (RAIL_H + 0.22) / 2, v - LD / 2);
      const knob = put(new T.Mesh(new T.SphereGeometry(0.075, 12, 8), spindle));
      knob.position.set(u - LW / 2, foot + RAIL_H + 0.28, v - LD / 2);
    }
  }
}

/** How far back from the front door the street is: just past the front fence, or a good
 * look at the house if there isn't one. */
function streetDistance(p: Project, d: { x: number; z: number; nx: number; nz: number }) {
  let far = 9;
  for (const f of p.items.filter((i) => i.kind === 'fence')) {
    for (let t = 2; t < 30; t += 0.25) {
      const x = d.x + d.nx * t,
        z = d.z + d.nz * t;
      // Anything within a few paces either side of the path counts, so a gate gap doesn't.
      const side = [-2, 0, 2].some((o) => {
        const px = x - d.nz * o,
          pz = z + d.nx * o;
        return px >= f.x - 0.1 && px <= f.x + f.w + 0.1 && pz >= f.z - 0.1 && pz <= f.z + f.d + 0.1;
      });
      if (side) {
        far = Math.max(far, t + 2.2);
        break;
      }
    }
  }
  return Math.min(far, 24);
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
  /** Momentum, so walking and turning start and stop gently rather than snapping. */
  const motion = useRef({ vx: 0, vz: 0, spin: 0 });
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
        const m = motion.current;
        m.spin += (turn * 1.7 - m.spin) * Math.min(1, dt * 9);
        if (Math.abs(m.spin) < 0.002) m.spin = 0;
        w.yaw += m.spin * dt;
        const forward =
            (k.has('w') || k.has('arrowup') ? 1 : 0) -
            (k.has('s') || k.has('arrowdown') ? 1 : 0) +
            pad.current.forward,
          strafe = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
        const dx = -Math.sin(w.yaw) * forward + Math.cos(w.yaw) * strafe,
          dz = -Math.cos(w.yaw) * forward - Math.sin(w.yaw) * strafe;
        const len = Math.hypot(dx, dz);
        const speed = k.has('shift') ? 4.2 : 2.4;
        // Accelerate toward the pace you asked for; let go and you slow to a stop.
        const ease = Math.min(1, dt * (len > 0 ? 8 : 11));
        m.vx += ((len > 0 ? (dx / len) * speed : 0) - m.vx) * ease;
        m.vz += ((len > 0 ? (dz / len) * speed : 0) - m.vz) * ease;
        if (Math.hypot(m.vx, m.vz) < 0.02) m.vx = m.vz = 0;
        if (m.vx || m.vz) {
          const vx = m.vx * dt,
            vz = m.vz * dt;
          if (e.world.free(w.x + vx, w.z, w.feet)) w.x += vx;
          else m.vx = 0;
          if (e.world.free(w.x, w.z + vz, w.feet)) w.z += vz;
          else m.vz = 0;
        }
        const ground = e.world.support(w.x, w.z, w.feet);
        if (ground >= w.feet) {
          w.feet += (ground - w.feet) * Math.min(1, dt * 16);
          w.fall = 0;
        } else {
          w.fall = Math.min(w.fall + dt * 14, 9);
          w.feet = Math.max(ground, w.feet - Math.max(w.fall, 3) * dt);
        }
        for (const door of (e.content?.userData.autoDoors || []) as {
          closed: T.Mesh;
          open: T.Mesh;
          x: number;
          z: number;
        }[]) {
          const near = Math.hypot(w.x - door.x, w.z - door.z) < 1.5;
          door.closed.visible = !near;
          door.open.visible = near;
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
      found = false,
      outsideDoor = false;
    const face = (dx: number, dz: number) => Math.atan2(-dx, -dz);
    if (at) {
      x = at.x;
      z = at.z;
      yaw = at.yaw;
      found = true;
    } else if (level === 0) {
      const d = frontDoor(p);
      if (d) {
        const back = p.walkStart === 'street' ? streetDistance(p, d) : 3.6;
        x = d.x + d.nx * back;
        z = d.z + d.nz * back;
        yaw = face(-d.nx, -d.nz);
        found = true;
        outsideDoor = p.walkStart === 'street';
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
      // From the street, look up enough to take in the whole house.
      pitch: outsideDoor ? 0.16 : -0.05,
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
            <button
              className="walk-exit"
              aria-label="Back to editing"
              onClick={() => onMode('dollhouse')}
            >
              <X size={16} />
              <span>
                Back to editing <kbd>Esc</kbd>
              </span>
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
                <span>{touring ? 'Stop tour' : 'Tour'}</span>
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
              <span className="keys">
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> walk · drag to look · <kbd>Shift</kbd> hurry · walk onto stairs to
                change floors
              </span>
              <span className="touch">
                Arrows to walk · drag to look · walk onto stairs to change floors
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
