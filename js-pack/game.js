import * as THREE from 'three';
import { createSim, doRebirth, addCourseCollider, teleportToWorld, WORLD_COSTS } from './server.js';
import { Prediction } from './prediction.js';
import { AVATARS, loadAvatar, setAnim } from './avatars.js';
import { progress, loadProgress, markDirty, bindRebirth, exportSave, importSave } from './progress.js';
import { startAuth } from './auth.js';
import { boosted, initRebirth, renderRebirth } from './rebirth.js';
import { buildTracks } from './track.js';
import { shatter, updateShatters } from './shatter.js';
import { addStatic, addRamp } from './physics.js';
import { stick, jump } from './touch.js';
import { buildDoor } from './door.js';
import { buildWorld2 } from './world2.js';
import { buildShop, buildExchangeShop, SHOP_X, SHOP_Z, EXCHANGE_SHOP_X, EXCHANGE_SHOP_Z } from './shop.js';
import { buildSpawnMarkers } from './spawn-marker.js';
import { buildSpawnPlants } from './vegetation.js';
import { buildSpeedEffects } from './speed-effects.js';
import { buildExtraWorlds } from './worlds.js';
import { initNetplay, bubbleSlot } from './netplay.js';
import './music.js';
import { footsteps, playSfx } from './sfx.js';
import { addChatMessage, revealChatHistory } from './chat-history.js';
import { checkForUpdate } from './updater.js';
import { isLowGraphics, hasGraphicsPreference, setLowGraphics, renderPixelRatio } from './quality.js';

await loadProgress();
await startAuth();

const MOVE_SPEED = 6;
const RUN_SPEED = 9;
const H = 2;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowGraphics() });
renderer.setPixelRatio(renderPixelRatio());
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.fog = new THREE.Fog('#87ceeb', 60, 200);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);


const hemi = new THREE.HemisphereLight('#ffffff', '#4a6b3a', 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 2);
scene.add(sun, sun.target);

// Platform: top surface at y = 0
const platform = { min: new THREE.Vector3(-30, -1, -7.5), max: new THREE.Vector3(15, 0, 7.5) };
const platformMesh = new THREE.Mesh(
  new THREE.BoxGeometry(45, 1, 15),
  new THREE.MeshBasicMaterial({ color: '#3cb043' })
);
platformMesh.position.set(-7.5, -0.5, 0);
platformMesh.receiveShadow = true;
scene.add(platformMesh);

const track = buildTracks(scene, MOVE_SPEED, platform);
platform.walkSpeed = 100;
const solids = [platform, ...track.solids];
const shop = buildShop(scene);
const exchangeShop = buildExchangeShop(scene);
const vegetation = buildSpawnPlants(scene);
const spawnMarkers = buildSpawnMarkers(scene);
const speedEffects = buildSpeedEffects(scene);
const shopUi = document.getElementById('shop-ui');
let shopDismissed = false;
document.getElementById('shop-close').addEventListener('click', () => {
  shopDismissed = true;
  shopUi.hidden = true;
});
const exchangeShopUi = document.getElementById('exchange-shop-ui');
let exchangeShopDismissed = false;
document.getElementById('exchange-shop-close').addEventListener('click', () => {
  exchangeShopDismissed = true;
  exchangeShopUi.hidden = true;
});
const updateDoor = buildDoor(scene, platform, { z: 0 });
const world2 = buildWorld2(scene);
solids.push(...world2.solids);
const extraWorlds = buildExtraWorlds(scene);
solids.push(...extraWorlds.staticSolids);

for (const box of solids) addStatic(box);

// Sky and light per world: day for world 1, moonlit night for world 2
const day = { bg: scene.background, fog: '#87ceeb', sky: '#ffffff', ground: '#4a6b3a', hemi: 1.2, sun: 2 };
const night = { bg: world2.sky, fog: '#05060f', sky: '#8090c0', ground: '#202024', hemi: 0.6, sun: 1.1 };
const crystalNight = { bg: extraWorlds.sky3, fog: '#110c27', sky: '#d9ccff', ground: '#291742', hemi: 1.05, sun: 1.45 };
const sunset = { bg: extraWorlds.sky4, fog: '#b96955', sky: '#ffe0ae', ground: '#84502d', hemi: 1.25, sun: 1.8 };
const worldNames = { 1: 'WORLD 01 · STARTER MEADOW', 2: 'WORLD 02 · MOON RUN', 3: 'WORLD 03 · CRYSTAL SKY', 4: 'WORLD 04 · SUNSET ISLES' };
let shownWorld = 1;
function showWorld(world) {
  if (world === shownWorld) return;
  shownWorld = world;
  document.getElementById('world-indicator').textContent = worldNames[world] ?? worldNames[1];
  const env = world === 2 ? night : world === 3 ? crystalNight : world === 4 ? sunset : day;
  scene.background = env.bg;
  scene.fog.color.set(env.fog);
  hemi.color.set(env.sky);
  hemi.groundColor.set(env.ground);
  hemi.intensity = env.hemi;
  sun.intensity = env.sun;
}
for (const ramp of track.ramps) addRamp(ramp);

