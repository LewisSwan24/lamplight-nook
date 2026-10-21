# Lamplight Nook

A cozy pixel-art desktop app that turns a long-running AI task into the daily life of a small cafe crew.
The main agent and its subagents are played by characters who walk, work, get stuck, ask for help and wrap up
according to real events from the Claude Agent SDK.

The app's user-facing text is Simplified Chinese; all of it lives in `locales/zh-CN.json` and `lines/`.

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
| `lines/` | Dialogue library (YAML, linted by tests) |
| `locales/` | User-facing strings |
| `demo/` | The demo commission's check script, and a real anonymized event recording used for replay and tests |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run in development mode |
| `npm test` | Unit tests |
| `npm run typecheck` | Type check |
| `npm run smoke` | Build and capture screenshots |
| `npm run record -- <hello\|subagents> <folder>` | Run a debug task headlessly and record its events |

## Art and licenses

Art comes from purchased packs (LimeZu Modern Interiors / Exteriors / Farm, Cyberleaf Modern UI SFX).
Their licenses forbid redistributing the original files, so raw packs go in the git-ignored `assets/vendor/`
and this repository must stay private. LimeZu requires credit: https://limezu.itch.io/
