import * as THREE from 'three';
import { proximityLevel, SoundEngine } from './audio/sound';
import { PlayerInput } from './input';
import { BomberView } from './render/bomberView';
import { BuildingView } from './render/buildingView';
import { BulletView, FIGHTER_TRACER } from './render/bulletView';
import { CameraRig } from './render/cameraRig';
import { CraftView } from './render/craftView';
import { EffectsView } from './render/effectsView';
import { ExhaustView } from './render/exhaustView';
import { FighterView } from './render/fighterView';
import { MissileView } from './render/missileView';
import { PestView } from './render/pestView';
import { SUN } from './render/lighting';
import { Palette } from './render/palette';
import { SeederView } from './render/seederView';
import { SkyView } from './render/skyView';
import { BASE_PATCH, patch as drawnPatch, setViewRange, TerrainView } from './render/terrainView';
import { TreeView } from './render/treeView';
import { loadSettings, saveSettings } from './settings';
import { createAutopilot, stepAutopilot, toggleAutopilot } from './sim/autopilot';
import { createCannon, stepCannon } from './sim/cannon';
import { spawnCraft, stepCraft } from './sim/craft';
import { createDemoPilot, DEMO_ENEMIES, GAME_REACH, stepDemoPilot } from './sim/demoPilot';
import { buildingBase } from './sim/buildings';
import { buildingsLost, createEnemies, enemyCount, isOverrun, jumpToWave, nearestEnemyDistance, stepEnemies, targets, type EnemyEvent } from './sim/enemies';
import { buildMap, findMap } from './sim/maps';
import { createArsenal, detonateBomb, fireMissile, restock, stepMissiles, type WeaponEvent } from './sim/weapons';
import type { Terrain } from './sim/terrain';
import { buildTitleMap, lettersInfected, type TitleMap } from './sim/titleMap';
import { FieldGuide } from './ui/fieldGuide';
import { HowToPlay, howToPlaySeen } from './ui/howToPlay';
import { GameOverScreen, recordScore, type GameOverStats } from './ui/gameOver';
import { ComboMeter } from './ui/comboMeter';
import { GateView } from './render/gateView';
import { GhostView } from './render/ghostView';
import { buildCourse, createRace, ghostPose, stepRace, type RaceEvent, type RaceState } from './sim/race';
import { flyCourse } from './sim/racePilot';
import { RaceHud } from './ui/raceHud';
import { loadRecord, saveRecord } from './ui/raceRecords';
import { RaceResultScreen } from './ui/raceResult';
import { ScorePopups } from './ui/scorePopups';
import { Hud } from './ui/hud';
import { Scanner } from './ui/scanner';
import { SettingsPanel, type DebugAids } from './ui/settingsPanel';
import { TitleScreen, type ControlSignals } from './ui/titleScreen';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = new Hud(document.querySelector<HTMLDivElement>('#hud')!, document.body);
const comboMeter = new ComboMeter(document.body);
const hudEl = document.querySelector<HTMLDivElement>('#hud')!;
const raceHud = new RaceHud(document.body);
const scorePopups = new ScorePopups(document.body);
const scanner = new Scanner(document.querySelector<HTMLCanvasElement>('#scanner')!);
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const hudColumn = document.querySelector<HTMLDivElement>('#hud-column')!;
/** The trackpad scheme's aim gauge: where the virtual cursor sits in the tilt disk. */
const aimGauge = document.querySelector<HTMLDivElement>('#aim')!;
const aimDot = aimGauge.querySelector<HTMLSpanElement>('.aim-dot')!;

const settings = loadSettings();
const { physics, plume, colours } = settings;
/**
 * The game runs in one of two modes. On the title screen (attract mode) the demo pilot flies
 * the craft on the title map, unpaused and silent; in a game the player flies on `settings.mapId`.
 */
let mode: 'title' | 'game' = 'title';
/** The title map, while on the title screen. */
let title: TitleMap | null = buildTitleMap();
let terrain: Terrain = title.terrain;
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
const newDemo = () => createDemoPilot((Math.random() * 2 ** 32) >>> 0);
const demo = newDemo();
/** The title screen's enemies, kept apart from the player's settings. */
const demoEnemies = { ...DEMO_ENEMIES };
/** Once this share of the title lettering is infected, the demo has lost and starts again. */
const DEMO_LOST_AT = 0.9;
/** Seconds the lost demo world stays up, with its banner, before it starts again; 0 while in play. */
const DEMO_RESTART_DELAY = 3;
let demoRestartIn = 0;
/** The title camera stands this far back (times the usual offset), and leaves it slowly when a game starts. */
const TITLE_PULL = 2.3;
/** The title camera centres between the lettering and the craft, this share of the way to the craft... */
const TITLE_FOLLOW = 0.4;
/** ...and this far south of the lettering, so the word sits above the controls at the bottom. */
const TITLE_SOUTH = 3.5;
/** The drawn patch is centred this far south of the title focus, to cover the near ground the camera sees from back there. */
const TITLE_PATCH_SOUTH = 5;
/** How quickly the title camera's focus follows (1/s). */
const TITLE_FOCUS_RATE = 1.2;
/** Controls the demo pilot used during this frame's sim steps, for the title screen to light. */
let demoSignals: ControlSignals = {};
/** The frame rate shown in the HUD, smoothed over about `1 / FPS_SMOOTHING` seconds. */
const FPS_SMOOTHING = 2;
let fps = 60;
/** Simulated seconds, frozen while paused; drives the seeders' spin. */
let simTime = 0;
/**
 * Testing aids from the panel's Debug section. Never saved, so they are off on every page
 * load. A game that used one, or the wave jump, doesn't count for the best score.
 */
