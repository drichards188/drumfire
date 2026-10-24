// The sample banks rendered off the main thread (AudioEngine.prepare): bankTasks is plain Float32Array maths and needs
// no audio context, so it runs here while the page loads. Each bank comes back as its sets of { chans, sr }, copied
// into buffers of their own and transferred (a channel may be a view on a larger array); the engine makes AudioBuffers
// of them as they arrive. `SR` only enters the banks as min(SR, 32000) and min(SR, 24000), so 48000 renders them
// exactly as a 44.1 or 48 kHz context would. A second job (prepareRecordings) brings the recordings, decoded:
// everything built from them (recordingTasks) comes back marked `over`, to take the synthesized banks' places; the
// synthesized takes the recordings are laid under are kept here from the first job for that.
import { bankTasks, recordingTasks } from './audio.js';

const kept = {}; // group -> key -> [{ chans, sr }] of the first job, for recordingTasks' synth()
const KEEP = /^(gun_|burst_ground_|thud$)/;

self.onmessage = ({ data: { SR, ww2, ww1, rec, classes, keepSynth } }) => {
  const make = (chans, sr) => ({ chans, sr });
  const synth = (group, key) => kept[group]?.[key]?.map((s) => ({ data: s.chans[0], sr: s.sr })) ?? null;
  const tasks = rec ? recordingTasks(SR, make, rec, synth, classes, { keepSynth }) : [...bankTasks(SR, make, { ww2 }), ...(ww1 ? bankTasks(SR, make, { ww1: 'only' }) : [])];
  for (const t of tasks) {
    if (!t) continue;
    const [group, key, fn, over = false] = t, v = fn(), xfer = [];
    if (!rec && KEEP.test(group)) (kept[group] ||= {})[key] = (Array.isArray(v) ? v : [v]).map((s) => ({ chans: s.chans, sr: s.sr }));
    for (const s of Array.isArray(v) ? v : [v]) {
      s.chans = s.chans.map((c) => c.slice());
      for (const c of s.chans) xfer.push(c.buffer);
    }
    self.postMessage({ group, key, v, over }, xfer);
  }
  self.postMessage({ done: true });
};
