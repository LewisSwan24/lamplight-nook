import { fill, strings } from '../../shared/i18n';
import type { ActorId } from '../../shared/types';
import type { CafeScene, Target } from '../game/CafeScene';
import { el, layer } from './dom';

const A = strings.ui.access;
const buttons = new Map<Target, HTMLButtonElement>();
let box: HTMLElement | null = null;

const PLACES: Partial<Record<Target, string>> = {
  counter: A.hotspotCounter, bell: A.hotspotBell, backdoor: A.hotspotGarden, shopdoor: A.hotspotShop,
  dog: fill(A.hotspotCat, { name: strings.animals.dog }), hens: A.hotspotHens, beds: A.hotspotBeds, works: A.hotspotWorks, board: A.hotspotBoard,
};
const O = strings.ui.objects;
const objectName = (id: string): string | undefined =>
  id.startsWith('grow-') ? O.grown[id.slice(5) as keyof typeof O.grown] : O.names[id as keyof typeof O.names];
const label = (id: Target) => PLACES[id] ?? objectName(id) ?? fill(id === 'cat' ? A.hotspotCat : A.hotspotActor, { name: strings.actors[id as ActorId] });

/**
 * Invisible buttons over the counter, the doors and each character, so the shop works from the keyboard:
 * Tab moves between them (showing the name and glow), Enter does what a click does.
 * Call every frame with the canvas's place on screen and its scale.
 */
export function updateHotspots(scene: CafeScene, rect: DOMRect, scale: number) {
  if (!box) {
    box = el('div.hotspots');
    layer().append(box);
  }
  const seen = new Set<Target>();
  for (const h of scene.hotspots()) {
    seen.add(h.id);
    let b = buttons.get(h.id);
    if (!b) {
      b = el('button.hotspot', { 'aria-label': label(h.id), onclick: () => scene.activate(h.id) }) as HTMLButtonElement;
      b.addEventListener('focus', () => scene.highlight(h.id));
      b.addEventListener('blur', () => scene.highlight(null));
      buttons.set(h.id, b);
      box.append(b);
    }
    Object.assign(b.style, { left: `${rect.left + h.x * scale}px`, top: `${rect.top + h.y * scale}px`, width: `${h.w * scale}px`, height: `${h.h * scale}px` });
  }
  for (const [id, b] of buttons) b.hidden = !seen.has(id);
}
