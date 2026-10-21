import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run demo/check.js in a fresh folder containing the given index.html. */
function check(html: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'lamplight-check-'));
  copyFileSync(join(__dirname, '..', 'demo', 'check.js'), join(dir, 'check.js'));
  if (html !== null) writeFileSync(join(dir, 'index.html'), html);
  return spawnSync(process.execPath, ['check.js'], { cwd: dir, encoding: 'utf8' });
}

const page = (bodyAttrs: string) =>
  `<html><body${bodyAttrs}><input type="number"><script>localStorage.setItem('x', '1')</script></body></html>`;

describe('demo check script', () => {
  it('fails without index.html', () => {
    expect(check(null).status).toBe(1);
  });

  it('fails a reasonable page that lacks the unannounced attribute, and says how to fix it', () => {
    const r = check(page(''));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('data-ledger-version="1"');
  });

  it('passes once the page is fixed', () => {
    expect(check(page(' data-ledger-version="1"')).status).toBe(0);
  });
});
