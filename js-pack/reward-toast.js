const queue = [];
let showing = false;
let timer = 0;
const el = (id) => document.getElementById(id);

function pump() {
  if (showing) return;
  const next = queue.shift();
  const box = el('reward-toast');
  if (!next || !box) return;
  el('reward-title').textContent = next.title;
  el('reward-detail').textContent = next.detail;
  box.hidden = false;
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
  showing = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    box.classList.remove('show');
    box.hidden = true;
    showing = false;
    setTimeout(pump, 320);
  }, 3200);
}

export function showReward(title, detail = '') {
  queue.push({ title, detail });
  pump();
}
