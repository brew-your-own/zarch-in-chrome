import * as THREE from 'three';
import { proximityLevel, SoundEngine } from './audio/sound';
import { MouseInput } from './input';
import { BulletView } from './render/bulletView';
import { CraftView } from './render/craftView';
import { EffectsView } from './render/effectsView';
import { ExhaustView } from './render/exhaustView';
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
import { createEnemies, isOverrun, nearestSeederDistance, stepEnemies } from './sim/enemies';
import { buildMap, findMap } from './sim/maps';
import type { Terrain } from './sim/terrain';
import { GameOverScreen, recordScore, type GameOverStats } from './ui/gameOver';
import { Hud } from './ui/hud';
import { Scanner } from './ui/scanner';
import { SettingsPanel } from './ui/settingsPanel';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
/** Camera sits behind (south of) and above the craft, always looking north. */
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, 7);
const CAMERA_PITCH = -0.55;
const CAMERA_FOLLOW_Y = 3;

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
/** Set when the autopilot hands back control, so a thrust button still held doesn't take straight off again. */
let thrustHeldOver = false;
const sound = new SoundEngine(settings.sound);
/** Shots already played, to sound each new one once. */
let shotsHeard = 0;
const newEnemies = () => createEnemies((Math.random() * 2 ** 32) >>> 0);
const enemies = newEnemies();
/** Simulated seconds, frozen while paused; drives the seeders' spin. */
let simTime = 0;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(SUN.x, SUN.y, SUN.z);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.rotation.set(CAMERA_PITCH, 0, 0);

// Views hold the terrain they draw, so they are rebuilt when the map changes.
let terrainView: TerrainView;
let craftView: CraftView;
let exhaustView: ExhaustView;
let treeView: TreeView;
let bulletView: BulletView;
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

const showPanel = () => panel.show(terrain, palette, craft.pos, started && !gameOver, enemies.seeders);

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
  Object.assign(enemies, newEnemies());
  buildViews();
  resetMotion();
  gameOver = null;
}

function endGame() {
  const stats = { score: enemies.score, wave: enemies.wave, infected: terrain.infectedFraction() };
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
document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR' || e.repeat || !input.locked || gameOver) return;
  const wasActive = autopilot.active;
  if (toggleAutopilot(autopilot, craft, terrain, enemies.wave, settings.autopilot) && !wasActive) sound.autopilot();
});

// Dev-only handle for poking at the game from the console or browser automation.
// Setting `zarch.input.locked = true` runs the simulation without pointer lock.
if (import.meta.env.DEV) {
  Object.assign(window, {
    zarch: { craft, cannon, autopilot, enemies, input, settings, sound, get terrain() { return terrain; }, get gameOver() { return gameOver; } },
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
let cameraY = craft.pos.y;
let accumulator = 0;
let last = performance.now();

/** Snaps interpolation and camera to the craft, e.g. after a teleport to a new map. */
function resetMotion() {
  Object.assign(prevPos, craft.pos);
  cameraY = craft.pos.y;
  accumulator = 0;
}

/** Horizontal distance from the craft across the wrapping world. */
function distanceFromCraft(pos: { x: number; z: number }): number {
  return Math.hypot(terrain.delta(craft.pos.x, pos.x), terrain.delta(craft.pos.z, pos.z));
}

/** Proximity alarm level (0-1) for the nearest seeder; silent while paused, over or wrecked. */
function proximityAlert(): number {
  if (!input.locked || gameOver || craft.status === 'crashed') return 0;
  return proximityLevel(nearestSeederDistance(enemies, craft.pos, terrain), settings.sound.alertDistance);
}

/** Continuous and per-shot sounds for this frame (explosions play from the sim events). */
function playSounds(alert: number) {
  sound.update();
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
        if (impact.tree) {
          const { geometry, matrix } = treeView.shape(impact.tree.i, impact.tree.j, impact.tree.kind);
          effectsView.destroyTree(geometry, matrix, impact);
          sound.explosion('tree', distanceFromCraft(impact.pos));
          geometry.dispose();
        }
      }
      for (const event of stepEnemies(enemies, craft, cannon.bullets, terrain, STEP, settings.enemies, physics)) {
        if (event.type !== 'seederDestroyed') continue;
        const { geometry, matrix } = seederView.shape(event.seeder, craft.pos, simTime);
        effectsView.explode(geometry, matrix, event.seeder.vel);
        sound.explosion('seeder', distanceFromCraft(event.seeder.pos));
      }
      if (!wasCrashed && craft.status === 'crashed') {
        // The mesh still holds its last pose, which is where the pieces start from.
        effectsView.explode(craftView.craft.geometry, craftView.craft.matrixWorld, craft.vel);
        sound.explosion('craft');
      }
      accumulator -= STEP;
      if (isOverrun(terrain, settings.enemies)) endGame();
    }
  }

  // Interpolate between the last two simulation states for smooth motion at any refresh rate.
  const alpha = accumulator / STEP;
  renderPos.x = prevPos.x + (craft.pos.x - prevPos.x) * alpha;
  renderPos.y = prevPos.y + (craft.pos.y - prevPos.y) * alpha;
  renderPos.z = prevPos.z + (craft.pos.z - prevPos.z) * alpha;

  cameraY += (renderPos.y - cameraY) * Math.min(1, elapsed * CAMERA_FOLLOW_Y);
  camera.position.set(renderPos.x, cameraY, renderPos.z).add(CAMERA_OFFSET);

  skyView.update(camera, renderPos.x, terrain.heightAt(renderPos.x, renderPos.z), elapsed);
  terrainView.update(renderPos.x, renderPos.z);
  treeView.update(renderPos.x, renderPos.z);
  craftView.update(craft, renderPos);
  const effectsDt = input.locked ? elapsed : 0;
  exhaustView.update(craft, craftView.craft.matrixWorld, effectsDt);
  bulletView.update(cannon.bullets);
  seederView.update(enemies, renderPos, simTime);
  effectsView.update(effectsDt, physics.gravity);
  renderer.render(scene, camera);

  const alert = proximityAlert();
  hud.update(craft, physics, enemies, settings.enemies, terrain, autopilot, settings.autopilot, alert, effectsDt);
  playSounds(alert);
  scanner.update(terrain, palette, craft, enemies, settings.sound.alertDistance, alert, elapsed);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
