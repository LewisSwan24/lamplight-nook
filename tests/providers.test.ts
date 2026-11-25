import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Other providers (plan-1.6.md F7): Anthropic as before; a service with an Anthropic-compatible endpoint, with presets
// checked against each provider's own documentation; Amazon Bedrock; Google Vertex AI. Claude Code gets only the variables
// the chosen one needs. Each provider's key is kept apart, encrypted, and never reaches a log or the diagnostics. A
// compatible service needs its prices filled in before work starts, and the ledger counts with them (Q-F9).

const calls: { prompt: unknown; options: Record<string, unknown> }[] = [];
let messages: unknown[] = [];
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: unknown; options: Record<string, unknown> }) => {
    calls.push({ prompt, options });
    return (async function* () { yield* messages; })();
  },
}));
vi.mock('../app/main/claude-locator', () => ({ locateClaude: () => 'C:/claude.exe' }));

const { DEFAULT_PROVIDER, PRESETS, baseUrlProblem, cleanProvider, isTrial, missingForWork, presetById, secretSlot } = await import('../app/shared/providers');
const { ProviderKeys, checkProvider, providerCredentials, providerEnv, pricedUsd, providerHint, saveProvider } = await import('../app/main/providers');
const { agentEnv, redactSecrets } = await import('../app/main/api-key');
const { runAgent } = await import('../app/main/agent-runner');
const { SettingsStore } = await import('../app/main/settings');
const { diagnosticsEntries } = await import('../app/main/diagnostics');

const tmp = () => mkdtempSync(join(tmpdir(), 'lamplight-providers-'));
/** Encryption as the tests play it: reversible, but never the plain text on disk. */
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
  decryptString: (b: Buffer) => Buffer.from(b.toString().slice(4), 'base64').toString(),
};

