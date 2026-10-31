import { fill, strings } from '../../shared/i18n';
import { formatUsd } from '../../shared/money';
import { BUDGET_CHOICES, type EnvStatus, type LamplightApi, type LanguageChoice, type Settings } from '../../shared/types';
import { setMix, sfx } from '../audio/sound';
import { closePanel, replaceOpen } from './panels';
import { el, layer } from './dom';
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
    body.append(S.keyMissing,
      el('ol.key-steps', {},
        el('li', {}, S.keyStep1, ' ', el('button.link', { type: 'button', onclick: () => api.openLink('apiKeys') }, S.keyOpenConsole)),
        el('li', {}, S.keyStep2, ' ', el('button.link', { type: 'button', onclick: () => api.openLink('billing') }, S.keyOpenBilling)),
        el('li', {}, S.keyStep3)),
      pasteBox(), status);
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
  const manual = el('details.claude-manual', {},
    el('summary', {}, S.claudeManual),
    el('ol.claude-steps', {},
      el('li', {}, e.platform === 'win32' ? S.claudeStep1 : S.claudeStep1Mac),
      el('li', {}, S.claudeStep2, el('div.install-line', {}, el('code', {}, e.installCommand), copy)),
      el('li', {}, S.claudeStep3, ' ', el('span.watching', {}, S.claudeWatching))),
    el('button.link', { type: 'button', onclick: () => api.openLink('claudeSetup') }, S.claudeHow)) as HTMLDetailsElement;
  // The easy way first: the app runs the official installer; the card turns green when it lands.
  const status = el('div.hint.install-status', { role: 'status' }, S.claudeInstallHint);
  const install = el('button.sticker', { type: 'button' }, S.claudeInstall) as HTMLButtonElement;
  install.addEventListener('click', async () => {
    install.disabled = true;
    status.textContent = S.claudeInstalling;
    const ok = await api.installClaude();
    if (ok) return;
    install.disabled = false;
    status.textContent = S.claudeInstallFailed;
    manual.open = true;
  });
  return el('div.claude-install', {}, el('div.install-row', {}, install, status), manual);
}

/** How often to look for Claude Code while the user is installing it. */
const WATCH_MS = 3000;

/**
 * Whether Claude Code and the API key are there, with a way to fix what is missing. While Claude Code is
 * missing and the rows are on screen it keeps looking, so the row turns green once the install finishes.
 */
function envRows(api: LamplightApi, env: EnvStatus, onChange?: (e: EnvStatus) => void): HTMLElement {
  const box = el('div.env-rows');
  let watch: ReturnType<typeof setInterval> | undefined;
  const render = (e: EnvStatus, said?: string) => {
    box.replaceChildren(...[
      el(`div.env-row.${e.hasClaude ? 'ok' : 'missing'}`, {},
        el('span.mark', {}, e.hasClaude ? OK : MISSING),
        el('div', {}, e.hasClaude ? S.claudeOk : S.claudeMissing,
          e.hasClaude ? null : claudeSteps(api, e))),
      keyRow(api, e, async (next) => render(await api.envStatus(), next)),
      said ? el('div.hint.key-said', {}, said) : null,
    ].filter((n): n is HTMLElement => n !== null));
    onChange?.(e);
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
    const check = () => {
      const later = el('div.hint', {}, S.laterHint);
      page(
        el('div.card-title', {}, S.checkTitle),
        envRows(api, env, (e) => { later.hidden = e.hasClaude && e.hasApiKey; }),
        later,
        el('div.actions', {}, el('button.default', { onclick: folder }, S.next)),
      );
    };
    const folder = () => page(
      withPortrait('adeng', 'happy', el('div.card-title', {}, S.folderTitle), el('div', {}, S.folderText)),
      folderRow(api, settings, (s) => { settings = s; }),
      el('div.hint.legal-line', {}, S.legalLine, ' ', legalLink(api, 'terms'), ' \u00B7 ', legalLink(api, 'privacy')),
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
export function showNotReady(api: LamplightApi, env: EnvStatus, trial?: () => void, start?: () => void) {
  const close = el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7');
  const card = el('div.card.paper.notice-card');
  // Once both are there, the card says so and leads straight to the commission slip.
  const ready = () => card.replaceChildren(close,
    withPortrait('adeng', 'happy', el('div.card-title', {}, S.readyTitle), el('div', {}, S.readyText)),
    el('div.actions', {}, el('button.default', { type: 'button', onclick: () => { closePanel(); start?.(); } }, S.readyStart)));
  card.append(close,
    withPortrait('adeng', 'unsure', el('div.card-title', {}, S.notReadyTitle),
      envRows(api, env, (e) => { if (e.hasClaude && e.hasApiKey && start) setTimeout(ready, 1200); })),
    ...(trial ? [el('div.trial-offer', {}, el('span', {}, S.trialOffer),
      el('button.sticker', { type: 'button', onclick: () => { closePanel(); trial(); } }, S.trialButton))] : []));
  replaceOpen(card);
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

type LegalPage = 'privacy' | 'terms' | 'notices';
const LEGAL_LABEL: Record<LegalPage, string> = { privacy: S.privacyLink, terms: S.termsLink, notices: S.noticesLink };

const legalLink = (api: LamplightApi, which: LegalPage) =>
  el('button.link', { type: 'button', onclick: () => void showLegal(api, which) }, LEGAL_LABEL[which]);

/**
 * Privacy note, terms of use or third-party licenses, read on a sheet laid over whatever is open,
 * so closing it goes back there (the welcome card or settings).
 */
export async function showLegal(api: LamplightApi, which: LegalPage) {
  document.getElementById('legal')?.remove();
  let body: HTMLElement;
  let title = LEGAL_LABEL[which];
  if (which === 'notices') {
    const text = await api.legalNotices();
    body = el('pre.notices', {}, text ?? S.noticesMissing);
  } else {
    const paras = strings.legal[which];
    title = paras[0].replace(/^#\s*/, '');
    body = el('div.legal-text', {}, ...paras.slice(1).map((p) => (p.startsWith('#') ? el('h5', {}, p.replace(/^#\s*/, '')) : el('p', {}, p))));
  }
  const close = () => { sheet.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const back = el('button.default', { type: 'button', onclick: close }, S.legalBack) as HTMLButtonElement;
  const sheet = el('div.legal-backdrop', { id: 'legal' },
    el('div.card.paper.legal', { role: 'dialog', 'aria-label': title },
      el('div.card-title', {}, title),
      el('div.legal-body', {}, body),
      el('div.actions', {}, back)));
  window.addEventListener('keydown', onKey, true);
  layer().append(sheet);
  sfx('open');
  back.focus();
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
    el('section', {}, el('h4', {}, S.legalLabel),
      el('div.hint', {}, S.legalText),
      el('div.legal-links', {}, legalLink(api, 'privacy'), legalLink(api, 'terms'), legalLink(api, 'notices'))),
    el('section.about', {},
      el('h4', {}, S.aboutLabel),
      el('div', {}, fill(S.version, { version })),
      el('div', {}, S.creditArt, ' ', el('button.link', { onclick: () => api.openLink('limezu') }, S.creditLink)),
      el('div', {}, S.creditFont),
      el('div', {}, S.creditSound),
      el('div', {}, S.creditMusic, ' ', el('button.link', { onclick: () => api.openLink('music') }, S.creditMusicLink)))),
  ));
}