// The avatar model sits inside this group; shared physics uses a 1 × 2 × 1 body.
const playerMesh = new THREE.Group();
scene.add(playerMesh);
let avatar = null;
let avatarId = null;
let facing = Math.PI; // start facing away from the camera
let animName = 'idle';

// Stands in for the character while its model loads
function loadingBillboard() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#222';
  g.beginPath();
  g.roundRect(4, 4, 248, 120, 18);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '800 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('LOADING', 128, 44);
  g.fillText('MODEL', 128, 90);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
  sprite.scale.set(2, 1, 1);
  sprite.position.y = H / 2;
  return sprite;
}
const loading = loadingBillboard();
playerMesh.add(loading);

async function selectAvatar(id) {
  if (progress.avatar !== id) {
    progress.avatar = id;
    markDirty();
  }
  renderAvatarList(id);
  mp.setAvatar(id);
  if (avatarId === id) return;
  avatarId = id;
  if (avatar) playerMesh.remove(avatar.root);
  avatar = null;
  loading.visible = true;
  const next = await loadAvatar(id, H);
  if (avatarId !== id) return;
  loading.visible = false;
  avatar = next;
  avatar.current = null;
  avatar.mixer.stopAllAction();
  setAnim(avatar, 'idle');
  playerMesh.add(avatar.root);
}

// Avatar picker
const avatarBtn = document.getElementById('avatar-btn');
const avatarList = document.getElementById('avatar-list');
avatarBtn.addEventListener('click', () => {
  avatarList.toggleAttribute('hidden');
  avatarBtn.blur();
});
function renderAvatarList(selected) {
  avatarList.replaceChildren(...AVATARS.map((a) => {
    const b = document.createElement('button');
    b.textContent = a.name;
    b.classList.toggle('selected', a.id === selected);
    b.addEventListener('click', () => {
      selectAvatar(a.id);
      avatarList.hidden = true;
      b.blur();
    });
    return b;
  }));
}

// Player position is the bottom-center of the body
const player = createSim({ speed:progress.speed, wins:progress.wins, rebirths:progress.rebirths, walkTime:progress.walkTime, shopSpeed:progress.shopSpeed, avatar:progress.avatar, unlocked:progress.unlocked });
// Mirror the visible World 1 floor directly into the player's collision index.
addCourseCollider(player.course,
  { x: platform.min.x, y: platform.min.y, z: platform.min.z },
  { x: platform.max.x, y: platform.max.y, z: platform.max.z });
const shopZ = SHOP_Z;
addCourseCollider(player.course, { x: SHOP_X - 4.2, y: -0.4, z: shopZ - 0.575 }, { x: SHOP_X + 4.2, y: 0.9, z: shopZ + 0.575 });
// Counter cap, header, roof, awning edge, sign and post caps also block the player.
addCourseCollider(player.course, { x: SHOP_X - 4.325, y: 0.91, z: shopZ - 0.675 }, { x: SHOP_X + 4.325, y: 1.09, z: shopZ + 0.675 });
for (const x of [-3.8, 3.8]) {
  addCourseCollider(player.course, { x: SHOP_X + x - 0.17, y: 1.05, z: shopZ - 0.31 }, { x: SHOP_X + x + 0.17, y: 3.71, z: shopZ + 0.07 });
  addCourseCollider(player.course, { x: SHOP_X + x - 0.21, y: 3.6, z: shopZ - 0.37 }, { x: SHOP_X + x + 0.21, y: 3.76, z: shopZ + 0.13 });
}
addCourseCollider(player.course, { x: SHOP_X - 4.125, y: 3.51, z: shopZ - 0.31 }, { x: SHOP_X + 4.125, y: 3.75, z: shopZ + 0.07 });
addCourseCollider(player.course, { x: SHOP_X - 4.325, y: 3.84, z: shopZ - 1.175 }, { x: SHOP_X + 4.325, y: 4.14, z: shopZ + 1.175 });
addCourseCollider(player.course, { x: SHOP_X - 4.375, y: 4.01, z: shopZ + 1.04 }, { x: SHOP_X + 4.375, y: 4.13, z: shopZ + 1.22 });
addCourseCollider(player.course, { x: SHOP_X - 3.15, y: 4.125, z: shopZ - 0.09 }, { x: SHOP_X + 3.15, y: 5.975, z: shopZ + 0.03 });
addCourseCollider(player.course, { x: SHOP_X - 0.07, y: 4.105, z: shopZ - 0.2 }, { x: SHOP_X + 0.07, y: 4.855, z: shopZ - 0.04 });
// Collision boxes for the Exchange Wins to Speed stall, including its canopy.
addCourseCollider(player.course, { x: EXCHANGE_SHOP_X - 3.6, y: -0.4, z: EXCHANGE_SHOP_Z - 0.575 }, { x: EXCHANGE_SHOP_X + 3.6, y: 0.9, z: EXCHANGE_SHOP_Z + 0.575 });
addCourseCollider(player.course, { x: EXCHANGE_SHOP_X - 3.75, y: 0.91, z: EXCHANGE_SHOP_Z - 0.675 }, { x: EXCHANGE_SHOP_X + 3.75, y: 1.09, z: EXCHANGE_SHOP_Z + 0.675 });
for (const x of [-3.2, 3.2]) {
  addCourseCollider(player.course, { x: EXCHANGE_SHOP_X + x - 0.16, y: 1.05, z: EXCHANGE_SHOP_Z - 0.31 }, { x: EXCHANGE_SHOP_X + x + 0.16, y: 3.56, z: EXCHANGE_SHOP_Z + 0.07 });
}
addCourseCollider(player.course, { x: EXCHANGE_SHOP_X - 3.45, y: 3.4, z: EXCHANGE_SHOP_Z - 0.31 }, { x: EXCHANGE_SHOP_X + 3.45, y: 3.62, z: EXCHANGE_SHOP_Z + 0.07 });
addCourseCollider(player.course, { x: EXCHANGE_SHOP_X - 3.8, y: 3.72, z: EXCHANGE_SHOP_Z - 1.175 }, { x: EXCHANGE_SHOP_X + 3.8, y: 4.08, z: EXCHANGE_SHOP_Z + 1.175 });
// VIP gate frame removed: World 2 is entered from the Worlds menu.
for (const box of extraWorlds.solids) addCourseCollider(player.course,
  { x: box.min.x, y: box.min.y, z: box.min.z },
  { x: box.max.x, y: box.max.y, z: box.max.z });
