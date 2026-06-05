import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from './utils/spa-navigate';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '^'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '@', '['],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ':', ']'],
  ['lshift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'rshift'],
  [' '],
] as const satisfies readonly (readonly string[])[];

const HOOK_EVENTS = [
  'type:success',
  'replay:success',
  'timer:lineChange',
  'restart',
] as const;

const ROW_PADDING = ['', 'pl-3', 'pl-[18px]', '', ''] as const;

const SHIFT_LABELS: Record<string, string> = {
  '1': '!', '2': '"', '3': '#', '4': '$', '5': '%',
  '6': '&', '7': "'", '8': '(', '9': ')',
  '-': '=', '^': '~',
  '@': '`', '[': '{',
  ';': '+', ':': '*', ']': '}',
  ',': '<', '.': '>', '/': '?',
};

type Position = { x: number; y: number };
type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';
type ResizeState = {
  corner: ResizeCorner;
  anchorX: number; // 反対の角のX座標 (viewport基準)
  anchorY: number; // 反対の角のY座標
  natW: number;    // スケール1のときの自然な幅
  natH: number;    // スケール1のときの自然な高さ
};

const positionAtom = atomWithStorage<Position | null>('yt-kbd-position', null);
const scaleAtom = atomWithStorage<number>('yt-kbd-scale', 1);
const userVisibleAtom = atomWithStorage<boolean>('yt-kbd-user-visible', true);

// コーナーごとのスタイル定義
const CORNERS: { corner: ResizeCorner; cls: string; cursor: string }[] = [
  { corner: 'tl', cls: 'top-0 left-0 border-t border-l',     cursor: 'cursor-nwse-resize' },
  { corner: 'tr', cls: 'top-0 right-0 border-t border-r',    cursor: 'cursor-nesw-resize' },
  { corner: 'bl', cls: 'bottom-0 left-0 border-b border-l',  cursor: 'cursor-nesw-resize' },
  { corner: 'br', cls: 'bottom-0 right-0 border-b border-r', cursor: 'cursor-nwse-resize' },
];

function resolveNextKey(): string | null {
  const word = window.__ytyping_type?.getTypingWord();
  if (!word) return null;
  const { nextChunk, tempRomaPatterns } = word;
  return (
    tempRomaPatterns?.[0]?.[0]?.toLowerCase() ??
    nextChunk?.romaPatterns?.[0]?.[0]?.toLowerCase() ??
    null
  );
}

function KeyboardViewer() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [position, setPosition] = useAtom(positionAtom);
  const [scale, setScale] = useAtom(scaleAtom);
  const [userVisible, setUserVisible] = useAtom(userVisibleAtom);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const resizeRef = useRef<ResizeState | null>(null);
  const [shiftActive, setShiftActive] = useState<'lshift' | 'rshift' | false>(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftActive(e.location === 1 ? 'lshift' : 'rshift');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftActive(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const hook = window.__ytyping_type;
    if (!hook) return;

    const show = () => setIsVisible(true);
    const updateKey = () => { show(); setActiveKey(resolveNextKey()); };
    const onEnd = () => { setIsVisible(false); setActiveKey(null); };

    HOOK_EVENTS.forEach((e) => hook.addEventListener(e, updateKey));
    hook.addEventListener('yt:play', show);
    hook.addEventListener('timer:end', onEnd);

    return () => {
      HOOK_EVENTS.forEach((e) => hook.removeEventListener(e, updateKey));
      hook.removeEventListener('yt:play', show);
      hook.removeEventListener('timer:end', onEnd);
    };
  }, []);

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

  return (
    <>
      {/* トグルボタン（常時表示） */}
      <button
        onClick={() => setUserVisible((v) => !v)}
        title={userVisible ? 'キーボードガイドを隠す' : 'キーボードガイドを表示'}
        className={[
          'fixed bottom-3 right-3 z-50 w-9 h-9 flex items-center justify-center',
          'rounded-lg border backdrop-blur-[6px] transition-[background,border-color,color] duration-150 cursor-pointer',
          userVisible
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-overlay-background text-overlay-foreground/50 border-overlay-foreground/20',
        ].join(' ')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" ry="2"/>
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
        </svg>
      </button>

      {/* キーボードパネル（プレイ中 かつ ユーザーが表示中のときのみ） */}
      {isVisible && userVisible && (
        <div
          ref={containerRef}
          style={positionStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="fixed z-50 bg-overlay-background rounded-lg px-2 py-1.5 select-none font-mono backdrop-blur-[6px] border border-overlay-foreground/15 cursor-grab active:cursor-grabbing touch-none"
        >
          {ROWS.map((row, ri) => (
            <div
              key={ri}
              className={`flex gap-0.5 mb-0.5 last:mb-0 justify-start last:justify-center ${ROW_PADDING[ri]}`}
            >
              {row.map((key) => {
                const isSpace = key === ' ';
                const isShift = key === 'lshift' || key === 'rshift';
                const isActive = activeKey === key || shiftActive === key;
                const label = isSpace ? '' : isShift ? '⇧'
                  : shiftActive ? (SHIFT_LABELS[key] ?? key.toUpperCase())
                  : key.toUpperCase();
                return (
                  <div
                    key={key}
                    className={[
                      'flex items-center justify-center rounded-[3px] font-semibold border h-5',
                      'transition-[background,color,border-color,box-shadow] duration-[60ms]',
                      isSpace ? 'w-[108px]' : isShift ? 'w-[42px] text-xs' : 'w-[22px] text-[10px]',
                      isActive
                        ? 'bg-primary-light text-primary-foreground border-primary-light shadow-[0_0_8px_color-mix(in_oklab,var(--primary-light)_55%,transparent)]'
                        : 'bg-overlay-foreground/10 text-overlay-foreground/50 border-overlay-foreground/12',
                    ].join(' ')}
                  >
                    {label}
                  </div>
                );
              })}
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
