import * as THREE from 'three';
import type { Impact } from '../sim/cannon';
import type { Vec3 } from '../sim/craft';
import { SEA_LEVEL, type Terrain } from '../sim/terrain';
import { ParticlePool, ramp } from './particles';

const RAMP_FIRE = 0;
const RAMP_SMOKE = 1;
const RAMP_SPARK = 2;
const RAMP_SPLASH = 3;
const RAMP_LEAVES = 4;
const RAMP_MUTATION = 5;
const RAMPS = [
  ramp(0xffffff, 0xffe060, 0xff7010, 0xa01800, 0x200000),
  ramp(0x707070, 0x505050, 0x202020),
  ramp(0xffffc0, 0xffb030, 0x803000),
  ramp(0xffffff, 0xa0d0ff, 0x2449d6),
  ramp(0x80d040, 0x2a7f3e, 0x103010),
  ramp(0xffffff, 0x90ff50, 0xd8185a, 0x300010),
];

/** Where splashes start: the sea's resting surface. */
const SEA_SURFACE = SEA_LEVEL;

/** Shards alive at once across all wrecks; the oldest are dropped first. */
const MAX_PIECES = 256;
const PIECE_LIFE = 3;
/** Pieces shrink away over the last part of their life. */
const PIECE_SHRINK = 0.6;
const PIECE_BOUNCE = 0.35;
const PIECE_FRICTION = 0.7;
/** Seconds a smart bomb's shockwave ring takes to reach its radius and fade. */
const SHOCKWAVE_TIME = 0.7;

/** How a shape breaks apart. */
interface ShatterStyle {
  /** Split each triangle into four smaller shards. */
  subdivide: boolean;
  /** Share of the incoming velocity the shards keep, horizontally and vertically. */
  carryHorizontal: number;
  carryVertical: number;
  /** Outward and upward kick ranges (units/s). */
  outward: [number, number];
  up: [number, number];
}

/** The craft keeps its momentum; the ground absorbs most of the vertical part. */
const CRAFT_SHATTER: ShatterStyle = { subdivide: true, carryHorizontal: 1, carryVertical: 0.4, outward: [1, 2.5], up: [1.5, 3.5] };
/** A shot tree bursts apart, nudged along by the bullet. */
const TREE_SHATTER: ShatterStyle = { subdivide: false, carryHorizontal: 0.08, carryVertical: 0, outward: [0.6, 1.8], up: [1, 2.8] };

interface Piece {
  centre: THREE.Vector3;
  vel: THREE.Vector3;
  /** Triangle corners relative to the centre, before rotation. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  spin: THREE.Quaternion;
  axis: THREE.Vector3;
  angularSpeed: number;
  colour: THREE.Color;
  age: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomUnit(out: THREE.Vector3): THREE.Vector3 {
  return out.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
}

/**
 * Cosmetic explosions and bullet impacts: the wrecked craft splits into spinning shards
 * that carry its momentum and tumble across the terrain, with fire, smoke, sparks and
 * splashes from a shared particle pool.
 */
export class EffectsView {
  readonly debris: THREE.Mesh;
  /** A smart bomb's expanding ring, hidden when no bomb has gone off lately. */
  readonly shockwave: THREE.Mesh;
  private shockwaveAge = Infinity;
  private shockwaveRadius = 1;
  private readonly pool: ParticlePool;
  private pieces: Piece[] = [];
  private readonly positions = new Float32Array(MAX_PIECES * 9);
  private readonly colours = new Float32Array(MAX_PIECES * 9);
  private readonly tmp = new THREE.Vector3();
  private readonly step = new THREE.Quaternion();

