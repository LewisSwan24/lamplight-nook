import { randomUUID } from 'node:crypto';
import { BrowserWindow, nativeImage, session, type WebContents } from 'electron';
import { printMayLoad } from './export';

/**
 * A work's web page, opened where it can do no harm (road-to-1.1.md A8): loaded from disk in a hidden window, so its
 * pictures and styles beside it come along. The page is the staff's work, not the shop's, and may come from material
 * the user handed over: the window gets no preload and no Node and is sandboxed. Each page gets a session of its own,
 * kept in memory only, so two at once cannot share storage or each other's rules. It may load only what is in `folder`
 * (printMayLoad), so nothing from the network or elsewhere on the computer ends up in a PDF the user passes on or in a
 * thumbnail; a proxy that leads nowhere and no WebRTC outside it back that up. The shop-wide rules (index.ts) also stop
 * it navigating or opening windows. JavaScript stays on, because some pages draw themselves with it. The window goes as
 * soon as `use` is done with it.
 */
async function inIsolatedWindow<T>(folder: string, file: string, size: { width: number; height: number } | undefined, use: (page: WebContents) => Promise<T>): Promise<T> {
  const own = session.fromPartition(`lamplight-print-${randomUUID()}`);
  own.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  own.setPermissionCheckHandler(() => false);
  own.webRequest.onBeforeRequest((details, done) => done({ cancel: !printMayLoad(folder, details.url) }));
  await own.setProxy({ proxyRules: 'http://0.0.0.0:0' });
  const win = new BrowserWindow({ show: false, useContentSize: true, ...size, webPreferences: { session: own, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  try {
    await win.loadFile(file);
    // A page that draws in a web font would otherwise come out in the fallback one.
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await use(win.webContents);
  } finally {
    win.destroy();
  }
}

/** A work's web page as an A4 PDF, as the browser's "Print to PDF" would make it. */
export function pageToPdf(folder: string, file: string): Promise<Buffer> {
  return inIsolatedWindow(folder, file, undefined, (page) => page.printToPDF({ printBackground: true, pageSize: 'A4' }));
}

/** The result card's thumbnail is this wide (road-to-1.3.md C1). */
export const THUMB_WIDTH = 280;
/** And at most this big as a PNG, so the card gets it in one small message. */
export const THUMB_MAX_BYTES = 200 * 1024;

/** A PNG data: address, THUMB_WIDTH wide or narrower until it fits THUMB_MAX_BYTES. */
function thumbPng(image: Electron.NativeImage): string | undefined {
  if (image.isEmpty()) return undefined;
  for (let width = THUMB_WIDTH; width >= 70; width = Math.floor(width * 0.8)) {
    const png = image.resize({ width, quality: 'best' }).toPNG();
    if (png.length <= THUMB_MAX_BYTES) return `data:image/png;base64,${png.toString('base64')}`;
  }
  return undefined;
}

/**
 * The first screen of a page, as the card's thumbnail. `size` is the screen it is opened in. `fit`: a preview page
 * shorter than that screen (a few rows of a sheet, one slide) is taken only as tall as it is, without the empty rest.
 */
export async function pageThumb(folder: string, file: string, size: { width: number; height: number }, fit = false): Promise<string | undefined> {
  return thumbPng(await inIsolatedWindow(folder, file, size, async (page) => {
    // A scroll bar is no part of the picture.
    await page.insertCSS('::-webkit-scrollbar { display: none; }');
    // The preview's margin sits outside its body (it collapses through), so the same again is kept below it.
    const tall = fit ? Number(await page.executeJavaScript('(() => { const r = document.body.getBoundingClientRect(); return Math.ceil(r.bottom + r.top); })()')) : size.height;
    return page.capturePage({ x: 0, y: 0, width: size.width, height: Math.min(tall, size.height) });
  }));
}

/** A picture, shrunk for the card's thumbnail. PNG and JPEG only: what nativeImage reads. */
export const imageThumb = (file: string) => thumbPng(nativeImage.createFromPath(file));
