/** A code is "#" plus six hex digits, or six hex characters mixing digits and letters (so words like "decade" stay). */
const COLOUR_CODE = /\s*[(（]?(?:#[0-9A-Fa-f]{6}|\b(?=[0-9A-Fa-f]*\d)(?=[0-9A-Fa-f]*[A-Fa-f])[0-9A-Fa-f]{6})\b[)）]?/g;

/** Colour codes (FBF6EC, #2F5D50) mean nothing to most people; the colour's name next to them stays. */
export const withoutColourCodes = (s: string) =>
  s.replace(COLOUR_CODE, '').replace(/\s+([，,。.;；])/g, '$1').replace(/([一-鿿]) ([一-鿿])/g, '$1$2');

/** The folders of a full path (C:\Users\...\, /home/.../) before the file's own name; URLs are left alone. */
const PATH_FOLDERS = /\b[A-Za-z]:[\\/](?:[^\\/\s，。,;；"“”]+[\\/])*|(?<![\w:/.])\/(?:[^/\s，。,;；"“”]+\/)+/g;

/** A full path tells most people less than the file's name, which is all that stays. */
export const withoutPathFolders = (s: string) => s.replace(PATH_FOLDERS, '');
