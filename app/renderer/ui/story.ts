import zhStories from '../../../lines/stories.yaml?raw';
import enStories from '../../../lines/en/stories.yaml?raw';
import zhStaff from '../../../lines/staff-stories.yaml?raw';
import zhYear from '../../../lines/year.yaml?raw';
import enYear from '../../../lines/en/year.yaml?raw';
import enStaff from '../../../lines/en/staff-stories.yaml?raw';
import keepsakesUrl from '../../../assets/sprites/keepsakes.png';
import { fill, locale, strings } from '../../shared/i18n';
import { KEEPSAKES, KEEPSAKE_SIZE, STAFF_TELLERS, keepsakeOf, type StaffStories, type StaffTeller } from '../../shared/staffstories';
import { TELLERS, type Stories, type Teller } from '../../shared/stories';
import type { YearDays } from '../../shared/mainstory';
import type { GuestId } from '../../shared/types';
import { parseStories, parseYear, type StoryBook, type YearChapter } from '../translator/lines';
import { GUEST_IDS } from '../game/guests';
import { el } from './dom';
import { closePanel, closeButton, replaceOpen } from './panels';

/**
 * A neighbour telling a chapter of their story on the street (road-to-1.4.md D4), or a member of staff telling one of
 * theirs in their shop (plan-1.9.md I1): a paper card with who it is, the chapter and its title, what they say a bubble
 * a line, and what they left, the staff's keepsake drawn beside it. Closing it, however, is having heard it.
 */
let book: StoryBook | null = null;
let staffBook: StoryBook | null = null;
const stories = () => (book ??= parseStories(locale() === 'en' ? enStories : zhStories));
const staffStories = () => (staffBook ??= parseStories(locale() === 'en' ? enStaff : zhStaff));
let yearBook: YearChapter[] | null = null;
const yearChapters = () => (yearBook ??= parseYear(locale() === 'en' ? enYear : zhYear));
/** Who says a line of the year: a neighbour or one of the staff, by name. */
const nameOf = (who: string) => (GUEST_IDS.includes(who as GuestId) ? strings.guests[who as GuestId] : strings.actors[who as keyof typeof strings.actors]);
const yearLines = (c: YearChapter) => c.lines.map((l) => el('p.story-line.year-line', { 'data-who': l.who }, fill(strings.ui.stories.line, { who: nameOf(l.who), text: l.text })));

/** A keepsake from keepsakes.png, drawn at `scale` times its size. */
export function keepsake(id: string, scale = 3): HTMLElement {
  const size = KEEPSAKE_SIZE * scale;
  return el('span.keepsake', {
    'data-keepsake': id,
    style: `background-image:url(${keepsakesUrl});background-size:${KEEPSAKES.length * size}px ${size}px;background-position:-${KEEPSAKES.indexOf(id) * size}px 0;width:${size}px;height:${size}px`,
  });
}

export function showStory(who: Teller, chapter: number, heard: () => void) {
  const c = stories()[who][chapter - 1];
  open(el('div.card.paper.story-card', { 'data-teller': who, 'data-chapter': String(chapter) },
    ...body(fill(strings.ui.stories.title, { who: strings.guests[who], n: chapter, title: c.title }), c.lines, c.note)), heard);
}

export function showStaffStory(who: StaffTeller, chapter: number, heard: () => void) {
  const c = staffStories()[who][chapter - 1];
  open(el('div.card.paper.story-card.staff-story', { 'data-staff': who, 'data-chapter': String(chapter) },
    ...body(fill(strings.ui.stories.title, { who: strings.actors[who], n: chapter, title: c.title }), c.lines, c.note, keepsakeOf(who, chapter))), heard);
}

/**
 * A chapter of the year's story (plan-2.0.md J7): the same paper card, every line with who says it, and the note of
 * what changed in the town. Closing it is having heard it.
 */
export function showYearChapter(chapter: number, heard: () => void) {
  const c = yearChapters()[chapter - 1];
  open(el('div.card.paper.story-card.year-card', { 'data-year': String(chapter) }, ...body(fill(strings.ui.stories.year, { n: chapter, title: c.title }), yearLines(c), c.note)), heard);
}

/** What the teller says coming into the shop with the chapter: its first line. */
export const yearOpening = (chapter: number): string => yearChapters()[chapter - 1].lines[0].text;

/** A chapter already told, as the town's record unfolds it (plan-2.0.md J8): its title, what was said, what changed. */
export function toldChapter(part: 'year' | 'stories' | 'staff', who: string, n: number): { title: string; lines: HTMLElement[] } {
  if (part === 'year') {
    const c = yearChapters()[n - 1];
    return { title: c.title, lines: [...yearLines(c), el('p.story-left', {}, c.note)] };
  }
  const c = (part === 'stories' ? stories() : staffStories())[who][n - 1];
  const kept = part === 'staff' ? keepsake(keepsakeOf(who as StaffTeller, n), 2) : null;
  return { title: c.title, lines: [...c.lines.map((line) => el('p.story-line', {}, `“${line}”`)), el('p.story-left', {}, kept, c.note)] };
}

function body(title: string, lines: string[] | HTMLElement[], note: string, kept?: string): HTMLElement[] {
  return [closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, title),
      ...lines.map((line) => (typeof line === 'string' ? el('p.story-line', {}, `“${line}”`) : line)),
      el('p.story-left', {}, kept ? keepsake(kept, 2) : null, note),
      el('div.story-buttons', {}, el('button.primary', { type: 'button', onclick: () => closePanel() }, strings.ui.stories.heard)))];
}

function open(card: HTMLElement, heard: () => void) {
  card.addEventListener('panel-closed', heard, { once: true });
  replaceOpen(card);
}

/**
 * The notebook's stories page (plan-1.9.md I1): every chapter told so far, the neighbours' and the staff's, to read
 * again. One not told yet is only a blank, its title kept back.
 */
export function storiesPage(told: { stories: Stories; staff?: StaffStories; year?: YearDays }): HTMLElement {
  const N = strings.ui.notebook;
  const teller = (name: string, chapters: StoryBook[string], said: number, kept?: (n: number) => string) =>
    el('div.notebook-story-teller', {}, el('b', {}, name),
      ...chapters.map((c, i) => i < said
        ? el('details.notebook-story', {}, el('summary', {}, kept ? keepsake(kept(i + 1), 1) : null, fill(N.storyChapter, { n: i + 1, title: c.title })),
          ...c.lines.map((line) => el('p.story-line', {}, `“${line}”`)), el('p.story-left', {}, c.note))
        : el('div.notebook-story-blank', {}, fill(N.storyBlank, { n: i + 1 }))));
  const said = told.year?.length ?? 0;
  const year = el('div.notebook-story-teller.notebook-year', {}, el('b', {}, N.yearTitle), el('div', {}, N.yearText),
    ...yearChapters().map((c, i) => i < said
      ? el('details.notebook-story', {}, el('summary', {}, fill(N.storyChapter, { n: i + 1, title: c.title })), ...yearLines(c), el('p.story-left', {}, c.note))
      : el('div.notebook-story-blank', {}, fill(N.storyBlank, { n: i + 1 }))));
  return el('section.notebook-stories', {}, el('h4', {}, N.storiesTitle), el('div', {}, N.storiesText), year,
    ...TELLERS.map((t) => teller(strings.guests[t], stories()[t], told.stories[t]?.length ?? 0)),
    ...STAFF_TELLERS.map((t) => teller(strings.actors[t], staffStories()[t], told.staff?.[t]?.length ?? 0, (n) => keepsakeOf(t, n))));
}
