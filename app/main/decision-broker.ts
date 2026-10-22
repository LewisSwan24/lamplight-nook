import type { DecisionAnswer, DecisionRequest } from '../shared/types';

/**
 * Round trip for decisions only the user can make. A request is sent to the renderer and the
 * returned promise stays pending until the user answers. There is no timeout: if the user is away,
 * the task simply waits.
 */
export class DecisionBroker {
  private seq = 0;
  private pending = new Map<string, { req: DecisionRequest; resolve: (choice: string) => void }>();

  /** Told about every answer the user gives (not the automatic ones from cancelAll). */
  onAnswered?: (req: DecisionRequest, choice: string) => void;

  constructor(private send: (req: DecisionRequest) => void) {}

  ask(req: Omit<DecisionRequest, 'id'>): Promise<string> {
    const full = { ...req, id: `d${++this.seq}` };
    return new Promise((resolve) => {
      this.pending.set(full.id, { req: full, resolve });
      this.send(full);
    });
  }

  /** Deliver the user's answer. Unknown ids and choices that weren't offered are ignored. */
  answer({ id, choice }: DecisionAnswer): boolean {
    const p = this.pending.get(id);
    if (!p || !p.req.options.some((o) => o.id === choice)) return false;
    this.pending.delete(id);
    this.onAnswered?.(p.req, choice);
    p.resolve(choice);
    return true;
  }

  /** Refuse everything still waiting (the app is closing or the commission was cancelled). */
  cancelAll() {
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      p.resolve(p.req.defaultId === 'allow' ? 'deny' : p.req.defaultId);
    }
  }

  get waiting() {
    return this.pending.size;
  }
}