player.pos = new THREE.Vector3();
player.vel = new THREE.Vector3();
// The offline game has no server welcome snapshot to place the player.
// Start on the base so the first movement input is simulated on solid ground.
player.pos.set(0, 0, 0);
player.grounded = true;
player.floor = platform;
let nextSpawnEffect = 'spawn';
spawnMarkers.burst(player.pos, 'spawn');
const worldPicker = document.getElementById('world-picker');
const worldPickerMsg = document.getElementById('world-picker-msg');
const worldButtons = [...worldPicker.querySelectorAll('[data-world]')];
const isWorldUnlocked = (world) => progress.unlocked.includes(world);
function renderWorldPicker() {
  for (const button of worldButtons) {
    const world = Number(button.dataset.world);
    const unlocked = isWorldUnlocked(world);
    button.classList.toggle('locked', !unlocked);
    button.setAttribute('aria-disabled', String(!unlocked));
    let tag = button.querySelector('.world-lock');
    if (unlocked) {
      tag?.remove();
      continue;
    }
    if (!tag) {
      tag = document.createElement('b');
      tag.className = 'world-lock';
      button.append(tag);
    }
    tag.textContent = `\u{1F512} ${WORLD_COSTS[world]} Wins`;
  }
  worldPickerMsg.textContent = `You have ${player.stats.wins.toLocaleString()} Wins.`;
}
document.getElementById('worlds-btn').addEventListener('click', () => {
  renderWorldPicker();
  worldPicker.hidden = false;
});
document.getElementById('world-picker-close').addEventListener('click', () => { worldPicker.hidden = true; });
worldPicker.addEventListener('click', (event) => { if (event.target === worldPicker) worldPicker.hidden = true; });
const settingsUi = document.getElementById('settings-ui');
document.getElementById('settings-btn').addEventListener('click', () => { settingsUi.hidden = false; });
document.getElementById('settings-close').addEventListener('click', () => { settingsUi.hidden = true; });
settingsUi.addEventListener('click', (event) => { if (event.target === settingsUi) settingsUi.hidden = true; });
const graphicsBtn = document.getElementById('graphics-btn');
function renderGraphicsButton() {
  const low = isLowGraphics();
  graphicsBtn.textContent = low ? 'Use high graphics' : 'Use low graphics';
  graphicsBtn.setAttribute('aria-pressed', String(low));
}
function applyGraphicsMode() {
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
  renderGraphicsButton();
}
graphicsBtn.addEventListener('click', () => {
  setLowGraphics(!isLowGraphics());
  applyGraphicsMode();
});
renderGraphicsButton();
const fpsBtn = document.getElementById('fps-btn');
const fpsCounter = document.getElementById('fps-counter');
let fpsShown = false;
try { fpsShown = localStorage.getItem('fps-visible') === 'true'; } catch {}
function renderFpsButton() {
  fpsBtn.textContent = fpsShown ? 'Hide FPS' : 'Show FPS';
  fpsBtn.setAttribute('aria-pressed', String(fpsShown));
  if (fpsCounter) fpsCounter.hidden = !fpsShown;
}
fpsBtn.addEventListener('click', () => {
  fpsShown = !fpsShown;
  try { localStorage.setItem('fps-visible', String(fpsShown)); } catch {}
  renderFpsButton();
});
renderFpsButton();
const restoreFile = document.getElementById('restore-file');
document.getElementById('backup-save-btn').addEventListener('click', () => exportSave());
document.getElementById('restore-save-btn').addEventListener('click', () => restoreFile.click());
restoreFile.addEventListener('change', async () => {
  const file = restoreFile.files?.[0];
  restoreFile.value = '';
  if (!file) return;
  if (!confirm('Load this backup and replace your current progress?')) return;
  if (!(await importSave(file))) {
    alert('That file is not a +1 Speed backup.');
    return;
  }
  location.reload();
});
worldButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetWorld = Number(button.dataset.world);
    if (!isWorldUnlocked(targetWorld)) {
      const cost = WORLD_COSTS[targetWorld];
      if (player.stats.wins < cost) {
        worldPickerMsg.textContent = `You need ${cost} Wins to unlock World 0${targetWorld} (you have ${player.stats.wins}).`;
        return;
      }
      if (!confirm(`Unlock World 0${targetWorld} for ${cost} Wins?`)) return;
      player.stats.wins -= cost;
      player.stats.unlocked.push(targetWorld);
      syncPlayerProgress();
      markDirty();
      showStats();
      renderWorldPicker();
    }
    if (teleportToWorld(player, targetWorld)) {
      nextSpawnEffect = 'spawn';
      renderOffset.set(0, 0, 0);
      resetCamera();
      spawnMarkers.burst(player.pos, 'spawn');
    }
    worldPicker.hidden = true;
    button.blur();
  });
});
addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    worldPicker.hidden = true;
    settingsUi.hidden = true;
  }
});
const prediction = new Prediction(player);
function syncPlayerProgress() {
  progress.speed = player.stats.speed;
  progress.wins = player.stats.wins;
  progress.rebirths = player.stats.rebirths;
  progress.walkTime = player.stats.walkTime;
  progress.shopSpeed = player.stats.shopSpeed ?? 0;
  progress.avatar = player.stats.avatar;
}
const exchangeWinsInput = document.getElementById('exchange-wins-input');
const exchangeBalance = document.getElementById('exchange-balance');
const exchangePreview = document.getElementById('exchange-preview');
const exchangeSubmit = document.getElementById('exchange-submit');
const exchangeMessage = document.getElementById('exchange-message');
const exchangeSpeedInput = document.getElementById('exchange-speed-input');
const reverseExchangePreview = document.getElementById('reverse-exchange-preview');
const reverseExchangeSubmit = document.getElementById('reverse-exchange-submit');
const reverseExchangeMessage = document.getElementById('reverse-exchange-message');
function renderExchangeOffer() {
  const maxWinsToExchange = Math.min(player.stats.wins, Math.floor((1e12 - player.stats.speed) / 1000));
  const maxSpeedToExchange = Math.min(Math.floor(player.stats.speed / 1000) * 1000, (1e12 - player.stats.wins) * 1000);
  const winsAmount = Number(exchangeWinsInput.value);
  const speedAmount = Number(exchangeSpeedInput.value);
  exchangeWinsInput.max = String(Math.max(0, maxWinsToExchange));
  exchangeSpeedInput.max = String(Math.max(0, maxSpeedToExchange));
  exchangeBalance.textContent = `Wins: ${player.stats.wins.toLocaleString()} · Speed: ${player.stats.speed.toLocaleString()}`;
  exchangePreview.textContent = Number.isSafeInteger(winsAmount) && winsAmount > 0
    ? `You will receive +${(winsAmount * 1000).toLocaleString()} Speed`
    : 'Enter the number of Wins to exchange.';
  exchangeSubmit.disabled = !Number.isSafeInteger(winsAmount) || winsAmount < 1 || winsAmount > maxWinsToExchange;
  reverseExchangePreview.textContent = Number.isSafeInteger(speedAmount) && speedAmount >= 1000 && speedAmount % 1000 === 0
    ? `You will receive +${(speedAmount / 1000).toLocaleString()} Win${speedAmount === 1000 ? '' : 's'}`
    : 'Enter Speed in multiples of 1,000.';
  reverseExchangeSubmit.disabled = !Number.isSafeInteger(speedAmount) || speedAmount < 1000 || speedAmount % 1000 !== 0 || speedAmount > maxSpeedToExchange;
}
exchangeWinsInput.addEventListener('input', renderExchangeOffer);
exchangeSpeedInput.addEventListener('input', renderExchangeOffer);
document.getElementById('exchange-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number(exchangeWinsInput.value);
  const maxExchange = Math.min(player.stats.wins, Math.floor((1e12 - player.stats.speed) / 1000));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maxExchange) {
    exchangeMessage.textContent = 'Choose a valid amount within your available Wins.';
    renderExchangeOffer();
    return;
  }
  player.stats.wins -= amount;
  player.stats.speed = Math.min(1e12, player.stats.speed + amount * 1000);
  syncPlayerProgress();
  markDirty();
  showStats();
  exchangeMessage.textContent = `Exchanged ${amount.toLocaleString()} Win${amount === 1 ? '' : 's'} for +${(amount * 1000).toLocaleString()} Speed!`;
  document.getElementById('exchange-submit').blur();
});
document.getElementById('reverse-exchange-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number(exchangeSpeedInput.value);
  const maxExchange = Math.min(Math.floor(player.stats.speed / 1000) * 1000, (1e12 - player.stats.wins) * 1000);
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount % 1000 !== 0 || amount > maxExchange) {
    reverseExchangeMessage.textContent = 'Choose a valid amount of Speed in multiples of 1,000.';
    renderExchangeOffer();
    return;
  }
  const winsGained = amount / 1000;
  player.stats.speed -= amount;
  player.stats.wins += winsGained;
  syncPlayerProgress();
  markDirty();
  showStats();
  reverseExchangeMessage.textContent = `Exchanged ${amount.toLocaleString()} Speed for +${winsGained.toLocaleString()} Win${winsGained === 1 ? '' : 's'}!`;
  reverseExchangeSubmit.blur();
});
renderExchangeOffer();
const shopSpeedBuy = document.getElementById('shop-speed-buy');
const shopSpeedLevel = document.getElementById('shop-speed-level');
const shopMessage = document.getElementById('shop-message');
function renderShopOffer() {
  const cost = 2 * (progress.shopSpeed + 1);
  shopSpeedLevel.textContent = `Current shop bonus: +${progress.shopSpeed} Speed/s`;
  shopSpeedBuy.textContent = `Buy +1 Speed/s · ${cost} Wins`;
  shopSpeedBuy.disabled = progress.wins < cost;
}
shopSpeedBuy.addEventListener('click', () => {
  const cost = 2 * (progress.shopSpeed + 1);
  if (progress.wins < cost) {
    shopMessage.textContent = `You need ${cost} Wins to buy this upgrade.`;
    return;
  }
  progress.wins -= cost;
  progress.shopSpeed += 1;
  player.stats.wins = progress.wins;
  player.stats.shopSpeed = progress.shopSpeed;
  shopMessage.textContent = `Purchased! Permanent bonus: +${progress.shopSpeed} Speed/s.`;
  markDirty();
  showStats();
  renderShopOffer();
});
bindRebirth(() => {
  if (!doRebirth(player)) return false;
  playSfx('rebirth');
  nextSpawnEffect = 'rebirth';
  syncPlayerProgress();
  markDirty();
  dispatchEvent(new CustomEvent('progress:server'));
  return true;
});
const controls = {ux:0,uz:0,jump:false,j:0,slow:false};
const renderOffset = new THREE.Vector3();
let hiddenAt = document.hidden ? Date.now() : null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt === null) return;
  const elapsed = Math.max(0, (Date.now() - hiddenAt) / 1000);
  hiddenAt = null;
  if (Number.isFinite(elapsed)) {
    progress.playTime += elapsed;
    updatePlayTime();
    markDirty();
  }
  if (player.dead > 0 || !Number.isFinite(elapsed)) return;
  const total = player.stats.walkTime + elapsed;
  const ticks = Math.floor(total);
  player.stats.walkTime = total - ticks;
  const perSecond = Math.ceil((1 + player.stats.wins) * (10 + player.stats.rebirths) / 10) + (player.stats.shopSpeed ?? 0);
  player.stats.speed = Math.min(1e12, player.stats.speed + ticks * perSecond);
  syncPlayerProgress();
  markDirty();
  dispatchEvent(new CustomEvent('progress:server'));
});
const net = initNetplay(scene, H, {
  name: progress.nickname,
  getState: () => ({
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z,
    r: facing,
    a: animName,
    d: player.dead > 0 ? 1 : 0,
    wins: progress.wins,
    rebirths: progress.rebirths,
  }),
  onSpawn: ({ x, z }) => {
    player.pos.set(x, 0, z);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    renderOffset.set(0, 0, 0);
  },
  onChat: ({ name, text }) => {
    addChatMessage({ name, text });
    revealChatHistory();
  },
  onLan: (url) => addChatMessage({ name: 'Server', text: `Rủ bạn bè cùng wifi mở ${url} để chơi chung.` }),
  onJoin: (who) => {
    addChatMessage({ name: 'Room', text: `${who} joined.` });
    revealChatHistory();
  },
  onLeft: (who) => addChatMessage({ name: 'Room', text: `${who} left.` }),
  onRoster: (count) => {
    const roomEl = document.getElementById('room-count');
    const onlineEl = document.getElementById('online-count');
    if (roomEl) {
      roomEl.textContent = `${count} ${count === 1 ? 'player' : 'players'} online`;
      roomEl.hidden = count <= 1;
    }
    if (onlineEl) onlineEl.textContent = String(count);
    refreshFriends();
  },
  onStatus: (status) => {
    const ui = document.getElementById('lan-ui');
    const label = document.getElementById('lan-status');
    if (ui && label && !ui.hidden) {
      label.textContent = status === 'online'
        ? 'Đã kết nối LAN server.'
        : status === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối, đang thử lại…';
    }
    if (status === 'offline') addChatMessage({ name: 'Server', text: 'Mất kết nối server, đang thử lại…' });
  },
});
const lanUi = document.getElementById('lan-ui');
const lanAddress = document.getElementById('lan-address');
const lanStatus = document.getElementById('lan-status');
const lanBtn = document.getElementById('lan-btn');
if (net.isNative) {
  lanBtn.hidden = false;
  lanBtn.addEventListener('click', () => {
    lanUi.hidden = false;
    try { lanAddress.value = (localStorage.getItem('lan-server-address') || '').replace(/^wss?:\/\//, ''); } catch {}
    lanStatus.textContent = net.isConnected() ? 'Đã kết nối LAN server.' : '';
    lanAddress.focus();
  });
  document.getElementById('lan-close').addEventListener('click', () => { lanUi.hidden = true; });
  document.getElementById('lan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!net.connectTo(lanAddress.value)) {
      lanStatus.textContent = 'Địa chỉ không hợp lệ. Ví dụ: 192.168.1.5:8000';
      return;
    }
    lanStatus.textContent = 'Đang kết nối…';
  });
  document.getElementById('lan-disconnect').addEventListener('click', () => {
    net.disconnect();
    lanStatus.textContent = 'Đã ngắt kết nối.';
  });
}
const localBubble = bubbleSlot(playerMesh, H + 0.25);
const mp = {
  setAvatar(id) {
    net?.setAvatar(id);
  },
  chat(text) {
    text = text.trim();
    if (!text) return true;
    addChatMessage({ name: 'You', text });
    revealChatHistory();
    localBubble.show(text);
    net?.chat(text);
    return true;
  },
  update(dt) {
    localBubble.update(dt);
    net?.update(dt);
  },
};

