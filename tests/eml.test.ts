import { describe, expect, it } from 'vitest';
import { draftEml, EmlError } from '../app/main/eml';

const at = new Date(Date.UTC(2026, 10, 20, 8, 30));
/** The header block, unfolded, as name -> value; and the body decoded. */
function read(eml: string) {
  const [head, body] = eml.split('\r\n\r\n');
  const headers = new Map(head.replace(/\r\n[ \t]/g, ' ').split('\r\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()] as [string, string]));
  return { head, headers, body: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') };
}
const decodeWords = (v: string) => v.split(' ').map((w) => /^=\?UTF-8\?B\?(.*)\?=$/.exec(w)).map((m) => Buffer.from(m![1], 'base64')).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)).toString('utf8');

describe('an email draft the shop writes, never sends (road-to-1.3.md C5)', () => {
  it('is a plain-text message Outlook opens as an unsent draft', () => {
    const { head, headers, body } = read(draftEml({ to: ['ann@example.org', 'bo@example.cn'], subject: 'Book club on Saturday', body: 'Dear all,\nSee you at 3.\n', date: at }));
    expect(headers.get('To')).toBe('ann@example.org, bo@example.cn');
    expect(headers.get('Subject')).toBe('Book club on Saturday');
    expect(headers.get('X-Unsent')).toBe('1');
    expect(headers.get('MIME-Version')).toBe('1.0');
    expect(headers.get('Content-Type')).toBe('text/plain; charset=UTF-8');
    expect(headers.get('Content-Transfer-Encoding')).toBe('base64');
    expect(headers.get('Date')).toBe('Fri, 20 Nov 2026 08:30:00 +0000');
    expect(head).not.toMatch(/^From:/m);
    expect(body).toBe('Dear all,\r\nSee you at 3.\r\n');
  });

  it('encodes a Chinese subject in words short enough for any mail program, never splitting a character', () => {
    const subject = '周末读书会：这周六下午三点在河边公园见，记得带一本你最近在读的书和一块野餐垫';
    const { head, headers } = read(draftEml({ to: [], subject, body: '正文', date: at }));
    expect(decodeWords(headers.get('Subject')!)).toBe(subject);
    for (const line of head.split('\r\n')) expect(line.length, line).toBeLessThanOrEqual(78);
    expect(headers.has('To')).toBe(false);
  });

  it('lets nothing in a subject or an address start a header of its own', () => {
    const { head, headers } = read(draftEml({ to: [], subject: 'Hi\r\nBcc: someone@example.com', body: 'x', date: at }));
    expect(head).not.toMatch(/^Bcc:/m);
    expect(headers.get('Subject')).toBe('Hi Bcc: someone@example.com');
    for (const bad of ['ann@example.org\r\nBcc: x@y.z', 'not an address', 'Ann <ann@example.org>', 'a@b']) {
      expect(() => draftEml({ to: [bad], subject: 's', body: 'b', date: at }), bad).toThrow(EmlError);
    }
  });
});
