import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { BUDGET_CHOICES, type EnvStatus, type LamplightApi, type LanguageChoice, type Settings } from '../../shared/types';
import { setMix, sfx } from '../audio/sound';
import { closePanel, replaceOpen } from './panels';
import { el } from './dom';
import { showNotebook } from './notebook';
import { withPortrait } from './portraits';

const S = strings.ui.setup;
const OK = '\u2713';
const MISSING = '\u25CB';

/** The key row: where the key comes from (masked), or a box to paste one into. Calls back after a change. */
function keyRow(api: LamplightApi, e: EnvStatus, changed: (said?: string) => void): HTMLElement {
  const row = el(`div.env-row.${e.hasApiKey ? 'ok' : 'missing'}`, {}, el('span.mark', {}, e.hasApiKey ? OK : MISSING));
  const status = el('div.key-status', { role: 'status' });
  const pasteBox = () => {
    const input = el('input', { type: 'password', placeholder: S.keyPlaceholder, autocomplete: 'off', spellcheck: 'false', 'aria-label': S.keyPlaceholder }) as HTMLInputElement;
    const save = el('button.sticker', { type: 'submit' }, S.keySave) as HTMLButtonElement;
    const form = el('form.key-form', {}, input, save);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!input.value.trim()) return;
      save.disabled = true;
      status.textContent = S.keyChecking;
      const r = await api.saveApiKey(input.value);
      save.disabled = false;
      if (r.ok) {
        input.value = '';
        changed(r.verified ? S.keySaved : S.keyUnverified);
        return;
      }
      status.textContent = { format: S.keyBadFormat, invalid: S.keyInvalid, storage: S.keyNoStorage }[r.reason];
      input.select();
    });
    return form;
  };
  const body = el('div.key-body');
  if (e.keySource === 'stored') {
    body.append(fill(S.keyStored, { hint: e.keyHint ?? '' }), ' ',
      el('button.link', { onclick: () => body.replaceChildren(pasteBox(), status) }, S.keyReplace), ' ',
      el('button.link', { onclick: async () => { await api.clearApiKey(); changed(); } }, S.keyRemove));
  } else if (e.keySource === 'env') {
    body.append(fill(S.keyFromEnv, { hint: e.keyHint ?? '' }));
  } else if (e.keySource === 'subscription') {
    body.append(S.keySubscription);
  } else {
    body.append(S.keyMissing, ' ', el('button.link', { onclick: () => api.openLink('apiKeys') }, S.keyHow), pasteBox(), status);
  }
  row.append(body);
  return row;
}

/** Claude Code is missing: three steps with the official install command and a copy button. */
function claudeSteps(api: LamplightApi, e: EnvStatus): HTMLElement {
  const copy = el('button.sticker', { type: 'button' }, S.claudeCopy) as HTMLButtonElement;
  copy.addEventListener('click', async () => {
    await api.copyInstallCommand();
    copy.textContent = S.claudeCopied;
    setTimeout(() => { copy.textContent = S.claudeCopy; }, 2000);
  });
  return el('ol.claude-steps', {},
    el('li', {}, e.platform === 'win32' ? S.claudeStep1 : S.claudeStep1Mac),
    el('li', {}, S.claudeStep2, el('div.install-line', {}, el('code', {}, e.installCommand), copy)),
    el('li', {}, S.claudeStep3, ' ', el('span.watching', {}, S.claudeWatching)));
}

/** How often to look for Claude Code while the user is installing it. */
const WATCH_MS = 3000;

/**
 * Whether Claude Code and the API key are there, with a way to fix what is missing. While Claude Code is
 * missing and the rows are on screen it keeps looking, so the row turns green once the install finishes.
 */
function envRows(api: LamplightApi, env: EnvStatus): HTMLElement {
  const box = el('div.env-rows');
  let watch: ReturnType<typeof setInterval> | undefined;
  const render = (e: EnvStatus, said?: string) => {
    box.replaceChildren(...[
      el(`div.env-row.${e.hasClaude ? 'ok' : 'missing'}`, {},
        el('span.mark', {}, e.hasClaude ? OK : MISSING),
        el('div', {}, e.hasClaude ? S.claudeOk : S.claudeMissing, ' ',
          e.hasClaude ? null : el('button.link', { onclick: () => api.openLink('claudeSetup') }, S.claudeHow),
          e.hasClaude ? null : claudeSteps(api, e))),
      keyRow(api, e, async (next) => render(await api.envStatus(), next)),
      said ? el('div.hint.key-said', {}, said) : null,
    ].filter((n): n is HTMLElement => n !== null));
    if (e.hasClaude && watch) {
      clearInterval(watch);
      watch = undefined;
      sfx('success');
    } else if (!e.hasClaude && !watch) {
      watch = setInterval(async () => {
        if (!box.isConnected) { clearInterval(watch); watch = undefined; return; }
        const next = await api.envStatus();
        if (next.hasClaude) render(next);
      }, WATCH_MS);
    }
  };
  render(env);
  return box;
}

