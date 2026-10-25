import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves it
  // under /zarch-in-chrome/) as well as from a domain root.
  base: './',
});
