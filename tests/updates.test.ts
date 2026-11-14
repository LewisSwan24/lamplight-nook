import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backUp } from '../app/main/migrate';
import { CHECK_EVERY_MS, Updates, letterLines, type Found } from '../app/main/updates';
import type { UpdateOffer } from '../app/shared/types';

/** An update source that answers from a list, and notes what was asked of it. */
function shop({ store = false, found = [] as (Found | null | Error)[], download = async () => {} } = {}) {
  const asked: string[] = [];
  const told: UpdateOffer[] = [];
  const logged: string[] = [];
  let wanted = true;
  let answers = [...found];
  const updates = new Updates({
    store,
    wanted: () => wanted,
    updater: {
      check: async () => {
        asked.push('check');
        const next = answers.length > 1 ? answers.shift()! : answers[0] ?? null;
        if (next instanceof Error) throw next;
        return next;
      },
      download: async () => { asked.push('download'); await download(); },
      install: () => { asked.push('install'); },
    },
    backUp: (version) => { asked.push(`backup ${version}`); return `backup/${version}`; },
    tell: (offer) => told.push(offer),
    log: { info: (m) => logged.push(m), warn: (m) => logged.push(m) },
    lang: 'en',
  });
  return {
    updates, asked, told, logged,
    switch: (on: boolean) => { wanted = on; },
    answer: (...next: (Found | null | Error)[]) => { answers = next; },
  };
}

const NEW = { version: '1.1.1', notes: '<h2>Lamplight Nook 1.1.1</h2><ul><li>The postman brings word of new versions.</li></ul>' };

describe('checking for a new version', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('checks once on opening, then every six hours', async () => {
    const s = shop();
    s.updates.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.asked).toEqual(['check']);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS - 1);
    expect(s.asked).toEqual(['check']);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.asked).toEqual(['check', 'check']);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(s.asked).toHaveLength(4);
    expect(CHECK_EVERY_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('never checks in the Store build: the Store updates it', async () => {
    const s = shop({ store: true, found: [NEW] });
    s.updates.start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);
    await s.updates.check();
    expect(s.asked).toEqual([]);
    expect(s.told).toEqual([]);
  });

  it('does not check while switched off, and checks again at the next turn once switched back on', async () => {
    const s = shop({ found: [NEW] });
    s.switch(false);
    s.updates.start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(s.asked).toEqual([]);
    s.switch(true);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(s.asked).toEqual(['check']);
    expect(s.told.map((t) => t.version)).toEqual(['1.1.1']);
  });

  it('brings a letter with the version and what is new, and only once for the same version', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    await s.updates.check();
    expect(s.told).toEqual([{ version: '1.1.1', notes: ['· The postman brings word of new versions.'] }]);
    s.answer({ version: '1.1.2', notes: null });
    await s.updates.check();
    expect(s.told.map((t) => t.version)).toEqual(['1.1.1', '1.1.2']);
  });

  it('says nothing when this is the newest version', async () => {
    const s = shop({ found: [null] });
    await s.updates.check();
    expect(s.told).toEqual([]);
  });

  it('keeps a failed check to itself: one line in the log, nothing for the user', async () => {
    const s = shop({ found: [new Error('net::ERR_INTERNET_DISCONNECTED')] });
    await expect(s.updates.check()).resolves.toBeUndefined();
    expect(s.told).toEqual([]);
    expect(s.logged).toEqual(['update check failed']);
  });
});

