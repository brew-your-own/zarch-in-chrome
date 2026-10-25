import * as THREE from 'three';
import { MouseInput } from './input';
import { BulletView } from './render/bulletView';
import { CraftView } from './render/craftView';
import { EffectsView } from './render/effectsView';
import { ExhaustView } from './render/exhaustView';
import { SUN } from './render/lighting';
import { Palette } from './render/palette';
import { TerrainView } from './render/terrainView';
import { TreeView } from './render/treeView';
import { loadSettings, saveSettings } from './settings';
import { createCannon, stepCannon } from './sim/cannon';
import { spawnCraft, stepCraft } from './sim/craft';
import { buildMap, findMap } from './sim/maps';
import type { Terrain } from './sim/terrain';
import { SettingsPanel } from './ui/settingsPanel';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
/** Camera sits behind (south of) and above the craft, always looking north. */
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, 7);
const CAMERA_PITCH = -0.55;
const CAMERA_FOLLOW_Y = 3;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;

const settings = loadSettings();
const { physics, plume, colours } = settings;
let terrain: Terrain = buildMap(findMap(settings.mapId));
const craft = spawnCraft(terrain, physics);
const cannon = createCannon();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
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
  sceneObjects = [
    terrainView.mesh,
    treeView.shadow,
    ...treeView.meshes,
    craftView.shadow,
    craftView.craft,
    exhaustView.points,
    bulletView.tracers,
    bulletView.heads,
    effectsView.debris,
    effectsView.particles,
  ];
  scene.add(...sceneObjects);
}
buildViews();

let started = false;
const input = new MouseInput(canvas, (locked) => {
  if (locked) {
    started = true;
    panel.hide();
  } else {
    panel.show(terrain, palette, craft.pos, started);
  }
});

const panel = new SettingsPanel(overlay, settings, {
  onFly: () => input.requestLock(),
  onChange: () => saveSettings(settings),
  onMapChange: (mapId) => {
    settings.mapId = mapId;
    saveSettings(settings);
    terrain = buildMap(findMap(mapId));
    Object.assign(craft, spawnCraft(terrain, physics));
    Object.assign(cannon, createCannon());
    buildViews();
    resetMotion();
    panel.show(terrain, palette, craft.pos, started);
  },
});
panel.show(terrain, palette, craft.pos, started);

// Dev-only handle for poking at the game from the console or browser automation.
// Setting `zarch.input.locked = true` runs the simulation without pointer lock.
if (import.meta.env.DEV) {
  Object.assign(window, { zarch: { craft, cannon, input, settings, get terrain() { return terrain; } } });
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

function frame(now: number) {
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;

  if (input.locked) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      Object.assign(prevPos, craft.pos);
      // Mouse movement is ignored while landed, so every liftoff starts from a centred aim.
      if (craft.status === 'landed') input.centre();
      const wasCrashed = craft.status === 'crashed';
      stepCraft(craft, input.snapshot(), terrain, STEP, physics);
      if (!wasCrashed && craft.status === 'crashed') {
        // The mesh still holds its last pose, which is where the pieces start from.
        effectsView.explode(craftView.craft.geometry, craftView.craft.matrixWorld, craft.vel);
      }
      for (const impact of stepCannon(cannon, craft, input.fire, terrain, STEP, physics)) effectsView.impact(impact);
      accumulator -= STEP;
    }
  }

  // Interpolate between the last two simulation states for smooth motion at any refresh rate.
  const alpha = accumulator / STEP;
  renderPos.x = prevPos.x + (craft.pos.x - prevPos.x) * alpha;
  renderPos.y = prevPos.y + (craft.pos.y - prevPos.y) * alpha;
  renderPos.z = prevPos.z + (craft.pos.z - prevPos.z) * alpha;

  cameraY += (renderPos.y - cameraY) * Math.min(1, elapsed * CAMERA_FOLLOW_Y);
  camera.position.set(renderPos.x, cameraY, renderPos.z).add(CAMERA_OFFSET);

  terrainView.update(renderPos.x, renderPos.z);
  treeView.update(renderPos.x, renderPos.z);
  craftView.update(craft, renderPos);
  const effectsDt = input.locked ? elapsed : 0;
  exhaustView.update(craft, craftView.craft.matrixWorld, effectsDt);
  bulletView.update(cannon.bullets);
  effectsView.update(effectsDt, physics.gravity);
  renderer.render(scene, camera);

  const ground = terrain.heightAt(craft.pos.x, craft.pos.z);
  const speed = craft.status === 'crashed' ? 0 : Math.hypot(craft.vel.x, craft.vel.y, craft.vel.z);
  hud.textContent = [
    `FUEL  ${'#'.repeat(Math.ceil((craft.fuel / physics.maxFuel) * 20)).padEnd(20, '.')}`,
    `ALT   ${(craft.pos.y - ground).toFixed(1)}`,
    `SPEED ${speed.toFixed(1)}`,
    craft.status === 'crashed' ? 'CRASHED' : craft.status === 'landed' ? 'LANDED' : '',
  ].join('\n');

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
