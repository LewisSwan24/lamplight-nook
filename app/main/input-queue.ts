import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * The user's side of a running commission, fed to the SDK as streaming input: the opening prompt, then
 * anything added in a meeting. The SDK keeps the session open while this is open, so after each result
 * the queue closes itself unless more work turns up within a short grace period.
 */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closing: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  /** Queue a message. Returns false once the commission has wrapped up (too late to add anything). */
  push(text: string, priority?: SDKUserMessage['priority']): boolean {
    if (this.closed) return false;
    this.stay();
    this.items.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, ...(priority ? { priority } : {}) });
    this.wake?.();
    return true;
  }

  /** A turn finished: close after `graceMs` unless something new arrives (see stay / push). */
  closeSoon(graceMs: number) {
    if (this.closed || this.items.length) return;
    this.stay();
    this.closing = setTimeout(() => this.close(), graceMs);
  }

  /** The agent is still busy (another message came in): don't close yet. */
  stay() {
    if (this.closing) clearTimeout(this.closing);
    this.closing = null;
  }

  close() {
    this.stay();
    this.closed = true;
    this.wake?.();
  }

  get isClosed() {
    return this.closed;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    while (true) {
      const next = this.items.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
  }
}
