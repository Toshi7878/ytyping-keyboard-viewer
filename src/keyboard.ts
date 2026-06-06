import { CODE_TO_KANA, DAKU_HANDAKU_NORMALIZE_MAP, KEY_TO_KANA } from 'lyrics-typing-engine';

export type KeyboardLayout = 'jis' | 'us';
export type InputMode = 'kana' | 'roma';
export type KanaLabelLayer = 'normal' | 'shift';
export type ResolvedKeys = { keys: string[]; labelMode: InputMode; labelLayer?: KanaLabelLayer };

export const KEYBOARD_ROWS = {
  jis: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '^', 'IntlYen'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '['],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ':', ']'],
    ['lshift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'IntlRo', 'rshift'],
    [' '],
  ],
  us: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['lshift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'rshift'],
    [' '],
  ],
} as const satisfies Record<KeyboardLayout, readonly (readonly string[])[]>;

const KEY_SETS = {
  jis: new Set<string>(KEYBOARD_ROWS.jis.flat()),
  us: new Set<string>(KEYBOARD_ROWS.us.flat()),
} as const satisfies Record<KeyboardLayout, ReadonlySet<string>>;

export const ROW_PADDING = {
  jis: ['', 'pl-3', 'pl-[18px]', '', ''],
  us: ['', '', 'pl-[18px]', '', ''],
} as const satisfies Record<KeyboardLayout, readonly string[]>;

export const SHIFT_LABELS: Record<KeyboardLayout, Record<string, string>> = {
  jis: {
    '1': '!', '2': '"', '3': '#', '4': '$', '5': '%',
    '6': '&', '7': "'", '8': '(', '9': ')',
    '-': '=', '^': '~', IntlYen: '|',
    '@': '`', '[': '{',
    ';': '+', ':': '*', ']': '}',
    ',': '<', '.': '>', '/': '?', IntlRo: '_',
  },
  us: {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
    '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
    '-': '_', '=': '+',
    '[': '{', ']': '}', '\\': '|',
    ';': ':', "'": '"',
    ',': '<', '.': '>', '/': '?',
  },
};

const BASE_KEY_LABELS: Record<string, string> = {
  IntlYen: '|',
  IntlRo: '_',
};

const SHIFT_KEYS: Record<KeyboardLayout, Record<string, string>> = {
  jis: Object.fromEntries(Object.entries(SHIFT_LABELS.jis).map(([key, shifted]) => [shifted, key])),
  us: Object.fromEntries(Object.entries(SHIFT_LABELS.us).map(([key, shifted]) => [shifted, key])),
};

const EVENT_KEY_ALIASES: Record<string, string> = {
  Spacebar: ' ',
};

const EVENT_CODE_ALIASES: Record<KeyboardLayout, Record<string, string>> = {
  jis: {
    Minus: '-',
    Equal: '^',
    IntlYen: 'IntlYen',
    BracketLeft: '@',
    BracketRight: '[',
    Semicolon: ';',
    Quote: ':',
    Backslash: ']',
    Comma: ',',
    Period: '.',
    Slash: '/',
    IntlRo: 'IntlRo',
  },
  us: {
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  },
};

function kanaLabel(kanaList: readonly string[], shifted: boolean): string {
  return (shifted ? kanaList[1] : kanaList[0]) ?? kanaList[0] ?? '';
}

function codeKanaLabel(code: string, kanaList: readonly string[], shifted: boolean): string {
  if (shifted && (code === 'IntlYen' || code === 'IntlRo')) return kanaList[0] ?? '';
  return kanaLabel(kanaList, shifted);
}

