import { useRef, useState } from 'react';
import { Crosshair, Minus, Plus, Compass } from 'lucide-react';
import {
  catalog,
  createItem,
  formatLength,
  isOutside,
  isRoom,
  snap,
  uid,
  type Item,
  type Kind,
  type Project,
  type Side,
} from './model';
export type Tool = 'select' | 'pan' | 'window' | 'door' | Kind;
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
}
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
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: -14, z: -12, w: 29, h: 27 });
  const [draft, setDraft] = useState<Item | null>(null);
  const gesture = useRef<{
    kind: 'draw' | 'move' | 'resize' | 'pan';
    x: number;
    z: number;
    item?: Item;
    vx: number;
    vz: number;
  } | null>(null);
  const point = (e: { clientX: number; clientY: number }) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  const begin = (e: React.PointerEvent, id?: string, resize = false) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const a = point(e);
    svg.current!.setPointerCapture(e.pointerId);
    const item = p.items.find((i) => i.id === id);
    if (tool === 'pan' || e.button === 1) {
      gesture.current = { kind: 'pan', x: a.x, z: a.y, vx: view.x, vz: view.z };
      return;
    }
    if (tool === 'window' || tool === 'door') {
      const rooms = p.items.filter((i) => isRoom(i) && i.floor === floor);
      let best: { r: Item; side: Side; dist: number; offset: number } | undefined;
      for (const r of rooms) {
        const candidates: { side: Side; dist: number; offset: number }[] = [
          {
            side: 'north',
            dist: Math.hypot(Math.max(r.x - a.x, 0, a.x - r.x - r.w), a.y - r.z),
            offset: (a.x - r.x) / r.w,
          },
          {
            side: 'south',
            dist: Math.hypot(Math.max(r.x - a.x, 0, a.x - r.x - r.w), a.y - r.z - r.d),
            offset: (a.x - r.x) / r.w,
          },
          {
            side: 'west',
            dist: Math.hypot(a.x - r.x, Math.max(r.z - a.y, 0, a.y - r.z - r.d)),
            offset: (a.y - r.z) / r.d,
          },
          {
            side: 'east',
            dist: Math.hypot(a.x - r.x - r.w, Math.max(r.z - a.y, 0, a.y - r.z - r.d)),
            offset: (a.y - r.z) / r.d,
          },
        ];
        for (const c of candidates) if (!best || c.dist < best.dist) best = { r, ...c };
      }
      if (best && best.dist < 1) {
        onChange({
          ...p,
          openings: [
            ...p.openings,
            {
              id: uid(),
              roomId: best.r.id,
              side: best.side,
              offset: Math.max(0.1, Math.min(0.9, best.offset)),
              width: tool === 'window' ? 1.5 : 1,
              kind: tool,
            },
          ],
        });
        onSelect(best.r.id);
        onNotice(`${tool === 'window' ? 'Window' : 'Door'} added. Click another wall to add more.`);
      } else onNotice('Click close to a room wall to place an opening.');
      return;
    }
    if (tool === 'select') {
      if (item) {
        onSelect(item.id);
        gesture.current = {
          kind: resize ? 'resize' : 'move',
          x: a.x,
          z: a.y,
          item: { ...item },
          vx: view.x,
          vz: view.z,
        };
        setDraft(item);
      } else onSelect(null);
      return;
    }
    if (tool === 'room' || tool === 'garage') {
      const i = createItem(tool, floor, snap(a.x, snapping), snap(a.y, snapping));
      i.w = 0;
      i.d = 0;
      setDraft(i);
      gesture.current = { kind: 'draw', x: i.x, z: i.z, item: i, vx: view.x, vz: view.z };
      return;
    }
    const i = createItem(tool as Kind, floor, snap(a.x, snapping), snap(a.y, snapping));
    onChange({ ...p, items: [...p.items, i] });
    onSelect(i.id);
    onTool('select');
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const a = point(e);
    if (g.kind === 'pan') {
      setView((v) => ({ ...v, x: v.x + g.x - a.x, z: v.z + g.z - a.y }));
      return;
    }
    const i = { ...g.item! };
    if (g.kind === 'draw') {
      i.x = snap(Math.min(g.x, a.x), snapping);
      i.z = snap(Math.min(g.z, a.y), snapping);
      i.w = Math.abs(snap(a.x - g.x, snapping));
      i.d = Math.abs(snap(a.y - g.z, snapping));
    }
    if (g.kind === 'move') {
      i.x = snap(g.item!.x + a.x - g.x, snapping);
      i.z = snap(g.item!.z + a.y - g.z, snapping);
    }
    if (g.kind === 'resize') {
      i.w = Math.max(0.25, snap(g.item!.w + a.x - g.x, snapping));
      i.d = Math.max(0.25, snap(g.item!.d + a.y - g.z, snapping));
    }
    setDraft(i);
  };
  const finish = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (draft && g.kind !== 'pan') {
      if (g.kind === 'draw') {
        if (draft.w >= 0.5 && draft.d >= 0.5) {
          onChange({ ...p, items: [...p.items, draft] });
          onSelect(draft.id);
          onTool('select');
        } else onNotice('Drag across the grid to draw a room.');
      } else if (JSON.stringify(draft) !== JSON.stringify(g.item))
        onChange({ ...p, items: p.items.map((i) => (i.id === draft.id ? draft : i)) });
    }
    setDraft(null);
  };
  const zoom = (factor: number) =>
    setView((v) => ({
      x: v.x + (v.w - v.w * factor) / 2,
      z: v.z + (v.h - v.h * factor) / 2,
      w: Math.max(8, Math.min(120, v.w * factor)),
      h: Math.max(7.45, Math.min(111.7, v.h * factor)),
    }));
  const fit = () => {
    const items = p.items.filter((i) => i.floor === floor || isOutside(i));
    if (!items.length) {
      setView({ x: -14, z: -12, w: 29, h: 27 });
      return;
    }
    const minX = Math.min(...items.map((i) => i.x)) - 3,
      minZ = Math.min(...items.map((i) => i.z)) - 3,
      maxX = Math.max(...items.map((i) => i.x + i.w)) + 3,
      maxZ = Math.max(...items.map((i) => i.z + i.d)) + 3;
    setView({ x: minX, z: minZ, w: maxX - minX, h: maxZ - minZ });
  };
  const visible = p.items
    .filter((i) => i.floor === floor || (floor >= 0 && isOutside(i)))
    .sort(
      (a, b) => (isOutside(a) ? -2 : isRoom(a) ? -1 : 0) - (isOutside(b) ? -2 : isRoom(b) ? -1 : 0),
    );
  const items = visible.map((i) => (draft?.id === i.id ? draft : i));
  if (draft && gesture.current?.kind === 'draw') items.push(draft);
  return (
    <div className={`plan-wrap tool-${tool}`}>
      <div className="panel-corner">
        <span className="live-dot" />
        2D FLOOR PLAN
        <span className="muted">/ {p.floors.find((f) => f.level === floor)?.name}</span>
      </div>
      <svg
        ref={svg}
        data-testid="floor-plan"
        className="plan"
        aria-label="Interactive floor plan. Select Draw room, then drag to create a room."
        viewBox={`${view.x} ${view.z} ${view.w} ${view.h}`}
        onPointerDown={(e) => begin(e)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft(null);
        }}
        onWheel={(e) => zoom(e.deltaY > 0 ? 1.08 : 0.92)}
      >
        <defs>
          <pattern id="small-grid" width="0.25" height="0.25" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.017" fill="#bac5bb" />
          </pattern>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="url(#small-grid)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce3d8" strokeWidth="0.025" />
          </pattern>
          <pattern id="deck" width="0.3" height="0.3" patternUnits="userSpaceOnUse">
            <path d="M0 0H.3" stroke="#796448" strokeOpacity=".25" strokeWidth=".025" />
          </pattern>
        </defs>
        <rect x="-250" y="-250" width="500" height="500" fill="url(#grid)" />
        {floor !== 0 &&
          p.items
            .filter((i) => isRoom(i) && i.floor === floor - 1)
            .map((i) => (
              <rect
                key={`ghost-${i.id}`}
                x={i.x}
                y={i.z}
                width={i.w}
                height={i.d}
                fill="none"
                stroke="#aab4a9"
                strokeWidth=".05"
                strokeDasharray=".15 .15"
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
                onSelect(i.id);
                onChange({
                  ...p,
                  items: p.items.map((a) =>
                    a.id === i.id
                      ? {
                          ...a,
                          x:
                            a.x +
                            (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0),
                          z:
                            a.z +
                            (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0),
                        }
                      : a,
                  ),
                });
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              begin(e, i.id);
            }}
            className="plan-item"
          >
            <title>
              {i.name} · {formatLength(i.w, p.units)} × {formatLength(i.d, p.units)}
            </title>
            {i.kind === 'tree' ? (
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
                <path
                  d={`M${i.x + i.w / 2} ${i.z + i.d * 0.2}v${i.d * 0.6}m${-i.w * 0.3} ${-i.d * 0.3}h${i.w * 0.6}`}
                  stroke="#4c7652"
                  strokeWidth=".04"
                />
              </>
            ) : (
              <rect
                x={i.x}
                y={i.z}
                width={i.w}
                height={i.d}
                rx={isRoom(i) ? 0 : i.kind === 'pool' ? 0.3 : 0.06}
                fill={i.color}
                stroke={isRoom(i) ? '#56645d' : i.kind === 'pool' ? '#ebede4' : '#788276'}
                strokeWidth={isRoom(i) ? 0.13 : i.kind === 'pool' ? 0.16 : 0.035}
              />
            )}
            {i.kind === 'deck' && (
              <rect x={i.x} y={i.z} width={i.w} height={i.d} fill="url(#deck)" />
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
            {i.kind === 'bed' && (
              <>
                <rect
                  x={i.x + 0.08}
                  y={i.z + 0.1}
                  width={i.w - 0.16}
                  height={i.d * 0.22}
                  rx=".06"
                  fill="#f5f2ed"
                  stroke="#8b8d9b"
                  strokeWidth=".025"
                />
                <path
                  d={`M${i.x + 0.06} ${i.z + i.d * 0.38}h${i.w - 0.12}`}
                  stroke="#8b8d9b"
                  strokeWidth=".04"
                />
              </>
            )}
            {i.kind === 'sofa' && (
              <>
                <rect
                  x={i.x + 0.13}
                  y={i.z + 0.2}
                  width={Math.max(0.1, i.w - 0.26)}
                  height={Math.max(0.1, i.d - 0.35)}
                  rx=".08"
                  fill="#a7bbb0"
                  stroke="#5e8071"
                  strokeWidth=".035"
                />
                <path
                  d={`M${i.x + i.w / 2} ${i.z + 0.2}v${i.d - 0.35}`}
                  stroke="#5e8071"
                  strokeWidth=".035"
                />
              </>
            )}
            {i.kind === 'stairs' &&
              Array.from({ length: 12 }, (_, n) => (
                <path
                  key={n}
                  d={`M${i.x} ${i.z + (n * i.d) / 12}h${i.w}`}
                  stroke="#857a67"
                  strokeWidth=".025"
                />
              ))}
          </g>
        ))}
        {p.openings.map((o) => {
          const r = items.find((i) => i.id === o.roomId);
          if (!r) return null;
          const h = o.side === 'north' || o.side === 'south',
            len = h ? r.w : r.d,
            width = Math.min(o.width, len - 0.2),
            center = Math.max(width / 2 + 0.1, Math.min(len - width / 2 - 0.1, len * o.offset)),
            x = h ? r.x + center - width / 2 : o.side === 'west' ? r.x : r.x + r.w,
            z = h ? (o.side === 'north' ? r.z : r.z + r.d) : r.z + center - width / 2;
          return (
            <g
              key={o.id}
              pointerEvents="none"
              transform={`translate(${x} ${z}) rotate(${h ? 0 : 90})`}
            >
              <path
                d={`M0 0H${width}`}
                stroke={o.kind === 'window' ? '#8ac0c2' : r.color}
                strokeWidth=".18"
              />
              {o.kind === 'window' ? (
                <path d={`M0 -.075H${width}M0 .075H${width}`} stroke="#49868d" strokeWidth=".025" />
              ) : (
                <>
                  <path
                    d={`M0 0V${width}M0 ${width}A${width} ${width} 0 0 0 ${width} 0`}
                    fill="none"
                    stroke="#9b8970"
                    strokeWidth=".028"
                  />
                </>
              )}
            </g>
          );
        })}
        {items
          .filter((i) => isRoom(i) && i.w > 1 && i.d > 1)
          .map((i) => (
            <g key={`label-${i.id}`} pointerEvents="none">
              <text
                x={i.x + i.w / 2}
                y={i.z + i.d / 2 - 0.08}
                textAnchor="middle"
                className="room-name"
                fontSize={Math.min(0.58, (i.w / Math.max(i.name.length, 1)) * 1.5)}
              >
                {i.name}
              </text>
              <text
                x={i.x + i.w / 2}
                y={i.z + i.d / 2 + 0.36}
                textAnchor="middle"
                className="room-area"
                fontSize=".36"
              >
                {Math.round(i.w * i.d * (p.units === 'ft' ? 10.7639 : 1))}{' '}
                {p.units === 'ft' ? 'sq ft' : 'm²'}
              </text>
            </g>
          ))}
        {items
          .filter((i) => selected === i.id)
          .map((i) => (
            <g key={`selection-${i.id}`}>
              <rect
                x={i.x - 0.1}
                y={i.z - 0.1}
                width={i.w + 0.2}
                height={i.d + 0.2}
                fill="none"
                stroke="#cf874e"
                strokeWidth=".055"
                strokeDasharray=".12 .08"
                pointerEvents="none"
              />
              <rect
                data-testid="resize-handle"
                x={i.x + i.w - 0.3}
                y={i.z + i.d - 0.3}
                width=".6"
                height=".6"
                rx=".04"
                fill="#cf874e"
                stroke="white"
                strokeWidth=".06"
                style={{ cursor: 'nwse-resize' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  begin(e, i.id, true);
                }}
              />
              <text
                x={i.x + i.w / 2}
                y={i.z - 0.35}
                fontSize=".27"
                textAnchor="middle"
                fill="#9c653c"
              >
                {formatLength(i.w, p.units)}
              </text>
              <text
                x={i.x + i.w + 0.35}
                y={i.z + i.d / 2}
                fontSize=".27"
                fill="#9c653c"
                transform={`rotate(90 ${i.x + i.w + 0.35} ${i.z + i.d / 2})`}
                textAnchor="middle"
              >
                {formatLength(i.d, p.units)}
              </text>
            </g>
          ))}
      </svg>
      <div className="plan-bottom">
        <div className="scale">
          <span /> 1 m grid <span className="key">{snapping ? '¼ m snap' : 'Free move'}</span>
        </div>
        <div className="canvas-buttons">
          <button aria-label="Zoom out" onClick={() => zoom(1.2)}>
            <Minus size={16} />
          </button>
          <button aria-label="Fit plan" onClick={fit}>
            <Crosshair size={17} />
          </button>
          <button aria-label="Zoom in" onClick={() => zoom(0.8)}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="north">
        <Compass size={23} />
        <span>N</span>
      </div>
      <div className="canvas-hint">
        {tool === 'room' || tool === 'garage'
          ? 'Click and drag to draw. Release to build.'
          : tool === 'window' || tool === 'door'
            ? `Click a wall to add a ${tool}.`
            : tool === 'pan'
              ? 'Drag the canvas to look around.'
              : tool === 'select'
                ? 'Drag shapes to move · Drag the amber corner to resize'
                : `Click the plan to place ${catalog.find((c) => c.kind === tool)?.name.toLowerCase()}`}
      </div>
    </div>
  );
}
