import * as THREE from 'three';

const WIDTH = 5;
const START_Z = -7.5;     // tracks run out from the base's far edge
const END_LENGTH = 10;

// Track 1 (far left): conveyors pushing back toward the base, with rest spots
// between. A conveyor's push equals the movement of its required speed, so you
// only make progress once your speed is above it.
const CONVEYOR_X = -11.5;
const REQUIRED = [25, 50, 75, 100, 125, 150, 175, 200];
const FIRST_LENGTH = 6;
const LENGTH_STEP = 2;    // each conveyor is longer than the last
const REST_LENGTH = 4;

// Track 2 (far right): plates that vanish a while after you touch them.
const PLATE_X = 11.5;
const PLATE_COUNT = 20;
const PLATE_STEP = 10;    // plate n is n * 10 long
const PLATE_LIFE = 3;     // seconds after touching until it vanishes
const PLATE_RESPAWN = 3;  // seconds gone before it comes back

// Track 3 (near left): 5x5 plates with widening gaps to jump.
const HOP_X = -11.5;
const HOP_COUNT = 20;
const HOP_SIZE = 5;
const HOP_FIRST_GAP = 3;  // base to plate 1
const HOP_GAP_STEP = 3;   // each gap is this much wider than the last

// Track 4 (near right): a long 20° ramp with refuge plates off alternating
// sides, and a big ball that keeps rolling down it.
const RAMP_X = 11.5;
const RAMP_WIDTH = 8;
const RAMP_ANGLE = (20 * Math.PI) / 180;
const REFUGE_COUNT = 10;
const REFUGE_SIZE = 5;
const REFUGE_FIRST = 10;    // along the slope, bottom to the first refuge
const REFUGE_GAP = 11;      // first refuge to the second
const REFUGE_GAP_STEP = 3;  // each gap is this much longer than the last
const RAMP_TOP_RUN = 20;    // last refuge to the top
const BALL_RADIUS = 3.5;
const BALL_ACCEL = 15;
const BALL_MAX_SPEED = 30;
const BALL_DESPAWN = 15;    // starts vanishing this far up the slope
const BALL_DELAY = 1.5;     // pause before the next ball spawns

const WALL = 1;             // invisible wall thickness
const WALL_HEIGHT = 12;     // how far walls reach above a path's highest floor

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2b30';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#f5c518';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Points down the texture = toward the base
  g.beginPath();
  g.moveTo(28, 44);
  g.lineTo(64, 84);
  g.lineTo(100, 44);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}


// Light bricks so the plate's color tints them
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; // mortar
  g.fillRect(0, 0, 128, 128);
  const rows = 4, cols = 2, gap = 4;
  const bw = 128 / cols, bh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? bw / 2 : 0;
    for (let c2 = -1; c2 <= cols; c2++) {
      const shade = 225 + ((r * 7 + c2 * 13) % 5) * 7;
      g.fillStyle = `rgb(${shade},${shade},${shade})`;
      g.fillRect(c2 * bw + offset + gap / 2, r * bh + gap / 2, bw - gap, bh - gap);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4ead5';
  g.fillRect(0, 0, 256, 128);
  g.font = '800 80px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#222';
  g.fillText(text, 128, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTrophy() {
  const gold = new THREE.MeshStandardMaterial({ color: '#ffc928', metalness: 0.7, roughness: 0.25 });
  const trophy = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0.02), new THREE.Vector2(0.3, 0.2),
      new THREE.Vector2(0.38, 0.45), new THREE.Vector2(0.4, 0.62),
    ], 24),
    gold
  );
  cup.material.side = THREE.DoubleSide;
  cup.position.y = 0.42;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 12), gold);
  stem.position.y = 0.27;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), gold);
  base.position.y = 0.06;
  trophy.add(cup, stem, base);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16, Math.PI), gold);
    handle.rotation.z = -side * Math.PI / 2;
    handle.position.set(side * 0.36, 0.78, 0);
    trophy.add(handle);
  }
  trophy.traverse((o) => { o.castShadow = true; });
  trophy.scale.setScalar(1.4);
  return trophy;
}

const restMat = new THREE.MeshStandardMaterial({ color: '#c9ccd1' });
const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b' });

// A straight run of boxes heading away from the base, along -z (dir -1, the
// far edge) or +z (dir 1, the near edge)
export function makeRun(scene, x, dir = -1, { y = 0, width = WIDTH } = {}) {
  const solids = [];
  let z = -dir * START_Z;
  return {
    solids,
    get z() { return z; },
    gap(length) { z += dir * length; },
    addBox(length, material) {
      const z1 = z + dir * length;
      const box = {
        min: new THREE.Vector3(x - width / 2, y - 1, Math.min(z, z1)),
        max: new THREE.Vector3(x + width / 2, y, Math.max(z, z1)),
        center: new THREE.Vector3(x, y, (z + z1) / 2),
      };
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, length), material);
      mesh.position.set(x, y - 0.5, box.center.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      box.mesh = mesh;
      solids.push(box);
      z = z1;
      return box;
    },
  };
}

