// Android is installed outside the Play Store, so a new APK is only announced,
// never installed silently: tapping the banner opens the download in a browser.
const RELEASES_API = 'https://api.github.com/repos/giahoanlucdang-ctrl/plus1-speed/releases/latest';
const DISMISS_KEY = 'update-dismissed';

function isNewer(candidate, current) {
  const a = String(candidate).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function currentVersion() {
  try {
    const response = await fetch('version.json', { cache: 'no-store' });
    if (!response.ok) return '';
    return String((await response.json()).version || '');
  } catch {
    return '';
  }
}

export async function checkForUpdate() {
  if (!globalThis.Capacitor?.isNativePlatform?.()) return;
  const current = await currentVersion();
  if (!current) return;
  let release;
  try {
    const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    release = await response.json();
  } catch {
    return;
  }
  const tag = typeof release?.tag_name === 'string' ? release.tag_name : '';
  if (!tag || !isNewer(tag, current)) return;
  try { if (localStorage.getItem(DISMISS_KEY) === tag) return; } catch {}
  const apk = Array.isArray(release.assets)
    ? release.assets.find((asset) => typeof asset?.name === 'string' && /\.apk$/i.test(asset.name))
    : null;
  const url = apk?.browser_download_url || release.html_url;
  if (!url) return;
  const banner = document.getElementById('update-banner');
  const link = document.getElementById('update-link');
  const text = document.getElementById('update-text');
  const close = document.getElementById('update-close');
  if (!banner || !link || !text || !close) return;
  text.textContent = `Bản mới ${tag} đã có`;
  link.href = url;
  close.onclick = () => {
    banner.hidden = true;
    try { localStorage.setItem(DISMISS_KEY, tag); } catch {}
  };
  banner.hidden = false;
}
