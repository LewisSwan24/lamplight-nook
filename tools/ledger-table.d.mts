export type LedgerEntry = { key: string; usd: number; month: string };
export function formatLedger(entries: LedgerEntry[], commissions: { folder: string; title: string }[], month?: string): string;
export function ledgerTable(dataDir: string, month?: string): string;