const debug: DebugAids = { invulnerable: false, infiniteFuel: false };
let debugUsed = false;
/**
 * Demo mode: a real game on the chosen map, flown by the demo pilot (`GAME_REACH`), with no
 * pointer lock. Esc pauses it with the settings panel (`autoPaused`). It never counts for the
 * best score.
 */
let autoplay = false;
let autoPaused = false;
const demoBadge = document.querySelector<HTMLDivElement>('#demo-badge')!;
/**
 * Race mode: a game with no enemies where the player flies `race`'s gates round the map against
 * the clock, then lands on the pad. `raceBest` is the run to beat, with its ghost: the player's
 * best on this map, or the computer's (`PAR`) until there is one. `raceDone` freezes the sim
 * once the craft is down, under the result screen.
 */
let race: RaceState | null = null;
let raceBest: { time: number; splits: number[]; ghost: number[]; who: 'YOU' | 'PAR' } | null = null;
let raceDone = false;
/** The computer's run on each map (and physics), worked out the first time it is raced. */
const parRuns = new Map<string, RaceState>();
/** Whether a game is running now: the player's with the pointer locked, or the demo unpaused. */
const live = () => mode === 'game' && !gameOver && !raceDone && (input.locked || (autoplay && !autoPaused));
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
let buildingView: BuildingView;
let bulletView: BulletView;
let shotView: BulletView;
let fighterView: FighterView;
let bomberView: BomberView;
let pestView: PestView;
let missileView: MissileView;
let effectsView: EffectsView;
let seederView: SeederView;
let skyView: SkyView;
let gateView: GateView | null = null;
let ghostView: GhostView | null = null;
let palette!: Palette; // assigned by buildViews()
let sceneObjects: (THREE.Mesh | THREE.Points | THREE.LineSegments)[] = [];

function buildViews() {
  for (const old of sceneObjects) {
    scene.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
    if (old instanceof THREE.InstancedMesh) old.dispose();
  }
  if (gateView) {
    scene.remove(gateView.group);
    gateView.dispose();
  }
  if (ghostView) {
    scene.remove(ghostView.mesh);
    ghostView.dispose();
  }
  gateView = new GateView(terrain);
  ghostView = new GhostView(terrain);
  scene.add(gateView.group, ghostView.mesh);
  palette = new Palette(terrain, colours, title?.letters ?? null);
  terrainView = new TerrainView(terrain, palette);
  treeView = new TreeView(terrain, palette);
  buildingView = new BuildingView(terrain);
  craftView = new CraftView(terrain, physics, settings.ship);
  exhaustView = new ExhaustView(terrain, physics, plume);
  bulletView = new BulletView();
  shotView = new BulletView(FIGHTER_TRACER);
  fighterView = new FighterView(terrain);
  bomberView = new BomberView(terrain);
  pestView = new PestView(terrain);
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
    buildingView.shadow,
    ...buildingView.meshes,
    craftView.shadow,
    craftView.craft,
    exhaustView.points,
    bulletView.tracers,
    bulletView.heads,
    shotView.tracers,
    shotView.heads,
    fighterView.shadows,
    fighterView.fighters,
    bomberView.shadows,
    bomberView.bombers,
    pestView.shadows,
    pestView.pests,
    missileView.missiles,
    effectsView.shockwave,
    seederView.shadows,
    seederView.seeders,
    seederView.mutants,
    seederView.spores,
    effectsView.debris,
    effectsView.particles,
  ];
  scene.add(...sceneObjects);
}
buildViews();

/** Set when the virus takes over; the sim stays frozen until a new game starts. */
let gameOver: { stats: GameOverStats; newBest: boolean } | null = null;

const showPanel = () => panel.show('paused', terrain, palette, craft.pos, targets(enemies), enemies.wave);

/** The map picked for the next game, for the settings panel's minimap while on the title screen. */
const previews = new Map<string, { terrain: Terrain; palette: Palette }>();
function showTitleSettings() {
  let preview = previews.get(settings.mapId);
  if (!preview) {
    const t = buildMap(findMap(settings.mapId));
    preview = { terrain: t, palette: new Palette(t, colours) };
    previews.set(settings.mapId, preview);
  }
  titleScreen.hide();
  panel.show('title', preview.terrain, preview.palette);
}

