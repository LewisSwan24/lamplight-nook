import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance, type McpServerToolPolicy } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { Connection, ToolKind } from '../shared/types';
import type { RoundActions } from './action-log';
import { CONNECTION_ID } from './connections';

/**
 * The shop's own tools and the user's connections (road-to-1.3.md C4): MCP servers the app runs in its own process
 * (`sdk` servers), so every call comes back here to be looked at, asked about and written down, and no secret has to be
 * handed to Claude Code. Each server is named nook-<name>, so its tools are mcp__nook-<name>__<tool>.
 */
export const NOOK_PREFIX = 'nook-';

/** What a tool's call knows about the round it is in. */
export type ToolCtx = { run: string; project?: string; workDir: string; signal: AbortSignal };

/** What a tool hands back: Claude's result and, for an outside action, the one thing it made outside, for its undo (C6). */
export type NookResult = CallToolResult & { made?: string };

export type NookTool = {
  /** Without the prefix, such as make_docx. */
  name: string;
  kind: ToolKind;
  /** What the tool does, for Claude. */
  description: string;
  /** The plain sentence on the cards and in the records, such as "read the calendar from 17 to 23 November". */
  label: (input: unknown) => string;
  /** An outside action: how it is undone, in the user's words, for the card and the record (C6). */
  undoHow?: string;
  schema: ZodRawShape;
  run: (input: unknown, ctx: ToolCtx) => Promise<NookResult>;
};

/**
 * One server: the shop's own (office) or a connection's (named by its id, with `connection` saying which). `used` hears of
 * each call, before it runs.
 */
export type NookServer = { name: string; tools: NookTool[]; used?: (t: NookTool) => void; connection?: { id: string; label: string } };
/** A tool of this round, with the connection it belongs to, if any. */
export type RoundTool = NookTool & { connection?: { id: string; label: string } };

/** Claude Code asks the app before every call of these, whatever else it has been told (sdk.d.ts McpSdkServerConfig.tools). */
const ALWAYS_ASK = new Set<ToolKind>(['outside', 'final']);

export const nookName = (server: string, toolName: string) => `mcp__${NOOK_PREFIX}${server}__${toolName}`;

/**
 * The SDK's config for one server, its tools bound to this round. With `actions`, a connection's every call is written
 * down and refused while connections are paused (C6).
 */
export function sdkServer(s: NookServer, ctx: ToolCtx, actions?: RoundActions): McpSdkServerConfigWithInstance & { tools?: McpServerToolPolicy[] } {
  const config = createSdkMcpServer({
    name: `${NOOK_PREFIX}${s.name}`,
    version: '1.0.0',
    tools: s.tools.map((t) => tool(t.name, t.description, t.schema, async (args) => {
      s.used?.(t);
      if (actions) return actions.call(s, t, args, ctx);
      const { made: _made, ...result } = await t.run(args, ctx);
      return result;
    })),
  });
  const asks = s.tools.filter((t) => ALWAYS_ASK.has(t.kind)).map((t): McpServerToolPolicy => ({ name: t.name, permission_policy: 'always_ask' }));
  return asks.length ? { ...config, tools: asks } : config;
}

/** Every tool of this round by its full name, for the risk classifier and the cards. */
export function toolsByName(servers: NookServer[]): Map<string, RoundTool> {
  return new Map(servers.flatMap((s) => s.tools.map((t): [string, RoundTool] => [nookName(s.name, t.name), s.connection ? { ...t, connection: s.connection } : t])));
}

/**
 * The connections a round may use: those ticked on its slip that are still there and not paused. Nothing else ever
 * reaches the round's mcpServers. `serverOf` gives a connection's server, or null for a kind this build cannot run.
 */
export function connectionServers(ticked: string[] | undefined, list: Connection[], serverOf: (c: Connection) => NookServer | null): NookServer[] {
  const want = new Set(ticked ?? []);
  return list.filter((c) => want.has(c.id) && CONNECTION_ID.test(c.id) && !c.paused)
    .map(serverOf).filter((s): s is NookServer => s !== null);
}

/** Options.mcpServers for a round. */
export function mcpServersOf(servers: NookServer[], ctx: ToolCtx, actions?: RoundActions): Record<string, McpSdkServerConfigWithInstance> {
  return Object.fromEntries(servers.map((s) => [`${NOOK_PREFIX}${s.name}`, sdkServer(s, ctx, actions)]));
}
