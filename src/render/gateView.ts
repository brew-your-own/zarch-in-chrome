import * as THREE from 'three';
import { GATE_RADIUS, type RaceState } from '../sim/race';
import type { Terrain } from '../sim/terrain';

/** The ring's tube radius, and how tall the beacon over the next gate stands. */
const TUBE = 0.13;
const BEACON_HEIGHT = 40;
const NEXT = new THREE.Color(0xffff00);
const AFTER = new THREE.Color(0xffffff);
const LATER = new THREE.Color(0x8fa0c0);

/**
 * The race's gates: flat-shaded rings, the next one bright yellow and pulsing with a beam of
 * light standing over it, the one after white, the rest faint, and the passed ones gone. Once
 * every gate is passed the beam stands over the pad instead. Each is drawn at its copy across
 * the wrap nearest `focus`.
 */
export class GateView {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly geometry = new THREE.TorusGeometry(GATE_RADIUS, TUBE, 6, 28);

  constructor(private readonly terrain: Terrain) {
    const beam = new THREE.CylinderGeometry(0.25, 0.25, BEACON_HEIGHT, 8, 1, true);
    beam.translate(0, BEACON_HEIGHT / 2, 0);
    this.beacon = new THREE.Mesh(
      beam,
      new THREE.MeshBasicMaterial({ color: NEXT, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.group.add(this.beacon);
  }

  /** Shows `race` (null hides everything), around `focus`, at `time` seconds for the pulse. */
  update(race: RaceState | null, focus: { x: number; z: number }, time: number): void {
    this.group.visible = race !== null;
    if (!race) return;
    const gates = race.course.gates;
    while (this.rings.length < gates.length) {
      const ring = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: LATER, transparent: true }));
      this.rings.push(ring);
      this.group.add(ring);
    }
    const near = (x: number, z: number) => ({ x: focus.x + this.terrain.delta(focus.x, x), z: focus.z + this.terrain.delta(focus.z, z) });
    for (const [k, ring] of this.rings.entries()) {
      const gate = gates[k];
      ring.visible = gate !== undefined && k >= race.next;
      if (!gate || !ring.visible) continue;
      const at = near(gate.pos.x, gate.pos.z);
      ring.position.set(at.x, gate.pos.y, at.z);
      ring.rotation.set(0, Math.atan2(gate.dir.x, gate.dir.z), 0);
      const step = k - race.next;
      ring.material.color.copy(step === 0 ? NEXT : step === 1 ? AFTER : LATER);
      ring.material.opacity = step === 0 ? 1 : step === 1 ? 0.75 : 0.35;
      ring.scale.setScalar(step === 0 ? 1 + 0.06 * Math.sin(time * 6) : 1);
    }
    // The beam marks the next gate, or the pad once they are all passed.
    const target = gates[race.next];
    const pad = this.terrain.padCentre();
    const spot = target ? near(target.pos.x, target.pos.z) : near(pad.x, pad.z);
    this.beacon.visible = !race.finished;
    this.beacon.position.set(spot.x, this.terrain.heightAt(spot.x, spot.z), spot.z);
    this.beacon.material.opacity = 0.16 + 0.08 * Math.sin(time * 4);
  }

  dispose(): void {
    this.geometry.dispose();
    this.beacon.geometry.dispose();
    this.beacon.material.dispose();
    for (const ring of this.rings) ring.material.dispose();
  }
}
