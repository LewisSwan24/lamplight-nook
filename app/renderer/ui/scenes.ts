import cafeUrl from '../../../assets/sprites/cafe.png';
import studyUrl from '../../../assets/sprites/study.png';
import { strings } from '../../shared/i18n';
import { SCENES, homeScene, type SceneId } from '../../shared/scenes';
import type { LamplightApi } from '../../shared/types';
import { el, layer } from './dom';
import { withPortrait } from './portraits';

const T = strings.ui.scene;
const PICTURES: Record<SceneId, string> = { cafe: cafeUrl, study: studyUrl };
const ABOUT: Record<SceneId, string> = { cafe: T.cafeAbout, study: T.studyAbout };
/** How long the staff take to carry the boxes over before the new room appears. */
export const MOVING_MS = 1600;

/** Two pictures to pick where the shop is, the one picked marked. Calls back with each pick. */
export function scenePicker(current: SceneId, onPick: (scene: SceneId) => void): HTMLElement {
  const row = el('div.scene-picker', { role: 'radiogroup', 'aria-label': T.label });
  const buttons = SCENES.map((id) => {
    const img = el('img.scene-picture', { src: PICTURES[id], alt: '' });
    const b = el('button.scene-choice', { type: 'button', role: 'radio', title: ABOUT[id] }, img, el('span.scene-name', {}, T[id])) as HTMLButtonElement;
    b.addEventListener('click', () => { mark(id); onPick(id); });
    return b;
  });
  const mark = (picked: SceneId) => buttons.forEach((b, i) => {
    const on = SCENES[i] === picked;
    b.classList.toggle('picked', on);
    b.setAttribute('aria-checked', String(on));
  });
  mark(current);
  row.append(...buttons);
  return row;
}

/**
 * The staff carry the boxes over (a short card), then the page reloads into the new room.
 * Resolves false, with nothing changed, while a commission runs.
 */
export async function moveTo(api: LamplightApi, scene: SceneId): Promise<boolean> {
  if (scene === homeScene()) return true;
  const card = el('div.moving.paper', { role: 'status' }, withPortrait('xiaoju', 'happy', el('div.card-title', {}, T.moving)));
  layer().append(card);
  await new Promise((r) => setTimeout(r, MOVING_MS));
  const ok = await api.moveScene(scene);
  if (!ok) card.remove();
  return ok;
}

/** The settings row: pick a room, then move there. */
export function sceneRow(api: LamplightApi): HTMLElement {
  let picked = homeScene();
  const note = el('div.hint', {}, ABOUT[picked]);
  const move = el('button.sticker', { type: 'button', hidden: true }, T.move) as HTMLButtonElement;
  const picker = scenePicker(picked, (id) => {
    picked = id;
    note.textContent = id === homeScene() ? `${ABOUT[id]} ${T.here}` : ABOUT[id];
    move.hidden = id === homeScene();
  });
  note.textContent = `${ABOUT[picked]} ${T.here}`;
  move.addEventListener('click', async () => {
    move.disabled = true;
    if (!(await moveTo(api, picked))) note.textContent = T.busy;
    move.disabled = false;
  });
  return el('div', {}, picker, note, el('div.actions', {}, move));
}
