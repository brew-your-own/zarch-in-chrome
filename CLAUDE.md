# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal

A browser clone of **Zarch** (David Braben, Acorn Archimedes, 1987), later ported to Atari ST / Amiga as **Virus**. Stack: Vite + TypeScript + Three.js, tests with Vitest.

Current scope: craft, terrain with trees, launch pad, fuel, landing/crashing with explosions, the cannon (right mouse button), a pause/settings panel and three preset maps. The virus, buildings and enemies are deliberately deferred to later iterations. Bullets currently stop at trees without harming them.

## Commands

- `npm run dev`: dev server (http://localhost:5173).
- `npm run build`: type-check with `tsc --noEmit`, then `vite build`.
- `npm run typecheck`: type-check only. There is no separate linter. `tsconfig` is strict, with `noUncheckedIndexedAccess`.
- `npm test`: run all tests once. `npm run test:watch` runs them in watch mode.
- Single test: `npx vitest run src/sim/craft.test.ts -t "lands softly"`

## Architecture

The code has a hard split between simulation and presentation:

- `src/sim/`: pure, deterministic game logic with no DOM or Three.js imports. Everything testable lives here, and new gameplay rules belong here with tests.
  - `terrain.ts`: `Terrain` is a wrapping (toroidal) heightmap, one world unit per tile. World coordinates are unbounded and lookups wrap with `mod`. Each tile is split into two triangles along the (0,0)-(1,1) diagonal. `heightAt`, `normalAt` and `render/terrainView.ts` must all agree on that split. `generateTerrain(seed, options)` builds seeded multi-octave value noise (`amplitude`, `seaBias` and `roughness` shape it), clamps it to `SEA_LEVEL`, flattens a 3×3 launch pad in the middle of the map, then plants trees. Tests build small hand-written worlds with `Terrain.fromRows(...)` instead of using generated ones.
  - `trees.ts`: at most one tree per tile, stored in `Terrain.trees` (`treeAt`/`setTree`) and placed at the tile centre. `TREE_SHAPES` gives each kind's collision cylinder. `treeScale`/`tileHash` give each tile a stable size and variation, and the renderer must use the same ones so the trees you see match the ones you hit. `plantTrees` uses its own random stream, so tree density never changes a map's heights. It keeps the pad and the ring of tiles around it clear, so the spawn point is always safe. `hitsTree` checks the 3×3 neighbouring tiles, because a round canopy can reach across a tile border.
  - `noise.ts`: `valueNoise`, a single wrapping octave, shared by the heightmap and the forest layer. Changing the order in which it draws random numbers changes every map.
  - `maps.ts`: the preset maps (`MAPS`), each a seed plus terrain options. `maps.test.ts` checks that each preset keeps its character (sea fraction, peak height), so retuning a preset may mean updating those bounds.
  - `craft.ts`: `stepCraft(state, input, terrain, dt, physics)` mutates `CraftState`. The input aim is a point in the unit disk (the virtual mouse position relative to the screen centre). Its direction sets which way the craft leans and its distance sets how far, up to `physics.maxTilt`. Thrust always pushes along the craft's tilted up axis, against constant gravity. A landed craft is held upright whatever the mouse does, so it always lifts off vertically, and it levels out on a safe touchdown. `main.ts` also recentres the aim on every step while landed, so the craft starts each liftoff with the mouse at centre. The craft crashes on any overlap with a tree (`CRAFT_RADIUS` against the tree's cylinder). On the ground, it only crashes on the *transition* from flying to touching down: too fast, too tilted, too steep, or over sea. `state.thrusting` records whether the thruster actually fired that step. When the craft crashes, `vel` is left at the impact velocity rather than zeroed, because the explosion uses it. A crashed craft doesn't move. Tuning is a `Physics` object passed in (defaulting to `DEFAULT_PHYSICS`), so it can change at runtime; `tiltAngle`, `thrustDirection`, `noseDirection` and `spawnCraft` take it too. `noseDirection` (where the cannon points) dips as the craft leans. `render/orientation.test.ts` checks that it and `thrustDirection` match the renderer's Euler rotation.
  - `cannon.ts`: `stepCannon(cannon, craft, fire, terrain, dt, physics)` fires at `physics.fireRate` from the nose, with bullets inheriting the craft's velocity. It moves bullets in sub-steps (`CHECKS_PER_UNIT`) so they can't tunnel through trunks, and returns each step's `Impact`s (`ground`/`sea`/`tree`) for the renderer.
