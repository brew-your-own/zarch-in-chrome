import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves it
  // under /zarch-in-chrome/) as well as from a domain root.
  base: './',
  build: {
    rolldownOptions: {
      output: {
        // The core of Three.js in a chunk of its own, so a deploy usually leaves it as it was and
        // a returning browser only fetches the game's own (much smaller) chunk. Only the parts the
        // game uses are bundled, so the chunk does change when a commit starts or stops using a
        // Three.js class, as well as on an upgrade. Add-ons (`three/examples/jsm`) stay with the game.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]build[\\/]/ }],
        },
      },
    },
    // That chunk is about 550 kB minified; the title screen needs it from its first frame, so
    // it can't be split further or loaded later.
    chunkSizeWarningLimit: 600,
  },
});
