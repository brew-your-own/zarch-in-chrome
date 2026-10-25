import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, noseDirection, spawnCraft, thrustDirection, tiltAngle } from '../sim/craft';
import { Terrain } from '../sim/terrain';

// The sim's nose/thrust vectors must match how CraftView rotates the mesh,
// otherwise bullets and the plume leave the craft at the wrong angle.
describe('craft orientation', () => {
  it('matches the renderer rotation', () => {
    const t = Terrain.fromRows([[1, 1], [1, 1]], { i: 0, j: 0, w: 1, h: 1 });
    const s = spawnCraft(t);
    for (const [tx, tz] of [[0.5, -0.3], [-0.8, 0.1], [0.2, 0.9]] as const) {
      s.tilt = { x: tx, z: tz };
      s.heading = Math.atan2(tx, -tz);
      const euler = new THREE.Euler(-tiltAngle(s, DEFAULT_PHYSICS), -s.heading, 0, 'YXZ');
      const nose = new THREE.Vector3(0, 0, -1).applyEuler(euler);
      const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);
      const n = noseDirection(s);
      const u = thrustDirection(s);
      expect([n.x, n.y, n.z].map((v) => +v.toFixed(5))).toEqual([nose.x, nose.y, nose.z].map((v) => +v.toFixed(5)));
      expect([u.x, u.y, u.z].map((v) => +v.toFixed(5))).toEqual([up.x, up.y, up.z].map((v) => +v.toFixed(5)));
    }
  });
});
