// 3D models for furniture and fixtures, built in each piece's own frame so they can face
// any direction. At rotation 0 the back of a piece sits on its north edge (v = 0).
import * as T from 'three';
import { FLOOR_H, type Item } from './model';
import { localSize } from './stairs';

export type Mat = (
  color: string,
  o?: { rough?: number; metal?: number; opacity?: number; emissive?: string; double?: boolean },
) => T.Material;

export function furniture(item: Item, y: number, mat: Mat): T.Group | null {
  const g = new T.Group();
  const { LW, LD } = localSize(item);
  g.position.set(item.x + item.w / 2, y, item.z + item.d / 2);
  g.rotation.y = (-item.rotation * Math.PI) / 180;
  const c = item.color;
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
    const m = new T.Mesh(
      new T.BoxGeometry(u1 - u0, y1 - y0, v1 - v0),
      typeof color === 'string' ? mat(color) : color,
    );
    m.position.set((u0 + u1) / 2 - LW / 2, (y0 + y1) / 2, (v0 + v1) / 2 - LD / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (u: number, v: number, r: number, y0: number, y1: number, color: string) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, y1 - y0, 20), mat(color));
    m.position.set(u - LW / 2, (y0 + y1) / 2, v - LD / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const ball = (u: number, h: number, v: number, r: number, color: string) => {
    const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), mat(color));
    m.position.set(u - LW / 2, h, v - LD / 2);
    m.castShadow = true;
    g.add(m);
  };
  const W = LW,
    D = LD;
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
