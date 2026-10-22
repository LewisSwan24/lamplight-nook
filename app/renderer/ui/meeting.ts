import { strings } from '../../shared/i18n';
import { el } from './dom';
import { closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const M = strings.ui.meeting;

/** The meeting card at the big table: what the user wants to add or change. Resolves with it, or null. */
export function showMeeting(): Promise<string | null> {
  return new Promise((resolve) => {
    const note = el('textarea', { rows: 3, maxlength: 500, placeholder: M.placeholder, 'aria-label': M.text }) as HTMLTextAreaElement;
    const done = (text: string | null) => { resolve(text); closePanel(); };
    const card = el('form.card.paper.meeting', {},
      withPortrait('adeng', 'calm', el('div.card-title', {}, M.title), el('div', {}, M.text)),
      note,
      el('div.actions', {},
        el('button', { type: 'button', onclick: () => done(null) }, M.never),
        el('button.default', { type: 'submit' }, M.send)),
    );
    card.addEventListener('panel-closed', () => resolve(null));
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = note.value.trim();
      if (text) done(text);
    });
    replaceOpen(card);
    note.focus();
  });
}
