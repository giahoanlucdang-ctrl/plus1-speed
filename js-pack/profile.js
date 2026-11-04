import { progress, markDirty } from './progress.js';

const NAME_MIN = 4;
const NAME_MAX = 20;
const PASSWORD_MIN = 9;

function randomSalt() {
  if (globalThis.crypto?.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

async function hashPassword(password, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  // Plain-http LAN pages have no crypto.subtle; keep a salted, non-plaintext digest.
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 16777619) >>> 0;
    h2 = Math.imul(h2 + byte, 2654435761) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function hasProfile() {
  return typeof progress.nickname === 'string' && progress.nickname.length >= NAME_MIN;
}

export function ensureProfile() {
  if (hasProfile()) return Promise.resolve();
  return new Promise((resolve) => {
    const ui = document.getElementById('profile-modal');
    const form = document.getElementById('profile-form');
    const nameInput = document.getElementById('profile-name');
    const passInput = document.getElementById('profile-password');
    const error = document.getElementById('profile-error');
    const submit = document.getElementById('profile-submit');
    ui.hidden = false;
    nameInput.focus();

    const validate = () => {
      const name = nameInput.value.trim();
      const pass = passInput.value;
      const nameOk = name.length >= NAME_MIN && name.length <= NAME_MAX;
      const passOk = pass.length >= PASSWORD_MIN;
      submit.disabled = !(nameOk && passOk);
      error.textContent = name && !nameOk
        ? `Nickname must be ${NAME_MIN}–${NAME_MAX} characters.`
        : pass && !passOk ? `Password must be at least ${PASSWORD_MIN} characters.` : '';
      return nameOk && passOk;
    };
    nameInput.addEventListener('input', validate);
    passInput.addEventListener('input', validate);
    validate();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validate()) return;
      const name = nameInput.value.trim();
      const salt = randomSalt();
      submit.disabled = true;
      submit.textContent = 'Creating…';
      progress.nickname = name;
      progress.passwordSalt = salt;
      progress.passwordHash = await hashPassword(passInput.value, salt);
      markDirty();
      passInput.value = '';
      ui.hidden = true;
      resolve();
    });
  });
}
