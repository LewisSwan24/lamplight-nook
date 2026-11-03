import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KeyStore, agentEnv, checkKey, cleanKey, keyHint, pickCredentials, redactSecrets, saveKey, type Fetch, type KeyCrypto } from '../app/main/api-key';
import { truncateDeep } from '../app/main/recorder';

const KEY = 'sk-ant-api03-' + 'a'.repeat(40) + 'WXYZ';

/** Stand-in for the OS: reverses the bytes so the file never holds the key as written. */
const crypto = (available = true): KeyCrypto => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s, 'utf8')].reverse()),
  decryptString: (b) => Buffer.from([...b].reverse()).toString('utf8'),
});
const file = () => join(mkdtempSync(join(tmpdir(), 'key-')), 'api-key.bin');
const answering = (status: number): Fetch => async () => ({ status });
const offline: Fetch = async () => { throw new Error('fetch failed'); };

describe('the saved key', () => {
  it('round-trips through the OS encryption and is not on disk in plain text', () => {
    const path = file();
    const store = new KeyStore(path, crypto());
    expect(store.get()).toBeNull();
    expect(store.set(KEY)).toBe(true);
    expect(store.get()).toBe(KEY);
    expect(readFileSync(path).toString('utf8')).not.toContain(KEY);
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('is not written at all when the OS cannot encrypt it', () => {
    const store = new KeyStore(file(), crypto(false));
    expect(store.set(KEY)).toBe(false);
    expect(store.get()).toBeNull();
  });

  it('cleans up what people paste', () => {
    expect(cleanKey(`  "${KEY}"\n`)).toBe(KEY);
    expect(cleanKey(`ANTHROPIC_API_KEY=${KEY}`)).toBe(KEY);
  });

  it('is only ever shown masked', () => {
    expect(keyHint(KEY)).toBe('sk-ant-...WXYZ');
  });
});

describe('saving a pasted key', () => {
  it('stores a key Anthropic accepts', async () => {
    const store = new KeyStore(file(), crypto());
    expect(await saveKey(KEY, store, answering(200))).toEqual({ ok: true, verified: true, hint: 'sk-ant-...WXYZ' });
    expect(store.get()).toBe(KEY);
  });

  it('refuses something that is not a key without asking Anthropic', async () => {
    let asked = false;
    const store = new KeyStore(file(), crypto());
    expect(await saveKey('hello', store, async () => { asked = true; return { status: 200 }; })).toEqual({ ok: false, reason: 'format' });
    expect(asked).toBe(false);
  });

  it('refuses a key Anthropic rejects and keeps nothing', async () => {
    const store = new KeyStore(file(), crypto());
    expect(await saveKey(KEY, store, answering(401))).toEqual({ ok: false, reason: 'invalid' });
    expect(store.get()).toBeNull();
  });

  it('keeps the key but says it is unchecked when Anthropic cannot be reached', async () => {
    const store = new KeyStore(file(), crypto());
    expect(await saveKey(KEY, store, offline)).toMatchObject({ ok: true, verified: false });
    expect(await checkKey(KEY, answering(529))).toBe('unknown');
  });

  it('says so when the key cannot be stored safely', async () => {
    expect(await saveKey(KEY, new KeyStore(file(), crypto(false)), answering(200))).toEqual({ ok: false, reason: 'storage' });
  });
});

describe('which credentials a run uses', () => {
  it('prefers the saved key, then the environment variable', () => {
    expect(pickCredentials(KEY, { ANTHROPIC_API_KEY: 'sk-ant-env' }, true)).toEqual({ source: 'stored', apiKey: KEY });
    expect(pickCredentials(null, { ANTHROPIC_API_KEY: 'sk-ant-env' }, true)).toEqual({ source: 'env', apiKey: 'sk-ant-env' });
    expect(pickCredentials(null, {}, true)).toBeNull();
  });

  it('accepts a signed-in subscription only in development', () => {
    expect(pickCredentials(null, { LAMPLIGHT_DEV_SUBSCRIPTION: '1' }, false)).toEqual({ source: 'subscription' });
    expect(pickCredentials(null, { LAMPLIGHT_DEV_SUBSCRIPTION: '1' }, true)).toBeNull();
  });

  it('hands Claude Code the key and no other way to sign in', () => {
    const env = agentEnv({ source: 'stored', apiKey: KEY }, { PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_AUTH_TOKEN: 'u' });
    expect(env).toEqual({ PATH: '/bin', ANTHROPIC_API_KEY: KEY, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
  });

  it('drops the login of a Claude session the app was launched from', () => {
    const env = agentEnv({ source: 'stored', apiKey: KEY }, {
      PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_ORGANIZATION_UUID: 'o', CLAUDE_CODE_ACCOUNT_UUID: 'a',
      CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: '1', ANTHROPIC_BASE_URL: 'https://example.test', ANTHROPIC_API_KEY: 'sk-ant-other',
    });
    expect(env).toEqual({ PATH: '/bin', ANTHROPIC_API_KEY: KEY, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
  });

  it('leaves the environment alone for a dev subscription', () => {
    expect(agentEnv({ source: 'subscription' }, { PATH: '/bin', CLAUDE_CODE_ENTRYPOINT: 'cli' })).toEqual({ PATH: '/bin', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
  });
});

describe('keys never reach recordings', () => {
  it('masks a key inside any text', () => {
    expect(redactSecrets(`Invalid key ${KEY} given`)).toBe('Invalid key sk-ant-[redacted] given');
    expect(JSON.stringify(truncateDeep({ error: `bad ${KEY}`, nested: [{ text: KEY }] }))).not.toContain(KEY);
  });
});