describe('downloading and installing', () => {
  it('downloads nothing until the user says so', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    expect(s.asked).toEqual(['check']);
    expect(await s.updates.download()).toBe(true);
    expect(s.asked).toEqual(['check', 'download']);
  });

  it('never installs while the shop is open, even with the new version downloaded mid-commission', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    await s.updates.download();
    await s.updates.check();
    expect(s.asked).not.toContain('install');
  });

  it('installs as the shop closes, after a copy of the data is put aside', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    await s.updates.download();
    s.updates.quitting();
    expect(s.asked).toEqual(['check', 'download', 'backup 1.1.1', 'install']);
    expect(s.logged).toContain('update install');
  });

  it('closing without a downloaded version installs nothing', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    s.updates.quitting();
    expect(s.asked).toEqual(['check']);
  });

  it('a download that fails installs nothing, and the letter can come again', async () => {
    const s = shop({ found: [NEW], download: async () => { throw new Error('net::ERR_CONNECTION_RESET'); } });
    await s.updates.check();
    expect(await s.updates.download()).toBe(false);
    s.updates.quitting();
    expect(s.asked).not.toContain('install');
    expect(s.logged).toContain('update download failed');
    await s.updates.check();
    expect(s.told).toHaveLength(2);
  });

  it('stops checking once a version is waiting to go in', async () => {
    const s = shop({ found: [NEW] });
    await s.updates.check();
    await s.updates.download();
    s.answer({ version: '1.1.2', notes: null });
    await s.updates.check();
    expect(s.asked).toEqual(['check', 'download']);
  });

  it('a copy that cannot be made means no install', async () => {
    const asked: string[] = [];
    const updates = new Updates({
      store: false, wanted: () => true, lang: 'en', tell: () => {}, log: { info: () => {}, warn: () => {} },
      updater: { check: async () => NEW, download: async () => {}, install: () => { asked.push('install'); } },
      backUp: () => { throw new Error('ENOSPC'); },
    });
    await updates.check();
    await updates.download();
    expect(() => updates.quitting()).toThrow('ENOSPC');
    expect(asked).toEqual([]);
  });
});

describe('the copy of the data before an update', () => {
  const NOW = new Date(2026, 10, 15, 9);

  it('copies the data files aside, the way an upgrade does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lamplight-update-'));
    for (const f of ['settings.json', 'memory.json', 'spend.json']) writeFileSync(join(dir, f), `{"file":"${f}"}`);
    writeFileSync(join(dir, 'api-key.bin'), 'secret');
    const to = backUp(dir, 'before-1.1.1', NOW)!;
    expect(to).toBe(join(dir, 'backup', '2026-11-15-before-1.1.1'));
    expect(readdirSync(to).sort()).toEqual(['memory.json', 'settings.json', 'spend.json']);
    expect(readFileSync(join(to, 'memory.json'), 'utf8')).toBe('{"file":"memory.json"}');
  });

  it('makes no folder when there is nothing to copy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lamplight-update-'));
    expect(backUp(dir, 'before-1.1.1', NOW)).toBeUndefined();
    expect(existsSync(join(dir, 'backup'))).toBe(false);
  });
});

describe('the letter', () => {
  // As GitHub hands release notes to the updater: the rendered page, with both languages in it.
  const github = [
    '<h2>小灯屋 1.1.0</h2>',
    '<p>小灯屋会自己知道有没有新版本。</p>',
    '<p><strong>更新</strong></p>',
    '<ul>',
    '<li><strong>邮差送信。</strong> 有新版本时&nbsp;阿信会送信来。</li>',
    '<li>关店时才装，&lt;不会&gt;打断委托。</li>',
    '</ul>',
    '<h2>Lamplight Nook 1.1.0</h2>',
    '<p>The shop knows when there&#39;s a new version.</p>',
    '<p><strong>Updates</strong></p>',
    '<ul>',
    '<li><strong>Post.</strong> The postman brings word &amp; the notes.</li>',
    '</ul>',
  ].join('\n');

  it('reads the notes in the shop\'s own language', () => {
    expect(letterLines(github, 'zh-CN')).toEqual(['小灯屋会自己知道有没有新版本。', '更新', '· 邮差送信。 有新版本时 阿信会送信来。', '· 关店时才装，<不会>打断委托。']);
    expect(letterLines(github, 'en')).toEqual(['The shop knows when there\'s a new version.', 'Updates', '· Post. The postman brings word & the notes.']);
  });

  it('reads notes written as Markdown too', () => {
    const md = '## Lamplight Nook 1.1.1\n\nSmall fixes.\n\n**Fixes**\n- The letter fits the card.\n* Numbers are &#x41;ligned.\n';
    expect(letterLines(md, 'en')).toEqual(['Small fixes.', 'Fixes', '· The letter fits the card.', '· Numbers are Aligned.']);
  });

  it('keeps notes in one language whatever the shop speaks', () => {
    expect(letterLines('<p>Only English here.</p>', 'zh-CN')).toEqual(['Only English here.']);
  });

  it('takes the newest note from a list, and nothing from no notes', () => {
    expect(letterLines([{ version: '1.1.1', note: '<p>Newest.</p>' }, { version: '1.1.0', note: '<p>Older.</p>' }], 'en')).toEqual(['Newest.']);
    expect(letterLines(null, 'en')).toEqual([]);
    expect(letterLines('', 'zh-CN')).toEqual([]);
  });
});
