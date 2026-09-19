import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Camera, Footprints, RotateCcw, Sun, Box } from 'lucide-react';
import { buildWalls, isOutside, isRoom, type Project } from './model';
export type SceneMode = 'dollhouse' | 'exterior' | 'walk';
interface Props {
  project: Project;
  floor: number;
  mode: SceneMode;
  onMode: (m: SceneMode) => void;
  onNotice: (s: string) => void;
}
export default function Scene({ project: p, floor, mode, onMode, onNotice }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<{
    pos: T.Vector3;
    target: T.Vector3;
    mode: SceneMode;
    floor: number;
  } | null>(null);
  const snapshot = useRef<() => void>(() => {});
  const reset = useRef<() => void>(() => {});
  const [error, setError] = useState(false);
  const [evening, setEvening] = useState(false);
  useEffect(() => {
    const node = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError(true);
      return;
    }
    setError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = evening ? 1.15 : 1.35;
    node.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(evening ? '#687b83' : '#e4eae3');
    scene.fog = new T.Fog(evening ? '#687b83' : '#e4eae3', 55, 130);
    const camera = new T.PerspectiveCamera(42, 1, 0.06, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 4;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI / 2 - 0.035;
    controls.enabled = mode !== 'walk';
    const light = new T.DirectionalLight(evening ? '#ffc792' : '#fff5df', evening ? 2.5 : 3.2);
    light.position.set(-12, evening ? 12 : 25, 10);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -30,
      right: 30,
      top: 30,
      bottom: -30,
      near: 1,
      far: 90,
    });
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.04;
    scene.add(light, new T.HemisphereLight('#d6eaff', '#64745c', evening ? 1.2 : 2.3));
    const materials = new Map<string, T.MeshStandardMaterial>();
    const mat = (color: string, roughness = 0.8) => {
      const key = color + roughness;
      let m = materials.get(key);
      if (!m) {
        m = new T.MeshStandardMaterial({ color, roughness });
        materials.set(key, m);
      }
      return m;
    };
    const blockers: T.Mesh[] = [];
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
      collision = false,
    ) => {
      if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (collision) blockers.push(mesh);
      return mesh;
    };
    const sphere = (x: number, y: number, z: number, r: number, color: string) => {
      const mesh = new T.Mesh(new T.IcosahedronGeometry(r, 1), mat(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    const groundY = mode === 'exterior' ? -0.19 : Math.min(0, floor * 3.2) - 0.19;
    box(0, groundY - 0.2, 0, 90, 0.4, 90, evening ? '#7c906c' : '#a3b590');
    // A simple, quiet site border gives the design a presentation-board feel.
    if (mode !== 'walk') {
      box(0, groundY - 0.17, 0, 33, 0.32, 29, '#728d69');
      box(0, groundY + 0.005, 0, 32.5, 0.12, 28.5, '#b0bf99');
    }
    const visible = p.items.filter((i) =>
      mode === 'exterior' ? i.floor >= 0 : i.floor === floor || (floor === 0 && isOutside(i)),
    );
    for (const i of visible) {
      const x = i.x + i.w / 2,
        z = i.z + i.d / 2,
        y = i.floor * 3.2;
      if (isRoom(i)) {
        box(x, y - 0.09, z, i.w, 0.18, i.d, i.color); // individual boards add scale without textures
        if (i.kind === 'room')
          for (let dz = 0.35; dz < i.d; dz += 0.35)
            box(x, y + 0.006, i.z + dz, i.w, 0.007, 0.009, '#c7bea9');
        continue;
      }
      switch (i.kind) {
        case 'grass':
          box(x, 0.025, z, i.w, 0.08, i.d, i.color);
          break;
        case 'driveway':
          box(x, 0.015, z, i.w, 0.09, i.d, i.color);
          for (let dz = 1.5; dz < i.d; dz += 1.5)
            box(x, 0.065, i.z + dz, i.w, 0.008, 0.024, '#989e94');
          break;
        case 'deck':
          box(x, 0.07, z, i.w, 0.22, i.d, i.color);
          for (let dx = 0.2; dx < i.w; dx += 0.2)
            box(i.x + dx, 0.185, z, 0.013, 0.008, i.d, '#978467');
          break;
        case 'pool': {
          box(x, 0.04, z, i.w + 0.3, 0.18, i.d + 0.3, '#e4dfce');
          const water = box(x, 0.14, z, i.w, 0.08, i.d, i.color);
          if (water)
            water.material = new T.MeshStandardMaterial({
              color: i.color,
              metalness: 0.28,
              roughness: 0.16,
            });
          for (let a = 0; a < 3; a++)
            box(i.x + 0.18, 0.195, i.z + 0.5 + a * 0.25, 0.36, 0.04, 0.1, '#d4e4df');
          break;
        }
        case 'tree': {
          box(x, 0.65, z, 0.2, 1.3, 0.2, '#8b7658');
          sphere(x, 1.5 + i.w * 0.3, z, i.w * 0.48, i.color);
          sphere(x - i.w * 0.25, 1.4, z + 0.15, i.w * 0.3, '#89a674');
          sphere(x + i.w * 0.2, 1.8, z - 0.15, i.w * 0.28, '#a0b780');
          break;
        }
        case 'fence':
          for (let dx = 0; dx < i.w; dx += 0.18)
            box(i.x + dx, 0.65, z, 0.12, 1.3, Math.max(0.08, i.d), i.color);
          break;
        case 'sofa':
          box(x, y + 0.28, z, i.w, 0.42, i.d, i.color);
          box(x, y + 0.65, i.z + 0.1, i.w, 0.5, 0.2, i.color);
          box(i.x + 0.1, y + 0.52, z, 0.2, 0.5, i.d, i.color);
          box(i.x + i.w - 0.1, y + 0.52, z, 0.2, 0.5, i.d, i.color);
          for (let n = 0; n < 2; n++)
            box(
              i.x + i.w * (0.27 + n * 0.46),
              y + 0.53,
              z + 0.06,
              i.w * 0.42,
              0.16,
              i.d * 0.7,
              '#aec1b6',
            );
          break;
        case 'bed':
          box(x, y + 0.25, z, i.w, 0.4, i.d, '#a79178');
          box(x, y + 0.51, z, i.w * 0.97, 0.22, i.d * 0.97, i.color);
          box(x, y + 0.7, i.z + 0.05, i.w, 0.95, 0.12, '#9b8b7c');
          for (let n = 0; n < 2; n++)
            box(
              i.x + i.w * (0.26 + n * 0.48),
              y + 0.69,
              i.z + 0.35,
              i.w * 0.43,
              0.15,
              0.42,
              '#f8f4e8',
            );
          box(x, y + 0.64, i.z + i.d * 0.76, i.w * 0.98, 0.035, i.d * 0.38, '#a8b9b4');
          break;
        case 'table':
          box(x, y + 0.76, z, i.w, 0.12, i.d, i.color);
          for (const dx of [-1, 1])
            for (const dz of [-1, 1])
              box(x + dx * i.w * 0.38, y + 0.36, z + dz * i.d * 0.35, 0.07, 0.72, 0.07, '#73634e');
          for (const dz of [-1, 1]) {
            box(x, y + 0.44, z + dz * (i.d / 2 + 0.32), 0.5, 0.08, 0.5, '#b9b09b');
            box(x, y + 0.7, z + dz * (i.d / 2 + 0.55), 0.5, 0.52, 0.055, '#b9b09b');
          }
          break;
        case 'counter':
          box(x, y + 0.46, z, i.w, 0.92, i.d, i.color);
          box(x, y + 0.96, z, i.w + 0.06, 0.09, i.d + 0.06, '#f1ede0');
          box(i.x + 0.4, y + 1.015, z, 0.5, 0.02, i.d * 0.65, '#aaaead');
          break;
        case 'stairs':
          for (let s = 0; s < 12; s++)
            box(
              x,
              y + (s + 1) * 0.125,
              i.z + (i.d * (s + 0.5)) / 12,
              i.w,
              (s + 1) * 0.25,
              i.d / 12,
              i.color,
            );
          break;
      }
    }
    for (const wall of buildWalls(p).filter((w) =>
      mode === 'exterior' ? w.floor >= 0 : w.floor === floor,
    )) {
      const y = wall.floor * 3.2,
        height = mode === 'dollhouse' ? 1.15 : 3,
        thick = 0.16;
      const wallBox = (
        a: number,
        b: number,
        bottom: number,
        top: number,
        color = p.exterior,
        solid = false,
      ) =>
        wall.axis === 'x'
          ? box(
              (a + b) / 2,
              y + (bottom + top) / 2,
              wall.line,
              b - a,
              top - bottom,
              thick,
              color,
              solid,
            )
          : box(
              wall.line,
              y + (bottom + top) / 2,
              (a + b) / 2,
              thick,
              top - bottom,
              b - a,
              color,
              solid,
            );
      const cuts = [
        ...new Set([wall.start, wall.end, ...wall.openings.flatMap((o) => [o.start, o.end])]),
      ].sort((a, b) => a - b);
      for (let n = 0; n < cuts.length - 1; n++) {
        const a = cuts[n],
          b = cuts[n + 1];
        const openings = wall.openings.filter((o) => o.start <= a + 0.001 && o.end >= b - 0.001);
        const open = openings.find((o) => o.kind === 'door') || openings[0];
        if (!open) {
          wallBox(a, b, 0, height, p.exterior, true);
          wallBox(a, b, 0, 0.08, '#d2caba');
        } else {
          const bottom = open.kind === 'window' ? 0.95 : 0,
            top = open.kind === 'window' ? 2.25 : 2.35;
          if (bottom > 0) wallBox(a, b, 0, Math.min(bottom, height), p.exterior, true);
          if (height > top) wallBox(a, b, top, height, p.exterior, true);
          if (open.kind === 'window' && height > bottom) {
            const pane = wallBox(a, b, bottom, Math.min(top, height), '#8cb8bd', true);
            if (pane)
              pane.material = new T.MeshStandardMaterial({
                color: evening ? '#f3d19a' : '#99c8cf',
                transparent: true,
                opacity: evening ? 0.85 : 0.4,
                roughness: 0.15,
                metalness: 0.2,
                emissive: evening ? '#be874a' : '#000000',
                emissiveIntensity: 0.25,
              });
            for (const xx of [a, b, (a + b) / 2])
              wallBox(xx - 0.025, xx + 0.025, bottom, Math.min(top, height), '#52675f');
            wallBox(a, b, bottom, bottom + 0.045, '#52675f');
            if (height >= top) wallBox(a, b, top - 0.045, top, '#52675f');
          }
        }
      }
      if (mode === 'dollhouse') wallBox(wall.start, wall.end, height, height + 0.03, '#f5f0e5');
    }
    if (mode === 'exterior') {
      // One roof per level's main volume, plus a distinct lower garage volume.
      for (const level of p.floors.filter((f) => f.level >= 0))
        for (const kind of ['room', 'garage']) {
          const rooms = p.items.filter((i) => i.floor === level.level && i.kind === kind);
          if (!rooms.length) continue;
          // Do not roof a level that has another occupied floor directly above it.
          if (kind === 'room' && p.items.some((i) => i.kind === 'room' && i.floor > level.level))
            continue;
          const minX = Math.min(...rooms.map((i) => i.x)) - 0.3,
            maxX = Math.max(...rooms.map((i) => i.x + i.w)) + 0.3,
            minZ = Math.min(...rooms.map((i) => i.z)) - 0.3,
            maxZ = Math.max(...rooms.map((i) => i.z + i.d)) + 0.3,
            y = level.level * 3.2 + 3.08,
            w = maxX - minX,
            d = maxZ - minZ,
            x = (minX + maxX) / 2,
            z = (minZ + maxZ) / 2;
          if (p.roofStyle === 'flat') box(x, y, z, w, 0.22, d, p.roof);
          else {
            const rise = Math.min(2.2, w * 0.23);
            const shape = new T.Shape();
            shape.moveTo(-w / 2, 0);
            shape.lineTo(w / 2, 0);
            shape.lineTo(0, rise);
            shape.closePath();
            const roof = new T.Mesh(
              new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }),
              mat(p.roof),
            );
            roof.position.set(x, y, minZ);
            roof.castShadow = true;
            roof.receiveShadow = true;
            scene.add(roof);
            const length = Math.hypot(w / 2, rise),
              angle = Math.atan2(rise, w / 2);
            for (const side of [-1, 1]) {
              const panel = box(
                x + (side * w) / 4,
                y + rise / 2 + 0.12,
                z,
                length,
                0.11,
                d + 0.12,
                p.roof,
              );
              if (panel) panel.rotation.z = -side * angle;
            }
          }
        }
    }
    const rooms = visible.filter(isRoom),
      cx = rooms.length ? rooms.reduce((s, i) => s + i.x + i.w / 2, 0) / rooms.length : 0,
      cz = rooms.length ? rooms.reduce((s, i) => s + i.z + i.d / 2, 0) / rooms.length : 0;
    let yaw = Math.PI,
      pitch = 0;
    const spawn = () => {
      const r = rooms.find((i) => i.kind === 'room');
      camera.position.set(r ? r.x + r.w / 2 : 0, floor * 3.2 + 1.65, r ? r.z + r.d / 2 : 0);
      yaw = Math.PI;
      pitch = 0;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
    };
    const resetCamera = () => {
      if (mode === 'walk') spawn();
      else {
        const bounds = new T.Box3();
        rooms.forEach((r) => {
          bounds.expandByPoint(new T.Vector3(r.x, 0, r.z));
          bounds.expandByPoint(new T.Vector3(r.x + r.w, 0, r.z + r.d));
        });
        const span = rooms.length
          ? Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 12)
          : 18;
        controls.target.set(cx, mode === 'exterior' ? 1.4 : floor * 3.2, cz);
        camera.position.set(
          cx + span * 1.25,
          span * 1.1 + Math.max(0, floor * 3.2),
          cz + span * 1.45,
        );
        controls.update();
      }
    };
    const saved = cameraRef.current;
    if (saved && saved.mode === mode && saved.floor === floor && mode !== 'walk') {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
    } else resetCamera();
    reset.current = resetCamera;
    const keys = new Set<string>();
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select') || mode !== 'walk') return;
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          e.key.toLowerCase(),
        )
      ) {
        e.preventDefault();
        keys.add(e.key.toLowerCase());
      }
    };
    const keyup = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    let dragging = false,
      lastX = 0,
      lastY = 0;
    const down = (e: PointerEvent) => {
      if (mode !== 'walk') return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.004;
      pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => (dragging = false);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    const resize = new ResizeObserver(() => {
      const w = node.clientWidth,
        h = node.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(node);
    snapshot.current = () => {
      renderer.render(scene, camera);
      const a = document.createElement('a');
      a.href = renderer.domElement.toDataURL('image/png');
      a.download = `${p.name.replace(/[^a-z0-9_-]/gi, '-')}-${mode}.png`;
      a.click();
      onNotice('Your 3D snapshot has been exported.');
    };
    const ray = new T.Raycaster();
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (mode === 'walk') {
        if (keys.has('arrowleft')) yaw += dt * 1.3;
        if (keys.has('arrowright')) yaw -= dt * 1.3;
        camera.rotation.set(pitch, yaw, 0);
        const forward =
            (keys.has('w') || keys.has('arrowup') ? 1 : 0) -
            (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
          strafe = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
        const v = new T.Vector3(
          -Math.sin(yaw) * forward + Math.cos(yaw) * strafe,
          0,
          -Math.cos(yaw) * forward - Math.sin(yaw) * strafe,
        );
        if (v.lengthSq()) {
          v.normalize();
          ray.set(camera.position, v);
          ray.far = 0.3 + dt * 3;
          const hits = ray.intersectObjects(blockers, false);
          if (!hits.length) {
            camera.position.addScaledVector(v, dt * 3);
            camera.position.x = T.MathUtils.clamp(camera.position.x, -190, 190);
            camera.position.z = T.MathUtils.clamp(camera.position.z, -190, 190);
          }
        }
      } else controls.update();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cameraRef.current = {
        pos: camera.position.clone(),
        target: controls.target.clone(),
        mode,
        floor,
      };
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          if (!Array.isArray(o.material)) o.material.dispose();
        }
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      node.removeChild(renderer.domElement);
    };
  }, [p, floor, mode, evening]);
  return (
    <div className={`scene-wrap ${mode === 'walk' ? 'walking' : ''}`}>
      <div ref={host} className="scene" data-testid="three-scene" />
      {error && (
        <div className="scene-error">
          3D needs WebGL. Try the desktop app or enable hardware acceleration in your browser. Your
          2D plan is still available.
        </div>
      )}
      <div className="panel-corner">
        <span className="live-dot" />
        LIVE 3D
        <span className="muted">
          / {mode === 'walk' ? 'Walkthrough' : mode === 'exterior' ? 'Exterior' : 'Dollhouse'}
        </span>
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
      {mode === 'walk' && (
        <div className="walk-instructions">
          <Footprints size={18} />
          <strong>You're home.</strong>
          <span>W A S D to move · Drag to look · ← → to turn</span>
          <button onClick={() => onMode('dollhouse')}>
            Back to edit <kbd>Esc</kbd>
          </button>
          <small>Choose a floor above to visit another level.</small>
        </div>
      )}
      <div className="scene-bottom">
        <button
          className="icon-button glass"
          aria-label="Reset 3D camera"
          title="Reset camera"
          onClick={() => reset.current()}
        >
          <RotateCcw size={17} />
        </button>
        <span>
          {mode === 'walk' ? 'Explore at your own pace' : 'Drag to orbit · Scroll to zoom'}
        </span>
        <button
          className="icon-button glass"
          aria-label="Export 3D image"
          title="Export a 3D image"
          onClick={() => snapshot.current()}
        >
          <Camera size={18} />
        </button>
      </div>
    </div>
  );
}
