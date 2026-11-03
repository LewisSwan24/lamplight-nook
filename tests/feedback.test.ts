import { describe, expect, it } from 'vitest';
import { SUPPORT_EMAIL, feedbackMail, mailtoUrl, osName } from '../app/main/feedback';
import { strings } from '../app/shared/i18n';

describe('write to us', () => {
  it('fills in our address, a subject with the version, and a body that is mostly room to write', () => {
    const mail = feedbackMail({ version: '0.9.0', os: 'Windows 10.0.22631' });
    expect(mail.to).toBe(SUPPORT_EMAIL);
    expect(mail.subject).toContain('0.9.0');
    expect(mail.body.startsWith(strings.ui.setup.mailPrompt)).toBe(true);
    expect(mail.body).toContain('Windows 10.0.22631');
    expect(mail.body).toContain(strings.app.languageName);
  });

  it('names the diagnostics file but never its folder, which usually carries the person\'s name', () => {
    const mail = feedbackMail({ version: '0.9.0', os: 'Windows 10', diagnostics: 'C:\\Users\\lin\\Desktop\\lamplight-diagnostics-202611031230.zip' });
    expect(mail.body).toContain('lamplight-diagnostics-202611031230.zip');
    expect(mail.body).not.toContain('lin');
    expect(mail.body).not.toContain('Desktop');
    const posix = feedbackMail({ version: '0.9.0', os: 'Linux 6', diagnostics: '/home/lin/lamplight-diagnostics-1.zip' });
    expect(posix.body).not.toContain('/home/lin');
  });

  it('makes a mailto link with every part encoded and CRLF line breaks', () => {
    const url = mailtoUrl({ to: 'a@b.c', subject: 'Hi & bye?', body: 'line one\nline two' });
    expect(url).toBe('mailto:a@b.c?subject=Hi%20%26%20bye%3F&body=line%20one%0D%0Aline%20two');
    expect(decodeURIComponent(url.split('body=')[1])).toBe('line one\r\nline two');
  });

  it('names the system plainly', () => {
    expect(osName('win32', '10.0.22631')).toBe('Windows 10.0.22631');
    expect(osName('darwin', '24.1.0')).toBe('macOS 24.1.0');
  });
});
