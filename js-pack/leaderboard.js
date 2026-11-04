import * as THREE from 'three';

// A wall on the base's short side with plaques for the top 5 players,
// laid out 5 3 1 2 4 (left to right, as seen from the base).
const ORDER = [5, 3, 1, 2, 4];
const RANK_COLORS = { 1: '#f5c518', 2: '#c3cad2', 3: '#d08a4a' };
const PLAQUE_W = 2.5;
const PLAQUE_H = 3;
const SPACING = 3;
const REFRESH = 30000;

function avatarImage(username) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `https://images.websim.com/avatar/${encodeURIComponent(username)}`;
  });
}

function drawPlaque(g, rank, entry, img) {
  const W = 256, H = 308;
  const accent = RANK_COLORS[rank] ?? '#8b5a2b';
  g.clearRect(0, 0, W, H);
  g.fillStyle = accent;
  g.beginPath();
  g.roundRect(0, 0, W, H, 22);
  g.fill();
  g.fillStyle = '#fdf6e8';
  g.beginPath();
  g.roundRect(10, 10, W - 20, H - 20, 16);
  g.fill();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#222';
  g.font = '900 40px system-ui, sans-serif';
  g.fillText(`#${rank}`, W / 2, 42);

  // Round avatar
  const cx = W / 2, cy = 132, r = 58;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#ddd';
  g.fill();
  g.clip();
  if (img) g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = accent;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();

  g.fillStyle = '#222';
  let size = 30;
  const name = entry ? `@${entry.username}` : '—';
  do g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(name).width > W - 36 && --size > 12);
  g.fillText(name, W / 2, 222);

  if (entry) {
    g.font = '800 24px system-ui, sans-serif';
    g.fillStyle = '#e0201b';
    g.fillText(`${entry.rebirths} R`, W / 2 - 52, 264);
    g.fillStyle = '#c99400';
    g.fillText(`${entry.wins} W`, W / 2 + 52, 264);
  }
}

export function buildLeaderboard(scene, base) {
  const x = base.min.x;
  const group = new THREE.Group();

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 5, base.max.z - base.min.z),
    new THREE.MeshStandardMaterial({ color: '#7a5434' })
  );
  wall.position.set(x - 0.2, 2.5, (base.min.z + base.max.z) / 2);
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);

  // Facing into the base (+x), so left to right runs toward -z
  const plaques = ORDER.map((rank, i) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 308;
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLAQUE_W, PLAQUE_H), new THREE.MeshStandardMaterial({ map, transparent: true }));
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(x + 0.01, 2.2 + (rank === 1 ? 0.3 : 0), (2 - i) * SPACING);
    group.add(mesh);
    const g = c.getContext('2d');
    drawPlaque(g, rank, null, null);
    return { rank, g, map, key: '' };
  });
  scene.add(group);

  async function refresh() {
    let top;
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      top = await res.json();
    } catch {
      return;
    }
    for (const p of plaques) {
      const entry = top[p.rank - 1] ?? null;
      const key = JSON.stringify(entry);
      if (key === p.key) continue;
      p.key = key;
      const img = entry ? await avatarImage(entry.username) : null;
      drawPlaque(p.g, p.rank, entry, img);
      p.map.needsUpdate = true;
    }
  }
  refresh();
  setInterval(refresh, REFRESH);
}
