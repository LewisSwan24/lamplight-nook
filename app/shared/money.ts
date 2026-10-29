/** Money as the user reads it: US dollars to the cent, and "under a cent" rather than $0.00. */
export function formatUsd(usd: number): string {
  return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}
