import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Armchair,
  Bath,
  BedDouble,
  BedSingle,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Columns3,
  Copy,
  DoorClosed,
  DoorOpen,
  Download,
  Fence,
  Flame,
  Flower2,
  FolderOpen,
  Footprints,
  Grid2X2,
  Hand,
  HelpCircle,
  Home,
  Layers,
  Library,
  Maximize2,
  MousePointer2,
  PanelLeftClose,
  Pencil,
  Plus,
  Redo2,
  Refrigerator,
  RotateCw,
  Ruler,
  Save,
  ShowerHead,
  Sofa,
  Sparkles,
  Sprout,
  Square,
  SquareDashedBottom,
  Table2,
  Trash2,
  TreePine,
  Tv,
  Undo2,
  Warehouse,
  Waves,
  WashingMachine,
  X,
  Lamp,
  Toilet,
  CookingPot,
  RectangleHorizontal,
  RectangleVertical,
  Shirt,
} from 'lucide-react';
import Plan, { type Tool } from './Plan';
import Scene, { type SceneMode } from './Scene';
import { addLevel, defaultFloorName, landingFor, nextLevel } from './floors';
import { stairEnds } from './stairs';
import {
  area,
  blankProject,
  catalog,
  catalogEntry,
  ceilingHeight,
  contentsOf,
  bedBathLabel,
  deleteFloor,
  DEFAULT_COST,
  money,
  squareFeet,
  floorName,
  formatLength,
  readFeet,
  hasFloor,
  isOutside,
  isRoom,
  onLevel,
  openingKinds,
  openingName,
  removeItem,
  roomsAbove,
  rotateItem,
  sampleProject,
  stairEntry,
  stairLevels,
  stairNames,
  uid,
  validateProject,
  type FloorFinish,
  type Item,
  type Ceiling,
  type Kind,
  type OpeningKind,
  type Project,
  type StairStyle,
} from './model';
declare global {
  interface Window {
    hearth?: {
      save: (name: string, data: string) => Promise<boolean>;
      open: () => Promise<string | null>;
    };
  }
}
const STORAGE = 'hearth-studio-projects-v1';
const ACTIVE = 'hearth-studio-active';
const icons: Record<Kind, typeof Home> = {
  room: Square,
  garage: Warehouse,
  stairs: Layers,
  sofa: Sofa,
  armchair: Armchair,
  rug: RectangleHorizontal,
  media: Tv,
  fireplace: Flame,
  plant: Sprout,
  bed: BedDouble,
  wardrobe: Shirt,
  desk: Lamp,
  table: Table2,
  coffee: RectangleHorizontal,
  landing: Grid2X2,
  laundry: WashingMachine,
  bunk: BedSingle,
  utility: Waves,
  shelf: Library,
  counter: Columns3,
  kitchen: CookingPot,
  fridge: Refrigerator,
  bathtub: Bath,
  shower: ShowerHead,
  toilet: Toilet,
  vanity: Waves,
  deck: Grid2X2,
  driveway: Car,
  grass: Flower2,
  pool: Waves,
  tree: TreePine,
  fence: Fence,
};
function initial() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error();
      const list = arr.map(validateProject);
      if (list.length)
        return {
          list,
          project: list.find((p) => p.id === localStorage.getItem(ACTIVE)) || list[0],
          error: false,
          fresh: false,
        };
    }
  } catch {
    return { list: [], project: sampleProject(), error: true, fresh: false };
  }
  const project = sampleProject();
  return { list: [project], project, error: false, fresh: true };
}
function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Feet as 12′ 6″. */
const showFeet = (ft: number) => {
  const inches = Math.round(ft * 12);
  const f = Math.floor(inches / 12),
    i = inches % 12;
  return i ? `${f}′ ${i}″` : `${f}′`;
};
function Numeric({
  label,
  value,
  onChange,
  min = 0.25,
  max = 100,
  feet = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** Show and accept feet and inches instead of a plain number. */
  feet?: boolean;
}) {
  const show = (v: number) => (feet ? showFeet(v) : String(Math.round(v * 100) / 100));
  const [text, setText] = useState(show(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setText(show(value)), [value, feet]);
  return (
    <label className="field">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        title={feet ? `Type feet and inches, like 12 6 or 12'6"` : undefined}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const n = feet ? readFeet(text) : Number(text);
          if (text.trim() && Number.isFinite(n) && n >= min && n <= max) {
            onChange(n);
            setText(show(n));
          } else setText(show(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(show(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
/** Little top-down pictures of each stair style. */
export function StairIcon({ style, size = 34 }: { style: StairStyle; size?: number }) {
  const s = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      {style === 'straight' && (
        <>
          <rect x="11" y="3" width="12" height="28" rx="1.5" {...s} />
          {[8, 12, 16, 20, 24].map((y) => (
            <path key={y} d={`M11 ${y}h12`} {...s} strokeWidth={1} />
          ))}
          <path d="M17 28V6m-3 3 3-3 3 3" {...s} />
        </>
      )}
      {style === 'l' && (
        <>
          <path d="M4 31V4h27v10H14v17z" {...s} />
          {[18, 22, 26].map((y) => (
            <path key={y} d={`M4 ${y}h10`} {...s} strokeWidth={1} />
          ))}
          {[18, 22, 26].map((x) => (
            <path key={x} d={`M${x} 4v10`} {...s} strokeWidth={1} />
          ))}
          <path d="M9 29V9h19m-3-3 3 3-3 3" {...s} />
        </>
      )}
      {style === 'u' && (
        <>
          <rect x="4" y="3" width="26" height="28" rx="1.5" {...s} />
          <path d="M17 13v18" {...s} />
          {[17, 21, 25].map((y) => (
            <path key={y} d={`M4 ${y}h26`} {...s} strokeWidth={1} />
          ))}
          <path d="M10 29V8h14v21m-3-3 3 3 3-3" {...s} />
        </>
      )}
      {style === 'spiral' && (
        <>
          <circle cx="17" cy="17" r="14" {...s} />
          <circle cx="17" cy="17" r="2" {...s} />
          {[0, 45, 90, 135, 180, 225].map((a) => (
            <path
              key={a}
              d={`M17 17L${17 + 14 * Math.sin((a * Math.PI) / 180)} ${17 + 14 * Math.cos((a * Math.PI) / 180)}`}
              {...s}
              strokeWidth={1}
            />
          ))}
          <path d="M3 17h7" {...s} />
        </>
      )}
    </svg>
  );
}
/** A small plan drawing of a project's ground floor, for the project list. */
function Thumbnail({ p, level = 0 }: { p: Project; level?: number }) {
  const rooms = p.items.filter((i) => isRoom(i) && i.floor === level);
  if (!rooms.length) return <Home size={42} strokeWidth={1} />;
  const minX = Math.min(...rooms.map((i) => i.x)),
    maxX = Math.max(...rooms.map((i) => i.x + i.w)),
    minZ = Math.min(...rooms.map((i) => i.z)),
    maxZ = Math.max(...rooms.map((i) => i.z + i.d));
  const pad = 1;
  return (
    <svg
      viewBox={`${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`}
      className="thumb-svg"
    >
      {rooms.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.z}
          width={r.w}
          height={r.d}
          fill={r.color}
          stroke="#56645d"
          strokeWidth=".14"
        />
      ))}
    </svg>
  );
}
/** One-click names for a freshly drawn room, each with a fitting floor finish. */
const ROOM_NAMES: [string, string, FloorFinish][] = [
  ['Living room', '#e6ddca', 'wood'],
  ['Kitchen', '#e9e2d5', 'tile'],
  ['Dining room', '#e6ddca', 'wood'],
  ['Primary bedroom', '#e2dfea', 'carpet'],
  ['Bedroom', '#e2dfea', 'carpet'],
  ['Bathroom', '#dbe8e4', 'tile'],
  ['Office', '#e3e6d7', 'wood'],
  ['Family room', '#e6ddca', 'wood'],
  ['Laundry', '#dbe8e4', 'tile'],
  ['Mudroom', '#d9d6cc', 'stone'],
  ['Pantry', '#e9e2d5', 'tile'],
  ['Closet', '#e2dfea', 'carpet'],
  ['Hallway', '#eae0d1', 'wood'],
  ['Playroom', '#e3e6d7', 'carpet'],
];
const FINISHES: [FloorFinish, string][] = [
  ['wood', 'Wood'],
  ['tile', 'Tile'],
  ['carpet', 'Carpet'],
  ['stone', 'Stone'],
];
/** Two designs side by side: plans for each floor and the numbers that matter. */
function Compare({
  pair,
  onClear,
  onOpen,
}: {
  pair: Project[];
  onClear: () => void;
  onOpen: (p: Project) => void;
}) {
  if (pair.length < 2) return null;
  const rows: [string, (p: Project) => string][] = [
    ['Finished area', (p) => `${Math.round(squareFeet(p)).toLocaleString()} sq ft`],
    ['Bedrooms & baths', (p) => bedBathLabel(p)],
    ['Rooms', (p) => String(p.items.filter((i) => i.kind === 'room').length)],
    ['Floors', (p) => p.floors.map((f) => f.name).join(', ')],
    ['Rough estimate', (p) => money(squareFeet(p) * (p.costPerSqFt ?? DEFAULT_COST))],
    ['Last changed', (p) => new Date(p.updated).toLocaleDateString()],
  ];
  return (
    <section className="compare" aria-label="Compare designs">
      <div className="compare-head">
        <strong>Side by side</strong>
        <button className="text-button" onClick={onClear}>
          <X size={13} /> Clear
        </button>
      </div>
      <div className="compare-grid">
        {pair.map((p) => (
          <div key={p.id} className="compare-col">
            <strong>{p.name}</strong>
            <div className="compare-plans">
              {[...p.floors]
                .filter((f) => p.items.some((i) => isRoom(i) && i.floor === f.level))
                .map((f) => (
                  <figure key={f.level}>
                    <Thumbnail p={p} level={f.level} />
                    <figcaption>{f.name}</figcaption>
                  </figure>
                ))}
              {!p.items.some(isRoom) && (
                <figure className="compare-empty">
                  <Home size={32} strokeWidth={1} />
                  <figcaption>No rooms yet</figcaption>
                </figure>
              )}
            </div>
            <dl>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value(p)}</dd>
                </div>
              ))}
            </dl>
            {p.notes && <p className="compare-notes">{p.notes}</p>}
            <button className="outline-button" onClick={() => onOpen(p)}>
              Open this one
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
const OPENING_ICONS: Record<OpeningKind, typeof Home> = {
  door: DoorOpen,
  double: DoorClosed,
  slider: Columns2,
  garage: Car,
  window: Columns3,
  arch: RectangleVertical,
  open: SquareDashedBottom,
};
const TILE_GROUPS: Record<'Build' | 'Furnish' | 'Landscape', string> = {
  Build: 'Build',
  Furnish: 'Furnish',
  Landscape: 'Outside',
};

export default function App() {
  const [start] = useState(initial);
  const [project, setProject] = useState(start.project);
  const [library, setLibrary] = useState<Project[]>(start.list);
  const [storageBlocked, setStorageBlocked] = useState(start.error);
  const [saved, setSaved] = useState(false);
  const [floor, setFloor] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [tab, setTab] = useState<'Build' | 'Furnish' | 'Landscape'>('Build');
  const [mode, setMode] = useState<'split' | 'plan' | '3d'>('split');
  const [sceneMode, setSceneMode] = useState<SceneMode>('dollhouse');
  const [snapping, setSnapping] = useState(true);
  // Up to two designs picked for side-by-side comparison in My projects.
  const [compare, setCompare] = useState<string[]>([]);
  const [modal, setModal] = useState<'projects' | 'help' | 'floor' | null>(
    start.fresh ? 'help' : null,
  );
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const [rename, setRename] = useState(false);
  const [renamingFloor, setRenamingFloor] = useState<number | null>(null);
  const [floorName_, setFloorName] = useState('');
  const [floorType, setFloorType] = useState<'upper' | 'basement'>('upper');
  const [copyFloor, setCopyFloor] = useState(false);
  const [floorStairs, setFloorStairs] = useState<StairStyle | null>('straight');
  const [stairDir, setStairDir] = useState<'up' | 'down'>('up');
  // New stairs default toward a floor that exists: up if there's one above, otherwise down.
  useEffect(() => {
    setStairDir(hasFloor(project, floor + 1) || !hasFloor(project, floor - 1) ? 'up' : 'down');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, project.floors.length]);
  const input = useRef<HTMLInputElement>(null);
  // Ctrl+C / Ctrl+V: copy a piece (with a room's doors and windows) onto any floor.
  const clipboard = useRef<{ item: Item; openings: Project['openings'] } | null>(null);
  const [noticeUndo, setNoticeUndo] = useState(false);
  const notify = useCallback((s: string, offerUndo = false) => {
    setNotice(s);
    setNoticeUndo(offerUndo);
  }, []);
  const walking = sceneMode === 'walk';
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.modal')!;
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]')).filter(
        (el) => !el.hasAttribute('disabled'),
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const elements = focusable(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const flush = () => {
      if (storageBlocked) return;
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify([project, ...library.filter((p) => p.id !== project.id)]),
        );
        localStorage.setItem(ACTIVE, project.id);
      } catch {
        /* The visible autosave error path handles storage failures during editing. */
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [project, library, storageBlocked]);
  const commit = useCallback(
    (p: Project) => {
      setHistory((h) => ({ past: [...h.past, project].slice(-100), future: [] }));
      setProject({ ...p, updated: new Date().toISOString() });
      setSaved(false);
    },
    [project],
  );
  const undo = useCallback(() => {
    if (!history.past.length) return;
    const prev = history.past[history.past.length - 1];
    setHistory({ past: history.past.slice(0, -1), future: [project, ...history.future] });
    setProject(prev);
    setSelected((id) => (prev.items.some((i) => i.id === id) ? id : null));
    if (!prev.floors.some((f) => f.level === floor)) setFloor(0);
  }, [history, project, floor]);
  const redo = useCallback(() => {
    if (!history.future.length) return;
    const next = history.future[0];
    setHistory({ past: [...history.past, project], future: history.future.slice(1) });
    setProject(next);
    setSelected((id) => (next.items.some((i) => i.id === id) ? id : null));
    if (!next.floors.some((f) => f.level === floor)) setFloor(0);
  }, [history, project, floor]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (storageBlocked) return;
    setSaved(false);
    const t = setTimeout(() => {
      try {
        const next = [project, ...library.filter((p) => p.id !== project.id)];
        localStorage.setItem(STORAGE, JSON.stringify(next));
        localStorage.setItem(ACTIVE, project.id);
        setLibrary(next);
        setSaved(true);
      } catch {
        setStorageBlocked(true);
        notify('Autosave is unavailable. Export a project file to keep your changes.');
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, storageBlocked]);
  const selectedItem = project.items.find((i) => i.id === selected);
  const patchItem = (patch: Partial<Item>) =>
    commit({
      ...project,
      items: project.items.map((i) => (i.id === selected ? { ...i, ...patch } : i)),
    });
  const save = useCallback(async () => {
    try {
      const data = JSON.stringify(project, null, 2);
      if (window.hearth) {
        if (await window.hearth.save(project.name, data))
          notify('Project file saved. Keep designing.');
      } else {
        download(`${project.name.replace(/[^a-z0-9 _-]/gi, '')}.hearth`, data);
        notify('Project file exported. You can open it on any computer.');
      }
    } catch {
      notify('Could not save the file. Try exporting again.');
    }
  }, [project, notify]);
  const switchProject = (p: Project) => {
    setLibrary((list) => [project, ...list.filter((i) => i.id !== project.id)]);
    setProject(p);
    setFloor(p.floors.some((f) => f.level === 0) ? 0 : p.floors[0].level);
    setSelected(null);
    setHistory({ past: [], future: [] });
    setModal(null);
    setSceneMode('dollhouse');
    setMode((m) => (m === '3d' ? 'split' : m));
    setTool('select');
  };
  const deleteProject = (p: Project) => {
    if (
      !window.confirm(
        `Delete “${p.name}” from this device? Export it first if you might want it later.`,
      )
    )
      return;
    const rest = library.filter((i) => i.id !== p.id);
    if (p.id === project.id) {
      const next = rest[0] || blankProject();
      setLibrary(rest.length ? rest : [next]);
      setProject(next);
      setFloor(0);
      setSelected(null);
      setHistory({ past: [], future: [] });
    } else setLibrary(rest);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(rest.length ? rest : []));
    } catch {
      /* Autosave reports storage problems. */
    }
    notify(`“${p.name}” deleted.`);
  };
  const importText = (text: string) => {
    try {
      if (text.length > 5000000) throw new Error('Project is too large.');
      const p = validateProject(JSON.parse(text));
      p.id = uid();
      switchProject(p);
      notify('Project opened as a new local copy.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not open this project.');
    }
  };
  const open = async () => {
    if (window.hearth) {
      try {
        const text = await window.hearth.open();
        if (text) importText(text);
      } catch {
        notify('Could not read the project file.');
      }
    } else input.current?.click();
  };
  const duplicate = () => {
    if (!selectedItem) return;
    const id = uid();
    commit({
      ...project,
      items: [
        ...project.items,
        {
          ...selectedItem,
          id,
          x: selectedItem.x + 0.5,
          z: selectedItem.z + 0.5,
          name: `${selectedItem.name} copy`,
        },
      ],
      openings: [
        ...project.openings,
        ...project.openings
          .filter((o) => o.roomId === selected)
          .map((o) => ({ ...o, id: uid(), roomId: id })),
      ],
    });
    setSelected(id);
  };
  const rotate = () => {
    if (!selected) return;
    commit(rotateItem(project, selected));
  };
  const remove = () => {
    if (!selectedItem) return;
    commit(removeItem(project, selectedItem.id));
    setSelected(null);
    notify(`${selectedItem.name} deleted.`, true);
  };
  const changeFloor = (level: number) => {
    setFloor(level);
    setSelected((id) => {
      const i = project.items.find((a) => a.id === id);
      return i && onLevel(i, level) ? id : null;
    });
  };
  const newLevel = (type: 'upper' | 'basement', opts: { stairId?: string; name?: string } = {}) => {
    const result = addLevel(project, {
      type,
      name: opts.name ?? floorName_,
      copyFrom: copyFloor && !opts.stairId ? floor : undefined,
      stairs: opts.stairId ? null : floorStairs,
      stairId: opts.stairId,
    });
    if (!result) {
      notify('Hearth Studio supports 8 upper floors and 3 basement levels.');
      return;
    }
    commit(result.project);
    setFloor(result.level);
    setSelected(null);
    setModal(null);
    setSceneMode((m) => (m === 'walk' ? 'dollhouse' : m));
    notify(
      opts.stairId || floorStairs
        ? `${floorName(result.project, result.level)} is ready, joined by stairs. Draw rooms around the landing.`
        : `${floorName(result.project, result.level)} is ready. The floor below shows as a dashed guide.`,
    );
  };
  const removeFloor = (level: number) => {
    const name = floorName(project, level);
    const count = project.items.filter((i) => i.floor === level).length;
    if (
      count &&
      !window.confirm(`Delete ${name} and the ${count} things on it? You can undo this.`)
    )
      return;
    commit(deleteFloor(project, level));
    setFloor(0);
    setSelected(null);
    notify(`${name} removed.`, true);
  };
  const selectTool = (t: Tool) => {
    setTool(t);
    if (mode === '3d') setMode('split');
    if (sceneMode === 'walk') setSceneMode('dollhouse');
    const e = catalogEntry(t);
    if (e && isOutside({ kind: e.kind } as Item) && floor !== 0) {
      setFloor(0);
      notify('Switched to the ground floor for landscaping.');
    }
  };
  const changeSceneMode = (m: SceneMode) => {
    setSceneMode(m);
    if (m === 'walk') {
      setTool('select');
      setMode('3d');
    } else if (sceneMode === 'walk') setMode('split');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (modal) setModal(null);
        else if (sceneMode === 'walk') changeSceneMode('dollhouse');
        else if (tool !== 'select') setTool('select');
        else setSelected(null);
        return;
      }
      if (modal) return;
      const ctrl = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (ctrl && k === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (ctrl && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (ctrl && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (sceneMode === 'walk') return;
      if (ctrl && k === 'd') {
        e.preventDefault();
        duplicate();
        return;
      }
      if (ctrl && k === 'c' && selectedItem) {
        clipboard.current = {
          item: selectedItem,
          openings: project.openings.filter((o) => o.roomId === selectedItem.id),
        };
        notify(`Copied ${selectedItem.name}. Press Ctrl+V to paste it on any floor.`);
        return;
      }
      if (ctrl && k === 'v' && clipboard.current) {
        e.preventDefault();
        const { item, openings } = clipboard.current;
        const id = uid();
        const level = isOutside(item) ? 0 : floor;
        const sameSpot =
          item.floor !== level && project.items.every((i) => i.id !== item.id || i.floor !== level);
        const pasted = {
          ...item,
          id,
          floor: level,
          x: item.x + (sameSpot ? 0 : 0.5),
          z: item.z + (sameSpot ? 0 : 0.5),
        };
        commit({
          ...project,
          items: [...project.items, pasted],
          openings: [
            ...project.openings,
            ...openings.map((o) => ({ ...o, id: uid(), roomId: id })),
          ],
        });
        setSelected(id);
        notify(`Pasted ${item.name} on ${floorName(project, level)}.`);
        return;
      }
      if (ctrl || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        remove();
      }
      if (e.key === '?') setModal('help');
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        const levels = project.floors.map((f) => f.level).sort((a, b) => a - b);
        const at = levels.indexOf(floor) + (e.key === 'PageUp' ? 1 : -1);
        if (levels[at] !== undefined) changeFloor(levels[at]);
      }
      if (k === 'v') setTool('select');
      if (k === 'r') selectTool('room');
      if (k === 'h') setTool('pan');
      if (k === 'm') selectTool(tool === 'measure' ? 'select' : 'measure');
      if (k === 'e' && selected) rotate();
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (arrows[e.key] && selectedItem) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.25,
          [dx, dz] = arrows[e.key];
        const moving = new Set([
          selectedItem.id,
          ...(isRoom(selectedItem) ? contentsOf(project, selectedItem).map((i) => i.id) : []),
        ]);
        commit({
          ...project,
          items: project.items.map((i) =>
            moving.has(i.id) ? { ...i, x: i.x + dx * step, z: i.z + dz * step } : i,
          ),
        });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const factor = project.units === 'ft' ? 3.28084 : 1;
  const u = project.units;
  const catalogTiles = (entries: typeof catalog) => (
    <div className="tile-grid">
      {entries.map((c) => {
        const Icon = icons[c.kind];
        return (
          <button
            key={c.id}
            className={`tile ${tool === c.id ? 'chosen' : ''}`}
            onClick={() => selectTool(tool === c.id ? 'select' : c.id)}
            title={c.hint}
          >
            <span className={`tile-icon ${c.kind}`}>
              {c.style ? <StairIcon style={c.style} /> : <Icon size={22} strokeWidth={1.5} />}
            </span>
            <strong>{c.name}</strong>
          </button>
        );
      })}
    </div>
  );
  const sections = (group: 'Build' | 'Furnish' | 'Landscape') => {
    const entries = catalog.filter((c) => c.group === group);
    const names = [...new Set(entries.map((c) => c.section || ''))];
    return names.map((name) => (
      <div key={name || group} className="catalog-block">
        {name && <div className="section-heading">{name.toUpperCase()}</div>}
        {catalogTiles(entries.filter((c) => (c.section || '') === name))}
      </div>
    ));
  };
  const stairInfo = (s: Item) => {
    const { lower, upper } = stairLevels(s);
    const here = floor === lower || floor === upper ? floor : s.floor;
    const other = here === lower ? upper : lower;
    const inRoom = (level: number, [x, z]: [number, number]) =>
      project.items.some(
        (r) =>
          isRoom(r) && r.floor === level && x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d,
      );
    const ends = stairEnds(s);
    return {
      lower,
      upper,
      here,
      other,
      ok: hasFloor(project, lower) && hasFloor(project, upper),
      topLands: inRoom(upper, ends.top),
      bottomLands: inRoom(lower, ends.bottom),
    };
  };
  let inspector: ReactNode;
  if (selectedItem) {
    const s = selectedItem;
    const st = s.kind === 'stairs' ? stairInfo(s) : null;
    inspector = (
      <div className="inspector-body">
        <span className="eyebrow">
          {s.kind === 'room'
            ? 'ROOM'
            : s.kind === 'stairs'
              ? 'STAIRS'
              : (catalogEntry(s.kind)?.name || s.kind).toUpperCase()}
        </span>
        <label className="field">
          Name
          <input
            key={s.id + s.name}
            aria-label="Shape name"
            defaultValue={s.name}
            maxLength={70}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== s.name)
                patchItem({ name: e.target.value.trim() });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        {s.kind === 'room' && /^Room( copy)?$/.test(s.name) && (
          <div className="name-chips" aria-label="Quick room names">
            {ROOM_NAMES.map(([name, color, finish]) => (
              <button
                key={name}
                onClick={() =>
                  patchItem({
                    name,
                    finish,
                    ...(s.color === catalogEntry('room')!.color ? { color } : {}),
                  })
                }
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {st && (
          <>
            <div className="field-label">Stair type</div>
            <div className="stair-styles">
              {(['straight', 'l', 'u', 'spiral'] as StairStyle[]).map((style) => (
                <button
                  key={style}
                  className={s.style === style ? 'selected' : ''}
                  aria-pressed={s.style === style}
                  title={stairNames[style]}
                  onClick={() => {
                    if (s.style === style) return;
                    const e = stairEntry(style);
                    const turned = s.rotation % 180 !== 0;
                    const w = turned ? e.d : e.w,
                      d = turned ? e.w : e.d;
                    patchItem({
                      style,
                      w,
                      d,
                      x: Math.round((s.x + s.w / 2 - w / 2) * 4) / 4,
                      z: Math.round((s.z + s.d / 2 - d / 2) * 4) / 4,
                      name: Object.values(stairNames).includes(s.name) ? stairNames[style] : s.name,
                    });
                  }}
                >
                  <StairIcon style={style} size={30} />
                  <span>{e_name(style)}</span>
                </button>
              ))}
            </div>
            <div className="field-label">Direction from {floorName(project, s.floor)}</div>
            <div className="segmented wide">
              {(['up', 'down'] as const).map((dir) => (
                <button
                  key={dir}
                  className={s.dir === dir ? 'active' : ''}
                  onClick={() => s.dir !== dir && patchItem({ dir })}
                >
                  {dir === 'up' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                  {dir === 'up' ? 'Goes up' : 'Goes down'}
                </button>
              ))}
            </div>
            {st.ok ? (
              <div className="connects">
                <Layers size={16} />
                <span>
                  Joins <strong>{floorName(project, st.lower)}</strong> ↑{' '}
                  <strong>{floorName(project, st.upper)}</strong>. Walk onto them in the walkthrough
                  to change floors.
                </span>
              </div>
            ) : (
              <div className="connects warn">
                <Layers size={16} />
                <span>
                  There's no floor {s.dir === 'down' ? 'below' : 'above'} yet.
                  <button
                    className="text-button"
                    onClick={() =>
                      newLevel(s.dir === 'down' ? 'basement' : 'upper', { stairId: s.id, name: '' })
                    }
                  >
                    <Plus size={13} />
                    Add {s.dir === 'down' ? 'a basement' : 'a floor above'} here
                  </button>
                </span>
              </div>
            )}
            {st.ok && !st.topLands && (
              <div className="connects warn">
                <Layers size={16} />
                <span>
                  The top step doesn't reach a room on {floorName(project, st.upper)}, so there's
                  nowhere to step off.
                  <button
                    className="text-button"
                    onClick={() => {
                      commit({
                        ...project,
                        items: [...project.items, landingFor(s, st.upper, 'Landing')],
                      });
                      notify(`Landing added on ${floorName(project, st.upper)}.`);
                    }}
                  >
                    <Plus size={13} />
                    Add a landing up there
                  </button>
                </span>
              </div>
            )}
            {!st.bottomLands && (
              <div className="connects warn">
                <Layers size={16} />
                <span>
                  The bottom step opens outside the rooms on {floorName(project, st.lower)}. Turn or
                  move the stairs so the UP end faces into a room.
                </span>
              </div>
            )}
            <button className="outline-button full" onClick={rotate}>
              <RotateCw size={15} />
              Turn 90° <kbd>E</kbd>
            </button>
            <p className="hint-text">
              The arrow on the plan points uphill. UP marks the bottom step; DN marks the top.
            </p>
          </>
        )}
        <div className="two-fields">
          <Numeric
            label={`Width (${u})`}
            value={s.w * factor}
            min={0.25 * factor}
            max={100 * factor}
            feet={u === 'ft'}
            onChange={(n) => patchItem({ w: n / factor })}
          />
          <Numeric
            label={`Depth (${u})`}
            value={s.d * factor}
            min={0.25 * factor}
            max={100 * factor}
            feet={u === 'ft'}
            onChange={(n) => patchItem({ d: n / factor })}
          />
        </div>
        {isRoom(s) && (
          <div className="area-card">
            <Ruler size={17} />
            <strong>{Math.round(s.w * s.d * (u === 'ft' ? 10.7639 : 1))}</strong>
            <span>{u === 'ft' ? 'square feet' : 'square meters'}</span>
          </div>
        )}
        {s.kind === 'landing' && (
          <label className="checkbox-label tight">
            <input
              type="checkbox"
              checked={!!s.covered}
              onChange={(e) => patchItem({ covered: e.target.checked || undefined })}
            />
            Covered — a porch roof on posts
          </label>
        )}
        {isRoom(s) && (
          <>
            <div className="field-label">Ceiling</div>
            <div className="segmented wide" role="group" aria-label="Ceiling">
              {(
                [
                  ['standard', 'Standard'],
                  ['tall', 'Tall'],
                  ['open', 'Open above'],
                ] as [Ceiling, string][]
              ).map(([c, label]) => (
                <button
                  key={c}
                  className={(s.ceiling || 'standard') === c ? 'active' : ''}
                  aria-pressed={(s.ceiling || 'standard') === c}
                  title={
                    c === 'tall'
                      ? 'A taller ceiling, where nothing is built on top'
                      : c === 'open'
                        ? 'Open all the way to the floor above — a two-storey entry or stairway'
                        : 'The usual ceiling height'
                  }
                  onClick={() => patchItem({ ceiling: c === 'standard' ? undefined : c })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint-text">
              {formatLength(ceilingHeight(project, s), u)} to the ceiling
              {s.ceiling === 'tall' && roomsAbove(project, s).length
                ? ' — a tall ceiling needs nothing built on top, and this room has ' +
                  roomsAbove(project, s)[0].name +
                  ' above it.'
                : s.ceiling === 'open' && !hasFloor(project, s.floor + 1)
                  ? ' — add a floor above and this room will open up into it.'
                  : '.'}
            </p>
            {s.ceiling === 'open' && !!roomsAbove(project, s).length && (
              <div className="connects warn">
                <Layers size={16} />
                <span>
                  {roomsAbove(project, s)
                    .map((r) => r.name)
                    .join(', ')}{' '}
                  {roomsAbove(project, s).length === 1 ? 'sits' : 'sit'} over this room, so the
                  floor there is cut away. Move{' '}
                  {roomsAbove(project, s).length === 1 ? 'it' : 'them'} aside to keep the opening
                  safe to walk around.
                </span>
              </div>
            )}
          </>
        )}
        {s.kind === 'room' && (
          <>
            <div className="field-label">Flooring</div>
            <div className="segmented wide" role="group" aria-label="Flooring">
              {FINISHES.map(([f, label]) => (
                <button
                  key={f}
                  className={(s.finish || 'wood') === f ? 'active' : ''}
                  aria-pressed={(s.finish || 'wood') === f}
                  onClick={() => patchItem({ finish: f })}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="field">
          {isRoom(s) ? 'Floor color' : 'Color'}
          <div className="swatches">
            {(isRoom(s)
              ? ['#e6ddca', '#d9c3a0', '#b89572', '#8d6e52', '#e2dfea', '#dbe8e4', '#d5d9d7']
              : ['#e6ddca', '#c9a87c', '#88a79b', '#b3b9cb', '#6d625a', '#d5d9d7', '#f3f3ef']
            ).map((c) => (
              <button
                key={c}
                aria-label={`Set shape color ${c}`}
                style={{ background: c }}
                className={s.color === c ? 'selected' : ''}
                onClick={() => patchItem({ color: c })}
              />
            ))}
            <input
              aria-label="Custom shape color"
              type="color"
              value={s.color}
              onChange={(e) => patchItem({ color: e.target.value })}
            />
          </div>
        </label>
        <div className="shape-actions">
          {s.kind !== 'stairs' && (
            <button
              className="outline-button"
              aria-label="Rotate shape 90 degrees"
              title="Rotate 90° (E)"
              onClick={rotate}
            >
              <RotateCw size={14} />
              Rotate
            </button>
          )}
          <button className="outline-button" onClick={duplicate} title="Duplicate (Ctrl+D)">
            <Copy size={14} />
            Duplicate
          </button>
          <button
            className="icon-button danger"
            aria-label="Delete selected shape"
            title="Delete (Del)"
            onClick={remove}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {isRoom(s) && (
          <>
            <div className="section-heading opening-heading">WINDOWS & DOORS</div>
            {project.openings
              .filter((o) => o.roomId === selected)
              .map((o) => (
                <div className="opening-row" key={o.id}>
                  <div>
                    {(() => {
                      const Icon = OPENING_ICONS[o.kind];
                      return <Icon size={15} />;
                    })()}
                    <strong>{openingName(o.kind)}</strong>
                    <button
                      aria-label={`Delete ${o.kind}`}
                      onClick={() =>
                        commit({
                          ...project,
                          openings: project.openings.filter((a) => a.id !== o.id),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <label>
                    Type
                    <select
                      aria-label={`${o.kind} type`}
                      value={o.kind}
                      onChange={(e) => {
                        const kind = e.target.value as OpeningKind;
                        const preset = openingKinds.find((k) => k.kind === kind)!;
                        commit({
                          ...project,
                          openings: project.openings.map((a) =>
                            a.id === o.id ? { ...a, kind, width: preset.width } : a,
                          ),
                        });
                      }}
                    >
                      {openingKinds.map((k) => (
                        <option key={k.kind} value={k.kind}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Wall
                    <select
                      aria-label={`${o.kind} wall`}
                      value={o.side}
                      onChange={(e) =>
                        commit({
                          ...project,
                          openings: project.openings.map((a) =>
                            a.id === o.id ? { ...a, side: e.target.value as typeof o.side } : a,
                          ),
                        })
                      }
                    >
                      {['north', 'south', 'east', 'west'].map((side) => (
                        <option key={side}>{side}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Position
                    <input
                      aria-label={`${o.kind} position`}
                      type="range"
                      min=".1"
                      max=".9"
                      step=".05"
                      value={o.offset}
                      onChange={(e) =>
                        commit({
                          ...project,
                          openings: project.openings.map((a) =>
                            a.id === o.id ? { ...a, offset: Number(e.target.value) } : a,
                          ),
                        })
                      }
                    />
                  </label>
                  {o.kind !== 'open' && (
                    <Numeric
                      label={`Opening width (${u})`}
                      value={o.width * factor}
                      min={0.3 * factor}
                      max={10 * factor}
                      feet={u === 'ft'}
                      onChange={(n) =>
                        commit({
                          ...project,
                          openings: project.openings.map((a) =>
                            a.id === o.id ? { ...a, width: n / factor } : a,
                          ),
                        })
                      }
                    />
                  )}
                </div>
              ))}
            <div className="opening-add">
              <button className="text-button" onClick={() => selectTool('door')}>
                <DoorOpen size={14} />
                Add door
              </button>
              <button className="text-button" onClick={() => selectTool('window')}>
                <Columns3 size={14} />
                Add window
              </button>
            </div>
          </>
        )}
      </div>
    );
  } else
    inspector = (
      <div className="inspector-body">
        <div className="floor-summary">
          <span className="section-heading">FLOORS</span>
          {[...project.floors].reverse().map((f) => (
            <div key={f.level} className={`level-row ${floor === f.level ? 'active' : ''}`}>
              {renamingFloor === f.level ? (
                <input
                  autoFocus
                  aria-label="Floor name"
                  defaultValue={f.name}
                  maxLength={60}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== f.name)
                      commit({
                        ...project,
                        floors: project.floors.map((a) =>
                          a.level === f.level ? { ...a, name } : a,
                        ),
                      });
                    setRenamingFloor(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenamingFloor(null);
                  }}
                />
              ) : (
                <button className="level-pick" onClick={() => changeFloor(f.level)}>
                  <Layers size={14} />
                  <span>{f.name}</span>
                  <small>
                    {Math.round(area(project, f.level)).toLocaleString()}{' '}
                    {u === 'ft' ? 'ft²' : 'm²'}
                  </small>
                </button>
              )}
              <button
                className="icon-button small"
                aria-label={`Rename ${f.name}`}
                title="Rename"
                onClick={() => setRenamingFloor(f.level)}
              >
                <Pencil size={13} />
              </button>
              {f.level !== 0 && (
                <button
                  className="icon-button small danger"
                  aria-label={`Delete ${f.name}`}
                  title="Delete floor"
                  onClick={() => removeFloor(f.level)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          <button
            className="text-button"
            onClick={() => {
              setFloorName('');
              setCopyFloor(false);
              setModal('floor');
            }}
          >
            <Plus size={13} />
            Add a floor or basement
          </button>
        </div>
        <span className="section-heading">NOTES FOR THIS VERSION</span>
        <textarea
          key={project.id}
          className="notes"
          aria-label="Notes for this version"
          placeholder="What we love, what to change, ideas to try…"
          defaultValue={project.notes || ''}
          maxLength={4000}
          rows={3}
          onBlur={(e) => {
            const notes = e.target.value.trim();
            if (notes !== (project.notes || '')) commit({ ...project, notes: notes || undefined });
          }}
        />
        <div className="estimate">
          <span className="section-heading">ROUGH BUILD ESTIMATE</span>
          <strong>{money(squareFeet(project) * (project.costPerSqFt ?? DEFAULT_COST))}</strong>
          <label>
            at $
            <input
              key={`${project.id}-${project.costPerSqFt}`}
              aria-label="Cost per square foot"
              type="number"
              min={0}
              max={5000}
              step={5}
              defaultValue={project.costPerSqFt ?? DEFAULT_COST}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (
                  Number.isFinite(n) &&
                  n >= 0 &&
                  n <= 5000 &&
                  n !== (project.costPerSqFt ?? DEFAULT_COST)
                )
                  commit({ ...project, costPerSqFt: n });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            per sq ft × {Math.round(squareFeet(project)).toLocaleString()} sq ft
          </label>
          <small>Finished rooms only. A ballpark for conversations, not a quote.</small>
        </div>
        <span className="section-heading">FINISHES</span>
        <label className="field">
          Exterior walls
          <div className="swatches">
            {['#f0e9dc', '#dad4c7', '#a5b0a0', '#b38368', '#586b66', '#3f4446'].map((c) => (
              <button
                key={c}
                aria-label={`Exterior ${c}`}
                style={{ background: c }}
                className={project.exterior === c ? 'selected' : ''}
                onClick={() => commit({ ...project, exterior: c })}
              />
            ))}
            <input
              type="color"
              aria-label="Custom exterior color"
              value={project.exterior}
              onChange={(e) => commit({ ...project, exterior: e.target.value })}
            />
          </div>
        </label>
        <label className="field">
          Interior walls
          <div className="swatches">
            {['#f4efe6', '#ffffff', '#e8e2d6', '#dfe6e1', '#e9dcd2', '#d8dde6'].map((c) => (
              <button
                key={c}
                aria-label={`Interior ${c}`}
                style={{ background: c }}
                className={(project.interior || '#f4efe6') === c ? 'selected' : ''}
                onClick={() => commit({ ...project, interior: c })}
              />
            ))}
            <input
              type="color"
              aria-label="Custom interior color"
              value={project.interior || '#f4efe6'}
              onChange={(e) => commit({ ...project, interior: e.target.value })}
            />
          </div>
        </label>
        <label className="field">
          Roof style
          <select
            value={project.roofStyle}
            onChange={(e) => commit({ ...project, roofStyle: e.target.value as 'gable' | 'flat' })}
          >
            <option value="gable">Classic gable</option>
            <option value="flat">Modern flat</option>
          </select>
        </label>
        <label className="field">
          Roof finish
          <div className="swatches">
            {['#586662', '#716456', '#b17759', '#b3ada0', '#2f3335'].map((c) => (
              <button
                key={c}
                aria-label={`Roof ${c}`}
                style={{ background: c }}
                className={project.roof === c ? 'selected' : ''}
                onClick={() => commit({ ...project, roof: c })}
              />
            ))}
            <input
              aria-label="Custom roof color"
              type="color"
              value={project.roof}
              onChange={(e) => commit({ ...project, roof: e.target.value })}
            />
          </div>
        </label>
        <button
          className="outline-button full"
          onClick={() => {
            setMode((m) => (m === 'plan' ? 'split' : m));
            setSceneMode('exterior');
          }}
        >
          <Home size={15} />
          See the exterior
        </button>
        <div className="inspector-tip">
          <MousePointer2 size={18} />
          <p>Click any room or piece on the plan to size, turn, recolor, or name it.</p>
        </div>
      </div>
    );
  return (
    <div className={`app ${walking ? 'is-walking' : ''}`}>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => setModal('projects')}
          aria-label="Hearth Studio projects"
        >
          <span className="brand-mark">
            <Home size={19} />
          </span>
          <span>
            hearth<span className="brand-studio">STUDIO</span>
          </span>
        </button>
        <div className="header-divider" />
        <div className="project-title">
          {rename ? (
            <input
              autoFocus
              maxLength={70}
              defaultValue={project.name}
              aria-label="Project name"
              onBlur={(e) => {
                if (e.target.value.trim()) commit({ ...project, name: e.target.value.trim() });
                setRename(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          ) : (
            <button onClick={() => setRename(true)} title="Rename project">
              {project.name}
              <Pencil size={12} />
            </button>
          )}
          <span className={storageBlocked ? 'save-state warning' : 'save-state'}>
            {storageBlocked ? (
              'Export to save'
            ) : saved ? (
              <>
                <Check size={12} />
                All changes saved on this device
              </>
            ) : (
              'Saving…'
            )}
          </span>
        </div>
        <div className="header-actions">
          <div className="undo-group">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!history.past.length}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!history.future.length}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
          </div>
          <button className="subtle-button" onClick={() => setModal('projects')}>
            <FolderOpen size={16} />
            My projects
          </button>
          <button className="outline-button" onClick={save}>
            <Download size={15} />
            Export project
          </button>
          <button
            className="icon-button"
            aria-label="Help and shortcuts"
            title="Help (?)"
            onClick={() => setModal('help')}
          >
            <HelpCircle size={20} />
          </button>
          <button
            className="primary-button walk-button"
            onClick={() => changeSceneMode(walking ? 'dollhouse' : 'walk')}
          >
            <Footprints size={17} />
            {walking ? 'Back to editing' : 'Walk through'}
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="library-panel">
          <div className="library-tabs" role="tablist">
            {(['Build', 'Furnish', 'Landscape'] as const).map((t, index) => {
              const Icon = [Home, Armchair, TreePine][index];
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'active' : ''}
                  onClick={() => setTab(t)}
                >
                  <Icon size={17} />
                  <span>{TILE_GROUPS[t]}</span>
                </button>
              );
            })}
          </div>
          <div className="catalog-section">
            {tab === 'Build' && (
              <>
                <div className="catalog-block">
                  <div className="section-heading">SPACES</div>
                  <div className="tile-grid">
                    {catalog
                      .filter((c) => c.kind === 'room' || c.kind === 'garage')
                      .map((c) => {
                        const Icon = icons[c.kind];
                        return (
                          <button
                            key={c.id}
                            className={`tile ${tool === c.id ? 'chosen' : ''}`}
                            onClick={() => selectTool(tool === c.id ? 'select' : c.id)}
                          >
                            <span className={`tile-icon ${c.kind}`}>
                              <Icon size={22} strokeWidth={1.5} />
                            </span>
                            <strong>{c.name}</strong>
                            <small>Drag to draw</small>
                          </button>
                        );
                      })}
                  </div>
                </div>
                <div className="catalog-block">
                  <div className="section-heading">DOORS & OPENINGS</div>
                  <div className="tile-grid">
                    {openingKinds.map((o) => {
                      const Icon = OPENING_ICONS[o.kind];
                      return (
                        <button
                          key={o.kind}
                          className={`tile ${tool === o.kind ? 'chosen' : ''}`}
                          onClick={() => selectTool(tool === o.kind ? 'select' : o.kind)}
                          title={o.hint}
                        >
                          <span className="tile-icon">
                            <Icon size={22} strokeWidth={1.5} />
                          </span>
                          <strong>{o.name}</strong>
                          <small>{o.kind === 'open' ? 'Click a wall' : o.hint}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="catalog-block">
                  <div className="section-heading">STAIRS</div>
                  <div
                    className="segmented wide stair-dir"
                    role="group"
                    aria-label="New stairs lead"
                  >
                    {(['up', 'down'] as const).map((d) => (
                      <button
                        key={d}
                        className={stairDir === d ? 'active' : ''}
                        aria-pressed={stairDir === d}
                        onClick={() => setStairDir(d)}
                      >
                        {d === 'up' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                        {d === 'up' ? 'Up' : 'Down'}
                      </button>
                    ))}
                  </div>
                  {catalogTiles(catalog.filter((c) => c.kind === 'stairs'))}
                  <p className="hint-text">
                    Pick a style, then click the plan. From {floorName(project, floor)} these lead{' '}
                    {stairDir} to{' '}
                    {hasFloor(project, floor + (stairDir === 'up' ? 1 : -1))
                      ? floorName(project, floor + (stairDir === 'up' ? 1 : -1))
                      : `a new ${stairDir === 'up' ? 'floor' : 'basement'}`}
                    .
                  </p>
                </div>
                <div className="catalog-block">
                  <div className="section-heading">DECKS & LANDINGS</div>
                  {catalogTiles(catalog.filter((c) => c.section === 'Decks & landings'))}
                  <p className="hint-text">
                    A landing sits at this floor's level: a porch by the front door, or a balcony
                    upstairs. Above the ground it gets a rail, and it can take a porch roof.
                  </p>
                </div>
              </>
            )}
            {tab === 'Furnish' && sections('Furnish')}
            {tab === 'Landscape' && (
              <>
                {sections('Landscape')}
                {floor !== 0 && <p className="hint-text">Landscaping lives on the ground floor.</p>}
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <Sparkles size={16} />
            <p>
              <strong>Tip:</strong> Rooms carry their furniture when you move them. Press{' '}
              <kbd>E</kbd> to turn anything.
            </p>
            <button onClick={() => setModal('help')}>
              How it works <ChevronRight size={13} />
            </button>
          </div>
        </aside>
        <main className="main">
          <div className="workspace-toolbar">
            <div className="floor-picker">
              <Layers size={17} />
              <select
                aria-label="Active floor"
                value={floor}
                onChange={(e) => changeFloor(Number(e.target.value))}
              >
                {[...project.floors].reverse().map((f) => (
                  <option key={f.level} value={f.level}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="select-caret" />
              <button
                className="icon-button small"
                title="Add floor or basement"
                aria-label="Add floor or basement"
                onClick={() => {
                  setFloorName('');
                  setCopyFloor(false);
                  setModal('floor');
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="drawing-tools">
              <button
                className={tool === 'select' ? 'active' : ''}
                title="Select / move (V)"
                onClick={() => selectTool('select')}
              >
                <MousePointer2 size={16} />
                <span>Select</span>
              </button>
              <button
                className={tool === 'room' ? 'active' : ''}
                title="Draw room (R)"
                onClick={() => selectTool('room')}
              >
                <Square size={16} />
                <span>Draw room</span>
              </button>
              <button
                className={tool === 'measure' ? 'active' : ''}
                title="Measure a distance (M)"
                onClick={() => selectTool(tool === 'measure' ? 'select' : 'measure')}
              >
                <Ruler size={16} />
                <span>Measure</span>
              </button>
              <button
                className={tool === 'pan' ? 'active' : ''}
                title="Pan (H) — or drag empty space"
                aria-label="Pan"
                onClick={() => selectTool('pan')}
              >
                <Hand size={16} />
              </button>
            </div>
            <div className="view-tabs">
              <button
                className={mode === 'plan' ? 'active' : ''}
                onClick={() => {
                  setMode('plan');
                  setSceneMode('dollhouse');
                }}
              >
                <Grid2X2 size={14} />
                2D plan
              </button>
              <button
                className={mode === 'split' ? 'active' : ''}
                onClick={() => {
                  setMode('split');
                  if (walking) setSceneMode('dollhouse');
                }}
              >
                <PanelLeftClose size={14} />
                Split view
              </button>
              <button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>
                <Maximize2 size={14} />
                3D view
              </button>
            </div>
            <div className="canvas-options">
              <button
                className={snapping ? 'snap active' : 'snap'}
                aria-pressed={snapping}
                onClick={() => setSnapping((s) => !s)}
                title="Snap to the grid and to walls"
              >
                <Grid2X2 size={14} />
                <span>Snap {snapping ? 'on' : 'off'}</span>
              </button>
              <select
                aria-label="Measurement units"
                value={project.units}
                onChange={(e) => commit({ ...project, units: e.target.value as 'ft' | 'm' })}
              >
                <option value="ft">Feet</option>
                <option value="m">Meters</option>
              </select>
            </div>
          </div>
          <div className={`canvases view-${mode}`}>
            {mode !== '3d' && !walking && (
              <Plan
                project={project}
                floor={floor}
                selected={selected}
                tool={tool}
                snapping={snapping}
                onSelect={setSelected}
                onChange={commit}
                onTool={setTool}
                onNotice={notify}
                onRotate={rotate}
                onDuplicate={duplicate}
                onDelete={remove}
                stairDir={stairDir}
              />
            )}
            {mode !== 'plan' && (
              <Scene
                project={project}
                floor={floor}
                mode={sceneMode}
                onMode={changeSceneMode}
                onNotice={notify}
                onLevel={setFloor}
                onPick={(id) => {
                  setSelected(id);
                  const item = project.items.find((i) => i.id === id);
                  if (item && !onLevel(item, floor) && !isOutside(item)) setFloor(item.floor);
                }}
              />
            )}
          </div>
          <div className="workspace-footer">
            <div className="project-stats">
              <span>
                <strong>{Math.round(area(project)).toLocaleString()}</strong>{' '}
                {u === 'ft' ? 'sq ft' : 'm²'}
              </span>
              <span>
                <strong>{project.items.filter((i) => i.kind === 'room').length}</strong> rooms
              </span>
              <span>
                <strong>{project.floors.length}</strong>{' '}
                {project.floors.length === 1 ? 'floor' : 'floors'}
              </span>
              <span>{bedBathLabel(project)}</span>
              <span title="Rough build estimate — set the cost per square foot on the right">
                ≈{' '}
                <strong>
                  {money(squareFeet(project) * (project.costPerSqFt ?? DEFAULT_COST))}
                </strong>
              </span>
            </div>
            <button onClick={() => setModal('help')}>
              Keyboard shortcuts <kbd>?</kbd>
            </button>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-title">
            <strong>{selectedItem ? selectedItem.name : 'Your home'}</strong>
            {selectedItem && (
              <button
                className="icon-button small"
                aria-label="Deselect shape"
                title="Done (Esc)"
                onClick={() => setSelected(null)}
              >
                <X size={15} />
              </button>
            )}
          </div>
          {inspector}
        </aside>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".hearth,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 5000000)
              notify('This file is too large. Choose a Hearth project under 5 MB.');
            else importText(await f.text());
          }
          e.target.value = '';
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          {noticeUndo && (
            <button
              className="toast-action"
              aria-label="Undo the delete"
              onClick={() => {
                undo();
                setNotice('');
              }}
            >
              Undo
            </button>
          )}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {storageBlocked && (
        <div className="save-warning">
          {start.error
            ? 'Saved data could not be read. It has not been overwritten.'
            : 'Device storage is full or unavailable.'}{' '}
          <button onClick={save}>Export this project</button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal modal-${modal}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'projects'
                ? 'Your projects'
                : modal === 'floor'
                  ? 'Add a floor'
                  : 'Welcome to Hearth Studio'
            }
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === 'projects' && (
              <>
                <span className="eyebrow">ROOM FOR EVERY POSSIBILITY</span>
                <h2>Your dream homes.</h2>
                <p>Try a new idea. Keep your favorites. Make a copy before a big change.</p>
                <div className="project-modal-actions">
                  <button className="primary-button" onClick={() => switchProject(blankProject())}>
                    <Plus size={16} />
                    Start from scratch
                  </button>
                  <button className="outline-button" onClick={() => switchProject(sampleProject())}>
                    <Sparkles size={16} />
                    Try the Sunday House
                  </button>
                  <button className="text-button" onClick={open}>
                    <FolderOpen size={16} />
                    Open project file
                  </button>
                </div>
                {compare.length === 2 && (
                  <Compare
                    pair={compare
                      .map((id) => [project, ...library].find((p) => p.id === id))
                      .filter((p): p is Project => !!p)}
                    onClear={() => setCompare([])}
                    onOpen={(p) => (p.id === project.id ? setModal(null) : switchProject(p))}
                  />
                )}
                <div className="project-grid">
                  {[project, ...library.filter((p) => p.id !== project.id)].map((p) => (
                    <div
                      className={`project-card ${p.id === project.id ? 'current' : ''}`}
                      key={p.id}
                    >
                      <button
                        className="project-open"
                        onClick={() => (p.id === project.id ? setModal(null) : switchProject(p))}
                      >
                        <div className="project-thumbnail">
                          <Thumbnail p={p} />
                          <span>
                            {p.floors.length} {p.floors.length === 1 ? 'floor' : 'floors'}
                          </span>
                        </div>
                        <strong>{p.name}</strong>
                        {p.notes && <em className="project-note">{p.notes.split(/\n/)[0]}</em>}
                        <small>
                          {Math.round(area(p)).toLocaleString()} {p.units === 'ft' ? 'sq ft' : 'm²'}{' '}
                          ·{' '}
                          {p.id === project.id
                            ? 'Open now'
                            : new Date(p.updated).toLocaleDateString()}
                        </small>
                      </button>
                      <div className="project-card-actions">
                        <button
                          aria-pressed={compare.includes(p.id)}
                          className={compare.includes(p.id) ? 'on' : ''}
                          title="Pick two designs to compare side by side"
                          onClick={() =>
                            setCompare((c) =>
                              c.includes(p.id)
                                ? c.filter((id) => id !== p.id)
                                : [...c, p.id].slice(-2),
                            )
                          }
                        >
                          <Columns3 size={13} />
                          Compare
                        </button>
                        <button
                          aria-label={`Duplicate project ${p.name}`}
                          onClick={() =>
                            switchProject({
                              ...structuredClone(p),
                              id: uid(),
                              name: `${p.name} copy`,
                              updated: new Date().toISOString(),
                            })
                          }
                        >
                          <Copy size={13} />
                          Make a copy
                        </button>
                        <button
                          className="danger"
                          aria-label={`Delete project ${p.name}`}
                          onClick={() => deleteProject(p)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="modal-note">
                  <Save size={16} />
                  <span>
                    Projects autosave in this browser on this device. Export a .hearth file for a
                    backup or to move between computers.
                  </span>
                </div>
              </>
            )}
            {modal === 'floor' && (
              <>
                <span className="eyebrow">MORE ROOM FOR YOUR IDEAS</span>
                <h2>Build another level.</h2>
                <div className="floor-options">
                  <button
                    className={floorType === 'upper' ? 'selected' : ''}
                    onClick={() => setFloorType('upper')}
                  >
                    <ArrowUpFromLine size={25} />
                    <strong>Upper floor</strong>
                  </button>
                  <button
                    className={floorType === 'basement' ? 'selected' : ''}
                    onClick={() => setFloorType('basement')}
                  >
                    <ArrowDownToLine size={25} />
                    <strong>Basement</strong>
                  </button>
                </div>
                <label className="field">
                  Floor name (optional)
                  <input
                    autoFocus
                    value={floorName_}
                    onChange={(e) => setFloorName(e.target.value)}
                    maxLength={60}
                    placeholder={defaultFloorName(nextLevel(project, floorType))}
                  />
                </label>
                <div className="field-label">Connect it with stairs</div>
                <div className="stair-styles in-modal">
                  {(['straight', 'l', 'u', 'spiral'] as StairStyle[]).map((style) => (
                    <button
                      key={style}
                      className={floorStairs === style ? 'selected' : ''}
                      onClick={() => setFloorStairs(style)}
                    >
                      <StairIcon style={style} size={30} />
                      <span>{e_name(style)}</span>
                    </button>
                  ))}
                  <button
                    className={floorStairs === null ? 'selected' : ''}
                    onClick={() => setFloorStairs(null)}
                  >
                    <X size={24} strokeWidth={1.4} />
                    <span>None</span>
                  </button>
                </div>
                {floorStairs && (
                  <p className="hint-text">
                    Stairs go on{' '}
                    {floorName(
                      project,
                      floorType === 'upper'
                        ? Math.max(0, ...project.floors.map((f) => f.level))
                        : Math.min(0, ...project.floors.map((f) => f.level)),
                    )}{' '}
                    {floorType === 'upper' ? 'heading up' : 'heading down'}, with a landing on the
                    new floor to start from. Move or turn them any time.
                  </p>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={copyFloor}
                    onChange={(e) => setCopyFloor(e.target.checked)}
                  />
                  Copy rooms and furniture from {floorName(project, floor)}
                </label>
                <button className="primary-button full" onClick={() => newLevel(floorType)}>
                  <Plus size={16} />
                  Create floor
                </button>
              </>
            )}
            {modal === 'help' && (
              <>
                <span className="eyebrow">WELCOME TO HEARTH STUDIO</span>
                <h2>Design it. Then walk right in.</h2>
                <div className="tour-steps">
                  <div>
                    <span>01</span>
                    <section>
                      <strong>Draw your spaces</strong>
                      <p>
                        Choose Draw room and drag on the grid. Drag rooms to move them — their
                        furniture comes along. Drag any amber corner to resize.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>02</span>
                    <section>
                      <strong>Doors, windows, and furniture</strong>
                      <p>
                        Pick Door or Window, then click a wall. Furnish from the Furnish tab; a
                        preview follows your cursor. Press E (or ↻) to turn the selected piece.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>03</span>
                    <section>
                      <strong>Go up a level</strong>
                      <p>
                        Use + beside the floor menu. Pick a stair style and Hearth lays the stairs
                        and a landing for you. On the plan, UP marks the bottom step and DN the top.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>04</span>
                    <section>
                      <strong>Walk through it together</strong>
                      <p>
                        Walk through starts at your front door. Use W A S D or the on-screen arrows,
                        drag to look around, and walk up the stairs. Esc comes back to editing.
                      </p>
                    </section>
                  </div>
                </div>
                <div className="shortcut-grid">
                  <span>
                    <kbd>V</kbd>Select
                  </span>
                  <span>
                    <kbd>R</kbd>Draw room
                  </span>
                  <span>
                    <kbd>M</kbd>Measure
                  </span>
                  <span>
                    <kbd>E</kbd>Turn 90°
                  </span>
                  <span>
                    <kbd>Del</kbd>Delete
                  </span>
                  <span>
                    <kbd>Ctrl D</kbd>Duplicate
                  </span>
                  <span>
                    <kbd>Ctrl C</kbd>
                    <kbd>V</kbd>Copy to a floor
                  </span>
                  <span>
                    <kbd>Ctrl Z</kbd>Undo
                  </span>
                  <span>
                    <kbd>PgUp</kbd>
                    <kbd>PgDn</kbd>Change floor
                  </span>
                  <span>
                    <kbd>Scroll</kbd>Zoom plan
                  </span>
                  <span>
                    <kbd>Shift</kbd>+drag Pan
                  </span>
                </div>
                <p className="small-note">
                  A concept studio for dreaming, not construction drawings. Rooms are rectangles and
                  roofs are simplified.
                </p>
                <button className="primary-button" onClick={() => setModal(null)}>
                  Let's make room <ChevronRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function e_name(style: StairStyle) {
  return stairEntry(style).name;
}
