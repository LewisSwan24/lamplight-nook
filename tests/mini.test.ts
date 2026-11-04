import { describe, expect, it } from 'vitest';
import { MINI_IDLE, type MiniEvent, type MiniState, miniLine, nextMini } from '../app/shared/mini';
import { LOCALES } from '../app/shared/i18n';

const run = (...events: MiniEvent[]): MiniState => events.reduce(nextMini, MINI_IDLE);
const ai = (kind: string, extra: Record<string, unknown> = {}): MiniEvent => ({ type: 'ai', event: { kind, agent: 'main', plain: '', ...extra } as never });

describe('corner window state', () => {
  it('starts with tea and gets busy when a commission starts', () => {
    expect(MINI_IDLE.status).toBe('idle');
    expect(run({ type: 'run', running: true })).toMatchObject({ status: 'working', bubble: 'dots' });
  });

  it('says what is being done from the real tool events', () => {
    const s = run({ type: 'run', running: true }, ai('tool_start', { plain: 'writing index.html' }));
    expect(s).toMatchObject({ status: 'working', pose: 'read', what: 'writing index.html' });
  });

  it('keeps asking until a waiting card is answered', () => {
    let s = run({ type: 'run', running: true }, { type: 'ask', serious: false });
    expect(s).toMatchObject({ status: 'waiting', bubble: 'alert' });
    s = nextMini(s, ai('tool_start', { plain: 'other work' }));
    expect(s.status).toBe('waiting');
    s = nextMini(s, { type: 'answered' });
    expect(s.status).toBe('working');
  });

  it('marks a serious step apart from an ordinary question', () => {
    expect(run({ type: 'ask', serious: true }).status).toBe('serious');
  });

  it('holds the outcome until the user comes back to the shop', () => {
    let s = run({ type: 'run', running: true }, ai('done'), { type: 'run', running: false });
    expect(s).toMatchObject({ status: 'done', bubble: 'heart' });
    s = nextMini(s, { type: 'seen' });
    expect(s).toEqual(MINI_IDLE);
    expect(run({ type: 'run', running: true }, ai('failed'), { type: 'run', running: false }).status).toBe('failed');
  });

  it('goes back to sleep when the commission is cancelled', () => {
    expect(run({ type: 'run', running: true }, ai('cancelled'), { type: 'run', running: false })).toEqual(MINI_IDLE);
  });

  it('coming back while work runs does not stop it showing as busy', () => {
    expect(run({ type: 'run', running: true }, { type: 'seen' }).status).toBe('working');
  });
});

describe('the corner window line', () => {
  const M = LOCALES.en.ui.mini;
  const working = (extra: Partial<MiniState>): MiniState => ({ status: 'working', pose: 'idle', ...extra });

  it('shows what is happening without a second label in front of it', () => {
    const line = miniLine(working({ what: 'sent someone to: Colours', step: { n: 2, total: 7 } }), M);
    expect(line).toBe('2 of 7 · sent someone to: Colours');
  });

  it('says busy when there is nothing more to say', () => {
    expect(miniLine(working({}), M)).toBe(M.working);
    expect(M.working).not.toMatch(/[{:：]/);
    expect(LOCALES['zh-CN'].ui.mini.working).not.toMatch(/[{:：]/);
  });

  it('uses the plain line for every other status', () => {
    expect(miniLine({ status: 'done', pose: 'idle' }, M)).toBe(M.done);
  });
});
