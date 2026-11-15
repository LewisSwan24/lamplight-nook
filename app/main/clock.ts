/**
 * Now, as the shop's money sees it. An unpackaged build can be started at another moment (LAMPLIGHT_CLOCK, a local date and
 * time such as 2026-12-01T10:00) so the simulations can move to the next month; time runs on from there.
 */
let offset = 0;

export function setClock(at: string) {
  offset = new Date(at).getTime() - Date.now();
}

export const now = () => new Date(Date.now() + offset);
