// Imported first by the main process: the Store build moves to its own data folder before anything reads one.
import { app } from 'electron';
import { storeDataDir } from './move-in';

/** The installer build's data folder (Electron's default), taken before the Store build moves away from it. */
const installerData = app.getPath('userData');
if (process.windowsStore === true) app.setPath('userData', storeDataDir(app.getPath('appData')));

/**
 * The installer build's shop that the Store build may bring over (move-in.ts). A simulated Store run
 * (LAMPLIGHT_STORE=1) keeps the folder it was given and is pointed at an old one by LAMPLIGHT_STORE_OLD_DATA,
 * both honoured only unpackaged.
 */
export const oldInstallerData: string | undefined = process.windowsStore === true
  ? installerData
  : !app.isPackaged && process.env.LAMPLIGHT_STORE === '1' ? process.env.LAMPLIGHT_STORE_OLD_DATA : undefined;
