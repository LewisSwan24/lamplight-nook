import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AFTER_WORK_MS, FIRST_VISIT_MS, GUEST_PATH, GUEST_SPOT, VISIT_GAP_MS, VisitPlanner, pickVisit } from '../app/renderer/game/guests';
import { ZONES } from '../app/renderer/game/layout';
import { Chatter } from '../app/renderer/stage/chatter';
import { lintChats, parseChats } from '../app/renderer/translator/lines';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const chats = parseChats(readFileSync('lines/chats.yaml', 'utf8'));
const everyone = () => true;

describe('neighbours dropping in', () => {
  it('waits a while after opening, then comes every so often, never after dark', () => {
    const v = new VisitPlanner(0, seeded(1));
    expect(v.next(FIRST_VISIT_MS[0] - 1, true, 'day')).toBeNull();
    expect(v.next(FIRST_VISIT_MS[1], true, 'night')).toBeNull();
    const first = v.next(FIRST_VISIT_MS[1], true, 'day');
    expect(first).not.toBeNull();
    expect(v.next(FIRST_VISIT_MS[1] + VISIT_GAP_MS[0] - 1, true, 'day')).toBeNull();
    expect(v.next(FIRST_VISIT_MS[1] + VISIT_GAP_MS[1], true, 'dusk')).not.toBeNull();
  });

  it('leaves the shop alone while it works, and for a bit after', () => {
    const v = new VisitPlanner(0, seeded(2));
    const t = FIRST_VISIT_MS[1];
    expect(v.next(t, false, 'day')).toBeNull();
    expect(v.next(t + AFTER_WORK_MS - 1, true, 'day')).toBeNull();
    expect(v.next(t + AFTER_WORK_MS, true, 'day')).not.toBeNull();
  });

  it('mostly takes turns', () => {
    const v = new VisitPlanner(0, seeded(3));
    const who: string[] = [];
    for (let t = 0; t < 40 * VISIT_GAP_MS[1]; t += 5000) {
      const g = v.next(t, true, 'day');
      if (g) who.push(g);
    }
    const switches = who.slice(1).filter((g, i) => g !== who[i]).length;
    expect(new Set(who)).toEqual(new Set(['baker', 'postman']));
    expect(switches / (who.length - 1)).toBeGreaterThan(0.6);
  });

  it('walks in from the door to the counter end without crossing the counter', () => {
    const counter = ZONES.find((z) => z.id === 'counter')!;
    for (const p of GUEST_PATH) expect(p.x > counter.x + counter.w || p.y > counter.y + counter.h).toBe(true);
    expect(GUEST_PATH.at(-1)).toEqual(GUEST_SPOT);
  });
});

describe('what neighbours say', () => {
  it('follow the writing rules, open with the guest and bring nobody else along', () => {
    expect(lintChats(chats)).toEqual([]);
    const bad = parseChats(`
- id: wrong_opener
  when: idle
  guest: baker
  turns:
    - adeng: 桂姨来了。
    - baker: 嗯。
- id: stray_guest
  when: idle
  turns:
    - postman: 有信。
    - adeng: 谢谢。
`);
    expect(lintChats(bad)).toHaveLength(2);
  });

  it('are never everyday small talk', () => {
    const c = new Chatter(chats, [], 0, seeded(4));
    for (let t = 1; t < 200; t++) {
      const talk = c.next('idle', t * 130_000, 'dawn', { sky: 'rain', holiday: 'christmas' });
      if (talk?.kind === 'chat') expect(chats.find((x) => x.id === talk.id)!.guest).toBeUndefined();
    }
  });

  it('picks a visit for the day, only with staff who are in', () => {
    const used = new Set<string>();
    const rain = pickVisit(chats, 'postman', { sky: 'rain', holiday: null }, 'day', everyone, used, seeded(5));
    expect(rain?.id).toBe('postman_rain');
    const noLaoshi = (who: string) => who !== 'laoshi';
    for (let i = 0; i < 20; i++) {
      const v = pickVisit(chats, 'postman', { sky: 'clear', holiday: null }, 'day', noLaoshi, used, seeded(i));
      expect(v?.guest).toBe('postman');
      expect(v?.turns.some((t) => t.speaker === 'laoshi')).toBe(false);
    }
    const dawn = pickVisit(chats, 'baker', { sky: 'clear', holiday: null }, 'dawn', everyone, new Set(), seeded(6));
    expect(dawn?.id).toBe('baker_fresh');
  });

  it('goes through every visit before repeating one', () => {
    const used = new Set<string>();
    const everyday = chats.filter((c) => c.guest === 'baker' && !c.sky && !c.holiday && !c.period);
    const ids = everyday.map((_, i) => pickVisit(chats, 'baker', { sky: 'clear', holiday: null }, 'day', everyone, used, seeded(i + 10))!.id);
    expect(new Set(ids).size).toBe(everyday.length);
  });
});
