import type { InputMode, KeyboardLayout } from './keyboard';

export function getActiveKeyboardLayout(inputMode: InputMode, keyboardLayout: KeyboardLayout): KeyboardLayout {
  return inputMode === 'kana' ? 'jis' : keyboardLayout;
}

export function shouldApplyResolvedLabel(keys: readonly string[], labelMode: InputMode, inputMode: InputMode): boolean {
  return keys.length > 0 || labelMode === inputMode;
}
