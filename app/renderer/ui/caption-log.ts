import type { ActorId } from '../../shared/types';

export type Caption = { at: number; who: ActorId; text: string };

/** Everything said out loud, newest last, so a line missed in a bubble can be read again (design 9). */
export class CaptionLog {
  private lines: Caption[] = [];

  constructor(private readonly max = 200) {}

  /** Record a line. The same speaker repeating the same words (a bubble re-shown) is kept once. */
  add(who: ActorId, text: string, at: number): Caption | null {
    const clean = text.trim();
    const last = this.lines.at(-1);
    if (!clean || (last && last.who === who && last.text === clean)) return null;
    const caption = { at, who, text: clean };
    this.lines.push(caption);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    return caption;
  }

  all(): readonly Caption[] {
    return this.lines;
  }

  latest(n: number): Caption[] {
    return this.lines.slice(-n);
  }
}
