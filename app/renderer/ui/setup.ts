import { fill, locale, strings } from '../../shared/i18n';
import { monthName } from '../../shared/localday';
import { SUPPORT } from '../../shared/support';
import { formatUsd } from '../../shared/money';
import { BUDGET_CHOICES, MONTH_CAP_CHOICES, type EnvStatus, type LamplightApi, type LanguageChoice, type Settings } from '../../shared/types';
import { setMix, sfx } from '../audio/sound';
import { closeButton, closePanel, nameCard, replaceOpen } from './panels';
import { el, layer } from './dom';
import { lookPicker, withPortrait } from './portraits';
import { moveTo, scenePicker, sceneRow } from './scenes';
import { FURNISH_CHOICES, FURNISH_PARTS, SWATCHES, type Furnishing } from '../../shared/furnish';
import { keyTextParts } from './key-text';
import { homeScene, type SceneId } from '../../shared/scenes';

const S = strings.ui.setup;
/** Where people write to; the same address as on the website and the store page. */
const SUPPORT_EMAIL = SUPPORT;
const OK = '\u2713';
const MISSING = '\u25CB';

const keyText = (text: string) => keyTextParts(text).map((p) => (p.key ? el('span.key-text', {}, p.text) : p.text));

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
      status.replaceChildren(...keyText({ format: S.keyBadFormat, invalid: S.keyInvalid, storage: S.keyNoStorage }[r.reason]));
      input.select();
    });
    return form;
  };
  const body = el('div.key-body');
  if (e.keySource === 'stored') {
    body.append(...keyText(fill(S.keyStored, { hint: e.keyHint ?? '' })), ' ',
      el('button.link', { onclick: () => body.replaceChildren(pasteBox(), status) }, S.keyReplace), ' ',
      el('button.link', { onclick: async () => { await api.clearApiKey(); changed(); } }, S.keyRemove));
  } else if (e.keySource === 'env') {
    body.append(...keyText(fill(S.keyFromEnv, { hint: e.keyHint ?? '' })));
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

/**
 * Claude Code is missing (or too old): three steps with the official install command and a copy button.
 * The same official installer updates an old copy, so `update` only changes the wording.
 */
function claudeSteps(api: LamplightApi, e: EnvStatus, update = false): HTMLElement {
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
  // The Store build never runs the installer itself: the steps are the way, opened.
  if (e.store) {
    manual.open = true;
    return el('div.claude-install', {}, el('div.hint', {}, update ? S.claudeStoreUpdate : S.claudeStoreHint), manual);
  }
  // The easy way first: the app runs the official installer; the card turns green when it lands.
  const status = el('div.hint.install-status', { role: 'status' }, S.claudeInstallHint);
  const install = el('button.sticker', { type: 'button' }, update ? S.claudeUpdate : S.claudeInstall) as HTMLButtonElement;
  install.addEventListener('click', async () => {
    install.disabled = true;
    status.textContent = update ? S.claudeUpdating : S.claudeInstalling;
    const ok = await api.installClaude();
    if (ok) return;
    install.disabled = false;
    status.textContent = update ? S.claudeUpdateFailed : S.claudeInstallFailed;
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
    const old = e.hasClaude && e.claudeCompat === 'old';
    const fine = e.hasClaude && !old;
    box.replaceChildren(...[
      el(`div.env-row.${fine ? 'ok' : 'missing'}`, {},
        el('span.mark', {}, fine ? OK : MISSING),
        el('div', {},
          old ? fill(S.claudeOld, { version: e.claudeVersion ?? '?', tested: e.claudeTested ?? '?' }) : e.hasClaude ? S.claudeOk : S.claudeMissing,
          fine && e.claudeVersion ? el('div.hint.claude-version', {}, fill(S.claudeVersion, { version: e.claudeVersion })) : null,
          fine ? null : claudeSteps(api, e, old))),
      keyRow(api, e, async (next) => render(await api.envStatus(), next)),
      said ? el('div.hint.key-said', {}, said) : null,
    ].filter((n): n is HTMLElement => n !== null));
    onChange?.(e);
    // While Claude Code is missing or too old, keep looking: the row turns green once it is installed or updated.
    const needed = (x: EnvStatus) => !x.hasClaude || x.claudeCompat === 'old';
    if (!needed(e) && watch) {
      clearInterval(watch);
      watch = undefined;
      sfx('success');
    } else if (needed(e) && !watch) {
      watch = setInterval(async () => {
        if (!box.isConnected) { clearInterval(watch); watch = undefined; return; }
        const next = await api.envStatus();
        if (!needed(next)) render(next);
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
    const name = el('input', { type: 'text', maxlength: 10, placeholder: S.namePlaceholder, value: settings.name, 'aria-label': S.nameLabel }) as HTMLInputElement;
    let look = settings.avatar;
    const looks = lookPicker(look, (n) => { look = n; });
    const card = el('div.card.paper.welcome.must-answer');
    const page = (...children: (Node | null)[]) => {
      card.replaceChildren(...children.filter((c): c is Node => c !== null));
      nameCard(card);
      // Enter goes on to the next page, as it does on the first.
      card.querySelector<HTMLElement>('button.default')?.focus();
    };

    const askName = () => {
      const form = el('form', {},
        withPortrait('adeng', 'calm', el('div.card-title', {}, S.welcomeTitle), el('div', {}, S.welcomeText)),
        name,
        el('div.hint.welcome-look', {}, S.welcomeLook),
        looks,
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
    let scene: SceneId = homeScene();
    const folder = () => page(
      withPortrait('adeng', 'happy', el('div.card-title', {}, S.folderTitle), el('div', {}, S.folderText)),
      folderRow(api, settings, (s) => { settings = s; }),
      el('div.hint.welcome-look', {}, strings.ui.scene.label),
      scenePicker(scene, (id) => { scene = id; }),
      el('div.hint.legal-line', {}, S.legalLine, ' ', legalLink(api, 'terms'), ' \u00B7 ', legalLink(api, 'privacy')),
      el('div.actions', {}, el('button.default', { onclick: async () => {
        closePanel();
        const saved = await api.saveSettings({ name: name.value.trim(), avatar: look, onboarded: true });
        // Picking the study moves the shop there before it opens (the page reloads into the new room).
        if (scene !== homeScene() && (await moveTo(api, scene))) return;
        resolve(saved);
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
export function showNotReady(api: LamplightApi, env: EnvStatus, trial?: () => void, start?: () => void, useOld?: () => void) {
  const close = closeButton();
  const card = el('div.card.paper.notice-card');
  // Once both are there, the card says so and leads straight to the commission slip.
  const ready = () => {
    card.replaceChildren(close,
      el('div.card-scroll', {}, withPortrait('adeng', 'happy', el('div.card-title', {}, S.readyTitle), el('div', {}, S.readyText))),
      el('div.actions', {}, el('button.default', { type: 'button', onclick: () => { closePanel(); start?.(); } }, S.readyStart)));
    nameCard(card);
  };
  // Only an old Claude Code in the way: it may still work, so going ahead is the user's call.
  const keepOld = el('div.actions.keep-old', {}, el('button', { type: 'button', onclick: () => { closePanel(); useOld?.(); } }, S.claudeKeepOld));
  const onlyOld = (e: EnvStatus) => e.hasClaude && e.hasApiKey && e.claudeCompat === 'old';
  keepOld.hidden = !useOld || !onlyOld(env);
  card.append(close,
    el('div.card-scroll', {}, withPortrait('adeng', 'unsure', el('div.card-title', {}, onlyOld(env) ? S.oldTitle : S.notReadyTitle),
      envRows(api, env, (e) => {
        keepOld.hidden = !useOld || !onlyOld(e);
        if (e.hasClaude && e.hasApiKey && e.claudeCompat !== 'old' && start) setTimeout(ready, 1200);
      }))),
    keepOld,
    ...(trial ? [el('div.trial-offer', {}, el('span', {}, S.trialOffer),
      el('button.sticker', { type: 'button', onclick: () => { closePanel(); trial(); } }, S.trialButton))] : []));
  replaceOpen(card);
}

/** After the trial replay: what it was, and the way to the real thing. */
export function showTrialEnd(setUp: () => void) {
  replaceOpen(el('div.card.paper.trial-end', {},
    closeButton(),
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

type Switch = 'captions' | 'reducedMotion' | 'powerSaving' | 'detailed' | 'notify' | 'closeToTray' | 'openAtLogin' | 'mini' | 'updates' | 'connectionsPaused' | 'lan';

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
  const monthCap = el('select.month-cap', { 'aria-label': S.monthCapLabel }, ...MONTH_CAP_CHOICES.map((usd) =>
    el('option', { value: usd, selected: usd === settings.monthCapUsd }, usd ? formatUsd(usd) : S.budgetNone))) as HTMLSelectElement;
  monthCap.addEventListener('change', async () => changed(await api.saveSettings({ monthCapUsd: Number(monthCap.value) })));
  const book = el('table.spend-book');
  const months = el('details.spend-months', { ontoggle: async () => {
    if (!months.open) return;
    const list = await api.spendMonths();
    const total = list.reduce((sum, m) => sum + m.usd, 0);
    book.replaceChildren(...list.map((m) => el('tr', {},
      el('th', { scope: 'row' }, monthName(m.month, locale())),
      el('td', {}, m.commissions === 1 ? S.spendBookOne : fill(S.spendBookCount, { n: String(m.commissions) })),
      el('td', {}, m.estimated ? fill(S.spendBookEstimated, { cost: formatUsd(m.usd), estimated: formatUsd(m.estimated) }) : formatUsd(m.usd)))),
    el('tr.spend-total', {}, el('th', { scope: 'row', colspan: 2 }, S.spendBookTotal), el('td', {}, formatUsd(total))));
    if (!list.length) book.replaceChildren(el('tr', {}, el('th', {}, S.spendBookEmpty)));
  } }, el('summary', {}, S.spendBook), book) as HTMLDetailsElement;
  return el('div.spend-rows', {},
    el('div', {}, fill(S.spendMonth, { cost: formatUsd(month) })),
    months,
    el('label.budget-row', {}, S.budgetLabel, ' ', select),
    el('div.hint', {}, S.budgetHint),
    el('label.budget-row', {}, S.monthCapLabel, ' ', monthCap),
    el('div.hint', {}, S.monthCapHint));
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
      closeButton(close),
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
function troubleRow(api: LamplightApi, version: string, platform: string): HTMLElement {
  const said = el('div.hint', { role: 'status' });
  const button = el('button.sticker', { type: 'button' }, S.troubleExport) as HTMLButtonElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    const path = await api.exportDiagnostics();
    button.disabled = false;
    said.textContent = path ? S.troubleDone : '';
  });
  return el('div', {}, el('div.hint', {}, S.troubleText), el('div.actions', {}, button), said, writeRow(api, version, platform));
}

/**
 * "Write to us": says exactly what the user's mail program will open with, then opens it. The app sends
 * nothing; attaching the diagnostics file and pressing send are the user's own steps.
 */
function writeRow(api: LamplightApi, version: string, platform: string): HTMLElement {
  const os = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform;
  const footer = fill(S.mailFooter, { version, os, lang: strings.app.languageName });
  const withDiag = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const said = el('div.hint.write-said', { role: 'status' });
  const button = el('button.sticker.write-us', { type: 'button' }, S.writeButton) as HTMLButtonElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    const r = await api.writeToUs({ about: 'problem', diagnostics: withDiag.checked });
    button.disabled = false;
    said.textContent = r.cancelled ? '' : r.opened ? (r.file ? S.writeOpenedDiag : S.writeOpened) : fill(S.writeFailed, { email: SUPPORT_EMAIL });
  });
  return el('div.write-us-row', {},
    el('div.hint', {}, S.writeText),
    el('ul.write-lines', {},
      el('li', {}, fill(S.writeTo, { email: SUPPORT_EMAIL })),
      el('li', {}, fill(S.writeSubject, { subject: fill(S.mailSubject, { version }) })),
      el('li', {}, fill(S.writeBody, { footer }))),
    el('div.access-rows.write-diag', {}, el('label.toggle', {}, withDiag, S.writeDiag)),
    el('div.actions', {}, button),
    said);
}

export const SETTINGS_TABS = ['basics', 'furnish', 'sight', 'work', 'about'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
/** The tab settings opened on last time, so a second visit lands where the first one left off. */
let lastTab: SettingsTab = 'basics';

/** Furnishing the scene the shop is in: a row of colour swatches for the walls, the curtains and the rug. */
function furnishRows(api: LamplightApi, settings: Settings, changed: (s: Settings) => void): HTMLElement[] {
  const F = strings.ui.furnish;
  const here = homeScene();
  let mine: Furnishing = { ...settings.furnish[here] };
  return [
    el('div.hint', {}, fill(F.hint, { scene: strings.ui.scene[here] })),
    ...FURNISH_PARTS.map((part) => {
      const names = F.choices[part] as Record<string, string>;
      const buttons = FURNISH_CHOICES[part].map((choice) => el('button.swatch', {
        type: 'button', title: names[choice], 'aria-label': `${F[part]}: ${names[choice]}`,
        style: `--swatch:${SWATCHES[here][part][choice]}`, 'data-choice': choice,
      }) as HTMLButtonElement);
      const name = el('span.swatch-name');
      const show = () => {
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.choice === mine[part]));
        name.textContent = names[mine[part]];
      };
      buttons.forEach((b) => b.addEventListener('click', async () => {
        mine = { ...mine, [part]: b.dataset.choice } as Furnishing;
        show();
        const s = await api.saveSettings({ furnish: { ...settings.furnish, [here]: mine } });
        settings = s;
        changed(s);
      }));
      show();
      return el('section', {}, el('h4', {}, F[part]), el('div.swatches', {}, ...buttons, name));
    }),
  ];
}

/** Settings, in the five tabs of docs/information-structure.md: who you are, the shop, sight and sound, working, and about. */
/** `tab`: open on that tab rather than the one last looked at. */
/**
 * Phones and other computers on the home network (docs/plan-1.5.md E1): the switch, where the shop listens, a QR code for
 * pairing a new device and the paired ones, each with a button to remove it. Refreshed every two seconds while shown,
 * so a device that has just scanned the code shows as paired.
 */
function lanSection(api: LamplightApi, settings: Settings, onChange: (s: Settings) => void): HTMLElement {
  const L = strings.ui.lan;
  const body = el('div.lan-body');
  const qr = el('div.lan-qr', { hidden: true });
  const render = async () => {
    const st = await api.lanState();
    if (!st.on) qr.hidden = true;
    body.replaceChildren(
      st.on ? el('div.lan-address', {}, fill(L.address, { address: st.addresses.join(', ') })) : el('div.hint', {}, L.off),
      st.on ? el('button.lan-pair', { type: 'button', onclick: async () => {
        const got = await api.lanPair();
        if (!got) return;
        // The SVG is drawn by the main process from the address alone (qrcode-generator), never from anything typed.
        qr.innerHTML = got.svg;
        qr.dataset.url = got.url;
        qr.append(el('div.hint', {}, L.scan));
        qr.hidden = false;
        void render();
      } }, L.pair) : '',
      el('div.lan-devices-label', {}, L.devices),
      st.devices.length
        ? el('ul.lan-devices', {}, ...st.devices.map((d) => el('li', { 'data-device': d.id, 'data-paired': String(d.paired) }, `${d.name} · ${d.paired ? L.paired : L.waiting} `,
          el('button.link', { type: 'button', onclick: async () => { await api.lanRemove(d.id); void render(); } }, L.remove))))
        : el('div.hint', {}, L.none),
    );
  };
  const timer = window.setInterval(() => { if (!body.isConnected) window.clearInterval(timer); else void render(); }, 2000);
  void render();
  // The server starts or stops after the switch is saved.
  const changed = (s: Settings) => { onChange(s); window.setTimeout(() => void render(), 500); };
  return el('section.lan', {}, el('h4', {}, L.title), switchRows(api, settings, changed, [['lan', L.toggle]]), el('div.hint', {}, L.intro), body, qr);
}

export async function showSettings(api: LamplightApi, onChange: (s: Settings) => void, tab?: SettingsTab) {
  const [settings, env, version, month] = await Promise.all([api.getSettings(), api.envStatus(), api.appVersion(), api.spendThisMonth()]);
  const name = el('input', { type: 'text', maxlength: 10, value: settings.name, 'aria-label': S.nameLabel }) as HTMLInputElement;
  name.addEventListener('change', async () => onChange(await api.saveSettings({ name: name.value })));
  const groups: Record<SettingsTab, (HTMLElement | null)[]> = {
    basics: [
      el('section', {}, el('h4', {}, S.nameLabel), name),
      el('section', {}, el('h4', {}, S.lookLabel), el('div.hint', {}, S.lookHint),
        lookPicker(settings.avatar, async (avatar) => onChange(await api.saveSettings({ avatar })))),
      el('section', {}, el('h4', {}, S.languageLabel), languageRow(api, settings, onChange)),
    ],
    furnish: [
      el('section', {}, el('h4', {}, strings.ui.scene.label), sceneRow(api)),
      ...furnishRows(api, settings, onChange),
    ],
    sight: [
      el('section', {}, el('h4', {}, S.volumeLabel), volumeRow(api, settings, onChange)),
      el('section', {}, el('h4', {}, strings.ui.access.sectionLabel),
        switchRows(api, settings, onChange, [['captions', strings.ui.access.captionsToggle], ['reducedMotion', strings.ui.access.reduceMotion], ['powerSaving', strings.ui.access.powerSaving], ['detailed', strings.ui.access.detailedToggle]])),
    ],
    work: [
      el('section', {}, el('h4', {}, S.checkLabel), envRows(api, env)),
      el('section', {}, el('h4', {}, S.folderLabel), folderRow(api, settings, onChange)),
      el('section', {}, el('h4', {}, S.spendLabel), spendRows(api, settings, month, onChange)),
      el('section', {}, el('h4', {}, strings.ui.tray.sectionLabel),
        // The Store build can't open itself at login this way (road-to-1.2.md B6), so it has no such switch.
        switchRows(api, settings, onChange, [['notify', strings.ui.tray.notifyToggle], ['closeToTray', strings.ui.tray.closeToTrayToggle],
          ...(env.store ? [] : [['openAtLogin', strings.ui.tray.openAtLoginToggle] as [Switch, string]]), ['mini', strings.ui.mini.toggle]])),
      // One switch for every connection (road-to-1.3.md C6): off the slip, and refused mid-round at the next call.
      el('section.connections-pause', {}, el('h4', {}, strings.ui.connections.settingsLabel),
        switchRows(api, settings, onChange, [['connectionsPaused', strings.ui.connections.pauseAll]]),
        el('div.hint', {}, strings.ui.connections.pauseAllHint)),
      lanSection(api, settings, onChange),
    ],
    about: [
      el('section', {}, el('h4', {}, S.legalLabel),
        el('div.hint', {}, S.legalText),
        el('div.legal-links', {}, legalLink(api, 'privacy'), legalLink(api, 'terms'), legalLink(api, 'notices'))),
      el('section.about', {},
        el('h4', {}, S.aboutLabel),
        el('div', {}, fill(S.version, { version })),
        // The Store build is kept up to date by the Store, so there is nothing to switch.
        env.store ? null : el('div.updates-row', {}, switchRows(api, settings, onChange, [['updates', S.updatesToggle]]), el('div.hint', {}, S.updatesHint)),
        el('div', {}, S.creditArt, ' ', el('button.link', { onclick: () => api.openLink('limezu') }, S.creditLink)),
        el('div', {}, S.creditFont),
        el('div', {}, S.creditSound),
        el('div', {}, S.creditMusic, ' ', el('button.link', { onclick: () => api.openLink('music') }, S.creditMusicLink))),
      el('section', {}, el('h4', {}, S.troubleLabel), troubleRow(api, version, env.platform)),
    ],
  };
  // Only the inside scrolls, so the paper behind it always covers the whole card.
  const body = el('div.settings-body', { role: 'tabpanel' });
  const tabs = SETTINGS_TABS.map((id) => el('button.tab', { role: 'tab', 'data-tab': id }, S.settingsTabs[id]) as HTMLButtonElement);
  const card = el('div.card.paper.settings', {},
    closeButton(),
    el('div.card-title', {}, S.settingsTitle),
    el('div.tabs', { role: 'tablist' }, ...tabs),
    body,
  );
  const pick = (id: SettingsTab) => {
    lastTab = id;
    card.dataset.tab = id;
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    body.replaceChildren(...groups[id].filter((n): n is HTMLElement => !!n));
    body.scrollTop = 0;
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(SETTINGS_TABS[i]));
    // Arrow keys move between tabs, as in any tab list.
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + tabs.length) % tabs.length;
      pick(SETTINGS_TABS[next]);
      tabs[next].focus();
    });
  });
  pick(tab ?? lastTab);
  replaceOpen(card);
}
