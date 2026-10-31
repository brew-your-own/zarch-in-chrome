import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/** A git command's output, or null where there is no git (or no repository). */
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** Lines in the TypeScript files under `dir`, split into game code and tests. */
function countLines(dir: string, total = { code: 0, tests: 0, files: 0 }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) countLines(path, total);
    else if (entry.name.endsWith('.ts')) {
      const lines = readFileSync(path, 'utf8').split('\n').length;
      if (entry.name.endsWith('.test.ts')) total.tests += lines;
      else total.code += lines;
      total.files++;
    }
  }
  return total;
}

// What the About tab shows: the tag when the build is exactly on one, else the short revision.
const BUILD = {
  tag: git('describe --tags --exact-match HEAD'),
  rev: git('rev-parse --short HEAD'),
  dirty: git('status --porcelain') !== null,
  date: new Date().toISOString().slice(0, 10),
  lines: countLines('src'),
};

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves it
  // under /zarch-in-chrome/) as well as from a domain root.
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
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
