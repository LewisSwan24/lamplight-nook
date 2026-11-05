import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('says what this run added, not the running total', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    expect(ledger.record('/w/a', 's1', 1.05, oct)).toBeCloseTo(1.05);
    expect(ledger.record('/w/a', 's1', 2.1, oct)).toBeCloseTo(1.05);
    expect(ledger.record('/w/a', 's2', 0.4, oct)).toBeCloseTo(0.4);
    expect(ledger.record('/w/a', 's1', undefined, oct)).toBe(0);
  });

  it('counts the month separately and survives a restart', () => {
    const file = join(dir(), 'spend.json');
    new SpendLedger(file).record('/w/a', 's1', 0.4, oct);
    const again = new SpendLedger(file);
    again.record('/w/b', 's2', 0.1, nov);
    expect(again.thisMonth(oct)).toBeCloseTo(0.4);
    expect(again.thisMonth(nov)).toBeCloseTo(0.1);
  });

  it('leaves a month as it was when a work is changed again in a later one', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.5, oct);
    expect(ledger.record('/w/a', 's1', 0.8, nov)).toBeCloseTo(0.3);
    expect(ledger.thisMonth(oct)).toBeCloseTo(0.5);
    expect(ledger.thisMonth(nov)).toBeCloseTo(0.3);
    expect(ledger.forCommission('/w/a')).toBeCloseTo(0.8);
    ledger.record('/w/a', 's1', 1, nov);
    expect(ledger.thisMonth(nov)).toBeCloseTo(0.5);
    expect(ledger.forCommission('/w/a')).toBeCloseTo(1);
  });

  it('keeps every run: nothing old drops out of a month', () => {
    const file = join(dir(), 'spend.json');
    const old = Array.from({ length: 620 }, (_, i) => ({ key: `/w/${i}|s`, usd: 0.01, month: i < 100 ? '2026-10' : '2026-11' }));
    writeFileSync(file, JSON.stringify(old));
    new SpendLedger(file).record('/w/new', 's', 0.01, nov);
    const ledger = new SpendLedger(file);
    expect(ledger.thisMonth(oct)).toBeCloseTo(1);
    expect(ledger.forCommission('/w/0')).toBeCloseTo(0.01);
  });

  it('adds up each month, newest first, and how many commissions it was', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.5, oct);
    ledger.record('/w/a', 's2', 0.25, oct);
    ledger.record('/w/b', 's3', 1, nov);
    ledger.record('/w/a', 's1', 0.75, nov);
    expect(ledger.months()).toEqual([
      { month: '2026-11', usd: 1.25, commissions: 2 },
      { month: '2026-10', usd: 0.75, commissions: 1 },
    ]);
  });

  it('does not make up a month out of rounding when the same total is reported again', () => {
    const ledger = new SpendLedger(join(dir(), 'spend.json'));
    ledger.record('/w/a', 's1', 0.022, oct);
    ledger.record('/w/a', 's1', 0.114, nov);
    ledger.record('/w/a', 's1', 0.114, new Date('2026-12-02T10:00:00Z'));
    expect(ledger.months().map((m) => m.month)).toEqual(['2026-11', '2026-10']);
  });

  it('forgetting keeps the money and every month, but nothing says what it was spent on', () => {
    const home = dir();
    const file = join(home, 'spend.json');
    const ledger = new SpendLedger(file);
    ledger.record('C:/w/2026-10-29-秘密的信', 's1', 0.5, oct);
    ledger.record('C:/w/2026-10-29-秘密的信', 's1', 0.75, nov);
    ledger.record('C:/w/2026-11-02-another', 's2', 1, nov);
    mkdirSync(join(home, 'backup', 'v1'), { recursive: true });
    writeFileSync(join(home, 'backup', 'v1', 'spend.json'), readFileSync(file));
    const before = ledger.months();

    ledger.forget();

    expect(ledger.months()).toEqual(before);
    expect(new SpendLedger(file).months()).toEqual(before);
    expect(readFileSync(file, 'utf8')).not.toContain('秘密');
    expect(readFileSync(file, 'utf8')).not.toContain('another');
    expect(existsSync(join(home, 'backup', 'v1', 'spend.json'))).toBe(false);
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
