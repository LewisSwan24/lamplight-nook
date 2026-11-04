import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { type BoardStep, boardWindow } from '../../shared/board';
import { withoutColourCodes, withoutPathFolders } from '../../shared/text';
import type { ActorId, CommissionForm, CommissionResult, CommissionTemplate, HandOver, LamplightApi, Material } from '../../shared/types';
import { sfx } from '../audio/sound';
import { el, layer } from './dom';
import { expressionFor } from './expression';
import { withPortrait } from './portraits';

const U = strings.ui;

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
const FOCUS_FIRST = 'textarea, input, button.default, button:not(.close), button';

export function replaceOpen(node: HTMLElement) {
  if (!open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open?.remove();
  open = node;
  layer().append(node);
  sfx('open');
  if (!node.contains(document.activeElement)) node.querySelector<HTMLElement>(FOCUS_FIRST)?.focus();
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

// Esc closes the open card (decision dialogs handle their own keys and always win).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open && !open.classList.contains('welcome') && !document.querySelector('.backdrop')) {
    e.preventDefault();
    closePanel();
  }
});

/** Card shown when a character is clicked. */
/** Detailed mode opens the raw record straight away. */
export function showActorCard(actor: ActorId, info: ActorInfo, detailed = false) {
  const state = (strings.states as Record<string, string>)[info.state] ?? info.state;
  replaceOpen(el('div.card.paper.actor-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait(actor, expressionFor(info.state),
      el('div.card-title', {}, `${strings.actors[actor]} - ${state}`),
      info.lastLine ? el('div.quote', {}, `\u201C${info.lastLine}\u201D`) : null),
    info.doing ? el('div', {}, el('b', {}, U.doingNow), info.doing) : null,
    info.stats.writes + info.stats.runs + info.stats.fails ? el('div', {}, el('b', {}, U.soFar), fill(U.statsLine, info.stats)) : null,
    info.raw.length ? el('details', { open: detailed }, el('summary', {}, U.raw), el('pre', {}, info.raw.slice(-30).join('\n'))) : null,
  ));
}

