import cafeUrl from '../../assets/sprites/cafe.png';
import adengUrl from '../../assets/sprites/adeng.png';
import catUrl from '../../assets/sprites/cat.png';
import emotesUrl from '../../assets/ui/emotes.png';
import { fill, strings } from '../shared/i18n';
import { MINI_IDLE, type MiniState } from '../shared/mini';
import { CAT_FRAME, STAFF_ANIMS, STAFF_FRAME, staffFrames } from './game/sprites';
import { EMOTES } from './ui/emotes';

const M = strings.ui.mini;
/** The part of the shop the window shows, in art pixels: the counter and the floor in front of it. */
const VIEW = { x: 200, y: 44, w: 96, h: 60 } as const;
/** Where Adeng stands (feet) and the cat naps, in shop coordinates (game/layout.ts anchors). */
const ADENG = { x: 244, y: 98 };
const CAT = { x: 206, y: 86 };
/** Frames per second while something is happening, and while the shop just waits (saves the battery). */
const FPS_BUSY = 8;
const FPS_IDLE = 2;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const status = document.querySelector<HTMLElement>('#status')!;
document.title = M.title;
document.querySelector('#stage')!.setAttribute('aria-label', M.open);

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = fail;
  img.src = src;
});

let state: MiniState = MINI_IDLE;
let frame = 0;

function line(s: MiniState): string {
  if (s.status === 'working') return s.what ? fill(M.working, { what: s.what }) : fill(M.working, { what: '…' });
  return M[s.status];
}

function show(next: MiniState) {
  state = next;
  document.body.dataset.status = next.status;
  status.textContent = line(next);
  status.title = status.textContent;
}

async function start() {
  const [cafe, adeng, cat, emotes] = await Promise.all([load(cafeUrl), load(adengUrl), load(catUrl), load(emotesUrl)]);
  const draw = () => {
    ctx.clearRect(0, 0, VIEW.w, VIEW.h);
    ctx.drawImage(cafe, VIEW.x, VIEW.y, VIEW.w, VIEW.h, 0, 0, VIEW.w, VIEW.h);
    // The cat naps on the floor whatever happens; it breathes slowly.
    const catFrames = cat.width / CAT_FRAME.width;
    const c = Math.floor(frame / 3) % catFrames;
    ctx.drawImage(cat, c * CAT_FRAME.width, 0, CAT_FRAME.width, CAT_FRAME.height, CAT.x - VIEW.x, CAT.y - VIEW.y, CAT_FRAME.width, CAT_FRAME.height);
    const frames = staffFrames(state.pose, 'down');
    const f = frames[frame % frames.length];
    const { width: w, height: h, perRow } = STAFF_FRAME;
    ctx.drawImage(adeng, (f % perRow) * w, Math.floor(f / perRow) * h, w, h, ADENG.x - VIEW.x - w / 2, ADENG.y - VIEW.y - h, w, h);
    if (state.bubble) {
      const i = EMOTES.indexOf(state.bubble) * 2 + (Math.floor(frame / 4) % 2);
      ctx.drawImage(emotes, i * 16, 0, 16, 16, ADENG.x - VIEW.x + 4, ADENG.y - VIEW.y - h - 12, 16, 16);
    }
  };
  const tick = () => {
    frame++;
    draw();
    const quiet = state.status === 'idle' || document.hidden;
    const fps = quiet ? FPS_IDLE : Math.min(FPS_BUSY, STAFF_ANIMS[state.pose].fps);
    setTimeout(tick, 1000 / fps);
  };
  tick();
}

const back = () => void window.lamplight.showShop();
document.querySelector('#stage')!.addEventListener('click', back);
status.addEventListener('click', back);
window.lamplight.onMiniState(show);
void window.lamplight.miniState().then(show);
void start();
