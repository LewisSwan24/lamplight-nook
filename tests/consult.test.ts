import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { prompt: unknown; options: Record<string, unknown> }[] = [];
let messages: unknown[] = [];
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: unknown; options: Record<string, unknown> }) => {
    calls.push({ prompt, options });
    return (async function* () { yield* messages; })();
  },
}));

const { BRIEF_SCHEMA, CONSULT_CAP_USD, CONSULT_MESSAGES, CONSULT_MODEL, CONSULT_PROMPT, briefFrom, briefFromChat, consultFolder, consultOptions, consultTurn, userMessage } = await import('../app/main/consult');
const { SpendLedger } = await import('../app/main/spend');
const { MemoryStore } = await import('../app/main/memory');
const { projectFolders } = await import('../app/main/projects');

const tmp = () => mkdtempSync(join(tmpdir(), 'lamplight-consult-'));
const NAMES = { you: 'You', adeng: 'Aden' };

beforeEach(() => {
  calls.length = 0;
  messages = [];
});

describe('what a consult asks the SDK for', () => {
  it('the cheap model, no tools, one turn, no settings or MCP servers from the machine, and the cap', () => {
    const o = consultOptions({ cwd: 'C:/data/consult', maxBudgetUsd: 0.07, env: { A: '1' }, finish: false });
    expect(o).toMatchObject({ model: 'haiku', tools: [], maxTurns: 1, settingSources: [], mcpServers: {}, maxBudgetUsd: 0.07, systemPrompt: CONSULT_PROMPT, cwd: 'C:/data/consult', env: { A: '1' } });
    expect(o.outputFormat).toBeUndefined();
    expect(o.resume).toBeUndefined();
    expect(CONSULT_MODEL).toBe('haiku');
    expect(CONSULT_CAP_USD).toBe(0.1);
    expect(CONSULT_MESSAGES).toBe(10);
  });

  it('the next message resumes the same session, and only the last turn asks for the JSON', () => {
    const o = consultOptions({ cwd: 'C:/c', maxBudgetUsd: 0.03, env: {}, finish: true, resume: 'sess-1' });
    expect(o.resume).toBe('sess-1');
    expect(o.outputFormat).toEqual({ type: 'json_schema', schema: BRIEF_SCHEMA });
    expect(Object.keys((BRIEF_SCHEMA as { properties: object }).properties)).toEqual(['want', 'details', 'audience', 'template']);
  });

  it('the prompt asks what, for whom, what material and what form, and forbids code and files', () => {
    expect(CONSULT_PROMPT).toMatch(/what they want/);
    expect(CONSULT_PROMPT).toMatch(/who it is for/);
    expect(CONSULT_PROMPT).toMatch(/material/);
    expect(CONSULT_PROMPT).toMatch(/form/);
    expect(CONSULT_PROMPT).toMatch(/Do not write code/);
    expect(CONSULT_PROMPT).toMatch(/files/);
  });

  it('hands over only the names of the files, never where they are', () => {
    const said = userMessage('a page for my cafe', ['C:\\Users\\me\\Pictures\\latte.jpg', '/home/me/menu.txt']);
    expect(said).toContain('a page for my cafe');
    expect(said).toContain('latte.jpg');
    expect(said).toContain('menu.txt');
    expect(said).not.toContain('Pictures');
    expect(said).not.toContain('/home');
    expect(userMessage('hello', [])).toBe('hello');
  });
});

describe('one turn of a consult', () => {
  it('passes the prompt and options to query() and reads the reply, session and running cost', async () => {
    messages = [
      { type: 'system', subtype: 'init', session_id: 's9' },
      { type: 'result', subtype: 'success', is_error: false, result: 'Who is it for?', total_cost_usd: 0.012, session_id: 's9' },
    ];
    const options = consultOptions({ cwd: 'C:/c', maxBudgetUsd: 0.1, env: {}, finish: false });
    const turn = await consultTurn('a page', options);
    expect(calls[0]).toEqual({ prompt: 'a page', options });
    expect(turn).toEqual({ ok: true, budget: false, sessionId: 's9', text: 'Who is it for?', output: undefined, costUsd: 0.012 });
  });

  it('a turn stopped by the cap says so', async () => {
    messages = [
      { type: 'system', subtype: 'init', session_id: 's9' },
      { type: 'result', subtype: 'error_max_budget_usd', is_error: true, errors: ['Reached maximum budget'], total_cost_usd: 0.11, session_id: 's9' },
    ];
    const turn = await consultTurn('more', consultOptions({ cwd: 'C:/c', maxBudgetUsd: 0.02, env: {}, finish: false }));
    expect(turn).toMatchObject({ ok: false, budget: true, costUsd: 0.11 });
  });

  it('the last turn brings the structured output', async () => {
    const output = { want: 'A menu page', details: 'Warm colours', audience: 'Regulars', template: 'page' };
    messages = [{ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: output, total_cost_usd: 0.03, session_id: 's9' }];
    const turn = await consultTurn('write it up', consultOptions({ cwd: 'C:/c', maxBudgetUsd: 0.05, env: {}, finish: true, resume: 's9' }));
    expect(turn.output).toEqual(output);
  });
});

