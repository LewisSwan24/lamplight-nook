import { fill, locale, strings } from '../../shared/i18n';
import type { ActionRecord, ConnectionOffer, ConnectionsView, Grant, LamplightApi, SetupError } from '../../shared/types';
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

/** What a kind's card asks for besides "Connect" (C5), in the user's words. */
const kindWords = (kind: string) => (K.kinds as Record<string, { pickHint?: string; addressLabel?: string; addressPlaceholder?: string; addressWarn?: string }>)[kind] ?? {};

/**
 * The authorisation card, shown before a connection is made: "Connect" or "Not now", and not now is what Enter and Esc do.
 * Resolves with what the card asked for (C5: a calendar's address, typed here) for "Connect", null otherwise.
 */
export function showGrant(offer: ConnectionOffer): Promise<{ address?: string } | null> {
  return new Promise((resolve) => {
    let answered = false;
    const W = kindWords(offer.kind);
    const note = el('div.hint.grant-note', { role: 'status' });
    // The address is a secret: a password box, so it is not on screen for anyone looking over a shoulder.
    const address = offer.asks === 'address'
      ? el('input.grant-address', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: W.addressPlaceholder ?? '', 'aria-label': W.addressLabel ?? '' }) as HTMLInputElement
      : null;
    const answer = (yes: boolean) => {
      if (yes && address && !address.value.trim()) {
        note.textContent = K.addressEmpty;
        address.focus();
        return;
      }
      answered = true;
      resolve(yes ? (address ? { address: address.value } : {}) : null);
      closePanel();
    };
    const card = el('div.card.paper.grant-card', { role: 'dialog', 'aria-label': fill(K.grantTitle, { label: offer.label }) },
      closeButton(),
      // The title stays put and only the parts scroll, so the scroll bar starts below the close button.
      withPortrait('adeng', 'calm', el('div.card-title', {}, fill(K.grantTitle, { label: offer.label }))),
      el('div.card-scroll', {}, grantParts(offer.grant),
        offer.asks === 'folder' && W.pickHint ? el('div.hint.grant-ask', {}, W.pickHint) : null,
        address ? el('label.grant-ask', {}, el('b', {}, W.addressLabel ?? ''), address, el('div.hint', {}, W.addressWarn ?? '')) : null,
        note),
      el('div.actions', {},
        el('button.grant-connect', { type: 'button', onclick: () => answer(true) }, K.connect),
        el('button.default.grant-not-now', { type: 'button', onclick: () => answer(false) }, K.notNow)));
    card.addEventListener('panel-closed', () => { if (!answered) resolve(null); });
    replaceOpen(card);
    (address ?? card.querySelector<HTMLButtonElement>('button.default'))?.focus();
  });
}

/** Why a connection was not made, in the user's words; nothing when they closed the folder dialog themselves. */
const setupWhy = (why: SetupError) => (why === 'cancelled' ? '' : why === 'broad' ? K.broad : why === 'address' ? K.address : K.storage);

/**
 * The notebook's connections page: a card for each connection (what it may do, when it was last used, pause and
 * disconnect), and a button for each kind that can be added. `reopen` brings the notebook back at this page.
 */
export function connectionsPage(api: ConnectionApi, view: ConnectionsView, reopen: () => Promise<void>, records: ActionRecord[] = []): HTMLElement | null {
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
      recentActions(records, c.id),
      actions);
  });
  const offers = view.offers.map((o) => el('button.link.connection-add', { type: 'button', 'data-kind': o.kind, onclick: async () => {
    const input = await showGrant(o);
    if (!input) return reopen();
    const made = await api.addConnection(o.kind, input);
    await reopen();
    const why = !made ? K.storage : 'error' in made ? setupWhy(made.error) : '';
    if (why) document.querySelector('.notebook .connection-note')?.replaceChildren(why);
  } }, fill(K.add, { label: o.label })));
  return el('section.notebook-connections', {}, el('h4', {}, K.title),
    el('div.notebook-choice', {}, K.intro),
    view.allPaused ? el('div.notebook-warn.connections-all-paused', {}, K.allPaused) : null,
    view.list.length ? el('ul.connection-list', {}, ...cards) : el('div.notebook-choice', {}, K.none),
    el('div.connection-offers', {}, ...offers),
    note);
}

