// Run one debug task headlessly and record every event.
// Usage: npx tsx scripts/record.ts <hello|subagents> <output folder>
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEBUG_PROMPTS, commissionDir, runAgent } from '../app/main/agent-runner';
import { fill, strings } from '../app/shared/i18n';

const kind = (process.argv[2] ?? 'subagents') as keyof typeof DEBUG_PROMPTS;
const outDir = process.argv[3] ?? join(homedir(), 'Downloads', 'lamplight-recordings');
const started = Date.now();

const result = await runAgent({
  prompt: DEBUG_PROMPTS[kind],
  workDir: commissionDir(join(homedir(), 'Documents'), fill(strings.app.debugCommission, { kind })),
  recordingPath: join(outDir, `${started}-${kind}.jsonl`),
  emit: (e) => console.log(`[${e.source}] ${e.name}`),
});

console.log(JSON.stringify({ ...result, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
process.exit(result.ok ? 0 : 1);
