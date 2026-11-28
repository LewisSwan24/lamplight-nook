import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTORS } from '../app/renderer/game/layout';
import { WALK_SPEED } from '../app/renderer/game/life';
import { pieceData } from '../app/renderer/game/pieces';
import { entering, OPEN } from '../app/renderer/game/town';
import { ruleBook } from '../app/renderer/stage/rulebook';
import { lintLines, parseLines } from '../app/renderer/translator/lines';
import { Translator, parseAnimTable, parseRules } from '../app/renderer/translator/translator';
import { BIRTHDAYS } from '../app/shared/calendar';
import { LOCALES } from '../app/shared/i18n';
import { ROOMS, isKeptRoom } from '../app/shared/scenes';
import { ROOM_CREW, SHOP_STAFF } from '../app/shared/staff';
import type { AiEvent } from '../app/shared/types';

const zh = JSON.parse(readFileSync('locales/zh-CN.json', 'utf8'));
const en = JSON.parse(readFileSync('locales/en.json', 'utf8'));

// plan-2.0.md J2: the flower shop and the bookshop on the river street open, each kept by one person: Fern, the
// neighbour who sold flowers, and Uncle Page, who is new.
describe('the two shops on the river street', () => {
  it('can be gone into from the street', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      expect(ROOMS).toContain(room);
      expect(OPEN.has(room)).toBe(true);
      expect(entering(room, { here: 'cafe' })).toBe('visit');
    }
  });

  it('has each kept by its own keeper, standing at the blackboard like the bakery and the post office', () => {
    expect(ROOM_CREW.flowershop).toEqual(['fangjie']);
    expect(ROOM_CREW.bookshop).toEqual(['jianbo']);
    expect(SHOP_STAFF).toEqual(expect.arrayContaining(['fangjie', 'jianbo']));
    for (const id of ['fangjie', 'jianbo'] as const) {
      expect(ACTORS.find((a) => a.id === id)).toMatchObject({ home: 'board' });
      expect(WALK_SPEED[id]).toBeGreaterThan(0);
      expect(BIRTHDAYS[id]).toHaveLength(2);
    }
  });

  it('names the keepers in both languages: Fern keeps her name from the street', () => {
    expect(zh.actors.fangjie).toBe(zh.guests.florist);
    expect(en.actors.fangjie).toBe(en.guests.florist);
    expect(zh.actors.jianbo).toBe('简伯');
    expect(en.actors.jianbo).toBe('Uncle Page');
  });

  it('has its furniture, and things in it with names to hover', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      expect(pieceData(room).pieces.map((p) => p.name)).toEqual(expect.arrayContaining(['counter', 'shelf', 'table', 'workbench']));
      expect(Object.keys(zh.sceneText[room].zones).sort()).toEqual(Object.keys(en.sceneText[room].zones).sort());
      expect(Object.keys(zh.sceneText[room].zones)).toEqual(Object.keys(zh.sceneText.bakery.zones));
    }
  });

  it('has the keeper greet whoever comes in, and talk when the shop is quiet, about thirty things each', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      const { lines } = ruleBook(room);
      expect(lines.shop_in?.length, room).toBeGreaterThanOrEqual(3);
      expect(lines.shop_idle?.length, room).toBeGreaterThanOrEqual(30);
      expect(new Set(lines.shop_idle!.map((l) => l.speaker))).toEqual(new Set([ROOM_CREW[room][0]]));
    }
  });

  it('counts as a keeper’s shop, where nobody from home works: the keeper takes the work, greets and talks', () => {
    const anims = parseAnimTable(readFileSync('rules/anim-fallback.yaml', 'utf8'));
    for (const room of ['flowershop', 'bookshop'] as const) {
      expect(isKeptRoom(room), room).toBe(true);
      const t = new Translator(parseRules(readFileSync(`rules/${room}.yaml`, 'utf8')), anims, { brief: 'x' });
      t.room = room;
      t.crew = ROOM_CREW[room];
      const ev = (kind: AiEvent['kind'], agent: AiEvent['agent'] = 'main'): AiEvent => ({ id: 'x', t: 0, kind, agent, plain: '', run: 'r1' });
      const said = [ev('session_start'), ev('plan'), ev('thinking'), ev('subagent_start', 'researcher'), ev('subagent_stop', 'researcher')].flatMap((e) => t.translate(e));
      expect(t.leadOf('r1'), room).toBe(ROOM_CREW[room][0]);
      // From home only Adeng, handing the order over at the counter and going (D3), as at the post office.
      const others = said.filter((c) => c.actor !== ROOM_CREW[room][0]);
      expect(others.map((c) => [c.actor, c.line?.group]), room).toEqual([['adeng', 'dispatch_hand']]);
    }
    expect(isKeptRoom('cafe')).toBe(false);
    expect(isKeptRoom('study')).toBe(false);
    expect(isKeptRoom('bakery')).toBe(true);
  });

  it('keeps every line to the writing rules, in both languages, with the same lines in each', () => {
    for (const room of ['flowershop', 'bookshop'] as const) {
      const zhLib = parseLines(readFileSync(`lines/${room}.yaml`, 'utf8'));
      const enLib = parseLines(readFileSync(`lines/en/${room}.yaml`, 'utf8'));
      expect(lintLines(zhLib, LOCALES['zh-CN']), room).toEqual([]);
      expect(lintLines(enLib, LOCALES.en), room).toEqual([]);
      const ids = (lib: typeof zhLib) => Object.values(lib).flat().map((l) => l.id);
      expect(ids(enLib)).toEqual(ids(zhLib));
      // The keeper says everything: no one from the cafe fills in with the cafe's lines.
      expect(new Set(Object.values(zhLib).flat().map((l) => l.speaker))).toEqual(new Set(ROOM_CREW[room]));
      expect(Object.keys(zhLib)).toEqual(expect.arrayContaining(Object.keys(parseLines(readFileSync('lines/post.yaml', 'utf8')))));
    }
  });
});
