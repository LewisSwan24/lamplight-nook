export type Halves = Record<string, { first: number; second: number; grew: number; leaking: boolean }>;
export function compareHalves(readings: Record<string, number>[]): Halves;
