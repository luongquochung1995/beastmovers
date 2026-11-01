import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// base './' để build chạy được ở bất kỳ đường dẫn nào (GitHub Pages, itch.io).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Thư viện lớn tách file riêng: trình duyệt giữ cache khi chỉ code game thay đổi.
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (/node_modules\/(trystero|peerjs|@noble|@nostr)/.test(id)) return 'net';
          return undefined;
        },
      },
    },
  },
});
