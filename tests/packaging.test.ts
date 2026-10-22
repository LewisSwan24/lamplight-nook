import { describe, expect, it } from 'vitest';
import { unpackedBinary } from '../app/main/agent-runner';

describe('packaged Claude Code binary', () => {
  it('points into app.asar.unpacked when the SDK sits inside the archive', () => {
    const dir = '/opt/Lamplight Nook/resources/app.asar/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64';
    expect(unpackedBinary(dir, 'win32')).toBe(
      '/opt/Lamplight Nook/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
    );
  });

  it('leaves development installs to the SDK', () => {
    expect(unpackedBinary('/home/dev/lamplight-nook/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64', 'linux')).toBeUndefined();
  });
});
