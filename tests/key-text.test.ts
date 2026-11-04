import { describe, expect, it } from 'vitest';
import { keyTextParts } from '../app/renderer/ui/key-text';

describe('text that names a key', () => {
  it('marks the key part, so a line cannot break inside it', () => {
    expect(keyTextParts("It should start with sk-ant-.")).toEqual([
      { text: 'It should start with ', key: false },
      { text: 'sk-ant-.', key: true },
    ]);
  });

  it('finds a masked key in the middle of Chinese text', () => {
    expect(keyTextParts('API Key 存好了（sk-ant-...abcd），只在这台电脑上。')).toEqual([
      { text: 'API Key 存好了（', key: false },
      { text: 'sk-ant-...abcd', key: true },
      { text: '），只在这台电脑上。', key: false },
    ]);
  });

  it('leaves other text alone', () => {
    expect(keyTextParts('No key yet')).toEqual([{ text: 'No key yet', key: false }]);
  });
});