// End platform with a yellow pad and a floating trophy
export function addGoal(scene, run, wins, length = END_LENGTH) {
  const end = run.addBox(length, restMat);
  end.walkSpeed = 100;
  const goal = { pos: end.center.clone(), radius: 1.2, wins };
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(goal.radius, 40),
    new THREE.MeshStandardMaterial({ color: '#ffd400', emissive: '#ffb000', emissiveIntensity: 0.3 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.copy(goal.pos).setY(goal.pos.y + 0.02);
  pad.receiveShadow = true;
  const trophy = makeTrophy();
  trophy.position.copy(goal.pos);
  scene.add(pad, trophy);
  goal.animate = (t) => {
    trophy.rotation.y = t * 1.5;
    trophy.position.y = goal.pos.y + 0.6 + Math.sin(t * 2) * 0.15;
  };
  return goal;
}

const entrances = []; // where paths leave the base: { minX, maxX, side (-1 far edge, 1 near) }

// Invisible walls down both sides of a path, from the base out to zEnd, and across its end
function addWalls(solids, minX, maxX, zEnd, top = 0) {
  const zStart = Math.sign(zEnd) * -START_Z;
  entrances.push({ minX, maxX, side: Math.sign(zEnd) });
  const z0 = Math.min(zStart, zEnd), z1 = Math.max(zStart, zEnd);
  const wall = (x0, x1, za, zb) => solids.push({
    min: new THREE.Vector3(x0, -10, za),
    max: new THREE.Vector3(x1, top + WALL_HEIGHT, zb),
  });
  wall(minX - WALL, minX, z0, z1);
  wall(maxX, maxX + WALL, z0, z1);
  if (zEnd < 0) wall(minX - WALL, maxX + WALL, z0 - WALL, z0);
  else wall(minX - WALL, maxX + WALL, z1, z1 + WALL);
}

// Picket sign on the base by a track's start, facing the spawn
export function addSign(scene, text, x, dir = -1) {
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), wood);
  post.position.set(0, 0.8, -0.14); // behind the board, not through it
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.1), wood);
  board.position.y = 1.75;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.72), new THREE.MeshStandardMaterial({ map: signTexture(text) }));
  face.position.set(0, 1.75, 0.051);
  sign.add(post, board, face);
  sign.traverse((o) => { o.castShadow = true; });
  sign.position.set(x, 0, -dir * (START_Z + 1));
  if (dir > 0) sign.rotation.y = Math.PI;
  scene.add(sign);
}

function buildConveyors(scene, moveSpeed) {
  const run = makeRun(scene, CONVEYOR_X);
  const belts = [];
  const sideMat = new THREE.MeshStandardMaterial({ color: '#55555c' });
  const baseChevron = chevronTexture();

  REQUIRED.forEach((req, i) => {
    if (i > 0) run.addBox(REST_LENGTH, restMat);
    const length = FIRST_LENGTH + LENGTH_STEP * i;
    const box = run.addBox(length, sideMat);
    box.belt = moveSpeed * req / 100;

    const tex = baseChevron.clone();
    tex.repeat.set(1, length / WIDTH);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, length), new THREE.MeshStandardMaterial({ map: tex }));
    top.rotation.x = -Math.PI / 2;
    top.position.copy(box.center).setY(0.01);
    top.receiveShadow = true;
    scene.add(top);
    belts.push({ tex, speed: box.belt });
  });
  const goal = addGoal(scene, run, 1);
  addWalls(run.solids, CONVEYOR_X - WIDTH / 2, CONVEYOR_X + WIDTH / 2, run.z);
  addSign(scene, '1 🏆', CONVEYOR_X + WIDTH / 2 + 1.2);

  return {
    solids: run.solids,
    goal,
    update(dt) {
      for (const b of belts) b.tex.offset.y += (b.speed * dt) / WIDTH;
    },
  };
}

