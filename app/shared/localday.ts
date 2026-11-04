const two = (n: number) => String(n).padStart(2, '0');

/** The month and the day as someone would say them where they sit. Everything the user reads is dated this way. */
export const localMonth = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}`;
export const localDay = (d: Date) => `${localMonth(d)}-${two(d.getDate())}`;
export const localClock = (d: Date) => `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
