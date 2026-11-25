import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANCHORS, standPoint, walkBetween } from '../app/renderer/game/layout';
import { hitsFeet } from '../app/renderer/game/path';
import { pieceData, shopArea } from '../app/renderer/game/pieces';
import { STAFF_IDS } from '../app/renderer/game/sprites';
import { OPEN } from '../app/renderer/game/town';
import { lintLines, parseLines } from '../app/renderer/translator/lines';
import { LOCALES } from '../app/shared/i18n';
import { ACTOR_STATES } from '../app/renderer/translator/state-machine';
import { Translator, parseAnimTable, parseRules, resolveAnim } from '../app/renderer/translator/translator';
import { ROOMS, SCENES, cleanRoom, cleanScene } from '../app/shared/scenes';
import { ALL_STAFF, ROOM_CREW, STAFF } from '../app/shared/staff';
import type { ActorId, AiEvent, AnchorId } from '../app/shared/types';

// The shops along the street (road-to-1.4.md D2, plan-1.6.md F1): rooms on the cafe's floor plan, each with a person of its own.

const NEW = ['print', 'studio', 'workshop', 'bakery'] as const;
const WHO = { print: 'aqian', studio: 'xiaozhe', workshop: 'xiaoding', bakery: 'guiyi' } as const;
const read = (p: string) => readFileSync(p, 'utf8');
const cafeRules = parseRules(read('rules/cafe.yaml'));
const anims = parseAnimTable(read('rules/anim-fallback.yaml'));

describe('the rooms', () => {
  it('are the cafe, the study and the shops along the street; only the first two can be the home shop', () => {
    expect(ROOMS).toEqual(['cafe', 'study', 'print', 'studio', 'workshop', 'bakery']);
    expect(SCENES).toEqual(['cafe', 'study']);
    for (const r of NEW) {
      expect(cleanRoom(r)).toBe(r);
      expect(cleanScene(r)).toBeUndefined();
    }
    expect(cleanRoom('post')).toBeUndefined();
  });

  it('can be gone into from the street, the bakery too (plan-1.6.md F1); the post office stays shut', () => {
    for (const r of ROOMS) expect(OPEN.has(r)).toBe(true);
    expect(OPEN.has('bakery')).toBe(true);
    expect(OPEN.has('post')).toBe(false);
  });

  it('each new shop has its own person; Adeng only comes in with an order and goes home again (D3)', () => {
    for (const r of NEW) expect(ROOM_CREW[r]).toEqual([WHO[r]]);
    for (const r of SCENES) expect(ROOM_CREW[r]).toEqual([...STAFF, 'cat']);
    expect(ALL_STAFF).toEqual([...STAFF, 'aqian', 'xiaozhe', 'xiaoding', 'guiyi']);
  });

  it('loads a sprite sheet for everyone who stands in a room', () => {
    for (const r of ROOMS) for (const a of ROOM_CREW[r]) if (a !== 'cat') expect(STAFF_IDS, `${r}: ${a}`).toContain(a);
  });
});

describe('the room on screen (road-to-1.4.md D2, second half)', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((f) => (f.isDirectory() ? files(join(dir, f.name)) : f.name.endsWith('.ts') ? [join(dir, f.name)] : []));

  it('is never read from the page: each room is built knowing which it is, so going in needs no reload', () => {
    expect(files('app').filter((f) => /currentScene|lamplightScene/.test(read(f)))).toEqual([]);
  });
});

