import { describe, expect, it } from 'vitest';
import { LONG_TASK_MS, PROGRESS_GAP_MS, progressDue } from '../app/renderer/stage/progress';

const MIN = 60_000;

describe('progress lines on long commissions', () => {
  it('stays quiet for the first 20 minutes', () => {
    expect(progressDue(0, undefined, LONG_TASK_MS - 1)).toBe(false);
    expect(progressDue(0, undefined, LONG_TASK_MS)).toBe(true);
  });

  it('says it at most once every 10 minutes', () => {
    expect(progressDue(0, 20 * MIN, 29 * MIN)).toBe(false);
    expect(progressDue(0, 20 * MIN, 20 * MIN + PROGRESS_GAP_MS)).toBe(true);
  });

  it('says it five times in a one-hour commission checked every 5 seconds', () => {
    let said: number | undefined;
    let count = 0;
    for (let now = 0; now <= 60 * MIN; now += 5000) {
      if (progressDue(0, said, now)) {
        said = now;
        count++;
      }
    }
    expect(count).toBe(5);
  });
});