// Chat: Enter to type, Enter to send, Esc to cancel
const chatForm = document.getElementById('chat');
const chatInput = document.getElementById('chat-input');
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (mp.chat(chatInput.value) === false) return;
  chatInput.value = '';
  chatInput.blur();
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') chatInput.blur();
});
chatInput.addEventListener('focus', () => keys.clear());

const speedEl = document.getElementById('speed');
const winsEl = document.getElementById('wins');
const winToast = document.getElementById('win-toast');
const rebirthsEl = document.getElementById('rebirths');
const speedRateEl = document.getElementById('speed-rate');
const playTimeEl = document.getElementById('play-time');
const lbSpeed = document.getElementById('lb-speed');
const lbWins = document.getElementById('lb-wins');
const lbRebirths = document.getElementById('lb-rebirths');
const leaderboardUi = document.getElementById('leaderboard-ui');
document.getElementById('leaderboard-btn').addEventListener('click', () => {
  document.getElementById('friends-ui').hidden = true;
  leaderboardUi.hidden = false;
});
document.getElementById('leaderboard-close').addEventListener('click', () => { leaderboardUi.hidden = true; });

// Friends: anyone visible in this server can be added from the Friends tab.
const friendsUi = document.getElementById('friends-ui');
const friendsOnlineEl = document.getElementById('friends-online');
const friendsListEl = document.getElementById('friends-list');
const friendKey = (name) => name.toLowerCase();
const isFriend = (name) => progress.friends.some((n) => friendKey(n) === friendKey(name));

