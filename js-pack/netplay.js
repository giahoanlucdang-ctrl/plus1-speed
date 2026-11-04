import * as THREE from 'three';
import { loadAvatar, setAnim } from './avatars.js';
import { shatter } from './shatter.js';
import { SnapshotClock, RemoteMotion } from './remote-motion.js';

const SEND_INTERVAL = 0.1;
const WALK_SPEED = 6;
const RUN_SPEED = 9;
const RECONNECT_DELAY = 2500;
const LAN_HOST_KEY = 'lan-server-address';
// The Android build has no local server, so it joins a PC-hosted LAN server instead.
const nativeApp = !!globalThis.Capacitor?.isNativePlatform?.();

function normalizeAddress(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  if (/^wss?:\/\//i.test(text)) return text.replace(/\/+$/, '');
  text = text.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(text)) return '';
  if (!/:\d+$/.test(text)) text += ':8000';
  return `ws://${text}`;
}

// A text label on a rounded card, as a sprite `height` world units tall per line
function textSprite(lines, { height, bg, fg, font = 700, pad = 18 }) {
  const PX = 48;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const fontStr = `${font} ${PX}px system-ui, sans-serif`;
  g.font = fontStr;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + pad * 2;
  const h = lines.length * PX * 1.2 + pad * 1.4;
  c.width = w;
  c.height = h;
  g.font = fontStr;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, w, h, Math.min(28, h / 2));
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, pad * 0.7 + PX * 1.2 * (i + 0.5)));
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
  const worldH = height * (h / (PX * 1.2 + pad * 1.4));
  sprite.scale.set(worldH * (w / h), worldH, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

function wrap(text, max = 24) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    for (let w = word; w; w = w.slice(max)) {
      const part = w.slice(0, max);
      if (line && (line + ' ' + part).length > max) {
        lines.push(line);
        line = part;
      } else {
        line = line ? line + ' ' + part : part;
      }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

const dispose = (sprite) => {
  sprite.removeFromParent();
  sprite.material.map?.dispose();
  sprite.material.dispose();
};

// Holder for a chat bubble floating above `group`, at `baseY`
export function bubbleSlot(group, baseY) {
  let sprite = null;
  let time = 0;
  return {
    show(text) {
      if (sprite) dispose(sprite);
      sprite = textSprite(wrap(text), { height: 0.4, bg: 'rgba(255,255,255,0.95)', fg: '#222', font: 600 });
      sprite.position.y = baseY;
      group.add(sprite);
      time = 10;
    },
    update(dt) {
      if (!sprite) return;
      time -= dt;
      sprite.material.opacity = Math.min(1, time / 0.3);
      if (time <= 0) {
        dispose(sprite);
        sprite = null;
      }
    },
  };
}

const normalizeAngle = (r) => Math.atan2(Math.sin(r), Math.cos(r));

// AFK players turn half transparent. Materials are shared by the avatar loader,
// so clone them per remote before changing opacity.
function setAvatarOpacity(root, opacity) {
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const copies = mats.map((mat) => {
      if (mat.userData.remoteCopy) return mat;
      const copy = mat.clone();
      copy.userData.remoteCopy = true;
      copy.userData.baseTransparent = copy.transparent;
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
    for (const mat of copies) {
      mat.transparent = opacity < 1 || mat.userData.baseTransparent;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
  });
}

export function initNetplay(scene, height, { getState, onSpawn, onChat, onStatus, onLan, onJoin, onLeft, onRoster, name } = {}) {
  const remotes = new Map();
  const clock = new SnapshotClock();
  const urlName = new URLSearchParams(location.search).get('name')?.trim().slice(0, 20);
  const localName = urlName || (typeof name === 'string' ? name.trim().slice(0, 20) : '');
  let socket = null;
  let myId = null;
  let myAvatar = 'noob';
  let connected = false;
  let manualUrl = '';
  let sendTimer = 0;
  let retryTimer = 0;
  let destroyed = false;
  let lanShown = false;

  function send(message) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
  }

  const makeNameTag = (who, afk) => textSprite([afk ? `[AFK] ${who}` : who], {
    height: 0.32,
    bg: afk ? 'rgba(80,40,0,0.6)' : 'rgba(0,0,0,0.45)',
    fg: afk ? '#ffd479' : '#fff',
  });

  function applyAfk(r, afk) {
    r.afk = afk;
    dispose(r.name);
    r.name = makeNameTag(r.playerName, afk);
    r.name.position.y = height + 0.2;
    r.group.add(r.name);
    if (r.avatar) setAvatarOpacity(r.avatar.root, afk ? 0.5 : 1);
  }

  const emitRoster = () => onRoster?.(remotes.size + 1);

  function addRemote(p) {
    if (p.id === myId || remotes.has(p.id)) return false;
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.r;
    const nameTag = makeNameTag(p.name, false);
    nameTag.position.y = height + 0.2;
    group.add(nameTag);
    scene.add(group);
    const r = {
      id: p.id,
      group,
      name: nameTag,
      playerName: p.name,
      wins: Number.isFinite(p.wins) ? p.wins : 0,
      rebirths: Number.isFinite(p.rebirths) ? p.rebirths : 0,
      bubble: bubbleSlot(group, height + 0.65),
      avatar: null,
      avatarId: null,
      motion: new RemoteMotion({ ...p, n: 0 }),
      speed: 0,
      afk: false,
      afkTarget: false,
      removed: false,
    };
    remotes.set(p.id, r);
    setRemoteAvatar(r, p.avatar);
    return true;
  }

  async function setRemoteAvatar(r, id) {
    if (r.avatarId === id) return;
    r.avatarId = id;
    const next = await loadAvatar(id, height);
    if (r.avatarId !== id || r.removed) return;
    if (r.avatar) r.avatar.root.removeFromParent();
    r.avatar = next;
    r.avatar.current = null;
    setAnim(r.avatar, 'idle');
    r.group.add(r.avatar.root);
    if (r.afk) setAvatarOpacity(r.avatar.root, 0.5);
  }

  function removeRemote(id) {
    const r = remotes.get(id);
    if (!r) return null;
    remotes.delete(id);
    r.removed = true;
    r.group.traverse((o) => {
      if (o.isSprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    r.group.removeFromParent();
    return r.playerName;
  }

  function onSnapshot(m) {
    clock.observe(m.t, performance.now());
    for (const [id, x, y, z, r, a, d, afk, wins, rebirths] of m.players) {
      if (id === myId) continue;
      const remote = remotes.get(id);
      if (!remote) continue;
      remote.motion.push({ t: m.t, x, y, z, r, a, d, n: 0 });
      remote.afkTarget = !!afk;
      if (Number.isFinite(wins)) remote.wins = wins;
      if (Number.isFinite(rebirths)) remote.rebirths = rebirths;
    }
  }

  function handle(m) {
    switch (m.type) {
      case 'welcome':
        for (const id of [...remotes.keys()]) removeRemote(id);
        clock.reset();
        myId = m.id;
        onSpawn?.(m.spawn);
        for (const p of m.players) addRemote(p);
        emitRoster();
        sendState();
        if (m.lan && !lanShown) {
          lanShown = true;
          onLan?.(m.lan);
        }
        break;
      case 'join':
        if (addRemote(m.player)) onJoin?.(m.player.name || 'A player');
        emitRoster();
        break;
      case 'left': {
        const gone = removeRemote(m.id);
        if (gone) onLeft?.(gone);
        emitRoster();
        break;
      }
      case 'avatar': {
        const r = remotes.get(m.id);
        if (r) setRemoteAvatar(r, m.avatar);
        break;
      }
      case 'chat':
        if (m.id === myId) break;
        onChat?.({ name: m.name || 'Player', text: m.text });
        remotes.get(m.id)?.bubble.show(m.text);
        break;
      case 'snap':
        onSnapshot(m);
        break;
    }
  }

  function scheduleReconnect() {
    if (destroyed || retryTimer) return;
    if (nativeApp && !manualUrl) return;
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      connect();
    }, RECONNECT_DELAY);
  }

  function connect() {
    if (destroyed) return;
    const url = manualUrl || (nativeApp ? '' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
    if (!url) return;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      connected = true;
      clock.reset();
      send({ type: 'join', avatar: myAvatar, ...(localName ? { name: localName } : {}) });
      onStatus?.('online');
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      handle(m);
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (socket !== ws) return;
      const wasOnline = connected;
      connected = false;
      socket = null;
      myId = null;
      for (const id of [...remotes.keys()]) removeRemote(id);
      emitRoster();
      if (wasOnline) onStatus?.('offline');
      scheduleReconnect();
    };
  }

  function sendState() {
    if (!connected || !myId || !getState) return;
    const s = getState();
    send({
      type: 'state',
      x: s.x, y: s.y, z: s.z,
      r: normalizeAngle(s.r || 0),
      a: s.a || 'idle',
      d: s.d ? 1 : 0,
      wins: Number.isFinite(s.wins) ? s.wins : 0,
      rebirths: Number.isFinite(s.rebirths) ? s.rebirths : 0,
    });
  }

  function connectTo(address) {
    const url = normalizeAddress(address);
    if (!url) return false;
    manualUrl = url;
    try { localStorage.setItem(LAN_HOST_KEY, url); } catch {}
    clearTimeout(retryTimer);
    retryTimer = 0;
    const old = socket;
    socket = null;
    connected = false;
    myId = null;
    if (old) { try { old.close(); } catch {} }
    for (const id of [...remotes.keys()]) removeRemote(id);
    clock.reset();
    onStatus?.('connecting');
    connect();
    return true;
  }

  function disconnect() {
    manualUrl = '';
    try { localStorage.removeItem(LAN_HOST_KEY); } catch {}
    clearTimeout(retryTimer);
    retryTimer = 0;
    const old = socket;
    socket = null;
    connected = false;
    myId = null;
    if (old) { try { old.close(); } catch {} }
    for (const id of [...remotes.keys()]) removeRemote(id);
  }

  if (nativeApp) {
    try { manualUrl = normalizeAddress(localStorage.getItem(LAN_HOST_KEY)); } catch {}
  }
  connect();

  return {
    isNative: nativeApp,
    isConnected: () => connected,
    connectTo,
    disconnect,
    chat(text) {
      text = text.trim();
      if (!text) return;
      send({ type: 'chat', text });
      return true;
    },
    setAvatar(id) {
      myAvatar = id;
      send({ type: 'avatar', avatar: id });
    },
    players() {
      const list = [];
      for (const r of remotes.values()) {
        if (r.removed) continue;
        list.push({
          id: r.id,
          name: r.playerName,
          avatar: r.avatarId,
          wins: r.wins,
          rebirths: r.rebirths,
          afk: r.afk,
        });
      }
      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
    update(dt) {
      if (connected && myId) {
        sendTimer -= dt;
        if (sendTimer <= 0) {
          sendTimer = SEND_INTERVAL;
          sendState();
        }
      }

      const renderT = clock.renderTime(performance.now());
      for (const r of remotes.values()) {
        r.bubble.update(dt);
        if (r.afk !== r.afkTarget) applyAfk(r, r.afkTarget);
        const cur = r.motion.sample(renderT);
        const g = r.group;
        g.position.set(cur.x, cur.y, cur.z);
        g.rotation.y = cur.r;
        // Break apart where they died, once per death seen live
        if (cur.d && r.wasDead === false && r.avatar && g.visible) {
          g.updateMatrixWorld(true);
          shatter(r.avatar.root, scene);
        }
        r.wasDead = !!cur.d;
        g.visible = !cur.d;

        r.speed += (cur.speed - r.speed) * (1 - Math.exp(-10 * dt));
        if (r.avatar) {
          setAnim(r.avatar, cur.a);
          if (r.avatar.actions.walk) r.avatar.actions.walk.timeScale = r.speed / WALK_SPEED;
          if (r.avatar.actions.run) r.avatar.actions.run.timeScale = r.speed / RUN_SPEED;
          r.avatar.mixer.update(dt);
        }
      }
    },
    destroy() {
      destroyed = true;
      clearTimeout(retryTimer);
      socket?.close();
      socket = null;
    },
  };
}