const input = new PlayerInput(canvas, settings.controls, (locked) => {
  if (locked) {
    guide.hide();
    panel.hide();
    gameOverScreen.hide();
    raceResult.hide();
  } else if (mode === 'title') {
    // The title screen stays up; nothing to pause.
  } else if (gameOver) {
    gameOverScreen.show(gameOver.stats, gameOver.newBest);
  } else if (raceDone) {
    // The result screen is already up.
  } else {
    showPanel();
  }
});

/** A fresh title world: the title map, with the demo pilot on the pad and new enemies. */
function newTitleWorld() {
  mode = 'title';
  title = buildTitleMap();
  terrain = title.terrain;
  Object.assign(craft, spawnCraft(terrain, physics));
  Object.assign(cannon, createCannon());
  Object.assign(autopilot, createAutopilot());
  Object.assign(arsenal, createArsenal());
  Object.assign(enemies, newEnemies());
  Object.assign(demo, newDemo());
  demoRestartIn = 0;
  gameOver = null;
  buildViews();
  resetMotion();
  titleScreen.showLost(false);
}

function pauseDemo() {
  autoPaused = true;
  showPanel();
}

function resumeDemo() {
  autoPaused = false;
  panel.hide();
  guide.hide();
}

/** Leaves any game for the title screen. */
function enterTitle() {
  autoplay = false;
  demoBadge.classList.add('hidden');
  newTitleWorld();
  if (input.locked) document.exitPointerLock();
  rig.frame(TITLE_PULL);
  hud.hideBanner();
  hudColumn.classList.add('hidden');
  panel.hide();
  guide.hide();
  howTo.hide();
  gameOverScreen.hide();
  raceResult.hide();
  titleScreen.show();
}

/** Starts a game on the chosen map; the camera swoops down from the title view. */
function startGame() {
  autoplay = false;
  newGame(settings.mapId);
  rig.frame(1);
  titleScreen.hide();
  hudColumn.classList.remove('hidden');
  sound.resume(); // a click: browsers only allow audio to start from a user gesture
  input.requestLock();
}

/** Starts Demo mode on the chosen map: a real game, flown by the demo pilot. */
function startDemo() {
  autoplay = true;
  newGame(settings.mapId);
  rig.frame(1);
  titleScreen.hide();
  howTo.hide();
  guide.hide();
  hudColumn.classList.remove('hidden');
  sound.resume(); // a click: browsers only allow audio to start from a user gesture
}

/** A fresh race on `mapId`: a new game with no enemies, the map's gates, and the run to beat. */
function beginRace(mapId: string) {
  autoplay = false;
  newGame(mapId);
  const preset = findMap(mapId);
  const course = buildCourse(terrain, preset.seed);
  race = createRace(course);
  // The run to beat is the faster of the player's best and the computer's.
  // Par depends on the physics too, so a retuned craft gets a fresh one.
  const parKey = `${preset.id} ${JSON.stringify(physics)}`;
  let par = parRuns.get(parKey);
  if (!par) {
    par = flyCourse(course, terrain, physics);
    parRuns.set(parKey, par);
  }
  const mine = loadRecord(preset.id);
  const computer = par.finished ? { time: par.time, splits: par.splits, ghost: par.ghost, who: 'PAR' as const } : null;
  raceBest = mine && (!computer || mine.time <= computer.time) ? { ...mine, who: 'YOU' } : computer;
}

/** Starts a race on the chosen map from the title or the result screen. */
function startRace() {
  beginRace(settings.mapId);
  rig.frame(1);
  titleScreen.hide();
  howTo.hide();
  guide.hide();
  raceResult.hide();
  hudColumn.classList.remove('hidden');
  sound.resume(); // a click: browsers only allow audio to start from a user gesture
  input.requestLock();
}

/** The craft is down on the pad after the last gate: keep the record, show the result. */
function finishRace(time: number) {
  if (!race) return;
  raceDone = true;
  const previous = raceBest;
  const record = !previous || time < previous.time;
  // A run with a debug aid is shown but never kept.
  if (!debugUsed) saveRecord(settings.mapId, { time, splits: race.splits, ghost: race.ghost });
  if (record && !debugUsed) raceBest = { time, splits: [...race.splits], ghost: race.ghost, who: 'YOU' };
  raceResult.show({
    time,
    previous: previous && { time: previous.time, who: previous.who },
    record,
    crashes: race.crashes,
    mapName: findMap(settings.mapId).name,
  });
  document.exitPointerLock();
}

function showRaceEvent(event: RaceEvent) {
  if (!race) return;
  switch (event.type) {
    case 'gatePassed': {
      const gate = race.course.gates[event.index]!;
      effectsView.cleanse(nearCraft(gate.pos));
      sound.chain(Math.min(10, event.index + 2));
      raceHud.gate(event.time, raceBest?.splits[event.index] ?? null);
      break;
    }
    case 'raceFinished':
      sound.saved();
      finishRace(event.time);
      break;
    case 'raceRespawned':
      // It jumped to the gate: no smear from the pad, and the camera cuts to it.
      Object.assign(prevPos, craft.pos);
      rig.snap(craft.pos.y);
      break;
    case 'raceStarted':
      break;
  }
}

