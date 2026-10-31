import * as THREE from 'three';

/** How long a popup floats (s), and how far up it drifts on screen (px). */
const LIFE = 1.1;
const RISE = 46;
/** Popups beyond this many are dropped, oldest first. */
const MAX_POPUPS = 16;

interface Popup {
  node: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
}

/** The points a kill scored, floating up from where it died, with the chain's multiplier. */
export class ScorePopups {
  private readonly popups: Popup[] = [];
  private readonly projected = new THREE.Vector3();

  constructor(private readonly parent: HTMLElement) {}

  /** A kill at `pos` (the copy nearest the craft) worth `points`, at `multiplier`. */
  add(pos: { x: number; y: number; z: number }, points: number, multiplier: number): void {
    const node = document.createElement('div');
    node.className = 'score-popup';
    node.textContent = `+${points}`;
    if (multiplier >= 2) {
      const times = document.createElement('span');
      times.textContent = ` ×${multiplier}`;
      node.append(times);
      node.style.setProperty('--heat', String(Math.min(1, (multiplier - 2) / 5)));
      node.classList.add('chained');
    }
    this.parent.append(node);
    this.popups.push({ node, pos: new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), age: 0 });
    while (this.popups.length > MAX_POPUPS) this.popups.shift()!.node.remove();
  }

  /** Moves the popups with the camera and ages them by `dt` (0 while paused). */
  update(camera: THREE.Camera, width: number, height: number, dt: number): void {
    for (let k = this.popups.length - 1; k >= 0; k--) {
      const p = this.popups[k]!;
      p.age += dt;
      if (p.age >= LIFE) {
        p.node.remove();
        this.popups.splice(k, 1);
        continue;
      }
      const s = this.projected.copy(p.pos).project(camera);
      const behind = s.z > 1;
      const x = (s.x * 0.5 + 0.5) * width;
      const y = (-s.y * 0.5 + 0.5) * height - RISE * (p.age / LIFE);
      p.node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      p.node.style.opacity = behind ? '0' : String(Math.min(1, 3 * (1 - p.age / LIFE)));
    }
  }

  clear(): void {
    for (const p of this.popups) p.node.remove();
    this.popups.length = 0;
  }
}
