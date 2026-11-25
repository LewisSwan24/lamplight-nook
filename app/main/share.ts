import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { folderName } from './commission';
import { workEntries } from './export';
import { isInside, reallyInside } from './paths';
import { LOCALES } from '../shared/i18n';
import { zip } from './zip';

/**
 * Sharing a work (docs/plan-1.5.md E2): it goes out as one file the user saves or puts in a cloud folder and passes on
 * themselves. Nothing is uploaded from here. What goes out is the work alone: the slip, the staff's notes and the
 * recordings live in the data folder, never in the work's; text that names the work's folder, the user's home folder
 * or anything like a key is wiped from what is shared.
 */
import type { ShareFormat } from '../shared/types';
export type { ShareFormat };

const PAGE = /\.html?$/i;

/**
 * What the shop put in the work's folder to work from, which is not the work (E6): the list of the user's folder a tidying
 * commission is given, and what the staff read in from a connected cloud folder. Named in either language, since the
 * work may have been made in the other one. What the user handed over for the work stays: the work often uses it.
 */
const INPUTS = Object.values(LOCALES).flatMap((S) => [S.ui.files.listing, `${S.ui.files.fromFolder}/`]);
const isInput = (rel: string) => INPUTS.some((n) => (n.endsWith('/') ? rel.startsWith(n) : rel === n));
/** Documents and pictures that are shared as they are. */
const AS_IS = /\.(docx|pptx|xlsx|pdf|md|txt|csv|png|jpe?g|gif|webp|svg)$/i;

/**
 * The formats a work can be shared in, the one that suits it first. A small tool goes whole: its main file is only the
 * note that comes with the script.
 */
export function shareFormats(main?: string, template?: string): ShareFormat[] {
  if (template === 'tool') return ['zip'];
  if (main && PAGE.test(main)) return ['pdf', 'page', 'zip'];
  if (main && AS_IS.test(main)) return ['file', 'zip'];
  return ['zip'];
}

const TEXT = /\.(html?|css|m?js|json|md|txt|csv|svg|xml|ya?ml|py|ts|tsx|jsx)$/i;
const KEYS = /sk-ant-[A-Za-z0-9_-]+/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A file as it may go out: in a text file, the work's folder, the user's home folder (with either slash, or as a file://
 * address) and anything shaped like a key are wiped. Any other file, and a text file with none of them, is the same buffer.
 */
export function scrub(data: Buffer, name: string, folder: string, home = homedir()): Buffer {
  if (!TEXT.test(name)) return data;
  const text = data.toString('utf8');
  let out = text.replace(KEYS, '');
  for (const path of [folder, home]) {
    const forward = path.replaceAll('\\', '/');
    for (const form of new Set([path, forward, encodeURI(forward)])) out = out.replace(new RegExp(`(file:/{2,3})?${escapeRe(form)}`, 'gi'), '');
  }
  return out === text ? data : Buffer.from(out);
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** A file the page asks for, if it is in the work's folder for real; null for the network, another computer or anywhere else. */
function local(folder: string, from: string, ref: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return null;
  let rel: string;
  try {
    rel = decodeURI(ref.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (!rel) return null;
  const path = resolve(dirname(from), rel);
  return isInside(folder, path) && statSync(path, { throwIfNoEntry: false })?.isFile() && reallyInside(folder, path) ? path : null;
}
/** A file of the work written into the page. Scrubbed first: once it is base64, the page's own scrub cannot see into it. */
const dataUri = (folder: string, path: string) =>
  `data:${MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'};base64,${scrub(readFileSync(path), path, folder).toString('base64')}`;

/** A stylesheet with its own files written in and nothing it would fetch from elsewhere. */
function css(folder: string, from: string, text: string): string {
  return text
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _q, ref: string) => {
      if (/^data:/i.test(ref.trim())) return whole;
      const path = local(folder, from, ref.trim());
      return path ? `url("${dataUri(folder, path)}")` : 'none';
    });
}

const ATTR = (name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
const attr = (tag: string, name: string) => {
  const m = ATTR(name).exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
};

/**
 * A page as one file: its pictures, stylesheets, scripts and fonts from the work's folder written into it, and every
 * load from the network or from outside the folder taken out. Ordinary links (`<a href>`) stay: they are what it says.
 */
export function singlePage(folder: string, file: string): string {
  const from = join(folder, file);
  let html = readFileSync(from, 'utf8');
  html = html.replace(/<base\b[^>]*>/gi, '');
  // Stylesheets become <style>; any other <link> keeps a file of its own folder (an icon) or goes.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attr(tag, 'href') ?? '';
    const path = local(folder, from, href);
    if (/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) return path ? `<style>${css(folder, path, readFileSync(path, 'utf8'))}</style>` : '';
    return path ? tag.replace(ATTR('href'), ` href="${dataUri(folder, path)}"`) : '';
  });
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, open: string) => {
    const src = attr(open, 'src');
    if (src === undefined) return whole;
    const path = local(folder, from, src);
    return path ? `<script${open.replace(ATTR('src'), '')}>${readFileSync(path, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>` : '';
  });
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_w, open: string, body: string) => `<style${open}>${css(folder, from, body)}</style>`);
  // Every other tag: what it loads comes from the folder or is taken out; a style attribute is a little stylesheet.
  html = html.replace(/<(?!a\b|\/)([a-z][a-z0-9-]*)\b[^>]*>/gi, (tag) => {
    let out = tag;
    for (const name of ['src', 'poster', 'data']) {
      const ref = attr(out, name);
      if (ref === undefined || /^data:/i.test(ref)) continue;
      const path = local(folder, from, ref);
      out = out.replace(ATTR(name), path ? ` ${name}="${dataUri(folder, path)}"` : '');
    }
    out = out.replace(ATTR('srcset'), '');
    const style = attr(out, 'style');
    if (style !== undefined) out = out.replace(ATTR('style'), ` style="${css(folder, from, style).replaceAll('"', '&quot;')}"`);
    return out;
  });
  return html;
}

/** A work as the one file that is shared, named after it. `pdf` prints a page (Electron's, so it is handed in). */
export async function shareBytes(o: {
  folder: string; main?: string; title: string; as: ShareFormat; touched?: string[];
  pdf?: (folder: string, file: string) => Promise<Buffer>;
}): Promise<{ name: string; data: Buffer }> {
  const name = folderName(o.title);
  const main = o.main && existsSync(join(o.folder, o.main)) && reallyInside(o.folder, join(o.folder, o.main)) ? o.main : undefined;
  if (o.as === 'pdf' && main && o.pdf) return { name: `${name}.pdf`, data: await o.pdf(o.folder, main) };
  if (o.as === 'page' && main) return { name: `${name}.html`, data: scrub(Buffer.from(singlePage(o.folder, main)), main, o.folder) };
  if (o.as === 'file' && main) return { name: `${name}${extname(main)}`, data: scrub(readFileSync(join(o.folder, main)), main, o.folder) };
  const entries = workEntries(o.folder, o.touched).filter((e) => !isInput(e.name)).map((e) => ({ name: e.name, data: scrub(Buffer.from(e.data), e.name, o.folder) }));
  return { name: `${name}.zip`, data: entries.length ? zip(entries) : Buffer.alloc(0) };
}
