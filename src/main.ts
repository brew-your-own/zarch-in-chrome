import * as THREE from 'three';
import { proximityLevel, SoundEngine } from './audio/sound';
import { MouseInput } from './input';
import { BulletView, FIGHTER_TRACER } from './render/bulletView';
import { CameraRig } from './render/cameraRig';
import { CraftView } from './render/craftView';
import { EffectsView } from './render/effectsView';
import { ExhaustView } from './render/exhaustView';
import { FighterView } from './render/fighterView';
import { MissileView } from './render/missileView';
import { SUN } from './render/lighting';
import { Palette } from './render/palette';
import { SeederView } from './render/seederView';
import { SkyView } from './render/skyView';
import { TerrainView } from './render/terrainView';
import { TreeView } from './render/treeView';
import { loadSettings, saveSettings } from './settings';
import { createAutopilot, stepAutopilot, toggleAutopilot } from './sim/autopilot';
import { createCannon, stepCannon } from './sim/cannon';
import { spawnCraft, stepCraft } from './sim/craft';
import { createEnemies, isOverrun, nearestEnemyDistance, stepEnemies, type EnemyEvent } from './sim/enemies';
import { buildMap, findMap } from './sim/maps';
import { createArsenal, detonateBomb, fireMissile, restock, stepMissiles, type WeaponEvent } from './sim/weapons';
import type { Terrain } from './sim/terrain';
import { GameOverScreen, recordScore, type GameOverStats } from './ui/gameOver';
import { Hud } from './ui/hud';
import { Scanner } from './ui/scanner';
import { SettingsPanel } from './ui/settingsPanel';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = new Hud(document.querySelector<HTMLDivElement>('#hud')!, document.body);
const scanner = new Scanner(document.querySelector<HTMLCanvasElement>('#scanner')!);
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;

const settings = loadSettings();
const { physics, plume, colours } = settings;
let terrain: Terrain = buildMap(findMap(settings.mapId));
const craft = spawnCraft(terrain, physics);
const cannon = createCannon();
const autopilot = createAutopilot();
const arsenal = createArsenal();
/** Set by Space / a missile press, and acted on in the next sim step. */
let bombRequested = false;
const startingLives = () => Math.max(1, Math.round(settings.enemies.lives));
/** Craft left, including the one flying. Reaching 0 ends the game once the wreck has burned a moment. */
let lives = startingLives();
/** With no lives left, the game ends this many seconds before the wreck would respawn. */
const LAST_WRECK_PAUSE = 0.6;
/** Set when the autopilot hands back control, so a thrust button still held doesn't take straight off again. */
let thrustHeldOver = false;
const sound = new SoundEngine(settings.sound);
/** Shots already played, to sound each new one once. */
let shotsHeard = 0;
const newEnemies = () => createEnemies((Math.random() * 2 ** 32) >>> 0);
const enemies = newEnemies();
/** Simulated seconds, frozen while paused; drives the seeders' spin. */
let simTime = 0;
/** Seconds of unpaused play, for cosmetic motion such as the waves. */
let waveTime = 0;
/** Seconds until another small splash may sound, so a shower of shards doesn't stack up. */
let splashQuiet = 0;
const SPLASH_GAP = 0.12;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(SUN.x, SUN.y, SUN.z);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const rig = new CameraRig(camera, settings.camera);
rig.snap(craft.pos.y);

// Views hold the terrain they draw, so they are rebuilt when the map changes.
let terrainView: TerrainView;
let craftView: CraftView;
let exhaustView: ExhaustView;
let treeView: TreeView;
let bulletView: BulletView;
let shotView: BulletView;
let fighterView: FighterView;
let missileView: MissileView;
let effectsView: EffectsView;
let seederView: SeederView;
let skyView: SkyView;
let palette!: Palette; // assigned by buildViews()
let sceneObjects: (THREE.Mesh | THREE.Points | THREE.LineSegments)[] = [];

