import { createClient } from 'supabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ACCOUNT_ENABLED } from './supabase-config.js';
import { progress, applyProgressData, progressSnapshot, saveProgress, clearSavedProgress, bindCloudSave, resetProgressData } from './progress.js';
import { ensureProfile, hasProfile } from './profile.js';

const MIN_PASSWORD = 9;
const LOCK_KEY = 'recovery-lock';
const CLOUD_SAVE_INTERVAL = 8000;
const OAUTH_RETURN = /(?:access_token|refresh_token|code)=/.test(`${location.hash}${location.search}`);
let toastTimer = null;

function showToast(message) {
  const toast = $('auth-toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

const supabase = ACCOUNT_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

const $ = (id) => document.getElementById(id);
const modal = $('auth-modal');
const panels = {
  login: $('auth-login'),
  signup: $('auth-signup'),
  forgot: $('auth-forgot'),
  code: $('auth-code'),
  reset: $('auth-reset'),
  change: $('auth-change'),
};
let panelName = 'login';
let displayName = '';
let wired = false;
let resolveMode = null;
let currentUser = null;
let recoveryEmail = '';
let resetMode = 'recovery';
let lockTimer = null;

export function isAccountEnabled() {
  return ACCOUNT_ENABLED;
}

export function accountEmail() {
  return currentUser?.email ?? '';
}

export function isSignedIn() {
  return Boolean(currentUser);
}

export function googleLinked() {
  return Boolean(currentUser?.identities?.some((identity) => identity.provider === 'google'));
}

function showPanel(name) {
  panelName = name;
  for (const [key, element] of Object.entries(panels)) element.hidden = key !== name;
  $('auth-note').hidden = !$('auth-note').textContent || name !== 'login';
}

function showModal(name = 'login') {
  showPanel(name);
  modal.hidden = false;
}

function hideModal() {
  modal.hidden = true;
}

function setError(id, message) {
  $(id).textContent = message ?? '';
}

function authRedirectUrl() {
  return `${location.origin}${location.pathname}`;
}

function isNativeApp() {
  return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}

function sanitizeNickname(raw) {
  const name = String(raw ?? '').trim().slice(0, 20);
  return name.length >= 4 ? name : '';
}

function emailPrefix(email) {
  return sanitizeNickname(String(email ?? '').split('@')[0]) || 'Player';
}

async function emailRegistered(email) {
  const { data, error } = await supabase.rpc('email_registered', { candidate: email });
  if (error) return null;
  return Boolean(data);
}

function mapAuthError(error, fallback) {
  const message = error?.message ?? '';
  if (/already registered|already been registered|already exists/i.test(message)) return 'This email is already registered.';
  if (/invalid login credentials/i.test(message)) return 'Wrong password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first, then log in.';
  if (/password should be at least/i.test(message)) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
  if (/fetch|network/i.test(message)) return 'No connection. Check your internet and try again.';
  return message || fallback;
}

function updateAccountStatus() {
  const status = $('account-status');
  const googleBtn = $('link-google-btn');
  if (currentUser) {
    status.textContent = googleLinked() ? `${currentUser.email} · Google linked` : currentUser.email;
    googleBtn.textContent = googleLinked() ? 'Linked' : 'Link Google';
    googleBtn.disabled = googleLinked();
  } else {
    status.textContent = ACCOUNT_ENABLED ? 'Offline' : 'Offline (account server not set up)';
    googleBtn.textContent = 'Link Google';
    googleBtn.disabled = false;
  }
}

async function loadCloudProfile(user) {
  currentUser = user;
  try {
    const { data: row, error } = await supabase.from('profiles').select('nickname, data, updated_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (row) {
      const cloudTime = Date.parse(row.updated_at) || 0;
      if (progress.savedAt > cloudTime + 1000) {
        progress.nickname = sanitizeNickname(progress.nickname) || sanitizeNickname(row.nickname) || emailPrefix(user.email);
        await pushCloud(true);
      } else {
        applyProgressData(row.data ?? {});
        progress.nickname = sanitizeNickname(row.nickname) || sanitizeNickname(row.data?.nickname) || emailPrefix(user.email);
        await saveProgress();
      }
    } else {
      progress.nickname = sanitizeNickname(user.user_metadata?.nickname)
        || sanitizeNickname(progress.nickname)
        || emailPrefix(user.email);
      await saveProgress();
      await pushCloud(true);
    }
  } catch (error) {
    console.warn('Cloud profile unavailable', error);
  }
  updateAccountStatus();
}

async function pushCloud(force = false) {
  if (!currentUser || !supabase) return;
  if (!force && pushing) return;
  pushing = true;
  try {
    await supabase.from('profiles').upsert({
      id: currentUser.id,
      nickname: progress.nickname || emailPrefix(currentUser.email),
      email: currentUser.email,
      data: progressSnapshot(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Cloud save failed', error);
  } finally {
    pushing = false;
  }
}
let pushing = false;
let cloudTimer = null;
let lastPush = 0;

function queueCloudSave() {
  if (!currentUser) return;
  const wait = CLOUD_SAVE_INTERVAL - (Date.now() - lastPush);
  if (wait <= 0) {
    lastPush = Date.now();
    void pushCloud();
    return;
  }
  if (cloudTimer) return;
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    lastPush = Date.now();
    void pushCloud();
  }, wait);
}

async function finishLogin() {
  hideModal();
  updateAccountStatus();
  resolveMode?.('online');
  resolveMode = null;
}

async function login(email, password, errorId) {
  if (!supabase) return;
  setError(errorId, '');
  const exists = await emailRegistered(email);
  if (exists === false) {
    setError(errorId, 'The account does not exist.');
    return;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setError(errorId, mapAuthError(error, 'Could not log in.'));
    return;
  }
  await loadCloudProfile(data.user);
  await finishLogin();
}

async function signup(nickname, email, password) {
  setError('signup-error', '');
  if (!sanitizeNickname(nickname)) {
    setError('signup-error', 'Nickname must be 4–20 characters.');
    return;
  }
  if (password.length < MIN_PASSWORD) {
    setError('signup-error', `Password must be at least ${MIN_PASSWORD} characters.`);
    return;
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname: sanitizeNickname(nickname) } },
  });
  if (error) {
    setError('signup-error', mapAuthError(error, 'Could not create the account.'));
    return;
  }
  if (!data.session) {
    setError('signup-error', 'Account created. Confirm the email we sent, then log in.');
    showPanel('login');
    $('login-email').value = email;
    return;
  }
  progress.nickname = sanitizeNickname(nickname) || emailPrefix(email);
  await saveProgress();
  await loadCloudProfile(data.user);
  await finishLogin();
}

