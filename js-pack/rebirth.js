import { progress, requestRebirth } from './progress.js';

// Each rebirth adds +0.1x to speed and win gains, and needs 10 more wins than the last
const tenths = () => 10 + (progress.rebirths ?? 0);
export const boost = () => tenths() / 10;
export const boosted = (amount) => Math.ceil((amount * tenths()) / 10);
const needed = () => 10 * ((progress.rebirths ?? 0) + 1);

const btn = document.getElementById('rebirth-btn');
const modal = document.getElementById('rebirth-modal');
const doBtn = document.getElementById('rebirth-do');
const celebration = document.getElementById('rebirth-celebration');
const confetti = document.getElementById('rebirth-confetti');
const els = {
  count: document.getElementById('rb-count'),
  boost: document.getElementById('rb-boost'),
  wins: document.getElementById('rb-wins'),
  needed: document.getElementById('rb-needed'),
};

let onChange = () => {};
export function initRebirth(changed) {
  onChange = changed;
}

export function renderRebirth() {
  els.count.textContent = progress.rebirths ?? 0;
  els.boost.textContent = boost();
  els.wins.textContent = progress.wins;
  els.needed.textContent = needed();
  doBtn.disabled = progress.wins < needed();
}

const close = () => { modal.hidden = true; };
let celebrationTimer;
function celebrateRebirth() {
  confetti.src = `image-pack/confetti.gif?t=${Date.now()}`;
  celebration.hidden = false;
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { celebration.hidden = true; }, 2400);
}
btn.addEventListener('click', () => {
  renderRebirth();
  modal.hidden = false;
  btn.blur();
});
modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
document.getElementById('rebirth-close').addEventListener('click', close);
addEventListener('keydown', (e) => { if (e.code === 'Escape') close(); });

doBtn.addEventListener('click', () => {
  if (progress.wins < needed()) return;
  if (requestRebirth()) celebrateRebirth();
  doBtn.blur();
});
