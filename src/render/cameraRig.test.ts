import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { spawnCraft } from '../sim/craft';
import { Terrain } from '../sim/terrain';
import { CameraRig, DEFAULT_CAMERA, shakeAt, zoomFactor, type CameraSettings } from './cameraRig';
import { waveHeight } from './terrainView';

describe('camera rig', () => {
  it('pulls back smoothly with altitude, up to 1.5x, and not at all when switched off', () => {
    expect(zoomFactor(0, 1)).toBe(1);
    expect(zoomFactor(6, 1)).toBeGreaterThan(1);
    expect(zoomFactor(6, 1)).toBeLessThan(zoomFactor(12, 1));
    expect(zoomFactor(12, 1)).toBeCloseTo(1.5);
    expect(zoomFactor(40, 1)).toBeCloseTo(1.5);
    expect(zoomFactor(12, 0)).toBe(1);
  });

  it('shakes less for explosions further away', () => {
    expect(shakeAt(1, 0)).toBe(1);
    expect(shakeAt(1, 5)).toBeCloseTo(0.5);
    expect(shakeAt(1, 20)).toBeLessThan(shakeAt(1, 5));
  });

  it('rolls with a sideways tilt, settles after a shake, and holds still while paused', () => {
    const t = Terrain.fromRows([[1, 1], [1, 1]], { i: 0, j: 0, w: 1, h: 1 });
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, { ...DEFAULT_CAMERA });
    const craft = spawnCraft(t);
    craft.status = 'flying';
    craft.tilt = { x: 1, z: 0 };
    const pos = { x: 0, y: 3, z: 0 };
    rig.snap(pos.y);
    for (let k = 0; k < 120; k++) rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    expect(camera.rotation.z).toBeLessThan(-0.05); // tilting right rolls the view clockwise

    craft.tilt = { x: 0, z: 0 };
    rig.shake(1);
    rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    const shaken = camera.position.clone();
    rig.update(pos, craft, 1, 1 / 60, 0); // paused: no further shake motion
    expect(camera.position.distanceTo(shaken)).toBeLessThan(0.02);
    for (let k = 0; k < 180; k++) rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    const settled = camera.position.clone();
    rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    expect(camera.position.distanceTo(settled)).toBeLessThan(1e-3);
  });

  it('stands back for the title and eases in to the game framing, or jumps there at once', () => {
    const t = Terrain.fromRows([[1, 1], [1, 1]], { i: 0, j: 0, w: 1, h: 1 });
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, { ...DEFAULT_CAMERA, zoom: 0 });
    const craft = spawnCraft(t);
    const pos = { x: 0, y: 1, z: 0 };
    const back = () => camera.position.z - pos.z;
    rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    const usual = back();

    rig.frame(2, true);
    rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    expect(back()).toBeCloseTo(usual * 2);
    expect(rig.extraReach).toBeCloseTo(usual);

    rig.frame(1);
    rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    expect(back()).toBeGreaterThan(usual * 1.9); // a swoop, not a cut
    for (let k = 0; k < 600; k++) rig.update(pos, craft, 1, 1 / 60, 1 / 60);
    expect(back()).toBeCloseTo(usual, 2);
  });
});

describe('waves', () => {
  it('are gentle and line up across the world wrap', () => {
    for (let k = 0; k < 50; k++) {
      const i = k * 3;
      const j = k * 7;
      const h = waveHeight(64, i, j, k * 0.37);
      expect(Math.abs(h)).toBeLessThanOrEqual(0.15);
      expect(waveHeight(64, i + 64, j - 128, k * 0.37)).toBeCloseTo(h, 9);
    }
    expect(waveHeight(64, 5, 9, 1)).not.toBeCloseTo(waveHeight(64, 5, 9, 2), 3); // they move
  });
});

describe('camera placement', () => {
  const place = (settings: CameraSettings) => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, settings);
    const craft = spawnCraft(Terrain.fromRows([[0, 0], [0, 0]], { i: 0, j: 0, w: 1, h: 1 }));
    rig.snap(0);
    rig.update({ x: 0, y: 0, z: 0 }, craft, 0, 1 / 60, 0);
    return camera;
  };

  it('stands where it always has by default: 4.5 up, 7 back, pitched 0.55 rad down', () => {
    const camera = place({ ...DEFAULT_CAMERA });
    expect(camera.position.y).toBeCloseTo(4.5);
    expect(camera.position.z).toBeCloseTo(7);
    expect(camera.rotation.x).toBeCloseTo(-0.55);
  });

  it('keeps the craft framed the same way as it looks down more steeply', () => {
    const steep = place({ ...DEFAULT_CAMERA, elevation: 1 });
    expect(steep.position.y / steep.position.z).toBeCloseTo(Math.tan(1));
    // The view runs the same small angle above the line to the craft.
    expect(-steep.rotation.x).toBeCloseTo(1 - (DEFAULT_CAMERA.elevation - 0.55));
  });
});
