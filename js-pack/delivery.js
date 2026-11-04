// Sends movement input at the caller's rate (changes immediately, unchanged
// input as a keepalive) and retries chats until the server acknowledges them.
export class Delivery {
  constructor(send, now = () => performance.now()) {
    this.send = send;
    this.now = now;
    this.seq = 0;
    this.state = null;
    this.sent = new Map();
    this.lastState = '';
    this.lastMotion = '';
    this.lastInput = null;
    this.lastStateAt = -Infinity;
    this.chats = new Map();
    this.nextChat = 0;
    this.session = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  }
  reset() {
    this.state = null;
    this.sent.clear();
    this.lastState = '';
    this.lastMotion = '';
    this.lastInput = null;
    this.lastStateAt = -Infinity;
    for (const chat of this.chats.values()) chat.sentAt = -Infinity;
  }
  offerState(msg) {
    const now = this.now();
    const key = JSON.stringify(msg);
    const { r, ...motion } = msg;
    const motionKey = JSON.stringify(motion);
    const previous = this.lastInput;
    const edge = !previous || ['ux','uz'].some(axis =>
      Math.sign(msg[axis] ?? 0) !== Math.sign(previous[axis] ?? 0)) ||
      ['jump','j','slow'].some(key => msg[key] !== previous[key]);
    // Four heartbeats per second leave room for jitter and dropped frames
    // before the server's idle cutoff. Never wait for an ACK to send movement.
    const interval = motionKey !== this.lastMotion ? 50 : key !== this.lastState ? 100 : 250;
    if (!edge && now - this.lastStateAt < interval) return;
    const q = ++this.seq;
    this.send({ ...msg, q });
    this.state = { q, sentAt: now };
    this.sent.set(q, now);
    if (this.sent.size > 32) this.sent.delete(this.sent.keys().next().value);
    this.lastState = key;
    this.lastMotion = motionKey;
    this.lastInput = motion;
    this.lastStateAt = now;
  }
  ackState(q) {
    if (this.state && q >= this.state.q) this.state = null;
  }
  chat(text) {
    if (this.chats.size >= 8) return false;
    const cid = this.session + ':' + (++this.nextChat);
    this.chats.set(cid, { text, sentAt: -Infinity });
    this.flushChats();
    return true;
  }
  ackChat(cid) { this.chats.delete(cid); }
  flushChats() {
    const now = this.now();
    for (const [cid, chat] of this.chats) {
      if (now - chat.sentAt < 3000) continue;
      this.send({ type: 'chat', text: chat.text, cid });
      chat.sentAt = now;
    }
  }
}
