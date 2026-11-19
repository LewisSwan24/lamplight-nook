# Changelog

## Unreleased (1.3)

- **The groundwork for connections.** The notebook has a Connections page, and the commission slip a line saying which
  connections a commission may use, none ticked unless you tick one. Making a connection first shows what it can read,
  what it can do and whether that can be undone, what it never does, and how to end it; "Not now" is the default. A
  connection can be paused or disconnected from its card, and disconnecting deletes its key and its settings. Keys are
  kept encrypted by the system, as the API key is, and are masked in the log and the recordings. The first real
  connections come later in 1.3; for now only a development build has one, for testing.

- **Every outside action asks, and is written down.** Anything a connection would change outside the commission folder
  asks you every time, "Not now" by default, and says how it can be undone, or that it cannot. Nothing is allowed for a
  whole commission. Once a commission has read through a connection, searching or reading the web asks first. The notebook has an
  Outside actions page listing what was done through each connection, never what was read or written, with Undo on
  what can still be undone, and Settings can pause every connection at once.

- **Word, Excel, PowerPoint and PDF.** The shop can make Word documents and slide decks; tables are now Excel workbooks
  with formats and formulas, and a résumé also comes as a PDF. The staff can read the Word, Excel and PowerPoint files
  you hand over. The result card shows a small picture of what was made. An Office file opens with a click only when it
  carries no macros, no embedded objects and nothing that reaches outside it; otherwise the card says why and shows the
  file in its folder.

- **Edit a Word, Excel or PowerPoint file, or a PDF.** "Edit a document" now takes these as well as text files, up to
  20 MB, though not a file with macros. Your file stays as it is and so does the shop's copy of it; the changes go into
  a revised copy beside it. In Word they are tracked changes you can accept or reject one by one. In Excel the changed
  cells are recalculated when you open the workbook; one with charts, pivot tables, tables or links to other files is
  left alone and you get a list of the changes to make instead. A PDF can't be changed as it is, so it comes back as a
  Word document, and the card says so.

- **Research says where each point comes from.** Every key point in a research summary carries the numbers of its
  sources, and the sources are also kept in a list the app can check. The result card lists them with their sites;
  a click opens one in your browser. A source the staff never searched for or opened during the job is marked so, and
  the card also says which points have no source and what was concluded without one.

- **Charts and posters.** Two new kinds of work. A chart turns the numbers you write or the table you hand over into
  a picture, every number copied as it is and the bars drawn from zero. A poster comes at the size its use calls for:
  A4 to print (with a PDF as well), square for a social post, or wide for a screen. The staff draw each one as a page,
  save it as a PNG and look at the picture before handing it over; the card shows that picture.
- **More photos can be handed over.** BMP and AVIF photos are taken, and the staff look at a PNG copy made beside them.
  HEIC and TIFF photos, which nothing in the shop can open, are turned away on the slip with a note to save them as JPG
  or PNG first.

## Unreleased (1.2)

- **Every work is now a project.** A project is a folder with all its commissions and every round of changes, kept in
  full however long it runs, where a work used to keep only its last ten changes. Upgrading turns each work you already
  have into a project of its own, after a copy of your data is put aside, and the works shelf looks just as it did. If
  an older version of the shop is opened in between and saves the notebook, the projects are put back the next time this
  one opens.

- **A monthly limit, and a limit for each project.** Besides the most one round may spend, Settings now has the most all
  work may spend in a month (from $10 to no limit, $20 to begin with), and each project in the notebook can have a limit
  of its own. A round only gets what is left under all three; with less than $0.50 left, new work waits and a card says
  which limit it is and where to change it. Past eight tenths of a limit, Wick says so once on the result card. Anyone
  who spent more than $20 in one of the last few months starts at $50, and is told so once.

- **A project board and a timeline.** A new Projects button, and the blackboard while nothing is chalked on it, show
  every project with when it was last touched, its rounds, what it cost and where it stands. Opening one shows a row
  per round, and every round now keeps a version of the work, each file stored once however many rounds have it. Any
  round can be opened to look at, gone back to (what is there now is kept first, so nothing is lost), or branched off
  into a new project in a folder of its own. Each project keeps up to 200 MB of versions; past that the oldest go, all
  but the first, and the timeline says which.

## Unreleased (1.1)

- **Moving to the Microsoft Store version.** The Store version keeps its data in a folder of its own, because Windows
  would otherwise split a shared one between the real folder and the package's private copy. The first time it opens on
  a computer where the installed version has a shop, Wick asks whether to bring it over: the works, the notebook and the
  ledger are copied and the original is left as it was. The API key has to be pasted again.
