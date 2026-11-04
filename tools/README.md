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
| `SIM_TODOS` | `todowrite`: keep the to-do list with TodoWrite, as Claude Code did before TaskCreate / TaskUpdate |

It plays what real runs showed (O5, Claude Code 2.1.306 and 2.1.317): the to-do list one item at a time with
TaskCreate and TaskUpdate, the init listing the Agent tool as `Task`, a draft written from the shell with a
here-document, and the check run again as `node check.js 2>&1 | tail -30`.

The app uses it when `LAMPLIGHT_CLAUDE_PATH` points at it.

## Safety

`sim/shop.mjs` starts the app with a clean environment: only `PATH`, `DISPLAY`, `XAUTHORITY`, a throwaway
`HOME`, the language, the stand-in's settings and a fake API key. Nothing from your shell (keys, Claude Code
sign-in) reaches the app, and every run goes to the stand-in. On Linux without a display it starts its own Xvfb.

On Windows a throwaway `HOME` is not enough: Electron asks the system for Documents, AppData and the rest, and would
find the real ones. `sim/isolate.cjs` is loaded before the app and points all of them into the throwaway home, and
`shop.mjs` refuses to go on if the app still reports a real folder. Windows open off-screen and never take the
foreground, so a run does not interrupt you. Set `SIM_SHOW=1` in the shell to watch real windows instead.

## The packaged app (`sim/packaged.mjs`)

```bash
npm run packaged
```

Builds the unpacked app into `sim-out/packaged` (`dist/` is left alone) and runs it from there with the stand-in Claude: the
fuses read back from the exe, pictures, fonts and music out of `app.asar`, one commission, closing through the window, and
the shelf and the hidden debug tools after a restart. It stops with a failure if the real data folder changed. The fuses
keep `isolate.cjs` out, so `--user-data-dir` and `settings.json` do the isolating, and the window shows for a moment before
it moves off-screen. This is not W11: no installer, no real Claude Code, no real key.

## Acceptance run (`sim/accept.mjs`)

```bash
npm run build
node tools/sim/accept.mjs                      # every scenario, Chinese and English
node tools/sim/accept.mjs --lang en --only demo,board
```

