import { contextBridge, ipcRenderer } from 'electron';
import type { Postcard } from '../shared/postcard';

/**
 * The postcard window's preload (docs/plan-1.5.md E3). It gives the page two things and nothing more: the postcard, already
 * checked by the main process, and a way home. No commissions, settings or notebook can be reached from here, so nothing
 * clicked in someone else's shop can change one's own.
 *
 * It imports nothing but Electron. A sandboxed preload cannot load a second file, and anything shared with the shop's
 * preload would be split into one, so the channel names are written out here (tests/postcard.test.ts holds them to IPC).
 */
export const VISIT_CHANNELS = { card: 'visit:card', home: 'visit:home', locale: 'app:locale' } as const;

const card = ipcRenderer.sendSync(VISIT_CHANNELS.card) as Postcard | null;

contextBridge.exposeInMainWorld('lamplightVisit', { card, home: () => ipcRenderer.invoke(VISIT_CHANNELS.home) });
contextBridge.exposeInMainWorld('lamplightLocale', ipcRenderer.sendSync(VISIT_CHANNELS.locale));
// The rooms ask where the home shop is (shared/scenes.ts): here it is the postcard's.
contextBridge.exposeInMainWorld('lamplightHome', card?.home);
