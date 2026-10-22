// Acceptance check for the ledger page built by the demo commission. Run with: node check.js
// One requirement is deliberately not mentioned in the task and is stored encoded below, so the agent
// cannot learn it by reading this file: the first run fails for real and the agent has to fix the page
// from this script's output.
const fs = require('node:fs');
const path = require('node:path');

const KEY = 'lamplight';
const decode = (s) => Buffer.from(s, 'base64').map((b, i) => b ^ KEY.charCodeAt(i % KEY.length)).toString();
const HIDDEN = {
  attr: 'CAAZEUEFAgwTCRNABgkbFAEbAg==',
  value: 'XQ==',
  message: 'UAMCFBVXRwUBHxVNGA0fAkgABARNERgdFQEWGRUIUAgIEwlZAAQJFwkbSh4RHhIEHwJURVlWTEkYAwkNRxwbTAwEFx4IEw1UHwAbFQhJAwkADUEBERgMFUFa',
};

const file = path.join(__dirname, 'index.html');
const problems = [];

if (!fs.existsSync(file)) {
  console.error('FAIL: index.html not found in this folder.');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
const body = html.match(/<body\b[^>]*>/i)?.[0] ?? '';
const attrs = new Map([...body.matchAll(/\s([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1].toLowerCase(), m[2]]));
if (attrs.get(decode(HIDDEN.attr)) !== decode(HIDDEN.value)) problems.push(decode(HIDDEN.message));
if (!/<input[^>]*type=["']?number/i.test(html)) problems.push('There must be a number input for the amount.');
if (!/localStorage/.test(html)) problems.push('Entries must be saved in localStorage so they survive a reload.');
if (!/<script[\s>]/i.test(html)) problems.push('The page needs a <script> that adds entries and updates the total.');

if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log('PASS: index.html looks good.');
