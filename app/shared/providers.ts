/**
 * Where the staff's work is sent (plan-1.6.md F7). Anthropic as before; a service that offers an Anthropic-compatible
 * endpoint, for which Claude Code is pointed at another address with another model; Amazon Bedrock; or Google Vertex AI.
 * A service that only speaks the OpenAI format needs a gateway such as LiteLLM in front of it, and is then a compatible
 * service at the gateway's address: settings only explain that. Pure data and checks: both processes read it.
 */
export const PROVIDER_KINDS = ['anthropic', 'compatible', 'bedrock', 'vertex'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** US dollars per million tokens, as the user fills them in for a compatible service (Q-F9). */
export type Prices = { input: number; output: number };

/** What settings keep about the provider: never a key, which is kept encrypted, one per provider (main/providers.ts). */
export type Provider = {
  kind: ProviderKind;
  /** A compatible service: the preset it started from, if any, its address, its model and a faster one for small jobs. */
  preset?: string;
  baseUrl?: string;
  model?: string;
  fastModel?: string;
  prices?: Prices;
  /** Bedrock and Vertex: the region; Vertex: the Google Cloud project and the service account's key file. */
  region?: string;
  project?: string;
  credentialsFile?: string;
};

export const DEFAULT_PROVIDER: Provider = { kind: 'anthropic' };

/**
 * A compatible service as its own documentation sets Claude Code up, checked on 2026-11-25 (Q-F8). Every one takes the
 * key as a bearer token (ANTHROPIC_AUTH_TOKEN). None of the setup pages gives prices: the user fills those in.
 */
export type Preset = { id: string; name: string; baseUrl: string; model: string; fastModel?: string; docs: string };

export const PRESETS: readonly Preset[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-flash[1m]', fastModel: 'deepseek-flash',
    docs: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code' },
  { id: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.ai/anthropic', model: 'kimi-k3[1m]',
    docs: 'https://platform.kimi.ai/docs/guide/claude-code-kimi' },
  { id: 'glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.4[1m]', fastModel: 'glm-5.3-flash[1m]',
    docs: 'https://docs.bigmodel.cn/cn/coding-plan/tool/claude' },
  { id: 'glm-intl', name: 'Z.ai GLM', baseUrl: 'https://api.z.ai/api/anthropic', model: 'glm-5.4[1m]', fastModel: 'glm-5.3-flash[1m]',
    docs: 'https://docs.z.ai/devpack/tool/claude' },
  // Pay as you go. The page's own address names the user's workspace; its FAQ gives this shared one, which needs none.
  { id: 'bailian', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic', model: 'qwen3.7-max', fastModel: 'qwen3.6-flash',
    docs: 'https://help.aliyun.com/zh/model-studio/claude-code' },
  { id: 'bailian-intl', name: 'Alibaba Cloud Model Studio', baseUrl: 'https://dashscope-intl.aliyuncs.com/apps/anthropic', model: 'qwen3.7-max', fastModel: 'qwen3.6-flash',
    docs: 'https://www.alibabacloud.com/help/en/model-studio/claude-code' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', model: '~anthropic/claude-sonnet-latest[1m]', fastModel: '~anthropic/claude-haiku-latest',
    docs: 'https://openrouter.ai/docs/guides/guides/claude-code-integration' },
];

export const presetById = (id: string | undefined): Preset | undefined => PRESETS.find((p) => p.id === id);

/** This computer, where a gateway of the user's own may run over plain HTTP. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why an address will not do, or null: `shape` is no web address at all, `scheme` is anything but HTTPS (HTTP only on this
 * computer), `secret` carries something that may be a key (a user name or password, a query, a fragment), which would then
 * go wherever the address is written down.
 */
export function baseUrlProblem(raw: string): 'shape' | 'scheme' | 'secret' | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'shape';
  }
  if (url.username || url.password || url.search || url.hash || raw.includes('?') || raw.includes('#')) return 'secret';
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return null;
  return 'scheme';
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined);
/** A region, a project: letters, digits and dashes. */
const word = (v: unknown) => (typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/i.test(v.trim()) ? v.trim() : undefined);
const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000 ? v : undefined);
function cleanPrices(v: unknown): Prices | undefined {
  const p = v as Prices | undefined;
  const input = price(p?.input);
  const output = price(p?.output);
  return input !== undefined && output !== undefined ? { input, output } : undefined;
}
/** Only what each kind uses, in a fixed order, so the same choice always reads the same. */
const only = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A provider as settings may keep it; undefined for anything that could not be used. */
export function cleanProvider(v: unknown): Provider | undefined {
  const p = v as Record<string, unknown> | undefined;
  switch (p?.kind) {
    case 'anthropic':
      return { kind: 'anthropic' };
    case 'compatible': {
      const baseUrl = text(p.baseUrl, 300);
      const model = text(p.model, 200);
      if (!baseUrl || baseUrlProblem(baseUrl) || !model) return undefined;
      return { kind: 'compatible', ...only({ preset: presetById(p.preset as string)?.id, baseUrl: baseUrl.replace(/\/+$/, ''), model, fastModel: text(p.fastModel, 200) }), prices: cleanPrices(p.prices) } as Provider;
    }
    case 'bedrock': {
      if (p.region !== undefined && !word(p.region)) return undefined;
      return { kind: 'bedrock', ...only({ region: word(p.region) }) };
    }
    case 'vertex': {
      if ((p.region !== undefined && !word(p.region)) || (p.project !== undefined && !word(p.project))) return undefined;
      return { kind: 'vertex', ...only({ region: word(p.region), project: word(p.project), credentialsFile: text(p.credentialsFile, 1000) }) };
    }
    default:
      return undefined;
  }
}

/** What is still missing before work can start on this provider, or null (the key is asked for apart). */
export function missingForWork(p: Provider): 'prices' | 'model' | 'region' | 'project' | null {
  if (p.kind === 'compatible') return !p.model ? 'model' : !p.prices ? 'prices' : null;
  if (p.kind === 'bedrock') return p.region ? null : 'region';
  if (p.kind === 'vertex') return !p.region ? 'region' : !p.project ? 'project' : null;
  return null;
}

/** Another maker's model: how well it uses tools varies, so settings say the staff may not finish harder work. */
export const isTrial = (p: Provider) => p.kind === 'compatible';

/**
 * Where a provider's key is kept: one place for each, so switching loses none. A compatible service goes by its preset,
 * or else by the host and port of its address.
 */
export function secretSlot(p: Provider): string {
  if (p.kind !== 'compatible') return p.kind;
  if (p.preset && presetById(p.preset)) return `compatible-${p.preset}`;
  try {
    const url = new URL(p.baseUrl ?? '');
    return `compatible-${url.hostname.replace(/[^a-z0-9.-]/gi, '')}${url.port ? `-${url.port}` : ''}`;
  } catch {
    return 'compatible';
  }
}
