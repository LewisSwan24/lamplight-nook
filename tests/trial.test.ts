import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAll } from '../app/main/event-normalizer';
import type { RawAgentEvent } from '../app/shared/types';

describe.each(['zh-CN', 'en'])('the %s trial recording', (lang) => {
  const text = readFileSync(join(__dirname, '..', 'demo', `trial.${lang}.jsonl`), 'utf8');
  const raw = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as RawAgentEvent);

  it('shows a whole commission: errand out and back, a question, a risky step declined, the review, done', () => {
    const kinds = normalizeAll(raw).map((e) => e.kind);
    for (const k of ['subagent_start', 'subagent_stop', 'tool_fail', 'ask_user', 'decision', 'done'] as const) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === 'subagent_start')).toHaveLength(2);
    expect(kinds.at(-1)).toBe('done');
  });

  it('carries nothing from the machine it was recorded on', () => {
    expect(text).not.toMatch(/\/tmp\/|\/home\/|C:\\\\Users|sk-ant-/);
    expect(text).not.toMatch(/mock/i);
  });

  it('plays in under a minute at the trial speed', () => {
    const seconds = (raw.at(-1)!.t - raw[0].t) / 1000 / 0.8;
    expect(seconds).toBeLessThan(60);
  });

  it('is in its own language', () => {
    expect(/[\u4e00-\u9fff]/.test(text)).toBe(lang === 'zh-CN');
  });
});
