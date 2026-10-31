import { fill, strings } from '../../shared/i18n';
import { DEFAULT_AVATAR } from '../../shared/avatars';
import { el } from './dom';
import { closePanel, replaceOpen } from './panels';
import { withPortrait, youPortraitEl } from './portraits';

const V = strings.ui.revise;

/**
 * "Change it a bit": Adeng asks what isn't right, the user says it in their own words. Resolves with
 * what to change, or null if they leave it. `title` names an older commission picked from the notebook.
 */
export function showRevise(look = DEFAULT_AVATAR, title?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const ask = el('textarea', { rows: 3, maxlength: 2000, placeholder: V.placeholder, 'aria-label': V.text }) as HTMLTextAreaElement;
    const done = (text: string | null) => { resolve(text); closePanel(); };
    const card = el('form.card.paper.meeting.revise', {},
      withPortrait('adeng', 'calm',
        el('div.card-title', {}, title ? `${V.title} · ${fill(V.oldFolder, { title })}` : V.title),
        el('div', {}, V.text)),
      el('div.speaker.you-says', {}, youPortraitEl(look), ask),
      el('div.hint.revise-keep', {}, V.keep),
      el('div.actions', {},
        el('button', { type: 'button', onclick: () => done(null) }, V.never),
        el('button.default', { type: 'submit' }, V.send)),
    );
    card.addEventListener('panel-closed', () => resolve(null));
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = ask.value.trim();
      if (text) done(text);
    });
    replaceOpen(card);
    ask.focus();
  });
}
