// Looping background music; browsers only allow playback after a user gesture
import { setSfxMuted } from './sfx.js';

const music = new Audio('music-pack/music.mp4');
music.loop = true;
music.volume = 0.5;
const button = document.getElementById('music-btn');
let enabled = true;
try { enabled = localStorage.getItem('music-muted') !== 'true'; } catch {}
music.muted = !enabled;
setSfxMuted(!enabled);

function renderButton() {
  button.textContent = enabled ? 'Mute music' : 'Unmute music';
  button.setAttribute('aria-pressed', String(enabled));
}
renderButton();
button.addEventListener('click', () => {
  enabled = !enabled;
  music.muted = !enabled;
  setSfxMuted(!enabled);
  try { localStorage.setItem('music-muted', String(!enabled)); } catch {}
  renderButton();
  if (enabled) start();
  else music.pause();
});

const start = () => {
  if (!enabled) return;
  music.play().then(() => {
    if (!enabled) { music.pause(); return; }
    for (const e of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(e, start);
  }).catch(() => {});
};
for (const e of ['pointerdown', 'keydown', 'touchstart']) addEventListener(e, start);
