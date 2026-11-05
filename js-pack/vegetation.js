import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHOP_X, SHOP_Z, FRONT_EDGE, WELCOME_RADIUS, EXCHANGE_SHOP_X, EXCHANGE_SHOP_Z, EXCHANGE_FRONT_EDGE, EXCHANGE_WELCOME_RADIUS } from './shop.js';
import { CHAT_ZONE } from './chat-zone.js';

const UP = new THREE.Vector3(0, 1, 0);

export function buildSpawnPlants(scene) {
  const loader = new GLTFLoader();
  const dummy = new THREE.Object3D();
  const bendAxis = new THREE.Vector3();
  const bendQuaternion = new THREE.Quaternion();
  const spinQuaternion = new THREE.Quaternion();
  const patches = [];

  function randomSpots(count, minSpacing, bounds = { xMin: -29.2, xMax: 14.2, zMin: -7.15, zMax: 7.15 }) {
    const spots = [];
    let attempts = 0;
    while (spots.length < count && attempts++ < count * 40) {
      // World 1 platform bounds: x=-30..15, z=-7.5..7.5.
      const x = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
      const z = bounds.zMin + Math.random() * (bounds.zMax - bounds.zMin);
      if (x * x + z * z < 8) continue; // leave the spawn itself open
      if (Math.abs(x - SHOP_X) < 4.6 && z > SHOP_Z - 1.4 && z < SHOP_Z + 0.575) continue; // keep the shop body clear
      const welcomeDz = z - (SHOP_Z + FRONT_EDGE);
      if (welcomeDz >= 0 && (x - SHOP_X) ** 2 + welcomeDz ** 2 < WELCOME_RADIUS ** 2) continue; // keep the welcome patch clear
      if (Math.abs(x - EXCHANGE_SHOP_X) < 4 && z > EXCHANGE_SHOP_Z - 1.4 && z < EXCHANGE_SHOP_Z + 0.575) continue;
      const exchangeDz = z - (EXCHANGE_SHOP_Z + EXCHANGE_FRONT_EDGE);
      if (exchangeDz >= 0 && (x - EXCHANGE_SHOP_X) ** 2 + exchangeDz ** 2 < EXCHANGE_WELCOME_RADIUS ** 2) continue;
      if (Math.hypot(x - CHAT_ZONE.x, z - CHAT_ZONE.z) < CHAT_ZONE.r + 0.7) continue; // keep the chatting plaza clear
      if (spots.some(([px, pz]) => Math.hypot(px - x, pz - z) < minSpacing)) continue;
      spots.push([x, z, 0.7 + Math.random() * 0.55, Math.random() * Math.PI * 2]);
    }
    return spots;
  }

  function addInstances(file, regions, swayStrength) {
    loader.load(file, (gltf) => {
      let source = null;
      gltf.scene.traverse((object) => { if (!source && object.isMesh) source = object; });
      if (!source) return;
      const spots = regions.flatMap(({ count, spacing, bounds }) => randomSpots(count, spacing, bounds));
      const instances = new THREE.InstancedMesh(source.geometry, source.material, spots.length);
      instances.name = file.includes('flower') ? 'Random flowers' : 'Random grass clumps';
      // Hundreds of animated plants do not cast dynamic shadows; this keeps respawns smooth.
      instances.castShadow = false;
      instances.receiveShadow = true;
      const states = spots.map(() => ({ bend: 0, phase: Math.random() * Math.PI * 2 }));
      spots.forEach(([x, z, scale, yaw], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        instances.setMatrixAt(i, dummy.matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      scene.add(instances);
      patches.push({ instances, spots, states, swayStrength });
    }, undefined, (error) => console.error(`Could not load ${file}`, error));
  }

  // Dense but batched, so the plants add little rendering overhead and no collision bodies.
  const leftObbyEdge = { xMin: -29.2, xMax: -14.8, zMin: -7.15, zMax: 7.15 };
  addInstances('./glb-pack/flower.glb', [
    { count: 230, spacing: 0.62 },
    { count: 70, spacing: 0.68, bounds: leftObbyEdge },
  ], 0.045);
  addInstances('./glb-pack/grass.glb', [
    { count: 360, spacing: 0.42 },
    { count: 110, spacing: 0.46, bounds: leftObbyEdge },
  ], 0.085);
  let windTime = 0;
  let swayAccumulator = 0;
  return {
    update(dt, playerPosition, playerVelocity) {
      windTime += dt;
      swayAccumulator += dt;
      if (swayAccumulator < 1 / 24) return;
      const stepDt = swayAccumulator;
      swayAccumulator = 0;
      const windAngle = windTime * 0.11 + Math.sin(windTime * 0.17) * 0.28;
      const windX = Math.sin(windAngle);
      const windZ = Math.cos(windAngle);
      for (const patch of patches) {
        let changed = false;
        for (let i = 0; i < patch.spots.length; i++) {
          const [x, z, scale, yaw] = patch.spots[i];
          const state = patch.states[i];
          const dx = playerPosition.x - x;
          const dz = playerPosition.z - z;
          // Plants far from the player only need to sway with the wind. Avoid
          // distance/velocity work for them on every vegetation update.
          const nearPlayer = Math.abs(dx) < 1.7 && Math.abs(dz) < 1.7;
          const distance = nearPlayer ? Math.hypot(dx, dz) : 99;
          const target = distance < 1.25 ? Math.max(0, 1 - distance / 1.25) : 0;
          const speed = target > 0 ? Math.hypot(playerVelocity?.x ?? 0, playerVelocity?.z ?? 0) : 0;
          const behindX = target > 0 ? (speed > 0.25 ? -playerVelocity.x / speed : dx / distance) : windX;
          const behindZ = target > 0 ? (speed > 0.25 ? -playerVelocity.z / speed : dz / distance) : windZ;
          const next = state.bend + (target - state.bend) * (1 - Math.exp(-stepDt * (target ? 7 : 2)));
          state.bend = next;
          const phase = windTime * 1.7 + state.phase;
          const sway = (Math.sin(phase) + Math.sin(phase * 0.53 + 1.4) * 0.35) * patch.swayStrength;
          const dirX = windX * (1 - next) + behindX * next;
          const dirZ = windZ * (1 - next) + behindZ * next;
          bendAxis.set(dirZ, 0, -dirX).normalize();
          bendQuaternion.setFromAxisAngle(bendAxis, next * 0.35 + sway);
          spinQuaternion.setFromAxisAngle(UP, yaw);
          dummy.position.set(x, 0, z);
          dummy.quaternion.copy(bendQuaternion).multiply(spinQuaternion);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          patch.instances.setMatrixAt(i, dummy.matrix);
          changed = true;
        }
        if (changed) patch.instances.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