const HOST = {
  PATH: 'C:/bin', HOME: 'C:/me',
  ANTHROPIC_API_KEY: 'sk-ant-users-own-0000000000000000', ANTHROPIC_BASE_URL: 'https://somewhere.example', ANTHROPIC_AUTH_TOKEN: 'host-token',
  CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 'oauth', AWS_PROFILE: 'work', AWS_ACCESS_KEY_ID: 'AKIAHOST', AWS_REGION: 'eu-west-1',
  GOOGLE_APPLICATION_CREDENTIALS: 'C:/me/gcp.json', CLOUD_ML_REGION: 'us', ANTHROPIC_VERTEX_PROJECT_ID: 'host-project', CLAUDECODE: '1',
};
const compatible = { kind: 'compatible' as const, preset: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-flash[1m]', fastModel: 'deepseek-flash', prices: { input: 0.3, output: 1.2 } };

beforeEach(() => {
  calls.length = 0;
  messages = [];
});

describe('the presets', () => {
  it('are the services whose Anthropic-compatible endpoint their own documentation gives (Q-F8)', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['deepseek', 'kimi', 'glm', 'glm-intl', 'bailian', 'bailian-intl', 'openrouter']);
    for (const p of PRESETS) {
      expect(baseUrlProblem(p.baseUrl), p.id).toBeNull();
      expect(p.model, p.id).toMatch(/\S/);
      expect(p.docs, p.id).toMatch(/^https:\/\//);
    }
    expect(presetById('deepseek')).toMatchObject({ baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-flash[1m]', fastModel: 'deepseek-flash' });
    expect(presetById('kimi')).toMatchObject({ baseUrl: 'https://api.moonshot.ai/anthropic', model: 'kimi-k3[1m]' });
    expect(presetById('glm')).toMatchObject({ baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.4[1m]', fastModel: 'glm-5.3-flash[1m]' });
    expect(presetById('openrouter')).toMatchObject({ baseUrl: 'https://openrouter.ai/api' });
    expect(presetById('nope')).toBeUndefined();
  });
});

describe('the address of a compatible service', () => {
  it('must be HTTPS, or HTTP on this computer only, for a gateway of one\'s own', () => {
    expect(baseUrlProblem('https://api.deepseek.com/anthropic')).toBeNull();
    expect(baseUrlProblem('http://localhost:4000')).toBeNull();
    expect(baseUrlProblem('http://127.0.0.1:4000/anthropic')).toBeNull();
    expect(baseUrlProblem('http://[::1]:4000')).toBeNull();
    expect(baseUrlProblem('http://api.deepseek.com/anthropic')).toBe('scheme');
    expect(baseUrlProblem('http://192.168.1.5:4000')).toBe('scheme');
    expect(baseUrlProblem('http://localhost.example.com')).toBe('scheme');
    expect(baseUrlProblem('ftp://x.example')).toBe('scheme');
    expect(baseUrlProblem('not a url')).toBe('shape');
  });

  it('carries no key: no user name or password, no query', () => {
    expect(baseUrlProblem('https://me:secret@api.example.com')).toBe('secret');
    expect(baseUrlProblem('https://api.example.com/anthropic?key=abc')).toBe('secret');
    expect(baseUrlProblem('https://api.example.com/anthropic#k')).toBe('secret');
  });
});

describe('what settings keep about the provider', () => {
  it('Anthropic to begin with; a compatible service with its address, model and prices; nothing broken', () => {
    expect(DEFAULT_PROVIDER).toEqual({ kind: 'anthropic' });
    expect(cleanProvider(compatible)).toEqual(compatible);
    expect(cleanProvider({ ...compatible, baseUrl: 'http://api.deepseek.com' })).toBeUndefined();
    expect(cleanProvider({ ...compatible, model: '  ' })).toBeUndefined();
    expect(cleanProvider({ kind: 'openai' })).toBeUndefined();
    // Prices that are not plain positive numbers are dropped, which leaves the shop unable to start work.
    expect(cleanProvider({ ...compatible, prices: { input: -1, output: 2 } })).toEqual({ ...compatible, prices: undefined });
    expect(cleanProvider({ kind: 'bedrock', region: 'us-east-1', extra: 1 })).toEqual({ kind: 'bedrock', region: 'us-east-1' });
    expect(cleanProvider({ kind: 'bedrock', region: 'us east' })).toBeUndefined();
    expect(cleanProvider({ kind: 'vertex', region: 'global', project: 'my-proj', credentialsFile: 'C:/keys/sa.json' })).toEqual({ kind: 'vertex', region: 'global', project: 'my-proj', credentialsFile: 'C:/keys/sa.json' });
  });

  it('the settings store keeps it, and refuses one it cannot use', () => {
    const file = join(tmp(), 'settings.json');
    const s = new SettingsStore(file, '/docs');
    expect(s.get().provider).toEqual({ kind: 'anthropic' });
    expect(s.update({ provider: compatible }).provider).toEqual(compatible);
    expect(s.update({ provider: { kind: 'compatible', baseUrl: 'http://evil.example', model: 'x' } as never }).provider).toEqual(compatible);
    expect(new SettingsStore(file, '/docs').get().provider).toEqual(compatible);
    writeFileSync(file, JSON.stringify({ provider: { kind: 'compatible', baseUrl: 'nope' } }));
    expect(new SettingsStore(file, '/docs').get().provider).toEqual({ kind: 'anthropic' });
  });

  it('a compatible service without prices cannot start work, nor one without a model', () => {
    expect(missingForWork(compatible)).toBeNull();
    expect(missingForWork({ ...compatible, prices: undefined })).toBe('prices');
    expect(missingForWork({ kind: 'anthropic' })).toBeNull();
    expect(missingForWork({ kind: 'vertex', region: 'global' })).toBe('project');
    expect(missingForWork({ kind: 'bedrock' })).toBe('region');
  });

  it('only a compatible service is a trial', () => {
    expect(isTrial(compatible)).toBe(true);
    expect(isTrial({ kind: 'anthropic' })).toBe(false);
    expect(isTrial({ kind: 'bedrock', region: 'us-east-1' })).toBe(false);
  });
});

describe('each provider\'s key, kept apart', () => {
  it('a slot of its own for each provider, a preset or the host of an address', () => {
    expect(secretSlot({ kind: 'anthropic' })).toBe('anthropic');
    expect(secretSlot(compatible)).toBe('compatible-deepseek');
    expect(secretSlot({ kind: 'compatible', baseUrl: 'http://127.0.0.1:4000/x', model: 'm' })).toBe('compatible-127.0.0.1-4000');
    expect(secretSlot({ kind: 'bedrock', region: 'us-east-1' })).toBe('bedrock');
  });

  it('switching keeps every key, each encrypted', () => {
    const dir = tmp();
    const keys = new ProviderKeys(dir, join(dir, 'api-key.bin'), crypto);
    keys.set('anthropic', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa');
    keys.set('compatible-deepseek', 'sk-deepseek-0123456789');
    keys.set('compatible-kimi', 'sk-kimi-9876543210');
    expect(keys.get('compatible-deepseek')).toBe('sk-deepseek-0123456789');
    expect(keys.get('compatible-kimi')).toBe('sk-kimi-9876543210');
    // The Anthropic key stays where 1.5 kept it.
    expect(readFileSync(join(dir, 'api-key.bin'), 'utf8')).not.toContain('sk-ant');
    for (const f of readdirSync(join(dir, 'keys'))) expect(readFileSync(join(dir, 'keys', f), 'utf8')).not.toContain('sk-');
    keys.clear('compatible-kimi');
    expect(keys.get('compatible-kimi')).toBeNull();
    expect(keys.get('compatible-deepseek')).toBe('sk-deepseek-0123456789');
  });

  it('a slot name never leaves the keys folder', () => {
    const dir = tmp();
    const keys = new ProviderKeys(dir, join(dir, 'api-key.bin'), crypto);
    keys.set('../../evil', 'x');
    expect(readdirSync(join(dir, 'keys'))).toEqual(['evil.bin']);
  });

  it('a key is shown only by its last four characters', () => {
    expect(providerHint('sk-deepseek-0123456789')).toBe('...6789');
  });
});

describe('what Claude Code is given', () => {
  const names = (env: Record<string, string | undefined>) => Object.keys(env).filter((n) => env[n] !== undefined).sort();

  it('Anthropic: the key alone, as before', () => {
    const env = agentEnv({ source: 'stored', apiKey: 'sk-ant-api03-mine' }, HOST);
    expect(names(env)).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'HOME', 'PATH']);
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-mine');
  });

  it('a compatible service: its address, its key as a bearer token, its model for every alias', () => {
    const env = providerEnv(compatible, 'sk-deepseek-0123456789', HOST);
    expect(names(env)).toEqual([
      'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_MODEL', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'CLAUDE_CODE_SUBAGENT_MODEL', 'HOME', 'PATH',
    ]);
    expect(env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_AUTH_TOKEN: 'sk-deepseek-0123456789', ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: 'deepseek-flash[1m]', ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-flash[1m]', ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-flash[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-flash', CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-flash[1m]',
    });
  });

  it('Bedrock with an API key, or with an access key pair; nothing of the user\'s own AWS setup', () => {
    const token = providerEnv({ kind: 'bedrock', region: 'us-west-2' }, 'bedrock-api-key-abc', HOST);
    expect(names(token)).toEqual(['AWS_BEARER_TOKEN_BEDROCK', 'AWS_REGION', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'CLAUDE_CODE_USE_BEDROCK', 'HOME', 'PATH']);
    expect(token).toMatchObject({ CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: 'us-west-2', AWS_BEARER_TOKEN_BEDROCK: 'bedrock-api-key-abc' });
    const pair = providerEnv({ kind: 'bedrock', region: 'us-west-2' }, 'AKIAIOSFODNN7EXAMPLE:secretpart', HOST);
    expect(pair).toMatchObject({ AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE', AWS_SECRET_ACCESS_KEY: 'secretpart' });
    expect(pair.AWS_BEARER_TOKEN_BEDROCK).toBeUndefined();
    expect(pair.AWS_PROFILE).toBeUndefined();
  });

  it('Vertex: region, project and the key file', () => {
    const env = providerEnv({ kind: 'vertex', region: 'global', project: 'my-proj', credentialsFile: 'C:/keys/sa.json' }, null, HOST);
    expect(names(env)).toEqual(['ANTHROPIC_VERTEX_PROJECT_ID', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', 'CLAUDE_CODE_USE_VERTEX', 'CLOUD_ML_REGION', 'GOOGLE_APPLICATION_CREDENTIALS', 'HOME', 'PATH']);
    expect(env).toMatchObject({ CLOUD_ML_REGION: 'global', ANTHROPIC_VERTEX_PROJECT_ID: 'my-proj', GOOGLE_APPLICATION_CREDENTIALS: 'C:/keys/sa.json' });
  });

  it('the credentials a run uses come from the chosen provider and its own key', () => {
    expect(providerCredentials({ kind: 'anthropic' }, (slot) => (slot === 'anthropic' ? 'sk-ant-api03-x' : null))).toEqual({ source: 'stored', apiKey: 'sk-ant-api03-x' });
    expect(providerCredentials(compatible, (slot) => (slot === 'compatible-deepseek' ? 'sk-d' : null))).toEqual({ source: 'stored', apiKey: 'sk-d', provider: compatible });
    expect(providerCredentials(compatible, () => null)).toBeNull();
    // Vertex keeps no key of the shop's: the file is the user's own.
    const vertex = { kind: 'vertex' as const, region: 'global', project: 'p', credentialsFile: 'C:/sa.json' };
    expect(providerCredentials(vertex, () => null)).toEqual({ source: 'stored', provider: vertex });
    // A run started with them gets the provider's environment.
    expect(agentEnv({ source: 'stored', apiKey: 'sk-d', provider: compatible }, HOST).ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');
  });
});

describe('checking a compatible service when its key is saved', () => {
  type Seen = { url: string; init: { method: string; headers: Record<string, string>; body?: string } };
  const answering = (status: number, body = '', seen: Seen[] = []) => async (url: string, init: Seen['init']) => {
    seen.push({ url, init });
    return { status, text: async () => body };
  };

  it('sends the smallest message, with the key both ways and the model, to the address', async () => {
    const seen: Seen[] = [];
    expect(await checkProvider(compatible, 'sk-d', answering(200, '{}', seen))).toBe('ok');
    expect(seen[0].url).toBe('https://api.deepseek.com/anthropic/v1/messages');
    expect(seen[0].init.method).toBe('POST');
    expect(seen[0].init.headers).toMatchObject({ authorization: 'Bearer sk-d', 'x-api-key': 'sk-d', 'anthropic-version': '2023-06-01' });
    expect(JSON.parse(seen[0].init.body!)).toMatchObject({ model: 'deepseek-flash[1m]', max_tokens: 1 });
  });

  it('says which part is wrong: the key, the model or the address', async () => {
    expect(await checkProvider(compatible, 'sk-d', answering(401))).toBe('key');
    expect(await checkProvider(compatible, 'sk-d', answering(403))).toBe('key');
    expect(await checkProvider(compatible, 'sk-d', answering(400, '{"error":{"message":"Model Not Exist"}}'))).toBe('model');
    expect(await checkProvider(compatible, 'sk-d', answering(404, '{"error":{"type":"not_found_error","message":"model: foo"}}'))).toBe('model');
    expect(await checkProvider(compatible, 'sk-d', answering(404, '<html>Not Found</html>'))).toBe('address');
    expect(await checkProvider(compatible, 'sk-d', async () => { throw new Error('getaddrinfo ENOTFOUND'); })).toBe('address');
    expect(await checkProvider(compatible, 'sk-d', answering(503))).toBe('unknown');
  });
});

describe('keys stay out of logs and the diagnostics', () => {
  it('a provider key, once known, is wiped from anything written down', () => {
    const dir = tmp();
    const keys = new ProviderKeys(dir, join(dir, 'api-key.bin'), crypto);
    keys.set('compatible-deepseek', 'sk-deepseek-0123456789');
    expect(redactSecrets('failed with sk-deepseek-0123456789 in the header')).not.toContain('0123456789');
  });

  it('the diagnostics carry the provider\'s kind and address, never a key', () => {
    const entries = diagnosticsEntries({
      app: { version: '1.6.0', packaged: true, electron: '38', chrome: '140', node: '22', locale: 'zh-CN' },
      os: { platform: 'win32', release: '10', arch: 'x64' }, hasClaude: true, claude: null, keySource: 'stored',
      settings: { ...new SettingsStore(join(tmp(), 's.json'), '/docs').get(), provider: compatible },
      defaultWorkRoot: '/d', logDir: tmp(), crashDir: tmp(), home: '/home',
    });
    const all = entries.map((e) => String(e.data)).join('\n');
    expect(all).toContain('api.deepseek.com');
    expect(all).not.toContain('sk-deepseek');
  });
});

describe('what a compatible service costs', () => {
  it('every input token at the input price, cache reads and writes included, output at the output price', () => {
    expect(pricedUsd([{ input_tokens: 1_000_000, output_tokens: 0 }], { input: 0.3, output: 1.2 })).toBeCloseTo(0.3);
    expect(pricedUsd([{ input_tokens: 100_000, cache_read_input_tokens: 400_000, cache_creation_input_tokens: 500_000, output_tokens: 500_000 }], { input: 0.3, output: 1.2 })).toBeCloseTo(0.9);
  });

  const run = (maxBudgetUsd?: number) => runAgent({
    prompt: 'hi', workDir: join(tmp(), 'w'), recordingPath: join(tmp(), 'r.jsonl'), emit: () => {},
    credentials: { source: 'stored', apiKey: 'sk-d', provider: compatible }, model: 'deepseek-flash[1m]', pricing: compatible.prices, maxBudgetUsd,
  });
  const said = (id: string, input: number, output: number) => ({ type: 'assistant', message: { id, model: 'deepseek-flash', usage: { input_tokens: input, output_tokens: output }, content: [] } });

  it('the run counts its cost from the tokens at the prices filled in, not from what Claude Code guesses', async () => {
    messages = [said('m1', 1_000_000, 0), said('m1', 1_000_000, 0), said('m2', 0, 1_000_000),
      { type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 99, usage: { input_tokens: 1 } }];
    const r = await run(5);
    expect(r.ok).toBe(true);
    expect(r.costUsd).toBeCloseTo(1.5);
    // Claude Code's own cap would count with its guesses: the shop keeps the cap itself.
    expect(calls[0].options.maxBudgetUsd).toBeUndefined();
  });

  it('stops at the cap counted that way', async () => {
    messages = [said('m1', 1_000_000, 0), said('m2', 0, 1_000_000), said('m3', 0, 1_000_000),
      { type: 'result', subtype: 'success', is_error: false, result: 'done', usage: { input_tokens: 1 } }];
    const r = await run(1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('budget');
    expect(r.costUsd).toBeCloseTo(1.5);
  });
});

describe('saving a provider in settings', () => {
  const fresh = () => { const dir = tmp(); return new ProviderKeys(dir, join(dir, 'api-key.bin'), crypto); };
  const ok = async () => ({ status: 200, text: async () => '{}' });

  it('a compatible service: checked with its key, then the key kept in its own place', async () => {
    const keys = fresh();
    const r = await saveProvider(compatible, ' sk-deepseek-0123456789 ', keys, ok);
    expect(r).toEqual({ ok: true, verified: true, provider: compatible, hint: '...6789' });
    expect(keys.get('compatible-deepseek')).toBe('sk-deepseek-0123456789');
  });

  it('says what is wrong, and keeps nothing, when the service refuses', async () => {
    const keys = fresh();
    expect(await saveProvider(compatible, 'sk-bad', keys, async () => ({ status: 401, text: async () => '' }))).toEqual({ ok: false, reason: 'key' });
    expect(keys.get('compatible-deepseek')).toBeNull();
    expect(await saveProvider({ ...compatible, baseUrl: 'http://api.example.com' }, 'k', keys, ok)).toEqual({ ok: false, reason: 'scheme' });
    expect(await saveProvider({ ...compatible, baseUrl: 'https://a:b@api.example.com' }, 'k', keys, ok)).toEqual({ ok: false, reason: 'secret' });
    expect(await saveProvider({ ...compatible, model: '' }, 'k', keys, ok)).toEqual({ ok: false, reason: 'missing' });
    // No key typed and none kept: nothing to check with.
    expect(await saveProvider(compatible, '', keys, ok)).toEqual({ ok: false, reason: 'missing' });
  });

  it('a key kept before is checked again when the address or model changes, and kept', async () => {
    const keys = fresh();
    keys.set('compatible-deepseek', 'sk-deepseek-0123456789');
    const seen: string[] = [];
    const r = await saveProvider({ ...compatible, model: 'deepseek-flash' }, '', keys, async (_u, init) => { seen.push(init.headers.authorization); return { status: 200, text: async () => '{}' }; });
    expect(r.ok).toBe(true);
    expect(seen).toEqual(['Bearer sk-deepseek-0123456789']);
  });

  it('a service that does not answer is kept, not yet checked', async () => {
    const keys = fresh();
    expect(await saveProvider(compatible, 'sk-d', keys, async () => ({ status: 503, text: async () => '' }))).toMatchObject({ ok: true, verified: false });
  });

  it('Bedrock keeps its key unchecked; Vertex needs its key file to be there', async () => {
    const keys = fresh();
    expect(await saveProvider({ kind: 'bedrock', region: 'us-east-1' }, 'bedrock-key', keys, ok)).toMatchObject({ ok: true, verified: false });
    expect(keys.get('bedrock')).toBe('bedrock-key');
    const file = join(tmp(), 'sa.json');
    writeFileSync(file, '{}');
    expect(await saveProvider({ kind: 'vertex', region: 'global', project: 'p', credentialsFile: file }, '', keys, ok)).toMatchObject({ ok: true });
    expect(await saveProvider({ kind: 'vertex', region: 'global', project: 'p', credentialsFile: join(tmp(), 'none.json') }, '', keys, ok)).toEqual({ ok: false, reason: 'file' });
  });

  it('Anthropic is only chosen: its key is saved as before', async () => {
    expect(await saveProvider({ kind: 'anthropic' }, '', fresh(), ok)).toEqual({ ok: true, verified: false, provider: { kind: 'anthropic' } });
  });
});

describe('the ledger, for a service priced by the shop', () => {
  it('adds what each run cost, so a resumed session counts its new stretch and nothing twice', async () => {
    const { SpendLedger } = await import('../app/main/spend');
    const ledger = new SpendLedger(join(tmp(), 'spend.json'));
    const at = new Date('2026-11-25T10:00:00');
    expect(ledger.addPriced('C:/w/a', 's1', 0.4, at, undefined, 'deepseek-flash')).toBe(0.4);
    // The same session again: this run's own cost, not a running total.
    expect(ledger.addPriced('C:/w/a', 's1', 0.1, at, undefined, 'deepseek-flash')).toBe(0.1);
    expect(ledger.forCommission('C:/w/a')).toBeCloseTo(0.5);
    // A total Claude Code reports later for the session is not set against these.
    expect(ledger.record('C:/w/a', 's1', 0.2, at)).toBeCloseTo(0.2);
    expect(ledger.addPriced('C:/w/b', 's2', 0, at)).toBe(0);
  });
});
