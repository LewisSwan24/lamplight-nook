import { fill, strings } from '../../shared/i18n';
import type { ConnectionOffer, ConnectionsView, Grant, LamplightApi } from '../../shared/types';
import { el } from './dom';
import { closeButton, closePanel, replaceOpen } from './panels';
import { withPortrait } from './portraits';

const K = strings.ui.connections;

type ConnectionApi = Pick<LamplightApi, 'connections' | 'addConnection' | 'pauseConnection' | 'removeConnection'>;

/** A connection's authorisation in three parts and how to end it (road-to-1.3.md C4), on its card and on the connections page. */
export function grantParts(g: Grant): HTMLElement {
  const list = (title: string, items: (string | Node)[]) => (items.length ? el('div.grant-part', {}, el('b', {}, title), el('ul', {}, ...items.map((i) => el('li', {}, i)))) : null);
  return el('div.grant', {},
    list(K.reads, g.reads),
    list(K.does, g.does.map((d) => fill(K.doesLine, { what: d.what, undo: d.undo === 'yes' ? K.undoYes : K.undoNo }))),
    list(K.never, g.never),
    el('div.grant-part', {}, el('b', {}, K.howDisconnect), el('div', {}, g.disconnect)));
}

/**
 * The authorisation card, shown before a connection is made: "Connect" or "Not now", and not now is what Enter and Esc do.
 * Resolves true only for "Connect".
 */
export function showGrant(offer: ConnectionOffer): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (yes: boolean) => {
      answered = true;
      resolve(yes);
      closePanel();
    };
    const card = el('div.card.paper.grant-card', { role: 'dialog', 'aria-label': fill(K.grantTitle, { label: offer.label }) },
      closeButton(),
      // The title stays put and only the parts scroll, so the scroll bar starts below the close button.
      withPortrait('adeng', 'calm', el('div.card-title', {}, fill(K.grantTitle, { label: offer.label }))),
      el('div.card-scroll', {}, grantParts(offer.grant)),
      el('div.actions', {},
        el('button.grant-connect', { type: 'button', onclick: () => answer(true) }, K.connect),
        el('button.default.grant-not-now', { type: 'button', onclick: () => answer(false) }, K.notNow)));
    card.addEventListener('panel-closed', () => { if (!answered) resolve(false); });
    replaceOpen(card);
    card.querySelector<HTMLButtonElement>('button.default')?.focus();
  });
}

/**
 * The notebook's connections page: a card for each connection (what it may do, when it was last used, pause and
 * disconnect), and a button for each kind that can be added. `reopen` brings the notebook back at this page.
 */
export function connectionsPage(api: ConnectionApi, view: ConnectionsView, reopen: () => Promise<void>): HTMLElement | null {
  if (!view.list.length && !view.offers.length) return null;
  const note = el('div.hint.connection-note', { role: 'status' });
  const cards = view.list.map((c) => {
    const actions = el('div.connection-actions');
    const status = el('span.connection-status', {}, c.paused ? K.paused : '');
    const ask = () => actions.replaceChildren(
      el('button.link.connection-pause', { type: 'button', onclick: async () => {
        const on = !c.paused;
        if (!(await api.pauseConnection(c.id, on))) return;
        c.paused = on;
        status.textContent = on ? K.paused : '';
        ask();
      } }, c.paused ? K.resume : K.pause),
      el('button.link.connection-disconnect', { type: 'button', onclick: confirm }, K.disconnect));
    const confirm = () => {
      actions.replaceChildren(
        el('div.notebook-warn', {}, fill(K.disconnectAsk, { label: c.label }), ' ', c.grant.disconnect),
        el('button.connection-disconnect-yes', { type: 'button', onclick: async () => {
          if (await api.removeConnection(c.id)) await reopen();
        } }, K.disconnectYes),
        el('button.default.connection-keep', { type: 'button', onclick: ask }, K.keep));
      actions.querySelector<HTMLButtonElement>('button.default')?.focus();
    };
    ask();
    return el('li.connection', { 'data-id': c.id },
      el('div', {}, el('b', {}, c.label), ' ', status),
      el('div.notebook-choice', {}, fill(K.added, { date: c.added }), ' · ', c.lastUsed ? fill(K.lastUsed, { date: c.lastUsed }) : K.neverUsed),
      el('details.connection-grant', {}, el('summary', {}, K.grantShow), grantParts(c.grant)),
      actions);
  });
  const offers = view.offers.map((o) => el('button.link.connection-add', { type: 'button', 'data-kind': o.kind, onclick: async () => {
    if (!(await showGrant(o))) return reopen();
    const made = await api.addConnection(o.kind);
    await reopen();
    if (!made) document.querySelector('.notebook .connection-note')?.replaceChildren(K.storage);
  } }, fill(K.add, { label: o.label })));
  return el('section.notebook-connections', {}, el('h4', {}, K.title),
    el('div.notebook-choice', {}, K.intro),
    view.list.length ? el('ul.connection-list', {}, ...cards) : el('div.notebook-choice', {}, K.none),
    el('div.connection-offers', {}, ...offers),
    note);
}