Scenarios: `baddata` (data files that cannot be read are put aside, and the works come back from the last copy), `screens` (Windows display scaling at 125%, 150% and 175% for real, with game pixels counted on the picture, and every
main card in the smallest windows), `contrast` (`sim/contrast.mjs`: each kind of text on every main card, against what is really behind it, to WCAG AA),
`ledger` (fourteen months of spending and more runs than used to be kept), `thousand` (1000 works: how fast the shop, shelf and notebook open, finding one, one more commission),
`grownline` (the line about what grew waits for its speaker), `crash` (the plug pulled mid-commission and with the result open, half-written files, the folder emptied or
gone, Claude Code falling over), `keyboard` (a whole commission, the shelf, the garden and settings without the mouse),
`passers` (people seen through the windows on their way to the door), `beds` (the vegetable beds at 0, 1, 4, 12, 25 and 60 works), `days` (thirty works: all on the shelf, the shop's days in the notebook), `demo`, `board` (the real plan on the blackboard), `materials` (handing over files),
`templates` (all eight, then the works shelf), `revise` (another round, back and forward between versions),
`meeting`, `budget` (hit the cap more than once and carry on), `neterror`, `furnish` (kept after a restart; the card stays clear of the rug, here and in `study`),
`study`, `mini` (the corner window), `walk` (every main card fits at 1280x720, 1600x900 and 1920x1080, including a
slip holding twelve long-named files), `menus` (the toolbar's six buttons, labels and icon pixels, and what sits on each
settings tab), `cards` (every kind of card at the three sizes through the debug handles, with long sample text: inside the
window, nothing spilling over the paper, one of three widths, the close button and Esc only where a card may be put away, the
main button last and focused; leaves `cards-<size>-<kind>.png`), `firstuse` (the "!" marks on the counter, bell and blackboard,
in both rooms; slow on purpose, so the first commission is still going when Adeng speaks), `trial`,
`upgrade` (opens the data a shop had under 0.5.0, 0.6.1 and 0.7.0; needs `legacy-out/`, see below),
`oldclaude` (the stand-in claims an old Claude Code version), `feedback` ("Write to us" and reporting
what the staff made: the mail program and the save dialog are caught, nothing is sent), `store`
(the Microsoft Store build without Claude Code: steps only, no installer run by the app), and `firstrun`
(a new user from nothing: welcome, the trial, Claude Code appearing, the key pasted in the app, the first
commission on the shelf; the key check's request to Anthropic is caught and answered in the test).
Every scenario also checks, when its commission ends, that no speech bubble crosses a card or another bubble.

`upgrade` fails without `legacy-out/`. To make it on Windows, follow the steps at the top of `sim/legacy.mjs`, with a
junction in place of the `ln -s` (`New-Item -ItemType Junction`). Remove the junctions before removing the old
checkouts, so that nothing deletes through them into `node_modules`.

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
trailer from the same kind of run, with ffmpeg: on Linux from the virtual display, elsewhere from the frames the
app paints, so the window stays off screen.

## Upgrades (`sim/legacy.mjs`)

One shop used the way a long-time user would: a few commissions with 0.5.0, then 0.6.1, then 0.7.0 (which
goes down halfway through one), then this checkout. A copy of the whole home is kept after each version in
`legacy-out/<lang>/<version>/` (git-ignored), which the `upgrade` scenario opens with the current build.
With `--fixtures` the Chinese run also refreshes `tests/fixtures/userdata/`, the data files the migration
tests start from.

```bash
# each old version in its own checkout, sharing node_modules (the dependencies have not changed)
git worktree add --detach ../old/0.5.0 c8d0f30 && ln -s "$PWD/node_modules" ../old/0.5.0/node_modules
(cd ../old/0.5.0 && npx electron-vite build)
# likewise ../old/0.6.1 at 0b3fbdc and ../old/0.7.0 at a0b70a8
npm run build && node tools/sim/legacy.mjs --old ../old --fixtures
```

## Real-Claude check (`real/check.ts`)

Runs three small commissions (a page that usually keeps a to-do list, a letter with a handed-over file, and
the demo) through the app's own runner and prompts, against the Claude Code installed on the computer,
with a key from `LAMPLIGHT_TEST_KEY` (never `ANTHROPIC_API_KEY`, which a surrounding Claude session may
have set). Each stops at $0.40 and no new one starts after $1.20; with `--budget 1` none starts that could take
the total past $1. `--only page,demo` runs some of them.
It writes `lamplight-real-check-<time>/report.zip` (summary, event shapes, recordings; no key, home
folder replaced), or into `--out <folder>`, to compare with the stand-in. `--sim` runs the same thing against
the stand-in, free.

```powershell
$env:LAMPLIGHT_TEST_KEY = "sk-ant-..."
npx tsx tools/real/check.ts
```

In a container where a Claude session runs, start it with nothing from that session's environment, so only the
test key can be used:

```bash
env -i PATH="$PATH" HOME="$(mktemp -d)" LANG=C.UTF-8 LAMPLIGHT_TEST_KEY="$LAMPLIGHT_TEST_KEY" npx tsx tools/real/check.ts
```

### Comparing with the stand-in (`real/compare.mjs`), every week

```bash
npx tsx tools/real/check.ts --sim --out real-check/sim
npx tsx tools/real/check.ts --budget 1 --out real-check/real
node tools/real/compare.mjs real-check/real real-check/sim
```

It prints a Markdown summary and fails when:

- something the shop relies on did not hold in the real run (finished, one result at the end, the handed-over
  file read, the colour question, the delete asked and declined, the check failing then passing, every command
  line readable). A to-do list or a helper sent out is Claude's own choice: shown, never a failure;
- the stand-in failed a check (our own bug);
- Claude Code showed an event kind or a tool name that neither the stand-in nor `real/baseline.json` knows.
  Teach the stand-in (`tools/sim/claude.mjs`), check the app reads it, then run the comparison again with
  `--update-baseline` for whatever needs no change.

Fields that only the real run has are listed for reading; the app uses few of them, so they never fail it.

`.github/workflows/real-check.yml` does all this every Monday against the latest Claude Code from the official
installer, with the repository secret `LAMPLIGHT_TEST_KEY` and a $1 budget (any amount when run by hand from the
Actions tab). Without the secret only the stand-in part runs. A failed run emails the repository owner; the job
summary has the table, and the report zips are kept as the run's artifact.

The test key itself lives in the Claude Code cloud environment's settings, not in GitHub, so the weekly real run
is a scheduled task there ("小灯屋每周真实回归", Mondays 04:23 UTC): a fresh session in that environment runs the
same three commands with the key in a cleared environment, $1 at most, and reports the comparison (or opens an
issue when it can). The workflow above stays for the stand-in half, and runs the real half too if the secret is
ever added to the repository.

`real/ui.mjs` runs the demo commission through the real app window (Xvfb in a container) against the
Agent SDK's own Claude Code, with the same `LAMPLIGHT_TEST_KEY`, taking a screenshot every few seconds into
`real-out/`. The app's lowest cap is $1; `--cap` (default 0.40) lowers it for the test through a small wrapper
around the SDK's Claude Code, so the app is unchanged (Linux and macOS). `--sim` runs it against the stand-in.
