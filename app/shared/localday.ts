const two = (n: number) => String(n).padStart(2, '0');

/** The month and the day as someone would say them where they sit. Everything the user reads is dated this way. */
export const localMonth = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}`;
export const localDay = (d: Date) => `${localMonth(d)}-${two(d.getDate())}`;
export const localClock = (d: Date) => `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
/** '2026-03' as it is said here: 2026年3月, March 2026. */
export const monthName = (month: string, locale: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
/** A month name as someone would type it: whole, and each word of it. 2026年3月, 2026年, 3月; March 2026, March, 2026. */
export function monthWords(month: string, locale: string): string[] {
  const name = monthName(month, locale);
  return [name, ...(name.includes(' ') ? name.split(' ') : name.match(/\d+\D*/g) ?? [])];
}
