import type { Strings } from './i18n';
import type { GuestId } from './types';
import type { Shop } from './dispatch';

/**
 * The ready-made kinds of commission (road-to-1.1.md A7), one record each, in the order of the stickers on the form.
 * Their words stay in the locale files, looked up by id: `ui.templates.<id>` names the sticker, `<id>Fill` is
 * what it writes in the request box, `<id>Hint` explains what to pick or hand over. Adding a kind means a record
 * here, those strings, a shelf icon in works.png and, if it brings one, a growth picture.
 * Pure data and string-building: both processes read it, and the files themselves are handled in app/main.
 */

type Files = Strings['ui']['files'];

/** What a template's prompt is built from: the shop's words for its files, and the file or folder the user picked. */
export type PromptParts = {
  language: string;
  files: Files;
  /** Name of the picked file or folder. */
  sourceName: string;
  /** What the shop calls its copy of a picked file, and the edited version. */
  original: string;
  revised: string;
};

/**
 * What the user picks besides writing the request, through the main process's dialog: a file (copied into the
 * commission folder as the original) or a folder (listed into it; the shop never sees the folder itself).
 */
export type SourceKind = { kind: 'file'; extensions: readonly string[]; maxBytes: number } | { kind: 'folder' };

/**
 * What the result card opens, best first, matched on file names: a page the shop made, an edited document, a chart
 * a poster, a menu or a greeting card drawn as a picture (before the page it was drawn from), revision cards, any page, a Word, Excel or PowerPoint file or a
 * PDF (never the kinds with macros), a write-up in Markdown, an email draft (C5, which opens in the mail program), then
 * a table or a letter.
 */
export const MAIN_FILES = {
  index: (name: string) => /index\.html$/i.test(name),
  revised: (name: string, files: Files) => name.startsWith(files.revisedPrefix),
  picture: (name: string, files: Files) => name === files.chartPng || name === files.posterPng || name === files.menuPng || name === files.cardPng,
  /** Revision cards (plan-1.8.md H1): their PDF, before the pages they were printed from and before the quiz. */
  cards: (name: string, files: Files) => name === files.flashcardsPdf,
  page: (name: string) => /\.html?$/i.test(name),
  office: (name: string) => /\.(docx|xlsx|pptx|pdf)$/i.test(name),
  writeup: (name: string) => /\.md$/i.test(name),
  draft: (name: string) => /\.eml$/i.test(name),
  table: (name: string) => /\.(csv|txt)$/i.test(name),
};

export type TemplateSpec = {
  id: string;
  /** Where the work is done (road-to-1.4.md D3): the order is taken at home and carried to this shop. */
  shop: Shop;
  /** Frame in assets/sprites/works.png for the works shelf. */
  icon: number;
  source?: SourceKind;
  /** Needs at least one photo among the files handed over. */
  photos?: boolean;
  /** What it asks for on top of the request itself. File names are quoted so they are unambiguous. */
  steps: (p: PromptParts) => string[];
  /** Whether a round of changes repeats the steps: research only says how to look things up, which a change rarely needs. */
  revise: boolean;
  /** Which kind of file its result is (MAIN_FILES). */
  main: keyof typeof MAIN_FILES;
  /** A piece the shop gathers after this many of this kind (growth.ts; assets/sprites/grow-<id>.png). */
  growth?: { id: string; at: number };
  /**
   * A piece that stands in the shop along the street that does this kind of work instead, after this many of this
   * kind (plan-1.8.md H5; towngrow.ts ROOM_WORK; assets/sprites/grow-<shop>-<id>.png). Only for a street shop's work.
   */
  roomGrowth?: { id: string; at: number };
  /** A neighbour who starts dropping in once there has been one (guests.ts). */
  guest?: GuestId;
};

/**
 * Files the edit template accepts, and how big they may be: text, and since road-to-1.3.md C3 Word, Excel, PowerPoint
 * and PDF (never their kinds with macros), up to the 20 MB a file handed over may be.
 */
