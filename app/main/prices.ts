/** What one API call used, as Claude Code reports it on each assistant message. */
export type Usage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
/**
 * US dollars per million tokens, by model family: Anthropic's list prices, for estimating a stretch of work Claude Code
 * never reported a total for (road-to-1.2.md B7). Provisional until the real-key run checks them against the Console.
 */
export const PRICES: Record<'opus' | 'sonnet' | 'haiku', Price> = {
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
import { MODEL_TIERS, TIER_MODEL, type ModelTier } from '../shared/models';

/** A model the table does not name is priced as Claude Code's usual one. */
const priceOf = (model = ''): Price => PRICES[(['opus', 'haiku'] as const).find((f) => model.includes(f)) ?? 'sonnet'];

/** What these calls cost, estimated from their tokens. */
export function estimateUsd(calls: Usage[], model?: string): number {
  const p = priceOf(model);
  const tokens = (u: Usage) => (u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output
    + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead;
  return calls.reduce((sum, u) => sum + tokens(u), 0) / 1_000_000;
}

/**
 * The tokens of a middling commission: a few rounds of reading and writing, most of what it reads again coming from the
 * cache. Only for the price shown beside a tier in settings before the ledger has any commission on it (plan-1.6.md F6).
 */
const TYPICAL: Usage = { input_tokens: 20_000, output_tokens: 15_000, cache_creation_input_tokens: 40_000, cache_read_input_tokens: 400_000 };

/** About what a middling commission costs on a tier, from the price table. */
export const typicalUsd = (tier: ModelTier): number => Math.round(estimateUsd([TYPICAL], TIER_MODEL[tier]) * 100) / 100;

/** What one commission costs on each tier: the average in the ledger, or the table's guess where the ledger has none. */
export function modelCosts(average: Partial<Record<ModelTier, number>>): Record<ModelTier, { usd: number; from: 'ledger' | 'table' }> {
  return Object.fromEntries(MODEL_TIERS.map((t) => [t, average[t] !== undefined ? { usd: average[t]!, from: 'ledger' } : { usd: typicalUsd(t), from: 'table' }])) as Record<ModelTier, { usd: number; from: 'ledger' | 'table' }>;
}
