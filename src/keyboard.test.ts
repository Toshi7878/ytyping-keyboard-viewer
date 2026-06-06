import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getKeyLabel,
  KANA_LABELS,
  normalizeKey,
  resolveNextKeys,
  resolvePressedKey,
  SHIFT_LABELS,
} from './keyboard';

type TestChunk = {
  kana: string;
  romaPatterns?: string[];
  type?: 'kana' | 'alphabet' | 'num' | 'symbol' | 'space';
};

function stubTypingWord(nextChunk: TestChunk, tempRomaPatterns?: string[]) {
  vi.stubGlobal('window', {
    __ytyping_type: {
      getTypingWord: () => ({
        nextChunk,
        tempRomaPatterns,
      }),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('キーボードのキー解決', () => {
  it('かな入力で小書きかなをShiftレイヤーのキーとして解決する', () => {
    stubTypingWord({ kana: 'ぁ', romaPatterns: ['la'], type: 'kana' });

    expect(resolveNextKeys('jis', 'kana')).toEqual({
      keys: ['3'],
      labelMode: 'kana',
      labelLayer: 'shift',
    });
    expect(KANA_LABELS.jis.normal['3']).toBe('あ');
    expect(KANA_LABELS.jis.shift['3']).toBe('ぁ');
  });

  it('かな入力のShiftレイヤーでもIntlYenとIntlRoのかな表示を維持する', () => {
    expect(resolveNextKeysForKana('ー')).toEqual({
      keys: ['IntlYen'],
      labelMode: 'kana',
      labelLayer: 'normal',
    });
    expect(resolveNextKeysForKana('ろ')).toEqual({
      keys: ['IntlRo'],
      labelMode: 'kana',
      labelLayer: 'normal',
    });
    expect(KANA_LABELS.jis.shift.IntlYen).toBe('ー');
    expect(KANA_LABELS.jis.shift.IntlRo).toBe('ろ');
  });

  it('かな入力のShiftレイヤーでも半濁点とむの表示を維持する', () => {
    expect(resolveNextKeysForKana('゜')).toEqual({
      keys: ['['],
      labelMode: 'kana',
      labelLayer: 'normal',
    });
    expect(resolveNextKeysForKana('む')).toEqual({
      keys: [']'],
      labelMode: 'kana',
      labelLayer: 'normal',
    });
    expect(KANA_LABELS.jis.shift['[']).toBe('゜');
    expect(KANA_LABELS.jis.shift[']']).toBe('む');
  });

  it('かな入力中でも英字チャンクではローマ字表示へ切り替える', () => {
    stubTypingWord({ kana: 'A', romaPatterns: ['A'], type: 'alphabet' });

    expect(resolveNextKeys('jis', 'kana')).toEqual({
      keys: ['a'],
      labelMode: 'roma',
      labelLayer: 'normal',
    });
  });

  it('かなマップにない記号はかな入力中でもローマ字表示へ切り替える', () => {
    stubTypingWord({ kana: '(', romaPatterns: ['8'], type: 'symbol' });

    expect(resolveNextKeys('jis', 'kana')).toEqual({
      keys: ['8'],
      labelMode: 'roma',
      labelLayer: 'shift',
    });
  });

  it('ローマ字入力で入力パターンが非Shiftでも実文字がShift記号ならShiftレイヤーにする', () => {
    stubTypingWord({ kana: '(', romaPatterns: ['8'], type: 'symbol' }, ['8']);

    expect(resolveNextKeys('jis', 'roma')).toEqual({
      keys: ['8'],
      labelMode: 'roma',
      labelLayer: 'shift',
    });
    expect(getKeyLabel('8', 'roma', true, SHIFT_LABELS.jis)).toBe('(');
  });

  it('Shift記号とevent.codeをキーガイド上のキーへ正規化する', () => {
    expect(normalizeKey('(', 'jis')).toBe('8');
    expect(resolvePressedKey({ key: '\\', code: 'IntlYen' } as KeyboardEvent, 'jis')).toBe('IntlYen');
    expect(resolvePressedKey({ key: '_', code: 'IntlRo' } as KeyboardEvent, 'jis')).toBe('IntlRo');
  });

  it('ローマ字入力中の英語大文字ではShiftレイヤーにしない', () => {
    stubTypingWord({ kana: 'A', romaPatterns: ['A'], type: 'alphabet' }, ['A']);

    expect(resolveNextKeys('jis', 'roma')).toEqual({
      keys: ['a'],
      labelMode: 'roma',
      labelLayer: 'normal',
    });
  });
});

function resolveNextKeysForKana(kana: string) {
  stubTypingWord({ kana, romaPatterns: [], type: 'kana' });
  return resolveNextKeys('jis', 'kana');
}
