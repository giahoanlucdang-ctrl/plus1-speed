import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { world, stepPhysics } from './physics.js';

const LIFE = 3;
const FADE = 1;
const DENSITY = 10;

// Which body part a node (bone or mesh) belongs to, from its name, or null.
// three.js strips '.' and turns spaces into '_' ("Foot.L_3" -> "FootL_3").
function partOf(name) {
  if (/head|neck/i.test(name)) return 'head';
  const side = /left/i.test(name) ? 'L' : /right/i.test(name) ? 'R' : name.match(/([LR])(_\d+)?$/)?.[1];
  if (!side) return null;
  if (/shoulder|arm|hand|palm|thumb|index|middle|ring|finger/i.test(name)) return 'arm' + side;
  if (/leg|foot|toe|pole/i.test(name)) return 'leg' + side;
  return null;
}

// Nearest ancestor (or self) that names a body part; anything else is torso.
// The node returned is the one whose orientation the part's box follows.
function partFrom(node, root) {
  for (let n = node; n && n !== root; n = n.parent) {
    const part = partOf(n.name);
    if (part) return { part, node: n };
  }
  return { part: 'torso', node: root };
}

// Breaks the avatar under `root` (in its current, posed shape) into head,
// torso, arms and legs: rigid boxes in the physics world that tumble, settle
// and fall off ledges, then fade out. Each mesh (or, for skinned meshes, each
// triangle's main bone) is assigned a part by name. `velocity` is carried in.
const active = [];

// Steps the physics world and every live shatter; call once per frame
export function updateShatters(dt) {
  if (!active.length) return;
  stepPhysics(dt);
  for (const s of [...active]) {
    s.update(dt);
    if (s.done) active.splice(active.indexOf(s), 1);
  }
}

export function shatter(root, scene, velocity = new THREE.Vector3()) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const frames = new Map(); // part -> world orientation of its box
  const faded = new Map();
  const v = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    const geo = mesh.geometry;
    const index = geo.index;
    const uv = geo.attributes.uv;
    const color = geo.attributes.color;
    const skinIndex = mesh.isSkinnedMesh ? geo.attributes.skinIndex : null;
    const skinWeight = skinIndex && geo.attributes.skinWeight;
    // Bone with the most influence over a vertex
    const boneOf = (i) => {
      let best = 0, bestW = -1;
      for (let c = 0; c < 4; c++) {
        const w = skinWeight.getComponent(i, c);
        if (w > bestW) { bestW = w; best = skinIndex.getComponent(i, c); }
      }
      return best;
    };
    const triCount = (index ? index.count : geo.attributes.position.count) / 3;
    const materialFor = (tri) => {
      if (!Array.isArray(mesh.material)) return mesh.material;
      const g = geo.groups.find((gr) => tri * 3 >= gr.start && tri * 3 < gr.start + gr.count);
      return mesh.material[g?.materialIndex ?? 0];
    };

    for (let t = 0; t < triCount; t++) {
      const corners = [];
      centroid.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        corners.push({ i, p: v.clone() });
        centroid.add(v);
      }
      centroid.divideScalar(3);
      const material = materialFor(t);
      if (!material) continue;
      const { part, node } = skinIndex ? partFrom(mesh.skeleton.bones[boneOf(corners[0].i)], root) : partFrom(mesh, root);
      if (!frames.has(part)) frames.set(part, node.getWorldQuaternion(new THREE.Quaternion()));
      const key = part + material.uuid;
      let b = buckets.get(key);
      if (!b) {
        if (!faded.has(material)) {
          const m = material.clone();
          m.transparent = true;
          m.side = THREE.DoubleSide;
          faded.set(material, m);
        }
        b = { part, material: faded.get(material), pos: [], uv: uv ? [] : null, color: color ? [] : null, colorSize: color?.itemSize };
        buckets.set(key, b);
      }
      for (const { i, p } of corners) {
        b.pos.push(p.x, p.y, p.z);
        if (b.uv) b.uv.push(uv.getX(i), uv.getY(i));
        if (b.color) for (let c = 0; c < color.itemSize; c++) b.color.push(color.getComponent(i, c));
      }
    }
  });

  // One group per part, holding a mesh per material, laid out in the part's
  // own frame so its collision box fits snugly
  const parts = new Map();
  for (const b of buckets.values()) {
    const q = frames.get(b.part);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.applyQuaternion(q.clone().invert());
    if (b.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    if (b.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(b.color, b.colorSize));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    if (!parts.has(b.part)) parts.set(b.part, { q, meshes: [], box: new THREE.Box3() });
    const p = parts.get(b.part);
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = true;
    p.meshes.push(mesh);
    p.box.union(geo.boundingBox);
  }

  const speed = velocity.length();
  const shards = [];
  let torso = null;
  for (const [name, p] of parts) {
    const localMid = p.box.getCenter(new THREE.Vector3());
    const size = p.box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.06, 0.06, 0.06));
    const group = new THREE.Group();
    for (const m of p.meshes) {
      m.geometry.translate(-localMid.x, -localMid.y, -localMid.z);
      group.add(m);
    }
    const mid = localMid.applyQuaternion(p.q);
    scene.add(group);

    // Parts just drop from where they were, keeping the player's momentum
    // with a slight spread so they don't move as one
    const vel = velocity.clone().multiplyScalar(0.9 + Math.random() * 0.2);
    vel.x += (Math.random() - 0.5) * (0.6 + speed * 0.05);
    vel.z += (Math.random() - 0.5) * (0.6 + speed * 0.05);

    const body = new CANNON.Body({
      mass: DENSITY * size.x * size.y * size.z,
      shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
      position: new CANNON.Vec3(mid.x, mid.y, mid.z),
      quaternion: new CANNON.Quaternion(p.q.x, p.q.y, p.q.z, p.q.w),
      velocity: new CANNON.Vec3(vel.x, vel.y, vel.z),
      angularVelocity: new CANNON.Vec3(
        (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8
      ),
      linearDamping: 0.05,
      angularDamping: 0.1,
    });
    world.addBody(body);
    shards.push({ group, body });
    if (name === 'torso') torso = group;
  }

  const sync = () => {
    for (const s of shards) {
      s.group.position.copy(s.body.position);
      s.group.quaternion.copy(s.body.quaternion);
    }
  };
  sync();

  let age = 0;
  const result = {
    get done() { return age >= LIFE; },
    // The piece the camera should follow
    focus: torso ?? shards[0]?.group,
    // Call after the physics world has stepped
    update(dt) {
      age += dt;
      const opacity = Math.min(1, (LIFE - age) / FADE);
      for (const m of faded.values()) m.opacity = Math.max(0, opacity);
      sync();
      if (age >= LIFE) {
        for (const s of shards) {
          world.removeBody(s.body);
          scene.remove(s.group);
          s.group.traverse((o) => o.geometry?.dispose());
        }
        for (const m of faded.values()) m.dispose();
      }
    },
  };
  active.push(result);
  return result;
}
