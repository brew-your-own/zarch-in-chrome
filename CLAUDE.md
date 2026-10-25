# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal

A browser clone of **Zarch** (David Braben, Acorn Archimedes, 1987), later ported to Atari ST / Amiga as **Virus**. Stack: Vite + TypeScript + Three.js, tests with Vitest.

Current scope is flight only: craft, terrain, launch pad, fuel, landing/crashing. The virus, landscape objects (trees, buildings), enemies and the cannon are deliberately deferred to later iterations. The right mouse button is reserved for the cannon; it is already captured as `MouseInput.fire` but nothing uses it yet.

## Commands

- `npm run dev`: dev server (http://localhost:5173). Add `?seed=N` to the URL to pick a different terrain.
- `npm run build`: type-check with `tsc --noEmit`, then `vite build`.
- `npm run typecheck`: type-check only. There is no separate linter. `tsconfig` is strict, with `noUncheckedIndexedAccess`.
- `npm test`: run all tests once. `npm run test:watch` runs them in watch mode.
- Single test: `npx vitest run src/sim/craft.test.ts -t "lands softly"`

## Architecture

The code has a hard split between simulation and presentation:

- `src/sim/`: pure, deterministic game logic with no DOM or Three.js imports. Everything testable lives here, and new gameplay rules belong here with tests.
  - `terrain.ts`: `Terrain` is a wrapping (toroidal) heightmap, one world unit per tile. World coordinates are unbounded and lookups wrap with `mod`. Each tile is split into two triangles along the (0,0)-(1,1) diagonal. `heightAt`, `normalAt` and `render/terrainView.ts` must all agree on that split. `generateTerrain(seed)` builds seeded multi-octave value noise, clamps it to `SEA_LEVEL`, and flattens a 3×3 launch pad in the middle of the map. Tests build small hand-written worlds with `Terrain.fromRows(...)` instead of using generated ones.
  - `craft.ts`: `stepCraft(state, input, terrain, dt)` mutates `CraftState`. The input aim is a point in the unit disk (the virtual mouse position relative to the screen centre). Its direction sets which way the craft leans and its distance sets how far, up to `MAX_TILT`. Thrust always pushes along the craft's tilted up axis, against constant gravity. A landed craft is held upright whatever the mouse does, so it always lifts off vertically, and it levels out on a safe touchdown. `main.ts` also recentres the aim on every step while landed, so the craft starts each liftoff with the mouse at centre. The craft only crashes on the *transition* from flying to touching down: too fast, too tilted, too steep, or over sea. `state.thrusting` records whether the thruster actually fired that step. Tuning lives in the `CRAFT` constants.
- `src/render/`: Three.js views that read sim state each frame and never change it.
  - `terrainView.ts`: rebuilds a fixed-size patch of tiles around the craft every frame, skewed so more rows lie north. Lighting is calculated per triangle on the CPU into vertex colours for the flat-shaded look, so the terrain doesn't use scene lights.
  - `craftView.ts`: the low-poly craft mesh, plus a shadow made by dropping each craft vertex straight down onto `terrain.heightAt`.
  - `exhaustView.ts`: the thruster plume, a cosmetic particle pool (`THREE.Points`) driven by frame time rather than the fixed sim step. It emits while `state.thrusting` is set and freezes while paused.
- `src/input.ts`: pointer-locked mouse. Movement is added up into the aim disk. Left button is thrust, right button is fire.
- `src/main.ts`: wiring and the game loop. The simulation runs at a fixed 60 Hz with an accumulator, and rendering interpolates the craft position between the last two steps. The simulation pauses while the pointer is not locked.

In dev builds, `window.zarch` exposes `{ craft, input, terrain }`. Browser automation can't take pointer lock, so to drive the game set `zarch.input.locked = true`, then set `aimX`/`aimY`/`thrust`. Also hide `#overlay` before taking screenshots.

### Coordinate conventions

- Y is up. The camera has a fixed orientation: it always looks north (-z) from behind and above the craft, and only its position follows the craft.
- Screen up (aim +y) maps to world -z, and screen right maps to +x.
- The craft's heading is `atan2(tilt.x, -tilt.z)`. The nose is along local -z.
