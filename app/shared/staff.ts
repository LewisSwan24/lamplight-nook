import type { RoomId } from './scenes';
import type { ActorId, AiEvent } from './types';

/** Who performs an agent's events. Unrecognized subagents are played by Xiaoju. */
export const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };

/** Everyone who works in the shop, in the order of the portraits; Xiaodou the apprentice last (road-to-1.1.md A5). */
export const STAFF: ActorId[] = ['adeng', 'xiaoju', 'laoshi', 'qingdai', 'xiaodou'];

/**
 * Those who keep the shops along the street (road-to-1.4.md D2): Pica the typesetter, Umber the painter, Tack the tinkerer, and
 * since plan-1.6.md F1 Auntie Gui the baker, who was a neighbour dropping in and now has her own shop open to the user, and
 * since F2 Axin the postman, at the post office; since plan-2.0.md J2 Fern at the flower shop and Uncle Page at the
 * bookshop, on the river street.
 */
export const SHOP_STAFF: ActorId[] = ['aqian', 'xiaozhe', 'xiaoding', 'guiyi', 'axin', 'fangjie', 'jianbo'];
/** Everyone, in the order of the portraits. */
export const ALL_STAFF: ActorId[] = [...STAFF, ...SHOP_STAFF];

/**
 * Who is in each room. The rest are elsewhere, out of sight beyond the door, and come in only when sent: Adeng with an
 * order from home, or another shop's person bringing back what they made for this one (road-to-1.4.md D3).
 */
export const ROOM_CREW: Record<RoomId, ActorId[]> = {
  cafe: [...STAFF, 'cat'],
  study: [...STAFF, 'cat'],
  print: ['aqian'],
  studio: ['xiaozhe'],
  workshop: ['xiaoding'],
  bakery: ['guiyi'],
  post: ['axin'],
  flowershop: ['fangjie'],
  bookshop: ['jianbo'],
};

/**
 * The apprentice comes once this many works are finished with the user, and stays. Xiaodou only runs the errands that
 * would otherwise wait for Xiaoju; no subagent of their own, so nothing extra to pay.
 */
export const APPRENTICE_AT = 10;
export const apprenticeHere = (done: number) => done >= APPRENTICE_AT;
/** The work that brings the apprentice: worth a word, and a line in the shop's days. */
export const apprenticeNews = (before: number, after: number) => !apprenticeHere(before) && apprenticeHere(after);

/**
 * The apprentice grows up (plan-1.9.md I2): just come, handy from 30 of their own works (shared/crew.ts), grown from 80.
 * Each stage has a look of its own and a way of talking (lines marked `stage`).
 */
export const APPRENTICE_STAGES = [30, 80] as const;
export type ApprenticeStage = 1 | 2 | 3;
export const apprenticeStage = (works: number): ApprenticeStage => (works >= APPRENTICE_STAGES[1] ? 3 : works >= APPRENTICE_STAGES[0] ? 2 : 1);
/** The stage a work brings, when it brings one: worth a word from Wick, and a line in the shop's days. */
export const stageNews = (before: number, after: number): ApprenticeStage | null => {
  const now = apprenticeStage(after);
  return now > apprenticeStage(before) ? now : null;
};
/** The sprite sheet of each stage: the first is the one Bean came in. */
export const apprenticeLook = (stage: ApprenticeStage) => (stage === 1 ? 'xiaodou' : `xiaodou-${stage}`);
