import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { animatePete } from './pete-animation.js';

export const AVATARS = [
  { id: 'noob', name: 'Noob', url: 'glb-pack/r6_roblox_noob_animated.glb' },
  { id: 'robot', name: 'Robot', url: encodeURI('glb-pack/robotexpressive (2).glb') },
  { id: 'pete', name: 'Pete Wheels', url: 'glb-pack/pete-wheels.glb' },
  // SM64 rips name clips by animation ID (hex)
  { id: 'mario', name: 'Mario', url: 'glb-pack/mario_sm64_dx_coop.glb',
    clips: { idle: 'C5', walk: '48', run: '72', jump: '4D' },
    stillHead: 'Head_022' },
  { id: 'clark', name: 'Clark', url: 'glb-pack/pirate_clark.glb',
    clips: { idle: '@idle', walk: '@walk', run: '@run', jump: '@jump' },
    // These clips bake a turn into the hips; rotate it back out (degrees, x/y/z).
    // The run rocks the whole body about the feet, so its hips are held upright instead.
    fix: { bone: 'spine_78', idle: [0, -79, 0], walk: [0, -98, 0], run: 'upright' } },
  // Trimmed to just these four clips (the original rig shipped 33). Every stock idle is
  // a fidget routine, so 'Idle' is the calm stance cut from one, played back and forth.
  { id: 'spongebob', name: 'SpongeBob', url: 'glb-pack/battle_for_bikini_bottom_spongebob_rig.glb',
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump 1' },
    pingPongIdle: true },
  // Billboard sprite sheet: frame 0 is the standing pose, all frames cycle while moving
  { id: 'baldi', name: 'Baldi', url: 'image-pack/baldi.png', sprite: { frames: 6, fps: 10 } },
];

const loader = new GLTFLoader();
const cache = new Map();

const findClip = (clips, ...patterns) => {
  for (const p of patterns) {
    const clip = clips.find((c) => p.test(c.name.split('|').pop()));
    if (clip) return clip;
  }
  return null;
};

// Copy of `clip` with the bone's rotation and position turned by the given euler degrees,
// or with every key tipped back to the bone's rest tilt ('upright'), keeping its turn
function fixRoot(clip, bone, fix) {
  const upright = fix === 'upright';
  const q = new THREE.Quaternion();
  if (!upright) q.setFromEuler(new THREE.Euler(...fix.map(THREE.MathUtils.degToRad)));
  const restUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.quaternion);
  const fixed = clip.clone();
  const k = new THREE.Quaternion();
  const v = new THREE.Vector3();
  for (const t of fixed.tracks) {
    if (t.name === `${bone.name}.quaternion`) {
      for (let i = 0; i < t.values.length; i += 4) {
        k.fromArray(t.values, i);
        if (upright) q.setFromUnitVectors(v.set(0, 1, 0).applyQuaternion(k), restUp);
        k.premultiply(q).toArray(t.values, i);
      }
    } else if (t.name === `${bone.name}.position` && !upright) {
      for (let i = 0; i < t.values.length; i += 3) {
        v.fromArray(t.values, i).applyQuaternion(q).toArray(t.values, i);
      }
    }
  }
  return fixed;
}

// Each asset downloads once; every call builds its own instance (so several
// players can wear the same avatar at once).
const loadAsset = (def) => {
  if (!cache.has(def.id)) {
    cache.set(def.id, def.sprite ? new THREE.TextureLoader().loadAsync(def.url) : loader.loadAsync(def.url));
  }
  return cache.get(def.id);
};

