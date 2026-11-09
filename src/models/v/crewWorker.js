// The crew figures' builder off the main thread (render/crewhd.js prebuild): the same code as the main thread's
// (crew_hd.js buildArrays, crew_tex.js makeLayers), so its arrays are the same to the bit; they come back transferred.
//   in:  { id, tier: 'hd' | 'max', o (crew.js options()), man }   out: { id, data } or { id, error }
//   in:  { id, tex: N }  (the max tier's texture layers, N x N)    out: { id, tex: { A, N, size, layers } }
import { buildArrays } from './crew_hd.js';
import { makeLayers } from './crew_tex.js';
import { runAll } from './crew_sdf.js';

self.onmessage = (e) => {
  const { id, tier, o, man, tex } = e.data;
  try {
    const t0 = performance.now();
    if (tex) {
      const L = runAll(makeLayers(tex));
      self.postMessage({ id, tex: L, ms: performance.now() - t0 }, [L.A.buffer, L.N.buffer]);
      return;
    }
    const data = buildArrays(tier, o, man, false);
    const transfer = data ? [...Object.values(data.attrs).map((a) => a[0].buffer), data.index.buffer] : [];
    self.postMessage({ id, data, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