/** Fresh world on `mapId`: terrain (trees regrown, no infection), craft, cannon and enemies. */
function newGame(mapId: string) {
  mode = 'game';
  title = null;
  terrain = buildMap(findMap(mapId));
  Object.assign(craft, spawnCraft(terrain, physics));
  Object.assign(cannon, createCannon());
  Object.assign(autopilot, createAutopilot());
  Object.assign(arsenal, createArsenal());
  lives = startingLives();
  Object.assign(enemies, newEnemies());
  buildViews();
  resetMotion();
  scorePopups.clear();
  gameOver = null;
  debugUsed = false;
  autoPaused = false;
  race = null;
  raceBest = null;
  raceDone = false;
  if (autoplay) {
    Object.assign(demo, newDemo());
    debugUsed = true; // the pilot's score isn't the player's
  }
  demoBadge.classList.toggle('hidden', !autoplay);
}

function endGame(reason: GameOverStats['reason']) {
  const stats = { reason, score: enemies.score, wave: enemies.wave, infected: terrain.infectedFraction(), bestChain: enemies.combo.best };
  // A game helped along by the debug aids doesn't count for the best score.
  gameOver = { stats, newBest: !debugUsed && recordScore(stats.score) };
  gameOverScreen.show(gameOver.stats, gameOver.newBest);
  document.exitPointerLock();
}

/**
 * The field guide, opened from the title screen or over the settings panel; Back returns
 * to where it was opened from (the panel stays up underneath it).
 */
const guide = new FieldGuide(document.querySelector<HTMLDivElement>('#guide')!, settings.enemies, () => closeGuide());
function closeGuide() {
  guide.hide();
  if (mode === 'title' && !panel.visible) titleScreen.show();
}
function showGuide() {
  if (!panel.visible) titleScreen.hide();
  guide.show();
}

/**
 * How to play: shown before the first game in this browser (its Fly starts the game), and
 * from the title screen's button. Back returns to the title screen.
 */
const howTo = new HowToPlay(document.querySelector<HTMLDivElement>('#howto')!, settings, {
  onBack: () => closeHowTo(),
  onFly: () => {
    howTo.hide();
    startGame();
  },
});
function closeHowTo() {
  howTo.hide();
  if (mode === 'title') titleScreen.show();
}
function showHowTo() {
  titleScreen.hide();
  howTo.show();
}
/** Fly from the title: the first time, by way of how to play. */
function fly() {
  if (howToPlaySeen()) startGame();
  else showHowTo();
}

const closeTitleSettings = () => {
  panel.hide();
  titleScreen.show();
};

const panel = new SettingsPanel(overlay, settings, debug, {
  onBack: closeTitleSettings,
  onResume: () => {
    sound.resume(); // a click: browsers only allow audio to start from a user gesture
    if (autoplay) resumeDemo();
    else input.requestLock();
  },
  onQuit: enterTitle,
  onChange: () => saveSettings(settings),
  onGuide: showGuide,
  onJumpToWave: (wave) => {
    jumpToWave(enemies, wave);
    debugUsed = true;
    showPanel();
  },
  onMapChange: (mapId) => {
    settings.mapId = mapId;
    saveSettings(settings);
    if (panel.openedFrom === 'title') {
      showTitleSettings();
    } else {
      if (race) beginRace(mapId);
      else newGame(mapId);
      showPanel();
    }
  },
});

const gameOverScreen = new GameOverScreen(document.querySelector<HTMLDivElement>('#gameover')!, {
  onPlayAgain: () => {
    newGame(settings.mapId);
    sound.resume();
    gameOverScreen.hide();
    if (!autoplay) input.requestLock();
  },
  onTitle: enterTitle,
});

const raceResult = new RaceResultScreen(document.querySelector<HTMLDivElement>('#race-result')!, {
  onAgain: startRace,
  onTitle: enterTitle,
});

const titleScreen = new TitleScreen(document.querySelector<HTMLDivElement>('#title')!, () => settings.mapId, settings.controls, {
  onFly: fly,
  onSettings: showTitleSettings,
  onGuide: showGuide,
  onHowTo: showHowTo,
  onMapChange: (mapId) => {
    settings.mapId = mapId;
    saveSettings(settings);
  },
  onSchemeChange: () => saveSettings(settings),
  onDemo: startDemo,
  onRace: startRace,
});

