import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AFTER_WORK_MS, FIRST_VISIT_MS, GUEST_IDS, VISIT_GAP_MS, VisitPlanner, pickVisit, welcomeGuests } from '../app/renderer/game/guests';
import { Chatter } from '../app/renderer/stage/chatter';
import { lintChats, parseChats } from '../app/renderer/translator/lines';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const chats = parseChats(readFileSync('lines/chats.yaml', 'utf8'));
const everyone = () => true;

const nothing = { made: {}, done: 0 };

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
    const rain = pickVisit(chats, 'postman', { sky: 'rain', holiday: null, season: 'summer' }, 'day', everyone, used, nothing, seeded(5));
    expect(rain?.id).toBe('postman_rain');
    const noLaoshi = (who: string) => who !== 'laoshi';
    for (let i = 0; i < 20; i++) {
      const v = pickVisit(chats, 'postman', { sky: 'clear', holiday: null, season: 'summer' }, 'day', noLaoshi, used, nothing, seeded(i));
      expect(v?.guest).toBe('postman');
      expect(v?.turns.some((t) => t.speaker === 'laoshi')).toBe(false);
    }
    const dawn = pickVisit(chats, 'baker', { sky: 'clear', holiday: null, season: 'summer' }, 'dawn', everyone, new Set(), nothing, seeded(6));
    expect(dawn?.id).toBe('baker_fresh');
  });

  it('goes through every visit before repeating one', () => {
    const used = new Set<string>();
    const everyday = chats.filter((c) => c.guest === 'baker' && !c.sky && !c.holiday && !c.period && !c.made && !c.mentions && !c.season && c.after === undefined);
    const ids = everyday.map((_, i) => pickVisit(chats, 'baker', { sky: 'clear', holiday: null, season: 'summer' }, 'day', everyone, used, nothing, seeded(i + 10))!.id);
    expect(new Set(ids).size).toBe(everyday.length);
  });
});

describe('neighbours who remember what the shop made', () => {
  const chat = (id: string, extra: object) => ({ id, when: 'idle' as const, guest: 'baker' as const, turns: [{ speaker: 'baker' as const, text: 'x' }, { speaker: 'adeng' as const, text: 'y' }], ...extra });
  const plain = chat('plain', {});
  const website = chat('website', { made: 'page' });
  const asks = chat('asks', { mentions: true });
  const pick = (shop: { made: Record<string, number>; lastWork?: string }) => pickVisit([plain, website, asks], 'baker', { sky: 'clear', holiday: null, season: 'summer' }, 'day', () => true, new Set(), { done: 0, ...shop }, () => 0)?.id;

  it('asks about a kind of work only once the shop has done it, and asks first', () => {
    expect(pick({ made: {} })).toBe('plain');
    expect(pick({ made: { page: 1 } })).toBe('website');
  });

  it('mentions the last work only when there is one', () => {
    expect(pick({ made: {}, lastWork: '记账页' })).toBe('asks');
  });
});

