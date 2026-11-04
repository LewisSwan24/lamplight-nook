import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnimTable, parseRules, Translator } from '../app/renderer/translator/translator';
import type { AiEvent, CharacterCommand } from '../app/shared/types';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const rules = parseRules(read('rules/cafe.yaml'));
const anims = parseAnimTable(read('rules/anim-fallback.yaml'));

let seq = 0;
const ev = (kind: AiEvent['kind'], over: Partial<AiEvent> = {}): AiEvent => ({ id: `e${++seq}`, t: seq * 1000, kind, agent: 'main', plain: '', ...over });

/**
 * The demo commission as a real run produces it (event order taken from a real recording on Windows),
 * one entry per storyboard step in docs/story.md section 6. Steps 1, 17 and 18 are UI, not agent events.
 */
const STEPS: [step: number, events: AiEvent[]][] = [
  [2, [ev('session_start')]],
  [3, [ev('plan', { target: '3' })]],
  [4, [ev('subagent_start', { agent: 'researcher', tool: 'Agent', target: 'expense page patterns' })]],
  [5, [ev('tool_start', { tool: 'Write', target: 'draft-1.html' }), ev('tool_ok', { tool: 'Write', target: 'draft-1.html' })]],
  [6, [ev('subagent_stop', { agent: 'researcher', tool: 'Agent', target: 'three references' })]],
  [7, [ev('tool_start', { tool: 'Write', target: 'index.html' }), ev('tool_ok', { tool: 'Write', target: 'index.html' })]],
  [8, [ev('tool_start', { tool: 'PowerShell', target: 'node check.js' }), ev('tool_fail', { tool: 'PowerShell', target: 'node check.js', failStreak: 1 })]],
  [9, [ev('tool_start', { tool: 'Edit', target: 'index.html' }), ev('tool_ok', { tool: 'Edit', target: 'index.html' }),
    ev('tool_start', { tool: 'PowerShell', target: 'node check.js' }), ev('tool_ok', { tool: 'PowerShell', target: 'node check.js', failStreak: 0 })]],
  [10, [ev('ask_user', { tool: 'AskUserQuestion', target: 'main color' })]],
  [11, [ev('decision', { tool: 'AskUserQuestion', choice: 'picked', risk: 'ask' })]],
  [12, [ev('tool_start', { tool: 'Edit', target: 'index.html' }), ev('tool_ok', { tool: 'Edit', target: 'index.html' })]],
  [13, [ev('tool_start', { tool: 'PowerShell', target: 'Remove-Item draft-1.html' }), ev('permission', { tool: 'PowerShell', target: 'Remove-Item draft-1.html', risk: 'serious' })]],
  [14, [ev('decision', { tool: 'PowerShell', choice: 'denied', risk: 'serious' }), ev('subagent_start', { agent: 'reviewer', tool: 'Agent', target: 'review index.html' })]],
  [15, [ev('subagent_stop', { agent: 'reviewer', tool: 'Agent', target: 'no problems' })]],
  [16, [ev('done')]],
];

describe('storyboard: every agent-driven step of the demo has its scene', () => {
  const t = new Translator(rules, anims, { brief: 'ledger page' });
  const out = new Map<number, CharacterCommand[]>(STEPS.map(([step, events]) => [step, events.flatMap((e) => t.translate(e))]));
  const at = (step: number) => out.get(step)!.map((c) => `${c.actor}:${c.state}${c.moveTo ? `@${c.moveTo}` : ''}${c.line ? `/${c.line.group}` : ''}`);

  const expected: Record<number, string[]> = {
    2: ['adeng:ready@counter/opening', 'xiaoju:ready@shelf', 'laoshi:ready@corner', 'qingdai:ready@board'],
    3: ['adeng:working@board/planning'],
    4: ['xiaoju:out@door/sub_go_xiaoju', 'adeng:working'],
    5: ['adeng:working@table/writing'],
    6: ['xiaoju:returning@counter/sub_back_xiaoju'],
    7: ['adeng:working@table/writing'],
    8: ['adeng:working@counter', 'adeng:stuck/stuck'],
    9: ['adeng:working@table/writing', 'adeng:working@counter'],
    10: ['adeng:asking@counter/ask'],
    11: ['adeng:reacting/react_adopted'],
    12: ['adeng:working@table/writing'],
    13: ['adeng:working@counter', 'adeng:serious@counter/serious'],
    14: ['adeng:reacting/serious_no', 'laoshi:checking@table/sub_go_laoshi', 'adeng:working'],
    15: ['laoshi:ready@corner/sub_back_laoshi'],
    16: ['adeng:wrapping@counter/done', 'xiaoju:idle@shelf', 'laoshi:idle@corner', 'qingdai:idle@board', 'cat:idle@window'],
  };
  for (const [step] of STEPS) {
    it(`step ${step}`, () => expect(at(step)).toEqual(expected[step]));
  }

  it('the real failure is a real stuck moment, and the serious step stops on the plain card', () => {
    expect(out.get(8)!.at(-1)).toMatchObject({ actor: 'adeng', state: 'stuck' });
    expect(out.get(13)!.at(-1)).toMatchObject({ state: 'serious', bubble: 'alert' });
  });

  it('Laoshi goes to check with the hammer stand-in', () => {
    expect(out.get(14)!.find((c) => c.actor === 'laoshi')).toMatchObject({ anim: 'lift', bubble: 'dots' });
  });
});
