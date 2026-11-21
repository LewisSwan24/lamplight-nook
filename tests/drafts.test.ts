import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFTS_MAX, DraftRecord } from '../app/main/drafts';
import { draftEml } from '../app/main/eml';

const dir = () => mkdtempSync(join(tmpdir(), 'drafts-'));

/** The record of drafts the shop's draft tool wrote, so only those open with a click (road-to-1.4.md, "Mail drafts by their fingerprint"). */
describe('DraftRecord', () => {
  it('knows a draft it was told of, byte for byte, and after a restart', () => {
    const d = dir();
    const record = new DraftRecord(join(d, 'drafts.json'));
    const eml = draftEml({ to: ['ann@example.org'], subject: '读书会', body: '周六见' });
    writeFileSync(join(d, 'a.eml'), eml);
    expect(record.wrote(join(d, 'a.eml'))).toBe(false);
    record.add(eml);
    expect(record.wrote(join(d, 'a.eml'))).toBe(true);
    expect(new DraftRecord(join(d, 'drafts.json')).wrote(join(d, 'a.eml'))).toBe(true);
    // One byte more, and it is another file.
    writeFileSync(join(d, 'a.eml'), `${eml} `);
    expect(record.wrote(join(d, 'a.eml'))).toBe(false);
    expect(record.wrote(join(d, 'missing.eml'))).toBe(false);
  });

  it('keeps only fingerprints, never the mail itself', () => {
    const d = dir();
    new DraftRecord(join(d, 'drafts.json')).add(draftEml({ to: [], subject: 'private-subject', body: 'private-body' }));
    const saved = readFileSync(join(d, 'drafts.json'), 'utf8');
    expect(saved).not.toMatch(/private/);
    expect(JSON.parse(saved)).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)]);
  });

  it(`keeps the newest ${DRAFTS_MAX.toLocaleString('en')}, dropping the oldest first`, () => {
    const d = dir();
    // A full record, as one that has been kept a long while: then one more draft.
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');
    writeFileSync(join(d, 'drafts.json'), JSON.stringify(Array.from({ length: DRAFTS_MAX }, (_, i) => sha(`draft ${i}`))));
    const record = new DraftRecord(join(d, 'drafts.json'));
    record.add('draft new');
    for (const [name, text] of [['first.eml', 'draft 0'], ['second.eml', 'draft 1'], ['new.eml', 'draft new']]) writeFileSync(join(d, name), text);
    expect(record.wrote(join(d, 'first.eml'))).toBe(false);
    expect(record.wrote(join(d, 'second.eml'))).toBe(true);
    expect(record.wrote(join(d, 'new.eml'))).toBe(true);
    expect(JSON.parse(readFileSync(join(d, 'drafts.json'), 'utf8'))).toHaveLength(DRAFTS_MAX);
  });

  it('starts empty from a record that is missing or cannot be read', () => {
    const d = dir();
    writeFileSync(join(d, 'drafts.json'), '{not json');
    writeFileSync(join(d, 'a.eml'), 'x');
    expect(new DraftRecord(join(d, 'drafts.json')).wrote(join(d, 'a.eml'))).toBe(false);
    expect(new DraftRecord(join(d, 'none.json')).wrote(join(d, 'a.eml'))).toBe(false);
  });
});
