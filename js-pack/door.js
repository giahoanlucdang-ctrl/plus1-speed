import * as THREE from 'three';
import { DOOR, WORLD_COSTS } from './server.js';

// A doorframe on one of a base's short sides (+x or -x): red and locked until the target world is bought
const DOOR_W = DOOR.half * 2;
const DOOR_H = 5.5;
const FRAME = 0.5;

function paneTexture(open, label, wins) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 352;
  const g = c.getContext('2d');
  g.fillStyle = open ? 'rgba(60, 50, 120, 0.5)' : 'rgba(200, 30, 30, 0.7)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0, 0, 0, 0.4)';
  g.shadowBlur = 6;
  g.font = '900 54px system-ui, sans-serif';
  g.fillText(label, 128, 150);
  if (!open) {
    g.font = '700 38px system-ui, sans-serif';
    g.fillText(`${wins} Wins`, 128, 205);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function buildDoor(scene, base, { side = 1, label = 'World 2', world = 2, wins = WORLD_COSTS[world], z = (base.min.z + base.max.z) / 2 } = {}) {
  const door = new THREE.Group();
  const textures = [paneTexture(false, label, wins), paneTexture(true, label, wins)];
  const stone = new THREE.MeshStandardMaterial({ color: '#7a5434' });
  const piece = (w, h, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(FRAME, h, w), stone);
    m.position.set(0, y, z);
    m.castShadow = m.receiveShadow = true;
    door.add(m);
  };
  piece(FRAME, DOOR_H, DOOR_H / 2, -(DOOR_W + FRAME) / 2);
  piece(FRAME, DOOR_H, DOOR_H / 2, (DOOR_W + FRAME) / 2);
  piece(DOOR_W + FRAME * 2, FRAME, DOOR_H + FRAME / 2, 0);

  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, DOOR_H),
    new THREE.MeshBasicMaterial({ map: textures[0], transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  pane.rotation.y = -side * Math.PI / 2; // faces into the base
  pane.position.y = DOOR_H / 2;
  door.add(pane);

  door.position.set(side > 0 ? base.max.x - FRAME / 2 : base.min.x + FRAME / 2, 0, z);
  scene.add(door);
  let open = null;
  return (unlocked) => {
    const next = world === 1 || (Array.isArray(unlocked) ? unlocked.includes(world) : false);
    if (open === next) return;
    open = next;
    pane.material.map = textures[+open];
  };
}