describe('turning the talk into a commission slip', () => {
  it('takes the structured output as it is', () => {
    expect(briefFrom({ want: ' A menu page ', details: 'Warm colours', audience: 'Regulars', template: 'page' }, undefined))
      .toEqual({ want: 'A menu page', details: 'Warm colours', audience: 'Regulars', template: 'page' });
  });

  it('reads JSON from the reply text, fenced or not, when there is no structured output', () => {
    expect(briefFrom(undefined, '```json\n{"want":"A letter","details":"","audience":"","template":"letter"}\n```')).toEqual({ want: 'A letter', template: 'letter' });
    expect(briefFrom(undefined, '{"want":"A plan"}')).toEqual({ want: 'A plan' });
  });

  it('drops a template the shop does not have', () => {
    expect(briefFrom({ want: 'A poem', template: 'poem' }, undefined)).toEqual({ want: 'A poem' });
  });

  it('cannot read one without a want, or from plain words', () => {
    expect(briefFrom({ details: 'x' }, undefined)).toBeNull();
    expect(briefFrom(undefined, 'Sure, here you go!')).toBeNull();
    expect(briefFrom(undefined, undefined)).toBeNull();
    expect(briefFrom('{"want": 3}', undefined)).toBeNull();
  });

  it('falls back to the talk: the first thing said is the want, the whole talk goes into the details', () => {
    const brief = briefFromChat([
      { who: 'adeng', text: 'What shall we make?' },
      { who: 'you', text: 'A page for my cafe' },
      { who: 'adeng', text: 'Who is it for?' },
      { who: 'you', text: 'Regulars' },
    ], NAMES);
    expect(brief).toEqual({ want: 'A page for my cafe', details: 'Aden: What shall we make? You: A page for my cafe Aden: Who is it for? You: Regulars' });
    expect(briefFromChat([{ who: 'you', text: '一个网页' }], { you: '我', adeng: '阿灯' }, '：').details).toBe('我：一个网页');
  });
});

describe('what a consult cost', () => {
  it('is kept in the ledger under consult:<id>|<session>', () => {
    const file = join(tmp(), 'spend.json');
    const ledger = new SpendLedger(file);
    ledger.record(consultFolder('t1'), 's1', 0.02);
    ledger.record(consultFolder('t1'), 's1', 0.05);
    expect(JSON.parse(readFileSync(file, 'utf8')).map((e: { key: string }) => e.key)).toEqual(['consult:t1|s1']);
    expect(ledger.forCommission(consultFolder('t1'))).toBeCloseTo(0.05);
  });

  it('goes on the project once the slip is handed in, and the project counts it', () => {
    const store = new MemoryStore(join(tmp(), 'memory.json'));
    store.remember({ title: 'cafe', choices: {}, result: 'done', folder: 'C:/w/cafe', form: { want: 'A page', consult: 't7' } }, []);
    const notebook = store.get();
    const [p] = notebook.projects;
    expect(p.consults).toEqual(['t7']);
    expect(projectFolders(p, notebook.commissions)).toEqual(['C:/w/cafe', 'consult:t7']);
  });

  it('a commission carried on after a stop does not note the consult twice', () => {
    const store = new MemoryStore(join(tmp(), 'memory.json'));
    const form = { want: 'A page', consult: 't7' };
    store.remember({ title: 'cafe', choices: {}, result: 'failed', folder: 'C:/w/cafe', form }, []);
    store.remember({ title: 'cafe', choices: {}, result: 'done', folder: 'C:/w/cafe', form }, []);
    expect(store.get().projects[0].consults).toEqual(['t7']);
  });
});
