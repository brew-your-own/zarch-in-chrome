import type { CraftInput } from './sim/craft';

/** Pointer travel (pixels) from the centre to full tilt, at a pointer speed of 1. */
const FULL_TILT_PIXELS = 250;

/** Key codes for keyboard flying. */
const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BRAKE_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const STEER_KEYS = [...FORWARD_KEYS, ...BRAKE_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS];

/**
 * The keys of each control scheme. With a mouse, its buttons thrust and fire, and the keys
 * are extras. With a trackpad, the right hand swipes the attitude and the left hand works
 * the rest: Space thrusts (so the smart bomb moves to Q), F fires and C levels the craft.
 */
export interface KeyBindings {
  thrust: string[];
  fire: string[];
  missile: string[];
  bomb: string[];
  /** Puts the aim back at the centre, so the craft levels out. */
  level: string[];
  /** Whether W/A/S/D and the arrows fly the craft (`steer`). */
  steering: boolean;
}

const MOUSE_KEYS: KeyBindings = {
  thrust: ['KeyJ', 'ShiftLeft', 'ShiftRight'],
  fire: ['KeyK'],
  missile: ['KeyE'],
  bomb: ['Space'],
  level: [],
  steering: true,
};

const TRACKPAD_KEYS: KeyBindings = {
  thrust: ['Space', 'ShiftLeft'],
  fire: ['KeyF'],
  missile: ['KeyE'],
  bomb: ['KeyQ'],
  level: ['KeyC'],
  steering: false,
};

export function keyBindings(controls: ControlSettings): KeyBindings {
  return controls.trackpad ? TRACKPAD_KEYS : MOUSE_KEYS;
}

/** How far the brake leans per unit of horizontal speed (u/s), up to the key tilt. */
const BRAKE_LEAN = 0.25;

/** How keyboard flying leans and turns the craft. */
export interface ControlSettings {
  /** Trackpad scheme: swipe to tilt, keys to thrust and fire (see `keyBindings`). */
  trackpad: boolean;
  /** Multiplies how far a pointer movement tilts the craft. */
  pointerSpeed: number;
  /** How far the forward key tilts the craft, as a share of the mouse's full tilt. */
  keyTilt: number;
  /** How fast the aim moves under the keys, in aim-disk units per second. */
  keyResponse: number;
  /** How fast the turn keys swing the nose round (radians per second). */
  keyTurnRate: number;
}

export const DEFAULT_CONTROLS: ControlSettings = { trackpad: false, pointerSpeed: 1, keyTilt: 0.6, keyResponse: 3, keyTurnRate: 2 };

/** The steering keys held this step: `turn` is -1 (left), 0 or 1 (right). */
export interface SteerKeys {
  forward: boolean;
  brake: boolean;
  turn: number;
}

/**
 * Where the keys want the aim, for a nose at `heading` and a craft drifting at `vel`.
 * Forward leans `keyTilt` along the nose. The brake leans against the drift, less as it slows,
 * so holding it with thrust brings the craft to a stop. Neither held: level.
 */
export function keyAimTarget(keys: SteerKeys, heading: number, vel: { x: number; z: number }, controls: ControlSettings): { aimX: number; aimY: number } {
  if (keys.forward) return { aimX: Math.sin(heading) * controls.keyTilt, aimY: Math.cos(heading) * controls.keyTilt };
  if (keys.brake) {
    // Screen right is world +x and screen up is world -z.
    const aimX = -vel.x * BRAKE_LEAN;
    const aimY = vel.z * BRAKE_LEAN;
    const scale = Math.min(1, controls.keyTilt / Math.max(Math.hypot(aimX, aimY), 1e-9));
    return { aimX: aimX * scale, aimY: aimY * scale };
  }
  return { aimX: 0, aimY: 0 };
}

/** Moves `aim` towards `target` at up to `keyResponse` per second. */
export function easeAim(aim: { aimX: number; aimY: number }, target: { aimX: number; aimY: number }, dt: number, controls: ControlSettings): void {
  const dx = target.aimX - aim.aimX;
  const dy = target.aimY - aim.aimY;
  const gap = Math.hypot(dx, dy);
  const move = Math.min(1, (controls.keyResponse * dt) / Math.max(gap, 1e-9));
  aim.aimX += dx * move;
  aim.aimY += dy * move;
}

