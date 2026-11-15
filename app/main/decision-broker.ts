import type { DecisionAnswer, DecisionRequest, RunProject } from '../shared/types';

/** What may ask the user: the broker itself, or one round's view of it. */
export type Asker = { ask(req: Omit<DecisionRequest, 'id'>): Promise<string> };
type Heard = (req: DecisionRequest, choice: string) => void;

/**
 * Round trip for decisions only the user can make. A request is sent to the renderer and the
 * returned promise stays pending until the user answers. There is no timeout: if the user is away,
 * the task simply waits. With two rounds at once (road-to-1.2.md B5) each request carries its round,
 * and each answer is told to that round only.
 */
export class DecisionBroker implements Asker {
  private seq = 0;
  private pending = new Map<string, { req: DecisionRequest; resolve: (choice: string) => void }>();
  /** Told about every answer the user gives (not the automatic ones from cancelAll), by round. */
  private heard = new Map<string, Heard>();

  constructor(private send: (req: DecisionRequest) => void) {}

  ask(req: Omit<DecisionRequest, 'id'>): Promise<string> {
    const full = { ...req, id: `d${++this.seq}` };
    return new Promise((resolve) => {
      this.pending.set(full.id, { req: full, resolve });
      this.send(full);
    });
  }

  /** One round's way of asking: its requests carry its run id and project. */
  forRun(run: string, project?: RunProject): Asker {
    return { ask: (req) => this.ask({ ...req, run, ...(project ? { project } : {}) }) };
  }

  /** Hear the user's answers to one round's requests (for the notebook). */
  listen(run: string, fn: Heard) {
    this.heard.set(run, fn);
  }

  /** A round has ended: it hears nothing more, and what it still waits for is refused. */
  forget(run: string) {
    this.heard.delete(run);
    this.refuse((req) => req.run === run);
  }

  /** Deliver the user's answer. Unknown ids and choices that weren't offered are ignored. */
  answer({ id, choice }: DecisionAnswer): boolean {
    const p = this.pending.get(id);
    if (!p || !p.req.options.some((o) => o.id === choice)) return false;
    this.pending.delete(id);
    if (p.req.run) this.heard.get(p.req.run)?.(p.req, choice);
    p.resolve(choice);
    return true;
  }

  /** Refuse everything still waiting (the app is closing or the commission was cancelled). */
  cancelAll() {
    this.refuse(() => true);
  }

  private refuse(which: (req: DecisionRequest) => boolean) {
    for (const [id, p] of this.pending) {
      if (!which(p.req)) continue;
      this.pending.delete(id);
      p.resolve(p.req.defaultId === 'allow' ? 'deny' : p.req.defaultId);
    }
  }

  get waiting() {
    return this.pending.size;
  }

  /** Requests one round is waiting on. */
  waitingOn(run: string) {
    return [...this.pending.values()].filter((p) => p.req.run === run).length;
  }
}