export const EDITABLE = ['txt', 'md', 'html', 'htm', 'csv', 'json', 'docx', 'xlsx', 'pptx', 'pdf'];
export const MAX_EDIT_BYTES = 20 * 1024 * 1024;

/** What the edit template asks for, by the kind of file: text by hand, Office files by number with the edit tools, a PDF again as Word. */
function editSteps({ original, revised }: PromptParts): string[] {
  const kind = /\.(docx|xlsx|pptx|pdf)$/i.exec(original)?.[1].toLowerCase();
  const end = 'In your final reply, list the main changes in two to five short points.';
  if (!kind) {
    return [
      `The document to work on is "${original}" in this folder, a copy of the user's file.`,
      `Do not change "${original}". Write the edited version as "${revised}", in the same format.`,
      end,
    ];
  }
  if (kind === 'pdf') {
    return [
      `The document to work on is "${original}" in this folder, a PDF copy of the user's file. Read it with the Read tool, passing pages (at most 20 at a time).`,
      `A PDF cannot be changed as it is. Write the edited version as a Word document "${revised}" with the mcp__nook-office__make_docx tool, keeping its headings, paragraphs, lists and tables. Never write Office XML or a .docx by hand.`,
      'Say in your reply that the PDF has become a Word document.',
      end,
    ];
  }
  const what = { docx: 'paragraph', pptx: 'text box', xlsx: 'cell' }[kind];
  const steps = [
    `The document to work on is "${original}" in this folder, a copy of the user's file. Do not change it.`,
    `Read it with mcp__nook-office__read_document and numbered: true, then make the changes with mcp__nook-office__edit_${kind}, from "${original}" to "${revised}", every change in one call, each ${what} named by the number it showed. Never write Office XML or the file by hand.`,
  ];
  if (kind === 'docx') steps.push('Your changes show in Word as tracked changes the user can accept or reject one by one, so change only what the request asks for.');
  if (kind === 'xlsx') steps.push(`If edit_xlsx says it cannot change this workbook, write the changes down as "${revised.replace(/\.xlsx$/i, '.md')}" instead, as it tells you, and say so in your reply.`);
  return [...steps, end];
}