function buildKanaLabels(layout: KeyboardLayout, shifted: boolean): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [key, kanaList] of KEY_TO_KANA) {
    const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
    const label = kanaLabel(kanaList, shifted);
    if (label && KEY_SETS[layout].has(normalizedKey)) {
      labels[normalizedKey] = label;
      continue;
    }

    const shiftedKey = SHIFT_KEYS[layout][key];
    const shiftedLabel = kanaList[0] ?? '';
    if (shifted && shiftedKey && shiftedLabel && KEY_SETS[layout].has(shiftedKey)) {
      labels[shiftedKey] = shiftedLabel;
    }
  }

  for (const [code, kanaList] of CODE_TO_KANA) {
    const key = EVENT_CODE_ALIASES[layout][code];
    const label = codeKanaLabel(code, kanaList, shifted);
    if (key && label && KEY_SETS[layout].has(key)) labels[key] = label;
  }

  return labels;
}

export const KANA_LABELS: Record<KeyboardLayout, Record<KanaLabelLayer, Record<string, string>>> = {
  jis: {
    normal: buildKanaLabels('jis', false),
    shift: buildKanaLabels('jis', true),
  },
  us: {
    normal: buildKanaLabels('us', false),
    shift: buildKanaLabels('us', true),
  },
};

const SHIFT_KANA_TO_KEY = new Map<string, string>([
  ['ぃ', 'e'],
  ['っ', 'z'],
  ['を', '0'],
]);

const ADDITIONAL_SHIFT_KANA_LABELS = Object.fromEntries(
  [...SHIFT_KANA_TO_KEY].map(([kana, key]) => [key, kana]),
);

Object.assign(KANA_LABELS.jis.shift, ADDITIONAL_SHIFT_KANA_LABELS);
KANA_LABELS.jis.shift['['] = KANA_LABELS.jis.normal['['] ?? '゜';
KANA_LABELS.jis.shift[']'] = KANA_LABELS.jis.normal[']'] ?? 'む';

const KANA_SHIFT_LAYER_KEYS = new Set(
  Object.entries(KANA_LABELS.jis.shift)
    .filter(([key, label]) => label && label !== KANA_LABELS.jis.normal[key])
    .map(([key]) => key),
);

const KANA_TO_KEYS = new Map<string, string[]>();
function addKanaKey(kana: string, key: string): void {
  if (!kana) return;
  KANA_TO_KEYS.set(kana, [...new Set([...(KANA_TO_KEYS.get(kana) ?? []), key])]);
}

for (const [key, kanaList] of KEY_TO_KANA) {
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  if (KEY_SETS.jis.has(normalizedKey)) {
    kanaList.forEach((kana) => addKanaKey(kana, normalizedKey));
    continue;
  }

  const shiftedKey = SHIFT_KEYS.jis[key];
  if (shiftedKey && KEY_SETS.jis.has(shiftedKey)) {
    kanaList.forEach((kana) => addKanaKey(kana, shiftedKey));
  }
}
for (const [code, kanaList] of CODE_TO_KANA) {
  const key = EVENT_CODE_ALIASES.jis[code];
  if (!key) continue;
  kanaList.forEach((kana) => addKanaKey(kana, key));
}
for (const [kana, key] of SHIFT_KANA_TO_KEY) {
  addKanaKey(kana, key);
}

function firstStringValue(source: unknown, keys: readonly string[]): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function normalizeKana(kana: string): string {
  return DAKU_HANDAKU_NORMALIZE_MAP[kana as keyof typeof DAKU_HANDAKU_NORMALIZE_MAP] ?? kana;
}

function resolveKeyLabelLayer(value: string | undefined, layout: KeyboardLayout): KanaLabelLayer {
  if (!value) return 'normal';
  const key = value[0];
  if (SHIFT_KEYS[layout][key]) return 'shift';
  return 'normal';
}

function resolveAnyKeyLabelLayer(layout: KeyboardLayout, ...values: (string | undefined | null)[]): KanaLabelLayer {
  return values.some((value) => resolveKeyLabelLayer(value ?? undefined, layout) === 'shift') ? 'shift' : 'normal';
}

