// Looping background music; browsers only allow playback after a user gesture
const music = new Audio('music-pack/music.mp4');
music.loop = true;
const button = document.getElementById('music-btn');
const volume = document.getElementById('music-volume');
let enabled = true;
let level = 50;
try {
  enabled = localStorage.getItem('music-muted') !== 'true';
  const stored = Number(localStorage.getItem('music-volume'));
  if (Number.isFinite(stored)) level = Math.max(0, Math.min(100, stored));
} catch {}
music.muted = !enabled;
music.volume = level / 100;
if (volume) volume.value = String(level);

function renderButton() {
  button.textContent = enabled ? 'Mute music' : 'Unmute music';
  button.setAttribute('aria-pressed', String(enabled));
}
renderButton();
button.addEventListener('click', () => {
  enabled = !enabled;
  music.muted = !enabled;
  try { localStorage.setItem('music-muted', String(!enabled)); } catch {}
  renderButton();
  if (enabled) start();
  else music.pause();
});
volume?.addEventListener('input', () => {
  level = Math.max(0, Math.min(100, Number(volume.value)));
  music.volume = level / 100;
  try { localStorage.setItem('music-volume', String(level)); } catch {}
});

const start = () => {
  if (!enabled) return;
  music.play().then(() => {
    if (!enabled) { music.pause(); return; }
    for (const e of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(e, start);
  }).catch(() => {});
};
for (const e of ['pointerdown', 'keydown', 'touchstart']) addEventListener(e, start);
