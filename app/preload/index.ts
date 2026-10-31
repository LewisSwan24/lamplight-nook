import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type LamplightApi } from '../shared/types';

/** Subscribe to a main -> renderer channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void) {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const api: LamplightApi = {
  envStatus: () => ipcRenderer.invoke(IPC.envStatus),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  chooseWorkRoot: () => ipcRenderer.invoke(IPC.chooseWorkRoot),
  openWorkRoot: () => ipcRenderer.invoke(IPC.openWorkRoot),
  openLink: (link) => ipcRenderer.invoke(IPC.openLink, link),
  appVersion: () => ipcRenderer.invoke(IPC.appVersion),
  relaunch: () => ipcRenderer.invoke(IPC.relaunch),
  legalNotices: () => ipcRenderer.invoke(IPC.legalNotices),
  saveApiKey: (key) => ipcRenderer.invoke(IPC.saveApiKey, key),
  clearApiKey: () => ipcRenderer.invoke(IPC.clearApiKey),
  spendThisMonth: () => ipcRenderer.invoke(IPC.spendThisMonth),
  copyInstallCommand: () => ipcRenderer.invoke(IPC.copyInstallCommand),
  installClaude: () => ipcRenderer.invoke(IPC.installClaude),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.exportDiagnostics),
  runDebugTask: (kind) => ipcRenderer.invoke(IPC.runDebugTask, kind),
  chooseSource: (kind) => ipcRenderer.invoke(IPC.chooseSource, kind),
  startCommission: (form) => ipcRenderer.invoke(IPC.startCommission, form),
  retryCommission: () => ipcRenderer.invoke(IPC.retryCommission),
  cancelCommission: () => ipcRenderer.invoke(IPC.cancelCommission),
  pendingCommission: () => ipcRenderer.invoke(IPC.pendingCommission),
  resumePending: () => ipcRenderer.invoke(IPC.resumePending),
  dropPending: () => ipcRenderer.invoke(IPC.dropPending),
  answerDecision: (answer) => ipcRenderer.invoke(IPC.answer, answer),
  openOutput: (path, how) => ipcRenderer.invoke(IPC.openOutput, path, how),
  recallForCommission: (form) => ipcRenderer.invoke(IPC.recallForCommission, form),
  recallOnOpen: () => ipcRenderer.invoke(IPC.recallOnOpen),
  addNote: (text) => ipcRenderer.invoke(IPC.addNote, text),
  getMemory: () => ipcRenderer.invoke(IPC.getMemory),
  clearMemory: () => ipcRenderer.invoke(IPC.clearMemory),
  openCommissionFolder: (id) => ipcRenderer.invoke(IPC.openCommissionFolder, id),
  recallForRevision: (id) => ipcRenderer.invoke(IPC.recallForRevision, id),
  shopState: () => ipcRenderer.invoke(IPC.shopState),
  openWork: (id) => ipcRenderer.invoke(IPC.openWork, id),
  markTold: (id) => ipcRenderer.invoke(IPC.markTold, id),
  reviseCommission: (req) => ipcRenderer.invoke(IPC.reviseCommission, req),
  restorePrevious: (id) => ipcRenderer.invoke(IPC.restorePrevious, id),
  onRawEvent: (cb) => on(IPC.rawEvent, cb),
  onAiEvent: (cb) => on(IPC.aiEvent, cb),
  onDecision: (cb) => on(IPC.decision, cb),
  onResult: (cb) => on(IPC.result, cb),
  miniState: () => ipcRenderer.invoke(IPC.miniState),
  onMiniState: (cb) => on(IPC.miniPush, cb),
  showShop: () => ipcRenderer.invoke(IPC.showShop),
};

contextBridge.exposeInMainWorld('lamplight', api);
// The app's language, needed before any page script runs (shared/i18n.ts reads it as it loads).
contextBridge.exposeInMainWorld('lamplightLocale', ipcRenderer.sendSync(IPC.locale));
