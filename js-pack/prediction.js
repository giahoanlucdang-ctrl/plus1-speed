import { stepSim, restoreSim } from './server.js';

// Replay recent input over the server's state at its estimated network age.
// Both sides use the same collisions, obstacle clocks, deaths and rewards.
export class Prediction {
  constructor(sim) {
    this.sim = sim;
    this.history = [];
    this.networkAge = 0;
    this.hasAge = false;
    this.lastTick = -Infinity;
    this.connected = false;
  }
  step(dt, input, now) {
    this.sim.input = { ...input };
    stepSim(this.sim, dt);
    this.history.push({ end: now, dt, input: { ...input } });
    while (this.history.length && now - this.history[0].end > 2000) this.history.shift();
  }
  welcome(state) {
    if (state) restoreSim(this.sim, state);
    this.history.length = 0;
    this.lastTick = -Infinity;
    this.networkAge = 0;
    this.hasAge = false;
    this.connected = true;
  }
  reconcile(message, sentAt, now) {
    if (message.t <= this.lastTick) return false;
    this.lastTick = message.t;
    if (Number.isFinite(sentAt)) {
      // Subtract the server's wait between accepting this input and ticking.
      const rtt = Math.max(0, now - sentAt - (message.t - message.receivedAt));
      // Server movement follows inputs after the upstream trip. The snapshot
      // then travels downstream: replay both trips to reach our input timeline.
      const age = Math.min(1000, rtt);
      this.networkAge = this.hasAge ? this.networkAge + (age - this.networkAge) * .25 : age;
      this.hasAge = true;
    }
    const oldN = this.sim.n;
    if (!restoreSim(this.sim, message.state)) return false;
    const from = now - this.networkAge;
    for (const frame of this.history) {
      const dt = Math.min(frame.dt, Math.max(0, (frame.end - from) / 1000));
      if (dt <= 0) continue;
      this.sim.input = { ...frame.input };
      stepSim(this.sim, dt);
    }
    return this.sim.n !== oldN;
  }
}
