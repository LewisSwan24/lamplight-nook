import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { localDay } from '../shared/localday';

const stem = (file: string) => basename(file).replace(/\.json$/, '');

/** A data file that cannot be read goes next to it under another name, so the next save does not write over it. */
export function putAside(file: string, now = new Date()) {
  const name = (n: number) => join(dirname(file), `${stem(file)}.broken-${localDay(now)}${n ? `-${n}` : ''}.json`);
  let n = 0;
  while (existsSync(name(n))) n++;
  renameSync(file, name(n));
}

export function forgetAside(file: string) {
  for (const f of readdirSync(dirname(file))) {
    if (f.startsWith(`${stem(file)}.broken-`)) rmSync(join(dirname(file), f), { force: true });
  }
}
