// The sample banks rendered off the main thread (AudioEngine.prepare): bankTasks is plain Float32Array maths and needs
// no audio context, so it runs here while the page loads. Each bank comes back as its sets of { chans, sr }, copied
// into buffers of their own and transferred (a channel may be a view on a larger array); the engine wraps them in
// AudioBuffers at the first click. `SR` only enters the banks as min(SR, 32000) and min(SR, 24000), so 48000 renders
// them exactly as a 44.1 or 48 kHz context would.
import { bankTasks } from './audio.js';

self.onmessage = ({ data: { SR, ww2, ww1 } }) => {
  const make = (chans, sr) => ({ chans, sr });
  const tasks = [...bankTasks(SR, make, { ww2 }), ...(ww1 ? bankTasks(SR, make, { ww1: 'only' }) : [])];
  for (const t of tasks) {
    if (!t) continue;
    const [group, key, fn] = t, v = fn(), xfer = [];
    for (const s of Array.isArray(v) ? v : [v]) {
      s.chans = s.chans.map((c) => c.slice());
      for (const c of s.chans) xfer.push(c.buffer);
    }
    self.postMessage({ group, key, v }, xfer);
  }
  self.postMessage({ done: true });
};
