import * as THREE from 'three';
import { WORLD3_TRACKS, WORLD4_TRACKS, WORLD3, WORLD4, DOOR } from './server.js';
import { buildDoor } from './door.js';

const makeBox = (x0, x1, y0, y1, z0, z1) => ({
  min: new THREE.Vector3(x0, y0, z0),
  max: new THREE.Vector3(x1, y1, z1),
});

function makeSky(top, middle, bottom, stars = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.55, middle);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (stars) {
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.78;
      const r = Math.random() < 0.96 ? 0.5 + Math.random() : 1.5 + Math.random() * 1.4;
      ctx.fillStyle = `rgba(235,245,255,${0.25 + Math.random() * 0.7})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function signTexture(label, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#68442c'; ctx.fillRect(0, 0, 384, 160);
  ctx.fillStyle = accent; ctx.fillRect(10, 10, 364, 140);
  ctx.fillStyle = '#18202c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fontSize = label.includes('\u{1F3C6}') ? 74 : label.length > 13 ? 27 : label.length > 10 ? 32 : 38;
  ctx.font = `900 ${fontSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(label, 192, 80, 350);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeTrophy(gold) {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0.02), new THREE.Vector2(0.3, 0.2),
      new THREE.Vector2(0.38, 0.45), new THREE.Vector2(0.4, 0.62),
    ], 20), gold
  );
  cup.material.side = THREE.DoubleSide;
  cup.position.y = 0.45;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 12), gold);
  stem.position.y = 0.28;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), gold);
  base.position.y = 0.07;
  group.add(cup, stem, base);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16, Math.PI), gold);
    handle.rotation.z = -side * Math.PI / 2;
    handle.position.set(side * 0.36, 0.78, 0);
    group.add(handle);
  }
  group.traverse((part) => { part.castShadow = true; });
  group.scale.setScalar(1.25);
  return group;
}

const MAP_STYLES = {
  crystal: {
    floor: '#301955', trim: '#68e8ff', sign: '#b4f4ff',
    run: ['#5640a0', '#397eb7', '#673fb0', '#3e9bb1'],
    plates: ['#7937a8', '#335fba', '#268fa8', '#a23fba'],
    jumps: ['#633cab', '#2f92ac', '#8452d2', '#3581bd'],
    stairs: ['#40327e', '#4544a3', '#3f62b6', '#358aab'],
    glow: '#b8faff',
  },
  sunset: {
    floor: '#bd6f3e', trim: '#ffe29a', sign: '#ffe7a8',
    run: ['#b65c35', '#d8843e', '#bf513d', '#e2a24c'],
    plates: ['#d75a38', '#e69b43', '#b94a45', '#f1bd5e'],
    jumps: ['#d5753d', '#edb64f', '#c75439', '#e8a14e'],
    stairs: ['#9e503a', '#c06b3c', '#d18242', '#e0a34d'],
    glow: '#ffe9ad',
  },
};

function laneLength(track) {
  if (track.type === 'run') return track.sections.reduce((sum, section) => sum + section, 0) + track.gap * (track.sections.length - 1);
  if (track.type === 'plates') return track.count * track.plateLength + (track.count - 1) * track.gap;
  if (track.type === 'jumps') return track.count * track.plateLength + track.count * track.gapStart + track.gapStep * track.count * (track.count - 1) / 2;
  return track.count * track.sectionLength;
}

function buildGoal(root, x, z, y, style, effects) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 40),
    new THREE.MeshStandardMaterial({ color: '#ffd342', emissive: '#ffab1c', emissiveIntensity: 0.48, metalness: 0.42, roughness: 0.3 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, y + 0.03, z);
  root.add(pad);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.09, 8, 48),
    new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.13, z);
  root.add(ring);
  const trophy = makeTrophy(new THREE.MeshStandardMaterial({ color: '#ffc928', metalness: 0.72, roughness: 0.22, emissive: '#d78a12', emissiveIntensity: 0.16 }));
  trophy.position.set(x, y, z);
  root.add(trophy);
  effects.push({ type: 'goal', ring, trophy, baseY: y });
}

function buildSign(root, x, z, label, accent, dir) {
  const sign = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#68442c', roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.35, 0.15), wood);
  post.position.set(0, 0.68, -0.12);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.88, 0.14), wood);
  board.position.y = 1.45;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 0.68),
    new THREE.MeshBasicMaterial({ map: signTexture(label, accent), side: THREE.DoubleSide })
  );
  face.position.set(0, 1.45, 0.076);
  sign.add(post, board, face);
  sign.position.set(x, 0, z);
  if (dir > 0) sign.rotation.y = Math.PI;
  sign.traverse((part) => { part.castShadow = true; });
  root.add(sign);
}