function lockRemaining(email) {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}');
    if (lock.email === email && lock.until > Date.now()) return Math.ceil((lock.until - Date.now()) / 1000);
  } catch {}
  return 0;
}

function recordWrongCode(email) {
  let lock = {};
  try { lock = JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}'); } catch {}
  const count = lock.email === email ? (lock.count ?? 0) + 1 : 1;
  if (count >= 5) {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ email, count: 0, until: Date.now() + 60000 }));
    return 60;
  }
  localStorage.setItem(LOCK_KEY, JSON.stringify({ email, count, until: 0 }));
  return 0;
}

function clearLock(email) {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}');
    if (!lock.email || lock.email === email) localStorage.removeItem(LOCK_KEY);
  } catch {}
}

function showLockCountdown(seconds) {
  clearInterval(lockTimer);
  let left = seconds;
  const submit = $('code-submit');
  const render = () => {
    if (left <= 0) {
      clearInterval(lockTimer);
      setError('code-error', '');
      submit.disabled = false;
      return;
    }
    setError('code-error', `Too many wrong codes. Try again in ${left}s.`);
    submit.disabled = true;
    left -= 1;
  };
  render();
  lockTimer = setInterval(render, 1000);
}

async function sendRecoveryCode(email) {
  setError('forgot-error', '');
  setError('code-error', '');
  const exists = await emailRegistered(email);
  if (exists === false) {
    setError('forgot-error', 'The account does not exist.');
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  if (error) {
    setError('forgot-error', mapAuthError(error, 'Could not send the code.'));
    return;
  }
  recoveryEmail = email;
  $('code-hint').textContent = `We sent a 6-digit code to ${email}.`;
  $('code-input').value = '';
  showPanel('code');
  const remaining = lockRemaining(email);
  if (remaining > 0) showLockCountdown(remaining);
  else $('code-submit').disabled = false;
}

async function verifyRecoveryCode(code) {
  if (!/^\d{6}$/.test(code)) {
    setError('code-error', 'Enter the 6-digit code.');
    return;
  }
  const remaining = lockRemaining(recoveryEmail);
  if (remaining > 0) {
    showLockCountdown(remaining);
    return;
  }
  const { error } = await supabase.auth.verifyOtp({ email: recoveryEmail, token: code, type: 'recovery' });
  if (error) {
    const wait = recordWrongCode(recoveryEmail);
    if (wait > 0) showLockCountdown(wait);
    else setError('code-error', 'Wrong code.');
    return;
  }
  clearLock(recoveryEmail);
  clearInterval(lockTimer);
  resetMode = 'recovery';
  $('reset-password').value = '';
  $('reset-confirm').value = '';
  setError('reset-error', '');
  $('reset-password').disabled = false;
  $('reset-confirm').disabled = false;
  $('reset-submit').disabled = false;
  showPanel('reset');
}

async function saveNewPassword(password, confirm) {
  setError('reset-error', '');
  if (password.length < MIN_PASSWORD) {
    setError('reset-error', `Password must be at least ${MIN_PASSWORD} characters.`);
    return;
  }
  if (password !== confirm) {
    setError('reset-error', 'Passwords do not match.');
    return;
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    setError('reset-error', mapAuthError(error, 'Could not save the password.'));
    return;
  }
  await supabase.auth.signOut();
  currentUser = null;
  updateAccountStatus();
  $('login-email').value = recoveryEmail;
  $('login-password').value = '';
  setError('login-error', 'Password changed. Log in with your new password.');
  showPanel('login');
}

async function changePassword(currentPassword, newPassword) {
  $('change-error').style.color = '';
  setError('change-error', '');
  if (!currentUser) {
    showModal('login');
    return;
  }
  if (newPassword.length < MIN_PASSWORD) {
    setError('change-error', `Password must be at least ${MIN_PASSWORD} characters.`);
    return;
  }
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
  if (verifyError) {
    setError('change-error', 'Wrong current password.');
    return;
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    setError('change-error', mapAuthError(error, 'Could not change the password.'));
    return;
  }
  $('change-current').value = '';
  $('change-password').value = '';
  $('change-error').style.color = '#7fe39a';
  setError('change-error', 'Password changed.');
}

async function signInWithGoogle() {
  if (!supabase) return;
  if (isNativeApp()) {
    setError('login-error', 'Google sign-in inside the Android app is coming soon. Use email and password for now.');
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl(), queryParams: { prompt: 'select_account' } },
  });
  if (error) setError('login-error', mapAuthError(error, 'Could not open Google sign-in.'));
}

