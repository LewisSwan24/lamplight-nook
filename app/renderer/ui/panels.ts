import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { type BoardStep, boardPair, boardWindow } from '../../shared/board';
import { withoutColourCodes, withoutPathFolders } from '../../shared/text';
import { CONSULT_CAP_USD, CONSULT_MESSAGES, type ActorId, type BudgetNote, type Citations, type CommissionForm, type CommissionResult, type CommissionTemplate, type ConsultBrief, type HandOver, type LamplightApi, type Material, type NotOpened } from '../../shared/types';
import { TEMPLATES, template as templateOf, type TemplateId, type TemplateLayout, type TemplateSpec } from '../../shared/templates';
import { ASKS, AUDIENCES, HANDIN_KINDS, handInForm, slipForm, type HandInPicks } from '../../shared/handin';
import { workIconEl } from './shelf';
import { isPicture } from '../../shared/pictures';
import { sfx } from '../audio/sound';
import { el, layer } from './dom';
import { expressionFor } from './expression';
import { withPortrait } from './portraits';
import { WARN_SHARE } from '../../main/budget';
import { DEFAULT_TIER, MODEL_TIERS, cleanTier, type ModelTier } from '../../shared/models';
import { suggestions } from './hints';

const U = strings.ui;

/** A cap a round took past eight tenths (B8), as Adeng puts it on the card that follows. */
export const budgetLine = (n: BudgetNote) => fill(n.cap === 'month' ? U.resultBudgetMonth : U.resultBudgetProject, { spent: formatUsd(n.spentUsd), cap: formatUsd(n.capUsd), left: formatUsd(n.leftUsd), project: n.project ?? '' });

/** What a character card shows. Everything here comes from real events. */
export type ActorInfo = {
  state: string;
  lastLine?: string;
  doing?: string;
  stats: { writes: number; runs: number; fails: number };
  raw: string[];
};

let open: HTMLElement | null = null;
/** Where keyboard focus was before the first card opened, to give it back on close. */
let returnFocus: HTMLElement | null = null;
/** Where keyboard focus lands on a new card, best first. The main button is last in its row, and Enter must be safe. */
const FOCUS_FIRST = ['textarea, input', 'button.default', 'button:not(.close)', 'button'];

/** A card that must be answered is up: nothing else opens until it has been. */
export const answerFirst = () => open?.classList.contains('must-answer') === true;

/** What a screen reader says when a card opens: a dialog, called by its title. Called again when a card changes page. */
export function nameCard(node: HTMLElement) {
  if (!node.hasAttribute('role')) node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  const title = node.querySelector('.card-title, .serious-title')?.textContent;
  if (title) node.setAttribute('aria-label', title);
}

export function replaceOpen(node: HTMLElement) {
  if (answerFirst()) return;
  nameCard(node);
  if (!open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open?.dispatchEvent(new Event('panel-closed'));
  open?.remove();
  open = node;
  layer().append(node);
  sfx('open');
  if (!node.contains(document.activeElement)) FOCUS_FIRST.map((s) => node.querySelector<HTMLElement>(s)).find(Boolean)?.focus();
}
export function closePanel() {
  if (!open) return;
  sfx('close');
  open.dispatchEvent(new Event('panel-closed'));
  open.remove();
  open = null;
  returnFocus?.focus();
  returnFocus = null;
}

/** The × at a card's top right. Cards that must be answered (the welcome, an unfinished commission, decisions) have none. */
export const closeButton = (onClose: (e: Event) => void = closePanel) =>
  el('button.close', { type: 'button', onclick: onClose, 'aria-label': U.closeLabel }, '\u00D7');

// Esc closes the open card, unless it must be answered (decision dialogs handle their own keys and always win).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open && !open.classList.contains('must-answer') && !document.querySelector('.backdrop')) {
    e.preventDefault();
    closePanel();
  }
});

// While a card is open, Tab goes round inside it: the shop behind cannot be used, so the focus does not go there. The
// browser moves the focus itself, because it also stops at text that scrolls; this only brings it back when it leaves.
const TAB_STOPS = 'button:not([disabled]), input:not([disabled]), textarea, select, a[href], summary, [tabindex="0"]';
let tabbing: 'on' | 'back' | null = null;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') tabbing = e.shiftKey ? 'back' : 'on';
});
document.addEventListener('pointerdown', () => { tabbing = null; });
document.addEventListener('focusin', (e) => {
  const card = document.querySelector('.legal-backdrop') ?? document.querySelector('.backdrop') ?? document.querySelector('.settings') ?? open;
  const to = e.target as HTMLElement;
  if (!tabbing || !card || card.contains(to)) return;
  const stops = Array.from(card.querySelectorAll<HTMLElement>(TAB_STOPS)).filter((s) => s.getClientRects().length > 0);
  stops[tabbing === 'back' ? stops.length - 1 : 0]?.focus();
});

/** Card shown when a character is clicked. */
/** Detailed mode opens the raw record straight away. */
export function showActorCard(actor: ActorId, info: ActorInfo, detailed = false) {
  const state = (strings.states as Record<string, string>)[info.state] ?? info.state;
  replaceOpen(el('div.card.paper.actor-card', {},
    closeButton(),
    el('div.card-scroll', {},
      withPortrait(actor, expressionFor(info.state),
        el('div.card-title', {}, `${strings.actors[actor]} - ${state}`),
        info.lastLine ? el('div.quote', {}, `\u201C${info.lastLine}\u201D`) : null),
      info.doing ? el('div', {}, el('b', {}, U.doingNow), info.doing) : null,
      info.stats.writes + info.stats.runs + info.stats.fails ? el('div', {}, el('b', {}, U.soFar), fill(U.statsLine, info.stats)) : null,
      info.raw.length ? el('details', { open: detailed }, el('summary', {}, U.raw), el('pre', {}, info.raw.slice(-30).join('\n'))) : null),
  ));
}

