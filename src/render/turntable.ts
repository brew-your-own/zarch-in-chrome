import * as THREE from 'three';
import { SUN } from './lighting';

/** Pixel size of each picture, before the device pixel ratio. */
export const TURNTABLE_WIDTH = 168;
export const TURNTABLE_HEIGHT = 120;

/**
 * Draws single models, lit like the game, into small 2D canvases: one WebGL renderer
 * renders each model in turn and its picture is copied out. Used by the field guide, so
 * a handful of pictures need only one WebGL context.
 */
export class Turntable {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, TURNTABLE_WIDTH / TURNTABLE_HEIGHT, 0.1, 20);
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
  private readonly shadow: THREE.Mesh;
  readonly pixelRatio = Math.min(window.devicePixelRatio, 2);

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(TURNTABLE_WIDTH, TURNTABLE_HEIGHT, false);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(SUN.x, SUN.y, SUN.z);
    this.scene.add(sun, this.mesh);
    // A soft round shadow under the model, as if it hovered over the ground.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    );
    this.shadow.position.y = -0.6;
    this.scene.add(this.shadow);
    // Looking down on it, as the game's camera does.
    this.camera.position.set(0, 2, 2.9);
    this.camera.lookAt(0, -0.05, 0);
  }

  /**
   * Draws `geometry` into `target`, scaled to `size` and posed by `rotation` (Euler angles,
   * radians). `shadowSize` is the radius of its shadow, 0 for none (a diorama brings its own ground).
   */
  draw(geometry: THREE.BufferGeometry, target: HTMLCanvasElement, size: number, rotation: THREE.Euler, shadowSize: number): void {
    this.mesh.geometry = geometry;
    this.mesh.scale.setScalar(size);
    this.mesh.rotation.copy(rotation);
    this.shadow.visible = shadowSize > 0;
    this.shadow.scale.setScalar(Math.max(shadowSize, 1e-3));
    this.renderer.render(this.scene, this.camera);
    const ctx = target.getContext('2d')!;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(this.renderer.domElement, 0, 0, target.width, target.height);
  }
}
