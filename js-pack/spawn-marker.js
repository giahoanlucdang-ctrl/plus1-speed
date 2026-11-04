import * as THREE from 'three';

export function buildSpawnMarkers(scene) {
  const group = new THREE.Group();
  const markers = [];
  const bursts = [];
  const loader = new THREE.TextureLoader();
  loader.load('./image-pack/spawn.png', (imageMap) => {
    const image = imageMap.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
      pixels.data[i + 3] = Math.max(0, Math.min(255, (220 - light) * 2.5));
    }
    ctx.putImageData(pixels, 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const x of [0, 2000]) {
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, color: '#ffffff' }));
      icon.position.set(x, 3.4, 0);
      icon.scale.set(1.65, 1.65, 1);
      group.add(icon);
      markers.push(icon);
    }
  }, undefined, (error) => console.warn('Could not load spawn.png', error));
  scene.add(group);

  const rings = [];
  for (const x of [0, 2000]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.12, 48),
      new THREE.MeshBasicMaterial({ color: '#1f2924', side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.035, 0);
    scene.add(ring);
    rings.push(ring);
  }

  function burst(position, kind = 'spawn') {
    const fx = new THREE.Group();
    fx.position.set(position.x, 0, position.z);
    const colors = kind === 'rebirth'
      ? ['#ffd84d', '#bd70ff', '#fff5b8', '#ff79c8']
      : ['#69f4ff', '#7aff9d', '#ffffff', '#9a7dff'];
    const ringMat = new THREE.MeshBasicMaterial({ color: colors[0], transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    fx.add(ring);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: colors[1], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 28), ringMat2);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.13;
    fx.add(ring2);
    const beamMat = new THREE.MeshBasicMaterial({ color: colors[0], transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.55, 5.5, 20, 1, true), beamMat);
    beam.position.y = 2.75;
    fx.add(beam);

    // Keep the respawn burst visible without causing a frame spike.
    const count = kind === 'rebirth' ? 14 : 8;
    const positions = new Float32Array(count * 3);
    const vertexColors = new Float32Array(count * 3);
    const velocities = [];
    const colorObjects = colors.map((color) => new THREE.Color(color));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.7 + Math.random() * (kind === 'rebirth' ? 5.2 : 3.4);
      positions[i * 3] = Math.cos(angle) * 0.25;
      positions[i * 3 + 1] = 0.5 + Math.random() * 1.5;
      positions[i * 3 + 2] = Math.sin(angle) * 0.25;
      velocities.push(new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 4, Math.sin(angle) * speed));
      const c = colorObjects[i % colorObjects.length];
      vertexColors[i * 3] = c.r; vertexColors[i * 3 + 1] = c.g; vertexColors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    const particleMat = new THREE.PointsMaterial({ size: kind === 'rebirth' ? 0.24 : 0.19, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const particles = new THREE.Points(geometry, particleMat);
    particles.frustumCulled = false;
    fx.add(particles);
    scene.add(fx);
    bursts.push({ fx, ring, ring2, beam, ringMat, ringMat2, beamMat, geometry, particleMat, velocities, age: 0, duration: kind === 'rebirth' ? 1.45 : 0.95 });
  }

  let time = 0;
  return {
    burst,
    update(dt) {
      time += dt;
      for (const marker of markers) {
        marker.material.rotation = time * 0.16;
        const pulse = 1 + Math.sin(time * 2.1) * 0.045;
        marker.scale.set(1.65 * pulse, 1.65 * pulse, 1);
      }
      for (const ring of rings) ring.material.opacity = 0.55 + (Math.sin(time * 2) + 1) * 0.12;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += dt;
        const t = Math.min(1, b.age / b.duration);
        const spread = 1 + b.age * (b.duration > 1.5 ? 5.2 : 4.2);
        b.ring.scale.setScalar(spread);
        b.ring2.scale.setScalar(Math.max(0.1, spread * 0.68));
        b.ringMat.opacity = Math.max(0, 1 - t);
        b.ringMat2.opacity = Math.max(0, 0.85 - t);
        b.beamMat.opacity = Math.max(0, 0.34 * (1 - t) * Math.min(1, b.age * 5));
        const attr = b.geometry.getAttribute('position');
        for (let p = 0; p < b.velocities.length; p++) {
          const v = b.velocities[p];
          attr.array[p * 3] += v.x * dt;
          attr.array[p * 3 + 1] += v.y * dt;
          attr.array[p * 3 + 2] += v.z * dt;
          v.y -= 8 * dt;
          v.multiplyScalar(Math.max(0, 1 - dt * 0.65));
        }
        attr.needsUpdate = true;
        b.particleMat.opacity = Math.max(0, 1 - t);
        if (b.age >= b.duration) {
          scene.remove(b.fx);
          b.geometry.dispose(); b.particleMat.dispose(); b.ring.geometry.dispose(); b.ring2.geometry.dispose(); b.ringMat.dispose(); b.ringMat2.dispose(); b.beam.geometry.dispose(); b.beamMat.dispose();
          bursts.splice(i, 1);
        }
      }
    },
  };
}
