import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RawAgentEvent } from '../shared/types';
import { redactSecrets } from './api-key';

const MAX_TEXT = 2000;
/** Records of runs kept: they are for looking into a problem soon after it happened, not an archive. */
export const MAX_RECORDINGS = 50;

/** File names start with the time, so the oldest sort first. Keeps the newest `keep`. */
export function pruneRecordings(dir: string, keep = MAX_RECORDINGS) {
  if (!existsSync(dir)) return;
  const names = readdirSync(dir).sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    // Antivirus or an indexer may be holding it: it goes next time, and a shop must not fail to open over it.
    try {
      rmSync(join(dir, name), { force: true });
    } catch {
      continue;
    }
  }
}

/** Truncate long strings so recordings don't fill up with whole command outputs, and mask anything shaped like a key. */
export function truncateDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    const text = redactSecrets(value);
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...[truncated ${text.length - MAX_TEXT} chars]` : text;
  }
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => truncateDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // Defensive: never write anything that looks like a credential.
    if (/api[_-]?key|token|secret|authorization/i.test(k)) continue;
    out[k] = truncateDeep(v, depth + 1);
  }
  return out;
}

/** Appends events to a JSONL file, one JSON object per line. */
export class Recorder {
  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  write(event: RawAgentEvent): RawAgentEvent {
    const safe = { ...event, payload: truncateDeep(event.payload) };
    appendFileSync(this.path, `${JSON.stringify(safe)}\n`, 'utf8');
    return safe;
  }
}
