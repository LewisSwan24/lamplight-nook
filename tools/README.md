# Tools

Scripts for checking the app and making its pictures without spending money. They drive the built app
(`npm run build` first) with Playwright and a stand-in for Claude Code.

## The stand-in Claude (`sim/claude.mjs`)

An executable that speaks the Agent SDK's stream-json control protocol (initialize, hook callbacks,
permission requests) and plays a scripted commission picked from the prompt: the demo, each of the eight
templates, a round of changes, or a resumed run. It really writes the files into the commission folder,
asks the app for permission like Claude Code does, and honours `--max-budget-usd` and `--resume`.
It never touches the network.

| Variable | What |
|---|---|
| `SIM_SPEED` | milliseconds per step (default 700) |
| `SIM_SCENARIO` | `budget` (expensive calls, so the cap is hit), `neterror` (one dropped connection), `longwait` (a slow command), `stuck` (three failures in a row) |
| `SIM_COST` | dollars per tool call (default 0.018) |
| `SIM_STATE_DIR` | where sessions are kept for `--resume` |
| `SIM_LOG` | log every protocol message to this file |
| `SIM_CLAUDE_VERSION` | the version it claims, in `--version` and the init message (default 2.1.306) |

The app uses it when `LAMPLIGHT_CLAUDE_PATH` points at it.

## Safety

`sim/shop.mjs` starts the app with a clean environment: only `PATH`, `DISPLAY`, `XAUTHORITY`, a throwaway
`HOME`, the language, the stand-in's settings and a fake API key. Nothing from your shell (keys, Claude Code
sign-in) reaches the app, and every run goes to the stand-in. On Linux without a display it starts its own Xvfb.

## Acceptance run (`sim/accept.mjs`)

```bash
npm run build
node tools/sim/accept.mjs                      # every scenario, Chinese and English
node tools/sim/accept.mjs --lang en --only demo,board
```

Scenarios: `demo`, `board` (the real plan on the blackboard), `materials` (handing over files),
`templates` (all eight, then the works shelf), `revise` (another round, back and forward between versions),
`meeting`, `budget` (hit the cap more than once and carry on), `neterror`, `furnish` (kept after a restart),
`study`, `mini` (the corner window), `walk` (every main card fits at 1280x720, 1600x900 and 1920x1080), `trial`,
`upgrade` (opens the data a shop had under 0.5.0, 0.6.1 and 0.7.0; needs `legacy-out/`, see below),
`oldclaude` (the stand-in claims an old Claude Code version), `feedback` ("Write to us" and reporting
what the staff made: the mail program and the save dialog are caught, nothing is sent), `store`
(the Microsoft Store build without Claude Code: steps only, no installer run by the app), and `firstrun`
(a new user from nothing: welcome, the trial, Claude Code appearing, the key pasted in the app, the first
commission on the shelf; the key check's request to Anthropic is caught and answered in the test).

`launch()` options worth knowing: `store` plays the Store build (`LAMPLIGHT_STORE=1`); `claudePath`
other than the stand-in, such as a path that does not exist, also gives the app a PATH with no `claude`
on it, since a real Claude Code may sit next to node.
Screenshots go to `sim-out/<lang>/` (git-ignored).

## Store and website pictures (`sim/store.mjs`)

```bash
node tools/sim/store.mjs                       # both languages
node tools/sim/store.mjs --lang en --only board,result
```

Grows a shop by finishing eight commissions, then takes each picture at 1920x1080 in daylight.
Store PNGs go to `store-out/<lang>/`; 1280x720 JPEGs for the website go to `store-out/site/`, named the way
the site expects (copy them into the site repository's `img/`). `sim/trailer.mjs` records the 30-second
trailer from the same kind of run.

## Upgrades (`sim/legacy.mjs`)

One shop used the way a long-time user would: a few commissions with 0.5.0, then 0.6.1, then 0.7.0 (which
goes down halfway through one), then this checkout. A copy of the whole home is kept after each version in
`legacy-out/<lang>/<version>/` (git-ignored), which the `upgrade` scenario opens with the current build.
With `--fixtures` the Chinese run also refreshes `tests/fixtures/userdata/`, the data files the migration
tests start from.

```bash
# each old version in its own checkout, sharing node_modules (the dependencies have not changed)
git worktree add --detach ../old/0.5.0 fca49e9 && ln -s "$PWD/node_modules" ../old/0.5.0/node_modules
(cd ../old/0.5.0 && npx electron-vite build)
# likewise ../old/0.6.1 at 157ad2f and ../old/0.7.0 at 176ac64
npm run build && node tools/sim/legacy.mjs --old ../old --fixtures
```

## Real-Claude check (`real/check.ts`)

Runs three small commissions (a page that usually keeps a to-do list, a letter with a handed-over file, and
the demo) through the app's own runner and prompts, against the Claude Code installed on the computer,
with a key from `LAMPLIGHT_TEST_KEY` (never `ANTHROPIC_API_KEY`, which a surrounding Claude session may
have set). Each stops at $0.40 and no new one starts after $1.20.
It writes `lamplight-real-check-<time>/report.zip` (summary, event shapes, recordings; no key, home
folder replaced) to compare with the stand-in. `--sim` runs the same thing against the stand-in, free.

```powershell
$env:LAMPLIGHT_TEST_KEY = "sk-ant-..."
npx tsx tools/real/check.ts
```

`real/ui.mjs` runs the demo commission through the real app window (Xvfb in a container) against the
Agent SDK's own Claude Code, with the same `LAMPLIGHT_TEST_KEY` and the app's lowest cap ($1), taking a
screenshot every few seconds into `real-out/`. `--sim` runs it against the stand-in.
