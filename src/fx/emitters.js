import { runEmitter } from './artillery.js';

// A fixed pool of timed emitters (typed arrays, no allocation): things that go on or happen later
// than the burst that made them. See runEmitter in artillery.js for the types.
const F = ['type', 'when', 'dur', 'rate', 'acc', 't', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f'];

export class Emitters {
  constructor(max = 96) {
    this.max = max;
    this.n = 0;
    for (const f of F) this[f] = new Float32Array(max);
  }

  clear() { this.n = 0; }

  /** type, start delay (s), duration (s, 0 for a one-shot), rate (/s), position, and six parameters. */
  add(type, when, dur, rate, x, y, z, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else {
      // full: the one that has run longest makes room
      i = 0;
      for (let j = 1; j < this.n; j++) if (this.t[j] - this.when[j] > this.t[i] - this.when[i]) i = j;
    }
    this.type[i] = type; this.when[i] = when; this.dur[i] = dur; this.rate[i] = rate; this.acc[i] = 0; this.t[i] = 0;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.a[i] = a; this.b[i] = b; this.c[i] = c; this.d[i] = d; this.e[i] = e; this.f[i] = f;
  }

  update(dt, fx) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.t[i] += dt;
      if (this.type[i] === 0 || (this.dur[i] > 0 && this.t[i] > this.when[i] + this.dur[i])) {
        const j = --this.n;
        if (i !== j) for (const f of F) this[f][i] = this[f][j];
        continue;
      }
      if (this.t[i] < this.when[i]) continue;
      fx.curGy = this.y[i]; // the emitters sit on the ground they were placed on
      runEmitter(fx, this, i, dt);
      fx.curGy = null;
    }
  }
}
