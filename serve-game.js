const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const root = __dirname;
const port = Number(process.argv[2]) || 8000;
const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((net) => net && net.family === 'IPv4' && !net.internal)?.address;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
};

// --- Multiplayer: relay players, positions and chat over WebSocket ---
// Everyone spawns on the one marked start pad; spaced-out spawns landed players
// on random parts of the base instead of the start.
const SPAWN = [0, 0];
const AFK_MS = 30000;
const players = new Map();
let nextPlayerId = 1;
let wss = null;

function wirePlayer(info) {
  return { id: info.id, name: info.name, avatar: info.avatar, ...info.state };
}

function broadcast(message, except) {
  if (!wss) return;
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1) client.send(payload);
  }
}

function startMultiplayer(server) {
  wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
  wss.on('connection', (socket) => {
    const index = nextPlayerId++;
    const spawn = SPAWN;
    const info = {
      id: `p${index}`,
      name: `Player ${index}`,
      avatar: 'noob',
      lastActive: Date.now(),
      state: { x: spawn[0], y: 0, z: spawn[1], r: 0, a: 'idle', d: 0, wins: 0, rebirths: 0 },
    };
    players.set(socket, info);
    socket.send(JSON.stringify({
      type: 'welcome',
      id: info.id,
      spawn: { x: spawn[0], z: spawn[1] },
      lan: lanAddress ? `http://${lanAddress}:${port}/` : null,
      players: [...players.values()].filter((p) => p !== info).map(wirePlayer),
    }));
    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'join') {
        const name = String(msg.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20);
        if (name) info.name = name;
        if (typeof msg.avatar === 'string' && msg.avatar) info.avatar = msg.avatar.slice(0, 24);
        info.lastActive = Date.now();
        broadcast({ type: 'join', player: wirePlayer(info) }, socket);
      } else if (msg.type === 'state') {
        const state = info.state;
        const nx = clampNumber(msg.x, -10000, 10000);
        const ny = clampNumber(msg.y, -1000, 1000);
        const nz = clampNumber(msg.z, -10000, 10000);
        const na = typeof msg.a === 'string' ? msg.a.slice(0, 12) : 'idle';
        if (Math.abs(nx - state.x) > 0.02 || Math.abs(ny - state.y) > 0.02 || Math.abs(nz - state.z) > 0.02 || na !== state.a || (msg.d ? 1 : 0) !== state.d) {
          info.lastActive = Date.now();
        }
        state.x = nx;
        state.y = ny;
        state.z = nz;
        state.r = clampNumber(msg.r, -26, 26);
        state.a = na;
        state.d = msg.d ? 1 : 0;
        if (Number.isFinite(msg.wins)) state.wins = Math.min(1e12, Math.max(0, Math.floor(msg.wins)));
        if (Number.isFinite(msg.rebirths)) state.rebirths = Math.min(1e12, Math.max(0, Math.floor(msg.rebirths)));
      } else if (msg.type === 'avatar') {
        if (typeof msg.avatar === 'string' && msg.avatar) {
          info.avatar = msg.avatar.slice(0, 24);
          broadcast({ type: 'avatar', id: info.id, avatar: info.avatar }, socket);
        }
      } else if (msg.type === 'chat') {
        const text = String(msg.text || '').trim().slice(0, 120);
        if (text) {
          info.lastActive = Date.now();
          broadcast({ type: 'chat', id: info.id, name: info.name, text }, socket);
        }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      players.delete(socket);
      broadcast({ type: 'left', id: info.id });
    });
  });

  setInterval(() => {
    if (!players.size) return;
    const t = Date.now();
    const list = [...players.values()].map((p) => [
      p.id,
      +p.state.x.toFixed(2),
      +p.state.y.toFixed(2),
      +p.state.z.toFixed(2),
      +p.state.r.toFixed(2),
      p.state.a,
      p.state.d,
      t - p.lastActive > AFK_MS ? 1 : 0,
      p.state.wins,
      p.state.rebirths,
    ]);
    const payload = JSON.stringify({ type: 'snap', t, players: list });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }, 100);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

function startServer(listenPort = port) {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    if (pathname === '/_game-health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('plus1-speed-local-launcher-v2');
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
  });

  startMultiplayer(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '0.0.0.0', () => {
      console.log(`[game] http://127.0.0.1:${listenPort}/`);
      if (lanAddress) console.log(`[lan]  http://${lanAddress}:${listenPort}/`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(port).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { startServer };
