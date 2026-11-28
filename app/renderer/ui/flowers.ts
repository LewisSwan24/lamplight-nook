import flowersUrl from '../../../assets/sprites/flowers.png';
import flowersData from '../../../assets/sprites/flowers.json';
import { daysBetween, stageOf, type FlowerId, type Vase } from '../../shared/flowers';
import { fill, strings } from '../../shared/i18n';
import type { GuestId } from '../../shared/types';
import { vaseFrame } from '../game/FlowerStand';
import { el } from './dom';
import { closeButton, replaceOpen } from './panels';

/**
 * Today's flowers (plan-2.0.md J12): the card that stands on the flower shop's counter, opened. Each vase on the stand,
 * drawn as it is, with what is in it, how far open, and when it came in, or who took it; then who has been in for
 * flowers today.
 */
const FRAMES = (flowersData as { frames: Record<string, number[]> }).frames;
const SHEET_W = Math.max(...Object.values(FRAMES).map(([x, , w]) => x + w));
const SCALE = 2;

/** A vase as on the stand, from flowers.png. */
function picture(frame: string): HTMLElement {
  const [x, y, w, h] = FRAMES[frame];
  return el('span.flower-vase', {
    'data-frame': frame,
    style: `background-image:url(${flowersUrl});background-size:${SHEET_W * SCALE}px auto;background-position:-${x * SCALE}px -${y * SCALE}px;width:${w * SCALE}px;height:${h * SCALE}px`,
  });
}

const cameWhen = (came: string, day: string): string => {
  const C = strings.ui.flowers.came;
  const n = daysBetween(came, day);
  return n <= 0 ? C.today : n === 1 ? C.yesterday : fill(C.ago, { n });
};

export function showTodayFlowers(at: { day: string; vases: Vase[]; sold: { who: GuestId; flower: FlowerId }[] }) {
  const F = strings.ui.flowers;
  const rows = at.vases.map((v, slot) => {
    const b = v.bunch!;
    const about = v.soldTo
      ? fill(F.sold, { who: strings.guests[v.soldTo] })
      : `${F.stages[stageOf(b, at.day)]} · ${cameWhen(b.came, at.day)}`;
    return el('li.flower-row', { 'data-slot': String(slot), 'data-flower': b.flower, ...(v.soldTo ? { 'data-sold': v.soldTo } : {}) },
      picture(vaseFrame(v, at.day)), el('span.flower-name', {}, F.names[b.flower]), el('span.flower-about', {}, about));
  });
  const sold = at.sold.length
    ? el('ul.flower-sold', {}, ...at.sold.map((s) => el('li', {}, fill(F.bought, { who: strings.guests[s.who], flower: F.names[s.flower] }))))
    : el('p.flower-none', {}, F.empty);
  replaceOpen(el('div.card.paper.flowers-card', {},
    closeButton(),
    el('div.card-scroll', {},
      el('div.card-title', {}, F.title),
      el('p.flowers-intro', {}, F.intro),
      el('ul.flower-rows', {}, ...rows),
      el('h4.flowers-sold-title', {}, F.soldToday),
      sold)));
}
