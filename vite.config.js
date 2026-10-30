import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so it works under /<repo>/ on GitHub Pages
  server: { host: true },
});