// Colored brick plates; vanishing ones fade when touched and come back a while after
function brickPlates() {
  const plates = [];
  const bricks = brickTexture();
  return {
    add(run, length, hue, vanish = true) {
      const map = bricks.clone();
      map.repeat.set(2, (2 * length) / WIDTH); // ~2.5 unit brick tiles
      const material = new THREE.MeshStandardMaterial({
        map,
        color: new THREE.Color().setHSL(hue, 0.75, 0.55),
        transparent: vanish,
      });
      const plate = run.addBox(length, material);
      if (!vanish) return;
      plate.timer = 0;   // counts down while fading, then while gone
      plate.state = 'solid';
      plate.onTouch = () => {
        if (plate.state !== 'solid') return;
        plate.state = 'fading';
        plate.timer = PLATE_LIFE;
      };
      plates.push(plate);
    },
    update(dt) {
      for (const p of plates) {
        if (p.state === 'solid') continue;
        p.timer -= dt;
        if (p.state === 'fading') {
          // Slowly fade out as it runs out
          p.mesh.material.opacity = 0.1 + 0.9 * Math.max(0, p.timer) / PLATE_LIFE;
          if (p.timer <= 0) {
            p.state = 'gone';
            p.off = true;
            p.mesh.visible = false;
            p.timer = PLATE_RESPAWN;
          }
        } else if (p.timer <= 0) {
          p.state = 'solid';
          p.off = false;
          p.mesh.visible = true;
          p.mesh.material.opacity = 1;
        }
      }
    },
    sync(states) {
      plates.forEach((p,i) => {
        const state = states[i];
        p.off = !!state.off;
        p.mesh.visible = !p.off;
        p.mesh.material.opacity = state.phase === 1 ? .1 + .9 * Math.max(0,state.timer) / PLATE_LIFE : 1;
      });
    },
  };
}

function buildPlates(scene) {
  const run = makeRun(scene, PLATE_X);
  const plates = brickPlates();
  for (let i = 0; i < PLATE_COUNT; i++) plates.add(run, PLATE_STEP * (i + 1), i / PLATE_COUNT);
  const goal = addGoal(scene, run, 2);
  addWalls(run.solids, PLATE_X - WIDTH / 2, PLATE_X + WIDTH / 2, run.z);
  addSign(scene, '2 🏆', PLATE_X - WIDTH / 2 - 1.2);
  return { solids: run.solids, goal, update: plates.update, sync: course => plates.sync(course.vanish) };
}

function buildHops(scene) {
  const run = makeRun(scene, HOP_X, 1);
  const plates = brickPlates();
  for (let i = 0; i < HOP_COUNT; i++) {
    run.gap(HOP_FIRST_GAP + HOP_GAP_STEP * i);
    plates.add(run, HOP_SIZE, i / HOP_COUNT, false);
  }
  const goal = addGoal(scene, run, 2, HOP_SIZE); // directly after the last plate
  addWalls(run.solids, HOP_X - WIDTH / 2, HOP_X + WIDTH / 2, run.z);
  addSign(scene, '2 🏆', HOP_X + WIDTH / 2 + 1.2, 1);
  return { solids: run.solids, goal, update: plates.update };
}

