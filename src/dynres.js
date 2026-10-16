// Dynamic resolution: picks the scene's render scale (0.67 to 1 of the quality preset's pixel ratio)
// so the frame keeps up with the display. The old rule (drop below 50 fps, climb back only under
// 13.5 ms) could never climb on a 60 Hz screen, where vsync holds a frame at 16.7 ms: one heavy
// barrage left the game at half resolution for good.
//
// The target is one refresh, but never faster than 60 fps (a 144 Hz screen is not a reason to blur
// the picture). Where the browser offers GPU timer queries the controller scales by what the GPU
// spends on the frame, so a slow simulation step does not cost resolution; otherwise it goes by frame
// times, remembers the scale that last failed and only retries it after a back-off, so it settles
// instead of hunting up and down.

export const MIN_SCALE = 0.67;
const WINDOW = 1.5; // seconds per decision
const SAMPLES = 512;

export class DynamicResolution {
  constructor(renderer) {
    this.scale = 1;
    this.refreshMs = 1000 / 60;
    this.gpuMs = 0; // average GPU time of the last window, 0 if unknown
    this.frameMs = 1000 / 60; // median frame time of the last window
    this._dts = new Float32Array(SAMPLES);
    this._sorted = new Float32Array(SAMPLES);
    this._n = 0;
    this._t = 0;
    this._ceiling = 1; // the scale that last proved too slow
    this._ceilingT = 0; // seconds until it may be tried again
    this._backoff = 10;
    this._sinceRaise = 1e9; // seconds since the last climb
    // GPU timer queries (WebGL2); some browsers expose them, some do not
    const gl = renderer.getContext();
    this._gl = gl;
    this._ext = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
      ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this._free = [];
    this._pending = [];
    this._active = null;
    this._gpuSum = 0;
    this._gpuN = 0;
  }

  get gpuTimed() { return !!this._ext; }

  reset() {
    this.scale = 1;
    this._ceiling = 1;
    this._ceilingT = 0;
    this._backoff = 10;
    this._sinceRaise = 1e9;
    this._n = 0;
    this._t = 0;
  }

  /** Around the frame's GPU work (the post chain renders the scene). */
  begin() {
    const ext = this._ext;
    if (!ext || this._active || this._pending.length > 4) return;
    const q = this._free.pop() ?? this._gl.createQuery();
    this._gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this._active = q;
  }
  end() {
    if (!this._active) return;
    this._gl.endQuery(this._ext.TIME_ELAPSED_EXT);
    this._pending.push(this._active);
    this._active = null;
  }
  _poll() {
    const gl = this._gl, ext = this._ext;
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this._pending.length) {
      const q = this._pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this._pending.shift();
      this._free.push(q);
      if (!disjoint) {
        this._gpuSum += ns / 1e6;
        this._gpuN++;
      }
    }
  }

  /**
   * Once per drawn frame with the real frame time in seconds. Returns true when the scale changed
   * (the caller resizes the render targets).
   */
  update(rawDt) {
    this._poll();
    if (rawDt > 0 && rawDt < 0.25 && this._n < SAMPLES) this._dts[this._n++] = rawDt * 1000;
    this._t += rawDt;
    this._ceilingT -= rawDt;
    if (this._t < WINDOW) return false;
    this._t = 0;
    const n = this._n;
    this._n = 0;
    if (n < 8) return false;
    const s = this._sorted.subarray(0, n);
    s.set(this._dts.subarray(0, n));
    s.sort();
    // the display's refresh: the quick end of the frame times, clamped to 60 to 144 Hz
    const fast = s[Math.floor(n * 0.1)];
    const r = Math.min(1000 / 60, Math.max(1000 / 144, fast));
    this.refreshMs += (r - this.refreshMs) * (r < this.refreshMs ? 0.5 : 0.1);
    this.frameMs = s[n >> 1];
    this.gpuMs = this._gpuN ? this._gpuSum / this._gpuN : 0;
    this._gpuSum = 0;
    this._gpuN = 0;

    const target = Math.max(this.refreshMs, 1000 / 60);
    const slow = this.frameMs > target * 1.2;
    const cap = this._ceilingT > 0 ? this._ceiling - 0.04 : 1; // stay below a scale that just failed
    let next = this.scale;
    if (this.gpuMs > 0) {
      // pixels cost about the square of the scale; aim the GPU at 75 % of the frame
      if (slow && this.gpuMs > target * 0.8) next = this.scale * Math.sqrt((target * 0.75) / this.gpuMs);
      else if (!slow && this.gpuMs * ((this.scale + 0.05) / this.scale) ** 2 < target * 0.7) next = Math.min(this.scale + 0.05, Math.max(cap, this.scale));
    } else if (slow) next = this.scale - 0.08;
    else if (this.frameMs < target * 1.08) next = Math.min(this.scale + 0.04, Math.max(cap, this.scale));
    next = Math.min(1, Math.max(MIN_SCALE, Math.round(next * 100) / 100));
    this._sinceRaise += WINDOW;
    if (next === this.scale) return false;
    if (next < this.scale) {
      // a scale that fails right after a climb is the limit: retry it later, later each time; a drop
      // under a load that came by itself (a barrage) keeps the short back-off
      this._backoff = this._sinceRaise <= WINDOW * 2 ? Math.min(120, this._backoff * 2) : 10;
      this._ceiling = this.scale;
      this._ceilingT = this._backoff;
    } else this._sinceRaise = 0;
    this.scale = next;
    return true;
  }
}
