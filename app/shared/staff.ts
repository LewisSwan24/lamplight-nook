import type { RoomId } from './scenes';
import type { ActorId, AiEvent } from './types';

/** Who performs an agent's events. Unrecognized subagents are played by Xiaoju. */
export const AGENT_ACTOR: Record<AiEvent['agent'], ActorId> = { main: 'adeng', researcher: 'xiaoju', designer: 'qingdai', reviewer: 'laoshi', unknown: 'xiaoju' };

/** Everyone who works in the shop, in the order of the portraits; Xiaodou the apprentice last (road-to-1.1.md A5). */
export const STAFF: ActorId[] = ['adeng', 'xiaoju', 'laoshi', 'qingdai', 'xiaodou'];

/**
 * Those who keep the shops along the street (road-to-1.4.md D2): Pica the typesetter, Umber the painter, Tack the tinkerer, and
 * since plan-1.6.md F1 Auntie Gui the baker, who was a neighbour dropping in and now has her own shop open to the user, and
 * since F2 Axin the postman, at the post office.
 */
export const SHOP_STAFF: ActorId[] = ['aqian', 'xiaozhe', 'xiaoding', 'guiyi', 'axin'];
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
};

/**
 * The apprentice comes once this many works are finished with the user, and stays. Xiaodou only runs the errands that
 * would otherwise wait for Xiaoju; no subagent of their own, so nothing extra to pay.
 */
export const APPRENTICE_AT = 10;
export const apprenticeHere = (done: number) => done >= APPRENTICE_AT;
/** The work that brings the apprentice: worth a word, and a line in the shop's days. */
export const apprenticeNews = (before: number, after: number) => !apprenticeHere(before) && apprenticeHere(after);
