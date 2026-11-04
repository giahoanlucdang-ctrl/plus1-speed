import * as THREE from 'three';
import { Delivery } from './delivery.js';
import { applyServerProgress, bindRebirth } from './progress.js';
import { addChatMessage } from './chat-history.js';
import { loadAvatar, setAnim } from './avatars.js';
import { shatter } from './shatter.js';
import { SnapshotClock, RemoteMotion } from './remote-motion.js';

const BUBBLE_TIME = 10;
const WALK_SPEED = 6;
const RUN_SPEED = 9;
const TAGS = {
  dev: { text: 'DEV', bg: 'rgba(240,170,20,0.95)' },
  cheater: { text: 'CHEATER', bg: 'rgba(220,30,30,0.9)' },
};

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

function wrap(text, max = 26) {
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
  sprite.material.map.dispose();
  sprite.material.dispose();
};

// Holder for a chat bubble floating above `group`, at `baseY`
function bubbleSlot(group, baseY) {
  let sprite = null;
  let time = 0;
  return {
    show(text) {
      if (sprite) dispose(sprite);
      sprite = textSprite(wrap(text), { height: 0.4, bg: 'rgba(255,255,255,0.95)', fg: '#222', font: 600 });
      sprite.position.y = baseY;
      group.add(sprite);
      time = BUBBLE_TIME;
    },
    setBase(y) {
      baseY = y;
      if (sprite) sprite.position.y = y;
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

// Connects to the room: draws other players, shares ours, and runs chat.
// `local()` returns { x, y, z, r, a, d } for the local player.
export function initMultiplayer(scene, height, localMesh, local, authoritativeState, welcomeState) {
  const remotes = new Map();
  const snapshotClock = new SnapshotClock();
  const localBubble = bubbleSlot(localMesh, height + 0.25);
  let room = null;
  let myId = null;
  let myAvatar = null;
  let saveTimer = 0;
  bindRebirth(() => {
    if (!room || !myId) return false;
    room.send({type:'rebirth'});
    return true;
  });
  const delivery = new Delivery(msg => room.send(msg));
  const seenChats = new Set();
  const names = new Map();
  let localUsername = null;
  window.websim?.getUser().then(user => { localUsername = user?.username === 'anonymous' ? null : user?.username; }).catch(() => {});

  function sendState() {
    if (!room || !myId) return;
    const s = local();
    const msg = { type:'input', ux:s.ux, uz:s.uz, jump:s.jump, j:s.j, slow:s.slow, r:+s.r.toFixed(2) };
    delivery.offerState(msg);
  }
  function resync() {
    delivery.reset();
    if (myAvatar) room?.send({ type: 'avatar', avatar: myAvatar });
    sendState();
    delivery.flushChats();
  }

  function addRemote(p) {
    names.set(p.id, p.name);
    if (p.id === myId || remotes.has(p.id)) return;
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.r;
    const name = textSprite([p.name], { height: 0.32, bg: 'rgba(0,0,0,0.45)', fg: '#fff' });
    name.position.y = height + 0.2;
    group.add(name);
    scene.add(group);
    const r = {
      group, avatar: null, avatarId: null,
      bubble: bubbleSlot(group, height + 0.65),
      motion: new RemoteMotion({...p,n:p.n??0}), speed: 0,
    };
    remotes.set(p.id, r);
    r.flags = { dev: !!p.dev, cheater: !!p.cheater };
    layoutTags(r);
    setRemoteAvatar(r, p.avatar);
  }

  // Role tags stack above the name tag, with the chat bubble above them all
  function layoutTags(r) {
    r.tags ??= {};
    let y = height + 0.6;
    for (const [key, tag] of Object.entries(TAGS)) {
      if (r.flags[key] && !r.tags[key]) {
        r.tags[key] = textSprite([tag.text], { height: 0.3, bg: tag.bg, fg: '#fff', font: 900 });
        r.group.add(r.tags[key]);
      } else if (!r.flags[key] && r.tags[key]) {
        dispose(r.tags[key]);
        delete r.tags[key];
      }
      if (r.tags[key]) { r.tags[key].position.y = y; y += 0.4; }
    }
    r.bubble.setBase(y + 0.05);
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
  }

  function removeRemote(id) {
    const r = remotes.get(id);
    if (!r) return;
    remotes.delete(id);
    r.removed = true;
    r.group.traverse((o) => { if (o.isSprite) o.material.map?.dispose(); });
    r.group.removeFromParent();
  }

  function onMessage(e) {
    const m = JSON.parse(e.data);
    if (m.type === 'welcome') {
      for (const id of [...remotes.keys()]) removeRemote(id);
      snapshotClock.reset();
      myId = m.id;
      applyServerProgress(m.stats);
      welcomeState?.(m.state);
      for (const p of m.players) addRemote(p);
      resync();
    } else if (m.type === 'self') {
      authoritativeState?.(m, delivery.sent.get(m.q));
      delivery.ackState(m.q);
    } else if (m.type === 'stats') {
      applyServerProgress(m.stats);
    } else if (m.type === 'join') {
      addRemote(m.player);
    } else if (m.type === 'left') {
      removeRemote(m.id);
    } else if (m.type === 'avatar') {
      const r = remotes.get(m.id);
      if (r) setRemoteAvatar(r, m.avatar);
    } else if (m.type === 'cheater') {
      const r = remotes.get(m.id);
      if (r) { r.flags.cheater = m.value !== false; layoutTags(r); }
    } else if (m.type === 'chatAck') {
      delivery.ackChat(m.cid);
    } else if (m.type === 'chat') {
      if (m.id === myId && m.cid) delivery.ackChat(m.cid);
      if (m.cid && seenChats.has(m.cid)) return;
      if (m.cid) {
        seenChats.add(m.cid);
        if (seenChats.size > 256) seenChats.delete(seenChats.values().next().value);
      }
      addChatMessage({ name: m.name ?? (m.id === myId ? localUsername || 'You' : names.get(m.id)), username: m.username ?? (m.id === myId ? localUsername : null), text: m.text });
      if (m.id === myId) localBubble.show(m.text);
      else remotes.get(m.id)?.bubble.show(m.text);
    } else if (m.type === 'snap') {
      snapshotClock.observe(m.t, performance.now());
      for (const [id, x, y, z, r, a, d, n = 0, q] of m.players) {
        if (id === myId) {
          delivery.ackState(q);
          continue;
        }
        const rem = remotes.get(id);
        if (!rem) continue;
        if (rem.motion.push({t:m.t,x,y,z,r,a,d,n})) rem.speed = 0;
      }
    }
  }

  (async () => {
    if (!window.WebsimSocket) return;
    try {
      room = await WebsimSocket.joinRoom();
      room.onmessage = onMessage;
      room.onreconnect = resync;
      room.onclose = (e) => { myId = null; console.warn('Multiplayer closed', e.reason); };
    } catch (err) {
      console.warn('Could not join multiplayer', err);
    }
  })();

  return {
    setAvatar(id) {
      myAvatar = id;
      room?.send({ type: 'avatar', avatar: id });
    },
    chat(text) {
      text = text.trim();
      if (!text) return;
      if (room && myId) return delivery.chat(text);
      localBubble.show(text);
      addChatMessage({ name: localUsername || 'You', username: localUsername, text });
      return true;
    },
    update(dt) {
      localBubble.update(dt);

      if (room && myId) {
        delivery.flushChats();
        saveTimer -= dt;
        if (saveTimer <= 0) { saveTimer = 10; room.send({type:'save'}); }
      }
      // Offer input each frame so presses/releases do not wait for a 10 Hz
      // timer. Delivery limits rotation updates and unchanged keepalives.
      if (room && myId) sendState();

      const renderT = snapshotClock.renderTime(performance.now());
      for (const r of remotes.values()) {
        r.bubble.update(dt);
        const cur = r.motion.sample(renderT);
        const g = r.group;
        g.position.set(cur.x,cur.y,cur.z);
        g.rotation.y = cur.r;
        // Break apart where they died, once per death seen live
        if (cur.d && r.wasDead === false && r.avatar && g.visible) {
          g.updateMatrixWorld(true);
          shatter(r.avatar.root, scene);
        }
        r.wasDead = !!cur.d;
        g.visible = !cur.d;

        // Animation speed comes from server movement, not packet corrections.
        r.speed += (cur.speed-r.speed) * (1-Math.exp(-10*dt));
        if (r.avatar) {
          setAnim(r.avatar, cur.a);
          if (r.avatar.actions.walk) r.avatar.actions.walk.timeScale = r.speed / WALK_SPEED;
          if (r.avatar.actions.run) r.avatar.actions.run.timeScale = r.speed / RUN_SPEED;
          r.avatar.mixer.update(dt);
        }
      }
    },
  };
}
