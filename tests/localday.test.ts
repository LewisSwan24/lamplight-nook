import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commissionDir } from '../app/main/agent-runner';
import { MemoryStore } from '../app/main/memory';
import { SpendLedger } from '../app/main/spend';
import { shopTimeline } from '../app/shared/days';
import { localDay, localMonth } from '../app/shared/localday';
import { strings } from '../app/shared/i18n';
import type { CommissionMemo } from '../app/shared/types';

// 09:00 on 1 Nov in Auckland (UTC+13) is still 31 Oct in UTC: the day someone would call it is the 1st.
const MORNING = new Date('2026-10-31T20:00:00Z');
const home = () => mkdtempSync(join(tmpdir(), 'lamplight-day-'));

describe('the day on the wall, not the day in Greenwich', () => {
  const zone = process.env.TZ;
  beforeEach(() => { process.env.TZ = 'Pacific/Auckland'; });
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it('names the local day and month', () => {
    expect(localDay(MORNING)).toBe('2026-11-01');
    expect(localMonth(MORNING)).toBe('2026-11');
  });

  it('dates a work, and the neighbours who came, by the local day', () => {
    const store = new MemoryStore(join(home(), 'memory.json'));
    store.markMet('baker', MORNING);
    expect(store.get().shop?.met).toEqual([{ id: 'baker', date: '2026-11-01' }]);
    const work = { id: `c${MORNING.getTime()}`, title: 'A', date: '2026-10-31', result: 'done', choices: {}, form: { want: 'x' } } as CommissionMemo;
    const days = shopTimeline({ commissions: [work], stuckNotes: [], shop: { done: 1, grown: [], told: [] } });
    expect(days[0].date).toBe('2026-11-01');
  });

  it('counts money in the month it is where the user is', () => {
    const ledger = new SpendLedger(join(home(), 'spend.json'));
    ledger.record('/w', 's', 0.2, MORNING);
    expect(ledger.thisMonth(new Date('2026-11-02T00:00:00Z'))).toBeCloseTo(0.2);
  });

  it('names a commission folder by the time on the wall', () => {
    expect(commissionDir('/work', 'ledger', MORNING)).toBe(join('/work', '2026-11-01-090000-ledger'));
  });
});