function toggleFriend(name) {
  const key = friendKey(name);
  const index = progress.friends.findIndex((n) => friendKey(n) === key);
  if (index >= 0) progress.friends.splice(index, 1);
  else if (progress.friends.length < 100) progress.friends.push(name.trim().slice(0, 20));
  markDirty();
  refreshFriends();
}

function friendRow({ name, wins, rebirths, online, afk }) {
  const row = document.createElement('div');
  row.className = 'leaderboard-row friend-row';
  const nameCell = document.createElement('span');
  nameCell.className = 'friend-name';
  nameCell.append(name);
  if (online) {
    const badge = document.createElement('em');
    badge.className = afk ? 'friend-online afk' : 'friend-online';
    badge.textContent = afk ? 'AFK' : 'Online';
    nameCell.append(badge);
  } else {
    const badge = document.createElement('em');
    badge.className = 'friend-offline';
    badge.textContent = 'Offline';
    nameCell.append(badge);
  }
  const winsCell = document.createElement('span');
  winsCell.textContent = wins;
  const rebirthsCell = document.createElement('span');
  rebirthsCell.textContent = rebirths;
  const action = document.createElement('button');
  action.type = 'button';
  const added = isFriend(name);
  action.className = added ? 'friend-action remove' : 'friend-action';
  action.textContent = added ? (online ? 'Remove' : 'Unfriend') : 'Add friend';
  action.addEventListener('click', () => toggleFriend(name));
  row.append(nameCell, winsCell, rebirthsCell, action);
  return row;
}

