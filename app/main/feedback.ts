import { fill, strings } from '../shared/i18n';
import { SUPPORT } from '../shared/support';

/** Where people write to (also on the website and the store page). */
export const SUPPORT_EMAIL = SUPPORT;

export type FeedbackFacts = {
  version: string;
  /** e.g. "Windows 10.0.22631"; only the system and its version, nothing that names the person. */
  os: string;
  /** The diagnostics file the user exported for this letter, if any; only its name goes in the letter. */
  diagnostics?: string;
};

/**
 * The letter the user's own mail program opens with: our address, a subject, and a body that is mostly
 * room for them to write. The app sends nothing itself; the person reads it, attaches the diagnostics
 * file if they want to, and presses send in their mail program.
 */
export function feedbackMail(f: FeedbackFacts): { to: string; subject: string; body: string } {
  const S = strings.ui.setup;
  const lines = [S.mailPrompt, '', '', '——', fill(S.mailFooter, { version: f.version, os: f.os, lang: strings.app.languageName })];
  // The file name only: the folder above it usually carries the person's name (either separator, any system).
  if (f.diagnostics) lines.push(fill(S.mailDiag, { file: f.diagnostics.split(/[\\/]/).pop() ?? '' }));
  return { to: SUPPORT_EMAIL, subject: fill(S.mailSubject, { version: f.version }), body: lines.join('\n') };
}

/** A mailto: link for that letter. Line breaks become CRLF, as RFC 6068 asks. */
export function mailtoUrl(mail: { to: string; subject: string; body: string }): string {
  const q = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  return `mailto:${mail.to}?subject=${q(mail.subject)}&body=${q(mail.body)}`;
}

/** "win32" + "10.0.22631" -> "Windows 10.0.22631". */
export function osName(platform: string, release: string): string {
  const name = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform;
  return `${name} ${release}`;
}
