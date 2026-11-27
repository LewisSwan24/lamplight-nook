import zhStories from '../../../lines/stories.yaml?raw';
import enStories from '../../../lines/en/stories.yaml?raw';
import zhStaff from '../../../lines/staff-stories.yaml?raw';
import enStaff from '../../../lines/en/staff-stories.yaml?raw';
import keepsakesUrl from '../../../assets/sprites/keepsakes.png';
import { fill, locale, strings } from '../../shared/i18n';
import { KEEPSAKES, KEEPSAKE_SIZE, STAFF_TELLERS, keepsakeOf, type StaffStories, type StaffTeller } from '../../shared/staffstories';
import { TELLERS, type Stories, type Teller } from '../../shared/stories';
import { parseStories, type StoryBook } from '../translator/lines';
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

function body(title: string, lines: string[], note: string, kept?: string): HTMLElement[] {
  return [closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, title),
      ...lines.map((line) => el('p.story-line', {}, `“${line}”`)),
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
export function storiesPage(told: { stories: Stories; staff?: StaffStories }): HTMLElement {
  const N = strings.ui.notebook;
  const teller = (name: string, chapters: StoryBook[string], said: number, kept?: (n: number) => string) =>
    el('div.notebook-story-teller', {}, el('b', {}, name),
      ...chapters.map((c, i) => i < said
        ? el('details.notebook-story', {}, el('summary', {}, kept ? keepsake(kept(i + 1), 1) : null, fill(N.storyChapter, { n: i + 1, title: c.title })),
          ...c.lines.map((line) => el('p.story-line', {}, `“${line}”`)), el('p.story-left', {}, c.note))
        : el('div.notebook-story-blank', {}, fill(N.storyBlank, { n: i + 1 }))));
  return el('section.notebook-stories', {}, el('h4', {}, N.storiesTitle), el('div', {}, N.storiesText),
    ...TELLERS.map((t) => teller(strings.guests[t], stories()[t], told.stories[t]?.length ?? 0)),
    ...STAFF_TELLERS.map((t) => teller(strings.actors[t], staffStories()[t], told.staff?.[t]?.length ?? 0, (n) => keepsakeOf(t, n))));
}
