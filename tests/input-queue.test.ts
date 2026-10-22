import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputQueue } from '../app/main/input-queue';

const texts = async (q: InputQueue) => {
  const out: string[] = [];
  for await (const m of q) out.push(String(m.message.content));
  return out;
};

describe('commission input queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hands over the prompt, then a note added mid-run, then ends after the grace period', async () => {
    const q = new InputQueue();
    q.push('make a page');
    const read = texts(q);
    expect(q.push('also add a dark mode', 'next')).toBe(true);
    await vi.advanceTimersByTimeAsync(0); // the SDK reads it
    q.closeSoon(1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await read).toEqual(['make a page', 'also add a dark mode']);
  });

  it('stays open when the agent picks up work again within the grace period', async () => {
    const q = new InputQueue();
    q.push('make a page');
    const read = texts(q);
    q.closeSoon(1500);
    await vi.advanceTimersByTimeAsync(1000);
    q.stay();
    await vi.advanceTimersByTimeAsync(5000);
    expect(q.isClosed).toBe(false);
    q.closeSoon(1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await read).toEqual(['make a page']);
  });

  it('does not close while a note is still waiting to be read', async () => {
    const q = new InputQueue();
    q.push('a');
    q.push('b');
    q.closeSoon(10);
    await vi.advanceTimersByTimeAsync(50);
    expect(q.isClosed).toBe(false);
  });

  it('refuses notes once the commission has wrapped up', () => {
    const q = new InputQueue();
    q.close();
    expect(q.push('too late')).toBe(false);
  });
});
