import zhStories from '../../../lines/stories.yaml?raw';
import enStories from '../../../lines/en/stories.yaml?raw';
import { fill, locale, strings } from '../../shared/i18n';
import type { Teller } from '../../shared/stories';
import { parseStories, type StoryBook } from '../translator/lines';
import { el } from './dom';
import { closePanel, closeButton, replaceOpen } from './panels';

/**
 * A neighbour telling a chapter of their story on the street (road-to-1.4.md D4): a paper card with who it is, the
 * chapter and its title, what they say a bubble a line, and what they left. Closing it, however, is having heard it.
 */
let book: StoryBook | null = null;
const stories = () => (book ??= parseStories(locale() === 'en' ? enStories : zhStories));

export function showStory(who: Teller, chapter: number, heard: () => void) {
  const c = stories()[who][chapter - 1];
  const S = strings.ui.stories;
  const card = el('div.card.paper.story-card', { 'data-teller': who, 'data-chapter': String(chapter) },
    closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, fill(S.title, { who: strings.guests[who], n: chapter, title: c.title })),
      ...c.lines.map((line) => el('p.story-line', {}, `“${line}”`)),
      el('p.story-left', {}, c.note),
      el('div.story-buttons', {}, el('button.primary', { type: 'button', onclick: () => closePanel() }, S.heard))),
  );
  card.addEventListener('panel-closed', heard, { once: true });
  replaceOpen(card);
}
