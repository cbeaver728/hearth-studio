# Validation and product review

The app was reviewed with an emphasis on first-time use, recovery from mistakes, local project safety, and a clear transition between drawing and exploring.

## Automated checks

- TypeScript compilation and production Vite build.
- Nine model tests: JSON round trip, invalid geometry, dangling openings, duplicate IDs, dependent-opening deletion, shared-wall deduplication, partial shared walls, separate levels, oversized-window clamping, and grid snapping (some scenarios share a test).
- Eight browser tests: rendering and image export; draw/move/resize/undo/redo/reload; floor copying and basements; portable file round trip; bad file recovery; minimum window layout; opening placement and keyboard editing; dialog focus management.
- Electron smoke test against the production app: renderer launch, native save/open IPC, exported file integrity, walkthrough entry/exit, and renderer error collection. Dialogs are stubbed to a temporary directory for repeatability; operating-system dialog appearance is not automated.
- npm dependency audit.

The production Electron application and an earlier packaged executable passed the desktop smoke test. Windows Device Guard blocked launching the final repackaged, unsigned executable, so final native-binary verification is limited by that OS policy. No security policy was changed. The local browser edition uses the same final production frontend and is provided as the usable alternative on this host.

## Visual and interaction review

- Reviewed editor, dollhouse, and exterior screenshots. Warm neutral colors and a green accent keep the editor calm while amber highlights explain selection and resizing.
- Increased contrast for labels and helper text after the first visual pass.
- Moved room labels above furniture symbols and added a light outline so names remain readable.
- Grouped actions into Build, Furnish, and Outside. Context-sensitive hints explain whether to drag a room or click a wall.
- Kept selected shapes after undo/redo when they still exist.
- Made Escape and Back to edit return from walkthroughs to the split editor.
- Added keyboard-accessible plan shapes, arrow-key movement, visible focus styles, and modal focus trapping/restoration.
- Checked 1050 × 720 and 1500 × 980 desktop layouts, plus native Windows rendering with display scaling. Side panels scroll independently in short windows.
- Opening a saved file creates a copy. Invalid imports preserve the current project. Malformed existing local storage is not silently overwritten.

## Known practical limits

See the README for the deliberately simplified geometry and floor-navigation model. This version is suited to personal concept exploration. It has not undergone user studies, screen-reader certification, large-project performance certification, or architectural accuracy review. Windows executables are unsigned and do not include an update service.

The native/browser UI smoke tests and production build are reproducible using the scripts in `package.json`. To test a packaged executable, run `node tests/desktop-smoke.cjs "release/win-unpacked/Hearth Studio.exe"` on Windows.