function buildLane(root, center, track, style, colliders, staticSolids, effects) {
  const x = track.x;
  const worldX = center + track.x;
  const dir = track.dir;
  const width = track.width ?? 5;
  const startZ = dir < 0 ? -7.5 : 7.5;
  const topAt = (z, length, topY, bottomY, mat, laneWidth = width) => {
    const endZ = z + dir * length;
    const minZ = Math.min(z, endZ), maxZ = Math.max(z, endZ);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(laneWidth, topY - bottomY, length), mat);
    mesh.position.set(x, (topY + bottomY) / 2, (z + endZ) / 2);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
    const box = makeBox(worldX - laneWidth / 2, worldX + laneWidth / 2, bottomY, topY, minZ, maxZ);
    colliders.push(box);
    staticSolids.push(box);
    return endZ;
  };
  const matFor = (type, index) => new THREE.MeshStandardMaterial({
    color: style[type][index % style[type].length],
    emissive: type === 'jumps' ? style.glow : '#000000',
    emissiveIntensity: type === 'jumps' ? 0.12 : 0,
    roughness: type === 'plates' ? 0.48 : 0.68,
    metalness: type === 'plates' ? 0.22 : 0.08,
  });

  let z = startZ;
  let topY = 0;
  if (track.type === 'run') {
    for (let i = 0; i < track.sections.length; i++) {
      if (i) z += dir * track.gap;
      z = topAt(z, track.sections[i], 0, -1, matFor('run', i));
    }
  } else if (track.type === 'plates') {
    for (let i = 0; i < track.count; i++) {
      if (i) z += dir * track.gap;
      z = topAt(z, track.plateLength, 0, -0.7, matFor('plates', i));
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, 0.08, 0.12),
        new THREE.MeshBasicMaterial({ color: style.trim })
      );
      edge.position.set(x, 0.045, z - dir * track.plateLength / 2);
      root.add(edge);
    }
  } else if (track.type === 'jumps') {
    for (let i = 0; i < track.count; i++) {
      z += dir * (track.gapStart + i * track.gapStep);
      z = topAt(z, track.plateLength, 0, -0.7, matFor('jumps', i), Math.min(width, track.jumpWidth ?? width));
    }
  } else {
    for (let i = 0; i < track.count; i++) {
      const nextY = (i + 1) * track.rise;
      z = topAt(z, track.sectionLength, nextY, topY, matFor('stairs', i));
      topY = nextY;
    }
  }

  const pathLength = laneLength(track);
  const goalLength = track.goalLength;
  const finishStart = startZ + dir * pathLength;
  const goalZ = finishStart + dir * goalLength / 2;
  const goalY = track.type === 'stairs' ? track.count * track.rise : 0;
  topAt(finishStart, goalLength, goalY, goalY - 1, new THREE.MeshStandardMaterial({ color: '#d7d9de', roughness: 0.72 }));
  buildGoal(root, x, goalZ, goalY, style, effects);
  buildSign(root, x + (dir < 0 ? width / 2 + 1.4 : -width / 2 - 1.4), startZ + dir * 1.4, `${track.wins} \u{1F3C6}`, style.sign, dir);

  const endZ = finishStart + dir * goalLength;
  const minZ = Math.min(startZ, endZ), maxZ = Math.max(startZ, endZ);
  const wallTop = goalY + 12;
  const walls = [
    makeBox(worldX - width / 2 - 1, worldX - width / 2, -10, wallTop, minZ, maxZ),
    makeBox(worldX + width / 2, worldX + width / 2 + 1, -10, wallTop, minZ, maxZ),
    makeBox(worldX - width / 2 - 1, worldX + width / 2 + 1, -10, wallTop, endZ - 0.5, endZ + 0.5),
  ];
  colliders.push(...walls);
  staticSolids.push(...walls);

  // Small light markers at the entrance show where each World 1-style lane starts.
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: style.trim })
  );
  marker.position.set(x, 0.16, startZ);
  root.add(marker);
}

