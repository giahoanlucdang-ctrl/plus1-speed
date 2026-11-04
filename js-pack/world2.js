import * as THREE from 'three';
import { WORLD2, HILLS, hillLayout, MOVER, moverSpan } from './server.js';
import { buildDoor } from './door.js';
import { makeRun, addGoal, addSign } from './track.js';

// Moon dust: dark grey with soft craters
function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a4f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const v = 60 + Math.random() * 30;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 6 + Math.random() * 28;
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(30,30,34,0.55)');
    grad.addColorStop(0.8, 'rgba(40,40,44,0.25)');
    grad.addColorStop(1, 'rgba(110,110,116,0.35)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1);
  map.anisotropy = 8;
  return map;
}

// Equirectangular night sky: deep blue gradient, stars, and Earth hanging low
function skyTexture() {
  const c = document.createElement('canvas');
  // 2K equirectangular sky stays crisp in play while using a quarter of the pixels.
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#02030a');
  grad.addColorStop(0.5, '#0b1030');
  grad.addColorStop(1, '#02030a');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4000; i++) {
    const y = Math.acos(1 - 2 * Math.random()) / Math.PI * c.height; // even over the sphere
    const r = Math.random() < 0.97 ? Math.random() * 1.3 + 0.4 : Math.random() * 2 + 1.5;
    g.fillStyle = `rgba(255,255,${220 + Math.random() * 35},${0.4 + Math.random() * 0.6})`;
    g.beginPath();
    g.arc(Math.random() * c.width, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Earth
  const ex = c.width * 0.3, ey = c.height * 0.36, er = 70;
  const glow = g.createRadialGradient(ex, ey, er, ex, ey, er * 1.6);
  glow.addColorStop(0, 'rgba(120,180,255,0.35)');
  glow.addColorStop(1, 'rgba(120,180,255,0)');
  g.fillStyle = glow;
  g.fillRect(ex - er * 2, ey - er * 2, er * 4, er * 4);
  const earth = g.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
  earth.addColorStop(0, '#6fb6ff');
  earth.addColorStop(1, '#1d4f9c');
  g.fillStyle = earth;
  g.beginPath();
  g.arc(ex, ey, er, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#3f8f4a';
  for (const [dx, dy, rx, ry] of [[-20, -15, 28, 18], [25, 20, 22, 30], [-30, 35, 15, 10]]) {
    g.beginPath();
    g.ellipse(ex + dx, ey + dy, rx, ry, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.mapping = THREE.EquirectangularReflectionMapping;
  return map;
}

// Packed brown dirt, tinted per surface
function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a34';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(60,35,18,0.45)' : 'rgba(170,120,80,0.35)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

// Path 1: dirt hills under a red kill beam that flashes on and off
function buildHills(scene) {
  const { hills, end } = hillLayout();
  const x0 = HILLS.x - HILLS.width / 2;
  const solids = [];
  const dirt = dirtTexture();

  const groundMap = dirt.clone();
  groundMap.repeat.set(1, (-7.5 - end) / HILLS.width);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(HILLS.width, 1, -7.5 - end),
    new THREE.MeshStandardMaterial({ map: groundMap, color: '#9a8070' })
  );
  ground.position.set(HILLS.x, -0.5, (-7.5 + end) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  solids.push({ min: new THREE.Vector3(x0, -1, end), max: new THREE.Vector3(x0 + HILLS.width, 0, -7.5) });

  const hillMap = dirt.clone();
  hillMap.repeat.set(0.2, 0.2);
  const hillMat = new THREE.MeshStandardMaterial({ map: hillMap, color: '#d0a080' });
  for (const h of hills) {
    const length = h.z1 - h.z0;
    // Side profile, extruded across the path; local +x runs out along -z
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0), new THREE.Vector2(HILLS.run, HILLS.height),
      new THREE.Vector2(length - HILLS.run, HILLS.height), new THREE.Vector2(length, 0),
    ]);
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: HILLS.width, bevelEnabled: false }), hillMat);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(x0, 0, h.z1);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push({
      min: new THREE.Vector3(x0, 0, h.z0 + HILLS.run),
      max: new THREE.Vector3(x0 + HILLS.width, HILLS.height, h.z1 - HILLS.run),
    });
  }

  const run = makeRun(scene, HILLS.x);
  run.gap(-7.5 - end);
  const goal = addGoal(scene, run, 2);
  solids.push(...run.solids);
  addSign(scene, '2 🏆', HILLS.x + HILLS.width / 2 + 1.2);

  const beamH = 3;
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(HILLS.width, beamH, -7.5 - end),
    new THREE.MeshBasicMaterial({ color: '#ff1a1a', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.set(HILLS.x, HILLS.beamY + beamH / 2, (-7.5 + end) / 2);
  beam.visible = false;
  scene.add(beam);

  return {
    solids,
    update(t, course) {
      goal.animate(t);
      beam.visible = !!course?.beam.on;
    },
  };
}

// Speckled grey gravel for the moving floor
function gravelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6c6a66';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    const v = 70 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.6)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

// Path 2: a floor that stretches out of the goal plate to the base and shrinks back
function buildMover(scene) {
  const map = gravelTexture();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(MOVER.width, 1, 1), new THREE.MeshStandardMaterial({ map }));
  floor.receiveShadow = true;
  scene.add(floor);
  const run = makeRun(scene, MOVER.x);
  run.gap(MOVER.length);
  const goal = addGoal(scene, run, 4);
  addSign(scene, '4 🏆', MOVER.x - MOVER.width / 2 - 1.2);
  return {
    solids: run.solids,
    update(t, course) {
      goal.animate(t);
      const [rear, front] = course ? moverSpan(course.mover) : [0, 0];
      const length = (front - rear) * MOVER.length;
      floor.visible = length > 0;
      if (!floor.visible) return;
      floor.scale.z = length;
      floor.position.set(MOVER.x, -0.5, -7.5 - (rear + front) / 2 * MOVER.length);
      // Tiles stay fixed to the ground as the ends move
      map.repeat.set(1, length / MOVER.width);
      map.offset.y = rear * MOVER.length / MOVER.width;
    },
  };
}

export function buildWorld2(scene) {
  // Same footprint as the world 1 base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(30, 1, 15),
    new THREE.MeshStandardMaterial({ color: '#8a8a90', map: moonTexture(), roughness: 1 })
  );
  base.position.set(WORLD2.x, -0.5, 0);
  base.receiveShadow = true;
  scene.add(base);
  const box = { min: new THREE.Vector3(WORLD2.x - 15, -1, -7.5), max: new THREE.Vector3(WORLD2.x + 15, 0, 7.5) };
  const doors = [
    buildDoor(scene, box, { side: -1, label: 'World 1', world: 1 }),
    buildDoor(scene, box, { side: 1, label: 'World 3', world: 3 }),
  ];
  doors[0]([1]);
  doors[1]([1]);
  const hills = buildHills(scene);
  const mover = buildMover(scene);
  let t = 0;
  return {
    solids: [box, ...hills.solids, ...mover.solids],
    update(dt, course, unlocked = [1]) {
      t += dt;
      for (const door of doors) door(unlocked);
      hills.update(t, course);
      mover.update(t, course);
    },
    sky: skyTexture(),
  };
}