/** Drop Markdown markers the agents use in summaries (bold, headings, code ticks). */
const plainText = (s: string) => s.replace(/[*#`]+/g, '').replace(/\s+/g, ' ').trim();

/** A subagent's result handed over at the counter. */
export function showParcel(actor: ActorId, summary: string) {
  const parcel = el('div.parcel.paper', { tabindex: 0 },
    closeButton((e) => { e.stopPropagation(); parcel.remove(); }),
    el('div.card-title', {}, fill(U.parcelFrom, { who: strings.actors[actor] })),
    el('div.parcel-body', {}, withoutPathFolders(withoutColourCodes(plainText(summary)))),
  );
  parcel.addEventListener('click', () => parcel.classList.toggle('expanded'));
  document.querySelectorAll('.parcel').forEach((p) => p.remove());
  layer().append(parcel);
}

/** The commission form. Resolves with the form, or null if closed. */
const T = U.templates;
/**
 * The stickers on the form: the demo, then every template (shared/templates.ts), named and filled in
 * from the locale files by id.
 */
type Sticker = { id: CommissionTemplate | 'demo'; label: string; fill: string; spec?: TemplateSpec };
const STICKERS: Sticker[] = [
  { id: 'demo', label: T.demo, fill: U.demoFill },
  ...TEMPLATES.map((t) => ({ id: t.id, label: T[t.id], fill: T[`${t.id}Fill`], spec: t })),
];
/** What a template says about the file, folder or photos it needs (`ui.templates.<id>Hint`). */
const hintOf = (id: string) => (T as Record<string, string>)[`${id}Hint`];
/** The blank in a template sentence (a Chinese or an English ellipsis), selected so typing replaces it. */
const BLANK = /\u2026\u2026|\.\.\./;

/**
 * The commission form. A row of stickers fills in a ready-made kind of commission (the demo is picked to begin with);
 * editing a document or tidying a folder also asks which file or folder, through the main process's dialog.
 */
/** What the commission form needs from the main process. */
export type FormApi = Pick<LamplightApi, 'chooseSource' | 'chooseLent' | 'handOver' | 'pathsOf' | 'consult' | 'consultFinish' | 'connections'>;
const L = U.lent;
const C = U.consult;
/** How long Adeng's last word in a talk stays up before the slip comes back filled in. */
const LAST_WORD_MS = 1600;
/** How long the signature shows on the hand-in card before the commission goes in (plan-1.8.md H8). */
const SIGN_MS = 700;

/** Why something couldn't be handed over, in the shop's words. */
export function refusalText(r: HandOver['refused'][number]): string {
  const key = r.why === 'too-big' ? 'tooBig' : r.why === 'too-many' ? 'tooMany' : r.why;
  return fill(U.materials[key], { name: r.name });
}

/** The commission form currently open, so files dropped anywhere on the shop land on it. */
let openForm: { add: (paths: string[] | null) => Promise<void> } | null = null;
export const commissionFormOpen = () => openForm;

/**
 * `month`: this month's cap and what went under it; once past eight tenths, the slip says what is left. `tier`: the model
 * in settings, which "More" can change for this one commission (plan-1.6.md F6). `handInFirst`: open on the hand-in
 * card rather than the slip (plan-1.8.md H8, Q-F11).
 */
export function showCommissionForm(api: FormApi, budgetUsd = 0, handed: HandOver = { items: [], refused: [] }, month = { capUsd: 0, spentUsd: 0 }, tier: ModelTier = DEFAULT_TIER, handInFirst = false): Promise<CommissionForm | null> {
  return new Promise((resolve) => {
    const want = el('textarea', { rows: 2, required: true }) as HTMLTextAreaElement;
    // The empty-box reminder in the shop's own words (and language), not the browser's.
    want.addEventListener('invalid', () => want.setCustomValidity(U.wantMissing));
    want.addEventListener('input', () => want.setCustomValidity(''));
    const details = el('input', { type: 'text', placeholder: U.detailsPlaceholder }) as HTMLInputElement;
    const audience = el('input', { type: 'text', placeholder: U.audiencePlaceholder }) as HTMLInputElement;
    const tiers = strings.ui.setup.modelTiers;
    const model = el('select.slip-model', {}, el('option', { value: '' }, fill(U.slipModelDefault, { tier: tiers[tier] })),
      ...MODEL_TIERS.map((t) => el('option', { value: t }, tiers[t]))) as HTMLSelectElement;
    let chosen: Sticker | null = STICKERS[0];
    let source: { path: string; name: string } | null = null;
    const sourceName = el('span.source-name');
    const sourceHint = el('div.hint.source-hint');
    const pickButton = el('button', { type: 'button', onclick: () => void pick() }) as HTMLButtonElement;
    const sourceRow = el('div.source-row', {}, el('div.source-line', {}, pickButton, sourceName), sourceHint);
    const chips = STICKERS.map((t) => el('button.template-chip', { type: 'button', onclick: () => choose(t) }, t.label) as HTMLButtonElement);
    const done = (form: CommissionForm | null) => { openForm = null; resolve(form); closePanel(); };

    const materialHint = el('div.hint', {}, U.materials.hint);
    // Files handed over with the commission: a row of name tags, each can be taken back.
    let materials: Material[] = [];
    const tags = el('div.material-tags');
    const materialNote = el('div.hint.material-note', { role: 'status' });
    const showMaterials = (refused: HandOver['refused'] = []) => {
      tags.replaceChildren(...materials.map((m) => el('span.material-tag', {}, m.name,
        el('button.material-remove', { type: 'button', 'aria-label': fill(U.materials.remove, { name: m.name }), onclick: () => {
          materials = materials.filter((x) => x !== m);
          showMaterials();
        } }, '\u00D7'))));
      materialNote.textContent = refused.map(refusalText).join(' ');
      materialNote.classList.toggle('warn', refused.length > 0);
      // On the hand-in card too, while it is open there.
      if (!handView.hidden) drawHand();
    };
    const add = async (paths: string[] | null) => {
      const r = await api.handOver(paths, materials);
      materials = [...materials, ...r.items];
      showMaterials(r.refused);
      if (!r.items.length) return;
      sfx('open');
      // A reminder to hand something over has been answered.
      materialHint.textContent = materialsHint();
      materialHint.classList.remove('warn');
    };
    const materialRow = el('div.material-row', {},
      el('div.material-head', {}, el('span.material-label', {}, U.materials.label),
        el('button.link.material-add', { type: 'button', onclick: () => void add(null) }, U.materials.add)),
      tags, materialNote, materialHint);

    // "This one may use:" (road-to-1.3.md C4): the connections not paused, none ticked until the user ticks one.
    const ticked = new Set<string>();
    const linkRow = el('div.connection-row', { hidden: true });
    void api.connections().then((view) => {
      const usable = view.list.filter((c) => !c.paused);
      // None while the user has paused them all in settings (C6).
      if (!usable.length || view.allPaused) return;
      linkRow.replaceChildren(el('span.material-label', {}, strings.ui.connections.slipLine), ...usable.map((c) => {
        const box = el('input', { type: 'checkbox', value: c.id }) as HTMLInputElement;
        box.addEventListener('change', () => { if (box.checked) ticked.add(c.id); else ticked.delete(c.id); });
        return el('label.connection-tick', {}, box, c.label);
      }));
      linkRow.hidden = false;
    });

    // "Work in a folder I already have" (road-to-1.1.md A6). Not for the demo, nor a template that brings its own file
    // or folder, nor the album, whose photos are handed over: those land in the shop's own folder.
    let lent: { path: string; name: string } | null = null;
    const lentPick = el('button.link.lent-pick', { type: 'button', onclick: () => void pickLent() }) as HTMLButtonElement;
    const lentName = el('span.lent-name');
    const lentHint = el('div.hint.lent-hint', { role: 'status' });
    const lentRow = el('div.lent-row', {}, el('div.lent-line', {}, lentPick, lentName), lentHint);
    const canLend = () => chosen?.id !== 'demo' && !chosen?.spec?.source && !chosen?.spec?.photos;
    const lending = () => (canLend() ? lent : null);
    const showLent = () => {
      lentRow.hidden = !canLend();
      lentPick.textContent = lent ? L.pickAnother : L.pick;
      lentName.replaceChildren(...(lent ? [el('span.material-tag', {}, lent.name,
        el('button.material-remove', { type: 'button', 'aria-label': fill(L.remove, { name: lent.name }), onclick: () => { lent = null; showLent(); } }, '\u00D7'))] : []));
      lentHint.textContent = lent ? L.picked : '';
      lentHint.classList.remove('warn');
      // What is handed over would be copied in among the user's own files, so a lent folder takes none.
      materialRow.hidden = Boolean(lending());
    };
    const pickLent = async () => {
      const r = await api.chooseLent();
      if (!r) return;
      lent = 'error' in r ? null : r;
      showLent();
      if (!('error' in r)) return;
      lentHint.textContent = r.error === 'broad' ? L.broad : L.tooBig;
      lentHint.classList.add('warn');
    };

    // A kind that comes in more than one layout (plan-1.8.md H6): its plain one, or one of its own, picked here.
    let layout: TemplateLayout | undefined;
    const layoutChips = el('span.layout-chips');
    const layoutHint = el('div.hint.layout-hint');
    const layoutRow = el('div.layout-row', { hidden: true }, el('div.layout-line', {}, el('span.material-label', {}, U.layout.label), layoutChips), layoutHint);
    const showLayouts = () => {
      const own = chosen?.spec?.layouts ?? [];
      if (layout && !own.includes(layout)) layout = undefined;
      layoutRow.hidden = !own.length;
      layoutChips.replaceChildren(...[undefined, ...own].map((l) => {
        const chip = el('button.layout-chip', { type: 'button', 'aria-pressed': String(layout === l), onclick: () => { layout = l; showLayouts(); } }, l ? U.layout[l] : U.layout.plain);
        chip.classList.toggle('on', layout === l);
        return chip;
      }));
      layoutHint.textContent = layout ? U.layout[`${layout}Hint`] : '';
    };

    const needsSource = () => Boolean(chosen?.spec?.source);
    // What to hand over: a template that needs no file or folder may say what helps (photos for the album, an old résumé).
    const materialsHint = () => (chosen && !needsSource() && hintOf(chosen.id)) || U.materials.hint;
    const refresh = () => {
      chips.forEach((c, i) => c.classList.toggle('on', STICKERS[i] === chosen));
      sourceRow.hidden = !needsSource();
      pickButton.textContent = chosen?.spec?.source?.kind === 'folder' ? T.chooseFolder : T.chooseFile;
      sourceName.textContent = source?.name ?? '';
      sourceHint.textContent = needsSource() ? hintOf(chosen!.id) : '';
      sourceHint.classList.remove('warn');
      materialHint.textContent = materialsHint();
      materialHint.classList.remove('warn');
      showLent();
      showLayouts();
    };
    // Picking a sticker again puts it back; text the user already wrote is only replaced if it was a template's.
    const choose = (t: Sticker) => {
      const untouched = !want.value.trim() || STICKERS.some((x) => x.fill === want.value);
      chosen = chosen === t ? null : t;
      source = null;
      if (untouched) want.value = chosen?.fill ?? '';
      refresh();
      want.focus();
      const blank = BLANK.exec(want.value);
      if (untouched && blank) want.setSelectionRange(blank.index, blank.index + blank[0].length);
    };
    const pick = async () => {
      const r = await api.chooseSource(chosen!.id as CommissionTemplate);
      if (!r) return;
      if ('error' in r) {
        sourceHint.textContent = r.error === 'macros' ? T.macros : T.tooBig;
        sourceHint.classList.add('warn');
        return;
      }
      source = r;
      refresh();
    };

    // A talk with Adeng first (road-to-1.2.md B4): the slip turns into a chat, and "write it up" fills the slip in for the
    // user to look over. Only the names of the files handed over go to Claude.
    let talkId: string | null = null;
    const consultNote = el('div.hint.consult-note', { role: 'status' });
    const talkLog = el('div.consult-log', { role: 'log' });
    const say = el('textarea.consult-say', { rows: 2, placeholder: C.placeholder, 'aria-label': C.inputLabel }) as HTMLTextAreaElement;
    const sendButton = el('button.consult-send', { type: 'button', onclick: () => void send() }, C.send) as HTMLButtonElement;
    const finishButton = el('button.consult-finish', { type: 'button', disabled: true, onclick: () => void finish() }, C.finish) as HTMLButtonElement;
    const backButton = el('button.consult-back', { type: 'button', onclick: () => showTalk(false) }, C.back) as HTMLButtonElement;
    const talkView = el('div.consult', { hidden: true },
      el('div.card-title', {}, C.title),
      withPortrait('adeng', 'calm', el('div.hint', {}, fill(C.limits, { cap: formatUsd(CONSULT_CAP_USD), n: String(CONSULT_MESSAGES) }))),
      talkLog,
      el('div.consult-input', {}, say, sendButton),
      el('div.actions', {}, backButton, finishButton));
    const line = (who: 'you' | 'adeng', text: string, waiting = false) => {
      const node = el(`div.consult-line.${who}${waiting ? '.waiting' : ''}`, {}, waiting ? null : el('b', {}, who === 'adeng' ? strings.actors.adeng : C.you), text);
      talkLog.append(node);
      talkLog.scrollTop = talkLog.scrollHeight;
      return node;
    };
    // While Adeng answers nothing else can be said; the slip can be written up once there has been a reply.
    const busy = (on: boolean) => {
      for (const b of [say, sendButton, backButton]) b.disabled = on;
      finishButton.disabled = on || !talkId;
    };
    const showTalk = (on: boolean) => {
      for (const part of slip) part.hidden = on;
      talkView.hidden = !on;
      form.setAttribute('aria-label', on ? C.title : U.commissionTitle);
      (on ? say : want).focus();
    };
    const openTalk = () => {
      if (!talkLog.childElementCount) line('adeng', C.hello);
      showTalk(true);
    };
    const fillFrom = (brief: ConsultBrief) => {
      talkId = brief.consult;
      chosen = STICKERS.find((s) => s.id === brief.template) ?? null;
      source = null;
      want.value = brief.want;
      details.value = brief.details ?? '';
      audience.value = brief.audience ?? '';
      refresh();
      consultNote.textContent = brief.fromChat ? C.filledChat : C.filled;
      showTalk(false);
      // The note on what Adeng wrote sits over the want, both in view even on the smallest window.
      consultNote.scrollIntoView({ block: 'start' });
    };
    // The cap reached, or no answer: Adeng says so, and the slip comes back with what was said.
    const lastWord = async (brief: ConsultBrief) => {
      if (brief.end) {
        line('adeng', brief.end === 'cap' ? C.cap : C.trouble);
        await new Promise((r) => setTimeout(r, LAST_WORD_MS));
      }
      fillFrom(brief);
    };
    const send = async () => {
      const text = say.value.trim();
      if (!text) return;
      say.value = '';
      line('you', text);
      const thinking = line('adeng', C.thinking, true);
      busy(true);
      const r = await api.consult(talkId, text, materials.map((m) => m.name));
      thinking.remove();
      talkId = r.id;
      if ('brief' in r) await lastWord(r.brief);
      else line('adeng', r.reply);
      busy(false);
      if (!talkView.hidden) say.focus();
    };
    const finish = async () => {
      const writing = line('adeng', C.writing, true);
      busy(true);
      const brief = await api.consultFinish(talkId!);
      writing.remove();
      await lastWord(brief);
      busy(false);
    };
    // Enter says it; Shift+Enter starts a new line.
    say.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      void send();
    });

    // Handing in without typing (plan-1.8.md H8): materials dragged onto the card, a kind picked from the sample shelf,
    // Adeng's questions answered with a click, and the slip he writes up signed. The same commission comes out as the slip
    // would make from the same things typed in (shared/handin.ts).
    const H = U.handin;
    const budgetText = (budgetUsd ? fill(U.budgetCap, { cap: formatUsd(budgetUsd) }) : U.budgetNoCap) +
      (month.capUsd && month.spentUsd >= WARN_SHARE * month.capUsd ? ` ${fill(U.budgetLeft, { left: formatUsd(Math.max(0, month.capUsd - month.spentUsd)), cap: formatUsd(month.capUsd) })}` : '');
    type HandStep = 'bag' | 'shelf' | 'topic' | 'own' | 'layout' | 'audience' | 'ask' | 'slip';
    let handStep: HandStep = 'bag';
    let picks: Partial<HandInPicks> = {};
    const handView = el('div.handin', { hidden: true });
    const handNote = el('div.hint.handin-note', { role: 'status' });
    const kindName = (id: TemplateId) => (U.templates as Record<string, string>)[id];
    const answer = (label: string, onclick: () => void, kind = '') => el(`button.handin-answer${kind}`, { type: 'button', onclick }, label);
    const answers = (...buttons: HTMLElement[]) => el('div.handin-answers', {}, ...buttons);
    const adengSays = (text: string) => withPortrait('adeng', 'calm', el('div.handin-say', {}, text));
    const go = (step: HandStep) => {
      handStep = step;
      handNote.textContent = '';
      handNote.classList.remove('warn');
      drawHand();
    };
    const afterTopic = () => go(picks.template && templateOf(picks.template).layouts?.length ? 'layout' : 'audience');
    const pickKind = (id: TemplateId) => {
      // An album is made from photos: they come first.
      if (templateOf(id).photos && !materials.some((m) => isPicture(m.name))) {
        handNote.textContent = H.needPhotos;
        handNote.classList.add('warn');
        return;
      }
      picks = { template: id };
      go('topic');
    };
    const handSlip = () => {
      const k = picks.template!;
      const rows: [string, string][] = [
        [H.rows.kind, kindName(k) + (picks.layout ? ` · ${U.layout[picks.layout]}` : '')],
        [H.rows.want, picks.want ?? ''],
        [H.rows.audience, picks.audience ? H.audience[picks.audience] : H.rows.none],
        [H.rows.details, picks.ask && picks.ask !== 'none' ? H.asks[picks.ask] : H.rows.none],
        [H.rows.materials, materials.map((m) => m.name).join(', ') || H.rows.none],
      ];
      return el('dl.handin-slip', {}, ...rows.flatMap(([dt, dd]) => [el('dt', {}, dt), el('dd', {}, dd)]));
    };
    const sign = () => {
      const filled = handInForm({ ...picks, materials: materials.map((m) => m.path) } as HandInPicks, H);
      handView.classList.add('signed');
      handNote.textContent = H.signed;
      sfx('open');
      setTimeout(() => done(filled), SIGN_MS);
    };
    const drawHand = () => {
      const k = picks.template;
      let body: HTMLElement[];
      switch (handStep) {
        case 'bag':
          body = [adengSays(H.bagSay), el('div.material-tags', {}, ...materials.map((m) => el('span.material-tag', {}, m.name))),
            el('div.hint.material-note', { role: 'status' }, materialNote.textContent ?? ''),
            answers(answer(H.bagPick, () => void add(null)), answer(materials.length ? H.bagNext : H.bagNone, () => go('shelf'), '.handin-next'))];
          break;
        case 'shelf':
          body = [adengSays(H.shelfSay), el('div.handin-shelf', {}, ...HANDIN_KINDS.map((id) =>
            el('button.handin-sample', { type: 'button', 'data-kind': id, onclick: () => pickKind(id) }, workIconEl(id), el('span', {}, kindName(id)))))];
          break;
        case 'topic':
          body = [adengSays(H.topicSay), answers(...(H.examples as Record<string, string[]>)[k!].map((w) => answer(w, () => { picks.want = w; afterTopic(); })),
            answer(H.own, () => go('own'), '.handin-own'))];
          break;
        case 'own': {
          // No ready answer fits: typed after all, starting from the kind's own wording.
          const box = el('textarea.handin-write', { rows: 2, 'aria-label': H.topicSay }) as HTMLTextAreaElement;
          box.value = (U.templates as Record<string, string>)[`${k}Fill`] ?? '';
          body = [adengSays(H.topicSay), box, answers(answer(H.ownDone, () => {
            if (!box.value.trim()) { box.focus(); return; }
            picks.want = box.value;
            afterTopic();
          }, '.handin-next'))];
          setTimeout(() => box.focus());
          break;
        }
        case 'layout':
          body = [adengSays(H.layoutSay), answers(...[undefined, ...(templateOf(k!).layouts ?? [])].map((l) =>
            answer(l ? U.layout[l] : U.layout.plain, () => { picks.layout = l; go('audience'); })))];
          break;
        case 'audience':
          body = [adengSays(H.audienceSay), answers(...AUDIENCES.map((a) => answer(H.audience[a], () => { picks.audience = a; go('ask'); })))];
          break;
        case 'ask':
          body = [adengSays(H.askSay), answers(...ASKS.map((a) => answer(H.asks[a], () => { picks.ask = a; go('slip'); })))];
          break;
        case 'slip':
          body = [adengSays(H.slipSay), handSlip(), el('div.hint.budget-note', {}, budgetText),
            el('div.actions', {}, el('button.handin-again', { type: 'button', onclick: () => { picks = {}; go('bag'); } }, H.again),
              el('button.handin-sign', { type: 'button', onclick: sign }, H.sign))];
          break;
      }
      handView.replaceChildren(el('div.card-title', {}, H.title), ...body, handNote,
        el('button.link.handin-to-slip', { type: 'button', onclick: () => showHand(false) }, H.toSlip));
    };
    const showHand = (on: boolean) => {
      for (const part of slip) part.hidden = on;
      handView.hidden = !on;
      form.setAttribute('aria-label', on ? H.title : U.commissionTitle);
      if (!on) { want.focus(); return; }
      go(handStep);
      handView.querySelector<HTMLButtonElement>('button.handin-answer, button.handin-sample, button.handin-sign')?.focus();
    };

    const slip = [
      el('div.card-title', {}, U.commissionTitle),
      el('div.slip-body', {},
        el('div.slip-links', {},
          el('button.link.consult-open', { type: 'button', onclick: openTalk }, C.open),
          el('button.link.handin-open', { type: 'button', onclick: () => showHand(true) }, H.open)),
        el('div.hint', {}, T.label),
        el('div.template-row', {}, ...chips),
        layoutRow,
        consultNote,
        el('label', {}, U.want, want),
        // Something that fits the time of year, filled in with a click (plan-1.7.md G5).
        el('div.try-row', {}, el('span.hint', {}, U.tryLabel), ...suggestions(new Date(), U.tries).map((t) =>
          el('button.try-chip', { type: 'button', onclick: () => { want.value = t; want.dispatchEvent(new Event('input')); want.focus(); } }, t))),
        sourceRow,
        lentRow,
        materialRow,
        linkRow,
        el('label', {}, U.details, details),
        el('label', {}, U.audience, audience),
        el('details.slip-more', {}, el('summary', {}, U.slipMore), el('label', {}, U.slipModel, model)),
        el('div.hint.budget-note', {}, budgetText),
      ),
      el('div.actions', {}, el('button.default', { type: 'submit' }, U.submit)),
    ];
    // Working in the user's own folder is agreed to once, on the slip itself, so going back keeps what was written.
    const agree = el('div.lent-confirm', { hidden: true });
    const form = el('form.card.paper.commission', {}, closeButton(), ...slip, agree, talkView, handView);
    const askToLend = (filled: CommissionForm, name: string) => {
      const showing = (on: boolean) => {
        for (const part of slip) part.hidden = on;
        agree.hidden = !on;
        form.setAttribute('aria-label', on ? fill(L.confirmTitle, { name }) : U.commissionTitle);
      };
      const back = el('button', { type: 'button', onclick: () => { showing(false); lentPick.focus(); } }, L.back);
      agree.replaceChildren(
        el('div.card-title', {}, fill(L.confirmTitle, { name })),
        el('p', {}, L.confirmText),
        el('p', {}, L.confirmUndo),
        el('div.actions', {}, back, el('button.default', { type: 'button', onclick: () => done(filled) }, L.go)),
      );
      showing(true);
      // Going ahead changes the user's files: Enter alone should not do it.
      back.focus();
    };
    // Enter in a one-line box moves on instead of handing the commission in; only the button starts the work.
    const submitButton = form.querySelector<HTMLButtonElement>('button.default')!;
    for (const [box, next] of [[details, audience], [audience, submitButton]] as const) {
      box.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        next.focus();
      });
    }
    // The demo only runs on its exact wording, so its sticker goes dark as soon as the user writes something else.
    want.addEventListener('input', () => {
      if (chosen?.id === 'demo' && want.value !== U.demoFill) { chosen = null; refresh(); }
    });
    // Closed some other way (Esc): same as the close button.
    form.addEventListener('panel-closed', () => { openForm = null; resolve(null); });
    // Files dragged over the slip: it lights up; let go and they are handed over.
    form.addEventListener('dragover', (e) => { e.preventDefault(); form.classList.add('dropping'); });
    form.addEventListener('dragleave', (e) => { if (!form.contains((e as DragEvent).relatedTarget as Node)) form.classList.remove('dropping'); });
    form.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      form.classList.remove('dropping');
      void add(api.pathsOf(Array.from((e as DragEvent).dataTransfer?.files ?? [])));
    });
    form.dataset.drop = U.materials.drop;
    openForm = { add };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = want.value.trim();
      if (!text) return;
      if (needsSource() && !source) {
        sourceHint.textContent = T.needSource;
        sourceHint.classList.add('warn');
        pickButton.focus();
        return;
      }
      if (chosen?.spec?.photos && !materials.some((m) => isPicture(m.name))) {
        materialHint.textContent = T.needPhotos;
        materialHint.classList.add('warn');
        return;
      }
      const inPlace = lending();
      const filled = slipForm({
        want: text,
        details: details.value,
        audience: audience.value,
        template: chosen?.id as CommissionTemplate | 'demo' | undefined,
        layout,
        source: needsSource() ? source?.path : undefined,
        materials: materials.map((m) => m.path),
        inPlace: inPlace?.path,
        consult: talkId ?? undefined,
        connections: [...ticked],
        model: cleanTier(model.value),
        demoFill: U.demoFill,
      });
      if (inPlace) askToLend(filled, inPlace.name);
      else done(filled);
    });
    // Files dropped on the counter come in with the form; the demo has its own fixed material, so start blank.
    materials = [...handed.items];
    showMaterials(handed.refused);
    if (materials.length) { chosen = null; want.value = ''; } else want.value = U.demoFill;
    refresh();
    replaceOpen(form);
    if (handInFirst) showHand(true);
    else want.focus();
  });
}

