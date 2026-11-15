import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { strings } from '../shared/i18n';
import type { Connection, ConnectionKind, ConnectionOffer, Grant } from '../shared/types';
import type { NookTool } from './nook-tools';
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
  config: () => Connection['config'];
  secret?: () => string;
  /** `secret` unlocks the connection's secret, only when a tool needs it. */
  tools: (c: Connection, secret: () => string | null) => NookTool[];
  /**
   * Undo an outside action of one of its tools, given what that action made (C6): true once it is gone. Only ever what
   * the kind's own tools make, in their own place.
   */
  undo?: (tool: string, made: string) => boolean;
};

export const offerOf = (k: KindDef): ConnectionOffer => ({ kind: k.kind, label: k.label, grant: k.grant });

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
    config: () => ({ note: 'test' }),
    secret,
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
