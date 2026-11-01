/**
 * Where the shop is (plan.md R4): the cafe on the street, or the study at home. Both share one floor plan
 * (renderer/game/layout.ts), so the staff move, sit and work the same way in each; the furniture, the names
 * of the spots and a few lines that mention them change. Like the language, the scene is fixed for the life
 * of a page: the main process hands it to the preload, and moving reloads the page.
 */
export const SCENES = ['cafe', 'study'] as const;
export type SceneId = (typeof SCENES)[number];
export const DEFAULT_SCENE: SceneId = 'cafe';

export const cleanScene = (v: unknown): SceneId | undefined => (SCENES.includes(v as SceneId) ? (v as SceneId) : undefined);

/** The scene of this page (from the preload; the cafe where there is none, as in tests). */
export const currentScene = (): SceneId => cleanScene((globalThis as { lamplightScene?: unknown }).lamplightScene) ?? DEFAULT_SCENE;

/**
 * Keep what belongs to a scene: an entry marked `scene` is left out elsewhere, and in its own scene it
 * replaces the unmarked entry with the same id (the same moment, said to fit the place).
 */
export function forScene<T extends { id: string; scene?: string }>(items: T[], scene: SceneId): T[] {
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
