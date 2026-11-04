// Keep packet arrival jitter out of the animation timeline. Only the clock
// offset uses arrival time; positions retain their original server timestamps.
export class SnapshotClock {
  constructor() { this.reset(); }
  reset() { this.offset = null; this.offsets = []; }
  observe(serverTime, receivedAt) {
    const offset = receivedAt - serverTime;
    this.offsets.push(offset);
    if (this.offsets.length > 64) this.offsets.shift();
    if (this.offset === null) this.offset = offset;
    // Follow clock drift slowly; a delayed packet must never rewind playback.
    const target = Math.min(...this.offsets);
    this.offset += Math.max(-.5, Math.min(.5, target - this.offset));
  }
  renderTime(now) { return now - (this.offset ?? 0) - 200; }
}

const angle = (a,b,k) => a + Math.atan2(Math.sin(b-a),Math.cos(b-a))*k;

export class RemoteMotion {
  constructor(initial) {
    this.initial = initial;
    this.snaps = [];
  }
  push(snap) {
    const last = this.snaps.at(-1);
    if (last && snap.t <= last.t) return false;
    const reset = !!last && (snap.n !== last.n || snap.d !== last.d);
    if (reset) this.snaps.length = 0;
    this.snaps.push(snap);
    if (this.snaps.length > 32) this.snaps.shift();
    return reset;
  }
  sample(t) {
    const s = this.snaps;
    if (!s.length) return {...this.initial, speed:0};
    while (s.length > 2 && s[1].t <= t) s.shift();
    const a = s[0], b = s[1] ?? a;
    const duration = (b.t - a.t) / 1000;
    const moving = !b.d && b.a !== 'idle';
    // Bridge a brief buffer underrun, then stop. Never invent an extended run
    // after a disconnect, or extrapolate a death/respawn across the course.
    const extra = moving && duration > 0 ? 100 / (b.t-a.t) : 0;
    const k = duration > 0 ? Math.max(0, Math.min(1+extra,(t-a.t)/(b.t-a.t))) : 1;
    const cur = k < 1 ? a : b;
    return {
      x:a.x+(b.x-a.x)*k, y:a.y+(b.y-a.y)*k, z:a.z+(b.z-a.z)*k,
      r:angle(a.r,b.r,Math.min(1,k)), a:cur.a, d:cur.d, n:cur.n,
      speed:duration > 0 && moving ? Math.hypot(b.x-a.x,b.z-a.z)/duration : 0,
    };
  }
}
