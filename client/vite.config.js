import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// Версия программы из корневого package.json — показывается внизу меню
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Витрина собирается в shop.html: её отдаёт сервер, добавляя заголовки и разметку для поисковиков (server/src/seo.js)
const shopHtml = { name: 'shop-html', enforce: 'post', generateBundle(_, bundle) { if (bundle['index.html']) bundle['index.html'].fileName = 'shop.html'; } };

export default defineConfig({
  plugins: [react(), tailwindcss(), shopHtml],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Две страницы: витрина магазина (/) и программа учёта (/admin)
  build: { rollupOptions: { input: { shop: 'index.html', admin: 'admin/index.html' } } },
  server: {
    proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' },
  },
});