function buildViews() {
  for (const old of sceneObjects) {
    scene.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
    if (old instanceof THREE.InstancedMesh) old.dispose();
  }
  palette = new Palette(terrain, colours);
  terrainView = new TerrainView(terrain, palette);
  treeView = new TreeView(terrain, palette);
  craftView = new CraftView(terrain, physics);
  exhaustView = new ExhaustView(terrain, physics, plume);
  bulletView = new BulletView();
  shotView = new BulletView(FIGHTER_TRACER);
  fighterView = new FighterView(terrain);
  missileView = new MissileView();
  effectsView = new EffectsView(terrain);
  seederView = new SeederView(terrain);
  skyView = new SkyView(terrain.size);
  // The dome fills the background; the fog fades the edge of the terrain patch into its glow.
  scene.fog = skyView.fog;
  sceneObjects = [
    skyView.dome,
    skyView.stars,
    terrainView.mesh,
    treeView.shadow,
    ...treeView.meshes,
    craftView.shadow,
    craftView.craft,
    exhaustView.points,
    bulletView.tracers,
    bulletView.heads,
    shotView.tracers,
    shotView.heads,
    fighterView.shadows,
    fighterView.fighters,
    missileView.missiles,
    effectsView.shockwave,
    seederView.shadows,
    seederView.seeders,
    seederView.spores,
    effectsView.debris,
    effectsView.particles,
  ];
  scene.add(...sceneObjects);
}
buildViews();

let started = false;
/** Set when the virus takes over; the sim stays frozen until a new game starts. */
let gameOver: { stats: GameOverStats; newBest: boolean } | null = null;

const showPanel = () => panel.show(terrain, palette, craft.pos, started && !gameOver, [...enemies.seeders, ...enemies.fighters]);

const input = new MouseInput(canvas, (locked) => {
  if (locked) {
    started = true;
    panel.hide();
    gameOverScreen.hide();
  } else if (gameOver) {
    gameOverScreen.show(gameOver.stats, gameOver.newBest);
  } else {
    showPanel();
  }
});

/** Fresh world on `mapId`: terrain (trees regrown, no infection), craft, cannon and enemies. */
function newGame(mapId: string) {
  terrain = buildMap(findMap(mapId));
  Object.assign(craft, spawnCraft(terrain, physics));
  Object.assign(cannon, createCannon());
  Object.assign(autopilot, createAutopilot());
  Object.assign(arsenal, createArsenal());
  lives = startingLives();
  Object.assign(enemies, newEnemies());
  buildViews();
  resetMotion();
  gameOver = null;
}

function endGame(reason: GameOverStats['reason']) {
  const stats = { reason, score: enemies.score, wave: enemies.wave, infected: terrain.infectedFraction() };
  gameOver = { stats, newBest: recordScore(stats.score) };
  gameOverScreen.show(gameOver.stats, gameOver.newBest);
  document.exitPointerLock();
}

const panel = new SettingsPanel(overlay, settings, {
  onFly: () => {
    if (gameOver) newGame(settings.mapId);
    sound.resume(); // a click: browsers only allow audio to start from a user gesture
    input.requestLock();
  },
  onChange: () => saveSettings(settings),
  onMapChange: (mapId) => {
    settings.mapId = mapId;
    saveSettings(settings);
    newGame(mapId);
    showPanel();
  },
});

const gameOverScreen = new GameOverScreen(document.querySelector<HTMLDivElement>('#gameover')!, {
  onPlayAgain: () => {
    newGame(settings.mapId);
    sound.resume();
    gameOverScreen.hide();
    input.requestLock();
  },
  onSettings: () => {
    gameOverScreen.hide();
    showPanel();
  },
});
showPanel();

// R engages auto-refuel (once per wave), or hands control back if it is flying.
// Space sets off a smart bomb; E fires a homing missile (as does the middle button).
document.addEventListener('keydown', (e) => {
  if (e.repeat || !input.locked || gameOver) return;
  if (e.code === 'KeyR') {
    const wasActive = autopilot.active;
    if (toggleAutopilot(autopilot, craft, terrain, enemies.wave, settings.autopilot) && !wasActive) sound.autopilot();
  } else if (e.code === 'Space') {
    e.preventDefault();
    bombRequested = true;
  } else if (e.code === 'KeyE') {
    input.missile = true;
  }
});

