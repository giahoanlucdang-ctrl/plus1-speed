import * as THREE from 'three';
import { VIP_PORTAL } from './server.js';

const DOOR_W = 4;
const DOOR_H = 5.5;
const FRAME = 0.5;
const BADGE_URL = 'image-pack/download.jpg';

function paneCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 352;
  const g = c.getContext('2d');
  let image = null;

  function draw() {
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2b0a52');
    grad.addColorStop(0.55, '#5c1cab');
    grad.addColorStop(1, '#100428');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const glow = g.createRadialGradient(w / 2, h * 0.4, 8, w / 2, h * 0.4, w * 0.7);
    glow.addColorStop(0, 'rgba(255, 214, 92, 0.5)');
    glow.addColorStop(1, 'rgba(255, 214, 92, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);

    if (image) {
      // The badge asset is a round emblem on a white square: clip the corners
      // and ring it in gold so no white box shows on the pane.
      const size = 160;
      const cy = 46 + size / 2;
      g.save();
      g.beginPath();
      g.arc(w / 2, cy, size / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(image, w / 2 - size / 2, 46, size, size);
      g.restore();
      g.strokeStyle = '#ffd75e';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(w / 2, cy, size / 2, 0, Math.PI * 2);
      g.stroke();
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffe28a';
    g.shadowColor = 'rgba(90, 20, 160, 0.85)';
    g.shadowBlur = 10;
    g.font = '900 42px system-ui, sans-serif';
    g.fillText('VIP GATE', w / 2, 246);
    g.shadowBlur = 6;
    g.fillStyle = '#d9bdff';
    g.font = '800 27px system-ui, sans-serif';
    g.fillText('WORLD 2', w / 2, 294);

    g.shadowBlur = 0;
    g.strokeStyle = '#ffd75e';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 2;
    g.strokeRect(16, 16, w - 32, h - 32);
  }

  draw();
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const badge = new Image();
  badge.onload = () => {
    image = badge;
    draw();
    map.needsUpdate = true;
  };
  badge.src = BADGE_URL;
  return map;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(196, 140, 255, 0.9)');
  grad.addColorStop(0.5, 'rgba(122, 60, 220, 0.35)');
  grad.addColorStop(1, 'rgba(80, 20, 160, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function buildVipPortal(scene) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4423', emissive: '#2a1608', emissiveIntensity: 0.35, roughness: 0.72 });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc4d', emissive: '#7a4b00', emissiveIntensity: 0.65, metalness: 0.75, roughness: 0.3 });

  const post = (x) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(FRAME, DOOR_H, FRAME), wood);
    p.position.set(x, DOOR_H / 2, 0);
    p.castShadow = p.receiveShadow = true;
    group.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(FRAME + 0.16, 0.2, FRAME + 0.16), gold);
    cap.position.set(x, DOOR_H + 0.1, 0);
    cap.castShadow = true;
    group.add(cap);
    const base = new THREE.Mesh(new THREE.BoxGeometry(FRAME + 0.2, 0.18, FRAME + 0.2), gold);
    base.position.set(x, 0.09, 0);
    base.castShadow = base.receiveShadow = true;
    group.add(base);
  };
  post(-(DOOR_W + FRAME) / 2);
  post((DOOR_W + FRAME) / 2);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + FRAME * 2, FRAME, FRAME), wood);
  beam.position.set(0, DOOR_H + FRAME / 2, 0);
  beam.castShadow = beam.receiveShadow = true;
  group.add(beam);

  const beamTrim = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + FRAME * 2 + 0.16, 0.12, FRAME + 0.16), gold);
  beamTrim.position.set(0, DOOR_H + FRAME - 0.06, 0);
  beamTrim.castShadow = true;
  group.add(beamTrim);

  const paneMaterial = new THREE.MeshBasicMaterial({
    map: paneCanvas(),
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), paneMaterial);
  pane.position.set(0, DOOR_H / 2, 0);
  group.add(pane);

  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + 1.5, DOOR_H + 1.3), glowMaterial);
  glow.position.set(0, DOOR_H / 2, -0.08);
  group.add(glow);

  const light = new THREE.PointLight('#b57bff', 10, 11, 2);
  light.position.set(0, 3, 0.8);
  group.add(light);

  group.position.set(VIP_PORTAL.x, 0, VIP_PORTAL.z);
  scene.add(group);

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      paneMaterial.opacity = 0.88 + 0.08 * Math.sin(t * 1.7);
      glowMaterial.opacity = 0.3 + 0.18 * pulse;
      light.intensity = 8 + 5 * pulse;
    },
  };
}
