const KEY = 'low-graphics';

function detectLowEnd() {
  const memory = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return (typeof memory === 'number' && memory <= 2) || (typeof cores === 'number' && cores <= 2);
}

let low;
try {
  const stored = localStorage.getItem(KEY);
  low = stored === null ? detectLowEnd() : stored === 'true';
} catch {
  low = detectLowEnd();
}

export function isLowGraphics() {
  return low;
}

export function hasGraphicsPreference() {
  try { return localStorage.getItem(KEY) !== null; } catch { return false; }
}

// Cap the render resolution: weak phone GPUs spend most of their time per pixel.
export function renderPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return low ? Math.min(dpr, 1) : Math.min(dpr, 2);
}

export function setLowGraphics(value) {
  low = Boolean(value);
  try { localStorage.setItem(KEY, String(low)); } catch {}
}
