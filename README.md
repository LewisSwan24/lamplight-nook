# Lamplight Nook

A cozy pixel-art desktop app for Windows that plays out long AI tasks from Claude as a day in a small shop.
You write what you want at the counter (a web page, a letter, a table, a plan, a photo album, a Word or Excel file,
a chart...) and the staff get to work. Wick, behind the counter, plays the main agent; helpers play its subagents.
Everyone walks, works, gets stuck, asks and wraps up according to the real events of the Claude Agent SDK, and the
blackboard shows Claude's real plan. Anything that cannot be undone waits for you, and the default is "not now".

It needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on the computer and your own Anthropic API key.
Usage is billed to your key; the app collects nothing and has no servers of its own.

The app speaks Simplified Chinese and English, following the system language (switchable in settings). All
user-facing text lives in `locales/` (`zh-CN.json`, `en.json`) and `lines/` (Chinese at the top level, English in
`lines/en/`). How to use it is in the [wiki](https://github.com/LewisSwan24/lamplight-nook/wiki).

## What it does

- **Commissions with real progress.** Every move the staff make comes from Claude's events, not a canned animation.
  One card shows how long a round has taken, its spending limit, every step of the plan and who is doing what.
- **Work you keep.** Finished pieces go on the works shelf. Each work is a project that can go another round, with a
  board, a timeline of versions, schedules, and a way back to any earlier version.
- **Files and connections.** Hand files over on the counter: the staff work on copies. Word, Excel, PowerPoint, PDF,
  charts and posters, and edits to the files you hand over. A synced folder, a read-only calendar and email drafts
  can be connected; anything that changes something outside asks first and is written down.
- **Spending you can see.** A limit per round, per month and per project; the notebook keeps a ledger by month.
- **A shop that grows.** What you make shows up in the shop and along the town's street; neighbours drop in with
  their own stories, and the seasons and festivals come round.
- **With other people** (1.5). Pair a phone or another computer on your home network to follow the shop and answer
  from there, or let a person hand in commissions under a monthly limit of their own. Share a finished work as a
  file, or send a postcard of your shop for a friend to walk round.

## Versions

| Line | State | Where |
|---|---|---|
| 1.0.0 | Released 5 Nov 2026 | [Releases](https://github.com/LewisSwan24/lamplight-nook/releases), `main` |
| 1.1 to 1.3 | Finished, not released yet | `main` |
| 1.4 and 1.5 | In progress | `release-1.5` (1.4 is folded into it); plans in `docs/road-to-1.4.md` and `docs/plan-1.5.md` |

What changed in each is in `CHANGELOG.md`.

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
- `latest.yml` and the installer's `.blockmap` go up with it. The installed app reads them to find new versions
  (`electron-updater`, `app/main/updates.ts`): it looks on opening and every six hours, the postman brings a letter, and
  only "Update" downloads. The new version installs silently when the user closes the shop, after the data files are
  copied to `backup/<date>-before-<version>/`. The Store build never looks. A release without `latest.yml` is invisible
  to installed apps.

The build sets Electron's fuses (`build.electronFuses` in `package.json`): the packaged app does not run as plain
Node, ignores `NODE_OPTIONS` and debugger flags, and loads only its own `app.asar`, whose hash is checked on
Windows. Playwright cannot attach to such a build (it needs the debugger flag), so the acceptance scripts drive the
unpackaged app.

The installer is not code-signed yet, so Windows SmartScreen asks for confirmation ("More info", then "Run anyway").
Updates work unsigned: the updater checks a signature only when `app-update.yml` names a publisher, and it names none.
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
- The release workflow attaches the package next to the installer. It reads the three identity values from the
  repository's variables of the same names, and builds the test package while they are unset.
- The Store build keeps its data in `%APPDATA%\Lamplight Nook Store` (Windows holds it in the package's private
  copy), not in the installer build's folder. On its first open it offers to copy the installer build's shop over;
  the original is never changed (`app/main/move-in.ts`, road-to-1.1.md A2).

On Linux the installer can be built too, with Wine on the PATH (electron-builder uses it to stamp the icon and
version into the exe): `npm run build && npx electron-builder --win nsis --publish never`, then `npm run msix`.

## Art and licenses

Most of the art and the UI sounds come from purchased packs: LimeZu Modern Interiors, Modern Exteriors and
Modern Farm (https://limezu.itch.io/), and Cyberleaf Modern UI SFX. Their licenses forbid redistributing the
files, so **this repository does not contain them, nor the pictures and sounds our scripts build from them.**
Those files are listed in `.gitignore`. LimeZu requires credit, which the app gives in Settings.

What the repository does carry:

- Pictures our scripts draw entirely by hand: the toolbar icons, the works-shelf icons, the back door, the
  holiday lanterns and decorations for New Year, Dragon Boat and Mid-Autumn, the season sprigs, the weather
  touches, the town's shop signs, and the app, tray and Store icons.
- Sounds synthesised by `scripts/audio/sfx.py` (door, ding, mallet, pencil).
- Music by Alex Morgan under CC BY 4.0 (`assets/audio/music/CREDITS.md`).
- The LXGW WenKai Screen handwriting subset under the SIL OFL 1.1 (`assets/fonts/hand-OFL.txt`).

A fresh clone therefore does not build: the renderer imports the scene pictures directly, so `npm run build`
stops at the first missing one (`assets/sprites/cafe.png`). `npm run typecheck` still passes, and so do most tests;
the ones that read the missing pictures fail. To build the app:

1. Buy the four packs from their authors.
2. Unpack them into the git-ignored `assets/vendor/` as `docs/art.md` describes (folder names and the
   Windows junction commands are there).
3. Install Pillow and NumPy for Python, and ffmpeg with libvorbis.
4. Run the scripts from the repository root, in this order:

```bash
python scripts/art/characters.py   # staff and guest sheets from the character generator, the shop cat, the player
python scripts/art/portraits.py    # staff portraits and the player's face, cut from those sheets
python scripts/art/emotes.py       # the mood bubble strip
python scripts/art/scene.py        # the cafe background (calls rug.py), the clock, cup and door animations
python scripts/art/study.py        # the study background
python scripts/art/furnish.py      # wall, curtain and rug colour choices for each scene
python scripts/art/decor.py        # holiday, season and weather overlays
python scripts/art/growth.py       # what the shop gathers, and the works-shelf icons
python scripts/art/garden.py       # the back garden and its crops
python scripts/art/animals.py      # the dog and the hens
python scripts/art/town.py         # the town's street, fronts, props and signs
python scripts/art/pieces.py       # splits the rooms into floor and furniture; run last
python scripts/audio/sfx.py        # the UI sounds
```

`docs/art.md` says which pack each script reads and what it writes.

### Releases on GitHub

The release workflow builds from a clean checkout, so it takes the pack-built files from a private repository,
`LewisSwan24/lamplight-nook-assets`, through a read-only deploy key held in this repository's secret
`ASSETS_DEPLOY_KEY`. It stops with an error when the secret is missing, and `scripts/pack-assets.mjs import`
refuses any file this repository does not ignore, so the private copy cannot change code.

After rebuilding or adding art, update the private copy before tagging a release, with that repository cloned
next to this one:

```bash
node scripts/pack-assets.mjs export ../lamplight-nook-assets
```

Then commit and push in `../lamplight-nook-assets`. The export also deletes files there that are no longer built.

Character sheets keep the generator layout: 16x32 frames, 56 per row, directional animations in
right/up/left/down order (see `app/renderer/game/sprites.ts`).
