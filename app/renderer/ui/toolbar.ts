import { strings } from '../../shared/i18n';
import type { ActorId, AiEvent, LamplightApi, Settings } from '../../shared/types';
import { showCaptionLog } from './captions';
import { el, layer } from './dom';
import { showSettings } from './setup';

const T = strings.ui.toolbar;
const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };
/** How many recent events the detail strip keeps. */
const DETAIL_LINES = 3;

/** The scene-wide switches the toolbar owns; other modules read them through this. */
export const view = { detailed: false, muted: false };

/**
 * Top-left buttons (the door, and its speech bubbles, take the top-right corner): settings, detailed mode, sound. Detailed mode adds a strip along the bottom
 * that says, in plain words, what the AI is really doing right now.
 */
export function mountToolbar(api: LamplightApi, settings: Settings, onChange: (s: Settings) => void) {
  view.detailed = settings.detailed;
  view.muted = settings.muted;
  const save = async (patch: Partial<Settings>) => {
    const next = await api.saveSettings(patch);
    view.detailed = next.detailed;
    view.muted = next.muted;
    render();
    onChange(next);
  };
  const button = (label: string, glyph: string, onclick: () => void, pressed?: boolean) =>
    el('button.tool-btn', { title: label, 'aria-label': label, 'aria-pressed': pressed === undefined ? undefined : String(pressed), onclick }, glyph);
  const bar = el('div.toolbar', { role: 'toolbar', 'aria-label': T.label });
  const render = () => {
    bar.replaceChildren(
      button(view.detailed ? T.detailedOff : T.detailedOn, '\u{1F50D}', () => void save({ detailed: !view.detailed }), view.detailed),
      button(view.muted ? T.unmute : T.mute, view.muted ? '\u{1F507}' : '\u{1F509}', () => void save({ muted: !view.muted }), view.muted),
      button(strings.ui.access.captionsButton, '\u{1F4DC}', showCaptionLog),
      button(T.settings, '\u2699', () => void showSettings(api, onChange)),
    );
    strip.hidden = !view.detailed;
  };
  const strip = el('div.detail-strip', { 'aria-live': 'polite' });
  layer().append(bar, strip);
  render();
}

/** Add an event to the detail strip (kept even while hidden, so turning it on shows the latest). */
export function noteEvent(e: AiEvent) {
  const strip = document.querySelector<HTMLElement>('.detail-strip');
  if (!strip || e.kind === 'thinking') return;
  const who = strings.actors[AGENT_ACTOR[e.agent]];
  strip.append(el(`div.detail-line${e.risk === 'serious' || e.risk === 'blocked' ? '.risky' : ''}`, {}, el('b', {}, who), ' ', e.plain));
  while (strip.children.length > DETAIL_LINES) strip.firstElementChild!.remove();
}
