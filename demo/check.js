// Checks the ledger page built by the demo commission. Run with: node check.js
// The data-ledger-version requirement is deliberately not mentioned in the task,
// so the first run fails for real and the agent has to read this output and fix it.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'index.html');
const problems = [];

if (!fs.existsSync(file)) {
  console.error('FAIL: index.html not found in this folder.');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
if (!/<body[^>]*\sdata-ledger-version="1"/i.test(html)) {
  problems.push('<body> must have the attribute data-ledger-version="1" (used to migrate saved data later).');
}
if (!/<input[^>]*type=["']?number/i.test(html)) problems.push('There must be a number input for the amount.');
if (!/localStorage/.test(html)) problems.push('Entries must be saved in localStorage so they survive a reload.');
if (!/<script[\s>]/i.test(html)) problems.push('The page needs a <script> that adds entries and updates the total.');

if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log('PASS: index.html looks good.');
