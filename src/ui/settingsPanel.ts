import { DEFAULT_SOUND } from '../audio/sound';
import { DEFAULT_CAMERA } from '../render/cameraRig';
import { DEFAULT_SHIP } from '../render/craftView';
import { DEFAULT_CONTROLS } from '../input';
import { drawMinimap } from '../render/minimap';
import { COLOUR_PRESETS, DEFAULT_COLOURS, Palette } from '../render/palette';
import { DEFAULT_PLUME } from '../render/exhaustView';
import { DEFAULT_AUTOPILOT } from '../sim/autopilot';
import { DEFAULT_PHYSICS } from '../sim/craft';
import { DEFAULT_ENEMIES } from '../sim/enemies';
import { DEFAULT_WEAPONS } from '../sim/weapons';
import { buildMap, MAPS } from '../sim/maps';
import type { Terrain } from '../sim/terrain';
import type { Settings } from '../settings';
import { controlsHelp } from './controls';
import { githubLink } from './github';
import { DEFAULT_DISPLAY } from './hud';

const DEG = 180 / Math.PI;

interface SliderSpec<T> {
  key: keyof T & string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Multiplier from stored value to displayed value (e.g. radians to degrees). */
  scale?: number;
}

const PHYSICS_SLIDERS: SliderSpec<Settings['physics']>[] = [
  { key: 'gravity', label: 'Gravity', min: 0.5, max: 8, step: 0.1, unit: 'u/s²' },
  { key: 'thrust', label: 'Thrust', min: 1, max: 20, step: 0.1, unit: 'u/s²' },
  { key: 'maxTilt', label: 'Max tilt', min: 10, max: 180, step: 1, unit: '°', scale: DEG },
  { key: 'attitudeRate', label: 'Attitude response', min: 1, max: 30, step: 0.5, unit: '/s' },
  { key: 'drag', label: 'Drag', min: 0, max: 1.5, step: 0.05 },
  { key: 'fuelBurn', label: 'Fuel burn', min: 0, max: 20, step: 0.5, unit: '/s' },
  { key: 'safeLandingVSpeed', label: 'Max landing speed', min: 0.5, max: 6, step: 0.1, unit: 'u/s' },
];

const CANNON_SLIDERS: SliderSpec<Settings['physics']>[] = [
  { key: 'fireRate', label: 'Fire rate', min: 1, max: 20, step: 0.5, unit: '/s' },
  { key: 'bulletSpeed', label: 'Bullet speed', min: 4, max: 30, step: 0.5, unit: 'u/s' },
  { key: 'bulletLife', label: 'Range', min: 0.3, max: 3, step: 0.1, unit: 's' },
];

const ENEMY_SLIDERS: SliderSpec<Settings['enemies']>[] = [
  { key: 'firstWave', label: 'Seeders (wave 1)', min: 0, max: 10, step: 1 },
  { key: 'seederSpeed', label: 'Seeder speed', min: 0.5, max: 8, step: 0.1, unit: 'u/s' },
  { key: 'sporeInterval', label: 'Spore interval', min: 0.3, max: 6, step: 0.1, unit: 's' },
  { key: 'virusSpread', label: 'Virus spread', min: 0, max: 20, step: 0.5, unit: '%/s', scale: 100 },
  { key: 'fighters', label: 'Fighters per wave', min: 0, max: 3, step: 0.5, unit: '× (wave − 1)' },
  { key: 'fighterSpeed', label: 'Fighter speed', min: 1, max: 10, step: 0.1, unit: 'u/s' },
  { key: 'fighterFireInterval', label: 'Fighter fire interval', min: 0.5, max: 6, step: 0.1, unit: 's' },
  { key: 'fighterAccuracy', label: 'Fighter accuracy', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'mutateAfter', label: 'Seeders mutate after', min: 0, max: 120, step: 5, unit: 's' },
  { key: 'mutantSpeed', label: 'Mutant speed', min: 1, max: 10, step: 0.1, unit: 'u/s' },
  { key: 'bombers', label: 'Bombers per wave', min: 0, max: 3, step: 1 },
  { key: 'bombersFromWave', label: 'Bombers from wave', min: 1, max: 10, step: 1 },
  { key: 'bomberSpeed', label: 'Bomber speed', min: 0.5, max: 8, step: 0.1, unit: 'u/s' },
  { key: 'pests', label: 'Pests per wave', min: 0, max: 10, step: 1 },
  { key: 'pestsFromWave', label: 'Pests from wave', min: 1, max: 10, step: 1 },
  { key: 'pestSpeed', label: 'Pest speed', min: 1, max: 8, step: 0.1, unit: 'u/s' },
  { key: 'pestDrain', label: 'Pest bite', min: 0, max: 50, step: 1, unit: 'fuel' },
];

