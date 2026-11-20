import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strings } from '../app/shared/i18n';
import type { Connection } from '../app/shared/types';
import { calendarAddress, calendarKind, type FetchText, folderKind, maildraftKind, offerOf } from '../app/main/connection-kinds';
import type { NookTool, ToolCtx } from '../app/main/nook-tools';

const dir = () => mkdtempSync(join(tmpdir(), 'kinds-'));
const ctxIn = (workDir: string, preexisting: string[] = []): ToolCtx => ({ run: 'r1', workDir, signal: new AbortController().signal, preexisting: new Set(preexisting) });
const conn = (kind: Connection['kind'], config: Connection['config']): Connection => ({ id: 'k1', kind, label: 'x', added: '2026-11-20', config });
const tool = (tools: NookTool[], name: string) => tools.find((t) => t.name === name)!;
const text = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;

const SECRET = 'https://calendar.example.com/private-5f3c9a/basic.ics';
const ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:1', 'DTSTART:20261120T010000Z', 'DTEND:20261120T020000Z', 'SUMMARY:Dentist', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const answer = (status: number, body: string): FetchText => async () => ({ ok: status === 200, status, text: async () => body });

describe('the first real connections (road-to-1.3.md C5)', () => {
  it('a synced folder is set up from the folder picked, never a broad one, and saves into its own subfolder', async () => {
    const root = dir();
    expect(await folderKind(async () => null, () => false).setup({})).toEqual({ error: 'cancelled' });
    expect(await folderKind(async () => root, () => true).setup({})).toEqual({ error: 'broad' });
    const k = folderKind(async () => root, () => false);
    const set = await k.setup({});
    expect(set).toMatchObject({ config: { path: root, saveTo: strings.ui.connections.kinds.folder.saveTo } });
    expect(offerOf(k).asks).toBe('folder');
    expect(k.tools(conn('folder', {}), () => null).map((t) => [t.name, t.kind])).toEqual([['list', 'read'], ['read', 'read'], ['save_copy', 'outside']]);
  });

  it('its tools list, read and save a copy, and its undo deletes only that copy', async () => {
    const root = dir();
    const work = dir();
    writeFileSync(join(root, 'notes.md'), 'tea');
    writeFileSync(join(work, 'poster.png'), 'png');
    const c = conn('folder', { path: root, saveTo: 'Lamplight Nook' });
    const k = folderKind(async () => root, () => false);
    const tools = k.tools(c, () => null);
    expect(text(await tool(tools, 'list').run({}, ctxIn(work)))).toContain('notes.md');
    expect(text(await tool(tools, 'read').run({ file: 'notes.md' }, ctxIn(work)))).toBe('tea');
    const refused = await tool(tools, 'read').run({ file: '../x.txt' }, ctxIn(work));
    expect(refused.isError).toBe(true);
    const saved = await tool(tools, 'save_copy').run({ file: 'poster.png' }, ctxIn(work));
    expect(saved.made).toBe(join(root, 'Lamplight Nook', 'poster.png'));
    expect(tool(tools, 'save_copy').undoHow).toBeTruthy();
    expect(k.undo!('save_copy', join(root, 'notes.md'), c)).toBe(false);
    expect(k.undo!('read', saved.made!, c)).toBe(false);
    expect(k.undo!('save_copy', saved.made!)).toBe(false);
    expect(k.undo!('save_copy', saved.made!, c)).toBe(true);
    expect(existsSync(saved.made!)).toBe(false);
    expect(existsSync(join(root, 'notes.md'))).toBe(true);
  });

  it('says when the synced folder is not on this computer any more', async () => {
    const tools = folderKind(async () => null, () => false).tools(conn('folder', { path: join(dir(), 'gone'), saveTo: 'x' }), () => null);
    const r = await tool(tools, 'list').run({}, ctxIn(dir()));
    expect(r.isError).toBe(true);
  });

  it('a calendar takes only an https address (webcal read as https), a local one only in a simulated run, and keeps it as the secret', async () => {
    expect(calendarAddress(SECRET, false)).toBe(SECRET);
    expect(calendarAddress(' webcal://calendar.example.com/a.ics ', false)).toBe('https://calendar.example.com/a.ics');
    for (const bad of ['http://calendar.example.com/a.ics', 'file:///C:/a.ics', 'https://user:pw@example.com/a.ics', 'not a url', 'http://127.0.0.1:8123/cal.ics']) expect(calendarAddress(bad, false), bad).toBeNull();
    expect(calendarAddress('http://127.0.0.1:8123/cal.ics', true)).toBe('http://127.0.0.1:8123/cal.ics');
    expect(calendarAddress('http://localhost:8123/cal.ics', true)).toBeNull();
    const k = calendarKind(answer(200, ICS), false, 'Asia/Shanghai');
    expect(await k.setup({ address: 'ftp://x' })).toEqual({ error: 'address' });
    const set = await k.setup({ address: SECRET });
    expect(set).toEqual({ label: expect.stringContaining('calendar.example.com'), config: { host: 'calendar.example.com' }, secret: SECRET });
    expect(JSON.stringify((set as { config: unknown }).config)).not.toContain('private-5f3c9a');
    expect(offerOf(k).asks).toBe('address');
  });

  it('its one tool reads the events of the days asked, and no answer it gives ever holds the address', async () => {
    const run = async (fetchText: FetchText, unlock: () => string | null) => {
      const t = tool(calendarKind(fetchText, false, 'Asia/Shanghai').tools(conn('calendar', { host: 'calendar.example.com' }), unlock), 'events');
      expect(t.kind).toBe('read');
      return t.run({ from: '2026-11-20', to: '2026-11-26' }, ctxIn(dir()));
    };
    expect(text(await run(answer(200, ICS), () => SECRET))).toMatch(/2026-11-20 Fri 09:00-10:00 Dentist/);
    const answers = [
      await run(answer(404, ''), () => SECRET),
      await run(async () => { throw new Error(`getaddrinfo ENOTFOUND ${SECRET}`); }, () => SECRET),
      await run(answer(200, '<html>moved</html>'), () => SECRET),
      await run(answer(200, ICS), () => null),
    ];
    for (const r of answers) {
      expect(r.isError).toBe(true);
      expect(text(r)).not.toContain('private-5f3c9a');
    }
  });

  it('email drafts write an .eml in the commission folder, never over a file that was there, and never send', async () => {
    const work = dir();
    const k = maildraftKind();
    expect(await k.setup({})).toEqual({ label: strings.ui.connections.kinds.maildraft.label, config: {} });
    const t = tool(k.tools(conn('maildraft', {}), () => null), 'draft');
    expect(t.kind).toBe('make');
    expect(text(await t.run({ to: ['ann@example.org'], subject: '读书会', body: 'Hi', file: 'letter.eml' }, ctxIn(work)))).toMatch(/letter\.eml/);
    expect(readFileSync(join(work, 'letter.eml'), 'utf8')).toMatch(/^X-Unsent: 1$/m);
    mkdirSync(join(work, 'sub'));
    writeFileSync(join(work, 'sub', 'mine.eml'), 'theirs');
    await expect(t.run({ to: [], subject: 's', body: 'b', file: 'sub/mine.eml' }, ctxIn(work, [join(work, 'sub', 'mine.eml')]))).rejects.toThrow();
    expect(readFileSync(join(work, 'sub', 'mine.eml'), 'utf8')).toBe('theirs');
    expect((await t.run({ to: ['not an address'], subject: 's', body: 'b', file: 'x.eml' }, ctxIn(work))).isError).toBe(true);
    await expect(t.run({ to: [], subject: 's', body: 'b', file: 'x.txt' }, ctxIn(work))).rejects.toThrow(/must end in \.eml/);
  });
});
