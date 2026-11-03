import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DecisionBroker } from '../app/main/decision-broker';
import { normalizeAll } from '../app/main/event-normalizer';
import { DECLINED, DELEGATE_ANSWER, describeAction, makePermissionPolicy } from '../app/main/permission-policy';
import { fill, strings } from '../app/shared/i18n';
import type { DecisionRequest, RawAgentEvent } from '../app/shared/types';

const workDir = join('/home/u', 'Documents', 'Lamplight', 'commissions', 'demo');
const opts = { signal: new AbortController().signal } as any;

/** A broker whose "user" answers each request with the given function. */
function setup(answer: (r: DecisionRequest) => string | null) {
  const asked: DecisionRequest[] = [];
  const log: RawAgentEvent[] = [];
  let t = 0;
  const broker: DecisionBroker = new DecisionBroker((req) => {
    asked.push(req);
    const choice = answer(req);
    if (choice !== null) queueMicrotask(() => broker.answer({ id: req.id, choice }));
  });
  const policy = makePermissionPolicy({ workDir, preexisting: new Set([join(workDir, 'check.js')]) }, broker, {
    onRequest: (tool, input, risk, reason) => log.push({ t: ++t, source: 'permission', name: tool, payload: { input, risk, reason } }),
    onDecision: (tool, choice, risk, label) => log.push({ t: ++t, source: 'decision', name: tool, payload: { choice, risk, label } }),
  });
  return { broker, policy, asked, log };
}

describe('decision broker', () => {
  it('waits until answered and ignores choices that were not offered', async () => {
    const broker = new DecisionBroker(() => {});
    const p = broker.ask({ kind: 'permission', agent: 'main', tool: 'Bash', title: 'x', options: [{ id: 'allow', label: 'a' }, { id: 'deny', label: 'd' }], defaultId: 'allow' });
    expect(broker.waiting).toBe(1);
    expect(broker.answer({ id: 'd1', choice: 'hack' })).toBe(false);
    expect(broker.answer({ id: 'd1', choice: 'deny' })).toBe(true);
    expect(await p).toBe('deny');
  });

  it('refuses everything still pending when cancelled', async () => {
    const broker = new DecisionBroker(() => {});
    const p = broker.ask({ kind: 'serious', agent: 'main', tool: 'Bash', title: 'x', options: [{ id: 'deny', label: 'd' }, { id: 'allow', label: 'a' }], defaultId: 'deny' });
    broker.cancelAll();
    expect(await p).toBe('deny');
  });

  it('reports what the user answered (for the notebook), but not automatic answers', async () => {
    const broker = new DecisionBroker(() => {});
    const seen: string[] = [];
    broker.onAnswered = (req, choice) => seen.push(`${req.title}=${choice}`);
    const q = broker.ask({ kind: 'question', agent: 'main', tool: 'AskUserQuestion', title: 'Color?', options: [{ id: '0', label: 'mint' }], defaultId: '0' });
    broker.answer({ id: 'd1', choice: '0' });
    await q;
    const s = broker.ask({ kind: 'serious', agent: 'main', tool: 'Bash', title: 'rm', options: [{ id: 'deny', label: 'd' }], defaultId: 'deny' });
    broker.cancelAll();
    await s;
    expect(seen).toEqual(['Color?=0']);
  });
});