/** What the result card can do besides opening the work: ask for changes, and swap back to the last version. */
export type ResultActions = {
  /** Says why, when an Office file was only shown in its folder (road-to-1.3.md C1). */
  open: (path: string, how: 'open' | 'reveal') => Promise<{ ok: boolean; why?: NotOpened }> | void;
  /** Opens source n of a research write-up in the browser (road-to-1.3.md C7). */
  openSource?: (n: number) => void;
  revise?: (id: string) => void;
  restore?: (id: string) => Promise<boolean>;
  /** Undo a commission done in the user's own folder. */
  undo?: (id: string) => Promise<string[] | null>;
  /** The first piece of work ever: say once that it will be kept on the shelf, which only appears now. */
  firstWork?: boolean;
  /** Something in it is not right (Store policy 11.16): a letter to us about what the staff made. */
  report?: () => void;
};

/**
 * The finished-work card: open the page in the browser, or show it in its folder; ask for changes;
 * after a round of changes, swap between this version and the last one (nothing is lost either way).
 */
export function showResult(result: CommissionResult, actions: ResultActions) {
  // A round may change nothing that can be pointed at; it still ends with a card, or it ends in silence.
  const target = result.main ?? result.files[0] ?? result.workDir;
  /** What "show in folder" points at; after an undo that took the main file away, the folder itself. */
  let shown = target;
  const note = el('div.hint.result-restored', { role: 'status' });
  // A Word, Excel or PowerPoint file that failed its look inside is only shown in its folder: the card says why.
  const openIt = async () => {
    const why = (await actions.open(result.main!, 'open'))?.why;
    if (why) note.textContent = U.resultNotOpened[why];
  };
  const openMain = result.main ? el('button.default', { onclick: () => void openIt() }, /\.html?$/i.test(result.main) ? U.openInBrowser : /\.eml$/i.test(result.main) ? U.openInMail : U.openFile) : null;
  // The main file's picture (C1) comes a moment after the card; clicking it opens the file, as the button does.
  // A picture (a chart, a poster, C2) is shown whole; a page shows its first screen.
  const thumb = result.main ? el(isPicture(result.main) ? 'button.result-thumb.whole' : 'button.result-thumb', {
    type: 'button', hidden: !result.preview, 'aria-label': fill(U.resultPreview, { file: result.main.split(/[\\/]/).pop()! }), onclick: () => void openIt(),
  }, el('img', { alt: '', src: result.preview })) : null;
  const { id } = result;
  let back = false;
  const restore = id && result.canRestore && actions.restore
    ? el('button.result-restore', { type: 'button' }, U.resultRestore) as HTMLButtonElement
    : null;
  restore?.addEventListener('click', async () => {
    restore.disabled = true;
    const ok = await actions.restore!(id!);
    restore.disabled = false;
    if (!ok) { note.textContent = U.resultRestoreFailed; return; }
    back = !back;
    note.textContent = back ? U.resultRestored : U.resultRestoredBack;
    restore.textContent = back ? U.resultRestoreBack : U.resultRestore;
  });
  // Done in the user's own folder: what of theirs changed and what is new, and undoing all of it (asked twice, as it
  // can't be taken back).
  const lent = result.lent ? el('div.result-lent', {},
    result.lent.changed.length ? el('div.hint', {}, fill(L.changed, { files: fileList(result.lent.changed) })) : null,
    result.lent.added.length ? el('div.hint', {}, fill(L.added, { files: fileList(result.lent.added) })) : null) : null;
  const undo = id && result.canUndo && actions.undo ? el('button.result-undo', { type: 'button' }, L.undo) as HTMLButtonElement : null;
  undo?.addEventListener('click', async () => {
    if (!undo.classList.contains('sure')) {
      undo.classList.add('sure');
      undo.textContent = L.undoSure;
      note.textContent = L.undoAsk;
      return;
    }
    undo.disabled = true;
    const skipped = await actions.undo!(id!);
    // A link in the folder that now leads out of it: those files are left for the user, and said by name.
    note.textContent = !skipped ? L.undoFailed : skipped.length ? fill(L.undoPartly, { files: fileList(skipped) }) : L.undone;
    undo.remove();
    if (!skipped) return;
    lent?.remove();
    // A main file the commission made is gone with the rest: there is nothing to open, only the folder to show.
    const slash = (p: string) => p.replace(/\\/g, '/');
    if (result.main && result.lent!.added.some((p) => slash(result.main!).endsWith(`/${p}`))) {
      openMain?.remove();
      shown = result.workDir;
    }
  });
  const card = el('div.card.paper.result-card', { 'data-run': result.run },
    closeButton(),
    el('div.card-title', {}, U.resultTitle, result.round ? el('span.result-round', {}, ` \u00B7 ${result.round === 1 ? U.resultRoundOne : fill(U.resultRound, { n: String(result.round) })}`) : null),
    // Which project it was for: with two rounds at once, two cards may come one after the other (B5).
    result.project ? el('div.hint.result-project', {}, fill(U.resultProject, { title: result.project.title })) : null,
    result.summary ? el('div.result-summary', {}, plainText(result.summary)) : null,
    // An edit that came back as another kind of file says so (C3), before the file is named.
    result.converted ? el('div.hint.result-converted', { role: 'note' }, U.resultConverted[result.converted]) : null,
    result.citations ? citationBlock(result.citations, actions.openSource) : null,
    thumb,
    // In the user's own folder the lists below name the files instead.
    lent ?? (!result.main && !result.files.length ? null : el('div.hint.result-file', {}, target.split(/[\\/]/).pop())),
    result.costUsd ? el('div.hint.result-cost', {}, fill(result.round ? U.resultCostTotal : U.resultCost, { cost: formatUsd(result.costUsd) })) : null,
    ...(result.budget ?? []).map((n) => el('div.hint.result-budget', { role: 'note' }, budgetLine(n))),
    // A script that deletes or acts without a preview broke the tool template's rules: say so before anyone double-clicks it.
    ...(result.scripts ?? []).map(({ file, risks }) => el('div.hint.warn.result-script', { role: 'note' },
      fill(risks.length > 1 ? U.resultScriptBoth : risks[0] === 'deletes' ? U.resultScriptDeletes : U.resultScriptNoPreview, { file }))),
    note,
    result.ok && actions.firstWork ? el('div.hint.result-shelf', {}, U.resultShelf) : null,
    // Changing the work sits apart from opening it: a quieter row on the left.
    result.ok && id && actions.revise ? el('div.actions.result-more', {},
      el('button.result-revise', { onclick: () => actions.revise!(id) }, U.resultRevise),
      restore, undo) : null,
    actions.report ? el('button.link.result-report', { type: 'button', onclick: actions.report }, U.resultReport) : null,
    el('div.actions', {},
      el(`button${result.main ? '' : '.default'}`, { onclick: () => actions.open(shown, 'reveal') }, U.openFolder),
      openMain,
    ),
  );
  // The work is handed over: once the card is put away, the blackboard and the parcels go too.
  card.addEventListener('panel-closed', clearWorkSigns);
  replaceOpen(card);
}

