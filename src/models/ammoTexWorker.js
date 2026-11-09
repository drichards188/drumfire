// The Mörser 18 ammunition's atlases drawn off the main thread (ammo_mrs18.js prebuildAmmoAsync): the same code as the
// main thread's (ammo_tex.js), on OffscreenCanvas, so the pixels are the same; the bitmaps come back transferred.
//   in:  { id, scale }   out: { id, out: { [atlas]: { [key]: { bitmap, srgb, repeat, aniso } } }, ms } or { id, error }
import { drawAtlasesForTransfer } from './ammo_tex.js';

self.onmessage = (e) => {
  const { id, scale } = e.data;
  try {
    const t0 = performance.now();
    const { out, transfer } = drawAtlasesForTransfer(scale);
    self.postMessage({ id, out, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
