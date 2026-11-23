import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Le prototype validé reste la source unique des tokens et styles pendant la migration.
export default defineConfig({
  root: import.meta.dirname,
  base: '/app/',
  plugins: [{
    name: 'fabcore-identity',
    resolveId(id) { return id === 'virtual:fabcore-style' ? '\0fabcore-style.css' : undefined; },
    load(id) {
      if (id !== '\0fabcore-style.css') return;
      const html = readFileSync(new URL('../design/prototype.html', import.meta.url), 'utf8');
      const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
      if (!style) throw new Error('FabCore design styles missing');
      return style;
    },
  }],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:3000' } },
});
