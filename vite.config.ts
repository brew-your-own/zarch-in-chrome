import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves it
  // under /zarch-in-chrome/) as well as from a domain root.
  base: './',
  build: {
    rolldownOptions: {
      output: {
        // Three.js in a chunk of its own: its hash only changes when the library is upgraded,
        // so after a deploy a returning browser only fetches the game's own (much smaller) chunk.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
    // That chunk is about 550 kB minified; the title screen needs it from its first frame, so
    // it can't be split further or loaded later.
    chunkSizeWarningLimit: 600,
  },
});
