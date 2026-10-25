import * as THREE from 'three';
import type { CraftState } from '../sim/craft';

/** Camera feel, edited live from the settings panel. Each is a multiplier: 0 off, 1 default. */
export interface CameraSettings {
  /** Roll with the craft's sideways tilt. */
  lean: number;
  /** Shake on explosions. */
  shake: number;
  /** Pull back as the craft climbs. */
  zoom: number;
}

export const DEFAULT_CAMERA: Readonly<CameraSettings> = Object.freeze({ lean: 1, shake: 1, zoom: 1 });

/** Behind (south of) and above the craft, always looking north. */
const OFFSET = new THREE.Vector3(0, 4.5, 7);
const PITCH = -0.55;
/** How quickly the camera height follows the craft's (1/s). */
const FOLLOW_Y = 3;
/** Roll (radians) at full sideways tilt, and how quickly it eases there (1/s). */
const LEAN = 0.07;
const LEAN_RATE = 4;
/** At `ZOOM_ALTITUDE` above the ground the offset is `1 + MAX_ZOOM_OUT` times longer. */
const MAX_ZOOM_OUT = 0.5;
const ZOOM_ALTITUDE = 12;
const ZOOM_RATE = 1.5;
/** Shake: trauma (0-1) decays at this rate per second; the offset is trauma² times these. */
const TRAUMA_DECAY = 1.4;
const SHAKE_OFFSET = 0.3;
const SHAKE_ROLL = 0.03;
/** An explosion this many tiles away shakes half as hard as one at the craft. */
const SHAKE_HALF_DISTANCE = 5;

/** Offset multiplier for the craft `altitude` units above the ground. */
export function zoomFactor(altitude: number, zoom: number): number {
  const t = Math.max(0, Math.min(1, altitude / ZOOM_ALTITUDE));
  return 1 + zoom * MAX_ZOOM_OUT * t * t * (3 - 2 * t);
}

/** Trauma added by an explosion of `strength` (0-1) at `distance` tiles. */
export function shakeAt(strength: number, distance: number): number {
  return strength / (1 + Math.max(0, distance) / SHAKE_HALF_DISTANCE);
}

/**
 * Places the camera each frame: following the craft from behind and above, rolling a
 * little with its sideways tilt, pulling back as it climbs, and shaking after explosions.
 */
export class CameraRig {
  private y = 0;
  private altitude = 0;
  private roll = 0;
  private trauma = 0;
  private time = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly settings: CameraSettings,
  ) {}

  /** Jumps straight to the craft, e.g. after a respawn on a new map. */
  snap(craftY: number): void {
    this.y = craftY;
    this.altitude = 0;
    this.roll = 0;
    this.trauma = 0;
  }

  /** Adds shake for an explosion of `strength` (0-1) `distance` tiles from the craft. */
  shake(strength: number, distance = 0): void {
    this.trauma = Math.min(1, this.trauma + shakeAt(strength, distance) * this.settings.shake);
  }

  /** `pos` is the interpolated craft position; `elapsed` is the frame time and `dt` the same but 0 while paused. */
  update(pos: { x: number; y: number; z: number }, craft: CraftState, groundY: number, elapsed: number, dt: number): void {
    const follow = (rate: number) => Math.min(1, elapsed * rate);
    this.y += (pos.y - this.y) * follow(FOLLOW_Y);
    const altitude = craft.status === 'crashed' ? this.altitude : Math.max(0, pos.y - groundY);
    this.altitude += (altitude - this.altitude) * follow(ZOOM_RATE);
    const lean = craft.status === 'flying' ? -craft.tilt.x * LEAN * this.settings.lean : 0;
    this.roll += (lean - this.roll) * follow(LEAN_RATE);

    // Shake only moves on while the game runs, so a paused screen holds still.
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const s = this.trauma * this.trauma;
    const t = this.time;
    const wobble = (a: number, b: number, phase: number) => (Math.sin(t * a + phase) + Math.sin(t * b + phase * 2.3)) / 2;

    const zoom = zoomFactor(this.altitude, this.settings.zoom);
    this.camera.position.set(
      pos.x + OFFSET.x * zoom + wobble(37, 53, 0.4) * SHAKE_OFFSET * s,
      this.y + OFFSET.y * zoom + wobble(41, 59, 1.7) * SHAKE_OFFSET * s,
      pos.z + OFFSET.z * zoom + wobble(31, 47, 2.9) * SHAKE_OFFSET * s * 0.5,
    );
    this.camera.rotation.set(PITCH, 0, this.roll + wobble(29, 43, 4.1) * SHAKE_ROLL * s);
  }
}
