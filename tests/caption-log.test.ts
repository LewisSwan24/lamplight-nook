import { describe, expect, it } from 'vitest';
import { CaptionLog } from '../app/renderer/ui/caption-log';

describe('caption log', () => {
  it('keeps lines in order with who said them', () => {
    const log = new CaptionLog();
    log.add('adeng', 'Hello.', 1);
    log.add('xiaoju', 'Hi!', 2);
    expect(log.all().map((c) => `${c.who}:${c.text}`)).toEqual(['adeng:Hello.', 'xiaoju:Hi!']);
  });

  it('skips empty lines and the same bubble shown again', () => {
    const log = new CaptionLog();
    expect(log.add('adeng', '  ', 1)).toBeNull();
    log.add('adeng', 'Tea?', 2);
    expect(log.add('adeng', 'Tea?', 3)).toBeNull();
    log.add('laoshi', 'Tea?', 4);
    expect(log.all()).toHaveLength(2);
  });

  it('forgets the oldest lines past its limit', () => {
    const log = new CaptionLog(3);
    for (let i = 0; i < 5; i++) log.add('adeng', `line ${i}`, i);
    expect(log.all().map((c) => c.text)).toEqual(['line 2', 'line 3', 'line 4']);
    expect(log.latest(2).map((c) => c.text)).toEqual(['line 3', 'line 4']);
  });
});