// R engages auto-refuel (once per wave), or hands control back if it is flying.
// The bomb key (Space, or Q in the trackpad scheme) sets off a smart bomb; E fires a homing
// missile (as does the middle button).
document.addEventListener('keydown', (e) => {
  // Esc closes the field guide, how to play, or the settings opened from the title (in a game, Esc
  // releases the pointer, which pauses).
  if (e.code === 'Escape' && guide.visible) closeGuide();
  else if (e.code === 'Escape' && howTo.visible) closeHowTo();
  else if (e.code === 'Escape' && panel.visible && panel.openedFrom === 'title') closeTitleSettings();
  // Demo mode has no pointer lock to release, so Esc pauses it, and closes the pause again.
  else if (e.code === 'Escape' && autoplay && mode === 'game' && !gameOver) {
    if (panel.visible) resumeDemo();
    else pauseDemo();
  }
  if (e.repeat || !input.locked || gameOver || mode !== 'game' || race) return;
  if (e.code === 'KeyR') {
    const wasActive = autopilot.active;
    if (toggleAutopilot(autopilot, craft, terrain, enemies.wave, settings.autopilot) && !wasActive) sound.autopilot();
  } else if (input.bindings.bomb.includes(e.code)) {
    e.preventDefault();
    bombRequested = true;
  } else if (input.bindings.missile.includes(e.code)) {
    input.missile = true;
  }
});

