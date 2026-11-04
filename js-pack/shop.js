import * as THREE from 'three';

export const SHOP_X = -20;
export const SHOP_Z = -4.8;
export const FRONT_EDGE = 0.575;
export const WELCOME_RADIUS = 4.2;
// Mirrored across the World 1 spawn from the Gear Shop.
export const EXCHANGE_SHOP_X = 4;
export const EXCHANGE_SHOP_Z = SHOP_Z;
export const EXCHANGE_FRONT_EDGE = 0.575;
export const EXCHANGE_WELCOME_RADIUS = 2.9;

// Procedural fallback while the standalone GLB asset is repaired.
export function buildShop(scene) {
  const shop = new THREE.Group();
  const materials = {
    wood: new THREE.MeshStandardMaterial({ color: '#9a6840', emissive: '#241307', emissiveIntensity: 0.12, roughness: 0.86 }),
    dark: new THREE.MeshStandardMaterial({ color: '#40533b', emissive: '#172516', emissiveIntensity: 0.12, roughness: 0.92 }),
    solid: new THREE.MeshStandardMaterial({ color: '#b17b4d', emissive: '#301a0b', emissiveIntensity: 0.1, roughness: 0.9 }),
    blue: new THREE.MeshStandardMaterial({ color: '#3fb84a', emissive: '#123c17', emissiveIntensity: 0.1, roughness: 0.8 }),
    pale: new THREE.MeshStandardMaterial({ color: '#fff0c9', emissive: '#30270f', emissiveIntensity: 0.08, roughness: 0.82 }),
    trim: new THREE.MeshStandardMaterial({ color: '#35a94a', emissive: '#103b18', emissiveIntensity: 0.12, roughness: 0.78 }),
  };
  function box(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    shop.add(mesh);
  }

  box(8.4, 0.85, 1.15, materials.solid, 0, 0.48, 0);
  box(8.65, 0.18, 1.35, materials.dark, 0, 1, 0);
  for (const x of [-3.8, 3.8]) {
    box(0.34, 2.65, 0.38, materials.wood, x, 2.38, -0.12);
    box(0.42, 0.16, 0.5, materials.dark, x, 3.68, -0.12);
  }
  box(8.25, 0.24, 0.38, materials.dark, 0, 3.63, -0.12);
  box(8.65, 0.16, 2.35, materials.trim, 0, 3.92, 0);
  for (let i = 0; i < 16; i++) {
    box(0.5, 0.08, 2.18, i % 2 ? materials.pale : materials.blue, -4 + i * 0.53, 4.06, 0);
  }
  box(8.75, 0.12, 0.18, materials.trim, 0, 4.07, 1.13);
  box(6.3, 1.85, 0.12, materials.dark, 0, 5.05, -0.03);
  box(0.14, 0.75, 0.16, materials.dark, 0, 4.48, -0.12);

  const gearsSignCanvas = document.createElement('canvas');
  gearsSignCanvas.width = 900;
  gearsSignCanvas.height = 240;
  const gearsSignContext = gearsSignCanvas.getContext('2d');
  gearsSignContext.clearRect(0, 0, gearsSignCanvas.width, gearsSignCanvas.height);
  gearsSignContext.textAlign = 'center';
  gearsSignContext.textBaseline = 'middle';
  gearsSignContext.font = '900 144px system-ui, sans-serif';
  gearsSignContext.lineJoin = 'round';
  gearsSignContext.lineWidth = 18;
  gearsSignContext.strokeStyle = '#31432f';
  gearsSignContext.strokeText('Gears Shop', gearsSignCanvas.width / 2, gearsSignCanvas.height / 2);
  gearsSignContext.fillStyle = '#fff0c9';
  gearsSignContext.shadowColor = '#172516';
  gearsSignContext.shadowBlur = 9;
  gearsSignContext.fillText('Gears Shop', gearsSignCanvas.width / 2, gearsSignCanvas.height / 2);
  const gearsSignTexture = new THREE.CanvasTexture(gearsSignCanvas);
  gearsSignTexture.colorSpace = THREE.SRGBColorSpace;
  const gearsSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.55),
    new THREE.MeshBasicMaterial({ map: gearsSignTexture, transparent: true, side: THREE.DoubleSide })
  );
  gearsSign.position.set(0, 5.05, 0.04);
  shop.add(gearsSign);

  const welcomeMat = new THREE.MeshStandardMaterial({ color: '#39d353', roughness: 0.9, side: THREE.DoubleSide });
  const welcome = new THREE.Mesh(new THREE.CircleGeometry(WELCOME_RADIUS, 64, 0, Math.PI), welcomeMat);
  welcome.rotation.x = Math.PI / 2;
  welcome.position.set(0, 0.025, FRONT_EDGE);
  welcome.receiveShadow = true;
  shop.add(welcome);

  shop.position.set(SHOP_X, 0, SHOP_Z);
  scene.add(shop);
  return {
    group: shop,
    containsPlayer(x, z) {
      const dz = z - (SHOP_Z + FRONT_EDGE);
      const dx = x - SHOP_X;
      return dz >= 0 && dx * dx + dz * dz <= WELCOME_RADIUS * WELCOME_RADIUS;
    },
  };
}

