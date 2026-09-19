# Validation and product review

## Automated checks

- TypeScript compilation and production Vite build, plus the single-file build.
- Unit tests (`npm test`):
  - Project integrity: JSON round trip, invalid geometry, dangling openings, duplicate IDs, dependent-opening deletion, shared walls, separate levels, oversized-window clamping, grid snapping.
  - Stairs: every style climbs one full floor in 15 treads; local/plan coordinates map both ways at every rotation; turning a run reverses it; down-stairs join the right floors; floor openings are cut from slabs.
  - Walkthrough physics: walking up the sample stairs to the next floor and back down; climbing every stair style by following its plan arrow; rails keep you out of the opening.
  - Floors: adding an upper floor lays stairs inside a room plus a landing; basements get stairs leading down; deleting a middle floor closes the gap; older projects without stair styles still open.
- Browser tests (`npm run test:e2e:edge` or `npm run test:e2e`): rendering and image export; walkthrough entry and exit; draw/move/resize/undo/redo/reload; floor copying and basements with stairs; file export/import and bad-file recovery; minimum window size; wall openings, resize, keyboard movement; dialog focus; placing, restyling, turning, and redirecting stairs, including adding the missing floor.
- Electron smoke test against the production app.

## Review notes (September 2026)

Reviewed hands-on in the browser with the Sunday House and new projects.

Fixed:

- **Opening the app.** The unsigned `.exe` is blocked by Device Guard on this PC, and the browser edition needed a command window and Node. The app now also ships as one self-contained HTML file that opens by double-click.
- **Stairs couldn't turn, only came in one shape, and didn't connect anything.** Stairs now turn, come in four styles, lead up or down, cut an opening with rails in the floor above, show UP/DN on the plan, and carry you between floors in the walkthrough. New floors come with stairs and a landing.
- **Rotating furniture only swapped width and depth**, so a bed's headboard never moved. Pieces now face the way they're turned, in 2D and 3D, and turn about their center.
- **Moving a room left its furniture behind.** Rooms now carry their contents.
- **The walkthrough ran inside the small split panel**, under a large instruction card, and often started inside a wall or furniture. It is now full-window, starts at the front door, has a fading hint, a mini-map, room names, floor buttons, and on-screen controls.
- **The 3D view created a new WebGL renderer on every edit** and could run out of contexts during long sessions. It now keeps one renderer.
- **Most text was 8–10 px** and a large marketing banner took space from the canvas. Text is larger and the canvas taller.
- **No way to delete a floor, rename a floor, or delete a project.** Added.
- **Only one resize handle; mouse-wheel zoom centered on the middle.** Four corner handles; zoom follows the cursor; drag empty space to pan.
- **Doors and windows could only be moved with a slider.** They can be dragged along the wall.
- **Walls were one color inside and out.** Interior paint is separate, doors have casings and open leaves.
- Upper floors roofed only when nothing sat above any part of the level; lower wings now get their own flat roofs.

## Known limits

Rooms are rectangles and roofs are simplified. Stairs are generated to fit their footprint rather than to building code. The walkthrough uses simple collision (a 0.24 m body against boxes), so you can clip corners slightly. The Windows executable is unsigned.