- **An apprentice joins the shop.** With the tenth commission Bean walks in at the front door and starts at the counter.
  When Clem is already out and a second errand comes up, Bean runs it instead of it waiting; a third still waits for
  whoever is back first. Bean has their own lines, a story, and a word from the neighbours. No extra helper is started and
  nothing extra is spent.
- **The shop keeps growing after fifty.** Eight more pieces come between the 55th and the 100th commission, among them
  a tank of goldfish at 60, a gramophone at 75 and a carved sign at 100. Once the beds out back are full they follow the
  seasons: young plants in spring, a harvest in autumn, straw in winter. A vase on the big table changes with the season,
  the Lantern, Dragon Boat and Mid-Autumn festivals get their own decorations, and past the twentieth commission the
  neighbours have something new to say every season.
- **The shop knows when there's a new version.** It looks when it opens and every six hours after, and the postman
  brings a letter with the version number and what's new. Nothing downloads until you press Update, and the new version
  goes in when you close the shop, never in the middle of a commission, after a copy of your data is put aside. A switch
  in settings stops the looking; the Store version is kept up to date by the Store.
- **The shop can work in a folder you already have.** Pick it on the slip and agree once; the staff then change your
  files without asking about each one, after keeping a copy of each as it was. "Undo this commission" on the result card
  puts your files back byte for byte and takes away what was new. Deleting, running commands, and changing settings
  folders, scripts or `package.json` still ask, and a folder over 100 MB is turned down before anything starts.
- **Take a work away from the shelf.** "Take it away" saves a work as a zip wherever you choose, and a web page can go
  as a PDF instead. A work done in your own folder takes only the files it changed or made. Nothing is uploaded: you get
  the file and pass it on yourself.
- **Four new kinds of commission:** a résumé, reading notes, a travel guide and a small tool. A résumé never invents
  experience, reading notes quote only what you hand over, and a travel guide says where each opening time and price
  came from.
- **A script the shop made is checked before you run it.** If a small tool comes as a script that deletes files, or
  changes them without listing what it will do first, the result card says so and names the file.
- **The notebook keeps a ledger of the month.** How many commissions and rounds, how long a round takes, why some
  didn't finish, and how often an errand waited for a busy helper. It stays on this computer, and can be cleared on its own.
- **The Claude Code version check works in the installed app.** A Claude Code that is a script used to open a second shop
  instead of saying its version.
- **The shop's birthday is no longer missed.** Closing the shop in the first few seconds of its birthday used to count
  the line as said, and a shop left open across midnight never noticed the day. It now counts once someone says it, and
  checks again when the day changes.
- **The card about records that can't be read names the limit in force.** It used to give the one read at startup, even
  if the limit was changed while the card waited its turn.

## 1.0.0 (2026-11-05)

The running card and the road to 1.0.

- **A moved work's round comes back with a card.** It used to end in silence, after asking to overwrite the work's own
  file, and what the work had cost stayed behind in the old folder.
- **No File, Edit and View menus.** Those were Electron's own, with the developer tools among them.
- **Settings says what the monthly figure leaves out.** Claude Code reports no cost for a round stopped partway.
- **Long cards stay on the paper in a small window.** The words scroll inside the card, and the button stays in view.
- **Stopping on the way out can be carried on, as promised.** "Stop and close" used to throw away what it said you could
  carry on with, and answering "keep going" when quitting stopped the commission anyway.
- **A stopped commission shows what it managed.** Its card now leads to what was done so far, and the plan stays up.
- **Forgetting waits for the running commission.** Before, what was running wrote itself straight back and the ledger
  could count a round twice.
- **The shop has a birthday.** A year to the day after the first work, Wick mentions it, and it goes into the shop's days.
- **A work that moved can be found again.** When its folder has been moved, the shelf asks where it is now, and takes the
  new place if its main file is there.
- **One shop at a time.** Opening the app again brings the shop back. Before, a second shop opened on the same notebook,
  and each kept its own idea of what had been written.
- **Cards say what they are.** A screen reader is now told each card is a dialog and what it is called when it opens,
  and the name box in settings has a name.
- **A damaged notebook no longer costs you the notebook.** A data file that cannot be read used to count as empty, and the
  next save wrote over it. Now it is put aside, the copy from when the shop last opened takes its place, and Wick tells you.
- **When the shop cannot open, it says so.** A full disk or a folder it cannot write to used to leave it running with no
  window at all. Damaged settings or a damaged ledger are now mentioned too, including what the budget went back to.