  constructor(private readonly terrain: Terrain) {
    this.pool = new ParticlePool(terrain, 2000, RAMPS, 0.09);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colours, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MAX_PIECES * 9), 3));
    this.debris = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    );
    this.debris.frustumCulled = false;

    const ring = new THREE.RingGeometry(0.85, 1, 64);
    ring.rotateX(-Math.PI / 2);
    this.shockwave = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({ color: 0xc0f0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.shockwave.visible = false;
    this.shockwave.frustumCulled = false;
  }

  /** A smart bomb going off at `pos`: a ring sweeping out to `radius` and a white flash of sparks. */
  bomb(pos: Vec3, radius: number): void {
    this.shockwave.position.set(pos.x, pos.y + 0.1, pos.z);
    this.shockwaveAge = 0;
    this.shockwaveRadius = radius;
    this.burst(new THREE.Vector3(pos.x, pos.y, pos.z), { x: 0, y: 0, z: 0 }, 120, RAMP_SPARK, 7, [0.4, 0.9], 0.2);
  }

  /** Exhaust behind a missile in flight: a short flame and a puff of smoke. */
  missileTrail(pos: Vec3): void {
    const jitter = () => rand(-0.15, 0.15);
    this.pool.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: jitter(), vy: jitter(), vz: jitter(), life: rand(0.1, 0.2), ramp: RAMP_FIRE, gravity: 0 });
    this.pool.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: jitter(), vy: 0.2, vz: jitter(), life: rand(0.5, 0.9), ramp: RAMP_SMOKE, gravity: -0.05 });
  }

  /** A seeder mutating at `pos`: a burst of acid green and crimson sparks. */
  mutation(pos: Vec3): void {
    this.burst(new THREE.Vector3(pos.x, pos.y, pos.z), { x: 0, y: 0, z: 0 }, 50, RAMP_MUTATION, 2.5, [0.4, 0.9], 0.2);
  }

  /** A missile blowing up without a target: a small fireball. */
  pop(pos: Vec3): void {
    const centre = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.burst(centre, { x: 0, y: 0, z: 0 }, 25, RAMP_FIRE, 2, [0.3, 0.6], 0.3);
    this.burst(centre, { x: 0, y: 0, z: 0 }, 8, RAMP_SMOKE, 0.8, [0.8, 1.4], -0.1);
  }

  get particles(): THREE.Points {
    return this.pool.points;
  }

  /**
   * Blows the craft apart. `shape` is the craft's non-indexed geometry (with colours),
   * `matrix` its last world pose, `vel` the velocity at impact.
   */
  explode(shape: THREE.BufferGeometry, matrix: THREE.Matrix4, vel: Vec3): void {
    const centre = this.shatter(shape, matrix, vel, CRAFT_SHATTER);
    this.burst(centre, vel, 90, RAMP_FIRE, 3.5, [0.5, 1.2], 0.4);
    this.burst(centre, vel, 30, RAMP_SMOKE, 1.2, [1.5, 2.5], -0.1);
    // Blown up at the water's surface: throw up a column of spray too.
    if (this.overSea(centre.x, centre.z) && centre.y < SEA_SURFACE + 0.6) this.splash(centre, 1);
  }

  /**
   * Spray where something hits the sea: a column of droplets plus a low ring. `size` 0-1
   * scales it from a bullet-sized flick to a wreck crashing in.
   */
  splash(pos: { x: number; z: number }, size: number): void {
    const count = Math.round(10 + 70 * size);
    for (let k = 0; k < count; k++) {
      const ring = k % 3 === 0;
      const angle = rand(0, Math.PI * 2);
      const out = ring ? rand(1, 1.8) * (0.6 + size) : rand(0, 0.5) * (0.4 + size);
      this.pool.spawn({
        x: pos.x,
        y: SEA_SURFACE + 0.02,
        z: pos.z,
        vx: Math.cos(angle) * out,
        vy: ring ? rand(0.6, 1.4) : rand(2, 3.5) * (0.6 + 0.8 * size),
        vz: Math.sin(angle) * out,
        life: rand(0.5, 0.9) + 0.4 * size,
        ramp: RAMP_SPLASH,
      });
    }
  }

  /** Shatters a tree hit by a bullet; `shape` has the tree's colours baked in. */
  destroyTree(shape: THREE.BufferGeometry, matrix: THREE.Matrix4, impact: Impact): void {
    const base = this.shatter(shape, matrix, impact.vel, TREE_SHATTER);
    const centre = base.setY(impact.pos.y);
    this.burst(centre, impact.vel, 25, RAMP_FIRE, 2, [0.3, 0.7], 0.4);
    this.burst(centre, impact.vel, 30, RAMP_LEAVES, 2.2, [0.6, 1.2], 0.6);
    this.burst(centre, impact.vel, 10, RAMP_SMOKE, 0.8, [1, 1.8], -0.1);
  }

  /** Breaks `shape` (posed by `matrix`) into spinning shards. Returns the shape's world origin. */
  private shatter(shape: THREE.BufferGeometry, matrix: THREE.Matrix4, vel: Vec3, style: ShatterStyle): THREE.Vector3 {
    const pos = shape.attributes.position!;
    const col = shape.attributes.color!;
    const centre = new THREE.Vector3().setFromMatrixPosition(matrix);
    const corner = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(matrix);

    for (let f = 0; f + 2 < pos.count; f += 3) {
      const a = corner(f);
      const b = corner(f + 1);
      const c = corner(f + 2);
      const colour = new THREE.Color().fromBufferAttribute(col, f);
      if (!style.subdivide) {
        this.addPiece([a, b, c], colour, centre, vel, style);
        continue;
      }
      const ab = a.clone().lerp(b, 0.5);
      const bc = b.clone().lerp(c, 0.5);
      const ca = c.clone().lerp(a, 0.5);
      for (const tri of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as const) {
        this.addPiece(tri, colour, centre, vel, style);
      }
    }
    if (this.pieces.length > MAX_PIECES) this.pieces.splice(0, this.pieces.length - MAX_PIECES);
    return centre;
  }

  private burst(
    centre: THREE.Vector3,
    vel: Vec3,
    count: number,
    rampIndex: number,
    speed: number,
    life: [number, number],
    gravity: number,
  ): void {
    for (let k = 0; k < count; k++) {
      randomUnit(this.tmp).multiplyScalar(rand(0.3, 1) * speed);
      this.pool.spawn({
        x: centre.x,
        y: centre.y + 0.1,
        z: centre.z,
        vx: vel.x * 0.4 + this.tmp.x,
        vy: Math.abs(this.tmp.y) + 1,
        vz: vel.z * 0.4 + this.tmp.z,
        life: rand(...life),
        ramp: rampIndex,
        gravity,
      });
    }
  }

  /** Small effect where a bullet stopped. */
  impact({ pos, vel, kind }: Impact): void {
    const settings = {
      ground: { count: 8, ramp: RAMP_SPARK, up: [1, 2.5], spread: 1.5, life: [0.25, 0.5] },
      tree: { count: 10, ramp: RAMP_LEAVES, up: [0.5, 1.5], spread: 1.2, life: [0.4, 0.8] },
      sea: { count: 22, ramp: RAMP_SPLASH, up: [2, 3.8], spread: 0.9, life: [0.45, 0.8] },
    }[kind];
    for (let k = 0; k < settings.count; k++) {
      this.pool.spawn({
        x: pos.x,
        y: pos.y + 0.02,
        z: pos.z,
        vx: -vel.x * 0.08 + rand(-1, 1) * settings.spread,
        vy: rand(settings.up[0]!, settings.up[1]!),
        vz: -vel.z * 0.08 + rand(-1, 1) * settings.spread,
        life: rand(settings.life[0]!, settings.life[1]!),
        ramp: settings.ramp,
      });
    }
  }

  /**
   * `dt` is 0 while paused. Shards that fall into the sea sink with a small splash; returns
   * where those splashes were this frame, for the sound.
   */
  update(dt: number, gravity: number): { x: number; z: number }[] {
    const splashes: { x: number; z: number }[] = [];
    this.pool.update(dt, gravity);
    this.pieces = this.pieces.filter((p) => (p.age += dt) < PIECE_LIFE);

    this.shockwaveAge += dt;
    const wave = this.shockwaveAge / SHOCKWAVE_TIME;
    this.shockwave.visible = wave < 1;
    if (wave < 1) {
      const r = Math.max(0.01, this.shockwaveRadius * (1 - (1 - wave) ** 3));
      this.shockwave.scale.set(r, 1, r);
      (this.shockwave.material as THREE.MeshBasicMaterial).opacity = 1 - wave;
    }

    for (const p of this.pieces) {
      p.vel.y -= gravity * dt;
      p.centre.addScaledVector(p.vel, dt);
      this.step.setFromAxisAngle(p.axis, p.angularSpeed * dt);
      p.spin.premultiply(this.step);
      const ground = this.terrain.heightAt(p.centre.x, p.centre.z) + 0.02;
      if (p.centre.y < ground && this.overSea(p.centre.x, p.centre.z)) {
        this.splash(p.centre, 0.12);
        splashes.push({ x: p.centre.x, z: p.centre.z });
        p.age = PIECE_LIFE; // sunk: dropped below
        continue;
      }
      if (p.centre.y < ground) {
        p.centre.y = ground;
        p.vel.y = Math.abs(p.vel.y) * PIECE_BOUNCE;
        p.vel.x *= PIECE_FRICTION;
        p.vel.z *= PIECE_FRICTION;
        p.angularSpeed *= PIECE_FRICTION;
      }
    }

    this.pieces = this.pieces.filter((p) => p.age < PIECE_LIFE);
    this.pieces.forEach((p, k) => {
      const scale = Math.min(1, (PIECE_LIFE - p.age) / PIECE_SHRINK);
      p.corners.forEach((c, v) => {
        this.tmp.copy(c).applyQuaternion(p.spin).multiplyScalar(scale).add(p.centre);
        this.positions.set([this.tmp.x, this.tmp.y, this.tmp.z], (k * 3 + v) * 3);
        this.colours.set([p.colour.r, p.colour.g, p.colour.b], (k * 3 + v) * 3);
      });
    });
    const geometry = this.debris.geometry;
    geometry.setDrawRange(0, this.pieces.length * 3);
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    return splashes;
  }

  private overSea(x: number, z: number): boolean {
    return this.terrain.tileTypeAt(x, z) === 'sea';
  }

  private addPiece(
    tri: readonly THREE.Vector3[],
    colour: THREE.Color,
    origin: THREE.Vector3,
    vel: Vec3,
    style: ShatterStyle,
  ): void {
    const centre = tri[0]!.clone().add(tri[1]!).add(tri[2]!).divideScalar(3);
    const outward = centre.clone().sub(origin);
    outward.y = 0;
    if (outward.lengthSq() < 1e-6) randomUnit(outward).setY(0);
    outward.normalize().multiplyScalar(rand(...style.outward));
    this.pieces.push({
      centre,
      vel: new THREE.Vector3(
        vel.x * style.carryHorizontal + outward.x + rand(-0.5, 0.5),
        vel.y * style.carryVertical + rand(...style.up),
        vel.z * style.carryHorizontal + outward.z + rand(-0.5, 0.5),
      ),
      corners: [tri[0]!.clone().sub(centre), tri[1]!.clone().sub(centre), tri[2]!.clone().sub(centre)],
      spin: new THREE.Quaternion(),
      axis: randomUnit(new THREE.Vector3()),
      angularSpeed: rand(4, 12),
      colour,
      age: rand(0, 0.8), // staggers when the pieces shrink away
    });
  }
}
