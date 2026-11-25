/**
 * Where the shop is (plan.md R4): the cafe on the street, or the study at home. Both share one floor plan
 * (renderer/game/layout.ts), so the staff move, sit and work the same way in each; the furniture, the names
 * of the spots and a few lines that mention them change. Like the language, the scene is fixed for the life
 * of a page: the main process hands it to the preload, and moving reloads the page. Going into one of the other
 * rooms along the street does not (road-to-1.4.md D2).
 */
export const SCENES = ['cafe', 'study'] as const;
/** Where the home shop can be: the counter, Adeng and what the shop gathered are there (road-to-1.4.md Q-D4). */
export type SceneId = (typeof SCENES)[number];
export const DEFAULT_SCENE: SceneId = 'cafe';

export const cleanScene = (v: unknown): SceneId | undefined => (SCENES.includes(v as SceneId) ? (v as SceneId) : undefined);

/** Every room a page can show: the two the home shop can be in, and the shops along the street (D2; the bakery and the post office since plan-1.6.md F1 and F2). */
export const ROOMS = [...SCENES, 'print', 'studio', 'workshop', 'bakery', 'post'] as const;
export type RoomId = (typeof ROOMS)[number];
export const cleanRoom = (v: unknown): RoomId | undefined => (ROOMS.includes(v as RoomId) ? (v as RoomId) : undefined);
/** One of the rooms the home shop can be in. */
export const isScene = (room: RoomId): room is SceneId => (SCENES as readonly string[]).includes(room);

/**
 * Where the home shop is (from the preload; the cafe where there is none, as in tests). The other rooms are built
 * knowing which they are, and going into one needs no reload (road-to-1.4.md D2).
 */
export const homeScene = (): SceneId => cleanScene((globalThis as { lamplightHome?: unknown }).lamplightHome) ?? DEFAULT_SCENE;

/**
 * Keep what belongs to a scene: an entry marked `scene` is left out elsewhere, and in its own scene it
 * replaces the unmarked entry with the same id (the same moment, said to fit the place).
 */
export function forScene<T extends { id: string; scene?: string }>(items: T[], scene: RoomId): T[] {
  const mine = new Map(items.filter((i) => i.scene === scene).map((i) => [i.id, i]));
  const out: T[] = [];
  for (const i of items) {
    if (i.scene) continue;
    out.push(mine.get(i.id) ?? i);
    mine.delete(i.id);
  }
  // Lines only this scene has come first, so the place shows in what is said.
  return [...items.filter((i) => i.scene === scene && mine.has(i.id)), ...out];
}
