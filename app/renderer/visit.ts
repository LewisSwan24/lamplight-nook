import Phaser from 'phaser';
import frontsUrl from '../../assets/sprites/town-fronts.png';
import signsUrl from '../../assets/sprites/town-signs.png';
import streetUrl from '../../assets/sprites/town-street.png';
import { fill, locale, strings } from '../shared/i18n';
import { type Postcard, postcardDays } from '../shared/postcard';
import { apprenticeHere } from '../shared/staff';
import { leftBehind } from '../shared/stories';
import type { ShopId } from '../shared/town';
import { townCounts } from '../shared/towngrow';
import { CafeScene } from './game/CafeScene';
import { CANVAS, integerScale, toolIconPx, uiScale } from './game/layout';
import { ACTIVE_FPS } from './game/pacer';
import { StreetScene } from './game/StreetScene';
import { FRONTS, TOWN } from './game/town';
import { el, layer } from './ui/dom';

/**
 * Someone else's shop, from a postcard (docs/plan-1.5.md E3). The postcard comes first, then the shop itself, read-only:
 * the room as they furnished it, what grew there, their street. The staff are in but not working, and no neighbour calls.
 * This page can reach nothing but the postcard and the way home (preload/visit.ts).
 */
declare global {
  interface Window { lamplightVisit: { card: Postcard | null; home(): Promise<void> } }
}

const V = strings.ui.visit;
/** The neighbours' shops: a visitor's click on their door gets what they always say (the river street's since plan-2.0.md J2). */
const NEIGHBOURS: string[] = ['bakery', 'post', 'flowershop', 'bookshop'];
const card = window.lamplightVisit.card;
const home = () => void window.lamplightVisit.home();

document.documentElement.lang = locale();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') home();
});

/** The shop's front off the street's own drawing, on a canvas: the picture on the postcard. */
async function frontPicture(id: ShopId): Promise<HTMLCanvasElement> {
  const front = FRONTS.find((f) => f.id === id)!;
  const x = Math.max(0, front.x - 8);
  const w = Math.min(TOWN.width - x, front.w + 16);
  const h = TOWN.kerb + 12;
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h, className: 'postcard-picture' });
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (const url of [streetUrl, frontsUrl, signsUrl]) {
    const img = new Image();
    img.src = url;
    await img.decode();
    g.drawImage(img, x, 0, w, h, 0, 0, w, h);
  }
  return canvas;
}

function fit(game: Phaser.Game) {
  game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight, window.devicePixelRatio));
  const ui = uiScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty('--ui', String(ui));
  document.documentElement.style.setProperty('--tool-px', String(toolIconPx(ui, window.devicePixelRatio)));
}

async function visit(card: Postcard) {
  document.title = fill(V.title, { name: card.name });
  const room = new CafeScene(card.home);
  const street = new StreetScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: CANVAS.width,
    height: CANVAS.height,
    pixelArt: true,
    backgroundColor: '#1b1712',
    scene: [room, street],
    scale: { mode: Phaser.Scale.NONE },
    input: { windowEvents: false },
    fps: { limit: ACTIVE_FPS },
  });
  window.addEventListener('resize', () => fit(game));
  fit(game);
  // For the acceptance scenario: which room this is and what it shows.
  (window as unknown as { visitDebug: unknown }).visitDebug = { room, street };

  // The postcard first, while the shop is drawn behind it.
  const enter = el('button.default.postcard-enter', { type: 'button' }, V.enter);
  const picture = el('div.postcard-front', {}, await frontPicture(card.home));
  const postcard = el('div.card.paper.postcard', { role: 'dialog', 'aria-label': fill(V.from, { name: card.name }) },
    el('div.postcard-face', {},
      picture,
      el('div.postcard-back', {},
        el('div.postcard-stamp', { 'aria-hidden': 'true' }, el('span', {}, V.stamp)),
        el('div.postcard-mark', { 'aria-hidden': 'true' }),
        el('div.card-title.postcard-from', {}, fill(V.from, { name: card.name })),
        el('div.postcard-lines', { 'aria-hidden': 'true' }, el('i'), el('i'), el('i')))),
    el('div.actions', {}, el('button.postcard-home', { type: 'button', onclick: home }, V.home), enter));
  layer().append(postcard);
  enter.focus();

  await room.ready;
  const days = postcardDays(card);
  const counts = townCounts(days, card.home);
  room.setFurnishing(card.furnish[card.home]);
  room.setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
  room.growth.setGrown(days.grown);
  room.garden.setWorksDone(days.done);
  room.setApprentice(apprenticeHere(days.done), false);
  room.setTown(counts);
  street.setTown(counts);
  street.setStories([], leftBehind(days.town.stories));
  street.tint = () => room.tint;
  street.walker = () => room.streetWalker();
  street.outside = () => room.outside();
  street.calm = () => room.reducedMotion;

  // The street and the way home, along the top once in.
  let outside = false;
  const toStreet = el('button.sticker.visit-street', { type: 'button' }, V.street);
  const note = el('div.street-note.paper', { role: 'status', hidden: true });
  let noteTimer = 0;
  const say = (text: string) => {
    note.textContent = text;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => { note.hidden = true; }, 3500);
  };
  const goOut = (out: boolean) => {
    if (out === outside) return;
    outside = out;
    room.setOutside(out);
    if (out) game.scene.run('street', { at: card.home });
    else game.scene.sleep('street');
    toStreet.textContent = out ? V.inside : V.street;
    document.body.classList.toggle('outside', out);
  };
  toStreet.addEventListener('click', () => goOut(!outside));
  // Their own front takes you back in; the other shops stay closed to a visitor, the neighbours' say what they always say.
  street.onFront = (id) => {
    if (id === card.home) return goOut(false);
    say(NEIGHBOURS.includes(id) ? strings.ui.town.notes[id] : fill(V.onlyHere, { name: card.name }));
  };
  const bar = el('div.visit-bar.paper', { role: 'banner' },
    el('span.visit-where', {}, fill(V.banner, { name: card.name })), toStreet, el('button.sticker.visit-home', { type: 'button', onclick: home }, V.home));
  enter.addEventListener('click', () => {
    postcard.remove();
    layer().append(bar, note);
    (document.activeElement as HTMLElement | null)?.blur();
  });
}

if (card) void visit(card);
else layer().append(el('div.card.paper', {}, el('div.actions', {}, el('button.default', { type: 'button', onclick: home }, V.home))));
