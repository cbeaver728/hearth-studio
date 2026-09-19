# Hearth Studio

A quiet, playful desktop studio for designing your future home. Draw rectangular rooms, move and resize shapes, and see the same project in 2D, as a 3D dollhouse, or from inside the house.

![The Hearth Studio editor](docs/screenshots/editor.png)

![Exterior presentation view](docs/screenshots/exterior.png)

## Use the Windows app

**On this computer, Device Guard blocked the final unsigned Windows executable.** Use the local browser edition below; no security settings need to change. The packaged executable is also provided for environments that allow unsigned personal applications.

Download **Hearth-Studio-1.0.0-Windows.exe** from this repository's Releases page and double-click it. It is a portable Windows x64 app: no Node.js, account, installer, or internet connection is needed to design homes. The build is unsigned.

Start with the furnished **Sunday House**, or choose **My projects → Start from scratch**. Help and keyboard shortcuts are available using the question-mark button.

### Local browser edition

Download **Hearth-Studio-Browser.zip** from Releases, extract it, and double-click **Start Hearth Studio.cmd**. It opens the production app at `http://127.0.0.1:4173`. Keep the command window open while designing. Requires Node.js 22+ (already available on the development computer), but no npm install or internet access. This edition supports all design features, with project export through browser Downloads. Keep using the same browser and address for autosaved projects.

### Design workflow

1. Choose **Draw room**, then drag across the grid. A room immediately becomes a 3D space.
2. Use **Select** to move a shape. Drag its amber corner to resize, or type precise dimensions in the right panel.
3. Choose **Door** or **Window**, then click near a wall. Select the room to change an opening's wall, position, or width.
4. Furnish with beds, sofas, tables, kitchen islands, and stairs. Add patios, driveways, grass, pools, trees, and fences from **Outside**.
5. Add upper floors or basements using the **+** beside the floor menu. Optionally copy the current floor. A faint outline of the level below helps alignment.
6. Orbit the live 3D model, choose **Exterior** to see the roof and finishes, or use **Walk through**. Move with WASD, drag to look, and press Escape to return to the split editor. Switch levels using the floor menu.
7. Use the 3D camera button to export a PNG. Try the sun button for golden-hour lighting.

### Saving your work

Projects automatically save locally on this device. **My projects** holds your designs and lets you duplicate an idea before experimenting. **Export project** writes a `.hearth` JSON file; **Open project file** imports it as a separate copy. Export backups regularly and use them to transfer designs between computers.

In the Windows application, local project data lives in Electron's user-data directory (`%APPDATA%/hearth-studio` for a development run; the packaged application may use `%APPDATA%/Hearth Studio`). In the browser preview it belongs to that browser and origin. Clearing browser/application data removes local projects. The app does not sync designs to GitHub or any server.

## Development

Requires Node.js 22.12+ (tested with Node.js 24) and npm.

```sh
npm ci
npm run dev       # browser development preview
npm run desktop   # build and launch Electron
npm run package   # build a portable Windows executable
```

If your npm configuration blocks Electron's download script, run `node node_modules/electron/install.js` after installation. Windows packaging should run on Windows. The lockfile pins the tested dependency graph.

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:desktop
```

## Architecture

- **React + TypeScript** for the editor, local project library, inspector, undo/redo, and file workflows.
- **SVG** for the direct-manipulation floor plan, grid, dimensions, furniture symbols, and wall openings.
- **Three.js** for procedural geometry, lighting, orbit controls, image export, and collision-aware walkthroughs.
- **Electron** for a desktop shell with sandboxing, context isolation, and a narrow preload bridge for native project-file dialogs. No renderer Node integration or remote content.
- `src/model.ts` defines the versioned project format, input validation, catalog, sample project, and shared-wall segmentation. Door and window openings from adjoining rooms are applied to a single shared wall.

## Deliberate first-version boundaries

This is a personal concept-design studio, not construction or permit software.

- Room footprints are rectangles. Combine them to explore layouts; overlapping rooms are not boolean-unioned and reported area sums room areas.
- Walls are axis-aligned and use a fixed thickness and height. Floor spacing is 3.2 m. The quarter-meter grid stays metric even when dimensions display in feet.
- Roofs are simplified gable/flat envelopes around the main room volume on each exposed level and a separate garage volume. Complex setbacks, roof junctions, dormers, and terrain grading are not modeled.
- Stairs are visual markers. They do not cut slabs or move the walkthrough camera between floors. Use the floor selector for that.
- Moving a room moves its walls and attached openings; furniture is positioned independently. Rotating a shape swaps its footprint's width and depth.
- Walkthrough collision checks walls at eye level. Furniture, floor boundaries, and stairs do not block movement. Doors are open passages.
- Basement levels are shown individually in dollhouse/walkthrough views; the exterior view shows above-ground levels.
- Rectangular concepts support up to 1,000 shapes, 2,000 openings, eight upper floors, and three basements. The editor is designed for desktop windows at least 1050 × 720.
- No cloud accounts, analytics, subscriptions, network assets, or automatic updates.

See [QA.md](QA.md) for validation and review notes.