/** How many sources the result card lists before it only counts them. */
const LISTED_SOURCES = 8;

/**
 * A research write-up's sources on its card (road-to-1.3.md C7): title, site, and whether this round opened it, each a
 * click away in the browser; then what has no source, and the numbers that do not add up. Nothing is hidden for being
 * wrong: the card says so instead.
 */
function citationBlock(c: Citations, open?: (n: number) => void): HTMLElement {
  const C = U.citations;
  if (c.broken) return el('div.hint.warn.result-cite-broken', { role: 'note' }, C[c.broken]);
  return el('div.result-sources', {},
    el('div.result-sources-title', {}, C.title),
    c.sources.length ? el('ol.result-source-list', {}, ...c.sources.slice(0, LISTED_SOURCES).map((s) => el('li', { 'data-n': String(s.n) },
      el('button.link.result-source', { type: 'button', title: s.url, onclick: () => open?.(s.n) }, `[${s.n}] ${s.title}`),
      el('span.hint.result-source-site', {}, s.site ? ` ${s.site}` : ''),
      el(`span.result-source-state${s.opened ? '' : '.warn'}`, {}, s.opened ? C.opened : C.notOpened)))) : el('div.hint', {}, C.none),
    c.sources.length > LISTED_SOURCES ? el('div.hint', {}, fill(C.more, { n: String(c.sources.length), shown: String(LISTED_SOURCES) })) : null,
    c.unsourced.length ? el('div.result-unsourced', {}, el('div.hint', {}, C.unsourced), el('ul', {}, ...c.unsourced.map((u) => el('li', {}, u)))) : null,
    c.unnumbered.length ? el('div.hint.warn.result-unnumbered', { role: 'note' }, fill(C.unnumbered, { n: String(c.unnumbered.length) })) : null,
    c.missing.length ? el('div.hint.warn.result-missing', { role: 'note' }, fill(C.missing, { numbers: c.missing.map((n) => `[${n}]`).join(' ') })) : null);
}

