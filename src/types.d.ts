export {};

interface YTWordChunk {
  romaPatterns: string[];
  type: 'kana' | 'alphabet' | 'num' | 'symbol' | 'space' | undefined;
}

interface YTTypingWord {
  nextChunk: YTWordChunk;
  tempRomaPatterns?: string[];
}

declare global {
  interface Window {
    __ytyping_type?: {
      getTypingWord: () => YTTypingWord | null | undefined;
      addEventListener: (type: string, callback: (detail: unknown) => void) => void;
      removeEventListener: (type: string, callback: (detail: unknown) => void) => void;
    };
  }
}