- **Crisp at 125% and 150%.** On a display Windows scales, game pixels came out uneven. The shop now picks its size in
  real pixels, so every pixel is the same size on the common laptop settings too.
- **Forget everything means everything.** Records of runs are deleted and the spending ledger no longer says what the money
  went on; before, both kept the names of your commissions. Records of runs are also kept to the last 50.
- **Words you can read.** The copper links and main buttons, dates, hints and settings tabs were lighter than the paper
  could carry. All of it now measures at least 4.5:1 against what is really behind it.
- **Month by month.** Settings shows what each month cost and on how many commissions. A work changed again in a later
  month no longer moves what it cost earlier, and nothing old drops out of the ledger.
- **Find anything on the works shelf.** Search by name, by what you asked for or by month, or look at one kind of work.
  Works sit under their months and come in as you ask for them, so a thousand of them open as fast as eight.
- **Things said once are heard once.** What the shop says about something new waits until the result card is put away and
  you are in the room, and never talks over the last thing it said.
- **`npm run packaged`** runs the built app from its own folder with the stand-in Claude, so a picture left out of the
  package or a fuse left unset shows before any release does.
- **Dates are the ones on your wall.** Works, the shop's days, commission folders and the monthly spend used Greenwich
  time, so a job finished on a morning in Brisbane was filed under yesterday.
- **Six buttons, in the order you reach for them.** Commission (Progress while one is running), the works shelf, the
  notebook, captions, sound and settings, in pixel icons drawn for the shop that look the same on every computer. Each
  says what it is the moment you point at it or tab to it.
- **Settings sort themselves out.** Who you are, the shop (where it is and how it is furnished), sight and sound, getting
  to work, and about, with the trouble and write-to-us rows there. Detailed mode is now a switch under sight and sound:
  "Show what the staff are doing at the bottom of the window".
- **Every card behaves the same.** A card you can put away has a x at the top right and answers Esc; a card that needs an
  answer has neither and cannot be pushed aside. The main button is always last on the right and takes the keyboard focus,
  so Enter is safe. Three widths instead of a dozen, and long words scroll inside the paper.
- **A newcomer gets shown round.** A small "!" over the counter, then over the bell and the blackboard during the first
  commission, with a word from Wick about what they are for. The works shelf says so when it is empty.
- **One card for work under way.** The counter and the blackboard now open the same card: how long it has taken,
  the limit for this round, what is happening now, every step of the plan, who on the staff is doing what, and three
  buttons (keep going, say something, call it off). It keeps up while it is open. Steps that are only Wick's guess
  are not counted as "1 of 3 done". The blackboard also shows a hand cursor now.
- **The staff walk behind the furniture.** The table, counter, shelves, chairs and the rest are separate pieces now,
  each drawn at the depth of its foot, so someone behind the table shows only their head. What stands on the furniture
  (the cup, the slip, the bell, fruit on the table, a pumpkin on the shelf) stays on top of it.
- **Everyone finds their own way.** Staff, neighbours, you and the cat work out a walk round the furniture and the
  holiday pieces instead of following one fixed aisle, in the shop, the study and the garden. The same start and end
  always give the same walk.
- **Nothing drops off the shelf.** The shop used to remember the last twenty commissions, so older works quietly left the
  shelf and the notebook. It keeps them all now. Claude is still only told about recent choices, so a long history costs
  nothing more on each commission.
- **The shop's days.** The notebook's page now tells the shop's story: the first work by name, the tenth and twenty-fifth,
  what it gathered, the first visit of each neighbour, and how the beds did.
- **The garden grows with the work.** The vegetable beds behind the shop start empty. A sprout comes up every three works
  finished and ripens three works later, so they fill at the twenty-fifth. The staff mention the first sprout, the first
  ripe plant and the full beds. Another round of changes on the same work does not count.
- **People pass the windows.** A neighbour on the way in and Clem on an errand go by behind the glass before they reach
  the door, a dark shape by day and lit by the street lamps at night. With less motion asked for, nobody goes by.
- **A commission that falls over says so.** If Claude Code stops partway for no reason it can name, Wick now tells you
  with a card and you can carry on from where it stopped. It used to go quiet, with the plan left on the blackboard.
  Carried on, it stays one commission in the notebook.
- **Tab stays on the card.** While a card is open, Tab goes round inside it instead of wandering off to the shop behind.
- **The doors make sense now.** The top wall faces the street, so only the front door opens there, and a third window
  looks out where the back door used to be. The back door is in the bottom wall, right above the path in the garden.
  Flint stands on the other side of the workbench, out of its way.