async function linkGoogle() {
  if (!supabase) return;
  if (!currentUser) {
    showModal('login');
    return;
  }
  if (isNativeApp()) {
    alert('Google linking inside the Android app is coming soon.');
    return;
  }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) alert(mapAuthError(error, 'Could not link Google.'));
}

async function deleteAccount() {
  if (!currentUser) {
    showModal('login');
    return;
  }
  if (!confirm('Delete your account and cloud save? This cannot be undone.')) return;
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) {
    alert('Could not delete the account. Try again later.');
    return;
  }
  await supabase.auth.signOut().catch(() => {});
  currentUser = null;
  await clearSavedProgress();
  location.reload();
}

async function resetGame() {
  if (!confirm('Reset your progress? Wins, rebirths and worlds go back to zero.')) return;
  resetProgressData();
  await saveProgress();
  if (currentUser) await pushCloud(true);
  location.reload();
}

function wire() {
  if (wired) return;
  wired = true;

  panels.login.addEventListener('submit', (event) => {
    event.preventDefault();
    void login($('login-email').value.trim(), $('login-password').value, 'login-error');
  });

  $('signup-tab').addEventListener('click', () => {
    setError('signup-error', '');
    showPanel('signup');
  });
  $('login-tab').addEventListener('click', () => showPanel('login'));
  $('forgot-btn').addEventListener('click', () => {
    setError('forgot-error', '');
    $('forgot-email').value = $('login-email').value.trim();
    showPanel('forgot');
  });
  $('forgot-back').addEventListener('click', () => showPanel('login'));
  $('code-back').addEventListener('click', () => {
    clearInterval(lockTimer);
    $('code-submit').disabled = false;
    showPanel('login');
  });

  panels.signup.addEventListener('submit', (event) => {
    event.preventDefault();
    void signup($('signup-nickname').value, $('signup-email').value.trim(), $('signup-password').value);
  });
  panels.forgot.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendRecoveryCode($('forgot-email').value.trim());
  });
  panels.code.addEventListener('submit', (event) => {
    event.preventDefault();
    void verifyRecoveryCode($('code-input').value.trim());
  });
  panels.reset.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveNewPassword($('reset-password').value, $('reset-confirm').value);
  });
  panels.change.addEventListener('submit', (event) => {
    event.preventDefault();
    void changePassword($('change-current').value, $('change-password').value);
  });
  $('change-cancel').addEventListener('click', () => hideModal());

  $('google-btn').addEventListener('click', () => void signInWithGoogle());
  $('offline-btn').addEventListener('click', async () => {
    hideModal();
    if (!hasProfile()) await ensureProfile();
    resolveMode?.('offline');
    resolveMode = null;
  });

  $('link-google-btn').addEventListener('click', () => void linkGoogle());
  $('change-password-btn').addEventListener('click', () => {
    if (!currentUser) {
      showModal('login');
      return;
    }
    $('change-current').value = '';
    $('change-password').value = '';
    setError('change-error', '');
    showModal('change');
  });
  $('reset-game-btn').addEventListener('click', () => void resetGame());
  $('delete-account-btn').addEventListener('click', () => void deleteAccount());

  addEventListener('pagehide', () => {
    if (currentUser) void pushCloud();
  });
}

function readUrlError() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search);
  const description = params.get('error_description') || params.get('error');
  if (!description) return '';
  history.replaceState(null, '', authRedirectUrl());
  return decodeURIComponent(description.replace(/\+/g, ' '));
}

export async function startAuth() {
  wire();
  bindCloudSave(queueCloudSave);
  updateAccountStatus();

  if (!ACCOUNT_ENABLED) {
    $('auth-note').textContent = 'This build has no account server yet. Play offline and your save stays on this device.';
    $('auth-note').hidden = false;
    $('login-submit').disabled = true;
    $('signup-submit').disabled = true;
    $('forgot-submit').disabled = true;
    $('google-btn').disabled = true;
    showModal('login');
    return new Promise((resolve) => { resolveMode = resolve; });
  }

  const urlError = readUrlError();
  if (urlError) setError('login-error', urlError);

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await loadCloudProfile(data.session.user);
    hideModal();
    if (OAUTH_RETURN) showToast(googleLinked() ? 'Google account linked.' : 'Signed in with Google.');
    return 'online';
  }
  showModal('login');
  return new Promise((resolve) => { resolveMode = resolve; });
}