function refreshFriends() {
  if (friendsUi.hidden) return;
  const online = net.players();
  const onlineByKey = new Map(online.map((p) => [friendKey(p.name), p]));

  friendsOnlineEl.replaceChildren();
  if (!online.length) {
    const empty = document.createElement('p');
    empty.className = 'friends-empty';
    empty.textContent = 'No other players online. Share your LAN link so friends can join.';
    friendsOnlineEl.append(empty);
  } else {
    online.forEach((p) => friendsOnlineEl.append(friendRow({
      name: p.name,
      wins: p.wins,
      rebirths: p.rebirths,
      online: true,
      afk: p.afk,
    })));
  }

  friendsListEl.replaceChildren();
  if (!progress.friends.length) {
    const empty = document.createElement('p');
    empty.className = 'friends-empty';
    empty.textContent = 'No friends yet. Add players from the list above.';
    friendsListEl.append(empty);
  } else {
    [...progress.friends].sort((a, b) => a.localeCompare(b)).forEach((name) => {
      const live = onlineByKey.get(friendKey(name));
      friendsListEl.append(friendRow({
        name,
        wins: live ? live.wins : '—',
        rebirths: live ? live.rebirths : '—',
        online: !!live,
        afk: live?.afk ?? false,
      }));
    });
  }
}

