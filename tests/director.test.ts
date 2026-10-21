import { describe, expect, it } from 'vitest';
import { Director, PRIORITY, mergeBurst } from '../app/renderer/translator/director';
import type { CharacterCommand } from '../app/shared/types';

const lines = {
  stuck: [
    { id: 'stuck_1', text: 'Hm, that does not add up.' },
    { id: 'stuck_2', text: 'This again.' },
  ],
  ask: [{ id: 'ask_1', text: 'Can I ask you something?' }],
};

function setup() {
  let t = 0;
  const d = new Director(lines, { now: () => t });
  return { d, tick: (ms: number) => (t += ms) };
}

const cmd = (over: Partial<CharacterCommand>): CharacterCommand => ({ actor: 'adeng', state: 'work', priority: PRIORITY.work, ...over });

describe('director pacing', () => {
  it('same priority queues and plays after the current action', () => {
    const { d } = setup();
    expect(d.submit(cmd({ anim: 'write' }))).not.toBeNull();
    expect(d.submit(cmd({ anim: 'write2' }))).toBeNull();
    expect(d.finished('adeng')?.anim).toBe('write2');
  });

  it('higher priority interrupts', () => {
    const { d } = setup();
    d.submit(cmd({ anim: 'write' }));
    expect(d.submit(cmd({ priority: PRIORITY.fail, anim: 'scratch' }))?.anim).toBe('scratch');
  });

  it('a line group speaks at most once per 30 s; otherwise action only', () => {
    const { d, tick } = setup();
    const a = d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }));
    expect(a?.line?.vars._text).toBe('Hm, that does not add up.');
    d.finished('adeng');
    tick(10_000);
    expect(d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }))?.line).toBeUndefined();
    d.finished('adeng');
    tick(25_000);
    expect(d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }))?.line?.vars._text).toBe('This again.');
  });

  it('lines never repeat within a commission; when used up, action only', () => {
    const { d, tick } = setup();
    for (let i = 0; i < 2; i++) {
      d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }));
      d.finished('adeng');
      tick(31_000);
    }
    expect(d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }))?.line).toBeUndefined();
    d.resetCommission();
    d.finished('adeng');
    expect(d.submit(cmd({ priority: PRIORITY.fail, line: { group: 'stuck', vars: {} } }))?.line).toBeDefined();
  });

  it('asking freezes; unfreezing drops stale commands and jumps each actor to its latest', () => {
    const { d, tick } = setup();
    expect(d.submit(cmd({ priority: PRIORITY.ask, line: { group: 'ask', vars: {} } }))?.line).toBeDefined();
    expect(d.isFrozen()).toBe(true);
    d.submit(cmd({ actor: 'xiaoju', anim: 'old' }));
    tick(10_000);
    d.submit(cmd({ actor: 'laoshi', anim: 'a' }));
    d.submit(cmd({ actor: 'laoshi', anim: 'b' }));
    const resumed = d.unfreeze();
    expect(resumed.map((c) => `${c.actor}:${c.anim}`)).toEqual(['laoshi:b']);
    expect(d.isFrozen()).toBe(false);
  });
});

describe('burst merging', () => {
  it('consecutive reads merge into one', () => {
    const ev = [0, 100, 200, 300].map((t) => ({ t, kind: 'tool_start', tool: 'Read' }));
    expect(mergeBurst(ev)).toHaveLength(1);
  });

  it('at most two per second, but asks and completions are never dropped', () => {
    const ev = [
      { t: 0, kind: 'tool_start', tool: 'Write' },
      { t: 100, kind: 'tool_ok', tool: 'Write' },
      { t: 200, kind: 'tool_start', tool: 'Bash' },
      { t: 300, kind: 'ask_user' },
    ];
    expect(mergeBurst(ev).map((e) => e.kind)).toEqual(['tool_start', 'tool_ok', 'ask_user']);
  });
});
