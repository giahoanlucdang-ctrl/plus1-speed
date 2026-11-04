const panel = document.getElementById('chat-history');
const log = document.getElementById('chat-messages');
const open = document.getElementById('chat-open');
const close = document.getElementById('chat-close');
let visible = true;
try { visible = localStorage.getItem('chat-history-visible') !== 'false'; } catch {}
function show(value) {
  visible = value;
  panel.hidden = !value;
  open.hidden = value;
  open.setAttribute('aria-expanded', String(value));
  if (value) log.scrollTop = log.scrollHeight;
  try { localStorage.setItem('chat-history-visible', String(value)); } catch {}
}
export function revealChatHistory() { show(true); }
open.addEventListener('click', () => { show(true); open.blur(); });
close.addEventListener('click', () => { show(false); close.blur(); });
show(visible);

// Session history only. Text is inserted as text, never HTML.
export function addChatMessage({ name, username, text }) {
  const atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 28;
  const row = document.createElement('div');
  row.className = 'chat-message';
  const author = document.createElement(username ? 'a' : 'strong');
  author.className = 'chat-author';
  if (username) {
    author.href = 'https://websim.com/@' + encodeURIComponent(username);
    author.target = '_blank';
    author.rel = 'noopener noreferrer';
    const avatar = document.createElement('img');
    avatar.src = 'https://images.websim.com/avatar/' + encodeURIComponent(username);
    avatar.alt = '';
    avatar.loading = 'lazy';
    author.append(avatar, document.createTextNode('@' + username));
  } else author.textContent = name || 'Player';
  row.append(author, document.createTextNode(': ' + text));
  log.append(row);
  if (log.childElementCount > 200) log.firstElementChild.remove();
  if (atBottom || !visible) log.scrollTop = log.scrollHeight;
}