document.getElementById('friends-btn').addEventListener('click', () => {
  leaderboardUi.hidden = true;
  friendsUi.hidden = false;
  refreshFriends();
});
document.getElementById('friends-close').addEventListener('click', () => { friendsUi.hidden = true; });
setInterval(refreshFriends, 1000);
function formatPlayTime(value) {
  const seconds = Math.floor(value);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function updatePlayTime() { playTimeEl.textContent = `Play time ${formatPlayTime(progress.playTime)}`; }
let playTimeSaveTimer = 0;
const showStats = () => {
  speedEl.textContent = progress.speed;
  speedRateEl.textContent = `${boosted(1 + progress.wins) + progress.shopSpeed}/s`;
  winsEl.textContent = progress.wins;
  rebirthsEl.textContent = progress.rebirths;
  lbSpeed.textContent = progress.speed;
  lbWins.textContent = progress.wins;
  lbRebirths.textContent = progress.rebirths;
  renderShopOffer();
  renderExchangeOffer();
  renderRebirth();
};
const showProgress = () => {
  showStats();
  selectAvatar(AVATARS.some((a) => a.id === progress.avatar) ? progress.avatar : 'noob');
};
let toastTimer;
function showWinToast() {
  winToast.hidden = false;
  winToast.classList.remove('show');
  void winToast.offsetWidth;
  winToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    winToast.classList.remove('show');
    winToast.hidden = true;
  }, 1500);
}
showProgress();
updatePlayTime();
addEventListener('progress:server', showStats);
initRebirth(showStats);

// Input
const keys = new Set();
let jumpPressed = false;
const JUMP_KEYS = ['Space'];
addEventListener('keydown', (e) => {
  if (e.target === chatInput) return;
  if (e.key === 'Enter' || e.key === '/') {
    e.preventDefault();
    chatInput.focus();
    return;
  }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Space' && !keys.has(e.code)) jumpPressed = true;
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const held = (...codes) => codes.some((c) => keys.has(c));
const jumpHeld = () => held(...JUMP_KEYS) || jump.held;

// Camera orbit (drag to look)
const PITCH = 0.35;
const CAM_DIST = 9;
let yaw = 0;
let pitch = PITCH;
let camDist = CAM_DIST;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camDist = THREE.MathUtils.clamp(camDist * Math.exp(e.deltaY * 0.001), 3, 40);
}, { passive: false });
// Active pointers on the canvas: one drags to look, two pinch to zoom
const pointers = new Map();
const pinchDist = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
let lastPinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
  if (e.pointerType === 'mouse' && e.button === 2) e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) lastPinch = pinchDist();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    yaw -= dx * 0.005;
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.005, -0.2, 1.3);
  } else if (pointers.size === 2) {
    const d = pinchDist();
    if (lastPinch > 0 && d > 0) camDist = THREE.MathUtils.clamp(camDist * lastPinch / d, 3, 40);
    lastPinch = d;
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 2) lastPinch = pinchDist();
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function resetCamera() {
  // Fresh camera looking one of two ways down the base, player facing away from it
  yaw = Math.random() < 0.5 ? 0 : Math.PI;
  pitch = PITCH;
  facing = yaw + Math.PI;
}

let shards = null;
function die() {
  if (avatar) shards = shatter(avatar.root, scene, player.vel.clone());
  player.vel.set(0, 0, 0);
  playerMesh.visible = false;
}

// Shatter once per life: a lagging server snapshot can briefly report the
// life we already died in (and respawned from) as dead again
let deathVisible = false;
let shatteredLife = -1;
function syncDeathVisual() {
  if (player.dead > 0 && !deathVisible && player.n !== shatteredLife) { shatteredLife = player.n; die(); }
  if (player.dead <= 0) playerMesh.visible = true;
  deathVisible = player.dead > 0;
}

const wish = new THREE.Vector3();
function update(dt, now) {
  const f = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0) + stick.y;
  const r = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0) + stick.x;
  wish.set(-Math.sin(yaw)*f+Math.cos(yaw)*r, 0, -Math.cos(yaw)*f-Math.sin(yaw)*r);
  if (wish.lengthSq() > 1) wish.normalize();
  controls.ux = player.dead > 0 ? 0 : wish.x;
  controls.uz = player.dead > 0 ? 0 : wish.z;
  controls.jump = player.dead <= 0 && (jumpHeld() || jump.pressed);
  const pressed = player.dead <= 0 && (jumpPressed || jump.pressed);
  if (pressed && player.grounded) playSfx('jump');
  if (pressed) controls.j++;
  controls.slow = held('ShiftLeft','ShiftRight');
  jump.pressed = false;
  jumpPressed = false;
  const n = player.n;
  prediction.step(dt, {x:controls.ux,z:controls.uz,jump:controls.jump,pressed,slow:controls.slow}, now);
  const inShop = player.world === 1 && shop.containsPlayer(player.pos.x, player.pos.z);
  const inExchangeShop = player.world === 1 && exchangeShop.containsPlayer(player.pos.x, player.pos.z);
  if (!inShop) {
    if (shopUi.hidden) shopDismissed = false;
  } else if (!shopDismissed) {
    shopUi.hidden = false;
  }
  if (!inExchangeShop) {
    if (exchangeShopUi.hidden) exchangeShopDismissed = false;
  } else if (!exchangeShopDismissed) {
    exchangeShopUi.hidden = false;
  }
  const stats = player.stats;
  if (stats.wins > progress.wins) {
    showWinToast();
    playSfx('win');
  }
  if (stats.speed !== progress.speed || stats.wins !== progress.wins || stats.rebirths !== progress.rebirths) {
    syncPlayerProgress();
    markDirty();
    dispatchEvent(new CustomEvent('progress:server'));
  }
  if (player.n !== n) {
    renderOffset.set(0,0,0);
    resetCamera();
    spawnMarkers.burst(player.pos, nextSpawnEffect);
    nextSpawnEffect = 'spawn';
  }
  syncDeathVisual();
}

