// Reading a long run (soak.mjs). Kept apart from it so the unit tests need no browser driver: CI has none.

/** Things that may wander a little as the staff move about; anything past this between the halves is a leak. */
const ALLOWED = { objects: 12, tweens: 12, timers: 12, dom: 60, listeners: 40, heapMB: 12, mainHeapMB: 8 };

/** The middle value, so one busy moment in the shop does not count as growth. */
const middle = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Compare the first half of the readings with the second: { name: { first, second, grew, leaking } }. */
export function compareHalves(readings) {
  const half = Math.floor(readings.length / 2);
  const out = {};
  for (const [name, allowed] of Object.entries(ALLOWED)) {
    const first = middle(readings.slice(0, half).map((r) => r[name]));
    const second = middle(readings.slice(half).map((r) => r[name]));
    out[name] = { first, second, grew: second - first, leaking: second - first > allowed };
  }
  return out;
}