/**
 * Pointer-locked mouse or trackpad, plus keys. The pointer is hidden and its movement drives a
 * virtual cursor inside the unit disk, standing in for the mouse position
 * relative to the screen centre in the original game.
 * Left button: thrust. Right button: fire. Middle button: homing missile.
 * The keys depend on the scheme (`keyBindings`). In the mouse scheme the keys can also fly the
 * craft (see `steer`): A/D or left/right turn the nose, W or up leans along it and
 * S or down brakes, all by easing the same cursor; J or Shift thrusts and K fires.
 * Moving the pointer takes the aim back from the keys.
 */
export class PlayerInput {
  aimX = 0;
  aimY = 0;
  /** The mouse buttons; the keys are kept apart, so `thrusting()` and `firing()` combine both. */
  thrust = false;
  fire = false;
  /** Set by a middle-button press; the game clears it once it has fired a missile (or tried to). */
  missile = false;
  locked = false;
  private readonly held = new Set<string>();
  /** Whether the steering keys own the aim (until the mouse moves or the autopilot flies). */
  private keyAim = false;
  /** The nose the turn keys steer; it follows the craft's while the keys don't own the aim. */
  private keyHeading = 0;

  constructor(
    private readonly target: HTMLElement,
    private readonly controls: ControlSettings,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      if (!this.locked) {
        this.thrust = this.fire = this.missile = false;
        this.held.clear();
      }
      this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (e.movementX !== 0 || e.movementY !== 0) this.keyAim = false;
      const per = this.controls.pointerSpeed / FULL_TILT_PIXELS;
      this.aimX += e.movementX * per;
      this.aimY -= e.movementY * per;
      const mag = Math.hypot(this.aimX, this.aimY);
      if (mag > 1) {
        this.aimX /= mag;
        this.aimY /= mag;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.thrust = true;
      if (e.button === 2) this.fire = true;
      if (e.button === 1) {
        this.missile = true;
        e.preventDefault();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.thrust = false;
      if (e.button === 2) this.fire = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      const keys = this.bindings;
      if (keys.level.includes(e.code)) {
        this.keyAim = false;
        this.centre();
        return;
      }
      const steering = keys.steering && STEER_KEYS.includes(e.code);
      if (!steering && !keys.thrust.includes(e.code) && !keys.fire.includes(e.code)) return;
      if (steering) this.keyAim = true;
      this.held.add(e.code);
      e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** The keys of the scheme picked in the settings. */
  get bindings(): KeyBindings {
    return keyBindings(this.controls);
  }

  thrusting(): boolean {
    return this.thrust || this.anyHeld(this.bindings.thrust);
  }

  firing(): boolean {
    return this.fire || this.anyHeld(this.bindings.fire);
  }

  /**
   * Turns the key heading and eases the aim towards the keys' target, once per sim step.
   * While the mouse has the aim it only keeps the key heading on the craft's nose.
   */
  steer(dt: number, controls: ControlSettings, craft: { heading: number; vel: { x: number; z: number } }): void {
    if (!this.keyAim || !this.bindings.steering) {
      this.keyAim = false;
      this.keyHeading = craft.heading;
      return;
    }
    const keys: SteerKeys = {
      forward: this.anyHeld(FORWARD_KEYS),
      brake: this.anyHeld(BRAKE_KEYS),
      turn: Number(this.anyHeld(RIGHT_KEYS)) - Number(this.anyHeld(LEFT_KEYS)),
    };
    this.keyHeading += keys.turn * controls.keyTurnRate * dt;
    easeAim(this, keyAimTarget(keys, this.keyHeading, craft.vel, controls), dt, controls);
  }

  /** Hands the aim back from the keys, e.g. to the autopilot. */
  releaseKeyAim(): void {
    this.keyAim = false;
  }

  private anyHeld(codes: string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  /** Puts the virtual cursor back at the screen centre (no tilt). */
  centre(): void {
    this.aimX = 0;
    this.aimY = 0;
  }

  requestLock(): void {
    // Browsers can refuse the lock (e.g. right after Esc). Report it as unlocked so the
    // caller puts its pause screen back instead of leaving a frozen game with no UI.
    this.target.requestPointerLock().catch(() => this.onLockChange(false));
  }

  snapshot(): CraftInput {
    const input: CraftInput = { aimX: this.aimX, aimY: this.aimY, thrust: this.thrusting() };
    if (this.keyAim) input.heading = this.keyHeading;
    return input;
  }
}