describe.each(NEW)('the %s', (room) => {
  const rules = parseRules(read(`rules/${room}.yaml`));
  const steps = rules.flatMap((r) => [r, ...(r.extra ?? [])]);
  const lines = { zh: parseLines(read(`lines/${room}.yaml`)), en: parseLines(read(`lines/en/${room}.yaml`)) };
  const base = { zh: parseLines(read('lines/cafe.yaml')), en: parseLines(read('lines/en/cafe.yaml')) };

  it('answers every event the cafe answers', () => {
    const kinds = (rs: typeof rules) => new Set(rs.map((r) => r.on));
    expect([...kinds(cafeRules)].filter((k) => !kinds(rules).has(k))).toEqual([]);
  });

  it('gives the work to its own person, and commands nobody who is not in the room', () => {
    // Adeng only comes in with the order and goes again (D3).
    for (const r of rules) for (const s of [r, ...(r.extra ?? [])]) {
      if (s.actor === 'adeng') expect([r.on, s.leave], room).toEqual(['session_start', true]);
      else expect(ROOM_CREW[room], `${s.actor}`).toContain(s.actor);
    }
    const WORK: AiEvent['kind'][] = ['plan', 'thinking', 'tool_start', 'tool_ok', 'tool_fail', 'subagent_start', 'subagent_stop'];
    const work = rules.filter((r) => WORK.includes(r.on as AiEvent['kind']));
    expect(work.length).toBeGreaterThan(0);
    expect(work.filter((r) => r.actor !== WHO[room]).map((r) => r.on)).toEqual([]);
  });

  it('has every line group its rules use, in both languages, with three lines at least', () => {
    for (const s of steps) {
      if (!s.lines) continue;
      for (const lang of ['zh', 'en'] as const) {
        // A shop's lines are laid over the cafe's (stage/rulebook.ts).
        const group = lines[lang][s.lines] ?? base[lang][s.lines];
        expect(group, `${lang} ${s.lines}`).toBeDefined();
        expect(group.length, `${lang} ${s.lines}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('passes every writing rule, in both languages', () => {
    expect(lintLines(lines.zh, LOCALES['zh-CN'])).toEqual([]);
    expect(lintLines(lines.en, LOCALES.en)).toEqual([]);
  });

  it('lets only those in the room speak', () => {
    for (const lib of [lines.zh, lines.en]) {
      for (const line of Object.values(lib).flat()) {
        expect(ROOM_CREW[room], line.id).toContain(line.speaker);
        if (line.reply) expect(ROOM_CREW[room], line.id).toContain(line.reply.speaker);
      }
    }
  });

  it('knows every state and has the art for every animation', () => {
    for (const s of steps) {
      expect(ACTOR_STATES).toContain(s.state);
      if (s.anim) expect(anims.staff.available, `${s.actor}:${s.anim}`).toContain(resolveAnim(anims, s.actor as ActorId, s.anim).anim);
    }
  });

  it('sends its own person on every errand, and names them on the parcel and when one has to wait', () => {
    const t = new Translator(rules, anims, { brief: 'x' });
    t.crew = ROOM_CREW[room];
    const ev = (over: Partial<AiEvent>): AiEvent => ({ id: 'x', t: 0, kind: 'tool_start', agent: 'main', plain: '', run: 'r1', ...over });
    for (const agent of ['researcher', 'designer', 'reviewer', 'unknown'] as const) {
      t.translate(ev({ kind: 'subagent_start', agent }));
      expect(t.helpersOf(agent), agent).toEqual([WHO[room]]);
      const waits = t.translate(ev({ kind: 'subagent_start', agent, run: 'r2' })).find((c) => c.line?.group === 'sub_queue');
      expect(waits?.line?.vars?.who, agent).toBe(LOCALES['zh-CN'].actors[WHO[room]]);
      t.translate(ev({ kind: 'subagent_stop', agent, target: 'done' }));
      expect(t.returned, agent).toBe(WHO[room]);
      t.translate(ev({ kind: 'subagent_stop', agent, target: 'done', run: 'r2' }));
    }
  });

  it('has the pieces the game leans on', () => {
    for (const name of ['counter', 'table']) expect(pieceData(room).pieces.map((p) => p.name)).toContain(name);
  });

  it('stands everyone at every place on the floor, clear of the furniture, and walks from each place to every other', () => {
    const area = shopArea(room);
    const places = Object.keys(ANCHORS) as AnchorId[];
    const trouble: string[] = [];
    for (const actor of ROOM_CREW[room]) {
      for (const from of places) {
        const a = standPoint(from, actor, room);
        // A seat with a chair is in the chair, as in the cafe.
        if (!a.chair && area.obstacles.some((o) => hitsFeet(a, o))) trouble.push(`${actor} at ${from} stands in the furniture`);
        for (const to of places) {
          const path = walkBetween(a, standPoint(to, actor, room), room);
          if (path.length === 0 && from !== to) trouble.push(`${actor} cannot walk ${from} -> ${to}`);
        }
      }
    }
    expect(trouble).toEqual([]);
  });
});