const A = strings.ui.actions;
/** How many lines the outside actions page shows at first, and adds with each "Earlier". */
const ACTIONS_PAGE = 30;

const day = (t: string) => new Date(t).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });
const clock = (t: string) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false });

/** What became of an action, in a few words. */
function outcome(r: ActionRecord): string {
  if (r.error === 'paused') return A.paused;
  if (r.decision === 'denied') return A.denied;
  if (!r.ok) return A.failed;
  return r.decision === 'given' ? A.given : A.allowed;
}

/** A connection's last few actions, on its card (C6). */
export function recentActions(records: ActionRecord[], id: string, n = 5): HTMLElement | null {
  const mine = records.filter((r) => r.connection === id).slice(-n).reverse();
  return mine.length ? el('details.connection-recent', {}, el('summary', {}, K.recent),
    el('ul', {}, ...mine.map((r) => el('li', {}, `${day(r.t)} ${clock(r.t)} · ${r.said} · ${outcome(r)}`)))) : null;
}

/**
 * The notebook's outside actions page (road-to-1.3.md C6): every call of a connection's tool, newest first and by day,
 * filtered by connection, with "Undo" on an outside action that can still be undone. What was read or written is not
 * kept, so it is not here either. Null when there is nothing to show and no connection to make any.
 */
export function actionsPage(api: Pick<LamplightApi, 'actions' | 'undoAction'>, records: ActionRecord[], view: ConnectionsView): HTMLElement | null {
  if (!records.length && !view.list.length) return null;
  const names = new Map(view.list.map((c) => [c.id, c.label]));
  const used = [...new Set(records.map((r) => r.connection))];
  const nameOf = (id: string) => names.get(id) ?? A.gone;
  let only = '';
  let shown = ACTIONS_PAGE;
  const list = el('div.action-list');
  const note = el('div.hint.action-note', { role: 'status' });
  const row = (r: ActionRecord) => {
    const undo = r.kind === 'outside' && r.ok && r.undo?.path && !r.undo.done
      ? el('button.link.action-undo', { type: 'button', onclick: async () => {
        if (await api.undoAction(r.id)) {
          records = await api.actions();
          draw();
        } else note.replaceChildren(A.undoFailed);
      } }, A.undo)
      : null;
    return el('li.action', { 'data-id': r.id, 'data-kind': r.kind },
      el('span.action-time', {}, clock(r.t)), ' ',
      el('b', {}, nameOf(r.connection)), ' · ', r.said, ' · ', outcome(r),
      r.undo?.done ? el('span.action-undone', {}, ' · ', fill(A.undone, { time: `${day(r.undo.done)} ${clock(r.undo.done)}` })) : null,
      undo ? ' ' : null, undo);
  };
  const draw = () => {
    const mine = records.filter((r) => !only || r.connection === only).reverse();
    const days: HTMLElement[] = [];
    let last = '';
    let ul: HTMLElement | null = null;
    for (const r of mine.slice(0, shown)) {
      const d = day(r.t);
      if (d !== last || !ul) {
        last = d;
        ul = el('ul');
        days.push(el('div.action-day', {}, el('div.notebook-choice', {}, d), ul));
      }
      ul.append(row(r));
    }
    list.replaceChildren(...(days.length ? days : [el('div.notebook-choice', {}, A.none)]),
      ...(mine.length > shown ? [el('button.link.action-more', { type: 'button', onclick: () => { shown += ACTIONS_PAGE; draw(); } }, A.more)] : []));
  };
  const filter = used.length > 1
    ? (() => {
      const select = el('select.action-filter', { 'aria-label': A.filter },
        el('option', { value: '' }, A.all), ...used.map((id) => el('option', { value: id }, nameOf(id)))) as HTMLSelectElement;
      select.addEventListener('change', () => { only = select.value; shown = ACTIONS_PAGE; draw(); });
      return el('label.action-filter-row', {}, `${A.filter} `, select);
    })()
    : null;
  draw();
  return el('section.notebook-actions', {}, el('h4', {}, A.title),
    el('div.notebook-choice', {}, A.intro),
    filter, list, note);
}
