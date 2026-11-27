import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../app/main/memory';
import { consultOptions } from '../app/main/consult';
import { LOCALES } from '../app/shared/i18n';
import { RECALL_WORKS, memoryLines, recallOf, shortTitle, spokenDate } from '../app/shared/memories';
import { lintMemories, parseMemories } from '../app/renderer/translator/lines';
import type { CommissionMemo } from '../app/shared/types';

// What the staff remember (plan-1.9.md I5): a work they were on, by its title and its day, never what is in it; and
// Wick, talking an order over, knows the latest twelve the same way.

const memo = (i: number, o: { helpers?: Record<string, number>; template?: CommissionMemo['form'] extends infer F ? F extends { template?: infer T } ? T : never : never; result?: 'done' | 'failed' } = {}): CommissionMemo => ({
  id: `c${i}`, title: `Work number ${i}`, date: `2026-10-${String(i).padStart(2, '0')}`, result: o.result ?? 'done', choices: {}, folder: `/secret/folder/${i}`,
  form: { want: `the secret want ${i}`, ...(o.template ? { template: o.template } : {}) }, summary: `secret summary ${i}`,
  rounds: [{ date: '2026-10-01', seconds: 1, helpers: o.helpers ?? {}, waits: 0, waitedSeconds: 0 }],
});

describe('what each remembers', () => {
  it('is only the works they were on, latest first, by title and day', () => {
    const r = recallOf([memo(1, { helpers: { reviewer: 1 } }), memo(2), memo(3, { helpers: { reviewer: 1 } }), memo(4, { template: 'ledgerbook' })]);
    expect(r.laoshi).toEqual([{ title: 'Work number 3', date: '2026-10-03' }, { title: 'Work number 1', date: '2026-10-01' }]);
    expect(r.aqian).toEqual([{ title: 'Work number 4', date: '2026-10-04' }]);
    expect(r.qingdai).toBeUndefined();
    expect(r.adeng).toHaveLength(4);
  });

  it('keeps the latest few, and leaves out works that failed', () => {
    const r = recallOf([...Array.from({ length: 20 }, (_, i) => memo(i + 1)), memo(21, { result: 'failed' })]);
    expect(r.adeng).toHaveLength(RECALL_WORKS);
    expect(r.adeng![0].title).toBe('Work number 20');
  });

  it('shortens a long title, and says the day as people do', () => {
    expect(shortTitle('给奶奶的八十岁生日邀请函', 'zh-CN')).toBe('给奶奶的八十岁生…');
    expect(shortTitle('短标题', 'zh-CN')).toBe('短标题');
    expect(shortTitle('A birthday invitation for Granny', 'en')).toBe('A birthday invit…');
    expect(spokenDate('2026-10-03', 'zh-CN')).toBe('10月3号');
    expect(spokenDate('2026-12-31', 'en')).toBe('31 December');
  });

  it('fills each memory with one of that person’s works, and nobody speaks of a work they were not on', () => {
    const lines = memoryLines({ laoshi: [['{date}那份《{title}》。', '我看了三遍。']], qingdai: [['{date}的《{title}》。', '配色是我挑的。']] },
      recallOf([memo(5, { helpers: { reviewer: 1 } })]), 'zh-CN');
    expect(lines).toEqual([{ id: 'memory_laoshi_1', speaker: 'laoshi', bubbles: ['10月5号那份《Work num…》。', '我看了三遍。'] }]);
  });
});

describe('the memories themselves', () => {
  for (const [file, lang, S] of [['lines/memories.yaml', 'zh-CN', LOCALES['zh-CN']], ['lines/en/memories.yaml', 'en', LOCALES.en]] as const) {
    it(`${file}: every one of the eight, each memory naming the work and its day, short enough with the longest of both`, () => {
      const book = parseMemories(readFileSync(file, 'utf8'));
      expect(Object.keys(book).sort()).toEqual(['adeng', 'aqian', 'laoshi', 'qingdai', 'xiaoding', 'xiaodou', 'xiaoju', 'xiaozhe']);
      for (const [who, memories] of Object.entries(book)) expect(memories.length, `${file} ${who}`).toBeGreaterThanOrEqual(3);
      expect(lintMemories(book, lang, S)).toEqual([]);
    });
  }

  it('catches a memory that does not name the work, and one too long once filled', () => {
    expect(lintMemories({ adeng: [['那份东西。', '好。'], ['{date}那份写得特别特别长的《{title}》。', '好。']] }, 'zh-CN', LOCALES['zh-CN'])).toHaveLength(2);
  });
});

describe('Wick knows the latest works when talking an order over', () => {
  it('by title and day only: nothing of what was asked, where it is or what was made', () => {
    const store = new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-memories-')), 'memory.json'));
    const data = (store as unknown as { data: { commissions: CommissionMemo[] } }).data;
    data.commissions.push(...Array.from({ length: 14 }, (_, i) => memo(i + 1)), memo(15, { result: 'failed' }));
    const recent = store.recentWorks();
    expect(recent).toHaveLength(12);
    expect(recent[0]).toEqual({ title: 'Work number 14', date: '2026-10-14' });
    const prompt = String(consultOptions({ cwd: '.', maxBudgetUsd: 1, env: {}, finish: false, recent }).systemPrompt);
    expect(prompt).toContain('2026-10-14');
    expect(prompt).toContain('Work number 3');
    expect(prompt).not.toContain('Work number 2\n');
    expect(prompt).not.toMatch(/secret|Work number 15/);
  });

  it('says nothing of past works to a new customer', () => {
    expect(String(consultOptions({ cwd: '.', maxBudgetUsd: 1, env: {}, finish: false, recent: [] }).systemPrompt)).not.toMatch(/made before/i);
  });
});
