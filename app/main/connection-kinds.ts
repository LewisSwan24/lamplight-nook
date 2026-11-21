import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { fill, strings } from '../shared/i18n';
import type { Connection, ConnectionKind, ConnectionOffer, Grant, SetupError } from '../shared/types';
import type { DraftRecord } from './drafts';
import { draftEml, EmlError } from './eml';
import { FolderLinkError, listLinked, readLinked, saveCopy, undoCopy } from './folder-link';
import { eventsBetween, eventsText, IcsError } from './ics';
import type { NookResult, NookTool } from './nook-tools';
import { outputPath } from './office/paths';
import { reallyInside } from './paths';

/**
 * What a kind of connection is (road-to-1.3.md C4): its name and authorisation card in the user's words, a line for Claude
 * on what it is for, the settings and secret it starts with, and its tools. C5 adds the real kinds; until then the only
 * one is the test connection of a development build.
 */
export type KindDef = {
  kind: ConnectionKind;
  label: string;
  grant: Grant;
  /** For the prompt, in English like the rest of it. */
  brief: string;
  /** What the authorisation card asks for besides "Connect" (C5): a folder picked next, or an address typed on it. */
  asks?: ConnectionOffer['asks'];
  /**
   * What this one connection is, from what the user gave (C5): its name, settings and secret, or why it is not made.
   * `address` is what was typed on the card; a folder kind picks its folder itself.
   */
  setup: (input: { address?: string }) => Promise<Setup | { error: SetupError }>;
  /** `secret` unlocks the connection's secret, only when a tool needs it. */
  tools: (c: Connection, secret: () => string | null) => NookTool[];
  /**
   * Undo an outside action of one of its tools, given what that action made (C6): true once it is gone. Only ever what
   * the kind's own tools make, in their own place, which `c`'s settings say.
   */
  undo?: (tool: string, made: string, c?: Connection) => boolean;
};

export type Setup = { label: string; config: Connection['config']; secret?: string };

export const offerOf = (k: KindDef): ConnectionOffer => ({ kind: k.kind, label: k.label, grant: k.grant, ...(k.asks ? { asks: k.asks } : {}) });

const said = (text: string, isError = false): NookResult => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });
const fileOf = (input: unknown) => String((input as { file?: unknown }).file ?? '');

/**
 * A synced folder (C5): one the user picks, never one that holds too much (`tooBroad`, the rule lent folders go by).
 * list and read are reads; save_copy saves into the subfolder named when it was connected, and its undo deletes that copy.
 */
export function folderKind(pickFolder: () => Promise<string | null>, tooBroad: (path: string) => boolean): KindDef {
  const K = () => strings.ui.connections.kinds.folder;
  const where = (c: Connection) => ({ root: String(c.config.path), saveTo: String(c.config.saveTo) });
  return {
    kind: 'folder',
    label: K().label,
    grant: K().grant as Grant,
    brief: 'a folder of the user\'s that a cloud service syncs: list it (two levels), read a file in it, and save a copy of a finished file into its own subfolder with save_copy, which the user is asked about every time. It never deletes, renames, moves or changes the user\'s files',
    asks: 'folder',
    setup: async () => {
      const path = await pickFolder();
      if (!path) return { error: 'cancelled' };
      if (tooBroad(path)) return { error: 'broad' };
      return { label: fill(K().labelOf, { name: basename(path) || path }), config: { path, saveTo: K().saveTo } };
    },
    tools: (c): NookTool[] => {
      const { root, saveTo } = where(c);
      const missing = () => (existsSync(root) ? null : said('The connected folder is not on this computer right now (it may be unplugged or no longer synced).', true));
      return [{
        name: 'list',
        kind: 'read',
        description: 'List the files in the connected folder, two levels deep: relative path, size in bytes, date last changed; folders end with "/". Hidden files and files named like keys are left out. Takes no arguments.',
        label: () => K().list,
        schema: {},
        run: async () => missing() ?? said(listLinked(root)),
      }, {
        name: 'read',
        kind: 'read',
        description: 'Read one file of the connected folder; `file` is its path as list gives it. Text comes back as it is, a Word, Excel or PowerPoint file as its text; a PDF or a picture is copied into the commission folder, and you read that copy with the Read tool. Up to 20 MB.',
        label: (input) => fill(K().read, { file: fileOf(input) }),
        schema: { file: z.string().min(1).max(500) },
        run: async (input, ctx) => {
          const gone = missing();
          if (gone) return gone;
          try {
            const r = readLinked(root, fileOf(input), ctx.workDir, strings.ui.files.fromFolder);
            return 'text' in r ? said(r.text) : said(`Copied it into the commission folder as "${r.copied}". Read that copy with the Read tool.`);
          } catch (err) {
            if (err instanceof FolderLinkError) return said(err.message, true);
            throw err;
          }
        },
      }, {
        name: 'save_copy',
        kind: 'outside',
        description: `Save a copy of a file this commission made into the connected folder's own subfolder "${saveTo}", under a name nothing there has: nothing is ever replaced. \`file\` is relative to the commission folder. The user is asked every time and can undo it.`,
        label: (input) => fill(K().saveCopy, { file: fileOf(input), folder: saveTo }),
        undoHow: K().saveCopyUndo,
        schema: { file: z.string().min(1).max(500) },
        run: async (input, ctx) => {
          const gone = missing();
          if (gone) return gone;
          try {
            const made = saveCopy(root, saveTo, ctx.workDir, fileOf(input));
            return { ...said(`Saved a copy as "${saveTo}/${basename(made)}" in the connected folder. The user can undo it.`), made };
          } catch (err) {
            if (err instanceof FolderLinkError) return said(err.message, true);
            throw err;
          }
        },
      }];
    },
    undo: (tool, made, c) => Boolean(c) && tool === 'save_copy' && undoCopy(where(c!).root, where(c!).saveTo, made),
  };
}

