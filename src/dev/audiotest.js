// Live smoke test of the audio engine: every API call, world sounds at several distances, shells in
// flight (passing, receding, ridden), the close-blast deafening and the ambience. Reports exceptions and the voice
// counts in window.__audioReport; buttons on the page let a human listen (click one first to unlock audio).
import * as THREE from 'three';
import { AudioEngine } from '../audio.js';

const out = document.getElementById('out');
const report = (window.__audioReport = { errors: [], steps: [] });
const step = (name, fn) => {
  try {
    fn();
    report.steps.push(name);
  } catch (e) {
    report.errors.push(`${name}: ${e.message}`);
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const audio = new AudioEngine();
window.__audio = audio;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1e5);
camera.position.set(0, 3, 0);
camera.updateMatrixWorld();
const P = (x, y, z) => new THREE.Vector3(x, y, z);
let shells = [];
const tick = (n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    for (const s of shells) if (s.alive) s.pos.addScaledVector(s.vel, dt);
    audio.update(dt, camera);
  }
};

// buttons to hear things (the dev server page: any click starts the audio)
const bar = document.getElementById('buttons');
const btn = (label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => (audio.start(), fn());
  bar?.append(b);
};
const live = async (ms, fn) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    fn?.((performance.now() - t0) / 1000);
    tick(1, 1 / 60);
    await wait(16);
  }
};
for (const [cal, name] of [[2.95, '2.95in'], [5, '60-pdr'], [6, '6in'], [9.2, '9.2in'], [15, '15in']]) for (const d of [60, 400, 3000, 9000]) btn(`gun ${name} ${d} m`, () => audio.gun(P(d, 0, -d / 3), cal));
for (const cal of [6, 9.2, 15]) for (const d of [30, 300, 3000]) btn(`burst ${cal}in ${d} m`, () => audio.burst(P(0, 0, -d), cal, { fuze: 'impact' }));
btn('shrapnel 5in 100 m', () => audio.burst(P(0, 40, -100), 5, { fuze: 'air' }));
btn('own 15in shell passes (ride along)', () => {
  const s = { pos: P(0, 3, 0), vel: P(40, 140, -380), alive: true, calibre: 15, own: true };
  shells.push(s);
  audio.shell(s);
  setTimeout(() => (s.alive = false), 6000);
  live(6000);
});
btn('enemy 9.2in incoming', () => {
  const s = { pos: P(300, 1200, -3000), vel: P(-30, -170, 280), alive: true, calibre: 9.2, own: false };
  shells.push(s);
  audio.shell(s);
  audio.incoming(s);
  live(9000, () => {
    if (s.pos.y < 0 && s.alive) {
      s.alive = false;
      audio.burst(P(s.pos.x, 0, s.pos.z), 9.2);
    }
  });
});
for (const st of ['trolley', 'crane', 'ram', 'breech', 'screw', 'clang', 'cartridge', 'case', 'ready', 'fire', 'whistle']) btn(`load ${st}`, () => audio.load(st, P(6, 1, -3), 15));
btn('cookOff 3', () => audio.cookOff(P(40, 0, -120), 3));
btn('flare very', () => audio.flare(P(20, 5, -20), 'very'));
btn('flare rocket', () => audio.flare(P(20, 5, -20), 'rocket'));
for (const n of ['phone', 'wireless', 'click', 'paper', 'bell', 'whistle']) btn(`ui ${n}`, () => audio.ui(n));
btn('drumfire 0.2', () => audio.setAmbience({ drumfire: 0.2 }));
btn('drumfire 1 + rain', () => audio.setAmbience({ drumfire: 1, rain: 0.7, wind: 0.6 }));
btn('ambience off', () => audio.setAmbience({ drumfire: 0, rain: 0, wind: 0 }));

