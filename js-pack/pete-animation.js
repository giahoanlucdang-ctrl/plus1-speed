import * as THREE from 'three';

// Hand-authored cycles for Pete's existing deform rig. Rotate around model-world
// axes, then convert to each bone's local space; the rig's rest axes differ.
export function animatePete(model) {
  model.updateMatrixWorld(true);
  const find = name => {
    let found;
    model.traverse(bone => {
      if (bone.isBone && bone.name.replace(/[^a-z0-9_]/gi, '') === name.replace(/[^a-z0-9_]/gi, '')) found = bone;
    });
    return found;
  };
  const parts = [];
  for (const side of ['l', 'r']) {
    for (const [part, stem] of [['arm', 'arm_twist'], ['thigh', 'thigh_twist'], ['knee', 'leg_stretch']]) {
      const bone = find('DEF_c_' + stem + '.' + side);
      if (bone) parts.push({ part, side, bone, rest: bone.quaternion.clone(), parent: bone.parent.getWorldQuaternion(new THREE.Quaternion()) });
    }
  }
  const spine = find('DEF_c_spine_02_bend.x');
  if (spine) parts.push({ part: 'spine', bone: spine, rest: spine.quaternion.clone(), parent: spine.parent.getWorldQuaternion(new THREE.Quaternion()) });
  const x = new THREE.Vector3(1, 0, 0);
  const z = new THREE.Vector3(0, 0, 1);
  const make = (name, duration) => {
    const tracks = [];
    for (const p of parts) {
      const times = [], values = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const phase = 2 * Math.PI * t;
        const side = p.side === 'l' ? 1 : -1;
        const stride = Math.sin(phase) * side;
        let forward = 0, down = 0;
        if (p.part === 'arm') {
          down = -side * 1.08; // relax the exported spread-arm pose
          if (name === 'walk') forward = -stride * 0.32;
          if (name === 'run') { forward = -stride * 0.65; down *= 0.85; }
          if (name === 'idle') forward = Math.sin(phase) * 0.025;
          if (name === 'jump' || name === 'fall') { down = -side * 0.55; forward = -0.35; }
        } else if (p.part === 'thigh') {
          if (name === 'walk') forward = stride * 0.38;
          if (name === 'run') forward = stride * 0.7;
          if (name === 'jump') forward = 0.25 * Math.sin(Math.PI * t);
          if (name === 'fall') forward = 0.14;
        } else if (p.part === 'knee') {
          if (name === 'walk') forward = -Math.max(0, -stride) * 0.45;
          if (name === 'run') forward = -Math.max(0, -stride) * 0.9;
          if (name === 'jump') forward = -0.45 * Math.sin(Math.PI * t);
          if (name === 'fall') forward = -0.2;
        } else if (p.part === 'spine') {
          forward = name === 'run' ? 0.1 : name === 'idle' ? Math.sin(phase) * 0.012 : 0;
        }
        const delta = new THREE.Quaternion().setFromAxisAngle(x, forward)
          .multiply(new THREE.Quaternion().setFromAxisAngle(z, down));
        const local = p.parent.clone().invert().multiply(delta).multiply(p.parent).multiply(p.rest).normalize();
        times.push(t * duration);
        values.push(local.x, local.y, local.z, local.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(p.bone.uuid + '.quaternion', times, values));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };
  return [make('idle', 2.4), make('walk', 1), make('run', 0.72), make('jump', 0.65), make('fall', 1)];
}