/** How a calendar's address is fetched: the main process's net.fetch in the app, a stand-in in the tests. */
export type FetchText = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/** A calendar's address the shop takes: https, a webcal:// one read as https, and a local one only for the simulated runs. */
export function calendarAddress(typed: string, allowLocal: boolean): string | null {
  const t = typed.trim().replace(/^webcals?:\/\//i, 'https://');
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  if (u.protocol === 'https:') return u.href;
  return allowLocal && u.protocol === 'http:' && u.hostname === '127.0.0.1' ? u.href : null;
}

/** Biggest calendar file read: a busy calendar over years stays well under this. */
export const MAX_CALENDAR_BYTES = 5 * 1024 * 1024;

/**
 * A calendar, read only (C5): its private iCal address is the secret, typed on the card, kept in connections.bin and
 * never put in anything Claude sees or any message. One read tool: the events between two days.
 */
export function calendarKind(fetchText: FetchText, allowLocal: boolean, zone?: string): KindDef {
  const K = () => strings.ui.connections.kinds.calendar;
  return {
    kind: 'calendar',
    label: K().label,
    grant: K().grant as Grant,
    brief: 'the user\'s calendar, read only: the events between two days (at most 62 days at a time). It cannot be changed: to add an event, write an .ics file in the commission folder, which the user opens themselves',
    asks: 'address',
    setup: async ({ address }) => {
      const url = calendarAddress(address ?? '', allowLocal);
      if (!url) return { error: 'address' };
      return { label: fill(K().labelOf, { host: new URL(url).hostname }), config: { host: new URL(url).hostname }, secret: url };
    },
    tools: (_c, unlock): NookTool[] => [{
      name: 'events',
      kind: 'read',
      description: 'The events in the user\'s calendar between two days, both included (YYYY-MM-DD, at most 62 days), in this computer\'s time, repeats unfolded: day, start and end, title, place.',
      label: (input) => fill(K().events, { from: String((input as { from?: unknown }).from ?? ''), to: String((input as { to?: unknown }).to ?? '') }),
      schema: { from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
      run: async (input) => {
        const { from, to } = input as { from: string; to: string };
        const url = unlock();
        if (!url) return said('The calendar\'s address could not be unlocked on this computer.', true);
        // Nothing from the fetch reaches Claude but the calendar itself: an error never carries the address.
        let res: Awaited<ReturnType<FetchText>>;
        try {
          res = await fetchText(url);
        } catch {
          return said('The calendar could not be reached. The computer may be offline.', true);
        }
        if (!res.ok) return said(`The calendar could not be fetched (HTTP ${res.status}). Its address may have been reset.`, true);
        const text = await res.text();
        if (Buffer.byteLength(text) > MAX_CALENDAR_BYTES) return said('The calendar is too big to read (over 5 MB).', true);
        try {
          const r = eventsBetween(text, from, to, zone ? { zone } : {});
          return said(eventsText(r.events, zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, r.more));
        } catch (err) {
          if (err instanceof IcsError) return said(err.message, true);
          throw err;
        }
      },
    }],
  };
}

/**
 * Email drafts (C5): no account, no secret; one tool writing a draft into the commission folder, never sending it. Each
 * draft goes on `drafts`, which is what lets it open with a click (road-to-1.4.md).
 */
export function maildraftKind(drafts: DraftRecord): KindDef {
  const K = () => strings.ui.connections.kinds.maildraft;
  return {
    kind: 'maildraft',
    label: K().label,
    grant: K().grant as Grant,
    brief: 'email drafts, never sent: write a draft (.eml) in the commission folder with the draft tool. When the request is a letter or an email, also make a draft of it; the user opens it in their mail program from the result card and sends it themselves',
    setup: async () => ({ label: K().label, config: {} }),
    tools: (): NookTool[] => [{
      name: 'draft',
      kind: 'make',
      description: 'Write an email draft as an .eml file in the commission folder; it is never sent. `to` are plain addresses (name@example.com, none for a draft without one), `subject` and `body` plain text, `file` the new file\'s path relative to the commission folder, ending in .eml.',
      label: (input) => fill(K().draft, { file: fileOf(input) }),
      schema: { to: z.array(z.string().max(200)).max(20), subject: z.string().max(300), body: z.string().max(50_000), file: z.string().min(1).max(500) },
      run: async (input, ctx) => {
        const { to, subject, body } = input as { to: string[]; subject: string; body: string };
        const full = outputPath(ctx.workDir, fileOf(input), '.eml', ctx.preexisting);
        let eml: string;
        try {
          eml = draftEml({ to, subject, body });
        } catch (err) {
          if (err instanceof EmlError) return said(err.message, true);
          throw err;
        }
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, eml, { flag: 'wx' });
        drafts.add(eml);
        return said(`Wrote the draft "${relative(ctx.workDir, full)}". The user opens it in their mail program from the result card and sends it themselves.`);
      },
    }],
  };
}

/** What the test connection's one tool hands over: material, like anything read through a connection. */
export const TEST_NOTE = 'Test note: the shop\'s test connection works. Nothing outside this computer was reached.';

/** What the test connection's outside tool saves: always the same words, so nothing of the commission leaves with it. */
export const TEST_SAVED = 'A note the shop saved through its test connection.\n';

/**
 * The test connection, for the simulated runs only (never in a packaged build): one read tool that hands over a fixed
 * note, and one outside tool (C6) that saves a fixed note into `outsideDir`, standing in for "a copy to the cloud folder";
 * its undo deletes that note. Its secret is the string the run names (LAMPLIGHT_TEST_SECRET), so the run can look for it
 * in the logs and the recordings afterwards, and must not find it.
 */
export function testKind(secret: () => string, outsideDir: string): KindDef {
  const T = strings.ui.connections.kinds.test;
  return {
    kind: 'test',
    label: T.label,
    grant: T.grant as Grant,
    brief: 'a test note that comes with the development build; it can only be read',
    setup: async () => ({ label: T.label, config: { note: 'test' }, secret: secret() }),
    tools: (_c, unlock) => [{
      name: 'read_note',
      kind: 'read',
      description: 'Read the note kept in the test connection. Takes no arguments.',
      label: () => T.readNote,
      schema: {},
      // The note is only handed over when the connection's key unlocks, as a real one would need it to reach its service.
      run: async () => (unlock() ? { content: [{ type: 'text', text: TEST_NOTE }] } : { content: [{ type: 'text', text: 'The test connection could not be opened.' }], isError: true }),
    }, {
      name: 'save_note',
      kind: 'outside',
      description: "Save a short fixed note into the test connection's folder, as a stand-in for saving a copy somewhere outside the commission folder. Takes no arguments. The user is asked every time.",
      label: () => T.saveNote,
      undoHow: T.saveNoteUndo,
      schema: {},
      run: async () => {
        mkdirSync(outsideDir, { recursive: true });
        let n = Date.now();
        while (true) {
          const file = join(outsideDir, `note-${n}.txt`);
          try {
            writeFileSync(file, TEST_SAVED, { flag: 'wx' });
            return { content: [{ type: 'text', text: "Saved a note in the test connection's folder. The user can undo it." }], made: file };
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
            n++;
          }
        }
      },
    }],
    undo: (tool, made) => {
      const file = resolve(made);
      if (tool !== 'save_note' || file === resolve(outsideDir) || !reallyInside(outsideDir, file)) return false;
      rmSync(file, { force: true });
      return true;
    },
  };
}