- **Wick is behind the counter.** The counter moved down, so Wick stands behind it with the coffee machine alongside,
  and neighbours and you come up to its end. The mini window shows the same.
- **Everyone sits down for a meeting.** The bench in the shop and the sofa in the study take two more, so all four sit.
- **The study has its own floor plan.** The sofa stands at the reading table, and the staff keep off the gap in the desk.
- **Words keep off the blackboard.** A speech bubble that would cover the chalk moves beside it. Flint's guitar now
  hangs on the wall, where the Christmas tree cannot hide it.
- **The shop comes to look like what was made in it.** Albums leave an album on the table, research leaves a stack of books, letters
  go up on a board, and a calendar, a ledger and an old computer arrive the same way. The staff talk about the work, the
  neighbours ask about it, and Auntie Olive asks after your latest piece by name. There is more to gather and more to hear
  after the twentieth commission, up to the fiftieth. Another round of changes on one work still counts as one.
- **New neighbours, brought by the work.** After a web page Old Zhou from the garage drops in. After an album Granny Chen
  comes with her photographs. After some research Xiaohe sits down to write her thesis.
- **The staff do what they seem to be doing.** Writing is a page and a moving pencil on the table, a drink is a cup in the
  hand, and Flint taps with a hammer. Wick takes the phone at the counter for commands and the web, and hands the work
  over when someone is sent off. Whoever is listening turns to whoever is talking. The cat gets up and walks.
- **Everything in the shop answers.** The clock, window, doors, table, shelf, workbench, lamp, plants, cup, blackboard
  and what the shop has gathered all show a name on hover, can be reached from the keyboard, and answer a click with a
  word, a light or someone strolling over, for nothing. At work the clock opens the running card, the table lists what
  you handed in, and the front door says who is out. Neighbours say hello when clicked.
- **The limit is per round, and says so.** The commission form, settings and the stop card all say "this round", and
  the stop card shows what the round spent, not the running total.
- **Nobody walks through furniture.** Eleven stand points got their own place for each character, the holiday pieces
  moved clear of the walks, and a test checks every walk against the measured furniture in both scenes.
- **Old Claude Code checks work on Windows.** A `.mjs` or `.js` stand-in runs through Node, so the version check and
  the upgrade offer behave the same on Windows.

Safety before launch.

- **Reading outside the commission folder asks first.** Claude's Read, Glob and Grep tools could open any file
  on the computer that was not a key file or hidden settings, without a word; a web page or a handed-over file
  that talked Claude into it could then have it send what it read on with a web request. Now any read outside the
  folder waits for you, however it is written: a path, `..`, `~`, `cd ~`, or `$HOME` in PowerShell.
- **Pages and files are material, not instructions.** Claude is told that web pages, search results and the files
  in the folder are things to work from: if one tells it to run something, read or send other files, or change the
  shop's rules, it does not, and says so in the summary.
- **Only documents open with a click.** "Open" on the result card and the works shelf opens pages, text, tables,
  pictures and PDFs; anything else the staff wrote (a program, a script, a shortcut) is shown in its folder
  instead, and a link inside the folder can no longer point the click elsewhere.
- **The shop's windows stay on the shop.** They refuse to navigate to another page, to open new windows or embedded
  views, and every web permission request (camera, microphone and the like). The page can no longer set the work
  folder; only the folder dialog does.
- **The installed app cannot be borrowed to run other code.** Electron's fuses are set in the build: no plain Node
  mode (`ELECTRON_RUN_AS_NODE`), no code through `NODE_OPTIONS`, no debugger flags, and only the app's own
  `app.asar` loads, checked against its recorded hash on Windows.
- **The plan shows up more often.** For work with three or more steps Claude is asked to keep its to-do list in your
  language from the start, so the blackboard shows the real plan rather than three generic steps (a real page
  commission now lists "请设计师给出配色与布局方案…").
- **Fewer confirmation cards, and revisions keep the rules.** Claude is told to change files with its file tools
  rather than python or sed, so ordinary edits stop asking. "Another round" now gets the same safety rules as the
  first commission.

Polish before launch.

- **The commission slip scrolls when it is full.** With many materials handed over, the files and the text scroll
  inside the slip and the send button stays on screen, at every window size.
- **The handwriting font is whole.** It now carries the common Chinese characters (GB2312 level 1, 3,883 in all), so
  a line no longer drops into another font halfway. The font file grows from 119 KB to 991 KB. The text box on the
  slip uses the plain font, so what you type stays easy to read.
