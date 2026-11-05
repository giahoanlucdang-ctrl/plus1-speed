// Player sound effects, driven by the avatar's actions.
const walk = new Audio('music-pack/walk.mp3');
walk.loop = true;
walk.preload = 'auto';

const oneShots = {
  jump: new Audio('music-pack/jumping.mp3'),
  win: new Audio('music-pack/win.mp3'),
  rebirth: new Audio('music-pack/rebirth.mp3'),
};
for (const clip of Object.values(oneShots)) {
  clip.preload = 'auto';
}

const WALK_LEVEL = 0.32;
const JUMP_LEVEL = 0.55;
const SHOT_LEVEL = 0.7;

let muted = false;
let level = 0.7;
try {
  muted = localStorage.getItem('sfx-muted') === 'true';
  const raw = localStorage.getItem('sfx-volume');
  const stored = raw === null ? NaN : Number(raw);
  if (Number.isFinite(stored)) level = Math.max(0, Math.min(100, stored)) / 100;
} catch {}
let lastWin = 0;

const sfxVolume = document.getElementById('sfx-volume');
if (sfxVolume) sfxVolume.value = String(Math.round(level * 100));

function applyVolume() {
  walk.volume = WALK_LEVEL * level;
  for (const clip of Object.values(oneShots)) clip.volume = SHOT_LEVEL * level;
}
applyVolume();

function stopWalk() {
  if (!walk.paused) walk.pause();
}

function renderButton() {
  const btn = document.getElementById('sfx-btn');
  if (!btn) return;
  btn.textContent = muted ? 'Unmute effects' : 'Mute effects';
  btn.setAttribute('aria-pressed', String(muted));
}

export function isSfxMuted() {
  return muted;
}

export function setSfxMuted(value) {
  muted = Boolean(value);
  try { localStorage.setItem('sfx-muted', String(muted)); } catch {}
  if (muted) stopWalk();
  renderButton();
}

document.getElementById('sfx-btn')?.addEventListener('click', () => setSfxMuted(!muted));
sfxVolume?.addEventListener('input', () => {
  level = Math.max(0, Math.min(100, Number(sfxVolume.value))) / 100;
  applyVolume();
  try { localStorage.setItem('sfx-volume', String(Math.round(level * 100))); } catch {}
});
document.addEventListener('DOMContentLoaded', renderButton);
renderButton();

export function footsteps(active, rate = 1) {
  if (!active || muted) {
    stopWalk();
    return;
  }
  walk.playbackRate = Math.min(1.8, Math.max(0.75, rate));
  if (walk.paused) walk.play().catch(() => {});
}

export function playSfx(name) {
  if (muted) return;
  if (name === 'win') {
    const now = performance.now();
    if (now - lastWin < 400) return;
    lastWin = now;
  }
  const source = oneShots[name];
  if (!source) return;
  const clip = source.cloneNode();
  clip.volume = (name === 'jump' ? JUMP_LEVEL : SHOT_LEVEL) * level;
  clip.play().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopWalk();
});
