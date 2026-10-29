// Imported first by the main process, so the language is set before any module reads its strings.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { pickLocale, setLocale } from '../shared/i18n';

/** The language chosen in settings, read straight from the file (the settings store isn't up yet). */
function chosen(): unknown {
  try {
    return JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')).language;
  } catch {
    return undefined;
  }
}

function systemLanguages(): string[] {
  const tags: string[] = [];
  try { tags.push(...app.getPreferredSystemLanguages()); } catch { /* not available before ready on every platform */ }
  tags.push(Intl.DateTimeFormat().resolvedOptions().locale);
  return tags;
}

// LAMPLIGHT_LANG overrides everything, for screenshots and tests.
setLocale(pickLocale(process.env.LAMPLIGHT_LANG ?? chosen(), systemLanguages()));
