import { randomUUID } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { printMayLoad } from './export';

/**
 * A work's web page as a PDF (road-to-1.1.md A8). It is loaded from disk in a hidden window, so its pictures and styles
 * beside it come along. The page is the staff's work, not the shop's, and may come from material the user handed over:
 * the window gets no preload and no Node and is sandboxed. Each PDF gets a session of its own, kept in memory only, so
 * two at once cannot share storage or each other's rules. It may load only what is in the work's folder (printMayLoad),
 * so nothing from the network or elsewhere on the computer ends up in a PDF the user passes on; a proxy that leads
 * nowhere and no WebRTC outside it back that up. The shop-wide rules (index.ts) also stop it navigating or opening
 * windows. JavaScript stays on, because some pages draw themselves with it. The window goes as soon as the PDF is made.
 */
export async function pageToPdf(folder: string, file: string): Promise<Buffer> {
  const own = session.fromPartition(`lamplight-print-${randomUUID()}`);
  own.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  own.setPermissionCheckHandler(() => false);
  own.webRequest.onBeforeRequest((details, done) => done({ cancel: !printMayLoad(folder, details.url) }));
  await own.setProxy({ proxyRules: 'http://0.0.0.0:0' });
  const win = new BrowserWindow({ show: false, webPreferences: { session: own, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  try {
    await win.loadFile(file);
    // A page that draws in a web font would otherwise print in the fallback one.
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    win.destroy();
  }
}