// Red ball with darker bands so the roll reads
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8261e';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#a3140f';
  for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 24, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRamp(scene) {
  const sin = Math.sin(RAMP_ANGLE), cos = Math.cos(RAMP_ANGLE);
  const refuges = []; // distance along the slope of each refuge's center
  let s = REFUGE_FIRST;
  for (let i = 0; i < REFUGE_COUNT; i++) {
    refuges.push(s);
    s += REFUGE_GAP + REFUGE_GAP_STEP * i;
  }
  const length = refuges[REFUGE_COUNT - 1] + RAMP_TOP_RUN;
  const z0 = -START_Z;
  const rise = length * sin;
  // Surface point and outward normal along the slope
  const at = (d) => new THREE.Vector3(RAMP_X, d * sin, z0 + d * cos);
  const normal = new THREE.Vector3(0, cos, -sin);

  // A 1 thick slab lying on the slope: x centered, from d0 to d1 along it
  const ramps = [];
  const addSlab = (x, width, d0, d1, material) => {
    const slab = {
      minX: x - width / 2,
      maxX: x + width / 2,
      z0: z0 + d0 * cos,
      z1: z0 + d1 * cos,
      slope: sin / cos,
      thickness: 1 / cos, // measured vertically
      heightAt: (z) => (z - z0) * (sin / cos),
    };
    slab.mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, d1 - d0), material);
    slab.mesh.position.copy(at((d0 + d1) / 2)).setX(x).addScaledVector(normal, -0.5);
    slab.mesh.rotation.x = -RAMP_ANGLE;
    slab.mesh.receiveShadow = true;
    scene.add(slab.mesh);
    ramps.push(slab);
    return slab;
  };
  const ramp = addSlab(RAMP_X, RAMP_WIDTH, 0, length, new THREE.MeshStandardMaterial({ color: '#b3b7bd' }));

  // Refuges lie on the same slope off its sides: left, right, left...
  const solids = [];
  const bricks = brickTexture();
  refuges.forEach((d, i) => {
    const side = i % 2 ? -1 : 1;
    const map = bricks.clone();
    map.repeat.set(2, 2);
    const material = new THREE.MeshStandardMaterial({ map, color: new THREE.Color().setHSL(i / REFUGE_COUNT, 0.75, 0.55) });
    const x = RAMP_X + side * (RAMP_WIDTH + REFUGE_SIZE) / 2;
    addSlab(x, REFUGE_SIZE, d - REFUGE_SIZE / 2, d + REFUGE_SIZE / 2, material).mesh.castShadow = true;
  });

  const run = makeRun(scene, RAMP_X, 1, { y: rise, width: RAMP_WIDTH });
  run.gap(length * cos);
  const goal = addGoal(scene, run, 1);
  solids.push(...run.solids);
  // Out at the refuges' outer edges
  const reach = RAMP_WIDTH / 2 + REFUGE_SIZE;
  addWalls(solids, RAMP_X - reach, RAMP_X + reach, run.z, rise);
  addSign(scene, '1 🏆', ramp.minX - 1.2, 1);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 20),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.5 })
  );
  mesh.castShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  const ball = { d: 0, speed: 0, scale: 0, wait: BALL_DELAY, vel: new THREE.Vector3() };
  const closest = new THREE.Vector3();

  return {
    solids,
    goal,
    ramps,
    sync(course) {
      const state = course.ball;
      mesh.visible = state.active && state.scale > 0;
      mesh.scale.setScalar(Math.max(0,state.scale));
      mesh.position.copy(at(state.d)).addScaledVector(normal, BALL_RADIUS*state.scale);
      mesh.rotation.x = -state.d/BALL_RADIUS;
    },
    update(dt) {
      if (!mesh.visible) {
        ball.wait -= dt;
        if (ball.wait > 0) return;
        Object.assign(ball, { d: length - BALL_RADIUS - 1, speed: 0, scale: 0 });
        mesh.visible = true;
      }
      ball.speed = Math.min(ball.speed + BALL_ACCEL * dt, BALL_MAX_SPEED);
      ball.d -= ball.speed * dt;
      ball.vel.set(0, -sin, -cos).multiplyScalar(ball.speed);
      mesh.rotation.x -= (ball.speed * dt) / BALL_RADIUS;
      // Grows in at the top, shrinks away before the bottom
      if (ball.d > BALL_DESPAWN) ball.scale = Math.min(1, ball.scale + dt * 3);
      else ball.scale -= dt * 6;
      if (ball.scale <= 0) {
        mesh.visible = false;
        ball.wait = BALL_DELAY;
        return;
      }
      mesh.scale.setScalar(ball.scale);
      mesh.position.copy(at(ball.d)).addScaledVector(normal, BALL_RADIUS * ball.scale);
    },
    // The ball's velocity if it touches the box at bottom-center p, else null
    hit(p, w, h, dp) {
      if (!mesh.visible) return null;
      const c = mesh.position;
      closest.set(
        THREE.MathUtils.clamp(c.x, p.x - w / 2, p.x + w / 2),
        THREE.MathUtils.clamp(c.y, p.y, p.y + h),
        THREE.MathUtils.clamp(c.z, p.z - dp / 2, p.z + dp / 2)
      );
      return closest.distanceTo(c) < BALL_RADIUS * ball.scale * 0.95 ? ball.vel : null;
    },
  };
}

// Invisible walls around the base, open where each path leaves it
function baseWalls(base) {
  const walls = [];
  const wall = (x0, x1, z0, z1) => walls.push({
    min: new THREE.Vector3(x0, -10, z0),
    max: new THREE.Vector3(x1, base.max.y + WALL_HEIGHT, z1),
  });
  const { min, max } = base;
  wall(min.x - WALL, min.x, min.z - WALL, max.z + WALL);
  wall(max.x, max.x + WALL, min.z - WALL, max.z + WALL);
  for (const side of [-1, 1]) {
    const [z0, z1] = side < 0 ? [min.z - WALL, min.z] : [max.z, max.z + WALL];
    const gaps = entrances.filter((e) => e.side === side).sort((a, b) => a.minX - b.minX);
    let x = min.x;
    for (const g of gaps) {
      if (g.minX > x) wall(x, g.minX, z0, z1);
      x = Math.max(x, g.maxX);
    }
    if (x < max.x) wall(x, max.x, z0, z1);
  }
  return walls;
}

export function buildTracks(scene, moveSpeed, base) {
  const tracks = [buildConveyors(scene, moveSpeed), buildPlates(scene), buildHops(scene), buildRamp(scene)];
  let t = 0;
  return {
    solids: [...tracks.flatMap((tr) => tr.solids), ...baseWalls(base)],
    goals: tracks.map((tr) => tr.goal),
    ramps: tracks.flatMap((tr) => tr.ramps ?? []),
    hit: (...args) => tracks.reduce((v, tr) => v ?? tr.hit?.(...args) ?? null, null),
    update(dt, course) {
      t += dt;
      for (const tr of tracks) {
        if (course && tr.sync) tr.sync(course);
        else tr.update(dt);
        tr.goal.animate(t);
      }
    },
  };
}
