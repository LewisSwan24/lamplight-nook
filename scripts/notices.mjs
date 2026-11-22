// Builds out/THIRD-PARTY-NOTICES.txt: every package the app ships or bundles, with its license text,
// and the art, sound, font and music it uses. Run after `electron-vite build` (npm run build does).
// Fails when a package has a license that is not on the allow list, so a new dependency gets looked at.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Licenses that allow shipping the package inside a paid app, with its notice. */
export const ALLOWED = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0'];

/** Packages under their own terms, checked by hand: name -> why it is fine. */
export const REVIEWED = {
  '@anthropic-ai/claude-agent-sdk': 'Anthropic proprietary; used under Anthropic\'s legal agreements to drive the user\'s own Claude Code.',
  argparse: 'Python Software Foundation License 2.0: permissive, no copyleft, shipping allowed with its notice. Comes with js-yaml, which electron-updater reads update feeds with.',
  jszip: '(MIT OR GPL-3.0-or-later): dual-licensed, used under MIT. Comes with pptxgenjs, which writes PowerPoint files for the shop.',
  pako: 'MIT AND Zlib: both permissive, shipping allowed with their notices. Comes with jszip.',
};

/** Electron and Chromium ship their own license files next to the app (LICENSE.electron.txt, LICENSES.chromium.html). */
const SHIPPED_SEPARATELY = ['electron'];

/** npm packages named like a Node module that a dependency lists but the bundle never takes: pptxgenjs imports https, which is Node's own. */
const NODE_BUILTINS = ['https'];

/** Art, sound, font and music, see docs/art.md. */
const ASSETS = `Art, sound, fonts and music
===========================

Modern Interiors, Modern Exteriors, Modern Farm (pixel art for the shop, the study, the street,
the back garden, the staff, the neighbours, the cat, and what the shop gathers over time;
some of it changed for Lamplight Nook, such as the staff's props and walking animals)
  By LimeZu - https://limezu.itch.io/
  Used under the licenses that come with the packs: commercial use and changes allowed,
  the assets themselves may not be resold or redistributed. Credit to LimeZu is required.

Modern UI SFX (interface sounds)
  By Andrea Baroni, Cyberleaf Studio - https://cyberleafstudio.itch.io/
  Used under the pack's paid license: commercial use allowed; the sounds may not be
  redistributed or remixed and released. Converted to Ogg and leveled only.

LXGW WenKai Screen (handwriting font, subset, internal name "Lamplight Hand")
  By LXGW - https://github.com/lxgw/LxgwWenKai-Screen
  SIL Open Font License 1.1; the full license text follows the package list below.

Door bell, mallet, pencil and meeting bell sounds, the app icon, the tray lamp, the toolbar icons
and the works shelf icons
  Made for Lamplight Nook.
`;

/** Packages imported by the app's source (bare specifiers), without node: built-ins. */
export function importedPackages(dir) {
  const names = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(ts|mts|js|mjs)$/.test(f.name)) {
        // `import type ... from` is erased at build time, so the package is not shipped.
        for (const m of readFileSync(p, 'utf8').matchAll(/(import type\s[^;]*?)?from '([^.'/][^']*)'/g)) {
          if (m[1]) continue;
          const spec = m[2];
          if (spec.startsWith('node:')) continue;
          names.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
        }
      }
    }
  };
  walk(dir);
  return [...names].sort();
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

/** The MIT terms as opensource.org gives them, for a package that names the license but leaves its text out. */
const mit = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** Packages whose package.json names the license but which ship no text of it, checked by hand: name -> the text. */
const MISSING_TEXT = {
  // electron-updater's; package.json says MIT, author Vladimir Krivosheev.
  'lazy-val': mit('Vladimir Krivosheev'),
  // readable-stream's, through jszip; package.json says MIT, author Julian Gruber.
  isarray: mit('Julian Gruber'),
  // The settings' pairing QR code (E1); package.json says MIT, and dist/qrcode.js opens with "Copyright (c) 2009 Kazuhiko Arase".
  'qrcode-generator': mit('2009 Kazuhiko Arase'),
};

/** A package and everything it depends on at run time (dependencies only: optional and peer ones are not shipped). */
export function collect(roots, modules = join(ROOT, 'node_modules')) {
  const seen = new Map();
  const visit = (name) => {
    if (seen.has(name) || SHIPPED_SEPARATELY.includes(name) || NODE_BUILTINS.includes(name)) return;
    const dir = join(modules, name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN';
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    seen.set(name, { name, version: pkg.version, license, homepage: pkg.homepage ?? repo ?? '', texts: files.length ? files.map((f) => readFileSync(join(dir, f), 'utf8').trim()) : MISSING_TEXT[name] ? [MISSING_TEXT[name]] : [] });
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep);
  };
  roots.forEach(visit);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Packages whose license is neither on the allow list nor reviewed by hand. */
export const unapproved = (packages) => packages.filter((p) => !REVIEWED[p.name] && !ALLOWED.includes(p.license)).map((p) => `${p.name}@${p.version} (${p.license})`);

export function render(packages, fontLicense, extra = '') {
  const parts = [
    'Lamplight Nook - third-party notices',
    '',
    'Lamplight Nook includes the following third-party material. Electron and Chromium',
    'licenses are in LICENSE.electron.txt and LICENSES.chromium.html in the install folder.',
    '',
    ASSETS,
    extra,
    'Software packages',
    '=================',
    '',
  ];
  for (const p of packages) {
    parts.push(`${p.name} ${p.version} - ${p.license}${p.homepage ? ` - ${p.homepage}` : ''}`);
    if (REVIEWED[p.name]) parts.push(`  ${REVIEWED[p.name]}`);
    for (const t of p.texts) parts.push('', t);
    parts.push('', '-'.repeat(72), '');
  }
  parts.push('LXGW WenKai Screen - SIL Open Font License 1.1', '', fontLicense.trim(), '');
  return parts.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packages = collect(importedPackages(join(ROOT, 'app')));
  const bad = unapproved(packages);
  if (bad.length) {
    console.error(`Licenses to review before shipping:\n${bad.join('\n')}`);
    process.exit(1);
  }
  // Music credits arrive with the music (assets/audio/music/CREDITS.md) and are included when present.
  const music = join(ROOT, 'assets', 'audio', 'music', 'CREDITS.md');
  const extra = existsSync(music) ? `Background music\n================\n\n${readFileSync(music, 'utf8').trim()}\n` : '';
  const out = join(ROOT, 'out', 'THIRD-PARTY-NOTICES.txt');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(packages, readFileSync(join(ROOT, 'assets', 'fonts', 'hand-OFL.txt'), 'utf8'), extra));
  console.log(`Third-party notices: ${packages.length} packages -> ${out}`);
}
