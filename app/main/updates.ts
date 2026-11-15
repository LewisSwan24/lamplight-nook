import type { Locale } from '../shared/i18n';
import type { UpdateOffer } from '../shared/types';

/**
 * New versions of the shop (road-to-1.1.md A1). It looks once on opening and every six hours after, only looks:
 * the postman brings a letter, and nothing is downloaded until the user says "update". What is downloaded goes in
 * as the shop closes, after a copy of the data is put aside, so a commission is never cut off by a restart.
 * The Store build never looks: the Store updates it. Pure apart from the timer; index.ts hands it electron-updater.
 */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Release notes as electron-updater gives them: GitHub's rendered page, Markdown from a feed, or one per version. */
export type ReleaseNotes = string | { version: string; note?: string | null }[] | null | undefined;
/** A version newer than this one. */
export type Found = { version: string; notes: ReleaseNotes };

/** What the shop needs from the updater. check() resolves null when this is the newest version, and throws when it can't find out. */
export type Updater = {
  check(): Promise<Found | null>;
  download(): Promise<void>;
  /** Start the installer for what was downloaded; the shop is on its way out. */
  install(): void;
};

type Log = { info(message: string, detail?: unknown): void; warn(message: string, detail?: unknown): void };

export class Updates {
  /** The version the postman last brought a letter about: the same one comes once a run. */
  private told?: string;
  /** Downloaded and waiting for the shop to close. */
  private ready?: string;
  private fetching = false;

  constructor(private o: {
    /** The Microsoft Store build, which the Store keeps up to date. */
    store: boolean;
    /** The user's switch in settings. */
    wanted: () => boolean;
    updater: Updater;
    /** Put the data files aside before the version goes in; where they went. */
    backUp: (version: string) => string | undefined;
    tell: (offer: UpdateOffer) => void;
    log: Log;
    lang: Locale;
  }) {}

  start() {
    if (this.o.store) return;
    void this.check();
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  async check(): Promise<void> {
    if (this.o.store || !this.o.wanted() || this.ready || this.fetching) return;
    let found: Found | null;
    try {
      found = await this.o.updater.check();
    } catch (err) {
      // Offline, or GitHub out of reach: it looks again in six hours, and there is nothing for the user to do about it.
      this.o.log.info('update check failed', { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!found || found.version === this.told) return;
    this.told = found.version;
    this.o.tell({ version: found.version, notes: letterLines(found.notes, this.o.lang) });
  }

  /** The user said "update": fetch it now, to go in when the shop closes. False if it could not be fetched. */
  async download(): Promise<boolean> {
    const version = this.told;
    if (!version || this.fetching) return false;
    if (this.ready) return true;
    this.fetching = true;
    try {
      await this.o.updater.download();
    } catch (err) {
      this.o.log.warn('update download failed', { version, error: err instanceof Error ? err.message : String(err) });
      // The next look brings the letter again.
      this.told = undefined;
      return false;
    } finally {
      this.fetching = false;
    }
    this.ready = version;
    this.o.log.info('update downloaded', { version });
    return true;
  }

  /**
   * The shop is closing for real (not to the tray, and any commission has been let finish or stopped by then):
   * a downloaded version goes in now. Without the copy of the data nothing is installed.
   */
  quitting() {
    if (!this.ready) return;
    const backup = this.o.backUp(this.ready);
    this.o.log.info('update install', { version: this.ready, backup });
    this.o.updater.install();
  }
}

const HAN = /[一-鿿]/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * The release notes as lines for the letter. Notes on GitHub carry both languages, each under its own heading
 * (release-notes/v*.md), so only the part in the shop's language is kept; notes in one language are kept whole.
 * Headings go (the letter names the version), bold runs and links become plain words, and list items start with "· ".
 */
export function letterLines(notes: ReleaseNotes, lang: Locale): string[] {
  const note = Array.isArray(notes) ? notes[0]?.note : notes;
  if (!note) return [];
  const text = note
    .replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>|<\/?(p|div|ul|ol|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  type Part = { head: string; lines: string[] };
  const parts: (Part & { level: number })[] = [];
  const lines = decode(text).split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const levels = lines.map((l) => /^(#{1,6}) /.exec(l)?.[1].length ?? 0).filter(Boolean);
  const top = levels.length ? Math.min(...levels) : 0;
  let part: Part & { level: number } = { head: '', lines: [], level: 0 };
  parts.push(part);
  for (const line of lines) {
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (heading && heading[1].length === top) {
      part = { head: heading[2], lines: [], level: top };
      parts.push(part);
      continue;
    }
    const plain = (heading ? heading[2] : line)
      .replace(/^[-*+] +/, '· ')
      .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`/g, '');
    part.lines.push(plain);
  }
  const mine = parts.filter((p) => p.head && HAN.test(p.head) === (lang === 'zh-CN'));
  return (mine.length ? mine.slice(0, 1) : parts).flatMap((p) => p.lines);
}