// Dev-only handle for poking at the game from the console or browser automation.
// Setting `zarch.input.locked = true` runs the simulation without pointer lock.
if (import.meta.env.DEV) {
  Object.assign(window, {
    zarch: {
      craft, cannon, autopilot, arsenal, enemies, input, settings, sound, demo,
      get mode() { return mode; }, get lives() { return lives; }, get terrain() { return terrain; }, get gameOver() { return gameOver; }, get race() { return race; },
    },
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
/** On the title screen, where the camera and the drawn patch centre (smoothed); in a game, the craft. */
const focus = { ...craft.pos };
let accumulator = 0;
let last = performance.now();

/** Where the title camera heads for: between the lettering and the craft, south of the word. */
function titleFocus(map: TitleMap, pos: { x: number; y: number; z: number }) {
  const c = map.centre;
  return {
    x: c.x + TITLE_FOLLOW * terrain.delta(c.x, pos.x),
    y: c.y + 1 + TITLE_FOLLOW * (pos.y - c.y - 1),
    z: c.z + TITLE_SOUTH + TITLE_FOLLOW * terrain.delta(c.z + TITLE_SOUTH, pos.z),
  };
}

/** Snaps interpolation and camera to the craft (or the title view), e.g. after a teleport to a new map. */
function resetMotion() {
  Object.assign(prevPos, craft.pos);
  Object.assign(focus, title ? titleFocus(title, craft.pos) : craft.pos);
  rig.snap(focus.y);
  accumulator = 0;
}

/**
 * Keeps the demo craft on the copy of the world nearest the lettering. Its position is
 * unwrapped, like a player's, so after a chase across the wrap it is moved back by a whole
 * map width, along with its bullets and missiles.
 */
function recentreDemo(map: TitleMap) {
  const n = terrain.size;
  const sx = Math.round((map.centre.x - craft.pos.x) / n) * n;
  const sz = Math.round((map.centre.z - craft.pos.z) / n) * n;
  if (sx === 0 && sz === 0) return;
  for (const p of [craft.pos, prevPos, ...cannon.bullets.map((b) => b.pos), ...arsenal.inFlight.map((m) => m.pos)]) {
    p.x += sx;
    p.z += sz;
  }
}

/** The sound engine during a game; null on the title screen, which runs silent. */
const sfx = () => (mode === 'game' ? sound : null);

/** Where a kill happened, for its score popup. */
function killedAt(event: EnemyEvent | WeaponEvent): { x: number; y: number; z: number } | null {
  switch (event.type) {
    case 'seederDestroyed': return event.seeder.pos;
    case 'fighterDestroyed': return event.fighter.pos;
    case 'mutantDestroyed': return event.mutant.pos;
    case 'bomberDestroyed': return event.bomber.pos;
    case 'pestDestroyed': return event.pest.pos;
    default: return null;
  }
}

/** Explosions, effects and sounds for what the enemies and special weapons did this step. */
function showEvent(event: EnemyEvent | WeaponEvent) {
  // A scoring kill floats its points up from where it died, and a growing chain pings.
  const at = killedAt(event);
  if (at && 'points' in event && event.points > 0 && mode === 'game') {
    scorePopups.add(nearCraft(at), event.points, event.multiplier);
    if (event.multiplier >= 2) sound.chain(event.multiplier);
  }
  switch (event.type) {
    case 'seederDestroyed': {
      const { geometry, matrix } = seederView.shape(event.seeder, craft.pos, simTime);
      effectsView.explode(geometry, matrix, event.seeder.vel);
      sfx()?.explosion('seeder', distanceFromCraft(event.seeder.pos));
      rig.shake(0.5, distanceFromCraft(event.seeder.pos));
      break;
    }
    case 'fighterDestroyed': {
      const { geometry, matrix } = fighterView.shape(event.fighter, craft.pos);
      effectsView.explode(geometry, matrix, event.fighter.vel);
      sfx()?.explosion('fighter', distanceFromCraft(event.fighter.pos));
      rig.shake(0.55, distanceFromCraft(event.fighter.pos));
      break;
    }
    case 'mutantDestroyed': {
      const { geometry, matrix } = seederView.mutantShape(event.mutant, craft.pos, simTime);
      effectsView.explode(geometry, matrix, event.mutant.vel);
      sfx()?.explosion('mutant', distanceFromCraft(event.mutant.pos));
      rig.shake(0.55, distanceFromCraft(event.mutant.pos));
      break;
    }
    case 'bomberDestroyed': {
      const { geometry, matrix } = bomberView.shape(event.bomber, craft.pos);
      effectsView.explode(geometry, matrix, event.bomber.vel);
      sfx()?.explosion('bomber', distanceFromCraft(event.bomber.pos));
      rig.shake(0.7, distanceFromCraft(event.bomber.pos));
      break;
    }
    case 'pestDestroyed': {
      // One that bit the craft just vanishes; `craftBitten` handles it.
      if (!event.byBullet) break;
      const { geometry, matrix } = pestView.shape(event.pest, craft.pos, simTime);
      effectsView.explode(geometry, matrix, event.pest.vel);
      sfx()?.explosion('pest', distanceFromCraft(event.pest.pos));
      break;
    }
    case 'craftBitten':
      effectsView.pop(nearCraft(event.pos));
      sfx()?.bite();
      if (mode === 'game') hud.bitten(event.fuel);
      rig.shake(0.25);
      break;
    case 'bomberHit':
      effectsView.pop(nearCraft(event.pos));
      sfx()?.clank(distanceFromCraft(event.pos));
      break;
    case 'seederMutated':
      effectsView.mutation(nearCraft(event.mutant.pos));
      sfx()?.mutation(distanceFromCraft(event.mutant.pos));
      break;
    case 'buildingInfected':
      sfx()?.infected(distanceFromCraft(buildingBase(terrain, event.building)));
      break;
    case 'buildingSaved':
      effectsView.cleanse(nearCraft(buildingBase(terrain, event.building)));
      sfx()?.saved();
      break;
    case 'buildingLost': {
      const { geometry, matrix } = buildingView.shape(event.building, craft.pos);
      const pos = buildingBase(terrain, event.building);
      effectsView.explode(geometry, matrix, { x: 0, y: 0, z: 0 });
      effectsView.collapse(nearCraft(pos));
      sfx()?.explosion('building', distanceFromCraft(pos));
      rig.shake(0.4, distanceFromCraft(pos));
      break;
    }
    case 'fighterFired':
      sfx()?.enemyShot(distanceFromCraft(event.pos));
      break;
    case 'waveStarted':
      restock(arsenal, event.wave, settings.weapons);
      break;
    case 'bombDetonated':
      effectsView.bomb(event.pos, event.radius);
      sfx()?.bomb();
      rig.shake(1);
      flash();
      break;
    case 'missileLaunched':
      sfx()?.missile();
      break;
    case 'missileSpent':
      effectsView.pop(event.pos);
      sfx()?.explosion('tree', distanceFromCraft(event.pos));
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

/** The copy of a wrapped world position nearest the craft, for effects drawn in the craft's frame. */
function nearCraft(pos: { x: number; y: number; z: number }) {
  return { x: craft.pos.x + terrain.delta(craft.pos.x, pos.x), y: pos.y, z: craft.pos.z + terrain.delta(craft.pos.z, pos.z) };
}

/** Horizontal distance from the craft across the wrapping world. */
function distanceFromCraft(pos: { x: number; z: number }): number {
  return Math.hypot(terrain.delta(craft.pos.x, pos.x), terrain.delta(craft.pos.z, pos.z));
}

/** Proximity alarm level (0-1) for the nearest seeder; silent while paused, over or wrecked. */
function proximityAlert(): number {
  if (!live() || craft.status === 'crashed') return 0;
  return proximityLevel(nearestEnemyDistance(enemies, craft.pos, terrain), settings.sound.alertDistance);
}

/**
 * How tense the music should be, 0-1: a base while flying, more once enemies are about,
 * as the virus spreads, as an enemy closes in (the proximity alarm level) and on the last life.
 */
function musicIntensity(alert: number): number {
  if (!live()) return 0;
  if (race) return 0.45 + 0.35 * (race.next / race.course.gates.length);
  const virus = Math.min(1, terrain.infectedFraction() / Math.max(0.01, settings.enemies.overrunAt));
  const enemiesAbout = enemyCount(enemies) > 0 ? 0.15 : 0;
  return 0.2 + enemiesAbout + 0.35 * virus + 0.4 * alert + (lives === 1 ? 0.1 : 0);
}

/** Continuous and per-shot sounds for this frame (explosions play from the sim events). */
function playSounds(alert: number, dt: number) {
  sound.update();
  const playing = live();
  sound.music(musicIntensity(alert), !playing, dt);
  sound.thruster(playing && craft.thrusting);
  sound.proximity(alert);
  sound.wind(playing ? enemies.combo.low : 0);
  if (cannon.shots < shotsHeard) shotsHeard = 0; // a new game reset the cannon
  // At most two blips per frame, so a long frame doesn't stack a burst of shots.
  if (mode === 'game') for (let k = 0; k < Math.min(2, cannon.shots - shotsHeard); k++) sound.cannon();
  shotsHeard = cannon.shots;
}

function frame(now: number) {
  const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;

  // The title screen's demo never pauses; a game runs while the pointer is locked.
  const running = mode === 'title' || live();
  demoSignals = {};
  if (running) {
    accumulator += elapsed;
    while (accumulator >= STEP && !gameOver && !raceDone) {
      Object.assign(prevPos, craft.pos);
      const wasCrashed = craft.status === 'crashed';
      simTime += STEP;
      let fire: boolean;
      if (title || autoplay) {
        // The title guards its lettering; Demo mode plays the whole map from the pad.
        const command = title
          ? stepDemoPilot(demo, craft, enemies, arsenal, terrain, physics, settings.weapons, title.centre, STEP)
          : stepDemoPilot(demo, craft, enemies, arsenal, terrain, physics, settings.weapons, terrain.padCentre(), STEP, GAME_REACH);
        stepCraft(craft, command.input, terrain, STEP, physics);
        fire = command.fire;
        bombRequested = command.bomb;
        input.missile = command.missile;
        const flying = craft.status === 'flying';
        demoSignals.tilt ||= flying && Math.hypot(command.input.aimX, command.input.aimY) > 0.2;
        demoSignals.thrust ||= craft.thrusting;
        demoSignals.fire ||= command.fire;
        demoSignals.refuel ||= flying && command.mode === 'refuel';
      } else {
        craft.invulnerable = debug.invulnerable;
        if (debug.infiniteFuel) craft.fuel = physics.maxFuel;
        if (debug.invulnerable || debug.infiniteFuel) debugUsed = true;
        input.steer(STEP, settings.controls, craft);
        // Mouse movement is ignored while landed, so every liftoff starts from a centred aim.
        if (craft.status === 'landed') input.centre();
        const wasAuto = autopilot.active;
        const auto = race ? null : stepAutopilot(autopilot, craft, terrain, physics, settings.autopilot);
        if (auto) {
          input.releaseKeyAim();
          // Keep the mouse aim with the autopilot's, so taking back control doesn't jolt the craft.
          input.aimX = auto.aimX;
          input.aimY = auto.aimY;
        }
        if (wasAuto && !auto) thrustHeldOver = true; // landed on the pad (a cancel with R hands over at once)
        if (!input.thrusting()) thrustHeldOver = false;
        const manual = input.snapshot();
        if (thrustHeldOver) manual.thrust = false;
        stepCraft(craft, auto ?? manual, terrain, STEP, physics);
        fire = input.firing();
      }
      for (const impact of stepCannon(cannon, craft, fire, terrain, STEP, physics)) {
        effectsView.impact(impact);
        if (impact.kind === 'sea' && splashQuiet <= 0) {
          sfx()?.splash(0.1, distanceFromCraft(impact.pos));
          splashQuiet = SPLASH_GAP;
        }
        if (impact.tree) {
          const { geometry, matrix } = treeView.shape(impact.tree.i, impact.tree.j, impact.tree.kind);
          effectsView.destroyTree(geometry, matrix, impact);
          sfx()?.explosion('tree', distanceFromCraft(impact.pos));
          rig.shake(0.2, distanceFromCraft(impact.pos));
          geometry.dispose();
        }
      }
      if (race) {
        // A race has no enemies: just the gates, the clock and the wrecks.
        const wrecked = !wasCrashed && craft.status === 'crashed';
        for (const event of stepRace(race, craft, prevPos, terrain, STEP, physics)) showRaceEvent(event);
        if (wrecked) {
          effectsView.explode(craftView.craft.geometry, craftView.craft.matrixWorld, craft.vel);
          sfx()?.explosion('craft');
          rig.shake(0.9);
        }
        accumulator -= STEP;
        continue;
      }
      const rules = title ? demoEnemies : settings.enemies;
      for (const event of stepEnemies(enemies, craft, cannon.bullets, terrain, STEP, rules, physics)) showEvent(event);
      if (bombRequested) {
        bombRequested = false;
        const blast = detonateBomb(arsenal, craft, enemies, terrain, settings.weapons);
        blast?.forEach(showEvent);
        demoSignals.bomb ||= blast !== null;
      }
      if (input.missile) {
        input.missile = false;
        const launch = fireMissile(arsenal, craft, enemies, terrain, physics);
        if (launch) showEvent(launch);
        demoSignals.missile ||= launch !== null;
      }
      for (const event of stepMissiles(arsenal, enemies, terrain, STEP, settings.weapons)) showEvent(event);
      if (!wasCrashed && craft.status === 'crashed') {
        // The mesh still holds its last pose, which is where the pieces start from.
        effectsView.explode(craftView.craft.geometry, craftView.craft.matrixWorld, craft.vel);
        sfx()?.explosion('craft');
        if (terrain.tileTypeAt(craft.pos.x, craft.pos.z) === 'sea') sfx()?.splash(1, 0);
        rig.shake(0.9);
        if (!title) lives--;
      }
      accumulator -= STEP;
      if (title) {
        recentreDemo(title);
        if (demoRestartIn === 0 && lettersInfected(terrain, title.letters) >= DEMO_LOST_AT) {
          demoRestartIn = DEMO_RESTART_DELAY;
          titleScreen.showLost(true);
        }
      } else if (isOverrun(terrain, settings.enemies)) endGame('virus');
      else if (buildingsLost(terrain, settings.enemies)) endGame('buildings');
      else if (lives <= 0 && craft.status === 'crashed' && craft.respawnIn <= LAST_WRECK_PAUSE) endGame('lives');
    }
  }
  if (demoRestartIn > 0) {
    demoRestartIn = Math.max(0, demoRestartIn - elapsed);
    if (demoRestartIn === 0) newTitleWorld();
  }

  // Interpolate between the last two simulation states for smooth motion at any refresh rate.
  const alpha = accumulator / STEP;
  renderPos.x = prevPos.x + (craft.pos.x - prevPos.x) * alpha;
  renderPos.y = prevPos.y + (craft.pos.y - prevPos.y) * alpha;
  renderPos.z = prevPos.z + (craft.pos.z - prevPos.z) * alpha;

  const effectsDt = running ? elapsed : 0;
  // A game centres on the craft. The title camera eases about between the lettering and the
  // craft, and the drawn patch sits further south, since the camera stands further back.
  if (title) {
    const target = titleFocus(title, renderPos);
    const k = Math.min(1, elapsed * TITLE_FOCUS_RATE);
    focus.x += (target.x - focus.x) * k;
    focus.y += (target.y - focus.y) * k;
    focus.z += (target.z - focus.z) * k;
  } else {
    Object.assign(focus, renderPos);
  }
  const patch = title ? { x: focus.x, z: focus.z + TITLE_PATCH_SOUTH } : focus;
  const groundY = terrain.heightAt(focus.x, focus.z);
  rig.update(focus, craft, groundY, elapsed, effectsDt);

  setViewRange(settings.camera.range);
  // A wider patch reaches further ahead, so the fog moves out to its new edge.
  skyView.update(camera, focus.x, groundY, elapsed, rig.extraReach + (drawnPatch.ahead - BASE_PATCH.ahead));
  waveTime += effectsDt;
  terrainView.update(patch.x, patch.z, waveTime);
  treeView.update(patch.x, patch.z);
  buildingView.update(patch.x, patch.z, waveTime);
  craftView.update(craft, renderPos);
  exhaustView.update(craft, craftView.craft.matrixWorld, effectsDt);
  bulletView.update(cannon.bullets);
  missileView.update(arsenal.inFlight);
  if (effectsDt > 0) for (const m of arsenal.inFlight) effectsView.missileTrail(m.pos);
  shotView.update(enemies.shots, { terrain, focus: patch });
  fighterView.update(enemies, patch, effectsDt);
  bomberView.update(enemies, patch);
  pestView.update(enemies, patch, simTime);
  seederView.update(enemies, patch, simTime);
  const sunk = effectsView.update(effectsDt, physics.gravity);
  splashQuiet -= elapsed;
  if (sunk.length > 0 && splashQuiet <= 0) {
    sfx()?.splash(0.25, distanceFromCraft(sunk[0]!));
    splashQuiet = SPLASH_GAP;
  }
  renderer.render(scene, camera);

  const alert = proximityAlert();
  comboMeter.update(mode === 'game' && !gameOver && !race ? enemies.combo : null);
  gateView?.update(race, renderPos, waveTime);
  ghostView?.update(race?.started && raceBest ? ghostPose(raceBest.ghost, race.time) : null, renderPos);
  raceHud.update(race, terrain, craft.pos, raceBest && { time: raceBest.time, who: raceBest.who }, effectsDt);
  hudEl.hidden = race !== null;
  scorePopups.update(camera, window.innerWidth, window.innerHeight, effectsDt);
  if (title) {
    titleScreen.update(demoSignals, elapsed);
  } else {
    if (!race) hud.update(craft, physics, enemies, settings.enemies, terrain, autopilot, settings.autopilot, alert, lives, arsenal, effectsDt);
    const gateMarks = race ? race.course.gates.slice(race.next).map((g, k) => ({ x: g.pos.x, z: g.pos.z, next: k === 0 })) : [];
    scanner.update(terrain, palette, craft, enemies, race ? 0 : settings.sound.alertDistance, alert, elapsed, gateMarks);
    if (elapsed > 0) fps += (1 / elapsed - fps) * Math.min(1, elapsed * FPS_SMOOTHING);
    hud.fps(settings.display.fps ? fps : null);
  }
  const showAim = !title && settings.controls.trackpad && input.locked && !gameOver;
  aimGauge.classList.toggle('hidden', !showAim);
  if (showAim) aimDot.style.transform = `translate(${input.aimX * 28}px, ${-input.aimY * 28}px)`;
  playSounds(alert, elapsed);

  requestAnimationFrame(frame);
}
enterTitle();
rig.frame(TITLE_PULL, true);
requestAnimationFrame(frame);
