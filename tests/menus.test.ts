import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toolIconPx } from '../app/renderer/game/layout';
import { TOOL_ICONS } from '../app/renderer/ui/tool-icons';
import { LOCALES } from '../app/shared/i18n';
import { readPng } from './png';

const css = readFileSync('app/renderer/style.css', 'utf8');
const source = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

describe('the toolbar icons', () => {
  it('is a strip with one 16x16 cell per icon', () => {
    const png = readPng('assets/sprites/tools.png');
    expect(png.width).toBe(16 * TOOL_ICONS.length);
    expect(png.height).toBe(16);
  });

  it('come out at a whole number of real pixels, whatever the window and the display scale', () => {
    for (const ui of [1, 1.05, 1.25, 1.5, 1.75]) {
      for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.25]) {
        const real = toolIconPx(ui, dpr) * dpr;
        expect(Math.abs(real - Math.round(real))).toBeLessThan(1e-9);
        expect(real).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('are exactly 2x on the smallest window of an ordinary display', () => {
    expect(toolIconPx(1, 1)).toBe(2);
  });

  it('leave the toolbar out of the page zoom, which would make the pixels uneven', () => {
    const zoomed = /([^{}]*)\{\s*zoom:\s*var\(--ui/.exec(css)![1];
    expect(zoomed).not.toContain('.toolbar');
  });
});

describe('the toolbar and settings words', () => {
  for (const [lang, L] of Object.entries(LOCALES)) {
    it(`${lang} has a word for the commission button in both states`, () => {
      expect(L.ui.toolbar.order).toBeTruthy();
      expect(L.ui.toolbar.progress).toBeTruthy();
      expect(L.ui.toolbar.order).not.toBe(L.ui.toolbar.progress);
    });

    it(`${lang} says what the detail strip does, and the shelf says when it is empty`, () => {
      expect(L.ui.access.detailedToggle).toBeTruthy();
      expect(L.ui.shelf.empty).toBeTruthy();
      expect('detailedOn' in L.ui.toolbar).toBe(false);
    });
  }

  it('renames the two settings tabs', () => {
    expect(LOCALES['zh-CN'].ui.setup.settingsTabs.furnish).toBe('店面');
    expect(LOCALES['zh-CN'].ui.setup.settingsTabs.work).toBe('开工');
  });
});

describe('the cards', () => {
  it('have three widths and one rule for the window', () => {
    const tokens = [...css.matchAll(/--card-(\w+):\s*\d+px/g)].map((m) => m[1]);
    expect(tokens.sort()).toEqual(['form', 'reading', 'small']);
    const rules = [...css.matchAll(/^([^{}\n]*)\{[^{}]*width:\s*min\(/gm)].map((m) => m[1].trim());
    const cards = rules.filter((r) => /card|dialog|serious|commission|settings|notebook|meeting|legal|notice|shelf/.test(r));
    expect(cards).toEqual(['.card, .dialog, .serious']);
  });

  it('never leave the close label in English', () => {
    expect(source('app/renderer/ui')).not.toMatch(/'aria-label': 'close'/);
  });

  it('close with one shared button', () => {
    const made = source('app/renderer/ui').match(/el\('button\.close'/g) ?? [];
    expect(made.length).toBe(1);
  });
});
