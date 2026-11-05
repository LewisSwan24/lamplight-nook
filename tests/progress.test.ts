import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { capLine, elapsedLine, planLine } from '../app/shared/progress';
import type { BoardStep } from '../app/shared/board';

const R = LOCALES['zh-CN'].ui.run;
const E = LOCALES.en.ui.run;
const MINUTE = 60_000;

const step = (status: BoardStep['status'], key = 'todo-1'): BoardStep => ({ key, label: 'x', status });

describe('how long the work has taken', () => {
  it('says it has just started in the first minute', () => {
    expect(elapsedLine(0, 59_000, R)).toBe(R.progressJustStarted);
  });

  it('counts whole minutes', () => {
    expect(elapsedLine(0, 12 * MINUTE + 30_000, R)).toBe('已经做了 12 分钟');
    expect(elapsedLine(0, 12 * MINUTE, E)).toBe('12 min so far');
  });

  it('counts hours past an hour', () => {
    expect(elapsedLine(0, 65 * MINUTE, R)).toBe('已经做了 1 小时 5 分钟');
    expect(elapsedLine(0, 125 * MINUTE, E)).toBe('2 h 5 min so far');
  });
});

describe('the limit on the card', () => {
  it('names the limit for this round', () => {
    expect(capLine(5, R)).toBe('这一轮最多花 $5.00');
    expect(capLine(1, E)).toBe('This round stops at $1.00');
  });

  it('says nothing with no limit', () => {
    expect(capLine(0, R)).toBeNull();
  });
});

describe('the plan heading', () => {
  const steps = [step('done'), step('doing'), step('todo')];

  it('counts a plan the staff made themselves', () => {
    expect(planLine(steps, true, R)).toBe('计划 · 做完 1 件，共 3 件');
  });

  it('does not count steps that are only a guess', () => {
    expect(planLine(steps, false, R)).toBe(R.progressGuess);
  });
});