/** The work folder line: path, change, open. Calls back with new settings after a change. */
function folderRow(api: LamplightApi, settings: Settings, changed: (s: Settings) => void): HTMLElement {
  const path = el('div.path', {}, settings.workRoot);
  return el('div.folder-row', {},
    path,
    el('div.actions', {},
      el('button', { onclick: () => void api.openWorkRoot() }, S.open),
      el('button', { onclick: async () => {
        const next = await api.chooseWorkRoot();
        if (next) { path.textContent = next.workRoot; changed(next); }
      } }, S.change),
    ));
}

/**
 * First visit: name, what is missing to start working, and where finished work goes.
 * Resolves with the saved settings once the user opens the shop.
 */
export function showWelcome(api: LamplightApi, settings: Settings, env: EnvStatus): Promise<Settings> {
  return new Promise((resolve) => {
    const name = el('input', { type: 'text', maxlength: 10, placeholder: S.namePlaceholder, value: settings.name }) as HTMLInputElement;
    const card = el('div.card.paper.welcome');
    const page = (...children: (Node | null)[]) => card.replaceChildren(...children.filter((c): c is Node => c !== null));

    const askName = () => {
      const form = el('form', {},
        withPortrait('adeng', 'calm', el('div.card-title', {}, S.welcomeTitle), el('div', {}, S.welcomeText)),
        name,
        el('div.actions', {}, el('button.default', { type: 'submit' }, S.next)));
      form.addEventListener('submit', (e) => { e.preventDefault(); if (name.value.trim()) check(); });
      page(form);
      name.focus();
    };
    const check = () => page(
      el('div.card-title', {}, S.checkTitle),
      envRows(api, env),
      env.hasClaude && env.hasApiKey ? null : el('div.hint', {}, S.laterHint),
      el('div.actions', {}, el('button.default', { onclick: folder }, S.next)),
    );
    const folder = () => page(
      withPortrait('adeng', 'happy', el('div.card-title', {}, S.folderTitle), el('div', {}, S.folderText)),
      folderRow(api, settings, (s) => { settings = s; }),
      el('div.actions', {}, el('button.default', { onclick: async () => {
        closePanel();
        resolve(await api.saveSettings({ name: name.value.trim(), onboarded: true }));
      } }, S.openShop)),
    );

    replaceOpen(card);
    askName();
  });
}

/**
 * Shown instead of the commission form when something needed to start is missing. With `trial`, it also
 * offers a replay of a recorded demo, so people can see the shop at work before setting anything up.
 */
export function showNotReady(api: LamplightApi, env: EnvStatus, trial?: () => void) {
  replaceOpen(el('div.card.paper.notice-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait('adeng', 'unsure', el('div.card-title', {}, S.notReadyTitle), envRows(api, env)),
    trial ? el('div.trial-offer', {}, el('span', {}, S.trialOffer),
      el('button.sticker', { type: 'button', onclick: () => { closePanel(); trial(); } }, S.trialButton)) : null,
  ));
}

/** After the trial replay: what it was, and the way to the real thing. */
export function showTrialEnd(setUp: () => void) {
  replaceOpen(el('div.card.paper.trial-end', {},
    withPortrait('adeng', 'happy', el('div.card-title', {}, S.trialEndTitle), el('div', {}, S.trialEndText)),
    el('div.actions', {},
      el('button', { onclick: closePanel }, S.trialDone),
      el('button.default', { onclick: () => { closePanel(); setUp(); } }, S.trialSetUp)),
  ));
}

/** The volume slider: heard while dragging, saved when let go. */
function volumeRow(api: LamplightApi, settings: Settings, changed: (s: Settings) => void): HTMLElement {
  const slider = el('input', { type: 'range', min: 0, max: 100, step: 5, value: settings.volume, 'aria-label': S.volumeLabel }) as HTMLInputElement;
  slider.addEventListener('input', () => setMix({ volume: Number(slider.value) }));
  slider.addEventListener('change', async () => {
    changed(await api.saveSettings({ volume: Number(slider.value) }));
    sfx('ask');
  });
  return el('div.volume-row', {}, slider, el('div.hint', {}, S.volumeHint));
}

type Switch = 'captions' | 'reducedMotion' | 'notify' | 'closeToTray';

/** On/off switches, saved as soon as they change. */
function switchRows(api: LamplightApi, settings: Settings, changed: (s: Settings) => void, rows: [Switch, string][]): HTMLElement {
  const toggle = (key: Switch, text: string) => {
    const box = el('input', { type: 'checkbox' }) as HTMLInputElement;
    box.checked = settings[key];
    box.addEventListener('change', async () => changed(await api.saveSettings({ [key]: box.checked })));
    return el('label.toggle', {}, box, text);
  };
  return el('div.access-rows', {}, ...rows.map(([key, text]) => toggle(key, text)));
}

