// 3D models for furniture and fixtures, built in each piece's own frame so they can face
// any direction. At rotation 0 the back of a piece sits on its north edge (v = 0).
import * as T from 'three';
import { FLOOR_H, type Fabric, type Item } from './model';
import { localSize } from './stairs';

export type Mat = (
  color: string,
  o?: { rough?: number; metal?: number; opacity?: number; emissive?: string; double?: boolean },
) => T.Material;

const posterTextures = new Map<string, T.CanvasTexture>();
function posterTexture(label: string, color: string) {
  const key = `${label}:${color}`;
  const saved = posterTextures.get(key);
  if (saved) return saved;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 704;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 704);
  g.fillStyle = '#f7d875';
  for (let n = 0; n < 16; n++) {
    const a = (n / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 130, 380 + Math.sin(a) * 130);
    g.lineTo(256 + Math.cos(a - 0.12) * 250, 380 + Math.sin(a - 0.12) * 250);
    g.lineTo(256 + Math.cos(a + 0.12) * 250, 380 + Math.sin(a + 0.12) * 250);
    g.fill();
  }
  g.fillStyle = '#1f3d69';
  g.beginPath();
  g.ellipse(256, 390, 86, 125, 0, 0, Math.PI * 2);
  g.fill();
  if (/bunny/i.test(label)) {
    for (const x of [218, 292]) {
      g.beginPath();
      g.ellipse(x, 220, 25, 115, x < 256 ? -0.16 : 0.16, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#fff9e6';
  g.textAlign = 'center';
  g.font = 'bold 56px Arial, sans-serif';
  const words = label.toUpperCase().split(' ');
  const mid = Math.ceil(words.length / 2);
  g.fillText(words.slice(0, mid).join(' '), 256, 82, 470);
  g.fillText(words.slice(mid).join(' '), 256, 660, 470);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  posterTextures.set(key, texture);
  return texture;
}

// Woven patterns, drawn in the piece's own color. Each tile covers half a meter.
const FABRIC_TILE = 0.5;
const fabricTextures = new Map<string, T.CanvasTexture>();
function fabricTexture(kind: Fabric, color: string) {
  const key = kind + color;
  const hit = fabricTextures.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  if (kind === 'stripes') {
    // Broad two-tone stripes, like a den sofa.
    g.fillStyle = tone(color, -42);
    for (let x = 0; x < 128; x += 32) g.fillRect(x + 16, 0, 16, 128);
    g.fillStyle = tone(color, 30);
    for (let x = 0; x < 128; x += 32) g.fillRect(x + 6, 0, 3, 128);
  } else if (kind === 'check') {
    g.globalAlpha = 0.45;
    g.fillStyle = tone(color, -55);
    for (let n = 0; n < 128; n += 32) {
      g.fillRect(n, 0, 16, 128);
      g.fillRect(0, n, 128, 16);
    }
    g.globalAlpha = 1;
  } else if (kind === 'floral') {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const x = col * 32 + (row % 2) * 16 + 16,
          y = row * 32 + 16;
        g.fillStyle = tone(color, 38);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = tone(color, -45);
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
  }
  const t = new T.CanvasTexture(canvas);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  fabricTextures.set(key, t);
  return t;
}

export function furniture(item: Item, y: number, mat: Mat, ceiling = 3): T.Group | null {
  const g = new T.Group();
  const { LW, LD } = localSize(item);
  g.position.set(item.x + item.w / 2, y, item.z + item.d / 2);
  g.rotation.y = (-item.rotation * Math.PI) / 180;
  const c = item.color;
  // A patterned piece wears its pattern wherever it would wear its own color.
  const woven =
    item.fabric && item.fabric !== 'plain'
      ? new T.MeshStandardMaterial({ map: fabricTexture(item.fabric, c), roughness: 0.92 })
      : null;
  if (woven) {
    const plain = mat;
    mat = (color, o) => (color === c && !o ? woven : plain(color, o));
  }
  // A box spanning u0..u1 across, y0..y1 up, v0..v1 front-to-back, in local meters.
  const b = (
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    v0: number,
    v1: number,
    color: string | T.Material,
  ) => {
    if (u1 - u0 < 0.001 || y1 - y0 < 0.001 || v1 - v0 < 0.001) return;
    const material = typeof color === 'string' ? mat(color) : color;
    const geo = new T.BoxGeometry(u1 - u0, y1 - y0, v1 - v0);
    if (woven && material === woven) {
      // Faces run +x, -x, +y, -y, +z, -z, four corners each.
      const [sw, sh, sd] = [u1 - u0, y1 - y0, v1 - v0].map((n) => n / FABRIC_TILE);
      const size = [
        [sd, sh],
        [sd, sh],
        [sw, sd],
        [sw, sd],
        [sw, sh],
        [sw, sh],
      ];
      const uv = geo.attributes.uv as T.BufferAttribute;
      for (let n = 0; n < uv.count; n++) {
        const [fu, fv] = size[Math.floor(n / 4)];
        uv.setXY(n, uv.getX(n) * fu, uv.getY(n) * fv);
      }
    }
    const m = new T.Mesh(geo, material);
    m.position.set((u0 + u1) / 2 - LW / 2, (y0 + y1) / 2, (v0 + v1) / 2 - LD / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (
    u: number,
    v: number,
    r: number,
    y0: number,
    y1: number,
    color: string | T.Material,
  ) => {
    const m = new T.Mesh(
      new T.CylinderGeometry(r, r, y1 - y0, 20),
      typeof color === 'string' ? mat(color) : color,
    );
    m.position.set(u - LW / 2, (y0 + y1) / 2, v - LD / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const ball = (u: number, h: number, v: number, r: number, color: string | T.Material) => {
    const m = new T.Mesh(
      new T.IcosahedronGeometry(r, 1),
      typeof color === 'string' ? mat(color) : color,
    );
    m.position.set(u - LW / 2, h, v - LD / 2);
    m.castShadow = true;
    g.add(m);
  };
  const W = LW,
    D = LD;
  /** Worktops, sinks and cooktops shared by the islands. */
  const worktop = (h = 0.9) => {
    b(0, W, 0, h, 0, D, c);
    b(-0.03, W + 0.03, h, h + 0.04, -0.03, D + 0.03, '#f1ede0');
  };
  const sink = (u: number, v: number, sw = 0.6, sd = 0.45, top = 0.94) => {
    b(u - sw / 2, u + sw / 2, top - 0.06, top + 0.001, v - sd / 2, v + sd / 2, '#b8c0c0');
    cyl(u, v - sd / 2 - 0.09, 0.02, top, top + 0.28, '#9aa3a3');
  };
  const cooktop = (u: number, v: number, cw = 0.66, cd = 0.46, top = 0.94) => {
    b(u - cw / 2, u + cw / 2, top, top + 0.015, v - cd / 2, v + cd / 2, '#2e3230');
    for (const du of [-0.16, 0.16])
      for (const dv of [-0.11, 0.11])
        cyl(u + du, v + dv, 0.07, top + 0.015, top + 0.025, '#4a4f4d');
  };
  switch (item.kind) {
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(0.2, W * 0.15);
      b(0, W, 0.08, 0.45, 0, D, c);
      b(0, W, 0.08, 0.85, 0, 0.22, c);
      b(0, arm, 0.08, 0.62, 0, D, c);
      b(W - arm, W, 0.08, 0.62, 0, D, c);
      const seats = item.kind === 'armchair' ? 1 : Math.max(2, Math.round((W - 2 * arm) / 0.9));
      const sw = (W - 2 * arm) / seats;
      for (let n = 0; n < seats; n++)
        b(arm + n * sw + 0.02, arm + (n + 1) * sw - 0.02, 0.45, 0.58, 0.24, D - 0.04, tone(c, 18));
      for (const u of [0.05, W - 0.05])
        for (const v of [0.05, D - 0.05])
          b(u - 0.03, u + 0.03, 0, 0.08, v - 0.03, v + 0.03, '#5a4a3a');
      break;
    }
    case 'platform': {
      // A wide, low base with the mattress set into it, on a recessed plinth.
      b(0, W, 0.08, 0.3, 0, D, tone(c, -28));
      b(0.14, W - 0.14, 0, 0.08, 0.14, D - 0.14, '#5c5349');
      b(0.16, W - 0.16, 0.3, 0.6, 0.16, D - 0.26, c);
      for (let n = 0; n < 2; n++)
        b(W * (0.2 + n * 0.32), W * (0.46 + n * 0.32), 0.6, 0.72, 0.24, 0.6, '#f8f4e8');
      b(0.16, W - 0.16, 0.6, 0.64, D * 0.52, D - 0.26, tone(c, 16));
      b(0, W, 0.3, 0.8, 0, 0.14, tone(c, -18));
      break;
    }
    case 'canopy': {
      const post = tone(c, -48);
      b(0.08, W - 0.08, 0.16, 0.44, 0.08, D - 0.08, tone(c, -26));
      b(0.1, W - 0.1, 0.44, 0.66, 0.14, D - 0.1, c);
      for (let n = 0; n < 2; n++)
        b(W * (0.09 + n * 0.46), W * (0.45 + n * 0.46), 0.66, 0.8, 0.2, 0.62, '#f8f4e8');
      b(W * 0.04, W * 0.96, 0.66, 0.7, D * 0.5, D * 0.95, tone(c, 16));
      // A headboard panel between the posts at the pillow end.
      b(0.1, W - 0.1, 0.44, 1.16, 0.03, 0.1, tone(c, -30));
      // Four posts and the frame across the top.
      for (const u of [0.07, W - 0.07])
        for (const v of [0.07, D - 0.07]) b(u - 0.05, u + 0.05, 0, 2.08, v - 0.05, v + 0.05, post);
      b(0, W, 2.02, 2.1, 0, 0.1, post);
      b(0, W, 2.02, 2.1, D - 0.1, D, post);
      b(0, 0.1, 2.02, 2.1, 0, D, post);
      b(W - 0.1, W, 2.02, 2.1, 0, D, post);
      // Sheer drapes gathered at the head posts.
      const sheer = mat('#f6f1e6', { opacity: 0.38, rough: 0.95, double: true });
      for (const u of [0.13, W - 0.17]) b(u, u + 0.04, 0.55, 2.02, 0.08, 0.38, sheer);
      break;
    }
    case 'daybed': {
      b(0, W, 0.1, 0.44, 0, D, tone(c, -25));
      b(0.06, W - 0.06, 0.44, 0.58, 0.08, D - 0.04, tone(c, 22));
      b(0, W, 0.44, 0.95, 0, 0.1, tone(c, -25));
      b(0, 0.1, 0.44, 0.8, 0, D, tone(c, -25));
      b(W - 0.1, W, 0.44, 0.8, 0, D, tone(c, -25));
      for (let n = 0; n < 3; n++)
        b(W * (0.12 + n * 0.27), W * (0.34 + n * 0.27), 0.58, 0.88, 0.12, 0.32, '#f0e7d8');
      for (const u of [0.07, W - 0.07])
        for (const v of [0.07, D - 0.07])
          b(u - 0.03, u + 0.03, 0, 0.1, v - 0.03, v + 0.03, '#5a4a3a');
      break;
    }
    case 'loft': {
      const top = 1.35;
      for (const u of [0.06, W - 0.06])
        for (const v of [0.06, D - 0.06])
          b(u - 0.045, u + 0.045, 0, top + 0.52, v - 0.045, v + 0.045, c);
      b(0, W, top, top + 0.1, 0, D, tone(c, -15));
      b(0.05, W - 0.05, top + 0.1, top + 0.3, 0.07, D - 0.07, '#dfe3ea');
      b(W * 0.14, W * 0.86, top + 0.3, top + 0.4, 0.15, 0.52, '#f8f4e8');
      // A rail down each side of the platform.
      for (const u of [0, W - 0.05])
        b(u, u + 0.05, top + 0.1, top + 0.52, 0.12, D - 0.12, tone(c, -10));
      // The desk underneath, and the ladder at the foot.
      b(0.06, W - 0.06, 0.72, 0.78, 0.12, D * 0.5, '#b8976f');
      b(0.08, 0.14, 0, 0.72, 0.14, D * 0.48, '#a08a6c');
      b(W - 0.14, W - 0.08, 0, 0.72, 0.14, D * 0.48, '#a08a6c');
      for (let n = 0; n < 4; n++)
        b(0.12, W - 0.12, 0.36 + n * 0.32, 0.4 + n * 0.32, D - 0.055, D - 0.01, tone(c, -20));
      break;
    }
    case 'sectional': {
      const arm = 0.2,
        run = Math.min(0.95, D * 0.45);
      b(0, W, 0.08, 0.44, 0, run, c);
      b(W - run, W, 0.08, 0.44, 0, D, c);
      b(0, W, 0.44, 0.86, 0, 0.2, tone(c, -10));
      b(W - 0.2, W, 0.44, 0.86, 0, D, tone(c, -10));
      b(0, arm, 0.08, 0.62, 0, run, tone(c, -4));
      b(W - run, W - 0.2, 0.44, 0.6, D - arm, D, tone(c, -4));
      const seats = Math.max(2, Math.round((W - run - arm) / 0.9));
      const sw = (W - run - arm) / seats;
      for (let n = 0; n < seats; n++)
        b(
          arm + n * sw + 0.02,
          arm + (n + 1) * sw - 0.02,
          0.44,
          0.56,
          0.22,
          run - 0.04,
          tone(c, 18),
        );
      b(W - run + 0.02, W - 0.22, 0.44, 0.56, run + 0.02, D - arm - 0.02, tone(c, 18));
      for (const [u, v] of [
        [0.06, 0.06],
        [W - 0.06, 0.06],
        [0.06, run - 0.06],
        [W - 0.06, D - 0.06],
        [W - run + 0.06, D - 0.06],
      ])
        b(u - 0.03, u + 0.03, 0, 0.08, v - 0.03, v + 0.03, '#5a4a3a');
      break;
    }
    case 'ottoman':
      b(0.04, W - 0.04, 0.12, 0.4, 0.04, D - 0.04, c);
      b(0, W, 0.34, 0.46, 0, D, tone(c, 14));
      for (const u of [0.09, W - 0.09])
        for (const v of [0.09, D - 0.09])
          b(u - 0.03, u + 0.03, 0, 0.12, v - 0.03, v + 0.03, '#5a4a3a');
      break;
    case 'pooltable': {
      const rail = '#6b4b2f';
      b(0.1, W - 0.1, 0.3, 0.76, 0.1, D - 0.1, rail);
      b(0, W, 0.76, 0.8, 0, D, rail);
      b(0.11, W - 0.11, 0.79, 0.81, 0.11, D - 0.11, c);
      for (const u of [0.17, W / 2, W - 0.17])
        for (const v of [0.17, D - 0.17]) cyl(u, v, 0.055, 0.77, 0.8, '#2b2b2b');
      for (const u of [0.24, W - 0.24])
        for (const v of [0.24, D - 0.24])
          b(u - 0.07, u + 0.07, 0, 0.3, v - 0.07, v + 0.07, '#5a3f27');
      const balls = ['#d8b13a', '#c0392b', '#2e6fa7', '#8e44ad', '#e07b39', '#2f6b4f'];
      for (let row = 0; row < 3; row++)
        for (let n = 0; n <= row; n++)
          ball(
            W * 0.66 + row * 0.07,
            0.845,
            D / 2 + (n - row / 2) * 0.075,
            0.033,
            balls[(row + n) % 6],
          );
      ball(W * 0.28, 0.845, D / 2, 0.033, '#f6f3ea');
      break;
    }
    case 'wetbar': {
      b(0, W, 0.1, 1.05, 0, D * 0.78, c);
      b(0.04, W - 0.04, 0, 0.1, 0.04, D * 0.72, tone(c, -28));
      b(-0.04, W + 0.04, 1.05, 1.11, -0.04, D * 0.78 + 0.04, '#3b3a38');
      b(0.1, W - 0.1, 0.52, 0.56, 0.06, D * 0.3, tone(c, 22));
      for (let n = 0; n < 6; n++)
        cyl(
          0.16 + n * ((W - 0.32) / 5),
          D * 0.16,
          0.035,
          0.56,
          0.82,
          n % 2 ? '#7a8f6a' : '#5d3f2c',
        );
      break;
    }
    case 'stools': {
      const n = Math.max(1, Math.round(W / 0.55));
      for (let k = 0; k < n; k++) {
        const u = (W / n) * (k + 0.5);
        cyl(u, D / 2, 0.05, 0.02, 0.66, '#8a8f92');
        cyl(u, D / 2, 0.16, 0.02, 0.06, '#8a8f92');
        cyl(u, D / 2, 0.17, 0.66, 0.73, c);
        b(u - 0.16, u + 0.16, 0.73, 1.02, D / 2 - 0.03, D / 2 + 0.03, tone(c, -14));
      }
      break;
    }
    case 'toybox':
      b(0, W, 0, 0.45, 0, D, c);
      b(-0.02, W + 0.02, 0.45, 0.52, -0.02, D + 0.02, tone(c, 16));
      b(W * 0.42, W * 0.58, 0.52, 0.55, D * 0.42, D * 0.58, '#8a8f92');
      break;
    case 'pergola': {
      const h = 2.4;
      for (const u of [0.11, W - 0.11])
        for (const v of [0.11, D - 0.11]) b(u - 0.08, u + 0.08, 0, h, v - 0.08, v + 0.08, c);
      for (const v of [0.11, D - 0.11]) b(0, W, h, h + 0.14, v - 0.08, v + 0.08, tone(c, 8));
      for (let n = 0; n <= 7; n++) {
        const v = (D / 7) * n;
        b(
          0.02,
          W - 0.02,
          h + 0.14,
          h + 0.26,
          Math.max(0, v - 0.05),
          Math.min(D, v + 0.05),
          tone(c, 14),
        );
      }
      for (let n = 0; n <= 5; n++) {
        const u = (W / 5) * n;
        b(Math.max(0, u - 0.04), Math.min(W, u + 0.04), h + 0.26, h + 0.32, 0, D, tone(c, 22));
      }
      break;
    }
    case 'grill': {
      b(W * 0.06, W * 0.72, 0.5, 0.92, 0.08, D - 0.08, c);
      b(W * 0.04, W * 0.74, 0.92, 0.98, 0.04, D - 0.04, tone(c, 20));
      b(W * 0.06, W * 0.72, 0.98, 1.14, 0.04, D * 0.42, tone(c, -14));
      b(W * 0.74, W - 0.02, 0.64, 0.7, 0.1, D - 0.1, tone(c, 26));
      for (const u of [W * 0.12, W * 0.64]) {
        b(u - 0.03, u + 0.03, 0.16, 0.5, 0.12, D - 0.12, '#4a4e50');
        cyl(u, 0.16, 0.085, 0, 0.16, '#2a2a2a');
        cyl(u, D - 0.16, 0.085, 0, 0.16, '#2a2a2a');
      }
      break;
    }
    case 'swing': {
      const h = 2.1;
      for (const u of [0.12, W - 0.12])
        for (const v of [0.14, D - 0.14]) {
          const leg = b(u - 0.06, u + 0.06, 0, h, v - 0.06, v + 0.06, c);
          if (leg) leg.rotation.x = (v < D / 2 ? -1 : 1) * 0.2;
        }
      b(0, W, h - 0.06, h + 0.06, D / 2 - 0.06, D / 2 + 0.06, tone(c, -14));
      for (const u of [W * 0.3, W * 0.7]) {
        for (const du of [-0.22, 0.22])
          b(u + du - 0.015, u + du + 0.015, 0.52, h - 0.06, D / 2 - 0.02, D / 2 + 0.02, '#6f757a');
        b(u - 0.25, u + 0.25, 0.48, 0.53, D / 2 - 0.12, D / 2 + 0.12, '#c0563a');
      }
      break;
    }
    case 'trampoline': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, r, 0.44, 0.52, '#2f3a40');
      cyl(W / 2, D / 2, r - 0.1, 0.48, 0.55, c);
      for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2;
        const u = W / 2 + Math.cos(a) * (r - 0.06),
          v = D / 2 + Math.sin(a) * (r - 0.06);
        cyl(u, v, 0.05, 0, 0.44, '#6f757a');
        cyl(u, v, 0.035, 0.52, 2.2, '#8b9298');
      }
      break;
    }
    case 'hoop': {
      cyl(W / 2, D - 0.16, 0.07, 0, 3.05, c);
      b(W * 0.18, W * 0.82, 2.55, 3.32, D * 0.24, D * 0.3, '#f1ede0');
      b(W * 0.36, W * 0.64, 2.72, 2.98, D * 0.21, D * 0.24, '#c0563a');
      cyl(W / 2, D * 0.1, 0.23, 2.72, 2.755, '#d4522e');
      b(W / 2 - 0.03, W / 2 + 0.03, 2.73, 2.76, D * 0.1, D * 0.24, '#d4522e');
      break;
    }
    case 'mailbox':
      cyl(W / 2, D / 2, 0.05, 0, 1.1, c);
      b(W * 0.16, W * 0.84, 1.1, 1.38, D * 0.1, D * 0.9, tone(c, 34));
      b(W * 0.85, W * 0.95, 1.16, 1.42, D * 0.44, D * 0.5, '#c0563a');
      break;
    case 'bed':
      b(0, W, 0.1, 0.4, 0, D, '#a79178');
      b(W * 0.015, W * 0.985, 0.4, 0.62, 0.1, D * 0.985, c);
      b(0, W, 0.1, 1.15, 0, 0.1, '#9b8b7c');
      for (let n = 0; n < 2; n++)
        b(W * (0.06 + n * 0.48), W * (0.46 + n * 0.48), 0.62, 0.76, 0.16, 0.56, '#f8f4e8');
      b(W * 0.01, W * 0.99, 0.62, 0.66, D * 0.5, D * 0.99, '#a8b9b4');
      break;
    case 'table':
      b(0, W, 0.72, 0.78, 0, D, c);
      for (const u of [0.08, W - 0.08])
        for (const v of [0.08, D - 0.08])
          b(u - 0.035, u + 0.035, 0, 0.72, v - 0.035, v + 0.035, '#73634e');
      if (D > 0.7 && W > 1)
        for (let n = 0; n < Math.max(1, Math.floor(W / 0.75)); n++) {
          const u = (W / Math.max(1, Math.floor(W / 0.75))) * (n + 0.5);
          for (const side of [-1, 1]) {
            const v0 = side < 0 ? -0.5 : D + 0.05,
              v1 = side < 0 ? -0.05 : D + 0.5;
            b(u - 0.22, u + 0.22, 0.42, 0.47, v0, v1, '#b9b09b');
            const back = side < 0 ? v0 : v1 - 0.05;
            b(u - 0.22, u + 0.22, 0.47, 0.9, back, back + 0.05, '#b9b09b');
            for (const du of [-0.18, 0.18])
              b(u + du - 0.02, u + du + 0.02, 0, 0.42, v0 + 0.05, v0 + 0.09, '#8a7a62');
          }
        }
      break;
    case 'coffee':
      b(0, W, 0.38, 0.44, 0, D, c);
      b(0.06, W - 0.06, 0.1, 0.13, 0.06, D - 0.06, tone(c, -15));
      for (const u of [0.06, W - 0.06])
        for (const v of [0.06, D - 0.06])
          b(u - 0.03, u + 0.03, 0, 0.38, v - 0.03, v + 0.03, tone(c, -30));
      break;
    case 'laundry': {
      // One machine when it's narrow (stacked), two when it's wide (side by side).
      const stacked = W < 1.05;
      const units: [number, number, number, number][] = stacked
        ? [
            [0.02, W - 0.02, 0.02, 0.85],
            [0.02, W - 0.02, 0.87, 1.7],
          ]
        : [
            [0.02, W / 2 - 0.02, 0.02, 0.9],
            [W / 2 + 0.02, W - 0.02, 0.02, 0.9],
          ];
      for (const [u0, u1, y0, y1] of units) {
        b(u0, u1, y0, y1, 0, D, c);
        // Control panel across the back, porthole door on the front.
        b(u0, u1, y1 - 0.12, y1, 0, 0.12, tone(c, -18));
        const cu = (u0 + u1) / 2,
          r = Math.min((u1 - u0) / 2, (y1 - y0) / 2) - 0.09;
        b(cu - r, cu + r, (y0 + y1) / 2 - r, (y0 + y1) / 2 + r, D - 0.02, D + 0.01, tone(c, -35));
        b(
          cu - r + 0.05,
          cu + r - 0.05,
          (y0 + y1) / 2 - r + 0.05,
          (y0 + y1) / 2 + r - 0.05,
          D,
          D + 0.02,
          '#5d6b70',
        );
      }
      break;
    }
    case 'utility':
      b(0, W, 0.1, 0.85, 0, D, c);
      b(-0.01, W + 0.01, 0.85, 0.9, -0.01, D + 0.01, '#eceeec');
      b(W * 0.12, W * 0.88, 0.72, 0.86, D * 0.12, D * 0.88, '#b9c2c2');
      cyl(W / 2, 0.12, 0.02, 0.9, 1.2, '#9aa3a3');
      break;
    case 'bunk': {
      const post = 0.07;
      for (const u of [post, W - post])
        for (const v of [post, D - post]) b(u - post, u + post, 0, 1.75, v - post, v + post, c);
      // Two mattresses, a guard rail up top, and a ladder at the foot.
      for (const base of [0.33, 1.25]) {
        b(0.02, W - 0.02, base, base + 0.1, 0.02, D - 0.02, c);
        b(0.05, W - 0.05, base + 0.1, base + 0.28, 0.05, D - 0.05, tone(c, 45));
        b(W * 0.12, W * 0.88, base + 0.28, base + 0.38, 0.12, 0.5, '#f8f4e8');
      }
      for (const u of [0.04, W - 0.04]) b(u - 0.03, u + 0.03, 1.53, 1.61, 0.1, D * 0.62, c);
      for (let n = 0; n < 4; n++)
        b(W * 0.2, W * 0.8, 0.45 + n * 0.28, 0.51 + n * 0.28, D + 0.02, D + 0.1, tone(c, -10));
      for (const u of [W * 0.2, W * 0.8])
        b(u - 0.03, u + 0.03, 0.3, 1.5, D + 0.02, D + 0.1, tone(c, -10));
      break;
    }
    case 'shelf': {
      const back = 0.03,
        side = 0.04,
        h = 2.05,
        shelves = 5;
      b(0, side, 0, h, 0, D, c);
      b(W - side, W, 0, h, 0, D, c);
      b(0, W, 0, 0.08, 0, D, c);
      b(0, W, h - 0.06, h, 0, D, c);
      b(0, W, 0, h, 0, back, tone(c, -18));
      const spine = ['#8a5a4a', '#5e7460', '#4a5b74', '#8a7a4a', '#6d4f66', '#a3653f', '#556b6e'];
      for (let n = 1; n < shelves; n++) {
        const y = 0.08 + ((h - 0.2) / shelves) * n;
        b(side, W - side, y, y + 0.03, back, D - 0.01, tone(c, 10));
      }
      // Books: a run of spines of slightly different heights and widths per shelf.
      for (let n = 0; n < shelves; n++) {
        const y = 0.08 + ((h - 0.2) / shelves) * n + 0.03;
        const top = 0.08 + ((h - 0.2) / shelves) * (n + 1);
        let u = side + 0.03;
        let k = n * 7;
        while (u < W - side - 0.06) {
          const wide = 0.03 + ((k * 37) % 5) * 0.012;
          const tall = (top - y) * (0.62 + ((k * 53) % 4) * 0.08);
          if (u + wide > W - side - 0.03) break;
          b(u, u + wide, y, y + tall, back + 0.02, D - 0.04, spine[(k * 3) % spine.length]);
          u += wide + 0.005;
          k++;
          // Leave the odd gap, as shelves really look.
          if ((k * 29) % 11 === 0) u += 0.05;
        }
      }
      break;
    }
    case 'counterPlain':
    case 'counterSink': {
      // Base cabinets under a worktop. Nothing else unless you ask for the sink.
      const run = (u0: number, u1: number, v0: number, v1: number) => {
        b(u0, u1, 0.1, 0.88, v0, v1, c);
        b(u0, u1, 0, 0.1, v0 + 0.05, v1 - 0.05, '#6b6358');
        b(u0 - 0.01, u1 + 0.01, 0.88, 0.92, v0, v1 + 0.02, '#f1ede0');
        for (let n = 1; n < Math.max(2, Math.round((u1 - u0) / 0.6)); n++) {
          const u = u0 + ((u1 - u0) / Math.max(2, Math.round((u1 - u0) / 0.6))) * n;
          b(u - 0.005, u + 0.005, 0.15, 0.85, v1, v1 + 0.004, tone(c, -25));
        }
      };
      run(0, W, 0, D);
      if (item.kind === 'counterSink') {
        const at = W / 2;
        b(at - 0.3, at + 0.3, 0.86, 0.925, 0.12, D - 0.12, '#b8c0c0');
        cyl(at, 0.12, 0.02, 0.92, 1.2, '#9aa3a3');
      }
      break;
    }
    case 'counterL': {
      const arm = Math.min(0.7, Math.min(W, D) * 0.4);
      for (const [u0, u1, v0, v1] of [
        [0, W, 0, arm],
        [0, arm, arm, D],
      ] as [number, number, number, number][]) {
        b(u0, u1, 0.1, 0.88, v0, v1, c);
        b(u0, u1, 0, 0.1, v0 + 0.05, v1 - 0.05, '#6b6358');
        b(u0 - 0.01, u1 + 0.01, 0.88, 0.92, v0 - 0.01, v1 + 0.01, '#f1ede0');
      }
      for (let u = 0.6; u < W - 0.1; u += 0.6)
        b(u - 0.005, u + 0.005, 0.15, 0.85, arm, arm + 0.004, tone(c, -25));
      for (let v = arm + 0.6; v < D - 0.1; v += 0.6)
        b(arm, arm + 0.004, 0.15, 0.85, v - 0.005, v + 0.005, tone(c, -25));
      break;
    }
    case 'islandSink':
      worktop();
      sink(W / 2, D / 2);
      break;
    case 'islandStove':
      worktop();
      cooktop(W / 2, D / 2);
      // A slim extractor hood floating above.
      b(
        W / 2 - 0.45,
        W / 2 + 0.45,
        ceiling - 0.75,
        ceiling - 0.6,
        D / 2 - 0.32,
        D / 2 + 0.32,
        '#c9cecd',
      );
      b(W / 2 - 0.08, W / 2 + 0.08, ceiling - 0.6, ceiling, D / 2 - 0.08, D / 2 + 0.08, '#c9cecd');
      break;
    case 'islandL': {
      // Two arms meeting in a corner, with a sink in the longer one.
      const arm = Math.min(0.95, Math.min(W, D) * 0.45);
      b(0, W, 0, 0.9, 0, arm, c);
      b(0, arm, 0, 0.9, arm, D, c);
      b(-0.03, W + 0.03, 0.9, 0.94, -0.03, arm + 0.03, '#f1ede0');
      b(-0.03, arm + 0.03, 0.9, 0.94, arm, D + 0.03, '#f1ede0');
      sink(W - arm / 2 - 0.35, arm / 2, 0.55, Math.min(0.42, arm - 0.2));
      break;
    }
    case 'islandRound': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, r - 0.06, 0, 0.9, c);
      cyl(W / 2, D / 2, r, 0.9, 0.94, '#f1ede0');
      break;
    }
    case 'range':
      b(0.02, W - 0.02, 0, 0.9, 0.02, D, c);
      b(0.02, W - 0.02, 0.9, 0.93, 0.02, D, '#3a3f3d');
      for (const du of [0.26, 0.5, 0.74])
        for (const dv of [0.32, 0.68]) cyl(W * du, D * dv, 0.07, 0.93, 0.945, '#4a4f4d');
      b(W * 0.12, W * 0.88, 0.2, 0.62, D, D + 0.01, '#2a2f2e');
      b(W * 0.1, W * 0.9, 0.66, 0.72, D, D + 0.05, '#9aa3a3');
      // Hood above.
      b(0, W, ceiling - 0.85, ceiling - 0.62, 0, D * 0.7, '#c9cecd');
      b(W * 0.35, W * 0.65, ceiling - 0.62, ceiling, 0.02, D * 0.3, '#c9cecd');
      break;
    case 'dishwasher':
      b(0.02, W - 0.02, 0, 0.86, 0.02, D, c);
      b(0.04, W - 0.04, 0.12, 0.82, D, D + 0.01, tone(c, -12));
      b(0.08, W - 0.08, 0.72, 0.78, D + 0.01, D + 0.05, '#9aa3a3');
      break;
    case 'cabinet': {
      const h = Math.min(2.2, ceiling - 0.2);
      b(0, W, 0, h, 0, D, c);
      for (const y of [h * 0.5, h * 0.98]) b(0, W, y - 0.01, y + 0.01, D, D + 0.005, tone(c, -25));
      for (const du of [W * 0.45, W * 0.55])
        b(du - 0.02, du + 0.02, h * 0.42, h * 0.58, D, D + 0.03, '#d9cdb8');
      break;
    }
    case 'uppers':
      b(0, W, 1.45, 2.2, 0, D, c);
      for (let n = 1; n < Math.max(2, Math.round(W / 0.6)); n++) {
        const u = (W / Math.max(2, Math.round(W / 0.6))) * n;
        b(u - 0.005, u + 0.005, 1.5, 2.15, D, D + 0.004, tone(c, -25));
      }
      b(0, W, 1.42, 1.45, 0, D + 0.02, tone(c, -10));
      break;
    case 'mirror':
      b(0, W, 0.95, 2.05, 0, D, tone(c, -35));
      b(0.04, W - 0.04, 1, 2, D - 0.02, D + 0.01, mat('#dbe9ea', { rough: 0.05, metal: 0.8 }));
      break;
    case 'picture': {
      // One frame, or a row of them across a wider span.
      const frames = W > 1.4 ? 3 : 1;
      const each = W / frames;
      for (let n = 0; n < frames; n++) {
        const u0 = n * each + 0.06,
          u1 = (n + 1) * each - 0.06;
        const h = item.posterText ? 1.1 : 0.55 + ((n * 7) % 3) * 0.12;
        const base = item.posterText ? 1.05 : 1.45 - h / 2 + ((n * 5) % 2) * 0.1;
        b(u0, u1, base, base + h, 0, D, c);
        b(
          u0 + 0.05,
          u1 - 0.05,
          base + 0.05,
          base + h - 0.05,
          D - 0.01,
          D + 0.005,
          item.posterText
            ? new T.MeshStandardMaterial({
                map: posterTexture(item.posterText, c),
                roughness: 0.85,
              })
            : ['#c6cdd6', '#d8c9b4', '#b9c9bd'][n % 3],
        );
      }
      break;
    }
    case 'tvwall':
      b(0, W, 1.05, 1.05 + W * 0.56, 0, D, mat('#1d2123', { rough: 0.25, metal: 0.4 }));
      break;
    case 'roundTable': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, r, 0.72, 0.78, c);
      cyl(W / 2, D / 2, 0.08, 0, 0.72, '#73634e');
      cyl(W / 2, D / 2, r * 0.45, 0, 0.06, '#73634e');
      for (let n = 0; n < 4; n++) {
        const a = (n * Math.PI) / 2 + Math.PI / 4;
        const cu = W / 2 + Math.sin(a) * (r + 0.32),
          cv = D / 2 + Math.cos(a) * (r + 0.32);
        b(cu - 0.22, cu + 0.22, 0.42, 0.47, cv - 0.22, cv + 0.22, '#b9b09b');
      }
      break;
    }
    case 'chandelier': {
      const drop = Math.min(1.1, ceiling * 0.32);
      const top = ceiling,
        base = ceiling - drop;
      b(W / 2 - 0.02, W / 2 + 0.02, base, top, D / 2 - 0.02, D / 2 + 0.02, '#8a7f63');
      cyl(W / 2, D / 2, Math.min(W, D) * 0.34, base, base + 0.05, c);
      for (let n = 0; n < 6; n++) {
        const a = (n * Math.PI) / 3;
        const cu = W / 2 + Math.sin(a) * Math.min(W, D) * 0.34,
          cv = D / 2 + Math.cos(a) * Math.min(W, D) * 0.34;
        cyl(cu, cv, 0.05, base - 0.16, base, mat('#fff3d0', { emissive: '#ffd489' }));
      }
      break;
    }
    case 'pendant': {
      const drop = Math.min(0.9, ceiling * 0.26);
      const lamps = Math.max(1, Math.round(W / 0.55));
      for (let n = 0; n < lamps; n++) {
        const u = (W / lamps) * (n + 0.5);
        b(u - 0.01, u + 0.01, ceiling - drop, ceiling, D / 2 - 0.01, D / 2 + 0.01, '#8a7f63');
        cyl(u, D / 2, 0.11, ceiling - drop - 0.22, ceiling - drop, c);
        cyl(
          u,
          D / 2,
          0.09,
          ceiling - drop - 0.25,
          ceiling - drop - 0.22,
          mat('#fff3d0', { emissive: '#ffd489' }),
        );
      }
      break;
    }
    case 'fan': {
      const hub = ceiling - 0.35;
      b(W / 2 - 0.03, W / 2 + 0.03, hub, ceiling, D / 2 - 0.03, D / 2 + 0.03, '#8a7f63');
      cyl(W / 2, D / 2, 0.14, hub - 0.08, hub, c);
      for (let n = 0; n < 4; n++) {
        const along = n % 2 === 0;
        const len = Math.min(W, D) / 2;
        const dir = n < 2 ? 1 : -1;
        if (along)
          b(
            W / 2 + (dir > 0 ? 0.1 : -len),
            W / 2 + (dir > 0 ? len : -0.1),
            hub - 0.03,
            hub,
            D / 2 - 0.12,
            D / 2 + 0.12,
            tone(c, -20),
          );
        else
          b(
            W / 2 - 0.12,
            W / 2 + 0.12,
            hub - 0.03,
            hub,
            D / 2 + (dir > 0 ? 0.1 : -len),
            D / 2 + (dir > 0 ? len : -0.1),
            tone(c, -20),
          );
      }
      cyl(W / 2, D / 2, 0.11, hub - 0.22, hub - 0.08, mat('#fff3d0', { emissive: '#ffd489' }));
      break;
    }
    case 'floorlamp':
      cyl(W / 2, D / 2, Math.min(W, D) * 0.34, 0, 0.04, tone(c, -30));
      cyl(W / 2, D / 2, 0.025, 0.04, 1.45, tone(c, -30));
      cyl(W / 2, D / 2, Math.min(W, D) * 0.42, 1.45, 1.75, c);
      cyl(W / 2, D / 2, Math.min(W, D) * 0.3, 1.4, 1.45, mat('#fff3d0', { emissive: '#ffd489' }));
      break;
    case 'sconce':
      b(0, W, 1.75, 1.95, 0, D * 0.4, tone(c, -25));
      b(0.02, W - 0.02, 1.95, 2.15, 0, D, mat('#fff3d0', { emissive: '#ffd489' }));
      break;
    case 'dresser': {
      const h = W < 0.7 ? 0.6 : 0.9;
      const drawers = W < 0.7 ? 2 : 3;
      b(0, W, 0.06, h, 0, D, c);
      for (const u of [0.05, W - 0.05])
        for (const v of [0.05, D - 0.05])
          b(u - 0.03, u + 0.03, 0, 0.06, v - 0.03, v + 0.03, tone(c, -30));
      for (let n = 0; n < drawers; n++) {
        const y = 0.1 + ((h - 0.16) / drawers) * n;
        b(0.04, W - 0.04, y, y + (h - 0.16) / drawers - 0.03, D, D + 0.008, tone(c, 12));
        b(W / 2 - 0.09, W / 2 + 0.09, y + 0.05, y + 0.09, D + 0.008, D + 0.03, '#d9cdb8');
      }
      break;
    }
    case 'crib':
      b(0, W, 0.18, 0.42, 0, D, tone(c, 10));
      for (const u of [0.04, W - 0.04])
        for (const v of [0.04, D - 0.04]) b(u - 0.04, u + 0.04, 0, 0.95, v - 0.04, v + 0.04, c);
      for (let u = 0.12; u < W - 0.1; u += 0.12)
        for (const v of [0.04, D - 0.04])
          b(u - 0.015, u + 0.015, 0.42, 0.9, v - 0.015, v + 0.015, c);
      for (let v = 0.14; v < D - 0.1; v += 0.12)
        for (const u of [0.04, W - 0.04])
          b(u - 0.015, u + 0.015, 0.42, 0.9, v - 0.015, v + 0.015, c);
      b(0.06, W - 0.06, 0.42, 0.52, 0.06, D - 0.06, '#f8f4e8');
      break;
    case 'deskL': {
      const arm = Math.min(0.75, Math.min(W, D) * 0.5);
      b(0, W, 0.72, 0.76, 0, arm, c);
      b(0, arm, 0.72, 0.76, arm, D, c);
      for (const [u, v] of [
        [0.06, 0.06],
        [W - 0.06, 0.06],
        [0.06, D - 0.06],
        [arm - 0.06, arm - 0.06],
      ])
        b(u - 0.03, u + 0.03, 0, 0.72, v - 0.03, v + 0.03, tone(c, -25));
      b(W * 0.55, W * 0.55 + 0.45, 0.45, 0.5, arm + 0.15, arm + 0.6, '#6d6a66');
      break;
    }
    case 'shed': {
      const wallTop = 1.9;
      b(0, W, 0, wallTop, 0, D, c);
      // Doors on the front, a simple gable over the top.
      b(W * 0.22, W * 0.78, 0.05, 1.75, D, D + 0.02, tone(c, -18));
      b(W * 0.49, W * 0.51, 0.05, 1.75, D + 0.02, D + 0.03, tone(c, -35));
      // A pitched roof: two panels leaning against a ridge along the length.
      const rise = 0.55,
        half = D / 2,
        panel = Math.hypot(half, rise),
        tilt = Math.atan2(rise, half),
        roof = tone(c, -28);
      for (const side of [-1, 1]) {
        const m = b(
          -0.12,
          W + 0.12,
          wallTop + rise / 2 - 0.05,
          wallTop + rise / 2 + 0.05,
          half - panel / 2,
          half + panel / 2,
          roof,
        );
        if (m) {
          m.rotation.x = side * tilt;
          m.position.z += (side * (half + 0.02)) / 2 - (side * panel) / 4;
        }
      }
      // Close the gable ends.
      for (const v of [0.02, D - 0.02])
        b(0, W, wallTop, wallTop + rise * 0.45, v - 0.02, v + 0.02, c);
      break;
    }
    case 'firepit': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, r, 0, 0.12, tone(c, -10));
      cyl(W / 2, D / 2, r * 0.82, 0.12, 0.42, c);
      cyl(W / 2, D / 2, r * 0.6, 0.12, 0.3, '#3a332c');
      cyl(W / 2, D / 2, r * 0.42, 0.3, 0.5, mat('#ff9a3c', { emissive: '#ff7a1a' }));
      break;
    }
    case 'hottub': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, r, 0, 0.85, c);
      cyl(W / 2, D / 2, r - 0.14, 0.85, 0.9, tone(c, -18));
      cyl(W / 2, D / 2, r - 0.2, 0.62, 0.68, mat('#7fd0d6', { rough: 0.12, metal: 0.25 }));
      break;
    }
    case 'planter':
      b(0, W, 0, 0.5, 0, D, c);
      b(0.06, W - 0.06, 0.5, 0.56, 0.06, D - 0.06, '#5f4b38');
      for (let u = 0.2; u < W - 0.1; u += 0.32)
        ball(u, 0.72, D / 2 + ((u * 7) % 2) * 0.08 - 0.04, 0.16, '#6f9569');
      break;
    case 'bench': {
      for (const u of [0.12, W - 0.12]) {
        b(u - 0.05, u + 0.05, 0, 0.42, 0.06, 0.16, tone(c, -20));
        b(u - 0.05, u + 0.05, 0, 0.42, D - 0.16, D - 0.06, tone(c, -20));
        b(u - 0.05, u + 0.05, 0.42, 0.95, D - 0.16, D - 0.06, tone(c, -20));
      }
      for (let v = 0.06; v < D - 0.05; v += 0.13) b(0.04, W - 0.04, 0.42, 0.47, v, v + 0.1, c);
      for (const y of [0.62, 0.78, 0.9]) b(0.04, W - 0.04, y, y + 0.1, D - 0.14, D - 0.08, c);
      break;
    }
    case 'xmas': {
      const r = Math.min(W, D) / 2;
      cyl(W / 2, D / 2, 0.12, 0, 0.22, '#7a5b3f');
      cyl(W / 2, D / 2, r * 0.55, 0.12, 0.28, '#b03a3a');
      // Tiers of branches, narrowing toward the star.
      const tiers = 4;
      for (let n = 0; n < tiers; n++) {
        const y = 0.28 + n * 0.42;
        const rad = r * (1 - n * 0.22);
        cyl(W / 2, D / 2, rad, y, y + 0.46, c);
      }
      // Baubles and a star on top.
      const baubles = ['#c4453f', '#d8b04a', '#c9d6dd', '#8a5fa8'];
      for (let n = 0; n < 14; n++) {
        const tier = n % tiers;
        const a = (n * 2.39) % (Math.PI * 2);
        const rad = r * (1 - tier * 0.22) * 0.86;
        ball(
          W / 2 + Math.sin(a) * rad,
          0.42 + tier * 0.42,
          D / 2 + Math.cos(a) * rad,
          0.055,
          baubles[n % 4],
        );
      }
      ball(W / 2, 0.28 + tiers * 0.42 + 0.14, D / 2, 0.12, mat('#ffe9a8', { emissive: '#ffcf5a' }));
      break;
    }
    case 'grand': {
      // Keys at the front, the case sweeping back to a curved tail.
      const caseTop = 0.78;
      const bodyBack = D * 0.62;
      b(0, W, 0.62, caseTop, 0, bodyBack, c);
      cyl(W * 0.42, bodyBack, W * 0.58, 0.62, caseTop, c);
      // Keyboard and its cheeks.
      b(0, W, 0.6, 0.72, D - 0.34, D, tone(c, 8));
      b(0.04, W - 0.04, 0.72, 0.745, D - 0.3, D - 0.03, '#f4f1e8');
      for (let u = 0.12; u < W - 0.1; u += 0.105)
        b(u, u + 0.045, 0.745, 0.755, D - 0.29, D - 0.14, '#1b1c1d');
      // The lid, propped open over the case.
      const lid = b(0, W * 0.98, caseTop + 0.34, caseTop + 0.38, 0.02, bodyBack + W * 0.4, c);
      if (lid) lid.rotation.x = -0.32;
      b(W * 0.86, W * 0.9, caseTop, caseTop + 0.42, bodyBack * 0.55, bodyBack * 0.6, tone(c, 20));
      // Three legs and the pedal lyre.
      for (const [u, v] of [
        [0.12, D - 0.12],
        [W - 0.12, D - 0.12],
        [W * 0.45, 0.16],
      ])
        b(u - 0.05, u + 0.05, 0, 0.62, v - 0.05, v + 0.05, c);
      b(W * 0.45 - 0.07, W * 0.45 + 0.07, 0.12, 0.3, D * 0.52, D * 0.58, tone(c, 25));
      // Bench.
      b(W * 0.2, W * 0.8, 0.44, 0.5, D + 0.28, D + 0.62, tone(c, 12));
      for (const u of [W * 0.24, W * 0.76])
        for (const v of [D + 0.32, D + 0.58]) b(u - 0.03, u + 0.03, 0, 0.44, v - 0.03, v + 0.03, c);
      break;
    }
    case 'upright': {
      const h = 1.24;
      b(0, W, 0.12, h, 0, D * 0.75, c);
      // Music desk and the keyboard ledge on the front.
      b(0.03, W - 0.03, h - 0.42, h - 0.06, D * 0.75, D * 0.78, tone(c, 14));
      b(0, W, 0.62, 0.76, D * 0.7, D, tone(c, 8));
      b(0.05, W - 0.05, 0.76, 0.785, D * 0.72, D - 0.03, '#f4f1e8');
      for (let u = 0.12; u < W - 0.1; u += 0.105)
        b(u, u + 0.045, 0.785, 0.795, D * 0.74, D - 0.12, '#1b1c1d');
      for (const u of [0.06, W - 0.06]) b(u - 0.06, u + 0.06, 0, 0.12, 0, D * 0.75, tone(c, -15));
      // Pedals and bench.
      b(W / 2 - 0.09, W / 2 + 0.09, 0.05, 0.09, D * 0.5, D * 0.66, '#b9a06a');
      b(W * 0.2, W * 0.8, 0.44, 0.5, D + 0.3, D + 0.64, tone(c, 12));
      for (const u of [W * 0.24, W * 0.76])
        for (const v of [D + 0.34, D + 0.6]) b(u - 0.03, u + 0.03, 0, 0.44, v - 0.03, v + 0.03, c);
      break;
    }
    case 'clock': {
      const h = 2.05;
      // Case, with a glazed waist showing the pendulum.
      b(0, W, 0.06, h - 0.34, 0, D, c);
      b(0, W, 0, 0.06, -0.02, D + 0.02, tone(c, -18));
      b(
        W * 0.14,
        W * 0.86,
        0.5,
        h - 0.72,
        D - 0.02,
        D + 0.01,
        mat('#cfe0e2', { opacity: 0.35, rough: 0.1 }),
      );
      cyl(W / 2, D * 0.55, 0.05, 0.6, 1.25, '#c9a94f');
      cyl(W / 2, D * 0.55, 0.11, 0.55, 0.6, '#c9a94f');
      // Hood and face.
      b(-0.03, W + 0.03, h - 0.34, h - 0.06, -0.03, D + 0.03, c);
      b(W * 0.12, W * 0.88, h - 0.32, h - 0.08, D, D + 0.015, '#f4efe0');
      b(W / 2 - 0.015, W / 2 + 0.015, h - 0.22, h - 0.1, D + 0.015, D + 0.025, '#2a2522');
      b(W / 2 - 0.09, W / 2 + 0.015, h - 0.21, h - 0.185, D + 0.015, D + 0.025, '#2a2522');
      b(-0.05, W + 0.05, h - 0.06, h, -0.05, D + 0.05, tone(c, 12));
      break;
    }
    case 'desk':
      b(0, W, 0.72, 0.76, 0, D, c);
      b(0, 0.05, 0, 0.72, 0, D, c);
      b(W - 0.05, W, 0, 0.72, 0, D, c);
      b(W * 0.6, W - 0.05, 0.45, 0.72, 0.02, D - 0.02, tone(c, -12));
      b(W * 0.3, W * 0.3 + 0.45, 0.45, 0.5, D + 0.1, D + 0.55, '#6d6a66');
      b(W * 0.3, W * 0.3 + 0.45, 0.5, 0.95, D + 0.5, D + 0.55, '#6d6a66');
      break;
    case 'counter':
      b(0, W, 0, 0.9, 0, D, c);
      b(-0.03, W + 0.03, 0.9, 0.94, -0.03, D + 0.03, '#f1ede0');
      break;
    case 'kitchen': {
      b(0, W, 0.1, 0.88, 0, D, c);
      b(0, W, 0, 0.1, 0.05, D - 0.05, '#6b6358');
      b(-0.01, W + 0.01, 0.88, 0.92, 0, D + 0.02, '#f1ede0');
      b(0, W, 0.92, 1.45, 0, 0.02, '#e9e3d6');
      b(0, W, 1.45, 2.2, 0, 0.36, tone(c, 8));
      const sink = W * 0.3;
      b(sink - 0.3, sink + 0.3, 0.86, 0.925, 0.12, D - 0.12, '#b8c0c0');
      cyl(sink, 0.1, 0.02, 0.92, 1.2, '#9aa3a3');
      const cook = W * 0.72;
      b(cook - 0.32, cook + 0.32, 0.92, 0.935, 0.1, D - 0.08, '#2e3230');
      for (let n = 0; n < Math.max(2, Math.round(W / 0.6)); n++) {
        const u = (W / Math.max(2, Math.round(W / 0.6))) * n;
        b(u + 0.01, u + 0.02, 0.15, 0.85, D, D + 0.004, tone(c, -25));
      }
      break;
    }
    case 'fridge':
      b(0.02, W - 0.02, 0, 1.85, 0.02, D, c);
      b(0.02, W - 0.02, 1.22, 1.23, D, D + 0.005, '#a9aeac');
      b(W - 0.12, W - 0.09, 0.6, 1.1, D, D + 0.04, '#9da3a1');
      b(W - 0.12, W - 0.09, 1.3, 1.7, D, D + 0.04, '#9da3a1');
      break;
    case 'wardrobe':
      b(0, W, 0, 2.1, 0, D, c);
      for (let n = 1; n < Math.max(2, Math.round(W / 0.55)); n++) {
        const u = (W / Math.max(2, Math.round(W / 0.55))) * n;
        b(u - 0.004, u + 0.004, 0.05, 2.05, D, D + 0.004, tone(c, -30));
        b(u - 0.06, u - 0.04, 0.95, 1.25, D, D + 0.03, '#d9cdb8');
        b(u + 0.04, u + 0.06, 0.95, 1.25, D, D + 0.03, '#d9cdb8');
      }
      break;
    case 'media':
      b(0, W, 0.08, 0.5, 0, D, c);
      b(W * 0.2, W * 0.8, 0.55, 0.62, D * 0.35, D * 0.55, '#333');
      b(W * 0.08, W * 0.92, 0.95, 1.6, 0.02, 0.06, mat('#1d2123', { rough: 0.25, metal: 0.4 }));
      break;
    case 'fireplace':
      b(0, W, 0, 1.15, 0, D, c);
      b(W * 0.25, W * 0.75, 0.12, 0.75, D - 0.25, D + 0.001, '#2a2522');
      b(W * 0.3, W * 0.7, 0.14, 0.3, D - 0.2, D - 0.05, mat('#ff9a3c', { emissive: '#ff7a1a' }));
      b(-0.06, W + 0.06, 1.15, 1.22, -0.02, D + 0.08, '#8a735a');
      b(W * 0.12, W * 0.88, 1.22, FLOOR_H - 0.2, 0, D * 0.75, c);
      break;
    case 'plant':
      cyl(W / 2, D / 2, Math.min(W, D) * 0.3, 0, 0.4, '#c9b49a');
      ball(W / 2, 0.85, D / 2, Math.min(W, D) * 0.45, c);
      ball(W / 2 + 0.1, 1.15, D / 2 - 0.05, Math.min(W, D) * 0.32, tone(c, 15));
      break;
    case 'crt': {
      // A boxy tube television on a wooden stand, rabbit ears and all.
      b(0, W, 0.08, 0.6, 0, D, c);
      b(0.03, W - 0.03, 0, 0.08, 0.03, D - 0.03, tone(c, -30));
      b(0.05, W / 2 - 0.02, 0.14, 0.54, D - 0.01, D + 0.005, tone(c, 14));
      b(W / 2 + 0.02, W - 0.05, 0.14, 0.54, D - 0.01, D + 0.005, tone(c, 14));
      const tv = '#45484b';
      b(W * 0.1, W * 0.9, 0.6, 1.16, 0.05, D - 0.03, tv);
      b(
        W * 0.14,
        W * 0.7,
        0.66,
        1.1,
        D - 0.03,
        D - 0.01,
        mat('#5e7d8c', { rough: 0.2, emissive: '#1d2a30' }),
      );
      b(W * 0.73, W * 0.86, 0.68, 1.08, D - 0.03, D - 0.01, '#2b2d2f');
      for (const h of [0.95, 0.83]) cyl(W * 0.795, D - 0.005, 0.022, h, h + 0.04, '#b8b0a0');
      for (const lean of [-1, 1]) {
        const rod = b(
          W / 2 - 0.006,
          W / 2 + 0.006,
          1.16,
          1.62,
          D / 2 - 0.006,
          D / 2 + 0.006,
          '#b8b8b8',
        );
        if (rod) {
          rod.rotation.z = lean * 0.45;
          rod.position.x += lean * 0.1;
        }
      }
      break;
    }
    case 'computer': {
      // A desk with a gumdrop computer and a keyboard.
      b(0, W, 0.72, 0.76, 0, D, c);
      b(0, 0.42, 0, 0.72, 0.02, D - 0.02, tone(c, -12));
      for (const v of [0.18, 0.4, 0.58]) b(0.04, 0.38, v, v + 0.01, D - 0.02, D, tone(c, 18));
      b(W - 0.05, W, 0, 0.72, 0.03, D - 0.03, tone(c, -12));
      const shell = '#3aaeb0';
      b(W * 0.42, W * 0.82, 0.76, 1.2, 0.08, 0.46, shell);
      b(
        W * 0.46,
        W * 0.78,
        0.84,
        1.13,
        0.455,
        0.47,
        mat('#2d3a42', { rough: 0.2, emissive: '#16262b' }),
      );
      b(W * 0.4, W * 0.82, 0.76, 0.8, 0.46, 0.5, tone(shell, -20));
      b(W * 0.38, W * 0.84, 0.76, 0.785, 0.52, 0.64, '#ece8de');
      ball(W * 0.9, 0.78, 0.55, 0.035, shell);
      break;
    }
    case 'highchair': {
      for (const [u, v] of [
        [0.06, 0.06],
        [W - 0.06, 0.06],
        [0.06, D - 0.06],
        [W - 0.06, D - 0.06],
      ])
        b(u - 0.025, u + 0.025, 0, 0.82, v - 0.025, v + 0.025, c);
      b(0.04, W - 0.04, 0.3, 0.33, 0.04, D - 0.04, tone(c, -15));
      b(0.08, W - 0.08, 0.78, 0.84, 0.08, D - 0.08, c);
      b(0.08, W - 0.08, 0.84, 1.3, 0.05, 0.1, c);
      for (const u of [0.1, W - 0.1]) b(u - 0.02, u + 0.02, 0.84, 1.02, 0.1, D - 0.12, c);
      b(0.02, W - 0.02, 1.0, 1.03, D - 0.2, D + 0.12, tone(c, 22));
      break;
    }
    case 'changing': {
      b(0, W, 0.08, 0.86, 0, D, c);
      for (const h of [0.3, 0.58])
        b(0.04, W - 0.04, h, h + 0.01, D - 0.01, D + 0.005, tone(c, -20));
      b(0.04, W - 0.04, 0.86, 0.95, 0.04, D - 0.04, '#dfe9f0');
      b(0, W, 0.86, 1.02, 0, 0.04, c);
      for (const u of [0.02, W - 0.02]) b(u - 0.02, u + 0.02, 0.86, 1.0, 0, D, c);
      for (const u of [0.05, W - 0.05])
        b(u - 0.03, u + 0.03, 0, 0.08, 0.05, D - 0.05, tone(c, -25));
      break;
    }
    case 'radiator': {
      // Cast-iron columns under a wooden shelf.
      const cols = Math.max(4, Math.round((W - 0.1) / 0.065));
      const step = (W - 0.1) / cols;
      for (let n = 0; n < cols; n++) {
        const u = 0.05 + step * (n + 0.5);
        b(u - step * 0.36, u + step * 0.36, 0.1, 0.72, 0.03, D - 0.04, c);
      }
      b(0.04, W - 0.04, 0.14, 0.2, 0.05, D - 0.06, tone(c, -12));
      b(0.04, W - 0.04, 0.62, 0.68, 0.05, D - 0.06, tone(c, -12));
      for (const u of [0.07, W - 0.07]) b(u - 0.02, u + 0.02, 0, 0.1, 0.06, D - 0.08, tone(c, -25));
      b(-0.02, W + 0.02, 0.78, 0.81, -0.01, D + 0.03, '#a8845c');
      break;
    }
    case 'rugRound': {
      // A braided rug: rings of color stepping inward.
      const r = Math.min(W, D) / 2;
      const rings = [0, 14, -10, 18, -6, 10];
      rings.forEach((shift, n) => {
        const rr = r * (1 - n * 0.15);
        if (rr > 0.05) cyl(W / 2, D / 2, rr, 0, 0.012 + n * 0.001, tone(c, shift));
      });
      break;
    }
    case 'phonetable': {
      // A little telephone table with a shelf, a rotary phone, and a stool beside it.
      const tw = Math.min(W * 0.62, 0.6);
      b(0, tw, 0.66, 0.7, 0, D, c);
      b(0.03, tw - 0.03, 0.22, 0.25, 0.03, D - 0.03, c);
      for (const [u, v] of [
        [0.03, 0.03],
        [tw - 0.03, 0.03],
        [0.03, D - 0.03],
        [tw - 0.03, D - 0.03],
      ])
        b(u - 0.02, u + 0.02, 0, 0.66, v - 0.02, v + 0.02, tone(c, -20));
      b(tw * 0.25, tw * 0.75, 0.7, 0.78, D * 0.3, D * 0.75, '#26282b');
      b(tw * 0.22, tw * 0.78, 0.8, 0.84, D * 0.42, D * 0.58, '#26282b');
      cyl(tw / 2, D * 0.62, 0.04, 0.78, 0.785, '#d9d4c8');
      const su = tw + (W - tw) / 2;
      cyl(su, D / 2, Math.min(0.16, (W - tw) / 2 - 0.02), 0.42, 0.46, c);
      for (const a of [0.8, 2.4, 3.9, 5.5])
        cyl(su + Math.sin(a) * 0.1, D / 2 + Math.cos(a) * 0.1, 0.014, 0, 0.42, tone(c, -20));
      break;
    }
    case 'hutch': {
      // A kitchen dresser: cupboards below, plates on open shelves above.
      b(0, W, 0.08, 0.9, 0, D, c);
      b(-0.02, W + 0.02, 0.9, 0.94, -0.01, D + 0.02, tone(c, 16));
      for (const u of [W / 4, (W * 3) / 4])
        b(u - W / 4 + 0.04, u + W / 4 - 0.04, 0.16, 0.84, D - 0.01, D + 0.005, tone(c, 12));
      b(0.02, W - 0.02, 0.94, 2.0, 0, 0.3, c);
      b(0.06, W - 0.06, 0.98, 1.96, 0.28, 0.3, tone(c, -28));
      for (const h of [1.3, 1.64]) b(0.04, W - 0.04, h, h + 0.025, 0.02, 0.3, c);
      for (const h of [0.95, 1.325, 1.665]) {
        const plates = Math.floor((W - 0.2) / 0.24);
        for (let n = 0; n < plates; n++) {
          const u = 0.16 + n * 0.24;
          const plate = b(
            u - 0.1,
            u + 0.1,
            h + 0.02,
            h + 0.22,
            0.08,
            0.1,
            n % 2 ? '#f4f1e8' : '#e8f0f2',
          );
          if (plate) plate.rotation.x = -0.15;
        }
      }
      b(-0.04, W + 0.04, 2.0, 2.08, -0.02, 0.36, tone(c, 16));
      break;
    }
    case 'dollhouse': {
      b(0, W, 0, 0.4, 0, D, '#a8845c');
      const wall = tone(c, 30);
      b(0.05, W - 0.05, 0.4, 0.88, 0.06, D - 0.06, wall);
      const rise = 0.22;
      for (const side of [-1, 1]) {
        const slope = b(0, (W / 2) * 1.2, 0, 0.03, 0.02, D - 0.02, c);
        if (slope) {
          slope.position.set(side * W * 0.24, 0.88 + rise / 2, 0);
          slope.rotation.z = -side * Math.atan2(rise, W / 2);
        }
      }
      for (const u of [W * 0.25, W * 0.75])
        for (const h of [0.5, 0.7])
          b(u - 0.06, u + 0.06, h, h + 0.1, D - 0.065, D - 0.055, '#9fc8d8');
      b(W / 2 - 0.05, W / 2 + 0.05, 0.4, 0.58, D - 0.065, D - 0.055, '#8a5a44');
      break;
    }
    case 'curtains': {
      // A rod, a gathered valance, and a panel tied back at each side of the window.
      const rod = 2.34;
      b(-0.05, W + 0.05, rod, rod + 0.03, 0.08, 0.11, '#b8a27a');
      for (let u = 0; u < W - 0.01; u += 0.14)
        b(
          u,
          Math.min(W, u + 0.12),
          rod - 0.26,
          rod,
          0.03,
          D - (Math.round(u / 0.14) % 2 ? 0.02 : 0),
          c,
        );
      for (const [u0, u1] of [
        [0, W * 0.2],
        [W * 0.8, W],
      ]) {
        b(u0, u1, 0.88, rod - 0.2, 0.02, D - 0.03, c);
        b(u0 - 0.01, u1 + 0.01, 1.42, 1.48, 0.01, D - 0.01, tone(c, -25));
      }
      break;
    }
    case 'rug':
      b(0, W, 0, 0.012, 0, D, c);
      b(0.12, W - 0.12, 0.012, 0.016, 0.12, D - 0.12, tone(c, 12));
      break;
    case 'bathtub':
      b(0, W, 0, 0.55, 0, D, c);
      b(0.08, W - 0.08, 0.35, 0.56, 0.08, D - 0.08, mat('#bfdde0', { rough: 0.1, metal: 0.1 }));
      cyl(W - 0.12, D / 2, 0.02, 0.55, 0.75, '#a0a6a6');
      break;
    case 'shower': {
      b(0, W, 0, 0.05, 0, D, '#eef0ee');
      const glass = mat('#cfe6ea', { opacity: 0.28, rough: 0.05 });
      b(0, W, 0.05, 2.0, D - 0.02, D, glass);
      b(W - 0.02, W, 0.05, 2.0, 0, D, glass);
      cyl(0.15, 0.15, 0.015, 0.05, 2.05, '#a0a6a6');
      b(0.08, 0.3, 2.0, 2.03, 0.08, 0.3, '#a0a6a6');
      break;
    }
    case 'toilet':
      b(W * 0.1, W * 0.9, 0.35, 0.8, 0, D * 0.28, c);
      b(W * 0.15, W * 0.85, 0, 0.42, D * 0.25, D * 0.95, c);
      b(W * 0.12, W * 0.88, 0.42, 0.45, D * 0.28, D, tone(c, -6));
      break;
    case 'vanity':
      b(0, W, 0.1, 0.85, 0, D, c);
      b(-0.01, W + 0.01, 0.85, 0.89, -0.01, D + 0.01, '#f4f2ec');
      b(W / 2 - 0.22, W / 2 + 0.22, 0.89, 0.95, D * 0.2, D * 0.8, '#ffffff');
      b(W * 0.1, W * 0.9, 1.05, 1.85, 0, 0.02, mat('#d7e3e6', { rough: 0.05, metal: 0.6 }));
      break;
    default:
      return null;
  }
  return g;
}

/** Lighten (positive) or darken (negative) a hex color. */
export function tone(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amount));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