/** A round's thumbnail has come: onto its card, if that is up. */
export function showResultPreview(run: string, png: string) {
  const thumb = document.querySelector<HTMLButtonElement>(`.result-card[data-run="${run}"] .result-thumb`);
  if (!thumb) return;
  thumb.querySelector('img')!.src = png;
  thumb.hidden = false;
}

/** How many file names the result card spells out before it just counts the rest. */
const NAMED_FILES = 5;
const fileList = (paths: string[]) => {
  const named = paths.slice(0, NAMED_FILES).join(strings.app.listSeparator);
  return paths.length > NAMED_FILES ? `${named} ${fill(L.more, { n: String(paths.length - NAMED_FILES) })}` : named;
};

/** Wipe the blackboard and take the parcels off the counter: the work they belonged to is over. */
export function clearWorkSigns() {
  document.getElementById('board')?.replaceChildren();
  chalked = [];
  document.querySelectorAll('.parcel').forEach((p) => p.remove());
}

/** The blackboard: up to four lines with a check mark when done; a long plan shows where the work is. */
export type { BoardStep };
/** What is on the blackboard now, for the card that shows the whole list. */
let chalked: BoardStep[] = [];
export const boardSteps = () => chalked;
/**
 * `columns`: two rounds under way at once (road-to-1.2.md B9). The slate splits in two, each column under a pin in its
 * project's colour, with two lines of that round's plan; `steps` stays the lead round's, for the card with the whole list.
 */
