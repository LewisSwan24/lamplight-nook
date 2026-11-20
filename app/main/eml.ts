/**
 * An email draft as a file (road-to-1.3.md C5): plain text in UTF-8, with X-Unsent: 1 so Outlook opens it as a draft
 * the user reads, changes and sends themselves. Nothing here ever sends anything, and no mailbox is connected.
 */

/** A recipient that is not a plain address. The message is for Claude. */
export class EmlError extends Error {}

/** A plain address, nothing else: no name, no brackets, no line break. */
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
/** Bytes of UTF-8 per encoded word: its base64 is 48 characters, so "Subject: " and one word fit a 78-character line. */
const WORD_BYTES = 36;
const MAX_SUBJECT = 300;

/** A subject on one line, as is when it is short plain ASCII, else as UTF-8 encoded words, one per folded line. */
function subjectHeader(subject: string): string {
  const flat = subject.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_SUBJECT);
  if (/^[\x20-\x7e]*$/.test(flat) && flat.length <= 68) return `Subject: ${flat}`;
  const words: string[] = [];
  let chunk = '';
  for (const ch of flat) {
    if (Buffer.byteLength(chunk + ch) > WORD_BYTES) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return `Subject: ${words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ')}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
const mailDate = (d: Date) => `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`;

/** The draft's bytes as text: headers, a blank line, the body in base64. Throws EmlError for a recipient that is not a plain address. */
export function draftEml({ to, subject, body, date = new Date() }: { to: string[]; subject: string; body: string; date?: Date }): string {
  for (const a of to) if (!ADDRESS.test(a)) throw new EmlError(`"${a}" is not a plain email address (like name@example.com, nothing around it).`);
  const text = body.replace(/\r\n|\r|\n/g, '\r\n');
  const b64 = Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n').replace(/\r\n$/, '');
  return [
    ...(to.length ? [`To: ${to.join(', ')}`] : []),
    subjectHeader(subject),
    `Date: ${mailDate(date)}`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '',
  ].join('\r\n');
}
