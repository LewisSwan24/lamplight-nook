/**
 * Picture kinds (road-to-1.3.md C2). What Claude can look at with Read, what the app turns into a PNG copy first
 * (Chromium decodes it, Read does not), and what nothing here can open at all.
 */
const extOf = (name: string) => /\.([^./\\]+)$/.exec(name)?.[1].toLowerCase() ?? '';

/** Pictures Read shows Claude as they are. */
export const SEEN = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
/** Pictures that get a PNG copy beside them, because Read can't show them but the app can draw them. */
export const CONVERTED = new Set(['bmp', 'avif']);
/** Pictures refused when handed over: neither Read nor Chromium can open them. */
export const REFUSED = new Set(['heic', 'heif', 'tif', 'tiff']);

export const isPicture = (name: string) => SEEN.has(extOf(name)) || CONVERTED.has(extOf(name));
export const needsPng = (name: string) => CONVERTED.has(extOf(name));
export const cannotOpen = (name: string) => REFUSED.has(extOf(name));