(async () => {
  step('start', () => audio.start());
  await wait(300);
  for (let i = 0; i < 1200 && audio.pending.length; i++) await wait(100);
  await wait(1500); // recordings decode and are laid over the banks
  const want = ['gun_light', 'gun_field', 'gun_med', 'gun_heavy', 'gun_huge', 'burst_ground_light', 'burst_ground_field', 'burst_ground_med', 'burst_ground_heavy', 'burst_ground_huge', 'burst_air_light', 'burst_air_field', 'burst_air_med', 'burst_air_heavy', 'loop', 'load', 'flare', 'ui', 'slap', 'tremor', 'thud', 'cook'];
  report.missingBanks = want.filter((g) => !audio.bank[g]);
  tick(5);

  // guns of every class at several distances (more than the cap, to exercise stealing)
  for (const cal of [2.95, 5, 6, 9.2, 15]) for (const d of [25, 300, 2500, 12000]) step(`gun ${cal} ${d}`, () => audio.gun(P(d, 1, -d * 0.4), cal));
  for (const cal of [3, 6, 9.2, 15]) for (const d of [20, 200, 2000, 9000]) {
    step(`burst ${cal} ${d}`, () => audio.burst(P(-d * 0.3, 0, -d), cal));
    step(`burst air ${cal} ${d}`, () => audio.burst(P(d * 0.3, 60, -d), cal, { fuze: 'air' }));
  }
  step('burst opts', () => audio.burst(P(5, 0, 5), 6, { ground: false }));
  step('burst none', () => audio.burst(P(50, 0, 5), 6));
  step('cookOff', () => audio.cookOff(P(80, 0, -200), 2));
  step('cookOff far', () => audio.cookOff(P(2000, 0, -2000), 4));
  tick(60);
  await wait(300);

  // a 15-inch beside the listener: it must deafen and then recover
  let shocked = 0;
  audio.onShock = () => shocked++;
  step('gun 15 near', () => audio.gun(P(15, 1, -10), 15));
  await live(500);
  report.deafAfterNear15 = +audio.deaf.toFixed(2);
  report.shocked = shocked;
  await live(2500);
  report.deafLater = +audio.deaf.toFixed(2);

  // shells: one riding with the camera, one passing, one coming down
  shells = [
    { pos: P(0, 3, 0), vel: P(0, 150, -400), alive: true, calibre: 15, own: true },
    { pos: P(-1500, 500, -200), vel: P(380, -20, 0), alive: true, calibre: 9.2, own: false },
    { pos: P(200, 900, -2200), vel: P(-30, -230, 260), alive: true, calibre: 6, own: false },
    { pos: P(600, 300, 100), vel: P(-20, 40, -400), alive: true, calibre: 5, own: true },
  ];
  for (const s of shells) step('shell', () => audio.shell(s));
  step('incoming', () => audio.incoming(shells[2]));
  step('shell twice', () => audio.shell(shells[0]));
  let peakVoices = 0;
  for (let i = 0; i < 180; i++) {
    tick(1);
    peakVoices = Math.max(peakVoices, audio.shellVoices.filter((v) => v.sh).length);
    await wait(16);
  }
  report.shellVoices = peakVoices;
  shells[2].alive = false;
  step('burst after incoming', () => audio.burst(P(shells[2].pos.x, 0, shells[2].pos.z), 6));
  for (const s of shells) s.alive = false;
  tick(10);
  report.shellsTracked = audio.shells.size;
  step('shell null', () => audio.shell(null));
  step('incoming null', () => audio.incoming(null));

  for (const st of ['trolley', 'crane', 'ram', 'breech', 'screw', 'clang', 'cartridge', 'case', 'ready', 'fire', 'whistle', 'bogus']) for (const k of [15, 'bl92', 'bl60', undefined]) step(`load ${st} ${k}`, () => audio.load(st, P(5, 1, -4), k));
  for (const k of ['very', 'star', 'rocket', undefined]) step(`flare ${k}`, () => audio.flare(P(30, 8, -40), k));
  for (const n of ['phone', 'wireless', 'click', 'paper', 'bell', 'whistle', 'bogus']) step(`ui ${n}`, () => audio.ui(n));
  tick(30);

  // ambience
  step('ambience', () => audio.setAmbience({ drumfire: 0.8, rain: 0.6, wind: 0.5 }));
  await live(5000);
  report.ambNow = { ...audio.ambNow };
  step('ambience off', () => audio.setAmbience({ drumfire: 0, rain: 0, wind: 0 }));
  step('mute', () => (audio.toggleMute(), audio.toggleMute()));
  step('volume', () => audio.setVolume(0.7));
  await wait(1500);
  tick(60);
  report.state = audio.ctx?.state;
  report.banks = Object.fromEntries(Object.entries(audio.bank).map(([g, b]) => [g, Object.keys(b).length]));
  report.pending = audio.pending.length;
  report.voices = { pos: audio.posVoices, direct: audio.directVoices, inFlight: audio.inFlight.length };
  report.recordings = audio.recordingsInUse ?? null;
  report.stepCount = report.steps.length;
  delete report.steps;
  report.ok = !report.errors.length && !report.missingBanks.length && report.deafAfterNear15 > 0.3 && report.deafLater < report.deafAfterNear15 && report.shellVoices > 0 && report.shellsTracked === 0 && report.pending === 0;
  report.done = true;
  out.textContent = JSON.stringify(report, null, 1);
})();
