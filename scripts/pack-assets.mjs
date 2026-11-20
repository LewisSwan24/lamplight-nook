// The pictures and sounds our scripts build from the purchased packs may not be redistributed, so this public
// repository ignores them (.gitignore) and a private one, LewisSwan24/lamplight-nook-assets, keeps a copy for the
// release workflow. Same layout in both: assets/sprites/..., assets/ui/..., assets/audio/...
//
//   node scripts/pack-assets.mjs export <private checkout>   after rebuilding art: copy ours there, then commit it
//   node scripts/pack-assets.mjs import <private checkout>   in CI: copy them into this checkout
//
// Import only writes files this repository ignores, so the private copy can never change code or tracked art.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (root, args, input) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

const isVendor = (rel) => rel.startsWith('assets/vendor/');

/** Every ignored file under assets/ except the raw packs, sorted, with forward slashes. */
export function packBuilt(root) {
  // The exclusion keeps git out of the raw packs, which hold tens of thousands of files.
  return git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', 'assets',
    ':(exclude)assets/vendor'])
    .split('\0')
    .filter((rel) => rel && !isVendor(rel))
    .sort();
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name));
}

/** Mirrors the pack-built files into <out>/assets, removing ones that are gone here. Leaves the rest of <out>. */
export function exportTo(root, out) {
  const keep = new Set(packBuilt(root));
  for (const file of filesUnder(join(out, 'assets'))) {
    if (!keep.has(relative(out, file).split(sep).join('/'))) rmSync(file);
  }
  for (const rel of keep) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    copyFileSync(join(root, rel), join(out, rel));
  }
  return [...keep];
}

/** Copies <from>/assets into <root>/assets, after checking every file is one <root> ignores. */
export function importFrom(from, root) {
  const files = filesUnder(join(from, 'assets')).map((f) => relative(from, f).split(sep).join('/'));
  if (files.length === 0) throw new Error(`no pack-built files in ${join(from, 'assets')}`);
  let ignored = '';
  try {
    ignored = git(root, ['check-ignore', '--stdin', '-z'], files.join('\0') + '\0');
  } catch (e) {
    if (e.status !== 1) throw e; // 1 means none of them is ignored
  }
  const allowed = new Set(ignored.split('\0'));
  const refused = files.filter((rel) => !allowed.has(rel) || isVendor(rel));
  if (refused.length) throw new Error(`refusing files this repository does not ignore: ${refused.join(', ')}`);
  for (const rel of files) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    copyFileSync(join(from, rel), join(root, rel));
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir] = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (!dir || !['export', 'import'].includes(command)) {
    console.error('usage: node scripts/pack-assets.mjs export|import <private checkout>');
    process.exit(2);
  }
  const done = command === 'export' ? exportTo(root, resolve(dir)) : importFrom(resolve(dir), root);
  console.log(`${command}ed ${done.length} pack-built files`);
}
