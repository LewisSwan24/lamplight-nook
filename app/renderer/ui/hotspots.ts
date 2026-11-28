import { fill, strings, wordsIn } from '../../shared/i18n';
import type { ActorId } from '../../shared/types';
import type { CafeScene, Target } from '../game/CafeScene';
import { SHOP_PET } from '../game/shoppets';
import { el, layer } from './dom';
import { flowerCardIndex } from '../game/FlowerStand';

const A = strings.ui.access;
const buttons = new Map<Target, HTMLButtonElement>();
let box: HTMLElement | null = null;
/** The room the buttons were made for: going into another one makes them again, with its names (D2). */
let shown: CafeScene | null = null;

const PLACES: Partial<Record<Target, string>> = {
  counter: A.hotspotCounter, bell: A.hotspotBell, backdoor: A.hotspotGarden, shopdoor: A.hotspotShop,
  dog: fill(A.hotspotCat, { name: strings.animals.dog }), hens: A.hotspotHens, beds: A.hotspotBeds, works: A.hotspotWorks, board: A.hotspotBoard,
};
const O = strings.ui.objects;
const objectName = (id: string): string | undefined =>
  id.startsWith('grow-') ? O.grown[id.slice(5) as keyof typeof O.grown] : O.names[id as keyof typeof O.names];
const wall = (id: Target, scene: CafeScene) => (id === 'cork' ? strings.ui.visit.wallEmpty : /^wall-\d$/.test(id) ? scene.wallLabel(Number(id.slice(5))) : undefined);
/** The flower shop's counter card and the flower cards on its wall (plan-2.0.md J12). */
const flowers = (id: Target, scene: CafeScene): string | undefined => {
  if (id === 'flowers') return strings.ui.flowers.label;
  const i = flowerCardIndex(id);
  return i !== null && scene.flowers?.titles[i] ? fill(strings.ui.flowers.wall, { title: scene.flowers.titles[i] }) : undefined;
};
/** The street shop's animal (plan-1.9.md I3), by its name. */
const pet = (scene: CafeScene) => fill(A.hotspotPet, { name: strings.animals[SHOP_PET[scene.room]!] });
const label = (id: Target, scene: CafeScene) => (id === 'counter' ? wordsIn(scene.room).ui.access.hotspotCounter : id === 'pet' ? pet(scene) : PLACES[id] ?? wall(id, scene) ?? flowers(id, scene)) ?? objectName(id) ?? fill(id === 'cat' ? A.hotspotCat : A.hotspotActor, { name: strings.actors[id as ActorId] });

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
  if (scene !== shown) {
    shown = scene;
    buttons.clear();
    box.replaceChildren();
  }
  const seen = new Set<Target>();
  for (const h of scene.hotspots()) {
    seen.add(h.id);
    let b = buttons.get(h.id);
    if (!b) {
      b = el('button.hotspot', { 'aria-label': label(h.id, scene), onclick: () => scene.activate(h.id) }) as HTMLButtonElement;
      b.addEventListener('focus', () => scene.highlight(h.id));
      b.addEventListener('blur', () => scene.highlight(null));
      buttons.set(h.id, b);
      box.append(b);
    }
    // A pinned postcard's place can come to hold another friend's card.
    if (h.id.startsWith('wall-') || h.id.startsWith('flowercard-')) b.setAttribute('aria-label', label(h.id, scene));
    Object.assign(b.style, { left: `${rect.left + h.x * scale}px`, top: `${rect.top + h.y * scale}px`, width: `${h.w * scale}px`, height: `${h.h * scale}px` });
  }
  for (const [id, b] of buttons) b.hidden = !seen.has(id);
}
