# Changelog

## Unreleased (0.9.0)

- **Upgrades keep everything.** The data folder now has a version, and older data is brought up to date
  when the app starts, with a copy of the old files kept in `backup/` first. A shop used since 0.5 or 0.6 now
  counts the commissions finished back then (0.7 started counting from zero), and grows accordingly.
  Notebook entries from before 0.7 know which file is the work, so the works shelf opens it rather than
  the folder. English titles from before 0.8.1 read as words again ("Make me a small" rather than
  "Make-me-a-small-").
- Clearing the notebook also clears the copy kept aside by an upgrade.
- **Claude Code's version is checked.** The app asks the installed Claude Code its version and compares it
  with the one the shop was tried with (the version the Agent SDK was built for). An older copy is
  explained at the counter, with "Update it for me" (the same official installer) or "Use it as it is";
  a newer one is only written to the log. Settings show the version, and the log and the diagnostics
  bundle record it for every run.
- **Write to us.** Settings → Work → "If something goes wrong" lists exactly what the letter will hold
  (our address, a subject, a last line with the app version and system), then opens the user's own mail
  program with it. The diagnostics file is exported only when ticked, and only its name goes in the letter;
  attaching it and sending are the user's own steps. The app sends nothing.
- Tooling: `tools/sim/legacy.mjs` builds a shop's real data with 0.5.0, 0.6.1 and 0.7.0; the `upgrade`
  acceptance scenario opens it with the current version. The `oldclaude` scenario plays an old Claude Code.

## 0.8.1 (2026-11-03)

- English titles of commissions keep whole words on the works shelf and in Wick's notebook
  ("Write a letter to my landlord about moving out" rather than "Write-a-letter-t"). Chinese titles are unchanged.
- Wick's greeting quotes the last commission as a name ("How's “Make a pomodoro timer page” working out?"),
  in both languages, so a title that starts with a verb still reads naturally.
- The Furnish tab in English reads "Now furnishing: The corner shop." instead of "Furnishing The corner shop."
- Tooling: `tools/` has a stand-in for Claude Code and scripts for the simulated acceptance run, the store
  screenshots and the trailer (see `tools/README.md`).

## 0.8.0 (2026-11-02)

Long jobs you can follow, things you can hand over, and a shop you can furnish.

- **The real plan on the blackboard.** When Claude keeps a to-do list, the blackboard shows that list in plain
  words and ticks items off as they finish. A long list shows the items around the one under way and how many
  are left; clicking the blackboard opens the whole plan. The corner window and the tray say which item is
  under way ("3 of 6"). Without a list the blackboard keeps the usual three steps.
- **Handing over files.** Drop files on the counter to start a commission with them, or on an open commission
  slip to add them; "Hand over files" picks them in a dialog, and each can be taken back. When the work starts,
  copies go into a `materials` folder in the commission folder; the originals are never touched. Folders,
  missing files, files over 20 MB, more than 50 MB in all and more than 10 files are refused with a reason.
- **Four new templates:** a letter or email (plain text, blanks for facts the shop does not know, never sent by
  the shop), a table (a CSV that opens correctly in Excel, with formulas for totals), a plan (by day or by week,
  with room for missed days) and a photo album (one page made from the photos handed over). Each has its own
  opening line and its own icon on the works shelf.
- **Furnishing.** Settings has a Furnish tab with four choices each for the walls, the curtains and the rug,
  kept separately for the café and the study.
- **Settings in tabs:** Basics, Furnish, Sight and sound, Work, About. Arrow keys move between them.
- The first finished result says that work goes on the works shelf. An expanded note no longer covers the
  street view.

## 0.7.0 (2026-11-01)

Change finished work in another round (the last version is kept and can be swapped back), the works shelf
and a shop that grows with the commissions done together, the corner window, and the study at home as a
second scene.

## 0.6.1 (2026-10-31)

Fixes from the 0.6.0 walkthrough, your own look in the shop, and no false "credit balance too low" when started
from a Claude Code shell.
