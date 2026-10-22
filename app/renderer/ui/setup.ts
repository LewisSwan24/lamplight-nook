import { fill, strings } from '../../shared/i18n';
import type { EnvStatus, LamplightApi, Settings } from '../../shared/types';
import { setMix, sfx } from '../audio/sound';
import { closePanel, replaceOpen } from './panels';
import { el } from './dom';
import { withPortrait } from './portraits';

const S = strings.ui.setup;
const OK = '\u2713';
const MISSING = '\u25CB';

/** Two rows saying whether Claude Code and the API key are there, with a link when they are not. Re-checks in place. */
function envRows(api: LamplightApi, env: EnvStatus): HTMLElement {
  const box = el('div.env-rows');
  const render = (e: EnvStatus) => box.replaceChildren(...[
    el(`div.env-row.${e.hasClaude ? 'ok' : 'missing'}`, {},
      el('span.mark', {}, e.hasClaude ? OK : MISSING),
      el('span', {}, e.hasClaude ? S.claudeOk : S.claudeMissing, ' ',
        e.hasClaude ? null : el('button.link', { onclick: () => api.openLink('claudeSetup') }, S.claudeHow))),
    el(`div.env-row.${e.hasApiKey ? 'ok' : 'missing'}`, {},
      el('span.mark', {}, e.hasApiKey ? OK : MISSING),
      el('span', {}, e.hasApiKey ? S.keyOk : S.keyMissing, ' ',
        e.hasApiKey ? null : el('button.link', { onclick: () => api.openLink('apiKeys') }, S.keyHow))),
    e.hasClaude && e.hasApiKey ? null
      : el('div.recheck', {}, el('button.link', { onclick: async () => render(await api.envStatus()) }, S.recheck)),
  ].filter((n): n is HTMLElement => n !== null));
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

/** Shown instead of the commission form when something needed to start is missing. */
export function showNotReady(api: LamplightApi, env: EnvStatus) {
  replaceOpen(el('div.card.paper.notice-card', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    withPortrait('adeng', 'unsure', el('div.card-title', {}, S.notReadyTitle), envRows(api, env)),
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

/** Settings: name, work folder, sound, what is needed to start, and credits. */
export async function showSettings(api: LamplightApi, onChange: (s: Settings) => void) {
  const [settings, env, version] = await Promise.all([api.getSettings(), api.envStatus(), api.appVersion()]);
  const name = el('input', { type: 'text', maxlength: 10, value: settings.name }) as HTMLInputElement;
  name.addEventListener('change', async () => onChange(await api.saveSettings({ name: name.value })));
  replaceOpen(el('div.card.paper.settings', {},
    el('button.close', { onclick: closePanel, 'aria-label': 'close' }, '\u00D7'),
    el('div.card-title', {}, S.settingsTitle),
    el('section', {}, el('h4', {}, S.nameLabel), name),
    el('section', {}, el('h4', {}, S.folderLabel), folderRow(api, settings, onChange)),
    el('section', {}, el('h4', {}, S.volumeLabel), volumeRow(api, settings, onChange)),
    el('section', {}, el('h4', {}, S.checkLabel), envRows(api, env)),
    el('section.about', {},
      el('h4', {}, S.aboutLabel),
      el('div', {}, fill(S.version, { version })),
      el('div', {}, S.creditArt, ' ', el('button.link', { onclick: () => api.openLink('limezu') }, S.creditLink)),
      el('div', {}, S.creditFont),
      el('div', {}, S.creditSound)),
  ));
}
