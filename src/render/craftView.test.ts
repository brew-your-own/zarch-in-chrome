import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { craftGeometry } from './craftView';

describe('craft geometry', () => {
  const g = craftGeometry();
  const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute);

  it('is Lander\'s nine faces, with the base where the landing rules expect it', () => {
    expect(g.attributes.position!.count).toBe(27);
    expect(box.min.y).toBeCloseTo(0, 3); // the thruster plate rests on the ground when landed
    // The nose is Lander's flat edge with the red face, along -z where the cannon fires;
    // the point trails behind.
    expect(box.min.z).toBeCloseTo(-0.28, 3);
    expect(box.max.z).toBeCloseTo(0.252, 3);
    expect(box.max.x).toBeCloseTo(0.336, 3);
  });

  it('faces every triangle away from the hull, so none is culled from outside', () => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const centre = box.getCenter(new THREE.Vector3());
    const [a, b, c, n, m] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3()) as THREE.Vector3[];
    for (let f = 0; f < pos.count / 3; f++) {
      a!.fromBufferAttribute(pos, f * 3);
      b!.fromBufferAttribute(pos, f * 3 + 1);
      c!.fromBufferAttribute(pos, f * 3 + 2);
      n!.subVectors(b!, a!).cross(m!.subVectors(c!, a!));
      m!.copy(a!).add(b!).add(c!).divideScalar(3).sub(centre);
      expect(n!.dot(m!)).toBeGreaterThan(0);
    }
  });

  it('only changes colours between the two paints', () => {
    const original = craftGeometry(true);
    expect(Array.from(original.attributes.position!.array)).toEqual(Array.from(g.attributes.position!.array));
    expect(Array.from(original.attributes.color!.array)).not.toEqual(Array.from(g.attributes.color!.array));
  });
});
