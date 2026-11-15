import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type LamplightApi, type Letter } from '../shared/types';

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
  spendMonths: () => ipcRenderer.invoke(IPC.spendMonths),
  monthBudget: () => ipcRenderer.invoke(IPC.monthBudget),
  monthCapNews: () => ipcRenderer.invoke(IPC.monthCapNews),
  setProjectCap: (id: string, usd: number) => ipcRenderer.invoke(IPC.setProjectCap, id, usd),
  consult: (id: string | null, text: string, files: string[]) => ipcRenderer.invoke(IPC.consult, id, text, files),
  consultFinish: (id: string) => ipcRenderer.invoke(IPC.consultFinish, id),
  consultsThisMonth: () => ipcRenderer.invoke(IPC.consultsThisMonth),
  copyInstallCommand: () => ipcRenderer.invoke(IPC.copyInstallCommand),
  installClaude: () => ipcRenderer.invoke(IPC.installClaude),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.exportDiagnostics),
  writeToUs: (letter: Letter) => ipcRenderer.invoke(IPC.writeToUs, letter),
  runDebugTask: (kind) => ipcRenderer.invoke(IPC.runDebugTask, kind),
  chooseSource: (id) => ipcRenderer.invoke(IPC.chooseSource, id),
  chooseLent: () => ipcRenderer.invoke(IPC.chooseLent),
  handOver: (paths, already) => ipcRenderer.invoke(IPC.handOver, paths, already),
  pathsOf: (files) => files.map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean),
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
  dataDamage: () => ipcRenderer.invoke(IPC.dataDamage),
  moveInOffer: () => ipcRenderer.invoke(IPC.moveInOffer),
  moveIn: (yes) => ipcRenderer.invoke(IPC.moveIn, yes),
  clearMemory: () => ipcRenderer.invoke(IPC.clearMemory),
  clearStats: () => ipcRenderer.invoke(IPC.clearStats),
  openCommissionFolder: (id) => ipcRenderer.invoke(IPC.openCommissionFolder, id),
  recallForRevision: (id) => ipcRenderer.invoke(IPC.recallForRevision, id),
  shopState: () => ipcRenderer.invoke(IPC.shopState),
  openWork: (id) => ipcRenderer.invoke(IPC.openWork, id),
  relinkWork: (id) => ipcRenderer.invoke(IPC.relinkWork, id),
  markTold: (id) => ipcRenderer.invoke(IPC.markTold, id),
  markMet: (id) => ipcRenderer.invoke(IPC.markMet, id),
  reviseCommission: (req) => ipcRenderer.invoke(IPC.reviseCommission, req),
  restorePrevious: (id) => ipcRenderer.invoke(IPC.restorePrevious, id),
  undoWork: (id) => ipcRenderer.invoke(IPC.undoWork, id),
  exportWork: (id, as) => ipcRenderer.invoke(IPC.exportWork, id, as),
  onRawEvent: (cb) => on(IPC.rawEvent, cb),
  onAiEvent: (cb) => on(IPC.aiEvent, cb),
  onDecision: (cb) => on(IPC.decision, cb),
  onResult: (cb) => on(IPC.result, cb),
  miniState: () => ipcRenderer.invoke(IPC.miniState),
  onMiniState: (cb) => on(IPC.miniPush, cb),
  showShop: () => ipcRenderer.invoke(IPC.showShop),
  moveScene: (scene) => ipcRenderer.invoke(IPC.moveScene, scene),
  onUpdate: (cb) => on(IPC.updateOffer, cb),
  downloadUpdate: () => ipcRenderer.invoke(IPC.downloadUpdate),
};

contextBridge.exposeInMainWorld('lamplight', api);
// The app's language, needed before any page script runs (shared/i18n.ts reads it as it loads).
contextBridge.exposeInMainWorld('lamplightLocale', ipcRenderer.sendSync(IPC.locale));
// Where the shop is, also fixed for the page's life (shared/scenes.ts reads it as it loads).
contextBridge.exposeInMainWorld('lamplightScene', ipcRenderer.sendSync(IPC.scene));