/** Drop Markdown markers the agents use in summaries (bold, headings, code ticks). */
const plainText = (s: string) => s.replace(/[*#`]+/g, '').replace(/\s+/g, ' ').trim();

/** A subagent's result handed over at the counter. */
export function showParcel(actor: ActorId, summary: string) {
  const parcel = el('div.parcel.paper', { tabindex: 0 },
    el('button.close', { 'aria-label': 'close', onclick: (e: Event) => { e.stopPropagation(); parcel.remove(); } }, '\u00D7'),
    el('div.card-title', {}, fill(U.parcelFrom, { who: strings.actors[actor] })),
    el('div.parcel-body', {}, withoutPathFolders(withoutColourCodes(plainText(summary)))),
  );
  parcel.addEventListener('click', () => parcel.classList.toggle('expanded'));
  document.querySelectorAll('.parcel').forEach((p) => p.remove());
  layer().append(parcel);
}

/** The commission form. Resolves with the form, or null if closed. */
const T = U.templates;
const TEMPLATES: { id: CommissionTemplate | 'demo'; label: string; fill: string }[] = [
  { id: 'demo', label: T.demo, fill: U.demoFill },
  { id: 'page', label: T.page, fill: T.pageFill },
  { id: 'research', label: T.research, fill: T.researchFill },
  { id: 'edit', label: T.edit, fill: T.editFill },
  { id: 'tidy', label: T.tidy, fill: T.tidyFill },
  { id: 'letter', label: T.letter, fill: T.letterFill },
  { id: 'sheet', label: T.sheet, fill: T.sheetFill },
  { id: 'plan', label: T.plan, fill: T.planFill },
  { id: 'album', label: T.album, fill: T.albumFill },
];
/** Pictures an album can show. */
const PHOTO = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
/** The blank in a template sentence (a Chinese or an English ellipsis), selected so typing replaces it. */
const BLANK = /\u2026\u2026|\.\.\./;

/**
 * The commission form. A row of stickers fills in a ready-made kind of commission (the demo is picked to begin with);
 * editing a document or tidying a folder also asks which file or folder, through the main process's dialog.
 */
/** What the commission form needs from the main process. */
export type FormApi = Pick<LamplightApi, 'chooseSource' | 'handOver' | 'pathsOf'>;

/** Why something couldn't be handed over, in the shop's words. */
export function refusalText(r: HandOver['refused'][number]): string {
  const key = r.why === 'too-big' ? 'tooBig' : r.why === 'too-many' ? 'tooMany' : r.why;
  return fill(U.materials[key], { name: r.name });
}

/** The commission form currently open, so files dropped anywhere on the shop land on it. */
let openForm: { add: (paths: string[] | null) => Promise<void> } | null = null;
export const commissionFormOpen = () => openForm;

export function showCommissionForm(api: FormApi, budgetUsd = 0, handed: HandOver = { items: [], refused: [] }): Promise<CommissionForm | null> {
  return new Promise((resolve) => {
    const want = el('textarea', { rows: 2, required: true }) as HTMLTextAreaElement;
    // The empty-box reminder in the shop's own words (and language), not the browser's.
    want.addEventListener('invalid', () => want.setCustomValidity(U.wantMissing));
    want.addEventListener('input', () => want.setCustomValidity(''));
    const details = el('input', { type: 'text', placeholder: U.detailsPlaceholder }) as HTMLInputElement;
    const audience = el('input', { type: 'text', placeholder: U.audiencePlaceholder }) as HTMLInputElement;
    let chosen: (typeof TEMPLATES)[number] | null = TEMPLATES[0];
    let source: { path: string; name: string } | null = null;
    const sourceName = el('span.source-name');
    const sourceHint = el('div.hint.source-hint');
    const pickButton = el('button', { type: 'button', onclick: () => void pick() }) as HTMLButtonElement;
    const sourceRow = el('div.source-row', {}, el('div.source-line', {}, pickButton, sourceName), sourceHint);
    const chips = TEMPLATES.map((t) => el('button.template-chip', { type: 'button', onclick: () => choose(t) }, t.label) as HTMLButtonElement);
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
    };
    const add = async (paths: string[] | null) => {
      const r = await api.handOver(paths, materials);
      materials = [...materials, ...r.items];
      showMaterials(r.refused);
      if (!r.items.length) return;
      sfx('open');
      // A reminder to hand something over has been answered.
      materialHint.textContent = chosen?.id === 'album' ? T.albumHint : U.materials.hint;
      materialHint.classList.remove('warn');
    };
    const materialRow = el('div.material-row', {},
      el('div.material-head', {}, el('span.material-label', {}, U.materials.label),
        el('button.link.material-add', { type: 'button', onclick: () => void add(null) }, U.materials.add)),
      tags, materialNote, materialHint);

    const needsSource = () => chosen?.id === 'edit' || chosen?.id === 'tidy';
    const refresh = () => {
      chips.forEach((c, i) => c.classList.toggle('on', TEMPLATES[i] === chosen));
      sourceRow.hidden = !needsSource();
      pickButton.textContent = chosen?.id === 'tidy' ? T.chooseFolder : T.chooseFile;
      sourceName.textContent = source?.name ?? '';
      sourceHint.textContent = chosen?.id === 'tidy' ? T.tidyHint : T.editHint;
      sourceHint.classList.remove('warn');
      materialHint.textContent = chosen?.id === 'album' ? T.albumHint : U.materials.hint;
      materialHint.classList.remove('warn');
    };
    // Picking a sticker again puts it back; text the user already wrote is only replaced if it was a template's.
    const choose = (t: (typeof TEMPLATES)[number]) => {
      const untouched = !want.value.trim() || TEMPLATES.some((x) => x.fill === want.value);
      chosen = chosen === t ? null : t;
      source = null;
      if (untouched) want.value = chosen?.fill ?? '';
      refresh();
      want.focus();
      const blank = BLANK.exec(want.value);
      if (untouched && blank) want.setSelectionRange(blank.index, blank.index + blank[0].length);
    };
    const pick = async () => {
      const r = await api.chooseSource(chosen?.id === 'tidy' ? 'tidy' : 'edit');
      if (!r) return;
      if ('error' in r) {
        sourceHint.textContent = T.tooBig;
        sourceHint.classList.add('warn');
        return;
      }
      source = r;
      refresh();
    };

    const form = el('form.card.paper.commission', {},
      el('div.card-title', {}, U.commissionTitle),
      el('div.slip-body', {},
        el('div.hint', {}, T.label),
        el('div.template-row', {}, ...chips),
        el('label', {}, U.want, want),
        sourceRow,
        materialRow,
        el('label', {}, U.details, details),
        el('label', {}, U.audience, audience),
        el('div.hint.budget-note', {}, budgetUsd ? fill(U.budgetCap, { cap: formatUsd(budgetUsd) }) : U.budgetNoCap),
      ),
      el('div.actions', {},
        el('button', { type: 'button', onclick: () => done(null) }, '\u00D7'),
        el('button.default', { type: 'submit' }, U.submit),
      ),
    );
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
      if (chosen?.id === 'album' && !materials.some((m) => PHOTO.test(m.name))) {
        materialHint.textContent = T.needPhotos;
        materialHint.classList.add('warn');
        return;
      }
      const template = chosen && chosen.id !== 'demo' ? chosen.id : undefined;
      done({
        want: text,
        details: details.value.trim() || undefined,
        audience: audience.value.trim() || undefined,
        demo: chosen?.id === 'demo' && text === U.demoFill,
        template,
        source: template === 'edit' || template === 'tidy' ? source?.path : undefined,
        materials: chosen?.id === 'demo' ? undefined : materials.map((m) => m.path),
      });
    });
    // Files dropped on the counter come in with the form; the demo has its own fixed material, so start blank.
    materials = [...handed.items];
    showMaterials(handed.refused);
    if (materials.length) { chosen = null; want.value = ''; } else want.value = U.demoFill;
    refresh();
    replaceOpen(form);
    want.focus();
  });
}

