// Single-player progress is saved locally in this browser.
const KEY = 'single-player-progress';
const PRIVATE_SAVE_FILE = 'plus1-speed-save.json';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch {}
function normalizeFriends(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const raw = typeof item === 'string' ? item : item?.name;
    if (typeof raw !== 'string') continue;
    const name = raw.trim().slice(0, 20);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= 100) break;
  }
  return out;
}
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
  friends: normalizeFriends(saved.friends),
  bestSpeed: Number.isFinite(saved.bestSpeed) && saved.bestSpeed >= 1 ? saved.bestSpeed : 1,
  deaths: Number.isSafeInteger(saved.deaths) && saved.deaths >= 0 ? saved.deaths : 0,
  jumps: Number.isSafeInteger(saved.jumps) && saved.jumps >= 0 ? saved.jumps : 0,
  distance: Number.isFinite(saved.distance) && saved.distance >= 0 ? saved.distance : 0,
  bestDistance: Number.isFinite(saved.bestDistance) && saved.bestDistance >= 0 ? saved.bestDistance : 0,
  dailyStreak: Number.isSafeInteger(saved.dailyStreak) && saved.dailyStreak >= 0 ? saved.dailyStreak : 0,
  dailyClaimedDay: typeof saved.dailyClaimedDay === 'string' ? saved.dailyClaimedDay.slice(0, 10) : '',
  achievements: Array.isArray(saved.achievements)
    ? [...new Set(saved.achievements.filter((id) => typeof id === 'string'))].slice(0, 64)
    : [],
  savedAt: Number.isFinite(saved.savedAt) ? saved.savedAt : 0,
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
  if (Array.isArray(data.friends)) progress.friends = normalizeFriends(data.friends);
  if (Number.isFinite(data.bestSpeed) && data.bestSpeed >= 1 && data.bestSpeed <= 1e12) progress.bestSpeed = data.bestSpeed;
  if (Number.isSafeInteger(data.deaths) && data.deaths >= 0 && data.deaths <= 1e9) progress.deaths = data.deaths;
  if (Number.isSafeInteger(data.jumps) && data.jumps >= 0 && data.jumps <= 1e9) progress.jumps = data.jumps;
  if (Number.isFinite(data.distance) && data.distance >= 0 && data.distance <= 1e12) progress.distance = data.distance;
  if (Number.isFinite(data.bestDistance) && data.bestDistance >= 0 && data.bestDistance <= 1e12) progress.bestDistance = data.bestDistance;
  if (Number.isSafeInteger(data.dailyStreak) && data.dailyStreak >= 0 && data.dailyStreak <= 3650) progress.dailyStreak = data.dailyStreak;
  if (typeof data.dailyClaimedDay === 'string') progress.dailyClaimedDay = data.dailyClaimedDay.slice(0, 10);
  if (Array.isArray(data.achievements)) {
    progress.achievements = [...new Set(data.achievements.filter((id) => typeof id === 'string'))].slice(0, 64);
  }
}

let cloudSaver = null;
export function bindCloudSave(saver) { cloudSaver = saver; }
export function progressSnapshot() {
  return {
    speed: progress.speed,
    wins: progress.wins,
    rebirths: progress.rebirths,
    shopSpeed: progress.shopSpeed,
    walkTime: progress.walkTime,
    playTime: progress.playTime,
    avatar: progress.avatar,
    unlocked: [...progress.unlocked],
    nickname: progress.nickname,
    friends: [...progress.friends],
    bestSpeed: progress.bestSpeed,
    deaths: progress.deaths,
    jumps: progress.jumps,
    distance: progress.distance,
    bestDistance: progress.bestDistance,
    dailyStreak: progress.dailyStreak,
    dailyClaimedDay: progress.dailyClaimedDay,
    achievements: [...progress.achievements],
    savedAt: progress.savedAt,
  };
}
export function applyProgressData(data) {
  applySavedProgress(data);
  dispatchEvent(new CustomEvent('progress:server'));
}
export function resetProgressData() {
  progress.speed = 1;
  progress.wins = 0;
  progress.rebirths = 0;
  progress.shopSpeed = 0;
  progress.walkTime = 0;
  progress.playTime = 0;
  progress.avatar = 'noob';
  progress.unlocked = [1];
  progress.friends = [];
  progress.bestSpeed = 1;
  progress.deaths = 0;
  progress.jumps = 0;
  progress.distance = 0;
  progress.bestDistance = 0;
  progress.dailyStreak = 0;
  progress.dailyClaimedDay = '';
  progress.achievements = [];
  progress.savedAt = Date.now();
  dispatchEvent(new CustomEvent('progress:server'));
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
  progress.savedAt = Date.now();
  let browserSaved = false;
  let privateSaved = false;
  try { localStorage.setItem(KEY, JSON.stringify(progress)); browserSaved = true; } catch {}
  try { await writePrivateSave(); privateSaved = true; } catch {}
  cloudSaver?.();
  return { browserSaved, privateSaved };
}
export function exportSave() {
  const payload = {
    game: '+1 Speed',
    format: 1,
    exportedAt: new Date().toISOString(),
    progress: progressSnapshot(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `plus1-speed-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSave(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return false; }
  const source = data && typeof data === 'object' && data.progress && typeof data.progress === 'object' ? data.progress : data;
  if (!source || typeof source !== 'object') return false;
  if (!['speed', 'wins', 'rebirths', 'playTime'].some((key) => key in source)) return false;
  applySavedProgress(source);
  progress.savedAt = Date.now();
  dispatchEvent(new CustomEvent('progress:server'));
  await saveProgress();
  return true;
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
  progress.savedAt = Date.now();
  cloudSaver?.();
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