const camTarget = new THREE.Vector3(0, H * 0.6, 0);
function draw(dt) {
  progress.playTime += dt;
  updatePlayTime();
  playTimeSaveTimer += dt;
  if (playTimeSaveTimer >= 1) { playTimeSaveTimer = 0; markDirty(); }
  const w = innerWidth, h = innerHeight;
  const ratio = renderPixelRatio();
  if (canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  renderOffset.multiplyScalar(Math.exp(-15*dt));
  playerMesh.position.copy(player.pos).add(renderOffset);
  if (!isLowGraphics()) vegetation.update(dt, player.pos, player.vel);
  spawnMarkers.update(dt);
  extraWorlds.update(dt, progress.unlocked);
  updateShatters(dt);
  if (shards?.done) shards = null;

  track.update(dt, player.course);
  world2.update(dt, player.course, progress.unlocked);
  updateDoor(progress.unlocked);
  showWorld(player.world);

  // Face the direction of travel (relative to the conveyor underfoot) and pick an animation
  const relZ = player.vel.z - (player.grounded ? player.floor?.belt ?? 0 : 0);
  const speed = Math.hypot(player.vel.x, relZ);
  speedEffects.update(dt, playerMesh.position, player.vel, player.world);
  const targetFov = 60 + Math.min(18, Math.log2(1 + speed / 6) * 5.2);
  const nextFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-dt * 3));
  if (Math.abs(nextFov - camera.fov) > 0.04) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
  const moving = speed > 0.01;
  footsteps(moving && player.grounded && player.dead <= 0, speed / MOVE_SPEED);
  if (moving) {
    const targetYaw = Math.atan2(player.vel.x, relZ);
    const diff = Math.atan2(Math.sin(targetYaw - facing), Math.cos(targetYaw - facing));
    facing += diff * Math.min(1, dt * 15);
  }
  playerMesh.rotation.y = facing;
  animName = !player.grounded ? (player.vel.y > 0 ? 'jump' : 'fall') : !moving ? 'idle' : speed > RUN_SPEED ? 'run' : 'walk';
  if (avatar) {
    setAnim(avatar, animName === 'run' && !avatar.actions.run ? 'walk' : animName);
    // Cycles play at their natural rate at their reference speed, scaled by actual ground speed
    if (avatar.actions.walk) avatar.actions.walk.timeScale = speed / MOVE_SPEED;
    if (avatar.actions.run) avatar.actions.run.timeScale = speed / RUN_SPEED;
    avatar.mixer.update(dt);
  }

  // Locked to the player, or to the torso piece while dead
  if (player.dead > 0 && shards?.focus) camTarget.copy(shards.focus.position);
  else camTarget.copy(playerMesh.position).setY(playerMesh.position.y + H * 0.6);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
    camTarget.y + Math.sin(pitch) * camDist,
    camTarget.z + Math.cos(yaw) * Math.cos(pitch) * camDist
  );
  camera.lookAt(camTarget);

  sun.position.set(playerMesh.position.x + 8, playerMesh.position.y + 15, playerMesh.position.z + 5);
  sun.target.position.copy(playerMesh.position);

  mp.update(dt);
  renderer.render(scene, camera);
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.remove();
  else loadingCleared = true;
}

let loadingCleared = false;
const PERF_WINDOW = 5;
const PERF_MIN_FPS = 35;
let perfFrames = 0;
let perfSeconds = 0;
let perfChecked = false;
function trackPerformance(rawDt) {
  if (!loadingCleared) {
    perfFrames = 0;
    perfSeconds = 0;
    return;
  }
  perfFrames += 1;
  perfSeconds += Math.min(rawDt, 0.25);
  if (perfSeconds < PERF_WINDOW) return;
  perfChecked = true;
  const fps = perfFrames / perfSeconds;
  if (fps < PERF_MIN_FPS && !isLowGraphics() && !hasGraphicsPreference()) {
    setLowGraphics(true);
    applyGraphicsMode();
  }
}

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
let fpsFrames = 0;
let fpsElapsed = 0;
function frame(now) {
  if (document.hidden) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(rawDt, 0.1);
  acc += dt;
  last = now;
  while (acc >= STEP) {
    update(STEP, now - (acc - STEP) * 1000);
    acc -= STEP;
  }
  draw(dt);
  if (!perfChecked) trackPerformance(rawDt);
  if (fpsShown) {
    fpsFrames += 1;
    fpsElapsed += rawDt;
    if (fpsElapsed >= 0.5) {
      fpsCounter.textContent = `${Math.round(fpsFrames / fpsElapsed)} FPS`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void checkForUpdate();
