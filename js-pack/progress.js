// Single-player progress is saved locally in this browser.
const KEY = 'single-player-progress';
const PRIVATE_SAVE_FILE = 'plus1-speed-save.json';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch {}
export const progress = {
  speed: Number.isFinite(saved.speed) ? saved.speed : 1,
  wins: Number.isFinite(saved.wins) ? saved.wins : 0,
  rebirths: Number.isFinite(saved.rebirths) ? saved.rebirths : 0,
  shopSpeed: Number.isFinite(saved.shopSpeed) ? saved.shopSpeed : 0,
  walkTime: Number.isFinite(saved.walkTime) ? saved.walkTime : 0,
  playTime: Number.isFinite(saved.playTime) && saved.playTime >= 0 ? saved.playTime : 0,
  avatar: typeof saved.avatar === 'string' ? saved.avatar : 'noob',
  unlocked: Array.isArray(saved.unlocked) ? [...new Set([1, ...saved.unlocked.filter((w) => [2, 3, 4].includes(w))])] : [1],
  nickname: typeof saved.nickname === 'string' ? saved.nickname.slice(0, 20) : '',
  passwordHash: typeof saved.passwordHash === 'string' ? saved.passwordHash : '',
  passwordSalt: typeof saved.passwordSalt === 'string' ? saved.passwordSalt : '',
};
let privateSaveActive = false;
let privateSaveChain = Promise.resolve();

function applySavedProgress(data) {
  if (!data || typeof data !== 'object') return;
  if (Number.isSafeInteger(data.speed) && data.speed >= 1 && data.speed <= 1e12) progress.speed = data.speed;
  if (Number.isSafeInteger(data.wins) && data.wins >= 0 && data.wins <= 1e12) progress.wins = data.wins;
  if (Number.isSafeInteger(data.rebirths) && data.rebirths >= 0 && data.rebirths <= 1e12) progress.rebirths = data.rebirths;
  if (Number.isSafeInteger(data.shopSpeed) && data.shopSpeed >= 0 && data.shopSpeed <= 1e12) progress.shopSpeed = data.shopSpeed;
  if (Number.isFinite(data.walkTime) && data.walkTime >= 0 && data.walkTime < 1) progress.walkTime = data.walkTime;
  if (Number.isFinite(data.playTime) && data.playTime >= 0) progress.playTime = data.playTime;
  if (typeof data.avatar === 'string') progress.avatar = data.avatar;
  if (Array.isArray(data.unlocked)) progress.unlocked = [...new Set([1, ...data.unlocked.filter((w) => [2, 3, 4].includes(w))])];
  if (typeof data.nickname === 'string') progress.nickname = data.nickname.slice(0, 20);
  if (typeof data.passwordHash === 'string') progress.passwordHash = data.passwordHash;
  if (typeof data.passwordSalt === 'string') progress.passwordSalt = data.passwordSalt;
}

async function writePrivateSave() {
  const payload = JSON.stringify(progress);
  privateSaveChain = privateSaveChain.catch(() => {}).then(async () => {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle(PRIVATE_SAVE_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write(payload);
    await writable.close();
  });
  await privateSaveChain;
  privateSaveActive = true;
}

let rebirthSender = () => false;
export function bindRebirth(sender) { rebirthSender = sender; }
export function requestRebirth() { return rebirthSender(); }
export function applyServerProgress(stats) {
  if (!stats) return;
  for (const key of ['speed','wins','rebirths','walkTime','shopSpeed']) {
    if (Number.isFinite(stats[key])) progress[key] = stats[key];
  }
  if (typeof stats.avatar === 'string') progress.avatar = stats.avatar;
  dispatchEvent(new CustomEvent('progress:server'));
}
export async function loadProgress() {
  try {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle(PRIVATE_SAVE_FILE);
    const file = await handle.getFile();
    applySavedProgress(JSON.parse(await file.text()));
    privateSaveActive = true;
  } catch {}
  return progress;
}
export async function saveProgress() {
  let browserSaved = false;
  let privateSaved = false;
  try { localStorage.setItem(KEY, JSON.stringify(progress)); browserSaved = true; } catch {}
  try { await writePrivateSave(); privateSaved = true; } catch {}
  return { browserSaved, privateSaved };
}
export async function clearSavedProgress() {
  try { localStorage.removeItem(KEY); } catch {}
  try { await privateSaveChain; } catch {}
  try {
    const directory = await navigator.storage.getDirectory();
    await directory.removeEntry(PRIVATE_SAVE_FILE);
  } catch {}
  privateSaveActive = false;
}
export function markDirty() {
  if (privateSaveActive) {
    void writePrivateSave().catch(() => {});
    return true;
  }
  try { localStorage.setItem(KEY, JSON.stringify(progress)); return true; }
  catch {
    void writePrivateSave().catch(() => {});
    return false;
  }
}
