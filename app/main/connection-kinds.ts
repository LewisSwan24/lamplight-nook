import { strings } from '../shared/i18n';
import type { Connection, ConnectionKind, ConnectionOffer, Grant } from '../shared/types';
import type { NookTool } from './nook-tools';

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
};

export const offerOf = (k: KindDef): ConnectionOffer => ({ kind: k.kind, label: k.label, grant: k.grant });

/** What the test connection's one tool hands over: material, like anything read through a connection. */
export const TEST_NOTE = 'Test note: the shop\'s test connection works. Nothing outside this computer was reached.';

/**
 * The test connection, for the simulated runs only (never in a packaged build): one read tool that hands over a fixed
 * note. Its secret is the string the run names (LAMPLIGHT_TEST_SECRET), so the run can look for it in the logs and the
 * recordings afterwards, and must not find it.
 */
export function testKind(secret: () => string): KindDef {
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
    }],
  };
}