// Dev-only handle for poking at the game from the console or browser automation.
// Setting `zarch.input.locked = true` runs the simulation without pointer lock.
if (import.meta.env.DEV) {
  Object.assign(window, {
    zarch: { craft, cannon, autopilot, arsenal, enemies, input, settings, sound, get lives() { return lives; }, get terrain() { return terrain; }, get gameOver() { return gameOver; } },
  });
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const prevPos = { ...craft.pos };
const renderPos = { ...craft.pos };
let accumulator = 0;
let last = performance.now();

/** Snaps interpolation and camera to the craft, e.g. after a teleport to a new map. */
function resetMotion() {
  Object.assign(prevPos, craft.pos);
  rig.snap(craft.pos.y);
  accumulator = 0;
}

/** Explosions, effects and sounds for what the enemies and special weapons did this step. */
function showEvent(event: EnemyEvent | WeaponEvent) {
  switch (event.type) {
    case 'seederDestroyed': {
      const { geometry, matrix } = seederView.shape(event.seeder, craft.pos, simTime);
      effectsView.explode(geometry, matrix, event.seeder.vel);
      sound.explosion('seeder', distanceFromCraft(event.seeder.pos));
      rig.shake(0.5, distanceFromCraft(event.seeder.pos));
      break;
    }
    case 'fighterDestroyed': {
      const { geometry, matrix } = fighterView.shape(event.fighter, craft.pos);
      effectsView.explode(geometry, matrix, event.fighter.vel);
      sound.explosion('fighter', distanceFromCraft(event.fighter.pos));
      rig.shake(0.55, distanceFromCraft(event.fighter.pos));
      break;
    }
    case 'fighterFired':
      sound.enemyShot(distanceFromCraft(event.pos));
      break;
    case 'waveStarted':
      restock(arsenal, event.wave, settings.weapons);
      break;
    case 'bombDetonated':
      effectsView.bomb(event.pos, event.radius);
      sound.bomb();
      rig.shake(1);
      flash();
      break;
    case 'missileLaunched':
      sound.missile();
      break;
    case 'missileSpent':
      effectsView.pop(event.pos);
      sound.explosion('tree', distanceFromCraft(event.pos));
      break;
  }
}

/** A brief white flash over the whole screen, for a smart bomb. */
const flashOverlay = document.createElement('div');
flashOverlay.className = 'flash';
document.body.append(flashOverlay);
function flash() {
  flashOverlay.classList.remove('go');
  void flashOverlay.offsetWidth; // restart the animation
  flashOverlay.classList.add('go');
}

/** Horizontal distance from the craft across the wrapping world. */
function distanceFromCraft(pos: { x: number; z: number }): number {
  return Math.hypot(terrain.delta(craft.pos.x, pos.x), terrain.delta(craft.pos.z, pos.z));
}

/** Proximity alarm level (0-1) for the nearest seeder; silent while paused, over or wrecked. */
function proximityAlert(): number {
  if (!input.locked || gameOver || craft.status === 'crashed') return 0;
  return proximityLevel(nearestEnemyDistance(enemies, craft.pos, terrain), settings.sound.alertDistance);
}

/**
 * How tense the music should be, 0-1: a base while flying, more once enemies are about,
 * as the virus spreads, as an enemy closes in (the proximity alarm level) and on the last life.
 */
function musicIntensity(alert: number): number {
  if (!input.locked || gameOver) return 0;
  const virus = Math.min(1, terrain.infectedFraction() / Math.max(0.01, settings.enemies.overrunAt));
  const enemiesAbout = enemies.seeders.length + enemies.fighters.length > 0 ? 0.15 : 0;
  return 0.2 + enemiesAbout + 0.35 * virus + 0.4 * alert + (lives === 1 ? 0.1 : 0);
}

/** Continuous and per-shot sounds for this frame (explosions play from the sim events). */
function playSounds(alert: number, dt: number) {
  sound.update();
  sound.music(musicIntensity(alert), !input.locked || gameOver !== null, dt);
  sound.thruster(input.locked && !gameOver && craft.thrusting);
  sound.proximity(alert);
  if (cannon.shots < shotsHeard) shotsHeard = 0; // a new game reset the cannon
  // At most two blips per frame, so a long frame doesn't stack a burst of shots.
  for (let k = 0; k < Math.min(2, cannon.shots - shotsHeard); k++) sound.cannon();
  shotsHeard = cannon.shots;
}

function frame(now: number) {
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;

  if (input.locked && !gameOver) {
    accumulator += elapsed;
    while (accumulator >= STEP && !gameOver) {
      Object.assign(prevPos, craft.pos);
      // Mouse movement is ignored while landed, so every liftoff starts from a centred aim.
      if (craft.status === 'landed') input.centre();
      const wasCrashed = craft.status === 'crashed';
      simTime += STEP;
      const wasAuto = autopilot.active;
      const auto = stepAutopilot(autopilot, craft, terrain, physics, settings.autopilot);
      if (auto) {
        // Keep the mouse aim with the autopilot's, so taking back control doesn't jolt the craft.
        input.aimX = auto.aimX;
        input.aimY = auto.aimY;
      }
      if (wasAuto && !auto) thrustHeldOver = true; // landed on the pad (a cancel with R hands over at once)
      if (!input.thrust) thrustHeldOver = false;
      const manual = input.snapshot();
      if (thrustHeldOver) manual.thrust = false;
      stepCraft(craft, auto ?? manual, terrain, STEP, physics);
      for (const impact of stepCannon(cannon, craft, input.fire, terrain, STEP, physics)) {
        effectsView.impact(impact);
        if (impact.kind === 'sea' && splashQuiet <= 0) {
          sound.splash(0.1, distanceFromCraft(impact.pos));
          splashQuiet = SPLASH_GAP;
        }
        if (impact.tree) {
          const { geometry, matrix } = treeView.shape(impact.tree.i, impact.tree.j, impact.tree.kind);
          effectsView.destroyTree(geometry, matrix, impact);
          sound.explosion('tree', distanceFromCraft(impact.pos));
          rig.shake(0.2, distanceFromCraft(impact.pos));
          geometry.dispose();
        }
      }
      for (const event of stepEnemies(enemies, craft, cannon.bullets, terrain, STEP, settings.enemies, physics)) showEvent(event);
      if (bombRequested) {
        bombRequested = false;
        detonateBomb(arsenal, craft, enemies, terrain, settings.weapons)?.forEach(showEvent);
      }
      if (input.missile) {
        input.missile = false;
        const launch = fireMissile(arsenal, craft, enemies, terrain, physics);
        if (launch) showEvent(launch);
      }
      for (const event of stepMissiles(arsenal, enemies, terrain, STEP, settings.weapons)) showEvent(event);
      if (!wasCrashed && craft.status === 'crashed') {
        // The mesh still holds its last pose, which is where the pieces start from.
        effectsView.explode(craftView.craft.geometry, craftView.craft.matrixWorld, craft.vel);
        sound.explosion('craft');
        if (terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'sea') sound.splash(1, 0);
        rig.shake(0.9);
        lives--;
      }
      accumulator -= STEP;
      if (isOverrun(terrain, settings.enemies)) endGame('virus');
      else if (lives <= 0 && craft.status === 'crashed' && craft.respawnIn <= LAST_WRECK_PAUSE) endGame('lives');
    }
  }

  // Interpolate between the last two simulation states for smooth motion at any refresh rate.
  const alpha = accumulator / STEP;
  renderPos.x = prevPos.x + (craft.pos.x - prevPos.x) * alpha;
  renderPos.y = prevPos.y + (craft.pos.y - prevPos.y) * alpha;
  renderPos.z = prevPos.z + (craft.pos.z - prevPos.z) * alpha;

  const effectsDt = input.locked ? elapsed : 0;
  const groundY = terrain.heightAt(renderPos.x, renderPos.z);
  rig.update(renderPos, craft, groundY, elapsed, effectsDt);

  skyView.update(camera, renderPos.x, groundY, elapsed);
  waveTime += effectsDt;
  terrainView.update(renderPos.x, renderPos.z, waveTime);
  treeView.update(renderPos.x, renderPos.z);
  craftView.update(craft, renderPos);
  exhaustView.update(craft, craftView.craft.matrixWorld, effectsDt);
  bulletView.update(cannon.bullets);
  missileView.update(arsenal.inFlight);
  if (effectsDt > 0) for (const m of arsenal.inFlight) effectsView.missileTrail(m.pos);
  shotView.update(enemies.shots, { terrain, focus: renderPos });
  fighterView.update(enemies, renderPos, effectsDt);
  seederView.update(enemies, renderPos, simTime);
  const sunk = effectsView.update(effectsDt, physics.gravity);
  splashQuiet -= elapsed;
  if (sunk.length > 0 && splashQuiet <= 0) {
    sound.splash(0.25, distanceFromCraft(sunk[0]!));
    splashQuiet = SPLASH_GAP;
  }
  renderer.render(scene, camera);

  const alert = proximityAlert();
  hud.update(craft, physics, enemies, settings.enemies, terrain, autopilot, settings.autopilot, alert, lives, arsenal, effectsDt);
  playSounds(alert, elapsed);
  scanner.update(terrain, palette, craft, enemies, settings.sound.alertDistance, alert, elapsed);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
