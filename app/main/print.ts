import { BrowserWindow, session } from 'electron';

/**
 * A work's web page as a PDF (road-to-1.1.md A8). It is loaded from disk in a hidden window, so its pictures and styles
 * beside it come along. The page is the staff's work, not the shop's: the window gets no preload and no Node, is
 * sandboxed, and keeps its storage in a session of its own that is gone when the shop closes. The shop-wide rules
 * (index.ts) also stop it navigating or opening windows. The window goes as soon as the PDF is made.
 */
export async function pageToPdf(file: string): Promise<Buffer> {
  const own = session.fromPartition('lamplight-print');
  own.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  own.setPermissionCheckHandler(() => false);
  const win = new BrowserWindow({ show: false, webPreferences: { session: own, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  try {
    await win.loadFile(file);
    // A page that draws in a web font would otherwise print in the fallback one.
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    win.destroy();
  }
}