export function renderBoard(steps: BoardStep[], columns: { color: string; steps: BoardStep[] }[] = []) {
  chalked = steps.map((s) => ({ ...s }));
  let board = document.getElementById('board');
  if (!board) {
    board = el('div.board', { id: 'board' });
    layer().append(board);
  }
  const line = (s: BoardStep) => el(`div.step.${s.status}`, { title: s.label }, `${s.status === 'done' ? '\u2713' : s.status === 'doing' ? '\u270E' : '\u00B7'} ${s.label}`);
  board.classList.toggle('two', columns.length > 1);
  if (columns.length > 1) {
    // Half the slate each: no marks in front, the chalk itself says done (struck through), under way or still to do.
    board.replaceChildren(...columns.map((c) => el('div.board-col', { style: `--project:${c.color}` }, el('span.board-pin', { 'aria-hidden': 'true' }), ...boardPair(c.steps).map((s) => el(`div.step.${s.status}`, { title: s.label }, s.label)))));
    return;
  }
  const { shown, more } = boardWindow(steps);
  board.replaceChildren(...shown.map(line),
  ...(more ? [el('div.step.more', {}, `\u2026 ${fill(U.board.more, { n: String(more) })}`)] : []));
}

/** The blackboard up close: every line of the plan, with where the work is. */
export function showPlan(steps: BoardStep[]) {
  if (!steps.length) return;
  const done = steps.filter((s) => s.status === 'done').length;
  replaceOpen(el('div.card.paper.plan-card', {},
    closeButton(),
    el('div.card-title', {}, U.board.title),
    el('div.hint', {}, fill(U.board.count, { done: String(done), total: String(steps.length) })),
    el('ol.plan-list', {}, ...steps.map((s) => el(`li.${s.status}`, {}, s.label,
      s.status === 'doing' ? el('span.plan-now', {}, ` \u00B7 ${U.board.now}`) : null))),
  ));
}

/** Corner badge shown while a recording is replaying, so a replay never passes for a live run. */
export function setReplayBadge(on: boolean) {
  let badge = document.getElementById('replay-badge');
  if (on && !badge) {
    badge = el('div.replay-badge', { id: 'replay-badge' }, U.replayBadge);
    layer().append(badge);
  } else if (!on) badge?.remove();
}
