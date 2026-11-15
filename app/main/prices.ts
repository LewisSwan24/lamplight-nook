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
/** A model the table does not name is priced as Claude Code's usual one. */
const priceOf = (model = ''): Price => PRICES[(['opus', 'haiku'] as const).find((f) => model.includes(f)) ?? 'sonnet'];

/** What these calls cost, estimated from their tokens. */
export function estimateUsd(calls: Usage[], model?: string): number {
  const p = priceOf(model);
  const tokens = (u: Usage) => (u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output
    + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead;
  return calls.reduce((sum, u) => sum + tokens(u), 0) / 1_000_000;
}
