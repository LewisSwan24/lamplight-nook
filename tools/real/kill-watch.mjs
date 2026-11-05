#!/usr/bin/env node
// W11, by hand: kills the running shop as a crash would, and watches whether what it started stops by itself.
// Only the shop's own processes and their children are touched, so a Claude Code running elsewhere is left alone.
//
//   node tools/real/kill-watch.mjs            # with a commission under way in the installed app
//
// Whatever is still running after two minutes is stopped, so it cannot go on spending. --name <exe> aims it at another
// program, to try it out.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const NAME = args.includes('--name') ? args[args.indexOf('--name') + 1] : 'Lamplight Nook.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const processes = () => JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command',
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const kill = (pid) => execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' });

const all = processes();
const shop = all.filter((p) => p.Name === NAME);
if (!shop.length) {
  console.error(`${NAME} is not running. Nothing was touched.`);
  process.exit(1);
}
const children = [];
const walk = (parent) => {
  for (const p of all) {
    if (p.ParentProcessId === parent && p.Name !== NAME && p.Name !== 'conhost.exe' && !children.includes(p)) {
      children.push(p);
      walk(p.ProcessId);
    }
  }
};
for (const p of shop) walk(p.ProcessId);
console.log(`Started by the shop: ${children.map((p) => p.Name).join(', ') || 'nothing'}`);

for (const p of shop) {
  try { kill(p.ProcessId); } catch { /* went with its parent */ }
}
const killedAt = Date.now();
console.log('Killed the shop. Watching for two minutes...');

const alive = () => {
  const now = processes();
  return children.filter((c) => now.some((p) => p.ProcessId === c.ProcessId && p.Name === c.Name));
};
for (const seconds of [2, 10, 30, 60, 120]) {
  await sleep(killedAt + seconds * 1000 - Date.now());
  const left = alive();
  console.log(`  after ${seconds} seconds: ${left.map((p) => p.Name).join(', ') || 'nothing left'}`);
  if (!left.length) {
    console.log('RESULT: stopped by itself.');
    process.exit(0);
  }
}
const left = alive();
for (const p of left) kill(p.ProcessId);
console.log(`RESULT: still running after two minutes (${left.map((p) => p.Name).join(', ')}). Stopped now.`);