const GAME_SLIDERS: SliderSpec<Settings['enemies']>[] = [
  { key: 'lives', label: 'Lives', min: 1, max: 9, step: 1 },
  { key: 'difficultyRamp', label: 'Difficulty ramp', min: 0, max: 30, step: 1, unit: '% / wave', scale: 100 },
  { key: 'difficultyCap', label: 'Difficulty cap', min: 1, max: 4, step: 0.1, unit: '×' },
  { key: 'overrunAt', label: 'Game over at', min: 10, max: 100, step: 5, unit: '% land', scale: 100 },
  { key: 'buildingsLostAt', label: 'Or at', min: 0, max: 100, step: 5, unit: '% buildings lost', scale: 100 },
  { key: 'buildingFallTime', label: 'Infected building falls in', min: 3, max: 60, step: 1, unit: 's' },
  { key: 'buildingBonus', label: 'Bonus per building', min: 0, max: 200, step: 10, unit: 'pts / wave' },
];

const SOUND_SLIDERS: SliderSpec<Settings['sound']>[] = [
  { key: 'volume', label: 'Volume', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'music', label: 'Music', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'alertDistance', label: 'Proximity alarm', min: 0, max: 30, step: 1, unit: 'tiles' },
];

const PLUME_SLIDERS: SliderSpec<Settings['plume']>[] = [
  { key: 'rate', label: 'Particles', min: 0, max: 1500, step: 10, unit: '/s' },
  { key: 'speed', label: 'Ejection speed', min: 0, max: 12, step: 0.1, unit: 'u/s' },
  { key: 'spread', label: 'Spread', min: 0, max: 3, step: 0.05 },
  { key: 'lifetime', label: 'Lifetime', min: 0.1, max: 2, step: 0.05, unit: 's' },
  { key: 'size', label: 'Particle size', min: 0.02, max: 0.3, step: 0.01 },
];

const WEAPON_SLIDERS: SliderSpec<Settings['weapons']>[] = [
  { key: 'bombsPerWave', label: 'Smart bombs / wave', min: 0, max: 3, step: 1 },
  { key: 'bombsFromWave', label: 'Smart bombs from wave', min: 1, max: 10, step: 1 },
  { key: 'bombRadius', label: 'Smart bomb radius', min: 4, max: 30, step: 1, unit: 'tiles' },
  { key: 'missilesPerWave', label: 'Missiles / wave', min: 0, max: 3, step: 1 },
  { key: 'missileSpeed', label: 'Missile speed', min: 4, max: 20, step: 0.5, unit: 'u/s' },
  { key: 'missileTurnRate', label: 'Missile turn rate', min: 0.5, max: 8, step: 0.5, unit: 'rad/s' },
];

