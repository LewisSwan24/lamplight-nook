/** A sentence that names a key, cut into the key and the rest: browsers will break a line at any hyphen in "sk-ant-". */
export type KeyTextPart = { text: string; key: boolean };

export function keyTextParts(text: string): KeyTextPart[] {
  return text
    .split(/(sk-ant-[^\s，。、；）)]*)/)
    .map((part, i) => ({ text: part, key: i % 2 === 1 }))
    .filter((part) => part.text);
}
