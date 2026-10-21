import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AiEvent, type LamplightApi, type RawAgentEvent } from '../shared/types';

const api: LamplightApi = {
  envStatus: () => ipcRenderer.invoke(IPC.envStatus),
  runDebugTask: (kind) => ipcRenderer.invoke(IPC.runDebugTask, kind),
  onRawEvent: (cb) => {
    const listener = (_e: unknown, event: RawAgentEvent) => cb(event);
    ipcRenderer.on(IPC.rawEvent, listener);
    return () => ipcRenderer.removeListener(IPC.rawEvent, listener);
  },
  onAiEvent: (cb) => {
    const listener = (_e: unknown, event: AiEvent) => cb(event);
    ipcRenderer.on(IPC.aiEvent, listener);
    return () => ipcRenderer.removeListener(IPC.aiEvent, listener);
  },
};

contextBridge.exposeInMainWorld('lamplight', api);