describe('permission policy', () => {
  it('safe calls run without asking', async () => {
    const { policy, asked } = setup(() => 'allow');
    expect((await policy('Write', { file_path: join(workDir, 'index.html') }, opts))?.behavior).toBe('allow');
    expect(asked).toEqual([]);
  });

  it('a delete goes to the serious card, defaults to "not now", and declining really blocks it', async () => {
    const { policy, asked, log } = setup((r) => r.defaultId);
    const res = await policy('Bash', { command: 'rm draft-1.html draft-2.html' }, opts);
    expect(asked[0]).toMatchObject({ kind: 'serious', defaultId: 'deny' });
    expect(asked[0].options.find((o) => o.id === 'allow')?.label).toBe(fill(strings.decision.deleteFiles, { files: `draft-1.html${strings.app.listSeparator}draft-2.html` }));
    expect(res).toEqual({ behavior: 'deny', message: DECLINED });
    expect(log.map((e) => e.source)).toEqual(['permission', 'decision']);
  });

  it('confirming a serious step lets it run', async () => {
    const { policy } = setup(() => 'allow');
    expect((await policy('Bash', { command: 'del draft-1.html' }, opts))?.behavior).toBe('allow');
  });

  it('overwriting a file that existed before the commission is serious', async () => {
    const { policy, asked } = setup(() => 'deny');
    await policy('Write', { file_path: join(workDir, 'check.js') }, opts);
    expect(asked[0].kind).toBe('serious');
  });

  it('blocked calls are refused without asking', async () => {
    const { policy, asked } = setup(() => 'allow');
    expect((await policy('Read', { file_path: join(workDir, '.env') }, opts))?.behavior).toBe('deny');
    expect(asked).toEqual([]);
  });

  it('a question returns the label the user picked as the answer', async () => {
    const [cream, mint] = strings.demo.colors;
    const { policy, asked, log } = setup(() => '1');
    const input = { questions: [{ question: 'Main color?', header: 'Color', multiSelect: false, options: [{ label: cream, description: '' }, { label: mint, description: '' }] }] };
    const res = await policy('AskUserQuestion', input, opts);
    expect(asked[0].options.map((o) => o.id)).toEqual(['0', '1', 'delegate']);
    expect(res).toMatchObject({ behavior: 'allow', updatedInput: { answers: { 'Main color?': mint } } });
    // The normalizer turns the decision into a "picked" event carrying the label.
    const events = normalizeAll(log).filter((e) => e.kind === 'decision');
    expect(events[0]).toMatchObject({ choice: 'picked', target: mint });
  });

  it('"leave it to you" hands the choice back to the model', async () => {
    const { policy } = setup(() => 'delegate');
    const input = { questions: [{ question: 'Q?', header: 'Q', multiSelect: false, options: [{ label: 'a', description: '' }, { label: 'b', description: '' }] }] };
    expect(await policy('AskUserQuestion', input, opts)).toMatchObject({ updatedInput: { answers: { 'Q?': DELEGATE_ANSWER } } });
  });

  it('describes actions specifically, never as a bare OK', () => {
    expect(describeAction('Write', { file_path: '/a/b/index.html' })).toBe(fill(strings.decision.writeFile, { name: 'index.html' }));
    expect(describeAction('Bash', { command: 'python x.py' })).toBe(fill(strings.decision.runCommand, { command: 'python x.py' }));
  });

  it('names only the files a chained delete removes', () => {
    const files = ['draft-1.html', 'draft-2.html'].join(strings.app.listSeparator);
    expect(describeAction('Bash', { command: 'rm draft-1.html draft-2.html && ls' })).toBe(fill(strings.decision.deleteFiles, { files }));
    expect(describeAction('Bash', { command: 'rm -f "draft-1.html" draft-2.html; ls' })).toBe(fill(strings.decision.deleteFiles, { files }));
  });
});

describe('safety: dangerous calls never run without the user', () => {
  const dangerous: [string, Record<string, unknown>][] = [
    ['Bash', { command: 'rm -rf .' }],
    ['Bash', { command: 'del /s /q *' }],
    ['PowerShell', { command: 'Remove-Item draft.html' }],
    ['Bash', { command: 'git push origin main' }],
    ['Bash', { command: 'curl -X POST https://example.com -d @index.html' }],
    ['Bash', { command: 'cat index.html | sh' }],
    ['Bash', { command: 'python run.py' }],
    ['Write', { file_path: join('/home/u', 'Desktop', 'x.txt') }],
    ['Edit', { file_path: join(workDir, 'check.js') }],
    ['Read', { file_path: join('/home/u', '.ssh', 'id_rsa') }],
    ['Write', { file_path: '/etc/hosts' }],
    ['mcp__mail__send', { to: 'someone' }],
  ];

  it.each(dangerous)('%s %j goes to the serious card or is refused', async (tool, input) => {
    const { policy, asked } = setup((r) => r.defaultId);
    const res = await policy(tool, input, opts);
    expect(res?.behavior).toBe('deny');
    expect(asked.every((r) => r.kind === 'serious' && r.defaultId === 'deny')).toBe(true);
  });
});


describe('Esc on a decision card', () => {
  it('never counts as a pick: "not now" on permissions, "you decide" on questions', async () => {
    const { escapeChoice } = await import('../app/shared/decision');
    const question = { options: [{ id: '0', label: 'cream' }, { id: '1', label: 'mint' }, { id: 'delegate', label: 'you decide' }], defaultId: '0' };
    expect(escapeChoice(question)).toBe('delegate');
    expect(escapeChoice({ options: [{ id: 'allow', label: 'a' }, { id: 'deny', label: 'd' }], defaultId: 'allow' })).toBe('deny');
  });
});