export function buildExchangeShop(scene) {
  const group = new THREE.Group();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: '#9a6840', emissive: '#241307', emissiveIntensity: 0.12, roughness: 0.86 }),
    dark: new THREE.MeshStandardMaterial({ color: '#40533b', emissive: '#172516', emissiveIntensity: 0.12, roughness: 0.92 }),
    green: new THREE.MeshStandardMaterial({ color: '#3fb84a', emissive: '#123c17', emissiveIntensity: 0.1, roughness: 0.8 }),
    cream: new THREE.MeshStandardMaterial({ color: '#fff0c9', emissive: '#30270f', emissiveIntensity: 0.08, roughness: 0.82 }),
  };
  function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Compact stall with the same wood and block shapes as the Gear Shop.
  box(7.2, 0.85, 1.15, mats.wood, 0, 0.48, 0);
  box(7.4, 0.18, 1.35, mats.dark, 0, 1, 0);
  for (const x of [-3.2, 3.2]) {
    box(0.32, 2.45, 0.38, mats.wood, x, 2.3, -0.12);
    box(0.4, 0.15, 0.48, mats.dark, x, 3.55, -0.12);
  }
  box(6.9, 0.22, 0.38, mats.dark, 0, 3.5, -0.12);
  box(7.5, 0.16, 2.3, mats.green, 0, 3.82, 0);
  for (let i = 0; i < 14; i++) {
    box(0.5, 0.08, 2.12, i % 2 ? mats.cream : mats.green, -3.5 + i * 0.54, 3.96, 0);
  }

  // Front sign names the exchange stall without putting text on its counter.
  box(5.8, 1.0, 0.18, mats.dark, 0, 4.78, 0.08);
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 900;
  signCanvas.height = 150;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#31543a';
  ctx.fillRect(0, 0, signCanvas.width, signCanvas.height);
  ctx.fillStyle = '#fff0a6';
  ctx.shadowColor = '#19351f';
  ctx.shadowBlur = 8;
  ctx.font = '900 43px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXCHANGE WINS TO SPEED', signCanvas.width / 2, signCanvas.height / 2);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide })
  );
  signFace.position.set(0, 4.78, 0.18);
  group.add(signFace);

  const welcome = new THREE.Mesh(
    new THREE.CircleGeometry(EXCHANGE_WELCOME_RADIUS, 64, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: '#63c95c', roughness: 0.9, side: THREE.DoubleSide })
  );
  welcome.rotation.x = Math.PI / 2;
  welcome.position.set(0, 0.025, EXCHANGE_FRONT_EDGE);
  welcome.receiveShadow = true;
  group.add(welcome);

  group.position.set(EXCHANGE_SHOP_X, 0, EXCHANGE_SHOP_Z);
  scene.add(group);
  return {
    group,
    containsPlayer(x, z) {
      const dx = x - EXCHANGE_SHOP_X;
      const dz = z - (EXCHANGE_SHOP_Z + EXCHANGE_FRONT_EDGE);
      return dz >= 0 && dx * dx + dz * dz <= EXCHANGE_WELCOME_RADIUS ** 2;
    },
  };
}