/** What this month cost so far, and the most one run may spend. */
function spendRows(api: LamplightApi, settings: Settings, month: number, changed: (s: Settings) => void): HTMLElement {
  const select = el('select', { 'aria-label': S.budgetLabel }, ...BUDGET_CHOICES.map((usd) =>
    el('option', { value: usd, selected: usd === settings.budgetUsd }, usd ? formatUsd(usd) : S.budgetNone))) as HTMLSelectElement;
  select.addEventListener('change', async () => changed(await api.saveSettings({ budgetUsd: Number(select.value) })));
  return el('div.spend-rows', {},
    el('div', {}, fill(S.spendMonth, { cost: formatUsd(month) })),
    el('label.budget-row', {}, S.budgetLabel, ' ', select),
    el('div.hint', {}, S.budgetHint));
}

/** The app's language. It changes on restart, which waits while a commission is running. */
function languageRow(api: LamplightApi, settings: Settings, changed: (s: Settings) => void): HTMLElement {
  const choices: [LanguageChoice, string][] = [['system', S.languageSystem], ['zh-CN', S.languageZh], ['en', S.languageEn]];
  const select = el('select', { 'aria-label': S.languageLabel }, ...choices.map(([id, label]) =>
    el('option', { value: id, selected: id === settings.language }, label))) as HTMLSelectElement;
  const note = el('div.hint');
  const restart = el('button.sticker', { type: 'button', hidden: true }, S.languageRestartNow) as HTMLButtonElement;
  select.addEventListener('change', async () => {
    changed(await api.saveSettings({ language: select.value as LanguageChoice }));
    note.textContent = S.languageRestart;
    restart.hidden = false;
  });
  restart.addEventListener('click', async () => {
    if (!(await api.relaunch())) note.textContent = S.languageBusy;
  });
  return el('div', {}, select, note, el('div.actions', {}, restart));
}

/** Export a diagnostics zip; says where it went. */
function troubleRow(api: LamplightApi): HTMLElement {
  const said = el('div.hint');
  const button = el('button.sticker', { type: 'button' }, S.troubleExport) as HTMLButtonElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    const path = await api.exportDiagnostics();
    button.disabled = false;
    said.textContent = path ? S.troubleDone : '';
  });
  return el('div', {}, el('div.hint', {}, S.troubleText), el('div.actions', {}, button), said);
}

/** Settings: name, work folder, sound, seeing and hearing, what is needed to start, and credits. */
export async function showSettings(api: LamplightApi, onChange: (s: Settings) => void) {
  const [settings, env, version, month] = await Promise.all([api.getSettings(), api.envStatus(), api.appVersion(), api.spendThisMonth()]);
  const name = el('input', { type: 'text', maxlength: 10, value: settings.name }) as HTMLInputElement;
  name.addEventListener('change', async () => onChange(await api.saveSettings({ name: name.value })));
  replaceOpen(el('div.card.paper.settings', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    el('div.card-title', {}, S.settingsTitle),
    // Only the inside scrolls, so the paper behind it always covers the whole card.
    el('div.settings-body', {},
    el('section', {}, el('h4', {}, S.nameLabel), name),
    el('section', {}, el('h4', {}, S.languageLabel), languageRow(api, settings, onChange)),
    el('section', {}, el('h4', {}, S.folderLabel), folderRow(api, settings, onChange)),
    el('section', {}, el('h4', {}, S.volumeLabel), volumeRow(api, settings, onChange)),
    el('section', {}, el('h4', {}, strings.ui.access.sectionLabel),
      switchRows(api, settings, onChange, [['captions', strings.ui.access.captionsToggle], ['reducedMotion', strings.ui.access.reduceMotion]])),
    el('section', {}, el('h4', {}, strings.ui.tray.sectionLabel),
      switchRows(api, settings, onChange, [['notify', strings.ui.tray.notifyToggle], ['closeToTray', strings.ui.tray.closeToTrayToggle]])),
    el('section', {}, el('h4', {}, strings.ui.notebook.sectionLabel),
      el('div.hint', {}, strings.ui.notebook.sectionText),
      el('div.actions', {}, el('button', { onclick: () => void showNotebook(api) }, strings.ui.notebook.open))),
    el('section', {}, el('h4', {}, S.checkLabel), envRows(api, env)),
    el('section', {}, el('h4', {}, S.spendLabel), spendRows(api, settings, month, onChange)),
    el('section', {}, el('h4', {}, S.troubleLabel), troubleRow(api)),
    el('section.about', {},
      el('h4', {}, S.aboutLabel),
      el('div', {}, fill(S.version, { version })),
      el('div', {}, S.creditArt, ' ', el('button.link', { onclick: () => api.openLink('limezu') }, S.creditLink)),
      el('div', {}, S.creditFont),
      el('div', {}, S.creditSound))),
  ));
}
