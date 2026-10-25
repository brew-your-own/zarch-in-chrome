import type { CraftInput } from './sim/craft';

/** Mouse travel (pixels) from the centre to full tilt. */
const FULL_TILT_PIXELS = 250;

/**
 * Pointer-locked mouse. The pointer is hidden and its movement drives a
 * virtual cursor inside the unit disk, standing in for the mouse position
 * relative to the screen centre in the original game.
 * Left button: thrust. Right button: fire. Middle button: homing missile.
 */
export class MouseInput {
  aimX = 0;
  aimY = 0;
  thrust = false;
  fire = false;
  /** Set by a middle-button press; the game clears it once it has fired a missile (or tried to). */
  missile = false;
  locked = false;

  constructor(
    private readonly target: HTMLElement,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      if (!this.locked) this.thrust = this.fire = this.missile = false;
      this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.aimX += e.movementX / FULL_TILT_PIXELS;
      this.aimY -= e.movementY / FULL_TILT_PIXELS;
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
    return { aimX: this.aimX, aimY: this.aimY, thrust: this.thrust };
  }
}
