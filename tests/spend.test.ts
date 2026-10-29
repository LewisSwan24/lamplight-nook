import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { failureKind } from '../app/main/agent-runner';
import { SettingsStore } from '../app/main/settings';
import { SpendLedger } from '../app/main/spend';
import { formatUsd } from '../app/shared/money';

const dir = () => mkdtempSync(join(tmpdir(), 'spend-'));
const oct = new Date('2026-10-29T10:00:00Z');
const nov = new Date('2026-11-02T10:00:00Z');

describe('what commissions cost', () => {
  it('a resumed session reports a running total, so it replaces rather than adds', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.3, oct);
    ledger.record('/w/a', 's1', 0.8, oct);
    expect(ledger.forCommission('/w/a')).toBeCloseTo(0.8);
    expect(ledger.thisMonth(oct)).toBeCloseTo(0.8);
  });

  it('a fresh session in the same folder adds to what the commission cost', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.5, oct);
    ledger.record('/w/a', 's2', 0.25, oct);
    ledger.record('/w/b', 's3', 1, oct);
    expect(ledger.forCommission('/w/a')).toBeCloseTo(0.75);
    expect(ledger.thisMonth(oct)).toBeCloseTo(1.75);
  });

  it('a crash result with zeros never shrinks what was spent', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.6, oct);
    ledger.record('/w/a', 's1', 0, oct);
    ledger.record('/w/a', 's1', 0.2, oct);
    expect(ledger.forCommission('/w/a')).toBeCloseTo(0.6);
  });

  it('counts the month separately and survives a restart', () => {
    const file = join(dir(), 'spend.json');
    new SpendLedger(file).record('/w/a', 's1', 0.4, oct);
    const again = new SpendLedger(file);
    again.record('/w/b', 's2', 0.1, nov);
    expect(again.thisMonth(oct)).toBeCloseTo(0.4);
    expect(again.thisMonth(nov)).toBeCloseTo(0.1);
  });

  it('reads money the way people do', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.4)).toBe('$0.40');
    expect(formatUsd(0)).toBe('$0.00');
  });
});

describe('the per-run cap', () => {
  it('defaults to $3 and only takes the offered choices', () => {
    const store = new SettingsStore(join(dir(), 'settings.json'), dir());
    expect(store.get().budgetUsd).toBe(3);
    expect(store.update({ budgetUsd: 10 }).budgetUsd).toBe(10);
    expect(store.update({ budgetUsd: 0 }).budgetUsd).toBe(0);
    expect(store.update({ budgetUsd: -5 }).budgetUsd).toBe(0);
    expect(store.update({ budgetUsd: 7 }).budgetUsd).toBe(0);
  });

  it('reaching it is its own kind of stop', () => {
    expect(failureKind(undefined, 'Reached maximum budget', 'error_max_budget_usd')).toBe('budget');
    expect(failureKind(undefined, '', 'error_during_execution')).toBe('failed');
  });
});
