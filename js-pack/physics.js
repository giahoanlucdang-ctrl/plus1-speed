import * as CANNON from 'cannon-es';

// Rigid-body world for loose objects (death pieces). The level's boxes are
// mirrored in as static bodies; vanished plates stop colliding.
export const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.5;
world.defaultContactMaterial.restitution = 0.15;

const statics = [];

export function addStatic(box) {
  const half = box.max.clone().sub(box.min).multiplyScalar(0.5);
  const mid = box.min.clone().add(half);
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)),
    position: new CANNON.Vec3(mid.x, mid.y, mid.z),
  });
  world.addBody(body);
  statics.push({ box, body });
}

// A tilted slab, from its mesh
export function addRamp(ramp) {
  const { width, height, depth } = ramp.mesh.geometry.parameters;
  const { position: p, quaternion: q } = ramp.mesh;
  world.addBody(new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)),
    position: new CANNON.Vec3(p.x, p.y, p.z),
    quaternion: new CANNON.Quaternion(q.x, q.y, q.z, q.w),
  }));
}

export function stepPhysics(dt) {
  for (const s of statics) s.body.collisionResponse = !s.box.off;
  world.step(1 / 120, dt, 12);
}
