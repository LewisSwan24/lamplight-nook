#!/usr/bin/env node
// What the ledger says each commission cost, as a Markdown table to hold against the Anthropic Console (road-to-1.1.md A3).
// Usage: node tools/ledger-table.mjs <dataDir> [--month YYYY-MM]. Reads spend.json and memory.json there; writes nothing.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER = '把下面每个月的合计和 Anthropic Console 用量页上同一个月的数字对一下，差多少写进 docs/road-to-1.1.md 第 7 节。';

const cell = (text) => text.replaceAll('|', '\|');
const usd = (n) => n.toFixed(4);

/**
 * One row per ledger entry by month, each month's total after it, and the grand total last. Talks with Adeng before a
 * commission (road-to-1.2.md B4, keys consult:<id>|<session>) are one row of their own each month.
 */
export function formatLedger(entries, commissions, month) {
  const titles = new Map(commissions.map((c) => [c.folder, c.title]));
  const months = [...new Set(entries.map((e) => e.month))].filter((m) => !month || m === month).sort();
  const lines = [HEADER, '', '| 月份 | 作品 | 会话 | 美元 |', '|---|---|---|---|'];
  let total = 0;
  for (const m of months) {
    let sum = 0;
    const here = entries.filter((e) => e.month === m);
    const consults = here.filter((e) => e.key.startsWith('consult:'));
    for (const e of here.filter((e) => !consults.includes(e))) {
      const cut = e.key.lastIndexOf('|');
      const folder = e.key.slice(0, cut);
      const session = e.key.slice(cut + 1);
      // forget() turns each folder into a number with no session.
      const work = titles.get(folder) ?? (/^\d+$/.test(folder) && !session ? `（已忘记，第 ${folder} 个文件夹）` : basename(folder));
      lines.push(`| ${m} | ${cell(work)} | ${session} | ${usd(e.usd)} |`);
      sum += e.usd;
    }
    if (consults.length) {
      const usdSum = consults.reduce((s, e) => s + e.usd, 0);
      lines.push(`| ${m} | 商量（${new Set(consults.map((e) => e.key.slice(0, e.key.lastIndexOf('|')))).size} 次） |  | ${usd(usdSum)} |`);
      sum += usdSum;
    }
    lines.push(`| ${m} | **合计** |  | **${usd(sum)}** |`);
    total += sum;
  }
  lines.push(`| **总计** |  |  | **${usd(total)}** |`);
  return lines.join('\n');
}

/** The table for an app data folder. */
export function ledgerTable(dataDir, month) {
  const entries = JSON.parse(readFileSync(join(dataDir, 'spend.json'), 'utf8'));
  const { commissions } = JSON.parse(readFileSync(join(dataDir, 'memory.json'), 'utf8'));
  return formatLedger(entries, commissions, month);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dataDir, flag, month] = process.argv.slice(2);
  console.log(ledgerTable(dataDir, flag === '--month' ? month : undefined));
}