describe('new neighbours, who come because of the work', () => {
  it('has only the old friends until a kind of work brings someone', () => {
    expect(welcomeGuests({})).toEqual(['baker', 'postman']);
    expect(welcomeGuests({ page: 1 })).toEqual(['baker', 'postman', 'mechanic']);
    expect(welcomeGuests({ album: 2 })).toEqual(['baker', 'postman', 'granny']);
    expect(welcomeGuests({ research: 1 })).toEqual(['baker', 'postman', 'student']);
    expect(welcomeGuests({ letter: 5, sheet: 5 })).toEqual(['baker', 'postman']);
    // The bakery's two kinds (plan-1.6.md F1): Old Ma from the noodle bar comes for a menu, Lin from upstairs for a recipe.
    expect(welcomeGuests({ menu: 1 })).toEqual(['baker', 'postman', 'cook']);
    expect(welcomeGuests({ recipe: 1, page: 1 })).toEqual(['baker', 'postman', 'mechanic', 'lodger']);
    // The post office's (plan-1.6.md F2): Fern from the flower shop for a card, Mrs Wu from the residents' committee for a newsletter.
    expect(welcomeGuests({ card: 1, newsletter: 1 })).toEqual(['baker', 'postman', 'florist', 'organizer']);
  });

  it('only sends those who are welcome, and someone new soon after they are', () => {
    const v = new VisitPlanner(0, seeded(4));
    const who: string[] = [];
    for (let t = 0; t < 12 * VISIT_GAP_MS[1]; t += 5000) {
      const g = v.next(t, true, 'day', ['baker', 'postman', 'mechanic']);
      if (g) who.push(g);
    }
    expect(new Set(who)).toEqual(new Set(['baker', 'postman', 'mechanic']));
    expect(who.slice(0, 3).sort()).toEqual(['baker', 'mechanic', 'postman']);
  });

  it('gives every neighbour a name, a word and things to say, in both languages', () => {
    for (const [locale, file] of [['zh-CN', 'lines/chats.yaml'], ['en', 'lines/en/chats.yaml']] as const) {
      const L = JSON.parse(readFileSync(`locales/${locale}.json`, 'utf8'));
      const all = parseChats(readFileSync(file, 'utf8'));
      for (const g of GUEST_IDS) {
        expect(L.guests[g], `${locale} ${g}`).toBeTruthy();
        expect(L.ui.objects.guest[g], `${locale} ${g}`).toBeTruthy();
        expect(all.filter((c) => c.guest === g).length, `${file} ${g}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('what neighbours talk about after the twentieth', () => {
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
  const NEW_FESTIVALS = ['lantern', 'dragon_boat', 'mid_autumn'] as const;
  const visit = (all: typeof chats, guest: (typeof GUEST_IDS)[number], outside: { sky: 'clear'; holiday: (typeof NEW_FESTIVALS)[number] | null; season: (typeof SEASONS)[number] }, done: number, used = new Set<string>()) =>
    pickVisit(all, guest, outside, 'day', everyone, used, { made: {}, done }, seeded(done))!;

  it('brings each neighbour something new for every season, in both languages', () => {
    for (const file of ['lines/chats.yaml', 'lines/en/chats.yaml']) {
      const all = parseChats(readFileSync(file, 'utf8'));
      for (const guest of GUEST_IDS) {
        for (const season of SEASONS) {
          const topical = all.filter((c) => c.guest === guest && c.season === season);
          expect(topical.length, `${file} ${guest} ${season}`).toBeGreaterThan(0);
          for (const c of topical) expect(c.after, c.id).toBe(20);
        }
      }
    }
  });

  it('keeps the season to itself and to a shop past twenty', () => {
    for (const season of SEASONS) {
      const later = visit(chats, 'baker', { sky: 'clear', holiday: null, season }, 20);
      expect(later.season, season).toBe(season);
      const earlier = visit(chats, 'baker', { sky: 'clear', holiday: null, season }, 19);
      expect(earlier.season, season).toBeUndefined();
      expect(earlier.after ?? 0).toBeLessThan(20);
    }
  });

  it('turns over the topics as the seasons go round, without repeating within one', () => {
    const used = new Set<string>();
    const heard = SEASONS.map((season) => visit(chats, 'postman', { sky: 'clear', holiday: null, season }, 40, used).id);
    expect(new Set(heard).size).toBe(4);
  });

  it('has the old friends greet the new festivals, in both languages, and the festival comes first', () => {
    for (const file of ['lines/chats.yaml', 'lines/en/chats.yaml']) {
      const all = parseChats(readFileSync(file, 'utf8'));
      for (const holiday of NEW_FESTIVALS) {
        for (const guest of ['baker', 'postman'] as const) {
          expect(all.some((c) => c.guest === guest && c.holiday === holiday), `${file} ${guest} ${holiday}`).toBe(true);
          const season = holiday === 'dragon_boat' ? 'summer' : holiday === 'mid_autumn' ? 'autumn' : 'winter';
          expect(visit(all, guest, { sky: 'clear', holiday, season }, 30).holiday, `${file} ${guest} ${holiday}`).toBe(holiday);
        }
      }
    }
  });

  it('only lets neighbours talk about the season', () => {
    const staff = parseChats(`
- id: staff_season
  when: idle
  season: spring
  turns:
    - adeng: 春天了。
    - xiaoju: 嗯。
`);
    expect(lintChats(staff)).toHaveLength(1);
  });
});