export const TEMPLATES = [
  {
    id: 'page', shop: 'workshop', icon: 0, revise: true, main: 'index', growth: { id: 'monitor', at: 3 }, guest: 'mechanic',
    steps: () => [
      'Make it as a single self-contained page named "index.html": CSS and JavaScript inline, no build step, and it must work when opened straight from disk.',
      'Keep data in localStorage if the page needs to remember anything.',
    ],
  },
  {
    id: 'research', shop: 'home', icon: 1, revise: false, main: 'writeup', growth: { id: 'books', at: 2 }, guest: 'student',
    steps: ({ language, files }) => [
      'This is a research commission: do not make a web page.',
      `Send the researcher subagent to look it up, then write the findings in ${language} as two files.`,
      `"${files.summary}": a three-sentence summary first, then the key points as a list, each point followed by the numbers of its sources in brackets, such as [1][3], then the sources, numbered, with their links.`,
      `"${files.sources}": JSON, {"sources": [{"n": 1, "title": "the page's title", "url": "https://...", "checked": "YYYY-MM-DD, the day you looked", "quote": "a short line from the page (optional)"}], "unsourced": ["each conclusion you found no source for, word for word"]}.`,
      `Every key point needs at least one number. A conclusion you found no source for goes into "unsourced", and in the summary it is marked "${files.noSource}" instead of a number.`,
      'Never make up a link or a source: use only pages the search found or you opened this time.',
      'Say plainly where sources disagree or where you are unsure.',
    ],
  },
  {
    id: 'edit', shop: 'home', icon: 2, revise: true, main: 'revised', source: { kind: 'file', extensions: EDITABLE, maxBytes: MAX_EDIT_BYTES },
    steps: editSteps,
  },
  {
    id: 'tidy', shop: 'home', icon: 3, revise: true, main: 'writeup', source: { kind: 'folder' },
    steps: ({ language, files, sourceName }) => [
      `"${files.listing}" lists what is in the user's folder "${sourceName}": relative path, size in bytes, last modified date. Folders end with "/".`,
      'You cannot see that folder and must not try to look for it. Work only from the list.',
      `Write a plan for tidying it up as "${files.tidyPlan}" in ${language}: a suggested folder layout, which files go where,`,
      'and anything that looks like a duplicate, an old version or a leftover worth a look.',
      'Do not move, rename or delete anything: the user carries out the plan themselves.',
    ],
  },
  {
    id: 'letter', shop: 'home', icon: 5, revise: true, main: 'table', growth: { id: 'letters', at: 2 },
    steps: ({ language, files }) => [
      'This is a letter or an email: do not make a web page.',
      `Write it as "${files.letter}" in ${language}, as plain text the user can copy straight into an email or onto paper.`,
      'If it is an email, put a short subject line first, marked as the subject. Match the tone to who it is for; keep it warm and to the point.',
      'Where you need a fact you do not have (a date, a name, an amount), leave a clear blank in square brackets instead of making it up.',
      'Do not send it anywhere: the user sends it themselves.',
    ],
  },
  {
    id: 'sheet', shop: 'print', icon: 6, revise: true, main: 'office', growth: { id: 'ledger', at: 2 },
    steps: ({ language, files }) => [
      'This is a table: do not make a web page.',
      `Build it with the mcp__nook-office__make_xlsx tool as "${files.sheet}": give the tool the structure (sheets, columns with their formats, rows) and it makes the Excel file. Never write Office XML or an .xlsx by hand, and do not make a CSV.`,
      'Put the column names in the first row and keep that row in view (freezeHeader). Leave rows for the user to fill in where that is the point of the table.',
      'Where a total or a sum helps, use a formula cell such as {"f": "=SUM(B2:B20)"} so it updates as the user fills it in. Formulas use only this workbook. Give each column its format: money, number, date, percent or text.',
      `Write the column names and any example rows in ${language}.`,
    ],
  },
  {
    id: 'plan', shop: 'home', icon: 7, revise: true, main: 'writeup', growth: { id: 'calendar', at: 1 },
    steps: ({ language, files }) => [
      'This is a plan: do not make a web page.',
      `Write it as "${files.plan}" in ${language}: one line on the goal first, then the plan as a table by day or by week (whichever fits),`,
      'then a short checklist of what to prepare. Keep each step small enough to do in one sitting, and leave some slack for missed days.',
      'If something depends on the user (their free time, a budget, a level), say what you assumed in one line at the top.',
    ],
  },
  {
    id: 'album', shop: 'studio', icon: 8, revise: true, main: 'index', photos: true, growth: { id: 'album', at: 1 }, guest: 'granny',
    steps: ({ files }) => [
      `Make a little photo album as a single self-contained page named "index.html", using the photos in the folder "${files.materials}".`,
      `Show the photos straight from that folder with relative paths (for example "${files.materials}/photo.jpg"); do not copy, resize or change them.`,
      'Look at each photo first so the order, the captions and the title fit what is in them. Keep captions short and kind; do not guess names of people.',
      'CSS and JavaScript inline, no build step; it must work when opened straight from disk. Clicking a photo shows it large.',
    ],
  },
  {
    id: 'resume', shop: 'print', icon: 9, revise: true, main: 'page', growth: { id: 'briefcase', at: 1 },
    steps: ({ language, files }) => [
      'This is a résumé: one page, made to be printed.',
      `Make it as a single self-contained page named "${files.resume}": CSS inline, laid out for one A4 page, with print styles so that the browser's "Print to PDF" gives one clean page.`,
      `When the page is done, also save it as "${files.resumePdf}" with the mcp__nook-office__make_pdf tool, so the user has a file ready to send.`,
      `If the user handed anything over in "${files.materials}" (an old résumé, a list of what they have done), read it first and build on it.`,
      'Never invent experience, schools, dates, job titles or numbers. Where something is missing, leave a clear blank in square brackets for the user to fill in.',
      `Write it in ${language}. In your final reply, say in one or two sentences which kind of job you shaped it for.`,
    ],
  },
  {
    id: 'notes', shop: 'home', icon: 10, revise: true, main: 'writeup', growth: { id: 'readinglamp', at: 1 },
    steps: ({ language, files }) => [
      'These are reading notes: do not make a web page.',
      `Write them as "${files.notes}" in ${language}, in Markdown: a short paragraph on what the book is about, then the main ideas as a list, then quotations, then a few questions to think about.`,
      `Quote only from what the user handed over in "${files.materials}", word for word, and say where each quotation came from. Never quote the book from memory; if there is nothing to quote from, leave the quotations out and say so.`,
      'If you need basic facts about the book (its author, the year), send the researcher subagent to check them; if they cannot be found, say so instead of guessing.',
    ],
  },
  {
    id: 'travel', shop: 'home', icon: 11, revise: true, main: 'index', growth: { id: 'postcards', at: 1 },
    steps: ({ language }) => [
      'This is a travel guide.',
      'Make it as a single self-contained page named "index.html": CSS and JavaScript inline, no build step, and it must work when opened straight from disk.',
      'Lay it out day by day, then a budget table, then a packing list. For each place give a link to it on a map; do not embed maps.',
      'Send the researcher subagent to check what changes: opening hours, ticket prices, how to get there. Next to each such fact give its source and the date it was checked, and remind the user to check again before setting off.',
      'If something cannot be found, say so instead of guessing.',
      `Write it in ${language}.`,
    ],
  },
  {
    id: 'tool', shop: 'workshop', icon: 12, revise: true, main: 'page', growth: { id: 'toolbox', at: 1 },
    steps: ({ language, files }) => [
      'This is a small tool.',
      `If it can work inside a browser (reading files the user picks, changing text, working with a table, calculating), make it as a single self-contained page named "${files.tool}": CSS and JavaScript inline, no build step, working straight from disk. It reads only the files the user picks on the page and offers its results as a download.`,
      `Only if it must change files on the computer (renaming or moving them, say), write a PowerShell script named "${files.toolScript}" instead, and next to it "${files.toolLauncher}", which runs it with a double click: powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${files.toolScript}".`,
      'Such a script only lists what it would do, and changes nothing until it is run again with -Apply. It never deletes anything.',
      `Try it only on sample files you make in a folder named "${files.toolSamples}" inside this folder. Never point it at the user's own files.`,
      `In your final reply, say in ${language} how to use it, in two or three short steps.`,
    ],
  },
  {
    id: 'document', shop: 'print', icon: 13, revise: true, main: 'office',
    steps: ({ language, files }) => [
      'This is a Word document: do not make a web page.',
      `Build it with the mcp__nook-office__make_docx tool as "${files.document}" in ${language}: give the tool the structure (a title, headings, paragraphs, lists, tables, pictures from this folder) and it makes the file. Never write Office XML or a .docx by hand.`,
      'Shape it for what it is for: a report opens with a short summary, a notice says what, when and where first, a manual goes step by step in numbered lists.',
      `If the user handed anything over in "${files.materials}", read it first (mcp__nook-office__read_document reads Word, Excel and PowerPoint files) and build on it.`,
      'Where you need a fact you do not have (a date, a name, an amount), leave a clear blank in square brackets instead of making it up.',
    ],
  },
  {
    id: 'slides', shop: 'print', icon: 14, revise: true, main: 'office',
    steps: ({ language, files }) => [
      'This is a slide deck: do not make a web page.',
      `Build it with the mcp__nook-office__make_pptx tool as "${files.slides}" in ${language}: give the tool the structure (a title slide, then one idea per slide, pictures from this folder, notes for the speaker) and it makes the file. Never write Office XML or a .pptx by hand.`,
      'Keep each slide to a few short bullets, and put what the speaker says in the notes.',
      `If the user handed anything over in "${files.materials}", read it first (mcp__nook-office__read_document reads Word, Excel and PowerPoint files) and build on it.`,
      'Never invent figures, quotations or dates. Where one is missing, leave a clear blank in square brackets.',
    ],
  },
  {
    id: 'chart', shop: 'studio', icon: 15, revise: true, main: 'picture',
    steps: ({ language, files }) => [
      'This is a chart, drawn as a picture.',
      `Read the data first: what the user wrote in the request, or the table they handed over in "${files.materials}" (mcp__nook-office__read_document reads Excel files; read a CSV as text).`,
      `Draw it as a single self-contained page "${files.chartPage}" holding one inline SVG: no scripts from the web, no web fonts, nothing the page loads from outside this folder.`,
      'Pick the kind of chart that fits the data: bars to compare amounts, a line for change over time, a share of a whole only when the parts really add up to it.',
      'Copy every number exactly as they are in the data. Never make up a number, round one off differently or fill in a missing one; leave a gap and say so.',
      'Axes of amounts start at zero. Give the chart a title, name each axis with its units, label the values, and put where the data came from in small print at the bottom.',
      `Write every word on it in ${language}.`,
      `Then save it as "${files.chartPng}" with the mcp__nook-office__render_png tool, at 1200 by 800 unless the user asked for another size, with the page laid out to fill exactly that.`,
      'When it is saved, look at it with the Read tool: check nothing is cut off or overlapping and every number matches the data, and fix the page and draw it again if not.',
    ],
  },
  {
    id: 'poster', shop: 'studio', icon: 16, revise: true, main: 'picture',
    steps: ({ language, files }) => [
      'This is a poster, drawn as a picture.',
      'Pick its size from what it is for: A4 for printing, 794 by 1123; a square for a social post, 1080 by 1080; a wide one for a screen, 1920 by 1080. A4 if the request does not say.',
      `Lay it out as a single self-contained page "${files.posterPage}" exactly that size: CSS inline, no web fonts, nothing the page loads from outside this folder. Use photos the user handed over in "${files.materials}" by relative path; do not copy or change them.`,
      'Make the main message the biggest thing on it, then what, when and where. Keep the words few.',
      'Never make up a date, a time, a place, a price or a name. Where one is missing, leave a clear blank in square brackets.',
      `Write every word on it in ${language}.`,
      `Then save it as "${files.posterPng}" with the mcp__nook-office__render_png tool at that size. For an A4 poster, also save it as "${files.posterPdf}" with the mcp__nook-office__make_pdf tool, so it can be printed.`,
      'When it is saved, look at it with the Read tool: check nothing is cut off, overlapping or too small to read, and fix the page and draw it again if not.',
    ],
  },
  // The bakery's two kinds (plan-1.6.md F1). A menu is drawn like a poster, and every dish and price on it is the user's own.
  {
    id: 'menu', shop: 'bakery', icon: 17, revise: true, main: 'picture', growth: { id: 'chalkboard', at: 1 }, guest: 'cook',
    steps: ({ language, files }) => [
      'This is a menu or a price list, drawn as a picture.',
      `Read the dishes and prices first: what the user wrote in the request, or what they handed over in "${files.materials}" (an old menu as a photo or a PDF, which the Read tool reads; a table, which mcp__nook-office__read_document reads).`,
      'Pick its size from what it is for: A4 to print or lay on the table, 794 by 1123; a square for a social post, 1080 by 1080; a wide one for a screen in the shop, 1920 by 1080. A4 if the request does not say.',
      `Lay it out as a single self-contained page "${files.menuPage}" exactly that size: CSS inline, no web fonts, nothing the page loads from outside this folder.`,
      'Put the name of the place at the top, then the dishes in groups under short headings (what to start with, mains, sweets, drinks, or the groups the user gave), each dish on its own line with its price lined up on the right.',
      'Copy every dish and every price exactly as the user gave them, in their currency. Never make up a dish, a price, an opening time or what is in a dish. Where a price is missing, leave a clear blank in square brackets.',
      'If the user marks dishes as spicy, meatless or holding something people are allergic to, show it with a small mark next to the dish and say what each mark means at the bottom. Add no mark they did not give.',
      `Write every word on it in ${language}.`,
      `Then save it as "${files.menuPng}" with the mcp__nook-office__render_png tool at that size, and as "${files.menuPdf}" with the mcp__nook-office__make_pdf tool, so it can be printed.`,
      'When it is saved, look at it with the Read tool: check nothing is cut off, overlapping or too small to read and every price matches what the user gave, and fix the page and draw it again if not.',
    ],
  },
  {
    id: 'recipe', shop: 'bakery', icon: 18, revise: true, main: 'office', growth: { id: 'cookbook', at: 2 }, guest: 'lodger',
    steps: ({ language, files }) => [
      'This is a recipe someone will cook from, as a Word document: do not make a web page.',
      `Build it with the mcp__nook-office__make_docx tool as "${files.recipe}" in ${language}: give the tool the structure and it makes the file. Never write Office XML or a .docx by hand.`,
      'Open with the name of the dish and one line on what it is, then how many it feeds and how long it takes, the work and the cooking apart.',
      'Then what goes in, as a list, each with its amount and unit; then the steps, numbered, one thing to do in each, with the heat, the time and how to tell it is done (the colour, how it feels, how it smells).',
      'End with a short section on what to watch out for: where it goes wrong, what can be made ahead, how long it keeps and how.',
      'Use the amounts and the way of doing it the user gave. Where they gave no amounts, use everyday ones for a home kitchen and say near the top that they are a starting point to adjust to taste.',
      'Say plainly where meat, fish or eggs must be cooked through, and name what in it people are often allergic to (nuts, wheat, milk, eggs, shellfish and the like). Never claim it is good for health or for losing weight.',
      `If the user handed anything over in "${files.materials}" (a handwritten card as a photo, their own notes), read it first and keep their way of making it.`,
      `In your final reply, say in ${language}, in one line, how many it feeds and how long it takes.`,
    ],
  },
  // The post office's two kinds (plan-1.6.md F2). A card is drawn like the menu; a newsletter is a Word document with a PDF
  // beside it for the notice board, and every date and name in it is the user's own.
  {
    id: 'card', shop: 'post', icon: 19, revise: true, main: 'picture', growth: { id: 'cardline', at: 1 }, guest: 'florist',
    steps: ({ language, files }) => [
      'This is a greeting card for one person or one occasion, drawn as a picture.',
      'Read the request first: what the day is (a birthday, a wedding, a new baby, a thank-you, a holiday), who it is for and who it is from, and the words the user wants on it.',
      'Pick its size from how it will be sent: a postcard to print, 1748 by 1240 (A6 lying down); a square to send on the phone, 1080 by 1080. The postcard if the request does not say.',
      `Lay it out as a single self-contained page "${files.cardPage}" exactly that size: CSS inline, no web fonts, nothing the page loads from outside this folder. Use a photo the user handed over in "${files.materials}" by relative path; do not copy or change it.`,
      'Give it one clear greeting as the biggest thing on it, the user\'s own words under it, and who it is from at the bottom. Draw the decoration with CSS shapes and colours that suit the day; keep it calm and let the words breathe.',
      'Use the words the user gave, as they gave them. Where they gave none, write one or two plain warm lines for the day, no longer than a short sentence each. Never make up a name, an age, a date or a shared memory.',
      `Write every word on it in ${language}.`,
      `Then save it as "${files.cardPng}" with the mcp__nook-office__render_png tool at that size, and as "${files.cardPdf}" with the mcp__nook-office__make_pdf tool, so it can be printed.`,
      'When it is saved, look at it with the Read tool: check nothing is cut off, overlapping or too small to read and every name is spelled as the user gave it, and fix the page and draw it again if not.',
    ],
  },
  {
    id: 'newsletter', shop: 'post', icon: 20, revise: true, main: 'office', growth: { id: 'newsletters', at: 2 }, guest: 'organizer',
    steps: ({ language, files }) => [
      'This is a short newsletter for a building, a club, a class or a street: one issue, as a Word document with a PDF to pin up.',
      `Read what this issue covers first: what the user wrote in the request, or what they handed over in "${files.materials}" (notes, a list of dates, photos; the Read tool reads pictures and PDFs, and mcp__nook-office__read_document reads Word and Excel files).`,
      `Build it with the mcp__nook-office__make_docx tool as "${files.newsletter}" in ${language}: give the tool the structure and it makes the file. Never write Office XML or a .docx by hand.`,
      'Open with the name of the newsletter and the issue (the month, or the number the user gave), then each piece of news under its own short heading, the most important first, a few sentences each.',
      'Put every date, time and place in a short list of what is coming up at the end, so it can be read at a glance. Add a line on who to ask, only if the user gave one.',
      'Write only what the user gave. Never make up an event, a date, a time, a place, a name or a number. Where one is missing, leave a clear blank in square brackets.',
      `Then lay the same issue out as a single self-contained page "${files.newsletterPage}" for A4, CSS inline, no web fonts, nothing the page loads from outside this folder, and save it as "${files.newsletterPdf}" with the mcp__nook-office__make_pdf tool, for the notice board.`,
      `In your final reply, say in ${language}, in one line, which issue it is and how many pieces of news are in it.`,
    ],
  },
  // Revision cards (plan-1.8.md H1): a set of cards to print and cut apart, and a one-page quiz with its answers on the
  // back, both made from what the user is studying and from nothing else.
  {
    id: 'flashcards', shop: 'home', icon: 21, revise: true, main: 'cards', growth: { id: 'cardstack', at: 1 }, guest: 'pupil',
    steps: ({ language, files }) => [
      'These are revision cards and a short quiz for someone getting ready for a test, made to be printed.',
      `Read the material first: what the user handed over in "${files.materials}" (handouts, notes, a chapter; the Read tool reads text, pictures and PDFs, and mcp__nook-office__read_document reads Word, Excel and PowerPoint files), or the text in the request. If there is nothing to work from, ask for it in your reply instead of making cards from memory.`,
      'Every question and every answer must come from that material. Never add a fact it does not hold, and never correct it from memory; if something in it looks wrong, keep it as it is and say so in your reply.',
      'Pick what is worth remembering: terms and what they mean, names, dates, causes and what they led to, steps in order. One card for each, from 12 to 40 cards, fewer for a short text. A question asks one thing; its answer is a few words or one short sentence.',
      'Write them in the language of the material, unless the request asks for another.',
      `Lay the cards out as a single self-contained page "${files.flashcardsPage}" for A4: CSS inline, no web fonts, nothing the page loads from outside this folder. Eight cards to a sheet, two across and four down, each the same size with a dashed border to cut along and its number in a corner.`,
      'Follow each sheet of questions with a sheet of their answers, the two columns swapped, so that printed on both sides and flipped on the long edge every answer lands on the back of its question. Never let a card break across two pages.',
      `Save it as "${files.flashcardsPdf}" with the mcp__nook-office__make_pdf tool.`,
      `Then the quiz: ten questions on what matters most in the material, mixing a few kinds (one of four, true or false, fill in the blank, a short answer), as a page "${files.quizPage}" for A4 with the same rules. The first page holds the ten questions with room to write; the second holds the answers, numbered, each with one line on where in the material it comes from, so it prints on the back.`,
      `Save it as "${files.quizPdf}" with the mcp__nook-office__make_pdf tool.`,
      'When both are saved, look at them with the Read tool: check no card is cut off, every answer sits behind its question and the quiz fits on two pages, and fix the pages and save them again if not.',
      `In your final reply, say in ${language}, in one line, how many cards there are and what the quiz covers.`,
    ],
  },
  // A family ledger (plan-1.8.md H5): an Excel workbook a household keeps its accounts in, a sheet a month, made in the
  // print shop. Its piece, a ledger on the counter, stands in the print shop rather than at home.
  {
    id: 'ledgerbook', shop: 'print', icon: 22, revise: true, main: 'office', roomGrowth: { id: 'ledgerbook', at: 1 }, guest: 'bookkeeper',
    steps: ({ language, files }) => [
      'This is a family ledger: an Excel workbook a household keeps its accounts in, filled in by hand through the year. Do not make a web page.',
      `Build it with the mcp__nook-office__make_xlsx tool as "${files.ledgerbook}": give the tool the structure (sheets, columns, rows, lists and charts) and it makes the file. Never write Office XML or an .xlsx by hand, and do not make a CSV.`,
      'Make one sheet for each month, named after it, for twelve months from the month the request names (January if it names none); then a sheet for the whole year; then a categories sheet. Write the first month out in full and each later one in a single line like it, {name, like: the first month\'s name}, so the whole book goes in one call.',
      'The categories sheet lists the categories of money in and money out, one to a row with whether each is in or out, and rows left free below for more: the user changes them there, never in the month sheets. Take them from the request, or pick a few everyday ones for a household.',
      'Each month sheet has a row for each entry: the date, what it was, its category, money in, money out and a note, with the header kept in view (freezeHeader). The category column offers a drop-down list of the names on the categories sheet (the column\'s list).',
      'Beside the entries stands a summary that works itself out as the month fills in: money in, money out and what is left, then the spending by category. Each category\'s line takes its name from the categories sheet by formula and its amount is a SUMIF over the month, so a category renamed or added turns up by itself; with IF, a line for an empty slot stays empty instead of showing 0. Every SUM and SUMIF over the entries reaches to row 500, as far down as the drop-down list does, so a busy month never runs past them.',
      'Draw a pie chart of the spending by category on each month sheet, next to its summary. The year sheet takes each month\'s totals by formula, adds up the year, and has a column chart of the spending month by month.',
      'Formulas use only this workbook. Give each column its format: date, money or text. A cell left empty is null.',
      'Leave every entry row empty: the empty book is the finished piece, ready to fill in. Put in no example entries unless the request gives real ones.',
      `Write every sheet name, header, label and category in ${language}.`,
      'When it is saved, read it back with mcp__nook-office__read_document and check that each summary formula points at the right cells and that each chart and drop-down list draws from the right range, and make it again if not.',
      `In your final reply, say in ${language}, in one line, which months it covers and which categories it starts with.`,
    ],
  },
] as const satisfies readonly TemplateSpec[];

export type TemplateId = (typeof TEMPLATES)[number]['id'];
/** The id of a growth piece some kind of work brings. */
export type BroughtId = Extract<(typeof TEMPLATES)[number], { growth: object }>['growth']['id'];
/** The id of a piece some kind of work brings into a shop along the street (plan-1.8.md H5). */
export type BroughtRoomId = Extract<(typeof TEMPLATES)[number], { roomGrowth: object }>['roomGrowth']['id'];

export const template = (id: TemplateId): TemplateSpec => TEMPLATES.find((t) => t.id === id)!;
/**
 * The kinds of work a browser on the home network may hand in (docs/plan-1.5.md E5): none that starts from a file or a
 * folder or from photos picked on this computer, which a page elsewhere cannot reach.
 */
export const FROM_AFAR: readonly TemplateId[] = TEMPLATES.filter((t) => !('source' in t) && !('photos' in t)).map((t) => t.id);
/** Which shop does a kind of work (road-to-1.4.md D3); work of no kind, and the demo, stays in the home shop. */
export const shopOf = (id: TemplateId | undefined): Shop => (id ? template(id).shop : 'home');
