import { localDay } from '../shared/localday';
import { AGENT_ACTOR } from '../shared/staff';
import type { ActorId, AiEvent, RoundStat } from '../shared/types';

/**
 * How one round went, counted from the events as they pass: errands by helper, and the ones that waited
 * because their helper was still out on another (the shop plays one errand per helper at a time).
 */
export class RoundTally {
  private helpers: RoundStat['helpers'] = {};
  /** When each errand still waiting for its helper was sent, per helper. */
  private queued = new Map<ActorId, number[]>();
  private busy = new Map<ActorId, number>();
  private waits = 0;
  private waitedMs = 0;

  constructor(private readonly started: number) {}

  see(e: AiEvent) {
    if (e.kind === 'session_start') {
      this.busy.clear();
      this.queued.clear();
      return;
    }
    if (e.kind !== 'subagent_start' && e.kind !== 'subagent_stop') return;
    const actor = AGENT_ACTOR[e.agent];
    const n = this.busy.get(actor) ?? 0;
    if (e.kind === 'subagent_start') {
      this.helpers[e.agent] = (this.helpers[e.agent] ?? 0) + 1;
      if (n > 0) {
        this.waits++;
        this.queued.set(actor, [...(this.queued.get(actor) ?? []), e.t]);
      }
      this.busy.set(actor, n + 1);
      return;
    }
    this.busy.set(actor, Math.max(0, n - 1));
    const next = this.queued.get(actor)?.shift();
    if (next !== undefined) this.waitedMs += e.t - next;
  }

  result(now: number, ok: boolean, failure?: string, day = new Date(now)): RoundStat {
    return {
      date: localDay(day),
      seconds: Math.round((now - this.started) / 1000),
      ...(ok || !failure ? {} : { failure }),
      helpers: { ...this.helpers },
      waits: this.waits,
      waitedSeconds: Math.round(this.waitedMs / 1000),
    };
  }
}
