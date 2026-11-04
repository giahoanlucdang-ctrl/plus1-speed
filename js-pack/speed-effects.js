import * as THREE from 'three';

// Lightweight speed streaks that wake up only while the player is moving fast.
export function buildSpeedEffects(scene) {
  const count = 8;
  const positions = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    color: '#d9fbff', transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  scene.add(lines);

  const streaks = Array.from({ length: count }, () => ({
    // Keep the streaks in the player's immediate space so they read as a
    // personal speed trail instead of long lines scattered across the view.
    back: 0.35 + Math.random() * 1.45,
    side: (Math.random() - 0.5) * 1.5,
    height: 0.2 + Math.random() * 1.35,
    length: 0.28 + Math.random() * 0.72,
  }));
  const direction = new THREE.Vector2();
  let visibleAmount = 0;

  return {
    update(dt, position, velocity, world = 1) {
      const speed = Math.hypot(velocity.x, velocity.z);
      const target = THREE.MathUtils.clamp((speed - 7) / 19, 0, 1);
      visibleAmount += (target - visibleAmount) * (1 - Math.exp(-dt * 5));
      material.opacity = visibleAmount * 0.58;
      material.color.set(world === 2 ? '#d8d2ff' : '#d9fbff');
      if (visibleAmount < 0.025) {
        geometry.setDrawRange(0, 0);
        return;
      }

      direction.set(velocity.x, velocity.z);
      if (direction.lengthSq() < 0.001) direction.set(0, 1);
      direction.normalize();
      const sideX = direction.y;
      const sideZ = -direction.x;
      const attr = geometry.getAttribute('position');
      const array = attr.array;
      for (let i = 0; i < count; i++) {
        const s = streaks[i];
        const wobble = Math.sin(performance.now() * 0.004 + i * 2.1) * 0.12;
        const cx = position.x - direction.x * s.back + sideX * (s.side + wobble);
        const cz = position.z - direction.y * s.back + sideZ * (s.side + wobble);
        const cy = position.y + s.height;
        const n = i * 6;
        array[n] = cx; array[n + 1] = cy; array[n + 2] = cz;
        array[n + 3] = cx - direction.x * s.length;
        array[n + 4] = cy + 0.08;
        array[n + 5] = cz - direction.y * s.length;
      }
      attr.needsUpdate = true;
      geometry.setDrawRange(0, count * 2);
    },
  };
}
