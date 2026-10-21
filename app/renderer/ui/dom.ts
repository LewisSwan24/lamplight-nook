/** Tiny DOM helper: el('div.card', { onclick }, child, 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: `${K}${string}`,
  props: Partial<Record<string, unknown>> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag as K);
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (v !== undefined && v !== false) node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

export const layer = () => document.getElementById('ui')!;
