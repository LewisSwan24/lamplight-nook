// -- Translation layer --
// All user-facing text lives in locales/<locale>.json; code only refers to keys.
// The language is fixed for the life of a process: the main process sets it before anything else loads
// (main/locale-boot.ts), and the renderer reads it from the preload. Changing it in settings restarts the app.
import zh from '../../locales/zh-CN.json';
import en from '../../locales/en.json';
import { homeScene, type RoomId } from './scenes';

export type Strings = typeof zh;
export type Locale = 'zh-CN' | 'en';
export const LOCALES: Record<Locale, Strings> = { 'zh-CN': zh, en };

const isLocale = (v: unknown): v is Locale => v === 'zh-CN' || v === 'en';

/**
 * Which language to show: the user's choice in settings, else the first system language we have,
 * else English. Any Chinese system language gets Simplified Chinese.
 */
export function pickLocale(choice: unknown, system: readonly string[]): Locale {
  if (isLocale(choice)) return choice;
  for (const tag of system) {
    if (/^zh\b/i.test(tag)) return 'zh-CN';
    if (/^en\b/i.test(tag)) return 'en';
  }
  return 'en';
}

// In the renderer the preload has put the language on the window before any of this runs.
const boot = (globalThis as { lamplightLocale?: unknown }).lamplightLocale;
let lang: Locale = isLocale(boot) ? boot : 'zh-CN';

/** Strings with a scene's own wording laid over them (`sceneText.<scene>`: the names of the spots, hints that mention them). */
export function withScene(S: Strings, scene: RoomId): Strings {
  const over = (S.sceneText as Record<string, unknown>)[scene];
  if (!over) return S;
  const merge = (base: unknown, top: unknown): unknown => {
    if (typeof top !== 'object' || top === null || typeof base !== 'object' || base === null) return top;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(top)) out[k] = merge(out[k], v);
    return out;
  };
  return merge(S, over) as Strings;
}

/** The strings of the current language. Modules may keep a reference to a part of it: it never changes after start-up. */
export let strings: Strings = withScene(LOCALES[lang], homeScene());

/** The strings as a room says them: the home shop's are `strings`, a room along the street lays its own words over them (D2). */
export const wordsIn = (room: RoomId): Strings => withScene(LOCALES[lang], room);

export const locale = () => lang;

/** Only for start-up (and tests): later changes would not reach parts other modules already hold. */
export function setLocale(next: Locale) {
  lang = next;
  strings = withScene(LOCALES[next], homeScene());
}

/** Fill `{name}` placeholders. Unknown placeholders are left as-is. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Build a RegExp from a pattern stored in the locale file. */
export const pattern = (key: keyof Strings['patterns'], flags = 'i', S: Strings = strings) => new RegExp(S.patterns[key], flags);

/** A short way to refer to something the user wrote: ten characters of Chinese, or a few words of English. */
export function shorten(text: string, S: Strings = strings): string {
  const max = S.app.briefLength;
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const cut = chars.slice(0, max).join('');
  const atWord = cut.lastIndexOf(' ');
  return /\s/.test(text) && atWord > max / 2 ? cut.slice(0, atWord) : cut;
}