- `src/render/`: Three.js views that read sim state each frame and never change it.
  - `lighting.ts`: `SUN`, the single light direction. The CPU-shaded terrain, the minimap, the scene's `DirectionalLight` and the tree shadows all use it.
  - `palette.ts`: all world colours. A `Palette` is built per terrain from the live `ColourSettings` (`autumn`, `grassTone`, `patches`, each 0–1), with `COLOUR_PRESETS` for the season buttons. `tile()` gives the ground colour, including the checkerboard and rust/orange/brown patches from a noise layer seeded by the terrain. `foliage()` gives tree colours: pines are always evergreen, and a hash-chosen share of round trees turns autumnal. The sim never reads colours.
  - `terrainView.ts`: rebuilds a fixed-size patch of tiles around the craft every frame, skewed so more rows lie north. Lighting is calculated per triangle on the CPU into vertex colours for the flat-shaded look, so the terrain doesn't use scene lights. Base colours come from the `Palette`.
  - `treeView.ts`: two `InstancedMesh`es per tree kind, wood and foliage, refilled each frame for the same visible patch as `terrainView` (it imports the patch constants from there). Foliage geometry is painted in grey levels and gets its hue from the per-instance colour, so leaves can change colour without tinting trunks. Tree shadows are flat side-on outlines cast along `SUN` and draped onto the terrain, drawn as one translucent mesh. The craft's shadow, by contrast, falls straight down, because it doubles as an altitude cue.
  - `craftView.ts`: the low-poly craft mesh, plus a shadow made by dropping each craft vertex straight down onto `terrain.heightAt`.
  - `exhaustView.ts`: the thruster plume, a cosmetic `ParticlePool` driven by frame time rather than the fixed sim step. It emits while `state.thrusting` is set and freezes while paused. Its look comes from a `PlumeSettings` object (`DEFAULT_PLUME`).
  - `particles.ts`: `ParticlePool`, a ring buffer of square particles with gravity, terrain bounce and colour ramps. It's shared by the exhaust plume and the effects.
  - `effectsView.ts`: explosions and bullet impacts. `explode()` splits the craft's own triangles into four shards each. The shards carry the impact velocity, spin, bounce on the terrain and shrink away, alongside fire and smoke particles. `main.ts` calls it on the step where `status` becomes `crashed`.
  - `bulletView.ts`: tracer lines plus head points for the live bullets.
  - `minimap.ts`: draws a whole terrain top-down into a 2D canvas, north up. Colours come from the `Palette`, with forests in their foliage colour. The pause panel uses it for the map thumbnails and the current-map view with the craft marker.
- `src/input.ts`: pointer-locked mouse. Movement is added up into the aim disk. Left button is thrust, right button is fire.
- `src/settings.ts`: the `Settings` object (`physics`, `plume`, `colours`, `mapId`), saved to `localStorage` and loaded over the defaults. Loading skips unknown keys and non-numeric values, so adding a new setting only needs a default. The `physics`, `plume` and `colours` objects are **mutated in place** by the panel. The sim and views hold references to them, so never replace those objects.
- `src/ui/settingsPanel.ts`: the pause screen in `#overlay`. It has the Fly button (which requests pointer lock), the minimap, the map picker, sliders and colour presets. It redraws the minimap and thumbnails on each change, so colour edits show up there immediately. Sliders are declared as `SliderSpec` lists; `scale` converts stored units to displayed ones, e.g. radians to degrees.
- `src/main.ts`: wiring and the game loop. Views hold the terrain they draw, so changing the map rebuilds them with `buildViews()` and respawns the craft. The simulation runs at a fixed 60 Hz with an accumulator, and rendering interpolates the craft position between the last two steps. The simulation pauses while the pointer is not locked.

In dev builds, `window.zarch` exposes `{ craft, cannon, input, settings, terrain }`. Browser automation can't take pointer lock, so to drive the game set `zarch.input.locked = true`, then set `aimX`/`aimY`/`thrust`/`fire`. Also hide `#overlay` before taking screenshots. Settings persist in the browser's `localStorage` under `zarch.settings.v1`, so clear that key after testing.

### Coordinate conventions

- Y is up. The camera has a fixed orientation: it always looks north (-z) from behind and above the craft, and only its position follows the craft.
- Screen up (aim +y) maps to world -z, and screen right maps to +x.
- The craft's heading is `atan2(tilt.x, -tilt.z)`. The nose is along local -z.
