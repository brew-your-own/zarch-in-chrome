import * as THREE from 'three';
import { MouseInput } from './input';
import { CraftView } from './render/craftView';
import { ExhaustView } from './render/exhaustView';
import { TerrainView } from './render/terrainView';
import { CRAFT, spawnCraft, stepCraft } from './sim/craft';
import { generateTerrain } from './sim/terrain';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
/** Camera sits behind (south of) and above the craft, always looking north. */
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, 7);
const CAMERA_PITCH = -0.55;
const CAMERA_FOLLOW_Y = 3;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;

const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1987);
const terrain = generateTerrain(seed);
const craft = spawnCraft(terrain);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-0.5, 1, 0.35);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.rotation.set(CAMERA_PITCH, 0, 0);

const terrainView = new TerrainView(terrain);
const craftView = new CraftView(terrain);
const exhaustView = new ExhaustView(terrain);
scene.add(terrainView.mesh, craftView.shadow, craftView.craft, exhaustView.points);

const input = new MouseInput(canvas, (locked) => overlay.classList.toggle('hidden', locked));
overlay.addEventListener('click', () => input.requestLock());

// Dev-only handle for poking at the game from the console or browser automation.
// Setting `zarch.input.locked = true` runs the simulation without pointer lock.
if (import.meta.env.DEV) Object.assign(window, { zarch: { craft, input, terrain } });

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

function frame(now: number) {
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;

  if (input.locked) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      Object.assign(prevPos, craft.pos);
      // Mouse movement is ignored while landed, so every liftoff starts from a centred aim.
      if (craft.status === 'landed') input.centre();
      stepCraft(craft, input.snapshot(), terrain, STEP);
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
  craftView.update(craft, renderPos);
  exhaustView.update(craft, craftView.craft.matrixWorld, input.locked ? elapsed : 0);
  renderer.render(scene, camera);

  const ground = terrain.heightAt(craft.pos.x, craft.pos.z);
  const speed = Math.hypot(craft.vel.x, craft.vel.y, craft.vel.z);
  hud.textContent = [
    `FUEL  ${'#'.repeat(Math.ceil((craft.fuel / CRAFT.MAX_FUEL) * 20)).padEnd(20, '.')}`,
    `ALT   ${(craft.pos.y - ground).toFixed(1)}`,
    `SPEED ${speed.toFixed(1)}`,
    craft.status === 'crashed' ? 'CRASHED' : craft.status === 'landed' ? 'LANDED' : '',
  ].join('\n');

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
