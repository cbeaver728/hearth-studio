# Validation and product review

## Automated checks

- TypeScript compilation and production Vite build, plus the single-file build.
- Unit tests (`npm test`):
  - Project integrity: JSON round trip, invalid geometry, dangling openings, duplicate IDs, dependent-opening deletion, shared walls, separate levels, oversized-window clamping, grid snapping.
  - Stairs: every style climbs one full floor in 15 treads; local/plan coordinates map both ways at every rotation; turning a run reverses it; turning a run that corners gives eight distinct positions and comes back round; mirrored flights land every tread and climb the same; down-stairs join the right floors; floor openings are cut from slabs.
  - Walkthrough physics: walking up the sample stairs to the next floor and back down; climbing every stair style by following its plan arrow; rails keep you out of the opening; rails are dropped where a wall already stands or where there's no floor to fall from.
  - Exterior materials and roof coverings round trip through save and reload, and nonsense is refused.
  - Floors: adding an upper floor lays stairs inside a room plus a landing; basements get stairs leading down; deleting a middle floor closes the gap; older projects without stair styles still open.
- Roofs (`tests/roof.test.ts`): wing splitting and ridge directions, detached garages, the Cape half storey's ceiling and headroom, dormer nooks. Rounded corners (`tests/corners.test.ts`). Arthur's House (`tests/arthur.test.ts`): layout facts from the show and a walk from the foyer up the winder into Arthur's dormer. Walking feel (`tests/walkfeel.test.ts`): keyboard-style walking and steering up every stair style.
- Browser tests (`npm run test:e2e:edge` or `npm run test:e2e`): rendering and image export; walkthrough entry and exit; draw/move/resize/undo/redo/reload; floor copying and basements with stairs; file export/import and bad-file recovery; minimum window size; wall openings, resize, keyboard movement; dialog focus; placing, restyling, turning, and redirecting stairs, including adding the missing floor; flipping an L-shaped run and turning it round all eight positions; choosing an exterior material; searching the catalog.
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

## Review notes (September 2026, second pass)

Reviewed hands-on again in the browser, including the walkthrough and the exterior.

Fixed and added:

- **Guard rails that made no sense.** Rails were drawn around the whole stair opening whatever stood there, so they doubled up on walls and hung over open air. Each rail is now kept only where someone could walk up to the opening and fall in, and dropped where a wall already guards it. Handrails now climb beside every flight, on whichever sides are open, with posts standing on the treads rather than running down to the floor below.
- **L-shaped and switchback runs only had four positions.** Turning them now works round eight — four each way — and **Shift+E** flips a run left for right. Mirroring runs through one shared layout, so the plan, the 3D model, the floor opening and the walkthrough all agree.
- **More beds and accessories.** King, queen and twin beds, a platform bed, a four-poster, a daybed and a loft bed; a sectional, ottoman, pool table, wet bar, bar stools and toy chest; a pergola, barbecue, swing set, trampoline, basketball hoop and mailbox.
- **Only flat paint outside.** Seven exterior materials — painted, lap siding, board & batten, cedar shingle, brick, stone and stucco — drawn as real tiled finishes that carry across walls and gable ends, each with colors that suit it. The roof takes shingles, standing-seam metal or clay tile the same way.
- **The catalog had grown past ninety pieces with no way to find anything.** Added a search box that looks across every tab.
- **Walking started and stopped dead.** Movement and turning now ease in and out.

## Review notes (September 2026, Arthur's House)

Another agent had started an Arthur's House, but it came out as a two-storey box with dormers perched on top, the den and living room swapped, the foyer and dining room misplaced, and the garage stuck to the house. It was rebuilt from the Arthur Wiki page and the show's 1994 production floor plan (on the same page), and the engine gained what the house needs first:

- **Cape Cod roofs.** Roofs are now worked out per wing (`src/roof.ts`): each building's top floor is split into rectangles, the biggest takes the main ridge and the rest run out at right angles into valleys. Under a Cape roof the top floor sits inside it, with knee walls, sloping ceilings that level off, gable walls, and a low-headroom zone in the walkthrough that steps with the slope.
- **Dormers** that open a real nook in the roof, set a little way up the slope, with a six-pane window above the roofline.
- **Winder stairs**, and painted stairs with spindle rails and a newel post.
- **Wallpaper, wainscot and room paint**, **patterned upholstery**, and the show-era pieces.
- **Walkthrough from the street**, **white window frames**, and **automatic front doors** that swing open as you reach them.

Checked in the browser against the wiki's pictures: the street view, the foyer and its stairs, the den, the kitchen, D.W. and Kate's room with its dormer, and Arthur's room.

Also fixed:

- **Getting stuck at the foot of the stairs.** Since the handrails became solid in the walkthrough, their collision ran right down to the bottom step, so stairs ending near a wall (the Sunday House's) closed off the way round to the front of them. Handrails now follow the flight in short lengths and leave the bottom steps open. A new test steers up all five styles at all eight turns and flips with the walkthrough's own movement.
- **Rounded room corners** are part of the room now, rather than a separate curved wall to line up by hand.

## Known limits

Rooms are rectangles and roofs are simplified. Stairs are generated to fit their footprint rather than to building code. The walkthrough uses simple collision (a 0.24 m body against boxes), so you can clip corners slightly. The Windows executable is unsigned.
