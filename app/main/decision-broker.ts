import type { DecisionAnswer, DecisionRequest, RunProject } from '../shared/types';

/** What may ask the user: the broker itself, or one round's view of it. */
export type Asker = { ask(req: Omit<DecisionRequest, 'id'>): Promise<string> };
type Heard = (req: DecisionRequest, choice: string) => void;
/** Where the user answered: at the computer, or on a paired phone (docs/plan-1.5.md E4). */
export type AnsweredOn = 'desk' | 'phone';
/** How a request left: answered on one side, or refused on its own when its round ended. */
export type Settled = (req: DecisionRequest, choice: string, by: AnsweredOn | 'refused') => void;

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

  /** `settled`: told about every answer the user gives, and where, so the other side can put its card away. */
  constructor(private send: (req: DecisionRequest) => void, private settled?: Settled) {}

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

  /**
   * Deliver the user's answer. Unknown ids and choices that weren't offered are ignored, and so is the second of two
   * answers. A serious step is only ever answered at the computer.
   */
  answer({ id, choice }: DecisionAnswer, by: AnsweredOn = 'desk'): boolean {
    const p = this.pending.get(id);
    if (!p || !p.req.options.some((o) => o.id === choice)) return false;
    if (by === 'phone' && p.req.kind === 'serious') return false;
    this.pending.delete(id);
    this.settled?.(p.req, choice, by);
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
      const choice = p.req.defaultId === 'allow' ? 'deny' : p.req.defaultId;
      this.settled?.(p.req, choice, 'refused');
      p.resolve(choice);
    }
  }

  /** What still waits for an answer, oldest first. */
  open(): DecisionRequest[] {
    return [...this.pending.values()].map((p) => p.req);
  }

  get waiting() {
    return this.pending.size;
  }

  /** Requests one round is waiting on. */
  waitingOn(run: string) {
    return [...this.pending.values()].filter((p) => p.req.run === run).length;
  }
}
