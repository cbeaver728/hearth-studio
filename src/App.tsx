import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  DoorOpen,
  Download,
  Footprints,
  Grid2X2,
  Hand,
  HelpCircle,
  Home,
  Layers,
  LayoutDashboard,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  Armchair,
  TreePine,
  PanelLeftClose,
  FolderOpen,
  BedDouble,
  Car,
  Waves,
  Fence,
  Flower2,
  Table2,
  Columns3,
  DoorClosed,
} from 'lucide-react';
import Plan, { type Tool } from './Plan';
import Scene, { type SceneMode } from './Scene';
import {
  area,
  blankProject,
  catalog,
  formatLength,
  isOutside,
  isRoom,
  removeItem,
  sampleProject,
  uid,
  validateProject,
  type Item,
  type Kind,
  type Project,
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
  garage: Car,
  stairs: Layers,
  sofa: Armchair,
  bed: BedDouble,
  table: Table2,
  counter: Columns3,
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
        };
    }
  } catch {
    return { list: [], project: sampleProject(), error: true };
  }
  const project = sampleProject();
  return { list: [project], project, error: false };
}
function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Numeric({
  label,
  value,
  onChange,
  min = 0.25,
  max = 100,
  step = 0.25,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (text.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else setText(String(Math.round(value * 100) / 100));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
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
  const [modal, setModal] = useState<'projects' | 'help' | 'floor' | null>(null);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const [rename, setRename] = useState(false);
  const [floorName, setFloorName] = useState('');
  const [floorType, setFloorType] = useState<'upper' | 'basement'>('upper');
  const [copyFloor, setCopyFloor] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const notify = useCallback((s: string) => setNotice(s), []);
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
      setHistory((h) => ({ past: [...h.past, project].slice(-70), future: [] }));
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
  }, [history, project]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
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
    setTool('select');
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if (e.key === 'Escape') {
        setModal(null);
        setTool('select');
        if (sceneMode === 'walk') setMode('split');
        setSceneMode('dollhouse');
        return;
      }
      if (modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (sceneMode === 'walk') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          commit(removeItem(project, selected));
          setSelected(null);
        }
      }
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'r') setTool('room');
      if (e.key.toLowerCase() === 'h') setTool('pan');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [project, selected, save, undo, redo, commit, sceneMode, modal]);
  const addFloor = () => {
    const level =
      floorType === 'upper'
        ? Math.max(0, ...project.floors.map((f) => f.level)) + 1
        : Math.min(0, ...project.floors.map((f) => f.level)) - 1;
    if (level > 8 || level < -3) {
      notify('This studio supports 8 upper floors and 3 basement levels.');
      return;
    }
    const copies = copyFloor
      ? project.items
          .filter((i) => i.floor === floor && !isOutside(i))
          .map((i) => ({ ...i, id: uid(), floor: level }))
      : [];
    const original = project.items.filter((i) => i.floor === floor && !isOutside(i));
    const openings = copyFloor
      ? project.openings
          .filter((o) => original.some((i) => i.id === o.roomId))
          .map((o) => ({
            ...o,
            id: uid(),
            roomId: copies[original.findIndex((i) => i.id === o.roomId)].id,
          }))
      : [];
    commit({
      ...project,
      floors: [
        ...project.floors,
        {
          level,
          name:
            floorName.trim() || (level < 0 ? `Basement ${Math.abs(level)}` : `Floor ${level + 1}`),
        },
      ].sort((a, b) => a.level - b.level),
      items: [...project.items, ...copies],
      openings: [...project.openings, ...openings],
    });
    setFloor(level);
    setSelected(null);
    setModal(null);
    setSceneMode('dollhouse');
    notify('New floor ready. Draw rooms or use the floor below as a guide.');
  };
  const selectTool = (t: Tool) => {
    setTool(t);
    if (mode === '3d') setMode('split');
    if (sceneMode === 'walk') setSceneMode('dollhouse');
  };
  const changeSceneMode = (m: SceneMode) => {
    setSceneMode(m);
    if (m === 'walk') setMode('3d');
    else if (sceneMode === 'walk') setMode('split');
  };
  const factor = project.units === 'ft' ? 3.28084 : 1;
  return (
    <div className="app">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => setModal('projects')}
          aria-label="Hearth Studio projects"
        >
          <span className="brand-mark">
            <Home size={23} />
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
              <ChevronDown size={14} />
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
              'Saving your ideas…'
            )}
          </span>
        </div>
        <div className="header-actions">
          <button className="subtle-button" onClick={() => setModal('projects')}>
            <FolderOpen size={16} />
            My projects
          </button>
          <button className="outline-button" onClick={save}>
            <Download size={15} />
            Export project
          </button>
          <button
            className="primary-button"
            onClick={() => changeSceneMode(sceneMode === 'walk' ? 'dollhouse' : 'walk')}
          >
            <Footprints size={16} />
            {sceneMode === 'walk' ? 'Back to editing' : 'Walk through'}
          </button>
          <button
            className="icon-button"
            aria-label="Help and shortcuts"
            onClick={() => setModal('help')}
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="library-panel">
          <div className="sidebar-intro">
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h1>
              Make yourself
              <br />
              at home.
            </h1>
            <p>
              A little imagination.
              <br />A place that's entirely you.
            </p>
          </div>
          <div className="library-tabs">
            {(['Build', 'Furnish', 'Landscape'] as const).map((t, index) => {
              const Icon = [Home, Armchair, TreePine][index];
              return (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  <Icon size={17} />
                  <span>{t === 'Landscape' ? 'Outside' : t}</span>
                </button>
              );
            })}
          </div>
          <div className="catalog-section">
            <div className="section-heading">
              {tab === 'Build'
                ? 'ROOM TO DREAM'
                : tab === 'Furnish'
                  ? 'THE PERSONAL TOUCH'
                  : 'BEYOND YOUR WALLS'}
            </div>
            <div className="catalog">
              {catalog
                .filter((c) => c.group === tab)
                .map((c) => {
                  const Icon = icons[c.kind];
                  return (
                    <button
                      key={c.kind}
                      className={`catalog-card ${tool === c.kind ? 'chosen' : ''}`}
                      onClick={() => selectTool(c.kind)}
                    >
                      <span className={`catalog-icon ${c.kind}`}>
                        <Icon size={25} strokeWidth={1.4} />
                      </span>
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.hint}</small>
                      </span>
                      <Plus size={14} />
                    </button>
                  );
                })}
            </div>
            {tab === 'Build' && (
              <>
                <div className="section-heading opening-heading">LET THE OUTSIDE IN</div>
                <div className="opening-tools">
                  <button
                    className={tool === 'door' ? 'chosen' : ''}
                    onClick={() => selectTool('door')}
                  >
                    <DoorOpen size={25} strokeWidth={1.4} />
                    <strong>Door</strong>
                    <small>Click a wall</small>
                  </button>
                  <button
                    className={tool === 'window' ? 'chosen' : ''}
                    onClick={() => selectTool('window')}
                  >
                    <Columns3 size={25} strokeWidth={1.4} />
                    <strong>Window</strong>
                    <small>Click a wall</small>
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="tip-icon">
              <Sparkles size={18} />
            </div>
            <strong>Start with a feeling.</strong>
            <p>
              A sunny kitchen? A quiet nook?
              <br />
              Draw a room and see it take shape.
            </p>
            <button onClick={() => setModal('help')}>
              A quick tour <ChevronRight size={13} />
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
                onChange={(e) => {
                  setFloor(Number(e.target.value));
                  setSelected(null);
                }}
              >
                {project.floors.map((f) => (
                  <option key={f.level} value={f.level}>
                    {f.name}
                  </option>
                ))}
              </select>
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
                  setSceneMode('dollhouse');
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
          </div>
          <div className="design-heading">
            <div>
              <span className="eyebrow">DREAM IT. DRAW IT. WALK RIGHT IN.</span>
              <h2>
                Your home, taking shape<span>.</span>
              </h2>
            </div>
            <div className="project-stats">
              <strong>
                {Math.round(area(project)).toLocaleString()}
                <small>{project.units === 'ft' ? 'sq ft' : 'm²'}</small>
              </strong>
              <span />
              <strong>
                {project.items.filter((i) => i.kind === 'room').length}
                <small>rooms</small>
              </strong>
              <span />
              <strong>
                {project.floors.length}
                <small>{project.floors.length === 1 ? 'floor' : 'floors'}</small>
              </strong>
            </div>
          </div>
          <div className="canvas-toolbar">
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
                className={tool === 'pan' ? 'active' : ''}
                title="Pan (H)"
                onClick={() => selectTool('pan')}
              >
                <Hand size={16} />
                <span>Pan</span>
              </button>
            </div>
            <div className="canvas-options">
              <button
                className={snapping ? 'snap active' : 'snap'}
                aria-pressed={snapping}
                onClick={() => setSnapping((s) => !s)}
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
            {mode !== '3d' && (
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
              />
            )}{' '}
            {mode !== 'plan' && (
              <Scene
                project={project}
                floor={floor}
                mode={sceneMode}
                onMode={changeSceneMode}
                onNotice={notify}
              />
            )}
          </div>
          <div className="workspace-footer">
            <span>
              <span className="live-dot" />
              Your imagination. In every dimension.
            </span>
            <button onClick={() => setModal('help')}>
              Keyboard shortcuts <kbd>?</kbd>
            </button>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-title">
            <Settings2 size={17} />
            <strong>{selectedItem ? 'Make it yours' : 'Finishing touches'}</strong>
            {selectedItem && (
              <button
                className="icon-button small"
                aria-label="Deselect shape"
                onClick={() => setSelected(null)}
              >
                <X size={15} />
              </button>
            )}
          </div>
          {selectedItem ? (
            <div className="inspector-body">
              <span className="eyebrow">
                {selectedItem.kind === 'room' ? 'YOUR ROOM' : selectedItem.kind.toUpperCase()}
              </span>
              <label className="field">
                Name
                <input
                  key={selectedItem.id + selectedItem.name}
                  aria-label="Shape name"
                  defaultValue={selectedItem.name}
                  maxLength={70}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== selectedItem.name)
                      patchItem({ name: e.target.value.trim() });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <div className="two-fields">
                <Numeric
                  label={`Width (${project.units})`}
                  value={selectedItem.w * factor}
                  min={0.25 * factor}
                  max={100 * factor}
                  onChange={(n) => patchItem({ w: n / factor })}
                />
                <Numeric
                  label={`Depth (${project.units})`}
                  value={selectedItem.d * factor}
                  min={0.25 * factor}
                  max={100 * factor}
                  onChange={(n) => patchItem({ d: n / factor })}
                />
              </div>
              <div className="area-card">
                <Ruler size={17} />
                <strong>
                  {Math.round(
                    selectedItem.w * selectedItem.d * (project.units === 'ft' ? 10.7639 : 1),
                  )}
                </strong>
                <span>{project.units === 'ft' ? 'square feet' : 'square meters'}</span>
              </div>
              <label className="field">
                {isRoom(selectedItem) ? 'Floor finish' : 'Color'}
                <div className="swatches">
                  {[
                    '#e6ddca',
                    '#e2dfea',
                    '#dbe8e4',
                    '#e3e6d7',
                    '#c9a87c',
                    '#88a79b',
                    '#d5d9d7',
                  ].map((c) => (
                    <button
                      key={c}
                      aria-label={`Set shape color ${c}`}
                      style={{ background: c }}
                      className={selectedItem.color === c ? 'selected' : ''}
                      onClick={() => patchItem({ color: c })}
                    />
                  ))}
                  <input
                    aria-label="Custom shape color"
                    type="color"
                    value={selectedItem.color}
                    onChange={(e) => patchItem({ color: e.target.value })}
                  />
                </div>
              </label>
              <div className="shape-actions">
                <button className="outline-button" onClick={duplicate}>
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  className="icon-button"
                  aria-label="Rotate shape 90 degrees"
                  title="Rotate 90° (swap width and depth)"
                  onClick={() => {
                    const i = selectedItem;
                    const o = project.openings.map((o) =>
                      o.roomId === i.id
                        ? {
                            ...o,
                            side: (
                              {
                                north: 'east',
                                east: 'south',
                                south: 'west',
                                west: 'north',
                              } as const
                            )[o.side],
                            offset:
                              o.side === 'south' || o.side === 'north' ? o.offset : 1 - o.offset,
                          }
                        : o,
                    );
                    commit({
                      ...project,
                      items: project.items.map((a) =>
                        a.id === i.id ? { ...a, w: i.d, d: i.w } : a,
                      ),
                      openings: o,
                    });
                  }}
                >
                  <RotateCw size={17} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Delete selected shape"
                  onClick={() => {
                    commit(removeItem(project, selectedItem.id));
                    setSelected(null);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {isRoom(selectedItem) && (
                <>
                  <div className="section-heading opening-heading">WINDOWS & DOORS</div>
                  {project.openings
                    .filter((o) => o.roomId === selected)
                    .map((o) => (
                      <div className="opening-row" key={o.id}>
                        <div>
                          {o.kind === 'window' ? <Columns3 size={15} /> : <DoorClosed size={15} />}
                          <strong>{o.kind}</strong>
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
                          Wall
                          <select
                            aria-label={`${o.kind} wall`}
                            value={o.side}
                            onChange={(e) =>
                              commit({
                                ...project,
                                openings: project.openings.map((a) =>
                                  a.id === o.id
                                    ? { ...a, side: e.target.value as typeof o.side }
                                    : a,
                                ),
                              })
                            }
                          >
                            {['north', 'south', 'east', 'west'].map((s) => (
                              <option key={s}>{s}</option>
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
                        <Numeric
                          label={`Opening width (${project.units})`}
                          value={o.width * factor}
                          min={0.3 * factor}
                          max={10 * factor}
                          onChange={(n) =>
                            commit({
                              ...project,
                              openings: project.openings.map((a) =>
                                a.id === o.id ? { ...a, width: n / factor } : a,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                  <button className="text-button" onClick={() => selectTool('window')}>
                    <Plus size={13} />
                    Add an opening on the plan
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="inspector-body">
              <div className="exterior-illustration">
                <Home size={56} strokeWidth={1} />
                <TreePine size={30} strokeWidth={1} />
                <span>GOOD DESIGN FEELS LIKE HOME</span>
              </div>
              <p className="inspector-description">
                Give your home a look you love. See your finishes in the exterior view.
              </p>
              <label className="field">
                Exterior walls
                <div className="swatches">
                  {['#f0e9dc', '#dad4c7', '#a5b0a0', '#b38368', '#586b66'].map((c) => (
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
                Roof style
                <select
                  value={project.roofStyle}
                  onChange={(e) =>
                    commit({ ...project, roofStyle: e.target.value as 'gable' | 'flat' })
                  }
                >
                  <option value="gable">Classic gable</option>
                  <option value="flat">Modern flat</option>
                </select>
              </label>
              <label className="field">
                Roof finish
                <div className="swatches">
                  {['#586662', '#716456', '#b17759', '#b3ada0'].map((c) => (
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
                  setMode('3d');
                  setSceneMode('exterior');
                }}
              >
                <Home size={15} />
                See the exterior
              </button>
              <div className="inspector-tip">
                <MousePointer2 size={18} />
                <p>Select any shape to adjust its size, color, and details.</p>
              </div>
              <div className="floor-summary">
                <span className="section-heading">YOUR LEVELS</span>
                {project.floors.map((f) => (
                  <button
                    key={f.level}
                    className={floor === f.level ? 'active' : ''}
                    onClick={() => {
                      setFloor(f.level);
                      setSelected(null);
                    }}
                  >
                    <Layers size={14} />
                    {f.name}
                    <small>
                      {Math.round(area(project, f.level))} {project.units === 'ft' ? 'ft²' : 'm²'}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
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
                <p>Try a new idea. Keep your favorites. Come back anytime.</p>
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
                <div className="project-grid">
                  {[project, ...library.filter((p) => p.id !== project.id)].map((p) => (
                    <div className="project-card" key={p.id}>
                      <button className="project-open" onClick={() => switchProject(p)}>
                        <div className="project-thumbnail">
                          <Home size={42} strokeWidth={1} />
                          <span>
                            {p.floors.length} {p.floors.length === 1 ? 'floor' : 'floors'}
                          </span>
                        </div>
                        <strong>{p.name}</strong>
                        <small>
                          {Math.round(area(p)).toLocaleString()} {p.units === 'ft' ? 'sq ft' : 'm²'}{' '}
                          · {new Date(p.updated).toLocaleDateString()}
                        </small>
                      </button>
                      <button
                        className="project-copy"
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
                        <Copy size={14} />
                        Make a copy
                      </button>
                    </div>
                  ))}
                </div>
                <div className="modal-note">
                  <Save size={16} />
                  <span>
                    Projects autosave on this device. Export a .hearth file for a backup or to move
                    between computers. GitHub stores the app's code, not your private designs.
                  </span>
                </div>
              </>
            )}
            {modal === 'floor' && (
              <>
                <span className="eyebrow">MORE ROOM FOR YOUR IDEAS</span>
                <h2>Build another level.</h2>
                <p>Keep your floors together in one project.</p>
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
                    value={floorName}
                    onChange={(e) => setFloorName(e.target.value)}
                    maxLength={60}
                    placeholder={floorType === 'upper' ? 'Upstairs retreat' : 'Basement'}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={copyFloor}
                    onChange={(e) => setCopyFloor(e.target.checked)}
                  />
                  Copy rooms and furniture from the current floor
                </label>
                <button className="primary-button full" onClick={addFloor}>
                  <Plus size={16} />
                  Create floor
                </button>
              </>
            )}
            {modal === 'help' && (
              <>
                <span className="eyebrow">WELCOME TO YOUR HAPPY PLACE</span>
                <h2>A home starts with an idea.</h2>
                <p>Here's how to bring yours to life.</p>
                <div className="tour-steps">
                  <div>
                    <span>01</span>
                    <section>
                      <strong>Draw your spaces</strong>
                      <p>
                        Choose Draw room and drag on the grid. Select and move shapes, or drag the
                        amber corner to resize. Use the detail panel for exact dimensions.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>02</span>
                    <section>
                      <strong>Make it feel like you</strong>
                      <p>
                        Add doors and windows by clicking a wall. Furnish your rooms, then head
                        Outside for trees, a pool, a terrace, or a driveway.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>03</span>
                    <section>
                      <strong>See the bigger picture</strong>
                      <p>
                        Switch between dollhouse and exterior views. Choose Walk through, use WASD
                        to move, and drag to look around. Escape returns to editing. Use the floor
                        menu to visit another level; stairs are visual markers.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>04</span>
                    <section>
                      <strong>Keep your possibilities</strong>
                      <p>
                        Changes save automatically on this device. Export project saves a portable
                        backup. My projects lets you start fresh, open a file, or duplicate an idea.
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
                    <kbd>H</kbd>Pan
                  </span>
                  <span>
                    <kbd>Del</kbd>Delete shape
                  </span>
                  <span>
                    <kbd>Ctrl Z</kbd>Undo
                  </span>
                  <span>
                    <kbd>Ctrl S</kbd>Export
                  </span>
                </div>
                <p className="small-note">
                  A creative concept studio. Rooms use rectangular shapes, roofs are simplified
                  envelopes, and stairs don't automatically cut floor openings. This is for
                  exploring ideas, not construction drawings.
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
