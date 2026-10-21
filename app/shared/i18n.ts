// All user-facing Chinese text lives in locales/zh-CN.json; code only refers to keys.
import zh from '../../locales/zh-CN.json';

export const strings = zh;

/** Fill `{name}` placeholders. Unknown placeholders are left as-is. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Build a RegExp from a pattern stored in the locale file. */
export const pattern = (key: keyof typeof zh.patterns, flags = 'i') => new RegExp(zh.patterns[key], flags);