export function resolveKanaKeys(value: string | undefined, layout: KeyboardLayout): ResolvedKeys {
  if (!value) return { keys: [], labelMode: 'kana' };

  const kana = normalizeKana(value[0]);
  const keys = (KANA_TO_KEYS.get(kana) ?? []).filter((key) => KEY_SETS[layout].has(key));
  if (keys.length > 0) {
    const labelLayer = keys.some((key) => KANA_SHIFT_LAYER_KEYS.has(key) && KANA_LABELS.jis.shift[key] === kana)
      ? 'shift'
      : 'normal';
    return { keys, labelMode: 'kana', labelLayer };
  }

  const normalizedKey = normalizeKey(value[0], layout);
  return normalizedKey
    ? { keys: [normalizedKey], labelMode: 'roma', labelLayer: resolveKeyLabelLayer(value[0], layout) }
    : { keys: [], labelMode: 'kana' };
}

export function resolveNextKeys(layout: KeyboardLayout, inputMode: InputMode): ResolvedKeys {
  const word = window.__ytyping_type?.getTypingWord();
  if (!word) return { keys: [], labelMode: inputMode };
  const { nextChunk, tempRomaPatterns } = word;
  const chunkText = firstStringValue(nextChunk, ['kana', 'char', 'text', 'word']);
  if (inputMode === 'kana') {
    if (nextChunk?.type === 'alphabet') {
      const alphabetValue = chunkText ?? tempRomaPatterns?.[0]?.[0] ?? nextChunk?.romaPatterns?.[0]?.[0];
      const key = normalizeKey(alphabetValue, 'jis');
      return key
        ? { keys: [key], labelMode: 'roma', labelLayer: resolveAnyKeyLabelLayer('jis', alphabetValue) }
        : { keys: [], labelMode: 'roma' };
    }

    if (chunkText) {
      const resolved = resolveKanaKeys(chunkText, layout);
      if (resolved.keys.length > 0) return resolved;
    }

    const romaValue = tempRomaPatterns?.[0]?.[0] ?? nextChunk?.romaPatterns?.[0]?.[0];
    const key = normalizeKey(romaValue, 'jis');
    return key
      ? { keys: [key], labelMode: 'roma', labelLayer: resolveAnyKeyLabelLayer('jis', romaValue, chunkText) }
      : { keys: [], labelMode: 'kana' };
  }

  const nextValue =
    tempRomaPatterns?.[0]?.[0] ??
    nextChunk?.romaPatterns?.[0]?.[0] ??
    chunkText;
  const key = normalizeKey(nextValue, layout);
  return key
    ? { keys: [key], labelMode: inputMode, labelLayer: resolveAnyKeyLabelLayer(layout, nextValue, chunkText) }
    : { keys: [], labelMode: inputMode };
}

export function normalizeKey(key: string | undefined, layout: KeyboardLayout): string | null {
  if (!key) return null;
  if (key === ' ') return ' ';
  if (KEY_SETS[layout].has(key)) return key;

  const normalizedKey = EVENT_KEY_ALIASES[key] ?? SHIFT_KEYS[layout][key] ?? key.toLowerCase();
  return KEY_SETS[layout].has(normalizedKey) ? normalizedKey : null;
}

export function resolvePressedKey(e: KeyboardEvent, layout: KeyboardLayout): string | null {
  if (e.key === 'Shift') return e.location === 1 ? 'lshift' : 'rshift';
  return normalizeKey(e.key, layout) ?? normalizeKey(EVENT_CODE_ALIASES[layout][e.code], layout);
}

export function getKeyLabel(
  key: string,
  inputMode: InputMode,
  showShiftLayer: boolean,
  keyLabels: Record<string, string>,
) {
  if (key === ' ') return '';
  if (key === 'lshift' || key === 'rshift') return '⇧';
  const baseLabel = BASE_KEY_LABELS[key] ?? key.toUpperCase();
  if (inputMode === 'kana') return keyLabels[key] ?? baseLabel;
  return showShiftLayer ? (keyLabels[key] ?? baseLabel) : baseLabel;
}
