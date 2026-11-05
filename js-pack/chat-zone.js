import * as THREE from 'three';

// A small plaza where players gather to chat. Only cosmetic: no colliders,
// so walking in never blocks the obby route.
export const CHAT_ZONE = { x: 10, z: 2.4, r: 4 };
const ENTRANCE = Math.atan2(-CHAT_ZONE.z, -CHAT_ZONE.x);

export function buildChatZone(scene) {
  const group = new THREE.Group();
  group.position.set(CHAT_ZONE.x, 0, CHAT_ZONE.z);

  const deck = new THREE.MeshStandardMaterial({ color: '#f0c04f', emissive: '#4a3106', emissiveIntensity: 0.15, roughness: 0.88 });
  const rim = new THREE.MeshStandardMaterial({ color: '#2f7cd8', emissive: '#0c2a55', emissiveIntensity: 0.2, roughness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: '#9a6840', emissive: '#241307', emissiveIntensity: 0.1, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: '#40533b', roughness: 0.9 });
  const glow = new THREE.MeshStandardMaterial({ color: '#ffe27a', emissive: '#ffcf3d', emissiveIntensity: 1.2, roughness: 0.5 });

  function add(geometry, material, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const floor = new THREE.Mesh(new THREE.CircleGeometry(CHAT_ZONE.r, 48), deck);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  group.add(floor);

  const ring = new THREE.Mesh(new THREE.RingGeometry(CHAT_ZONE.r - 0.32, CHAT_ZONE.r, 48), rim);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const inner = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 40), rim);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.04;
  group.add(inner);

  // Benches facing the middle, plus two stools.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const bx = Math.cos(angle) * 3.1;
    const bz = Math.sin(angle) * 3.1;
    const ry = -angle + Math.PI / 2;
    add(new THREE.BoxGeometry(1.7, 0.12, 0.5), wood, bx, 0.46, bz, ry);
    add(new THREE.BoxGeometry(1.7, 0.5, 0.1), wood, bx + Math.cos(angle) * 0.22, 0.72, bz + Math.sin(angle) * 0.22, ry);
    for (const side of [-0.6, 0.6]) {
      add(new THREE.BoxGeometry(0.12, 0.44, 0.42), dark, bx + Math.cos(angle + Math.PI / 2) * side, 0.22, bz + Math.sin(angle + Math.PI / 2) * side, ry);
    }
  }
  for (const side of [-0.55, 0.55]) {
    add(new THREE.CylinderGeometry(0.34, 0.4, 0.45, 14), wood, side, 0.24, -0.2);
  }

  // Two lamp posts on the entrance side.
  for (const side of [-1, 1]) {
    const px = Math.cos(ENTRANCE + Math.PI / 2) * side * 2.6 + Math.cos(ENTRANCE) * 2.9;
    const pz = Math.sin(ENTRANCE + Math.PI / 2) * side * 2.6 + Math.sin(ENTRANCE) * 2.9;
    add(new THREE.CylinderGeometry(0.09, 0.12, 2.5, 10), dark, px, 1.25, pz);
    add(new THREE.SphereGeometry(0.24, 14, 10), glow, px, 2.6, pz);
    add(new THREE.CylinderGeometry(0.3, 0.18, 0.14, 12), dark, px, 2.86, pz);
  }

  // Sign board with the zone name, facing the spawn.
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 208;
  const g = canvas.getContext('2d');
  g.fillStyle = '#172638';
  g.beginPath();
  g.roundRect(4, 4, 760, 200, 36);
  g.fill();
  g.strokeStyle = '#f0c04f';
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = '#ffe27a';
  g.font = '900 104px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CHATTING', 384, 108);
  const signTexture = new THREE.CanvasTexture(canvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;

  // Angled toward the spawn path so it reads from the usual camera angle.
  const SIGN_ANGLE = ENTRANCE + Math.PI / 4;
  const SIGN_DIST = 3.6;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 0.82),
    new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide })
  );
  sign.position.set(Math.cos(SIGN_ANGLE) * SIGN_DIST, 2.95, Math.sin(SIGN_ANGLE) * SIGN_DIST);
  sign.rotation.y = -SIGN_ANGLE + Math.PI;
  group.add(sign);

  for (const side of [-1, 1]) {
    const px = Math.cos(SIGN_ANGLE) * SIGN_DIST + Math.cos(SIGN_ANGLE + Math.PI / 2) * side * 1.45;
    const pz = Math.sin(SIGN_ANGLE) * SIGN_DIST + Math.sin(SIGN_ANGLE + Math.PI / 2) * side * 1.45;
    add(new THREE.BoxGeometry(0.14, 2.55, 0.14), dark, px, 1.27, pz);
  }

  scene.add(group);
  return {
    group,
    contains(x, z) {
      const dx = x - CHAT_ZONE.x;
      const dz = z - CHAT_ZONE.z;
      return dx * dx + dz * dz <= CHAT_ZONE.r ** 2;
    },
  };
}
