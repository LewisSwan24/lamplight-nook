import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The record keeps the fingerprints of this many drafts, the newest. */
export const DRAFTS_MAX = 2000;

const fingerprint = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/**
 * The mail drafts the shop's draft tool wrote (C5), as SHA-256 fingerprints in drafts.json in the data folder; never the
 * mail itself. A click opens an .eml only when it is one of these, byte for byte (open-rule.ts): a mail a program reads
 * differently from our check, written by the staff with their own tools or changed after, stays in its folder
 * (road-to-1.4.md, "Mail drafts by their fingerprint"). Outside the commission folder, so the staff cannot add to it.
 */
export class DraftRecord {
  private marks: string[];

  constructor(private file: string) {
    try {
      const saved: unknown = JSON.parse(readFileSync(file, 'utf8'));
      this.marks = Array.isArray(saved) ? saved.filter((m): m is string => typeof m === 'string') : [];
    } catch {
      this.marks = [];
    }
  }

  /** Puts a draft the tool has just written on the record. */
  add(text: string) {
    this.marks = [...this.marks, fingerprint(text)].slice(-DRAFTS_MAX);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.marks));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Whether the file is a draft the tool wrote, unchanged; false when it cannot be read. */
  wrote(path: string): boolean {
    try {
      return this.marks.includes(fingerprint(readFileSync(path)));
    } catch {
      return false;
    }
  }
}
