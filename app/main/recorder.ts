import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RawAgentEvent } from '../shared/types';

const MAX_TEXT = 2000;

/** Truncate long strings so recordings don't fill up with whole command outputs. */
export function truncateDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}...[truncated ${value.length - MAX_TEXT} chars]` : value;
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
