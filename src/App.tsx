import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeInputModeDetail, GameStartDetail } from './index';
import { usePathname } from './utils/spa-navigate';
import { DAKU_HANDAKU_NORMALIZE_MAP, KEY_TO_KANA, CODE_TO_KANA } from 'lyrics-typing-engine';

const KEYBOARD_ROWS = {
  jis: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '^'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '['],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ':', ']'],
    ['lshift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'rshift'],
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

const KEY_REFRESH_EVENTS = ['type:success'] as const;

const KEY_UPDATE_ONLY_EVENTS = ['timer:lineChange'] as const;
const RESET_REPLAY_EVENTS = ['restart'] as const;

const ROW_PADDING = {
  jis: ['', 'pl-3', 'pl-[18px]', '', ''],
  us: ['', '', 'pl-[18px]', '', ''],
} as const satisfies Record<KeyboardLayout, readonly string[]>;

const SHIFT_LABELS: Record<KeyboardLayout, Record<string, string>> = {
  jis: {
    '1': '!', '2': '"', '3': '#', '4': '$', '5': '%',
    '6': '&', '7': "'", '8': '(', '9': ')',
    '-': '=', '^': '~',
    '@': '`', '[': '{',
    ';': '+', ':': '*', ']': '}',
    ',': '<', '.': '>', '/': '?',
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

const KANA_LABELS: Record<KeyboardLayout, Record<string, string>> = {
  jis: Object.fromEntries(
    [...KEY_TO_KANA]
      .map(([key, kanaList]) => [key.length === 1 ? key.toLowerCase() : key, kanaList[0] ?? ''])
      .filter(([key, label]) => label && KEY_SETS.jis.has(key)),
  ),
  us: Object.fromEntries(
    [...KEY_TO_KANA]
      .map(([key, kanaList]) => [key.length === 1 ? key.toLowerCase() : key, kanaList[0] ?? ''])
      .filter(([key, label]) => label && KEY_SETS.us.has(key)),
  ),
};

const KEY_LABELS: Record<InputMode, Record<KeyboardLayout, Record<string, string>>> = {
  roma: SHIFT_LABELS,
  kana: KANA_LABELS,
};

const SHIFT_KEYS: Record<KeyboardLayout, Record<string, string>> = {
  jis: Object.fromEntries(
    Object.entries(SHIFT_LABELS.jis).map(([key, shifted]) => [shifted, key]),
  ),
  us: Object.fromEntries(
    Object.entries(SHIFT_LABELS.us).map(([key, shifted]) => [shifted, key]),
  ),
};

const EVENT_KEY_ALIASES: Record<string, string> = {
  Spacebar: ' ',
};

const EVENT_CODE_ALIASES: Record<KeyboardLayout, Record<string, string>> = {
  jis: {
    Minus: '-',
    Equal: '^',
    BracketLeft: '@',
    BracketRight: '[',
    Semicolon: ';',
    Quote: ':',
    Backslash: ']',
    Comma: ',',
    Period: '.',
    Slash: '/',
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

const KANA_TO_KEYS = new Map<string, string[]>();
for (const [key, kanaList] of KEY_TO_KANA) {
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  const kana = kanaList[0];
  if (!kana || !KEY_SETS.jis.has(normalizedKey)) continue;
  KANA_TO_KEYS.set(kana, [...(KANA_TO_KEYS.get(kana) ?? []), normalizedKey]);
}
for (const [code, kanaList] of CODE_TO_KANA) {
  const kana = kanaList[0];
  const key = EVENT_CODE_ALIASES.jis[code];
  if (!kana || !key) continue;
  KANA_TO_KEYS.set(kana, [...(KANA_TO_KEYS.get(kana) ?? []), key]);
}

const VISIBILITY_MODE_ORDER = ['always', 'replay', 'hidden'] as const satisfies readonly VisibilityMode[];
const VISIBILITY_MODE_LABELS: Record<VisibilityMode, string> = {
  always: 'キーボードガイドを常に表示',
  replay: 'キーボードガイドをリプレイ時のみ表示',
  hidden: 'キーボードガイドを隠す',
};

type Position = { x: number; y: number };
type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';
type VisibilityMode = 'always' | 'replay' | 'hidden';
type KeyboardLayout = 'jis' | 'us';
type InputMode = 'kana' | 'roma';
type ResizeState = {
  corner: ResizeCorner;
  anchorX: number; // 反対の角のX座標 (viewport基準)
  anchorY: number; // 反対の角のY座標
  natW: number;    // スケール1のときの自然な幅
  natH: number;    // スケール1のときの自然な高さ
};

const positionAtom = atomWithStorage<Position | null>('yt-kbd-position', null);
const scaleAtom = atomWithStorage<number>('yt-kbd-scale', 1);
const visibilityModeAtom = atomWithStorage<VisibilityMode>('yt-kbd-visibility-mode', 'always');
const notesEnabledAtom = atomWithStorage<boolean>('yt-kbd-notes-enabled', false);
const notesHeightAtom = atomWithStorage<number>('yt-kbd-notes-height', 55);
const notesSpeedAtom = atomWithStorage<number>('yt-kbd-notes-speed', 100);
const keyboardLayoutAtom = atomWithStorage<KeyboardLayout>('yt-kbd-layout', 'jis');


// コーナーごとのスタイル定義
const CORNERS: { corner: ResizeCorner; cls: string; cursor: string }[] = [
  { corner: 'tl', cls: 'top-0 left-0 border-t border-l',     cursor: 'cursor-nwse-resize' },
  { corner: 'tr', cls: 'top-0 right-0 border-t border-r',    cursor: 'cursor-nesw-resize' },
  { corner: 'bl', cls: 'bottom-0 left-0 border-b border-l',  cursor: 'cursor-nesw-resize' },
  { corner: 'br', cls: 'bottom-0 right-0 border-b border-r', cursor: 'cursor-nwse-resize' },
];

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

type ResolvedKeys = { keys: string[]; labelMode: InputMode };

function resolveKanaKeys(value: string | undefined, layout: KeyboardLayout): ResolvedKeys {
  if (!value) return { keys: [], labelMode: 'kana' };

  const normalizedKey = normalizeKey(value[0], layout);
  if (normalizedKey) return { keys: [normalizedKey], labelMode: 'roma' };

  const kana = normalizeKana(value[0]);
  const keys = (KANA_TO_KEYS.get(kana) ?? []).filter((key) => KEY_SETS[layout].has(key));
  return { keys, labelMode: 'kana' };
}

function resolveNextKeys(layout: KeyboardLayout, inputMode: InputMode): ResolvedKeys {
  const word = window.__ytyping_type?.getTypingWord();
  if (!word) return { keys: [], labelMode: inputMode };
  const { nextChunk, tempRomaPatterns } = word;
  const chunkText = firstStringValue(nextChunk, ['kana', 'char', 'text', 'word']);
  if (inputMode === 'kana') {
    const resolved = resolveKanaKeys(chunkText ?? tempRomaPatterns?.[0]?.[0] ?? nextChunk?.romaPatterns?.[0]?.[0], layout);
    if (resolved.keys.length > 0) return resolved;
    const romaValue = tempRomaPatterns?.[0]?.[0] ?? nextChunk?.romaPatterns?.[0]?.[0];
    const key = normalizeKey(romaValue, 'jis');
    return key ? { keys: [key], labelMode: 'roma' } : { keys: [], labelMode: 'kana' };
  }

  const nextValue =
    tempRomaPatterns?.[0]?.[0] ??
    chunkText ??
    nextChunk?.romaPatterns?.[0]?.[0];
  const key = normalizeKey(nextValue, layout);
  return key ? { keys: [key], labelMode: inputMode } : { keys: [], labelMode: inputMode };
}

function normalizeKey(key: string | undefined, layout: KeyboardLayout): string | null {
  if (!key) return null;
  if (key === ' ') return ' ';

  const normalizedKey = EVENT_KEY_ALIASES[key] ?? SHIFT_KEYS[layout][key] ?? key.toLowerCase();
  return KEY_SETS[layout].has(normalizedKey) ? normalizedKey : null;
}

function resolvePressedKey(e: KeyboardEvent, layout: KeyboardLayout): string | null {
  if (e.key === 'Shift') return e.location === 1 ? 'lshift' : 'rshift';
  return normalizeKey(e.key, layout) ?? normalizeKey(EVENT_CODE_ALIASES[layout][e.code], layout);
}

function isReplayScene(detail?: unknown): boolean {
  if (typeof detail === 'object' && detail !== null && 'scene' in detail) {
    return (detail as { scene?: unknown }).scene === 'replay';
  }

  return window.__ytyping_type?.getScene?.() === 'replay';
}

function normalizeInputMode(value: unknown): InputMode | null {
  return value === 'kana' || value === 'roma' ? value : null;
}

function readInputModeFromHook(): InputMode | null {
  const getInputMode = window.__ytyping_type?.getInputMode;
  if (typeof getInputMode === 'function') return normalizeInputMode(getInputMode());
  return normalizeInputMode(getInputMode);
}

function getKeyLabel(
  key: string,
  inputMode: InputMode,
  shiftActive: 'lshift' | 'rshift' | false,
  keyLabels: Record<string, string>,
) {
  if (key === ' ') return '';
  if (key === 'lshift' || key === 'rshift') return '竍ｧ';
  if (inputMode === 'kana') return keyLabels[key] ?? key.toUpperCase();
  return shiftActive ? (keyLabels[key] ?? key.toUpperCase()) : key.toUpperCase();
}

function KeyboardViewer() {
  const [nextKeys, setNextKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [pressedKeys, setPressedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [acceptedPressedKeys, setAcceptedPressedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [position, setPosition] = useAtom(positionAtom);
  const [scale, setScale] = useAtom(scaleAtom);
  const [visibilityMode, setVisibilityMode] = useAtom(visibilityModeAtom);
  const [notesEnabled, setNotesEnabled] = useAtom(notesEnabledAtom);
  const [notesHeight, setNotesHeight] = useAtom(notesHeightAtom);
  const [notesSpeed, setNotesSpeed] = useAtom(notesSpeedAtom);
  const [keyboardLayout, setKeyboardLayout] = useAtom(keyboardLayoutAtom);
  const [inputMode, setInputMode] = useState<InputMode>('roma');
  const [keyLabelMode, setKeyLabelMode] = useState<InputMode>('roma');
  const [isVisible, setIsVisible] = useState(false);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const resizeRef = useRef<ResizeState | null>(null);
  const nextKeysRef = useRef<ReadonlySet<string>>(new Set());
  const keyboardLayoutRef = useRef<KeyboardLayout>('jis');
  const inputModeRef = useRef<InputMode>('roma');
  const notesEnabledRef = useRef(false);
  const [shiftActive, setShiftActive] = useState<'lshift' | 'rshift' | false>(false);
  type Burst = { id: number; x: number };
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstIdRef = useRef(0);
  const burstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  notesEnabledRef.current = notesEnabled;
  inputModeRef.current = inputMode;

  const activeKeyboardLayout = inputMode === 'kana' ? 'jis' : keyboardLayout;
  keyboardLayoutRef.current = activeKeyboardLayout;

  const rows = KEYBOARD_ROWS[activeKeyboardLayout];
  const rowPadding = ROW_PADDING[activeKeyboardLayout];
  const effectiveLabelMode = inputMode === 'kana' ? keyLabelMode : inputMode;
  const keyLabels = KEY_LABELS[effectiveLabelMode][activeKeyboardLayout];

  const isGuideVisible =
    isVisible && (visibilityMode === 'always' || (visibilityMode === 'replay' && isReplayMode));

  const getKeyX = useCallback((key: string | null) => {
    let x = 50;
    if (key && containerRef.current) {
      const el = containerRef.current.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
      if (el) {
        const cr = containerRef.current.getBoundingClientRect();
        const kr = el.getBoundingClientRect();
        x = ((kr.left + kr.right) / 2 - cr.left) / cr.width * 100;
      }
    }
    return x;
  }, []);

  const addBurst = useCallback((key: string | null) => {
    const id = ++burstIdRef.current;
    setBursts((prev) => [...prev, { id, x: getKeyX(key) }]);
    const tid = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 480);
    burstTimersRef.current.push(tid);
  }, [getKeyX]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = resolvePressedKey(e, keyboardLayoutRef.current);
      if (key) {
        if (!e.repeat && nextKeysRef.current.has(key)) {
          if (notesEnabledRef.current) addBurst(key);
          setAcceptedPressedKeys((prev) => new Set(prev).add(key));
        }
        setPressedKeys((prev) => new Set(prev).add(key));
      }
      if (e.key === 'Shift') setShiftActive(e.location === 1 ? 'lshift' : 'rshift');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = resolvePressedKey(e, keyboardLayoutRef.current);
      if (key) {
        setPressedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setAcceptedPressedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      if (e.key === 'Shift') setShiftActive(false);
    };
    const onBlur = () => {
      setPressedKeys(new Set());
      setAcceptedPressedKeys(new Set());
      setShiftActive(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [addBurst]);

  useEffect(() => {
    const { keys, labelMode } = resolveNextKeys(keyboardLayout, inputMode);
    nextKeysRef.current = new Set(keys);
    setNextKeys(new Set(keys));
    setKeyLabelMode(labelMode);
    setPressedKeys(new Set());
    setAcceptedPressedKeys(new Set());
    setShiftActive(false);
  }, [keyboardLayout, inputMode]);

  useEffect(() => {
    const show = () => setIsVisible(true);
    const syncInputMode = (nextInputMode: InputMode | null) => {
      if (nextInputMode) {
        inputModeRef.current = nextInputMode;
        setInputMode(nextInputMode);
      }
    };
    const refreshKey = (syncHookInputMode = true) => {
      show();
      if (syncHookInputMode) syncInputMode(readInputModeFromHook());
      const { keys, labelMode } = resolveNextKeys(keyboardLayoutRef.current, inputModeRef.current);
      nextKeysRef.current = new Set(keys);
      setNextKeys(new Set(keys));
      setKeyLabelMode(labelMode);
    };
    const changeInputMode = ({ newInputMode }: ChangeInputModeDetail) => {
      syncInputMode(normalizeInputMode(newInputMode));
      refreshKey(false);
    };
    const updateKey = () => {
      setIsReplayMode(false);
      refreshKey();
    };
    const updateReplayKey = () => {
      setIsReplayMode(true);
      const [currentKey] = nextKeysRef.current;
      if (notesEnabledRef.current) addBurst(currentKey ?? null);
      refreshKey();
    };
    const startReplay = () => {
      setIsReplayMode(true);
      refreshKey();
    };
    const onStart = ({ scene }: GameStartDetail) => {
      if (scene === 'replay') startReplay();
    };
    const onPlay = (detail: unknown) => {
      if (isReplayScene(detail)) {
        startReplay();
        return;
      }

      refreshKey();
    };
    const resetReplayAndUpdateKey = () => {
      setIsReplayMode(false);
      refreshKey();
    };
    const onEnd = () => {
      setIsVisible(false);
      setIsReplayMode(false);
      nextKeysRef.current = new Set();
      setNextKeys(new Set());
      setPressedKeys(new Set());
      setAcceptedPressedKeys(new Set());
      setBursts([]);
      burstTimersRef.current.forEach(clearTimeout);
      burstTimersRef.current = [];
    };

    const onLineChange = () => refreshKey();

    let cleanupHook: (() => void) | null = null;
    const attachHook = () => {
      const hook = window.__ytyping_type;
      if (!hook || cleanupHook) return false;

      syncInputMode(readInputModeFromHook());
      KEY_REFRESH_EVENTS.forEach((e) => hook.addEventListener(e, updateKey));
      hook.addEventListener('yt:start', onStart);
      hook.addEventListener('replay:success', updateReplayKey);
      hook.addEventListener('change-input-mode', changeInputMode);
      KEY_UPDATE_ONLY_EVENTS.forEach((e) => hook.addEventListener(e, onLineChange));
      RESET_REPLAY_EVENTS.forEach((e) => hook.addEventListener(e, resetReplayAndUpdateKey));
      hook.addEventListener('yt:play', onPlay);
      hook.addEventListener('timer:end', onEnd);

      cleanupHook = () => {
        KEY_REFRESH_EVENTS.forEach((e) => hook.removeEventListener(e, updateKey));
        hook.removeEventListener('yt:start', onStart);
        hook.removeEventListener('replay:success', updateReplayKey);
        hook.removeEventListener('change-input-mode', changeInputMode);
        KEY_UPDATE_ONLY_EVENTS.forEach((e) => hook.removeEventListener(e, onLineChange));
        RESET_REPLAY_EVENTS.forEach((e) => hook.removeEventListener(e, resetReplayAndUpdateKey));
        hook.removeEventListener('yt:play', onPlay);
        hook.removeEventListener('timer:end', onEnd);
        burstTimersRef.current.forEach(clearTimeout);
        burstTimersRef.current = [];
      };
      return true;
    };

    attachHook();
    const hookPollTimer = setInterval(() => {
      if (attachHook()) clearInterval(hookPollTimer);
    }, 250);

    return () => {
      clearInterval(hookPollTimer);
      cleanupHook?.();
    };
  }, [addBurst]);

  // ---- ドラッグ ----

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setPosition({ x: rect.left, y: rect.top });
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [setPosition],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current || !containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - width));
      const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - height));
      setPosition({ x, y });
    },
    [setPosition],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ---- リサイズ ----

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const corner = e.currentTarget.dataset.corner as ResizeCorner;

      // right/bottom → left/top へ切り替え（スケール適用中でも視覚位置は不変）
      setPosition({ x: rect.left, y: rect.top });

      // ドラッグするコーナーの「反対の角」をアンカーとして記録
      const anchorX = corner === 'tl' || corner === 'bl' ? rect.right : rect.left;
      const anchorY = corner === 'tl' || corner === 'tr' ? rect.bottom : rect.top;

      resizeRef.current = {
        corner,
        anchorX,
        anchorY,
        natW: el.offsetWidth,  // CSS transform はoffsetWidthに影響しない
        natH: el.offsetHeight,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [setPosition],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rs = resizeRef.current;
      if (!rs) return;
      const { corner, anchorX, anchorY, natW, natH } = rs;

      // アンカーからマウスまでの距離を自然サイズで割ってスケールを求める
      let scaleX: number, scaleY: number;
      if      (corner === 'br') { scaleX = (e.clientX - anchorX) / natW; scaleY = (e.clientY - anchorY) / natH; }
      else if (corner === 'bl') { scaleX = (anchorX - e.clientX) / natW; scaleY = (e.clientY - anchorY) / natH; }
      else if (corner === 'tr') { scaleX = (e.clientX - anchorX) / natW; scaleY = (anchorY - e.clientY) / natH; }
      else                      { scaleX = (anchorX - e.clientX) / natW; scaleY = (anchorY - e.clientY) / natH; }

      const newScale = Math.max(0.3, Math.min(3, (scaleX + scaleY) / 2));
      setScale(newScale);

      // アンカーの角が固定されるよう left/top を更新
      const newLeft = corner === 'tr' || corner === 'br' ? anchorX : anchorX - natW * newScale;
      const newTop  = corner === 'bl' || corner === 'br' ? anchorY : anchorY - natH * newScale;
      setPosition({ x: newLeft, y: newTop });
    },
    [setScale, setPosition],
  );

  const handleResizePointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // position未設定(右下固定)はbottom-rightを起点、移動後はtop-leftを起点に拡縮
  const positionStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, transform: `scale(${scale})`, transformOrigin: 'top left' }
    : { right: 12, bottom: 12, transform: `scale(${scale})`, transformOrigin: 'bottom right' };
  const guideStyle = {
    ...positionStyle,
    '--yt-kbd-note-height': `${notesHeight}px`,
    '--yt-kbd-note-duration': `${Math.round(42000 / notesSpeed)}ms`,
    '--yt-kbd-ring-duration': `${Math.round(32000 / notesSpeed)}ms`,
    '--yt-kbd-flash-duration': `${Math.round(24000 / notesSpeed)}ms`,
  } as React.CSSProperties &
    Record<
      '--yt-kbd-note-height' | '--yt-kbd-note-duration' | '--yt-kbd-ring-duration' | '--yt-kbd-flash-duration',
      string
    >;

  return (
    <>
      {/* トグルボタン（常時表示） */}
      {!isGuideVisible && (
        <button
          onClick={() => setVisibilityMode((mode) => {
            const currentIndex = VISIBILITY_MODE_ORDER.indexOf(mode);
            return VISIBILITY_MODE_ORDER[(currentIndex + 1) % VISIBILITY_MODE_ORDER.length];
          })}
          title={VISIBILITY_MODE_LABELS[visibilityMode]}
          className={[
            'fixed bottom-3 right-3 z-50 w-9 h-9 flex items-center justify-center',
            'rounded-lg border backdrop-blur-[6px] transition-[background,border-color,color] duration-150 cursor-pointer',
            visibilityMode === 'always'
              ? 'bg-primary text-primary-foreground border-primary'
              : visibilityMode === 'replay'
                ? 'bg-overlay-background text-primary border-primary/60'
                : 'bg-overlay-background text-overlay-foreground/50 border-overlay-foreground/20',
          ].join(' ')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" ry="2"/>
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
          </svg>
          {visibilityMode === 'replay' && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              R
            </span>
          )}
        </button>
      )}

      {/* キーボードパネル（プレイ中 かつ ユーザーが表示中のときのみ） */}
      {isGuideVisible && (
        <div
          ref={containerRef}
          style={guideStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="group fixed z-50 bg-overlay-background rounded-lg px-2 py-1.5 select-none font-mono backdrop-blur-[6px] border border-overlay-foreground/15 cursor-grab active:cursor-grabbing touch-none"
        >
          <button
            type="button"
            aria-pressed={notesEnabled}
            title={notesEnabled ? 'notes animation off' : 'notes animation on'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setNotesEnabled((enabled) => {
                if (enabled) {
                  burstTimersRef.current.forEach(clearTimeout);
                  burstTimersRef.current = [];
                  setBursts([]);
                }
                return !enabled;
              });
            }}
            className={[
              'absolute top-1 right-1 z-20 hidden group-hover:flex h-5 w-5 items-center justify-center',
              'rounded border backdrop-blur-[6px] transition-[background,border-color,color,box-shadow] duration-150 cursor-pointer',
              notesEnabled
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_6px_color-mix(in_oklab,var(--primary)_35%,transparent)]'
                : 'bg-overlay-background text-overlay-foreground/50 border-overlay-foreground/20',
            ].join(' ')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </button>
          {inputMode === 'roma' && (
            <button
              type="button"
              title={`keyboard layout: ${keyboardLayout.toUpperCase()}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setKeyboardLayout((layout) => layout === 'jis' ? 'us' : 'jis');
              }}
              className={[
                'absolute top-1 right-7 z-20 hidden group-hover:flex h-5 w-8 items-center justify-center',
                'rounded border bg-overlay-background text-[9px] font-bold text-overlay-foreground backdrop-blur-[6px]',
                'transition-[background,border-color,color] duration-150 cursor-pointer border-overlay-foreground/20',
              ].join(' ')}
            >
              {keyboardLayout.toUpperCase()}
            </button>
          )}
          <button
            type="button"
            title={VISIBILITY_MODE_LABELS[visibilityMode]}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setVisibilityMode((mode) => {
                const currentIndex = VISIBILITY_MODE_ORDER.indexOf(mode);
                return VISIBILITY_MODE_ORDER[(currentIndex + 1) % VISIBILITY_MODE_ORDER.length];
              });
            }}
            className={[
              'absolute top-1 right-[66px] z-20 hidden group-hover:flex h-5 w-5 items-center justify-center',
              'rounded border backdrop-blur-[6px] transition-[background,border-color,color] duration-150 cursor-pointer',
              visibilityMode === 'always'
                ? 'bg-primary text-primary-foreground border-primary'
                : visibilityMode === 'replay'
                  ? 'bg-overlay-background text-primary border-primary/60'
                  : 'bg-overlay-background text-overlay-foreground/50 border-overlay-foreground/20',
            ].join(' ')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" ry="2"/>
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
            </svg>
            {visibilityMode === 'replay' && (
              <span className="absolute -top-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground">
                R
              </span>
            )}
          </button>
          {/* 単体ノート ヒットエフェクト */}
          {bursts.map(({ id, x }) => (
            <div key={id} className="absolute inset-x-0 top-0 h-0 pointer-events-none z-10">
              {/* フラッシュ（瞬間的な明滅） */}
              <div
                className="absolute top-0 w-[22px] h-[4px] bg-primary animate-bm-flash"
                style={{
                  left: `${x}%`,
                  transform: 'translateX(-50%)',
                  boxShadow: '0 0 6px 2px color-mix(in oklab, var(--primary) 80%, transparent)',
                }}
              />
              {/* ノート（上昇して消える） */}
              <div className="absolute top-0" style={{ left: `${x}%`, transform: 'translateX(-50%)' }}>
                <div
                  className="w-[22px] h-[4px] bg-primary animate-bm-note"
                  style={{ boxShadow: '0 0 4px 1px color-mix(in oklab, var(--primary) 70%, transparent)' }}
                />
              </div>
              {/* インパクトリング（楕円が広がって消える） */}
              <div className="absolute top-0" style={{ left: `${x}%`, transform: 'translateX(-50%)', marginTop: '-3px' }}>
                <div
                  className="w-[22px] h-[10px] rounded-full border border-primary animate-bm-ring"
                  style={{ boxShadow: '0 0 4px 1px color-mix(in oklab, var(--primary) 55%, transparent)' }}
                />
              </div>
            </div>
          ))}

          {rows.map((row, ri) => (
            <div
              key={ri}
              className={`relative flex gap-0.5 mb-0.5 last:mb-0 ${ri === rows.length - 1 ? 'justify-center' : 'justify-start'} ${rowPadding[ri]}`}
            >
              {row.map((key) => {
                const isSpace = key === ' ';
                const isShift = key === 'lshift' || key === 'rshift';
                const isNext = nextKeys.has(key);
                const isPressed = pressedKeys.has(key) || shiftActive === key;
                const isAcceptedPressed = acceptedPressedKeys.has(key);
                const isMistype = isPressed && !isNext && !isAcceptedPressed;
                return (
                  <div
                    key={key}
                    data-key={key}
                    className={[
                      'flex items-center justify-center rounded-[3px] font-semibold border h-5',
                      'transition-[background,color,border-color,box-shadow] duration-[60ms]',
                      isSpace ? 'w-[130px]' : isShift ? 'w-[30px] text-xs' : 'w-[22px] text-[10px]',
                      isNext
                        ? 'bg-primary-light text-primary-foreground border-primary-light shadow-[0_0_8px_color-mix(in_oklab,var(--primary-light)_55%,transparent)]'
                        : isMistype
                          ? 'bg-primary-light/35 text-overlay-foreground border-primary-light/45 shadow-[0_0_5px_color-mix(in_oklab,var(--primary-light)_28%,transparent)]'
                        : 'bg-overlay-foreground/10 text-overlay-foreground/50 border-overlay-foreground/12',
                    ].join(' ')}
                  >
                    {getKeyLabel(key, effectiveLabelMode, shiftActive, keyLabels)}
                  </div>
                );
              })}
              {row.some((key) => key === ' ') && notesEnabled && (
                <>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={notesSpeed}
                    title={`notes speed: ${notesSpeed}%`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNotesSpeed(Number(e.currentTarget.value))}
                    className="absolute right-[calc(50%+69px)] top-0 z-20 hidden h-5 w-20 cursor-pointer group-hover:block"
                  />
                  <input
                    type="range"
                    min="25"
                    max="200"
                    step="5"
                    value={notesHeight}
                    title={`notes height: ${notesHeight}px`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNotesHeight(Number(e.currentTarget.value))}
                    className="absolute left-[calc(50%+69px)] top-0 z-20 hidden h-5 w-20 cursor-pointer group-hover:block"
                  />
                </>
              )}
            </div>
          ))}

          {/* 4コーナーリサイズハンドル */}
          {CORNERS.map(({ corner, cls, cursor }) => (
            <div
              key={corner}
              data-corner={corner}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className={`absolute w-3 h-3 border-overlay-foreground/0 hover:border-overlay-foreground/60 transition-colors touch-none ${cls} ${cursor}`}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function App() {
  const pathname = usePathname();
  if (!pathname.startsWith('/type/')) return null;
  return <KeyboardViewer />;
}
