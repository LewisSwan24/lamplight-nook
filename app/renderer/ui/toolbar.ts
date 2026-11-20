import toolsUrl from '../../../assets/sprites/tools.png';
import { strings } from '../../shared/i18n';
import type { ActorId, AiEvent, LamplightApi, Settings } from '../../shared/types';
import { showCaptionLog } from './captions';
import { el, layer } from './dom';
import { showNotebook } from './notebook';
import { showSettings } from './setup';
import { TOOL_ICONS, type ToolIcon } from './tool-icons';

const T = strings.ui.toolbar;
const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };
/** How many recent events the detail strip keeps. */
const DETAIL_LINES = 3;

/** The scene-wide switches; other modules read them through this. */
export const view = { detailed: false, muted: false };
/** A commission is under way: the first button is about that instead. */
let working = false;
/** Out on the street (road-to-1.4.md D1): the street button takes you back in. */
let outside = false;
let paint = () => {};

/** What the shop itself opens from the toolbar. */
export type ToolbarActions = { order: () => void; projects: () => void; shelf: () => void; street: () => void };

/** A button's picture and its label, which shows at once on hover and keyboard focus (style.css). */
function look(button: HTMLElement, icon: ToolIcon, label: string) {
  button.setAttribute('data-tip', label);
  button.setAttribute('aria-label', label);
  button.firstElementChild!.setAttribute('style', `background-image:url(${toolsUrl});--cells:${TOOL_ICONS.length};--cell:${TOOL_ICONS.indexOf(icon)}`);
}

/**
 * Top-left buttons (the door, and its speech bubbles, take the top-right corner), most used first: a commission (or
 * how the one under way is going), the project board, the works shelf, Adeng's notebook, captions, sound, settings. Everything here can also
 * be reached without the scene (docs/information-structure.md). The strip along the bottom is a setting now.
 */
export function mountToolbar(api: LamplightApi, onChange: (s: Settings) => void, act: ToolbarActions) {
  const button = (icon: ToolIcon, label: string, onclick: () => void) => {
    const b = el('button.tool-btn', { type: 'button', onclick }, el('span.tool-icon', { 'aria-hidden': 'true' }));
    look(b, icon, label);
    return b;
  };
  const order = button('order', T.order, act.order);
  const sound = button('sound', T.mute, async () => onChange(await api.saveSettings({ muted: !view.muted })));
  const street = button('street', T.street, act.street);
  const bar = el('div.toolbar', { role: 'toolbar', 'aria-label': T.label },
    order,
    button('projects', strings.ui.projects.button, act.projects),
    button('works', strings.ui.shelf.title, act.shelf),
    button('notebook', strings.ui.notebook.title, () => void showNotebook(api)),
    button('captions', strings.ui.access.captionsButton, showCaptionLog),
    sound,
    street,
    button('gear', T.settings, () => void showSettings(api, onChange)));
  const strip = el('div.detail-strip', { 'aria-live': 'polite' });
  paint = () => {
    look(order, working ? 'progress' : 'order', working ? T.progress : T.order);
    order.classList.toggle('working', working);
    look(sound, view.muted ? 'mute' : 'sound', view.muted ? T.unmute : T.mute);
    sound.setAttribute('aria-pressed', String(view.muted));
    look(street, 'street', outside ? T.back : T.street);
    strip.hidden = !view.detailed;
  };
  layer().append(bar, strip);
  paint();
}

/** Saved settings reach the toolbar and the strip under the scene. */
export function syncToolbar(s: Settings) {
  view.detailed = s.detailed;
  view.muted = s.muted;
  paint();
}

/** Out on the street or back in. */
export function setOutsideButton(on: boolean) {
  outside = on;
  paint();
}

/** A commission started or ended. */
export function setWorking(on: boolean) {
  working = on;
  paint();
}

/** Add an event to the detail strip (kept even while hidden, so turning it on shows the latest). */
export function noteEvent(e: AiEvent) {
  const strip = document.querySelector<HTMLElement>('.detail-strip');
  if (!strip || e.kind === 'thinking') return;
  const who = strings.actors[AGENT_ACTOR[e.agent]];
  strip.append(el(`div.detail-line${e.risk === 'serious' || e.risk === 'blocked' ? '.risky' : ''}`, {}, el('b', {}, who), ' ', e.plain));
  while (strip.children.length > DETAIL_LINES) strip.firstElementChild!.remove();
}
