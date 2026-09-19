# Hearth Studio

Design your dream home, then walk through it. Draw rooms, add doors, windows, furniture, and stairs, stack floors, and see it all in 2D, as a 3D dollhouse, from outside, or on foot from the front door.

![The Hearth Studio editor](docs/screenshots/editor.png)

![Exterior presentation view](docs/screenshots/exterior.png)

## Open Hearth Studio

**Double-click `Hearth-Studio.html`.** That's the whole app in one file. Download it from this repository's Releases page, save it anywhere (the Desktop is fine), and it opens in Edge or Chrome. There is nothing to install, no command window, and no `.exe` for Windows security to block. It works offline.

Designs save automatically in that browser. Keep opening the same file in the same browser to find them again, and use **Export project** for backups or to move a design to another computer.

> **Coming from the first version?** Your designs live in the old app's browser storage. Open the old app once, choose **Export project** for each design, then in the new app choose **My projects → Open project file**.

Other ways to run it:

- **Hosted:** if GitHub Pages is turned on for this repository, open the site in Edge or Chrome and choose **Install app** in the address bar for a desktop icon that opens in its own window, offline included.
- **Windows executable:** `Hearth-Studio-*-Windows.exe` on Releases is an unsigned portable Electron build. Windows Device Guard / Smart App Control blocks unsigned executables on some PCs; use the HTML file there.
- **Local server:** the older `Hearth-Studio-Browser.zip` edition still works (`Start Hearth Studio.cmd`, needs Node.js 22+).

## Designing

1. **Rooms.** Choose **Draw room** (R) and drag on the grid. Drag a room to move it; its furniture comes along (hold Alt to move the room alone). Drag any amber corner to resize, or type exact sizes on the right.
2. **Doors and windows.** Choose Door, Window, or Wide opening (for open-concept rooms) and click a wall. Drag a door or window along its wall to reposition it.
3. **Furniture.** The Furnish tab has living, kitchen, bedroom, and bathroom pieces. A preview follows your cursor, and pieces snap flush to walls. Press **E** (or ↻ on the selection bar) to turn the selected piece; arrow keys nudge it. **Ctrl+C** then **Ctrl+V** on another floor pastes it in the same spot, handy for stacking bathrooms.
4. **Floors.** Use **+** beside the floor menu. Pick a stair style and Hearth lays connecting stairs on the floor below (or above, for a basement) plus a landing on the new floor to build around. Rename or delete floors in the right panel.
5. **Stairs.** Straight, L-shaped, switchback, and spiral. Choose **Up** or **Down** before placing, or change it later on the right. On the plan, **UP** marks the bottom step and **DN** the top; the floor above shows the opening with a guard rail. Stairs with no floor at the other end offer to create it.
6. **Sizes.** In feet, sizes read as feet and inches; type `12 6`, `12'6"`, or `12.5`.
7. **Share the plan.** The picture button under the plan saves the current floor as a PNG with the house name and floor as a title.
8. **Outside.** Patios, driveways, lawns, pools, trees, and fences live on the ground floor. Pick exterior and interior wall colors and a roof on the right, then choose **See the exterior**.

## Walking through

Choose **Walk through**. You start outside the front door, full screen.

- **W A S D** or the on-screen arrows to walk, **drag** to look around, **Q/E** or ←/→ to turn, **Shift** to hurry.
- Walk onto the stairs to climb to the next floor. Walls, rails, and furniture block you; doorways don't.
- The mini-map shows where you are on the current floor. Click it to jump somewhere. The floor buttons at the top take you straight to another level.
- **Tour** glides through each room in turn, hands-free, with the room's name on screen. Touch any control to take over.
- The camera button saves a picture of the view. **Esc** returns to editing.

## Saving your work

Projects autosave locally. **My projects** holds your designs: duplicate one before trying a big change, or delete ones you're done with. **Export project** writes a `.hearth` file; **Open project file** imports one as a separate copy. Nothing is sent to GitHub or any server.

## Development

Requires Node.js 22.12+ (tested with Node.js 24) and npm.

```sh
npm ci
npm run dev            # browser development preview
npm run build:single   # release/Hearth Studio.html, the double-click edition
npm run desktop        # build and launch Electron
npm run package        # portable Windows executable
```

```sh
npm test               # unit tests (model, stairs, walkthrough physics, floors)
npm run test:e2e:edge  # browser tests using the installed Microsoft Edge
npx playwright install chromium && npm run test:e2e   # or with Playwright's Chromium
npm run test:desktop
```

## Architecture

- **React + TypeScript** for the editor, project library, inspector, and undo/redo (`src/App.tsx`).
- **SVG** floor plan with direct manipulation (`src/Plan.tsx`).
- **Three.js** scene with one long-lived renderer; the house is rebuilt as a group when the design changes (`src/Scene.tsx`, furniture models in `src/furniture3d.ts`).
- `src/stairs.ts` lays out each stair style in its own frame (treads, the opening it cuts, rails, and the plan arrow) and maps it through the item's rotation. The plan, the 3D model, and the walkthrough all use it.
- `src/walk.ts` is the walkthrough physics: floor surfaces with stair openings, tread heights, and collision boxes for walls, rails, and furniture.
- `src/floors.ts` adds floors with connecting stairs and a landing.
- `src/model.ts` defines the versioned project format, validation (older files without stair styles still open), the catalog, and shared-wall segmentation.
- **Electron** shell with a narrow preload bridge for native file dialogs.

## Boundaries

This is a concept-design studio, not construction or permit software.

- Rooms are rectangles; walls are axis-aligned with a fixed thickness. Floor-to-floor height is 3.2 m.
- Pieces turn in quarter turns. Stairs have 16 risers and stretch to fit their footprint.
- Roofs are simplified: a gable or flat roof over the top of each stack, flat roofs over lower parts with nothing above.
- Up to 1,000 shapes, eight upper floors, and three basements. The editor is designed for windows at least 1000 × 600.
