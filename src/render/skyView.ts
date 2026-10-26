import * as THREE from 'three';

/**
 * Elevation (radians) of the sky's stylised horizon. The camera always looks down at the
 * terrain, so the strip of sky it sees lies *below* true horizontal, beyond the far edge of
 * the visible terrain patch. The glow and the star field are placed relative to that strip.
 */
const HORIZON = -0.3;
/** Where the glow has faded into the night (just under the top of the screen). */
const ZENITH = -0.05;

/** Night above, dusky glow at the horizon. The fog uses the glow colour so the terrain edge melts into it. */
export const SKY_TOP = new THREE.Color(0x03040c);
export const SKY_HORIZON = new THREE.Color(0x2c3a60);

/**
 * Linear fog range, as horizontal distance from the camera: the far terrain rows fade into
 * `SKY_HORIZON`. Three.js fogs by straight-line distance, so `update` widens the range with
 * the camera's height, otherwise climbing would fog out the whole patch.
 */
const FOG_NEAR = 15;
const FOG_FAR = 29;

const DOME_RADIUS = 90;
const STAR_RADIUS = 85;
const STAR_COUNT = 900;
/** Stars sit in a band from the horizon to a little above the top of the screen. */
const STAR_LOW = HORIZON + 0.04;
const STAR_HIGH = 0.15;

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  varying vec3 vDir;
  void main() {
    float elevation = asin(clamp(vDir.y, -1.0, 1.0));
    float t = smoothstep(${HORIZON.toFixed(3)}, ${ZENITH.toFixed(3)}, elevation);
    gl_FragColor = vec4(mix(horizon, top, sqrt(t)), 1.0);
  }
`;

const starVertex = /* glsl */ `
  attribute float size;
  attribute float phase;
  attribute vec3 tint;
  uniform float time;
  varying vec3 vColour;
  void main() {
    float elevation = asin(clamp(normalize(position).y, -1.0, 1.0));
    // Dim towards the glow so stars don't sit on top of the terrain edge.
    float fade = smoothstep(${STAR_LOW.toFixed(3)}, ${(STAR_LOW + 0.12).toFixed(3)}, elevation);
    float twinkle = 0.65 + 0.35 * sin(time * (1.5 + phase) + phase * 6.2832);
    vColour = tint * twinkle * fade;
    gl_PointSize = size;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starFragment = /* glsl */ `
  varying vec3 vColour;
  void main() {
    // Soft round dot.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColour * (1.0 - smoothstep(0.4, 1.0, d)), 1.0);
  }
`;

/**
 * Night sky behind the terrain: a gradient dome plus a twinkling star field, both centred
 * on the camera. Stars are on a cylinder-like band that turns with the craft's east-west
 * position, one full turn per map width, so they drift with a hint of parallax and line up
 * again across the wrap.
 */
export class SkyView {
  readonly dome: THREE.Mesh;
  readonly stars: THREE.Points;
  private readonly starMaterial: THREE.ShaderMaterial;
  private time = 0;

  readonly fog = new THREE.Fog(SKY_HORIZON, FOG_NEAR, FOG_FAR);

  constructor(private readonly worldSize: number) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;

    // A fixed seed keeps the same constellations from one game to the next.
    let seed = 0x5eed;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const tints = new Float32Array(STAR_COUNT * 3);
    const tint = new THREE.Color();
    for (let k = 0; k < STAR_COUNT; k++) {
      const azimuth = random() * Math.PI * 2;
      const elevation = STAR_LOW + (STAR_HIGH - STAR_LOW) * random();
      positions[k * 3] = Math.cos(elevation) * Math.sin(azimuth) * STAR_RADIUS;
      positions[k * 3 + 1] = Math.sin(elevation) * STAR_RADIUS;
      positions[k * 3 + 2] = -Math.cos(elevation) * Math.cos(azimuth) * STAR_RADIUS;
      // Mostly faint, a few bright ones.
      const bright = random() ** 4;
      sizes[k] = (1.5 + 3 * bright) * Math.min(window.devicePixelRatio, 2);
      phases[k] = random();
      // White, with a few bluish and a few warm stars.
      tint.setHSL(random() < 0.5 ? 0.6 : 0.1, 0.5 * random(), 0.55 + 0.4 * bright);
      tints.set([tint.r, tint.g, tint.b], k * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
  }

  /**
   * Follows the camera; `craftX` turns the star band; `groundY` is the terrain height under
   * the craft, for the fog range; `dt` drives the twinkle. `reach` pushes the fog further
   * out, for a camera standing further back than usual.
   */
  update(camera: THREE.Camera, craftX: number, groundY: number, dt: number, reach = 0): void {
    const height = Math.max(0, camera.position.y - groundY);
    this.fog.near = Math.hypot(FOG_NEAR + reach, height);
    this.fog.far = Math.hypot(FOG_FAR + reach, height);
    this.time += dt;
    this.starMaterial.uniforms.time!.value = this.time;
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = (craftX / this.worldSize) * Math.PI * 2;
  }
}
