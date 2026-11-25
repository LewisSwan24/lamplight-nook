import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Choosing the model (plan-1.6.md F6): three tiers in settings, "best", "balanced" and "saver", for Opus, Sonnet and
// Haiku; the slip can change it for one commission; a schedule keeps the one picked when it was made; a talk with Adeng
// follows the setting but goes no higher than "balanced"; the ledger keeps the model each commission really ran on.

const calls: { prompt: unknown; options: Record<string, unknown> }[] = [];
let messages: unknown[] = [];
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: unknown; options: Record<string, unknown> }) => {
    calls.push({ prompt, options });
    return (async function* () { yield* messages; })();
  },
}));
vi.mock('../app/main/claude-locator', () => ({ locateClaude: () => 'C:/claude.exe' }));

const { DEFAULT_TIER, MODEL_TIERS, TIER_MODEL, cleanTier, consultTier, modelFor, tierOf, withModel } = await import('../app/shared/models');
const { SettingsStore } = await import('../app/main/settings');
const { SpendLedger } = await import('../app/main/spend');
const { runAgent } = await import('../app/main/agent-runner');
const { consultOptions } = await import('../app/main/consult');
const { typicalUsd, modelCosts } = await import('../app/main/prices');

const tmp = () => mkdtempSync(join(tmpdir(), 'lamplight-models-'));

beforeEach(() => {
  calls.length = 0;
  messages = [];
});

describe('the three tiers', () => {
  it('are best, balanced and saver, for Claude Code\'s aliases of Opus, Sonnet and Haiku, balanced by default (Q-F7)', () => {
    expect(MODEL_TIERS).toEqual(['best', 'balanced', 'saver']);
    expect(TIER_MODEL).toEqual({ best: 'opus', balanced: 'sonnet', saver: 'haiku' });
    expect(DEFAULT_TIER).toBe('balanced');
  });

  it('take nothing else', () => {
    expect(cleanTier('saver')).toBe('saver');
    for (const v of ['gpt-4', 'Best', '', null, 3, undefined]) expect(cleanTier(v)).toBeUndefined();
  });

  it('read a model name back into its tier, whatever the full id', () => {
    expect(tierOf('claude-opus-4-1-20250805')).toBe('best');
    expect(tierOf('claude-sonnet-4-5')).toBe('balanced');
    expect(tierOf('claude-haiku-4-5-20251001')).toBe('saver');
    expect(tierOf('haiku')).toBe('saver');
    expect(tierOf('sim')).toBeUndefined();
    expect(tierOf(undefined)).toBeUndefined();
  });

  it('a commission runs on its slip\'s tier when it has one, else on the setting', () => {
    expect(modelFor({ want: 'x' }, 'saver')).toBe('haiku');
    expect(modelFor({ want: 'x', model: 'best' }, 'saver')).toBe('opus');
    // Anything the page sends that is not a tier counts as none.
    expect(modelFor({ want: 'x', model: 'gpt' as never }, 'balanced')).toBe('sonnet');
  });

  it('a talk with Adeng goes no higher than balanced', () => {
    expect(consultTier('best')).toBe('balanced');
    expect(consultTier('balanced')).toBe('balanced');
    expect(consultTier('saver')).toBe('saver');
  });

  it('a schedule keeps the tier picked when it was made', () => {
    expect(withModel({ want: 'weekly notes' }, 'saver')).toEqual({ want: 'weekly notes', model: 'saver' });
    expect(withModel({ want: 'weekly notes', model: 'best' }, 'saver')).toEqual({ want: 'weekly notes', model: 'best' });
  });
});

describe('settings keep the tier', () => {
  it('balanced to begin with, then what is picked; anything else is refused', () => {
    const file = join(tmp(), 'settings.json');
    const s = new SettingsStore(file, '/docs');
    expect(s.get().modelTier).toBe('balanced');
    expect(s.update({ modelTier: 'saver' }).modelTier).toBe('saver');
    expect(s.update({ modelTier: 'gpt-4' as never }).modelTier).toBe('saver');
    expect(new SettingsStore(file, '/docs').get().modelTier).toBe('saver');
  });

  it('a broken tier in the file reads as the default', () => {
    const file = join(tmp(), 'settings.json');
    writeFileSync(file, JSON.stringify({ modelTier: 'turbo' }));
    expect(new SettingsStore(file, '/docs').get().modelTier).toBe('balanced');
  });
});

describe('the staff start on the model', () => {
  const run = (model?: string) => runAgent({ prompt: 'hi', workDir: join(tmp(), 'w'), recordingPath: join(tmp(), 'r.jsonl'), emit: () => {}, credentials: { source: 'stored', apiKey: 'k' }, model });

  it('passes the model to Claude Code', async () => {
    messages = [{ type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.01, usage: { input_tokens: 1 } }];
    await run('haiku');
    expect(calls[0].options.model).toBe('haiku');
  });

  it('reports the model it really ran on, from Claude Code\'s first word', async () => {
    messages = [
      { type: 'system', subtype: 'init', session_id: 's', model: 'claude-haiku-4-5-20251001', claude_code_version: '2.1.0' },
      { type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.01, usage: { input_tokens: 1 } },
    ];
    expect((await run('haiku')).model).toBe('claude-haiku-4-5-20251001');
  });

  it('a talk with Adeng runs on the model it is given', () => {
    expect(consultOptions({ cwd: 'C:/c', maxBudgetUsd: 0.05, env: {}, finish: false, model: 'sonnet' }).model).toBe('sonnet');
  });
});

describe('the ledger and the price of a commission', () => {
  it('keeps the model each session ran on', () => {
    const file = join(tmp(), 'spend.json');
    const ledger = new SpendLedger(file);
    ledger.record('C:/w/a', 's1', 0.2, new Date('2026-11-25T10:00:00'), undefined, 'claude-haiku-4-5');
    expect(JSON.parse(readFileSync(file, 'utf8'))[0]).toMatchObject({ usd: 0.2, model: 'claude-haiku-4-5' });
  });

  it('averages what a commission cost on each tier, talks with Adeng left out', () => {
    const ledger = new SpendLedger(join(tmp(), 'spend.json'));
    const at = new Date('2026-11-25T10:00:00');
    ledger.record('C:/w/a', 's1', 0.2, at, undefined, 'claude-haiku-4-5');
    ledger.record('C:/w/b', 's2', 0.4, at, undefined, 'claude-haiku-4-5');
    // A commission over two sessions counts once, whole.
    ledger.record('C:/w/c', 's3', 1, at, undefined, 'claude-sonnet-4-5');
    ledger.record('C:/w/c', 's4', 0.5, at, undefined, 'claude-sonnet-4-5');
    ledger.record('consult:t1', 's5', 0.05, at, undefined, 'claude-haiku-4-5');
    ledger.record('C:/w/d', 's6', 3, at);
    expect(ledger.averageByTier()).toEqual({ saver: 0.3, balanced: 1.5 });
  });

  it('a tier with nothing in the ledger is priced from the table, cheapest to dearest', () => {
    expect(typicalUsd('saver')).toBeLessThan(typicalUsd('balanced'));
    expect(typicalUsd('balanced')).toBeLessThan(typicalUsd('best'));
    expect(typicalUsd('balanced')).toBeGreaterThan(0.1);
    expect(typicalUsd('balanced')).toBeLessThan(2);
    expect(modelCosts({ saver: 0.3 })).toEqual({
      best: { usd: typicalUsd('best'), from: 'table' },
      balanced: { usd: typicalUsd('balanced'), from: 'table' },
      saver: { usd: 0.3, from: 'ledger' },
    });
  });
});