const CAMERA_SLIDERS: SliderSpec<Settings['camera']>[] = [
  { key: 'distance', label: 'Distance', min: 4, max: 20, step: 0.1, unit: 'u' },
  { key: 'elevation', label: 'Looking down', min: 15, max: 75, step: 1, unit: '°', scale: DEG },
  { key: 'range', label: 'Terrain drawn', min: 100, max: 300, step: 10, unit: '%', scale: 100 },
  { key: 'lean', label: 'Lean into turns', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
  { key: 'shake', label: 'Explosion shake', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
  { key: 'zoom', label: 'Zoom out with height', min: 0, max: 200, step: 10, unit: '%', scale: 100 },
];

const POINTER_SLIDERS: SliderSpec<Settings['controls']>[] = [
  { key: 'pointerSpeed', label: 'Pointer speed', min: 25, max: 400, step: 5, unit: '%', scale: 100 },
];

const CONTROL_SLIDERS: SliderSpec<Settings['controls']>[] = [
  { key: 'keyTilt', label: 'Forward lean', min: 20, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'keyResponse', label: 'Lean speed', min: 1, max: 10, step: 0.5, unit: '/s' },
  { key: 'keyTurnRate', label: 'Turn rate', min: 45, max: 360, step: 15, unit: '°/s', scale: DEG },
];

const COLOUR_SLIDERS: SliderSpec<Settings['colours']>[] = [
  { key: 'autumn', label: 'Autumn leaves', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
  { key: 'grassTone', label: 'Grass tone', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
  { key: 'patches', label: 'Ground patches', min: 0, max: 100, step: 1, unit: '%', scale: 100 },
];

/** Testing aids, toggled in the Debug section while paused. Not part of the saved settings. */
export interface DebugAids {
  /** Nothing wrecks the craft. */
  invulnerable: boolean;
  /** The tank is kept full. */
  infiniteFuel: boolean;
}

/** Where the panel was opened from: the title screen, or a game paused with Esc. */
export type PanelContext = 'title' | 'paused';

/** The drawer's tabs, in order. Debug only shows while paused. */
export type PanelTab = 'map' | 'rules' | 'flight' | 'view' | 'sound' | 'debug';

export interface SettingsPanelHandlers {
  /** Closes the panel opened from the title screen. */
  onBack: () => void;
  /** Goes back to the paused game. */
  onResume: () => void;
  /** Abandons the paused game for the title screen. */
  onQuit: () => void;
  onMapChange: (mapId: string) => void;
  /** Opens the field guide over the panel. */
  onGuide: () => void;
  /** Debug, while paused: clears the enemies and starts `wave`. */
  onJumpToWave: (wave: number) => void;
  /** Called after any physics/plume/colour value changes. */
  onChange: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function decimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * The settings drawer, opened from the title or by pausing a game. It slides in from the right
 * and leaves the game in view, so camera, colour and craft changes show as you make them. Six
 * tabs (Map, Rules, Flight, View, Sound and, while paused, Debug) hold sections that fold away;
 * sliders edit the settings in place. While paused it resumes or quits the game.
 */
export class SettingsPanel {
  private readonly status = el('p', 'status');
  private readonly minimap = el('canvas', 'minimap');
  private readonly mapCards = new Map<string, HTMLButtonElement>();
  private readonly refreshers: (() => void)[] = [];
  private readonly ratio = el('p', 'note');
  private readonly help = el('p', 'help');
  private readonly thumbs: { canvas: HTMLCanvasElement; terrain: Terrain; palette: Palette }[] = [];
  private readonly presetButtons = new Map<keyof typeof COLOUR_PRESETS, HTMLButtonElement>();
  private readonly primary = el('button', 'fly');
  private readonly quit = el('button', 'reset', 'Quit to title');
  private readonly waveInput = el('input');
  private readonly pages = new Map<PanelTab, { title: string; node: HTMLElement }>();
  private readonly tabButtons = new Map<PanelTab, HTMLButtonElement>();
  private tab: PanelTab = 'map';
  /** Folds made so far on the page being built, so only the first starts open. */
  private folds = 0;
  private context: PanelContext = 'title';
  private shown?: {
    terrain: Terrain;
    palette: Palette;
    marker?: { x: number; z: number };
    enemies: { x: number; z: number }[];
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    debug: DebugAids,
    private readonly handlers: SettingsPanelHandlers,
  ) {
    const drawer = el('div', 'drawer');
    const header = el('header');
    this.primary.addEventListener('click', () => (this.context === 'title' ? handlers.onBack() : handlers.onResume()));
    this.quit.addEventListener('click', handlers.onQuit);
    const guide = el('button', 'reset', 'Field guide');
    guide.addEventListener('click', handlers.onGuide);
    const top = el('div', 'drawer-title');
    top.append(el('h1', undefined, 'ZARCH'), this.status, githubLink('panel-github'));
    const buttons = el('div', 'drawer-buttons');
    buttons.append(guide, this.quit, this.primary);
    header.append(top, buttons);

    // Map: the minimap (the game while paused, the next game's map from the title) and the picker.
    this.minimap.width = this.minimap.height = 256;
    const cards = el('div', 'map-cards');
    for (const preset of MAPS) {
      const card = el('button', 'map-card');
      const thumb = el('canvas');
      thumb.width = thumb.height = 96;
      const terrain = buildMap(preset);
      this.thumbs.push({ canvas: thumb, terrain, palette: new Palette(terrain, settings.colours) });
      card.append(thumb, el('span', undefined, preset.name));
      card.addEventListener('click', () => {
        if (preset.id === this.settings.mapId) return;
        handlers.onMapChange(preset.id);
        this.highlightMap();
      });
      this.mapCards.set(preset.id, card);
      cards.append(card);
    }
    const mapNote = el('p', 'note');
    this.refreshers.push(() => {
      mapNote.textContent = this.context === 'paused' ? 'Picking another map starts a new game there.' : 'The map for the next game.';
    });
    this.page('map', 'Map', this.minimap, mapNote, cards);

    // Rules: what the game throws at you, and what you fight back with.
    const game = this.fold('Game', GAME_SLIDERS.map((spec) => this.slider(settings.enemies, spec)));
    game.append(el('p', 'note', 'Lives apply from the next game. Each wave after the first is harder by the ramp, up to the cap. Hover low over an infected building to save it; 0% buildings lost never ends the game.'));
    const enemies = this.fold('Enemies', ENEMY_SLIDERS.map((spec) => this.slider(settings.enemies, spec)));
    enemies.append(el('p', 'note', 'A seeder left alive too long mutates and dives at you (0 turns it off). Bombers lay the virus in lines and take three hits.'));
    const weapons = this.fold('Weapons', WEAPON_SLIDERS.map((spec) => this.slider(settings.weapons, spec)));
    weapons.append(el('p', 'note', 'Smart bombs are handed out each wave and don\'t carry over; missiles build up (up to 9). New stock amounts apply from the next wave.'));
    this.page('rules', 'Rules', game, enemies, weapons);

    // Flight: how the craft handles, and how you fly it.
    const physics = this.fold('Physics', PHYSICS_SLIDERS.map((spec) => this.slider(settings.physics, spec)));
    physics.append(this.ratio);
    const cannon = this.fold('Cannon', CANNON_SLIDERS.map((spec) => this.slider(settings.physics, spec)));
    const assists = this.fold('Assists', [
      this.toggle(settings.autopilot, 'enabled', 'Auto-refuel [R]', 'Once per wave, flies you back to the pad and lands.'),
    ]);
    const controls = this.fold('Controls', [
      this.toggle(settings.controls, 'trackpad', 'Trackpad', 'Swipe to tilt; Space thrusts, F fires, C levels out, Q is the smart bomb.'),
      ...POINTER_SLIDERS.map((spec) => this.slider(settings.controls, spec)),
    ]);
    controls.append(el('p', 'note', 'Made for a mouse, like the original. Pointer speed is how far a movement tilts the craft; a trackpad may want more.'), this.help);
    const keyboard = this.fold('Keyboard flying', CONTROL_SLIDERS.map((spec) => this.slider(settings.controls, spec)));
    keyboard.append(el('p', 'note', 'Mouse scheme only. A/D or ←/→ turn the nose, W or ↑ leans along it, S or ↓ brakes; J or Shift thrusts, K fires. Forward lean is how far W tips the craft, as a share of full tilt; lean speed is how quickly it gets there and back to level.'));
    this.page('flight', 'Flight', physics, cannon, assists, controls, keyboard);

    // View: everything you see, tuned while the game stays in sight beside the drawer.
    const camera = this.fold('Camera', [
      ...CAMERA_SLIDERS.map((spec) => this.slider(settings.camera, spec)),
      this.toggle(settings.display, 'fps', 'Show FPS', 'The frame rate, at the bottom of the HUD.'),
    ]);
    camera.append(el('p', 'note', 'Distance and looking down place the camera behind the craft. Terrain drawn shows more land around it, which costs frame rate.'));
    const craft = this.fold('Craft', [
      this.toggle(settings.ship, 'original', 'Original ship', "Lander's own green and teal paint, as Braben stored it in 1987. Off: the same hull in the game's colours."),
    ]);
    const presets = el('div', 'presets');
    for (const [id, preset] of Object.entries(COLOUR_PRESETS) as [keyof typeof COLOUR_PRESETS, (typeof COLOUR_PRESETS)[keyof typeof COLOUR_PRESETS]][]) {
      const button = el('button', 'preset', preset.name);
      button.addEventListener('click', () => {
        Object.assign(settings.colours, preset.colours);
        this.refresh();
        handlers.onChange();
      });
      this.presetButtons.set(id, button);
      presets.append(button);
    }
    const colours = this.fold('Colours', [presets, ...COLOUR_SLIDERS.map((spec) => this.slider(settings.colours, spec))]);
    const plume = this.fold('Thruster plume', PLUME_SLIDERS.map((spec) => this.slider(settings.plume, spec)));
    this.page('view', 'View', camera, craft, colours, plume);

    const sound = SOUND_SLIDERS.map((spec) => this.slider(settings.sound, spec));
    this.page('sound', 'Sound', ...sound, el('p', 'note', 'The alarm sounds when a seeder comes within this distance, louder as it closes in. 0 turns it off.'));

    // Debug, only while paused in a game: jump to any wave to try out later enemies.
    this.waveInput.type = 'number';
    this.waveInput.min = '1';
    this.waveInput.max = '99';
    const jump = el('button', 'reset', 'Jump');
    const go = () => {
      const wave = Math.max(1, Math.min(99, Math.round(Number(this.waveInput.value) || 1)));
      handlers.onJumpToWave(wave);
    };
    jump.addEventListener('click', go);
    // Typing a number mustn't fire the game's keys (E, R, Space, Q, F, C); Esc still closes the panel.
    this.waveInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.key === 'Enter') go();
    });
    const row = el('label', 'debug-row');
    row.append(el('span', undefined, 'Jump to wave'), this.waveInput, jump);
    this.page(
      'debug',
      'Debug',
      row,
      el('p', 'note', 'Clears the enemies and starts that wave as you resume. The land, buildings and score stay as they are.'),
      this.toggle(debug, 'invulnerable', 'Invulnerable', 'Nothing wrecks the craft: enemies, shots, trees, hard landings.', false),
      this.toggle(debug, 'infiniteFuel', 'Infinite fuel', 'The tank stays full, whatever burns it or bites it.', false),
      el('p', 'note', 'These aren\'t saved, and a game that uses any of them doesn\'t count for the best score.'),
    );

    const reset = el('button', 'reset', 'Reset to defaults');
    reset.addEventListener('click', () => {
      Object.assign(settings.physics, DEFAULT_PHYSICS);
      Object.assign(settings.plume, DEFAULT_PLUME);
      Object.assign(settings.colours, DEFAULT_COLOURS);
      Object.assign(settings.enemies, DEFAULT_ENEMIES);
      Object.assign(settings.weapons, DEFAULT_WEAPONS);
      Object.assign(settings.autopilot, DEFAULT_AUTOPILOT);
      Object.assign(settings.camera, DEFAULT_CAMERA);
      Object.assign(settings.sound, DEFAULT_SOUND);
      Object.assign(settings.controls, DEFAULT_CONTROLS);
      Object.assign(settings.ship, DEFAULT_SHIP);
      Object.assign(settings.display, DEFAULT_DISPLAY);
      this.refresh();
      handlers.onChange();
    });
    const footer = el('footer');
    footer.append(reset, el('span', 'note', 'Every tab, not the map.'));

    const tabs = el('nav', 'drawer-tabs');
    for (const [id, page] of this.pages) {
      const button = el('button', undefined, page.title);
      button.addEventListener('click', () => this.selectTab(id));
      this.tabButtons.set(id, button);
      tabs.append(button);
    }
    const body = el('div', 'drawer-body');
    body.append(...[...this.pages.values()].map((p) => p.node));
    drawer.append(header, tabs, body, footer);
    root.append(drawer);
    this.selectTab(this.tab);
    this.highlightMap();
    this.refresh();
  }

  /** A tab's page, holding `children`. */
  private page(id: PanelTab, title: string, ...children: HTMLElement[]): void {
    const node = el('section', 'drawer-page');
    node.append(...children);
    this.pages.set(id, { title, node });
    this.folds = 0;
  }

  /**
   * A section that folds away, with its first values summed up on the closed header. The first
   * fold on each page starts open; the others remember how they were left.
   */
  private fold(title: string, children: HTMLElement[]): HTMLDetailsElement {
    const fold = el('details', 'fold');
    const summary = el('summary');
    const glance = el('span', 'glance');
    summary.append(el('span', 'fold-title', title), glance);
    fold.append(summary, ...children);
    fold.open = children.length > 0 && this.folds++ === 0;
    this.refreshers.push(() => {
      const bits: string[] = [];
      for (const row of fold.querySelectorAll('.slider, .toggle')) {
        if (bits.length === 3) break;
        const name = row.querySelector('.name')?.textContent?.toLowerCase() ?? '';
        const box = row.querySelector<HTMLInputElement>('input[type=checkbox]');
        const value = box ? (box.checked ? 'on' : 'off') : (row.querySelector('.value')?.textContent ?? '');
        bits.push(`${name} ${value}`);
      }
      glance.textContent = bits.join(' · ');
    });
    return fold;
  }

  private selectTab(tab: PanelTab): void {
    if (tab === 'debug' && this.context !== 'paused') tab = 'map';
    this.tab = tab;
    for (const [id, page] of this.pages) page.node.classList.toggle('hidden', id !== tab);
    for (const [id, button] of this.tabButtons) {
      button.classList.toggle('selected', id === tab);
      button.classList.toggle('hidden', id === 'debug' && this.context !== 'paused');
    }
  }

  /**
   * Shows the panel, with `terrain` in the minimap: the game's, with the craft and enemies
   * marked, while paused; the map picked for the next game when opened from the title.
   */
  show(
    context: PanelContext,
    terrain: Terrain,
    palette: Palette,
    craftPos?: { x: number; z: number },
    enemies: readonly { pos: { x: number; z: number } }[] = [],
    /** The game's current wave, while paused: the jump box starts at the next one. */
    wave = 0,
  ): void {
    this.context = context;
    this.waveInput.value = String(wave + 1);
    this.status.textContent = context === 'paused' ? 'PAUSED' : 'Settings';
    this.primary.textContent = context === 'paused' ? 'RESUME ▸' : '◂ BACK';
    this.quit.classList.toggle('hidden', context !== 'paused');
    this.shown = {
      terrain,
      palette,
      marker: craftPos && { x: craftPos.x, z: craftPos.z },
      enemies: enemies.map((e) => ({ x: e.pos.x, z: e.pos.z })),
    };
    this.selectTab(this.tab);
    this.refresh();
    this.highlightMap();
    this.root.classList.remove('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  get openedFrom(): PanelContext {
    return this.context;
  }

  /** Redraws the minimap and thumbnails, e.g. after a colour change. */
  private drawMaps(): void {
    if (this.shown) {
      const { terrain, palette, marker, enemies } = this.shown;
      drawMinimap(this.minimap, terrain, palette, marker, enemies);
    }
    for (const { canvas, terrain, palette } of this.thumbs) drawMinimap(canvas, terrain, palette);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private highlightMap(): void {
    for (const [id, card] of this.mapCards) card.classList.toggle('selected', id === this.settings.mapId);
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
    const c = this.settings.colours;
    for (const [id, button] of this.presetButtons) {
      const p = COLOUR_PRESETS[id].colours;
      button.classList.toggle('selected', p.autumn === c.autumn && p.grassTone === c.grassTone && p.patches === c.patches);
    }
    this.drawMaps();
    const twr = this.settings.physics.thrust / this.settings.physics.gravity;
    this.ratio.textContent = `Thrust-to-weight ${twr.toFixed(2)}${twr <= 1 ? ' (cannot take off!)' : ''}`;
    this.ratio.classList.toggle('warn', twr <= 1);
    this.help.textContent = controlsHelp(this.settings.controls);
  }

  /** A checkbox for a boolean in `target`; `save` says whether a change is saved with the settings. */
  private toggle<T extends object>(target: T, key: keyof T & string, label: string, hint: string, save = true): HTMLElement {
    const row = el('label', 'toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      (target[key] as boolean) = input.checked;
      this.refresh();
      if (save) this.handlers.onChange();
    });
    this.refreshers.push(() => (input.checked = target[key] as boolean));
    row.append(input, el('span', 'name', label), el('span', 'hint', hint));
    return row;
  }

  private slider<T extends object>(target: T, spec: SliderSpec<T>): HTMLElement {
    const scale = spec.scale ?? 1;
    const row = el('label', 'slider');
    const value = el('span', 'value');
    const input = el('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const show = () => {
      const display = (target[spec.key] as number) * scale;
      input.value = String(display);
      value.textContent = `${display.toFixed(decimals(spec.step))}${spec.unit ? ' ' + spec.unit : ''}`;
    };
    input.addEventListener('input', () => {
      (target[spec.key] as number) = Number(input.value) / scale;
      this.refresh();
      this.handlers.onChange();
    });
    this.refreshers.push(show);
    row.append(el('span', 'name', spec.label), input, value);
    return row;
  }
}
