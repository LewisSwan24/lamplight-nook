import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { redactSecrets } from './api-key';

export type Level = 'info' | 'warn' | 'error';

const KEEP_DAYS = 7;
const MAX_LINE = 4000;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A plain daily log in the app's data folder, kept for a week. It records what the app did (started, a run
 * began or ended and how, something crashed), never what a commission was about, and masks anything shaped
 * like a key. Nothing is uploaded; people can export it themselves from settings.
 */
export class Log {
  constructor(readonly dir: string, private now: () => Date = () => new Date()) {
    mkdirSync(dir, { recursive: true });
  }

  write(level: Level, message: string, detail?: unknown) {
    const at = this.now();
    let line = `${at.toISOString()} ${level.toUpperCase()} ${message}`;
    if (detail !== undefined) line += ` ${detail instanceof Error ? detail.stack ?? detail.message : safeJson(detail)}`;
    line = redactSecrets(line).replace(/\r?\n/g, '\n    ').slice(0, MAX_LINE);
    try {
      appendFileSync(join(this.dir, `main-${day(at)}.log`), `${line}\n`, 'utf8');
    } catch {
      // A full disk must not take the app down with it.
    }
  }

  info(message: string, detail?: unknown) { this.write('info', message, detail); }
  warn(message: string, detail?: unknown) { this.write('warn', message, detail); }
  error(message: string, detail?: unknown) { this.write('error', message, detail); }

  /** Delete logs older than a week. */
  prune() {
    const oldest = day(new Date(this.now().getTime() - (KEEP_DAYS - 1) * 86_400_000));
    for (const name of this.files()) {
      const m = /^main-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
      if (m && m[1] < oldest) rmSync(join(this.dir, name), { force: true });
    }
  }

  files(): string[] {
    try {
      return readdirSync(this.dir).filter((n) => n.endsWith('.log')).sort();
    } catch {
      return [];
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
