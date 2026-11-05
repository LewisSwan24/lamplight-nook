import { DEFAULT_SCENE, cleanScene } from '../shared/scenes';
import { cleanFurnishing, cleanFurnishings } from '../shared/furnish';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { putAside } from './aside';
import { dirname, join } from 'node:path';
import { DEFAULT_AVATAR, cleanAvatar } from '../shared/avatars';
import { strings } from '../shared/i18n';
import { BUDGET_CHOICES, type LanguageChoice, type Settings } from '../shared/types';

/** Default folder for commissions: ~/Documents/<app>/<commissions> (folder names come from the locale). */
export const defaultWorkRoot = (documentsDir: string) => join(documentsDir, ...strings.app.commissionRoot);

const DEFAULT_VOLUME = 70;
/** About the cost of one or two demo-sized commissions. */
const DEFAULT_BUDGET = 3;

const LANGUAGES: readonly LanguageChoice[] = ['system', 'zh-CN', 'en'];
const cleanLanguage = (v: unknown) => (LANGUAGES.includes(v as LanguageChoice) ? (v as LanguageChoice) : undefined);

const cleanBudget = (v: unknown) => (BUDGET_CHOICES as readonly unknown[]).includes(v) ? (v as number) : undefined;

/** A whole number from 0 to 100, or undefined for anything that isn't a number. */
const cleanVolume = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : undefined);

/** User settings kept as JSON in the app's data folder. Unknown or broken files fall back to defaults. */
export class SettingsStore {
  private data: Settings;
  /** The file could not be read when the shop opened, for the shop to tell the user. */
  damaged = false;

  constructor(private file: string, documentsDir: string) {
    const defaults: Settings = { name: '', avatar: DEFAULT_AVATAR, workRoot: defaultWorkRoot(documentsDir), onboarded: false, muted: false, detailed: false, volume: DEFAULT_VOLUME, captions: false, reducedMotion: false, notify: true, closeToTray: false, mini: true, scene: DEFAULT_SCENE, furnish: cleanFurnishings(undefined), budgetUsd: DEFAULT_BUDGET, language: 'system' };
    this.data = { ...defaults, ...this.read() };
    if (!this.data.workRoot) this.data.workRoot = defaults.workRoot;
    this.data.volume = cleanVolume(this.data.volume) ?? DEFAULT_VOLUME;
    this.data.budgetUsd = cleanBudget(this.data.budgetUsd) ?? DEFAULT_BUDGET;
    this.data.language = cleanLanguage(this.data.language) ?? 'system';
    this.data.avatar = cleanAvatar(this.data.avatar) ?? DEFAULT_AVATAR;
    this.data.scene = cleanScene(this.data.scene) ?? DEFAULT_SCENE;
    this.data.furnish = cleanFurnishings(this.data.furnish);
  }

  get(): Settings {
    return { ...this.data };
  }

  update(patch: Partial<Settings>): Settings {
    const clean: Partial<Settings> = {};
    if (typeof patch.name === 'string') clean.name = patch.name.trim().slice(0, 20);
    if (typeof patch.workRoot === 'string' && patch.workRoot.trim()) clean.workRoot = patch.workRoot.trim();
    for (const flag of ['onboarded', 'muted', 'detailed', 'captions', 'reducedMotion', 'notify', 'closeToTray', 'mini'] as const) {
      if (typeof patch[flag] === 'boolean') clean[flag] = patch[flag];
    }
    const avatar = cleanAvatar(patch.avatar);
    if (avatar !== undefined) clean.avatar = avatar;
    const volume = cleanVolume(patch.volume);
    if (volume !== undefined) clean.volume = volume;
    const budget = cleanBudget(patch.budgetUsd);
    if (budget !== undefined) clean.budgetUsd = budget;
    const scene = cleanScene(patch.scene);
    if (scene) clean.scene = scene;
    // Furnishing is saved one scene at a time; the other scene keeps its own.
    if (patch.furnish && typeof patch.furnish === 'object') {
      const next = { ...this.data.furnish };
      for (const s of ['cafe', 'study'] as const) if (s in patch.furnish) next[s] = cleanFurnishing((patch.furnish as Record<string, unknown>)[s]);
      clean.furnish = next;
    }
    const language = cleanLanguage(patch.language);
    if (language) clean.language = language;
    this.data = { ...this.data, ...clean };
    mkdirSync(dirname(this.file), { recursive: true });
    // Write then rename so a crash never leaves a half-written file.
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
    return this.get();
  }

  private read(): Partial<Settings> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof parsed !== 'object' || !parsed || Array.isArray(parsed)) throw new Error('not settings');
      return parsed;
    } catch {
      putAside(this.file);
      this.damaged = true;
      return {};
    }
  }
}
