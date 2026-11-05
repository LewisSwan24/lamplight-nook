# Lamplight Nook

A cozy pixel-art desktop app that turns a long-running AI task into the daily life of a small cafe crew.
The main agent and its subagents are played by characters who walk, work, get stuck, ask for help and wrap up
according to real events from the Claude Agent SDK.

The app speaks Simplified Chinese and English, following the system language (switchable in settings). All user-facing text lives in `locales/` (`zh-CN.json`, `en.json`) and `lines/` (Chinese at the top level, English in `lines/en/`).

## Run on Windows (development)

1. Install [Node.js LTS](https://nodejs.org/).
2. Provide credentials, one of:
   - **Local development with your own subscription**: install and sign in to Claude Code, then set
     `$env:LAMPLIGHT_DEV_SUBSCRIPTION="1"` before running. For your own machine only.
   - **API key** (required for any build given to other people). Environment variable only, never in a file:
     ```powershell
     setx ANTHROPIC_API_KEY "<your key>"
     ```
     Open a new terminal afterwards.
3. In the project folder:
   ```powershell
   npm install
   npm run dev
   ```

Click the counter (or "New commission" in the debug panel) to open the commission form. The pre-filled request runs
the fixed demo commission: research, a real failing check, a color question, a confirmation before deleting drafts,
and a review. Questions open a dialog; risky steps open a plain confirmation card that defaults to "not now".

The debug panel (top right) can also walk characters between anchors, preview the decision cards, replay the bundled
real recording without calling the API, and run two debug tasks. Raw events of each run are written to `%APPDATA%\Lamplight Nook\recordings\`.

## Layout

| Path | What |
|---|---|
| `app/main` | Electron main process: agent runner, event normalizer, risk classifier, recorder |
| `app/renderer` | Phaser scene, translator (rules -> commands), director (pacing), state machine |
| `app/shared` | Types and i18n helpers shared by both processes |
| `rules/` | Event -> character rules and animation fallbacks (YAML, hot-reloaded in dev) |
| `lines/` | Dialogue library per language (YAML, linted by tests) |
| `locales/` | User-facing strings per language |
| `demo/` | The demo commission's check script, and a real anonymized event recording used for replay and tests |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run in development mode |
| `npm test` | Unit tests |
| `npm run typecheck` | Type check |
| `npm run smoke` | Build and capture screenshots |
| `npm run record -- <hello\|subagents> <folder>` | Run a debug task headlessly and record its events |
| `npm run accept` | Simulated acceptance run in Chinese and English, against a stand-in for Claude Code (no API calls; see `tools/README.md`) |
| `npm run store-shots` | Store screenshots, website pictures and the trailer (needs ffmpeg) |

## Windows installer

`.github/workflows/release.yml` builds the installer on a Windows runner (typecheck, tests, `npm run dist`).

- Run the workflow from the Actions tab, or push a tag such as `v0.1.0`.
- It creates a GitHub release with `Lamplight-Nook-Setup-<version>.exe` and the Store test package attached, tagged with the pushed tag or with the version in `package.json`. Bump the version before each release.

The build sets Electron's fuses (`build.electronFuses` in `package.json`): the packaged app does not run as plain
Node, ignores `NODE_OPTIONS` and debugger flags, and loads only its own `app.asar`, whose hash is checked on
Windows. Playwright cannot attach to such a build (it needs the debugger flag), so the acceptance scripts drive the
unpackaged app.

The installer is not code-signed yet, so Windows SmartScreen asks for confirmation ("More info", then "Run anyway").
The installer does not include Claude Code. The app uses the copy installed on the machine
(native installer location, `PATH`, or a global npm install; `LAMPLIGHT_CLAUDE_PATH` overrides the lookup)
and shows a notice when none is found. Users paste their own Anthropic API key in the app
(`ANTHROPIC_API_KEY` in the environment also works; `LAMPLIGHT_DEV_SUBSCRIPTION=1` only counts unpackaged).

## Microsoft Store package

`npm run msix` turns `dist/win-unpacked` (left by `npm run dist`) into an unsigned MSIX for the Store;
the Store signs what it publishes. electron-builder only makes MSIX on Windows, so `scripts/msix.mjs`
writes the package itself in the MSIX SDK layout (block map, content types, zip64).

- Set `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER` (`CN=...`) and `MSIX_PUBLISHER_NAME` from Partner Center's
  Product identity page to get `Lamplight-Nook-<version>.msix` for upload.
- Without them it writes `Lamplight-Nook-<version>-test.msix` with a test publisher. `Add-AppxPackage -AllowUnsigned` refused it on Windows 11
  build 26300 (5 Nov 2026, `0x80073D2B`: an unsigned package cannot hold an executable activation), so this file has
  not been installed; trying it needs a signature from a certificate the machine trusts. The command was: `Add-AppxPackage -AllowUnsigned .\Lamplight-Nook-<version>-test.msix` in PowerShell.
- Tile images are in `assets/store/`, made from `assets/ui/icon.png`.
- The listing text (both languages) is in `store/listing.md`.
- The release workflow attaches the test package next to the installer.

On Linux the installer can be built too, with Wine on the PATH (electron-builder uses it to stamp the icon and
version into the exe): `npm run build && npx electron-builder --win nsis --publish never`, then `npm run msix`.

## Art and licenses

Art comes from purchased packs (LimeZu Modern Interiors / Exteriors / Farm, Cyberleaf Modern UI SFX).
Their licenses forbid redistributing the original files, so raw packs go in the git-ignored `assets/vendor/`
and this repository must stay private. LimeZu requires credit: https://limezu.itch.io/

`assets/sprites/` holds only the images the app uses, built from the packs by our scripts:

```bash
# Unzip the Modern Interiors pack into assets/vendor/ first (1_Interiors/, 2_Characters/, 3_Animated_objects/).
python3 scripts/art/characters.py   # the three staff from generator layers, recoloured; the chestnut shop cat
python3 scripts/art/scene.py        # the 320x180 cafe background
python3 scripts/art/furnish.py      # wall, curtain and rug colour choices for each scene (needs only the backgrounds)
python3 scripts/art/growth.py --icons  # the works-shelf icons alone (without --icons it also needs the pack)
python3 scripts/art/tools.py           # the toolbar icons
```

Character sheets keep the generator layout: 16x32 frames, 56 per row, directional animations in
right/up/left/down order (see `app/renderer/game/sprites.ts`).