function buildBase(scene, center, style, colliders, staticSolids, doors, labels) {
  const root = new THREE.Group();
  root.position.x = center;
  scene.add(root);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(45, 1, 15),
    new THREE.MeshStandardMaterial({ color: style.floor, roughness: 0.82, metalness: 0.12 })
  );
  floor.position.set(-7.5, -0.5, 0);
  floor.receiveShadow = true;
  root.add(floor);
  staticSolids.push(makeBox(center - 30, center + 15, -1, 0, -7.5, 7.5));

  // Short walls hold the chain doors; an end with no door stays solid.
  const walls = [];
  const shortWall = (x0, x1, doorway) => {
    if (!doorway) {
      walls.push(makeBox(x0, x1, -10, 12, -8.5, 8.5));
      return;
    }
    walls.push(makeBox(x0, x1, -10, 12, -8.5, -DOOR.half));
    walls.push(makeBox(x0, x1, -10, 12, DOOR.half, 8.5));
  };
  shortWall(center - 31, center - 30, labels.west);
  shortWall(center + 15, center + 16, labels.east);
  const base = { min: new THREE.Vector3(center - 30, -1, -7.5), max: new THREE.Vector3(center + 15, 0, 7.5) };
  if (labels.west) doors.push(buildDoor(scene, base, { side: -1, label: `World ${labels.west}`, world: labels.west }));
  if (labels.east) doors.push(buildDoor(scene, base, { side: 1, label: `World ${labels.east}`, world: labels.east }));
  for (const side of [-1, 1]) {
    const z0 = side < 0 ? -8.5 : 7.5;
    const z1 = side < 0 ? -7.5 : 8.5;
    const gaps = [[-14, -9], [9, 14]];
    let edge = -30;
    for (const [gapStart, gapEnd] of gaps) {
      if (gapStart > edge) walls.push(makeBox(center + edge, center + gapStart, -10, 12, z0, z1));
      edge = gapEnd;
    }
    if (edge < 15) walls.push(makeBox(center + edge, center + 15, -10, 12, z0, z1));
  }
  colliders.push(...walls);
  staticSolids.push(...walls);

  const spawn = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.2, 40),
    new THREE.MeshBasicMaterial({ color: style.trim, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  spawn.rotation.x = -Math.PI / 2;
  spawn.position.set(0, 0.025, 0);
  root.add(spawn);
  return { root, spawn };
}

function buildCrystalDecor(root, style) {
  const material = new THREE.MeshStandardMaterial({ color: '#a66bff', emissive: '#742bff', emissiveIntensity: 1.2, roughness: 0.22, metalness: 0.3 });
  const heights = [4.2, 6.1, 4.8, 7.1, 5.2, 6.4, 4.5, 5.8, 4.7, 6.2, 5.1];
  for (let row = 0; row < heights.length; row++) {
    const z = -62 + row * 12.4;
    const x = 22 + (row % 2) * 3;
    const h = heights[row];
    for (const side of [-1, 1]) {
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.9 + (row % 3) * 0.18, h, 5), material);
      crystal.position.set(side * x, h / 2 - 0.05, z);
      crystal.rotation.y = row * 0.42 + side * 0.16;
      crystal.rotation.z = side * 0.07;
      crystal.castShadow = true;
      root.add(crystal);
    }
  }
  return style;
}

function buildSunsetDecor(root, effects) {
  const material = new THREE.MeshStandardMaterial({ color: '#e19a58', roughness: 1 });
  const heights = [4.2, 6.1, 4.8, 6.8, 5.2, 4.5, 5.9, 4.4, 6.3, 4.7, 5.5];
  for (let row = 0; row < heights.length; row++) {
    const z = -62 + row * 12.4;
    const x = 23 + (row % 2) * 3;
    const h = heights[row];
    for (const side of [-1, 1]) {
      const dune = new THREE.Mesh(new THREE.ConeGeometry(3 + (row % 3) * 0.4, h, 6), material);
      dune.position.set(side * x, h / 2 - 0.05, z);
      dune.rotation.y = row * 0.38 + side * 0.12;
      dune.castShadow = true;
      root.add(dune);
    }
  }
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.5, 32, 24), new THREE.MeshBasicMaterial({ color: '#ffcc72' }));
  sun.position.set(0, 17, -82);
  root.add(sun);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.12, 8, 64),
    new THREE.MeshBasicMaterial({ color: '#ff9c68', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
  );
  halo.position.copy(sun.position);
  root.add(halo);
  effects.push({ type: 'halo', object: halo });
}

function buildMap(scene, center, style, theme, tracks, colliders, staticSolids, effects, doors) {
  const { root, spawn } = buildBase(scene, center, style, colliders, staticSolids, doors,
    { west: theme === 'crystal' ? 2 : 3, east: theme === 'crystal' ? 4 : null });
  tracks.forEach((track) => buildLane(root, center, track, style, colliders, staticSolids, effects));
  if (theme === 'crystal') buildCrystalDecor(root, style);
  else buildSunsetDecor(root, effects);
  effects.push({ type: 'spawn', object: spawn });
}

export function buildExtraWorlds(scene) {
  const solids = [];
  const staticSolids = [];
  const effects = [];
  const doors = [];
  buildMap(scene, WORLD3.x, MAP_STYLES.crystal, 'crystal', WORLD3_TRACKS, solids, staticSolids, effects, doors);
  buildMap(scene, WORLD4.x, MAP_STYLES.sunset, 'sunset', WORLD4_TRACKS, solids, staticSolids, effects, doors);
  const sky3 = makeSky('#09071d', '#32145d', '#100d25', true);
  const sky4 = makeSky('#391c43', '#dc7956', '#f5c078');
  let time = 0;
  return {
    solids,
    staticSolids,
    sky3,
    sky4,
    update(dt, unlocked = [1]) {
      time += dt;
      for (const door of doors) door(unlocked);
      for (const effect of effects) {
        const { object, type } = effect;
        if (type === 'goal') {
          effect.ring.rotation.y += dt * 0.5;
          effect.ring.material.opacity = 0.72 + Math.sin(time * 2) * 0.18;
          effect.trophy.rotation.y = time * 1.3;
          effect.trophy.position.y = effect.baseY + 0.55 + Math.sin(time * 2.2) * 0.14;
        } else if (type === 'halo') {
          object.rotation.z += dt * 0.12;
          object.material.opacity = 0.62 + Math.sin(time * 1.5) * 0.14;
        } else {
          object.material.opacity = 0.56 + Math.sin(time * 1.7) * 0.2;
          object.scale.setScalar(1 + Math.sin(time * 2) * 0.06);
        }
      }
    },
  };
}