// Loads an avatar scaled to `height`, feet at y = 0, centered on x/z.
export function loadAvatar(id, height) {
  const def = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  return def.sprite ? loadSprite(def, height) : loadAsset(def).then((gltf) => {
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const clips = def.id === 'pete' ? animatePete(model) : gltf.animations;
    const named = (key) => {
      const clip = def.clips && clips.find((c) => c.name.split('|').pop() === def.clips[key]);
      return clip && def.fix?.[key] ? fixRoot(clip, model.getObjectByName(def.fix.bone), def.fix[key]) : clip;
    };
    const actions = {};
    const add = (key, clip, once = false) => {
      if (!clip) return;
      const a = mixer.clipAction(clip);
      if (once) {
        a.setLoop(THREE.LoopOnce);
        a.clampWhenFinished = true;
      }
      actions[key] = a;
    };
    let idleClip = named('idle') ?? findClip(clips, /^idle$/i, /idle/i, /standing/i);
    // The idle cycle swings the head around; hold it at its resting (final) pose
    if (idleClip && def.stillHead) {
      idleClip = idleClip.clone();
      const name = `${def.stillHead}.quaternion`;
      const i = idleClip.tracks.findIndex((t) => t.name === name);
      if (i >= 0) {
        const v = idleClip.tracks[i].values.slice(-4);
        idleClip.tracks[i] = new THREE.QuaternionKeyframeTrack(name, [0], v);
      }
    }
    add('idle', idleClip);
    if (def.pingPongIdle) actions.idle?.setLoop(THREE.LoopPingPong, Infinity);
    add('walk', named('walk') ?? findClip(clips, /^walk(ing|anim)?$/i, /walk/i, /run/i));
    add('run', named('run') ?? findClip(clips, /^run(ning|anim)?$/i));
    const jumpClip = named('jump') ?? findClip(clips, /^jump$/i, /jump/i);
    add('jump', jumpClip, true);
    // Avatars without a fall clip hold the airborne pose from mid-jump
    add('fall', named('fall') ?? findClip(clips, /^fall$/i));
    if (!actions.fall && jumpClip) {
      add('fall', jumpClip.clone());
      actions.fall.timeScale = 0;
      actions.fall.holdAt = jumpClip.duration * 0.5;
    }

    // Measure in the idle pose so every avatar ends up the same height.
    actions.idle?.play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const s = height / size.y;
    const pivot = new THREE.Group();
    model.scale.setScalar(s);
    model.position.set(
      -(box.min.x + size.x / 2) * s,
      -box.min.y * s,
      -(box.min.z + size.z / 2) * s
    );
    pivot.add(model);

    return { root: pivot, mixer, actions, current: actions.idle ?? null };
  });
}

// Stand-in for an animation action, so sprites share the model avatar interface
class SpriteAction {
  timeScale = 1;
  reset() { return this; }
  fadeIn() { return this; }
  fadeOut() { return this; }
  play() { return this; }
}

// A flat card that turns about y to face the camera, flipping through frames
async function loadSprite(def, height) {
  const { frames, fps } = def.sprite;
  const tex = (await loadAsset(def)).clone();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / frames, 1);
  const { width, height: h } = tex.image;
  const plane = new THREE.PlaneGeometry(height * (width / frames) / h, height);
  plane.translate(0, height / 2, 0);
  const card = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, side: THREE.DoubleSide,
  }));
  card.castShadow = true;
  card.frustumCulled = false;

  const root = new THREE.Group();
  root.add(card);
  const q = new THREE.Quaternion();
  const toCam = new THREE.Vector3();
  card.onBeforeRender = (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera) return; // keep shadow passes as they are
    root.getWorldQuaternion(q);
    card.getWorldPosition(toCam);
    toCam.subVectors(camera.position, toCam);
    card.rotation.y = Math.atan2(toCam.x, toCam.z) - new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    card.updateMatrixWorld();
  };

  const actions = { idle: new SpriteAction(), walk: new SpriteAction() };
  const avatar = { root, actions, current: actions.idle };
  let t = 0;
  avatar.mixer = {
    stopAllAction() { t = 0; },
    update(dt) {
      t = avatar.current === actions.walk ? t + dt * fps * actions.walk.timeScale : 0;
      tex.offset.x = (Math.floor(t) % frames) / frames;
    },
  };
  return avatar;
}

// Crossfade to the named state if it isn't already playing.
export function setAnim(avatar, name) {
  const next = avatar.actions[name] ?? (name === 'fall' ? avatar.actions.jump : null) ?? avatar.actions.idle;
  if (!next || next === avatar.current) return;
  next.reset().fadeIn(0.15).play();
  if (next.holdAt != null) next.time = next.holdAt;
  avatar.current?.fadeOut(0.15);
  avatar.current = next;
}
