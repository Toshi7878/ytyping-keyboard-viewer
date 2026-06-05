import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'YTyping Keyboard Guide',
        namespace: 'ytyping-keyboard-guide',
        version: '0.1.0',
        description: 'タイピング中に次に押すべきキーをハイライト表示するキーボードガイド',
        match: ['https://ytyping.net/type/*'],
      },
    }),
  ],
});
