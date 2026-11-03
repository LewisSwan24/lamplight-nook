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
and `upgrade` (opens the data a shop had under 0.5.0, 0.6.1 and 0.7.0; needs `legacy-out/`, see below).
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
