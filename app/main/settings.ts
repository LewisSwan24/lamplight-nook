import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { strings } from '../shared/i18n';
import type { Settings } from '../shared/types';

/** Default folder for commissions: ~/Documents/<app>/<commissions> (folder names come from the locale). */
export const defaultWorkRoot = (documentsDir: string) => join(documentsDir, ...strings.app.commissionRoot);

/** User settings kept as JSON in the app's data folder. Unknown or broken files fall back to defaults. */
export class SettingsStore {
  private data: Settings;

  constructor(private file: string, documentsDir: string) {
    const defaults: Settings = { name: '', workRoot: defaultWorkRoot(documentsDir), onboarded: false, muted: false, detailed: false };
    this.data = { ...defaults, ...this.read() };
    if (!this.data.workRoot) this.data.workRoot = defaults.workRoot;
  }

  get(): Settings {
    return { ...this.data };
  }

  update(patch: Partial<Settings>): Settings {
    const clean: Partial<Settings> = {};
    if (typeof patch.name === 'string') clean.name = patch.name.trim().slice(0, 20);
    if (typeof patch.workRoot === 'string' && patch.workRoot.trim()) clean.workRoot = patch.workRoot.trim();
    for (const flag of ['onboarded', 'muted', 'detailed'] as const) {
      if (typeof patch[flag] === 'boolean') clean[flag] = patch[flag];
    }
    this.data = { ...this.data, ...clean };
    mkdirSync(dirname(this.file), { recursive: true });
    // Write then rename so a crash never leaves a half-written file.
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
    return this.get();
  }

  private read(): Partial<Settings> {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }
}