/** What the result card can do besides opening the work: ask for changes, and swap back to the last version. */
export type ResultActions = {
  open: (path: string, how: 'open' | 'reveal') => void;
  revise?: (id: string) => void;
  restore?: (id: string) => Promise<boolean>;
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
  if (!result.main && !result.files.length) return;
  const target = result.main ?? result.files[0];
  const { id } = result;
  const note = el('div.hint.result-restored', { role: 'status' });
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
  const card = el('div.card.paper.result-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    el('div.card-title', {}, U.resultTitle, result.round ? el('span.result-round', {}, ` \u00B7 ${result.round === 1 ? U.resultRoundOne : fill(U.resultRound, { n: String(result.round) })}`) : null),
    result.summary ? el('div.result-summary', {}, plainText(result.summary)) : null,
    el('div.hint.result-file', {}, target.split(/[\\/]/).pop()),
    result.costUsd ? el('div.hint.result-cost', {}, fill(result.round ? U.resultCostTotal : U.resultCost, { cost: formatUsd(result.costUsd) })) : null,
    note,
    result.ok && actions.firstWork ? el('div.hint.result-shelf', {}, U.resultShelf) : null,
    // Changing the work sits apart from opening it: a quieter row on the left.
    result.ok && id && actions.revise ? el('div.actions.result-more', {},
      el('button.result-revise', { onclick: () => actions.revise!(id) }, U.resultRevise),
      restore) : null,
    actions.report ? el('button.link.result-report', { type: 'button', onclick: actions.report }, U.resultReport) : null,
    el('div.actions', {},
      result.main ? el('button.default', { onclick: () => actions.open(result.main!, 'open') }, /\.html?$/i.test(result.main) ? U.openInBrowser : U.openFile) : null,
      el('button', { onclick: () => actions.open(target, 'reveal') }, U.openFolder),
    ),
  );
  // The work is handed over: once the card is put away, the blackboard and the parcels go too.
  card.addEventListener('panel-closed', clearWorkSigns);
  replaceOpen(card);
}

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
export function renderBoard(steps: BoardStep[]) {
  chalked = steps.map((s) => ({ ...s }));
  let board = document.getElementById('board');
  if (!board) {
    board = el('div.board', { id: 'board' });
    layer().append(board);
  }
  const { shown, more } = boardWindow(steps);
  board.replaceChildren(...shown.map((s) =>
    el(`div.step.${s.status}`, { title: s.label }, `${s.status === 'done' ? '\u2713' : s.status === 'doing' ? '\u270E' : '\u00B7'} ${s.label}`)),
  ...(more ? [el('div.step.more', {}, `\u2026 ${fill(U.board.more, { n: String(more) })}`)] : []));
}

/** The blackboard up close: every line of the plan, with where the work is. */
export function showPlan(steps: BoardStep[]) {
  if (!steps.length) return;
  const done = steps.filter((s) => s.status === 'done').length;
  replaceOpen(el('div.card.paper.plan-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
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
