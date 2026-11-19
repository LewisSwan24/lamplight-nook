/**
 * A small, forgiving XML reader for the parts of Office packages: enough to walk elements and collect text. Names are
 * kept without their prefix (w:p is p), since each part uses one vocabulary and producers differ in the prefixes they
 * pick. No DTDs, no external entities: only the five named entities and character references are decoded.
 */
/**
 * `clash`: two attributes with the same name once prefixes are dropped, so attrs holds only the last (safe.ts refuses it).
 * `start` and `end`: where the element sits in the text it was read from, its tags included, so a change can replace
 * exactly that and leave every other byte alone (edit.ts, road-to-1.3.md C3).
 */
export type El = { name: string; attrs: Record<string, string>; kids: (El | string)[]; clash?: true; start: number; end: number };

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] !== '#') return ENTITIES[ref] ?? whole;
    const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const local = (name: string) => name.slice(name.indexOf(':') + 1);

export function parseXml(text: string): El {
  const root: El = { name: '#root', attrs: {}, kids: [], start: 0, end: text.length };
  const stack: El[] = [root];
  let at = 0;
  while (at < text.length) {
    const lt = text.indexOf('<', at);
    if (lt < 0) break;
    if (lt > at) stack[stack.length - 1].kids.push(decode(text.slice(at, lt)));
    if (text.startsWith('<!--', lt)) {
      at = skip(text, lt, '-->');
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = skip(text, lt, ']]>');
      stack[stack.length - 1].kids.push(text.slice(lt + 9, end - 3));
      at = end;
    } else if (text[lt + 1] === '?' || text[lt + 1] === '!') {
      at = skip(text, lt, '>');
    } else {
      const gt = tagEnd(text, lt);
      const tag = text.slice(lt + 1, gt);
      at = gt + 1;
      if (tag[0] === '/') {
        const name = local(tag.slice(1).trim());
        // A stray closing tag is ignored; one that closes an outer element closes what is still open inside it.
        let i = stack.length - 1;
        while (i > 0 && stack[i].name !== name) i--;
        if (i > 0) {
          // What was still open inside ends where this closing tag starts.
          for (const open of stack.slice(i + 1)) open.end = lt;
          stack[i].end = at;
          stack.length = i;
        }
        continue;
      }
      const self = tag.endsWith('/');
      const body = self ? tag.slice(0, -1) : tag;
      const m = /^\s*([^\s/>]+)/.exec(body);
      if (!m) continue;
      const el: El = { name: local(m[1]), attrs: {}, kids: [], start: lt, end: self ? at : text.length };
      for (const a of body.slice(m[0].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const key = local(a[1]);
        if (key in el.attrs) el.clash = true;
        el.attrs[key] = decode(a[3] ?? a[4]);
      }
      stack[stack.length - 1].kids.push(el);
      if (!self) stack.push(el);
    }
  }
  return root;
}

function skip(text: string, from: number, end: string): number {
  const i = text.indexOf(end, from);
  return i < 0 ? text.length : i + end.length;
}

/** The > that ends a tag, past any > inside a quoted attribute value. */
export function tagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return text.length;
}

export const elements = (el: El): El[] => el.kids.filter((k): k is El => typeof k !== 'string');
export const child = (el: El | undefined, name: string): El | undefined => el && elements(el).find((k) => k.name === name);
export const children = (el: El | undefined, name: string): El[] => (el ? elements(el).filter((k) => k.name === name) : []);

/** Every element of this name below el, in document order, not looking inside a match. */
export function findAll(el: El, name: string, out: El[] = []): El[] {
  for (const k of elements(el)) {
    if (k.name === name) out.push(k);
    else findAll(k, name, out);
  }
  return out;
}

export const find = (el: El | undefined, name: string): El | undefined => (el ? findAll(el, name)[0] : undefined);

/** The text directly inside an element. */
export const ownText = (el: El): string => el.kids.filter((k): k is string => typeof k === 'string').join('');

/** The text of the elements called textName below el (w:t, a:t), with tabs and breaks as spaces. */
export function textOf(el: El, textName = 't', skipNames: string[] = []): string {
  let out = '';
  const walk = (e: El) => {
    for (const k of e.kids) {
      if (typeof k === 'string') continue;
      if (k.name === textName) out += ownText(k);
      else if (k.name === 'tab') out += '\t';
      else if (k.name === 'br' || k.name === 'cr') out += ' ';
      else if (!skipNames.includes(k.name)) walk(k);
    }
  };
  walk(el);
  return out;
}