- **The rug fits the big table.** The cafe's rug is larger and centred, showing the same on every side in all its
  colours, and the bench has its top edge, so the table and bench no longer read as one broken table.
- **Shelf titles read like titles.** A title keeps its punctuation and stops at the end of a clause, or with "…" if
  it runs long. Folder names still leave out what Windows does not allow. Titles already on the shelf keep their
  old form.
- **The blackboard shows four steps.** A step too long for its line ends in "…" instead of being cut off.
- **Speech bubbles are never half hidden.** A bubble that would land on another moves above it, and one that a card
  would cut is not shown until the card closes.
- **Furnishing in plain sight.** The Furnish tab of Settings moves the card beside the room and fits it to what is on
  it, so the walls, curtains and rug can be seen changing. The hint now says plainly that each room keeps its own
  colours.
- **Smaller wording.** Changing finished work is called the same thing on every card ("再改改" in Chinese). The corner
  window says what is happening without "Busy:" in front of it. The key prefix `sk-ant-` stays on one line. Chinese
  text uses Chinese quotation marks.

## 0.9.1 (2026-11-03)

A safety fix.

- **`node -e` no longer runs unasked.** `node` was on the list of safe commands so that `node check.js` runs,
  which also let `node -e "..."`, `node -p`, `node -r` and a script piped or given through a here-document run
  without a word. Now only a script file in the commission folder runs as before; code written on the spot waits
  for you like any other serious step. `npx`, which downloads and runs a package, asks first like an install.
- Tooling: a weekly real-Claude check (`.github/workflows/real-check.yml`): the three small commissions against
  the latest Claude Code with a test key and a $1 budget, compared with the stand-in by `tools/real/compare.mjs`.
  The stand-in now also sends the PermissionRequest and Stop hooks and a helper's task progress and update, as
  real runs do.

## 0.9.0 (2026-11-03)

Checked against a real Claude Code (2.1.306, the Agent SDK's own, and 2.1.317) for the first time since 0.8,
and ready for the Microsoft Store.

- **The real plan on the blackboard works with today's Claude Code.** Claude Code no longer has TodoWrite; it keeps
  its to-do list with TaskCreate and TaskUpdate, one item at a time. The blackboard, the corner window and the tray
  now follow those (and still TodoWrite, for older copies). Before this, a real run never showed its plan.
- **No warning card for everyday commands.** A command line is now read part by part: `node check.js 2>&1 | tail -30`,
  `node check.js; ls`, `cd` into the commission folder first, or writing a file with a here-document run like their
  parts would. A line with a delete, a write outside the folder or over a file that was there before, or anything
  the shop can't read (`$(...)`, variables, background jobs) still waits for you. `find` with `-delete` or `-exec`
  now asks too. In real runs, a re-run of the check came up as "serious", and the default "not now" stopped it.
  The delete button names only the files really deleted (not "&&" and "ls" from `rm a b && ls`).
- **One commission, one result.** Helpers and long commands are no longer sent off in the background, which newer
  Claude Code may do; a run could otherwise say "done" while a helper was still out, then carry on. A helper sent
  off anyway is shown out until it reports back.
- The English welcome said "hand it to Adeng"; it is Wick.
- The Store listing text is in `store/listing.md`, including that the monthly Claude API credits of a Max, Ultra or Team
  plan can be used with the shop.
- The release run attaches the Store test package (`Lamplight-Nook-<version>-test.msix`) next to the installer,
  and uses the notes in `release-notes/<tag>.md` when there are some.
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
- **Reporting what the staff made.** The result card has "Something not right in this? Tell us", a
  letter about that commission in the same way (Microsoft Store policy 11.16 on live generative AI).
- **The Microsoft Store build never runs an installer script.** In the MSIX package the app shows the
  official steps and the copy button, opened, instead of "Install it for me" / "Update it for me"
  (Store policies 10.2.2 and 10.2.3). The setup file from the website keeps the button.
- Tooling: `tools/sim/legacy.mjs` builds a shop's real data with 0.5.0, 0.6.1 and 0.7.0; the `upgrade`
  acceptance scenario opens it with the current version. The `oldclaude` scenario plays an old Claude Code,
  `store` the Store build, and `firstrun` a new user from the welcome card to the first piece of work.
  `tools/real/check.ts` runs three small commissions against a real Claude Code with a capped budget
  and writes a report to compare with the stand-in; `tools/real/ui.mjs` runs the demo in the real window, capped
  at $0.40. The stand-in now keeps its to-do list with TaskCreate / TaskUpdate (`SIM_TODOS=todowrite` for the old
  way) and uses the shell the way real runs do.

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
