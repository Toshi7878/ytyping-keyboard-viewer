import { describe, expect, it } from 'vitest';
import { getActiveKeyboardLayout, shouldApplyResolvedLabel } from './viewer-state';

describe('keyboard viewer state helpers', () => {
  it('uses the JIS kana layout when the current input mode is kana', () => {
    expect(getActiveKeyboardLayout('kana', 'us')).toBe('jis');
    expect(getActiveKeyboardLayout('kana', 'jis')).toBe('jis');
  });

  it('keeps the selected keyboard layout when the current input mode is roma', () => {
    expect(getActiveKeyboardLayout('roma', 'us')).toBe('us');
    expect(getActiveKeyboardLayout('roma', 'jis')).toBe('jis');
  });

  it('applies kana labels even when no next key was resolved', () => {
    expect(shouldApplyResolvedLabel([], 'kana', 'kana')).toBe(true);
  });

  it('does not replace kana labels with roma labels when kana mode has no resolved key', () => {
    expect(shouldApplyResolvedLabel([], 'roma', 'kana')).toBe(false);
  });
});
