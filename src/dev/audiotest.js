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
audio.keepSynth = true; // the A/B button: the synthesized guns kept beside the recorded ones
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
  return b;
};
// world sounds travel and land in update(), which the smoke test below stops calling once it is done
let running = false;
bar?.addEventListener('click', () => {
  if (running) return;
  running = true;
  setInterval(() => audio.update(1 / 60, camera), 16);
});
const live = async (ms, fn) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    fn?.((performance.now() - t0) / 1000);
    tick(1, 1 / 60);
    await wait(16);
  }
};
// A/B: the guns built from recordings against the synthesized ones they replace (ready a few seconds after the first click)
const ab = btn('guns: recorded (click for synthesized)', () => {
  const now = audio.swapGuns();
  ab.textContent = `guns: ${now} (click for ${now === 'recorded' ? 'synthesized' : 'recorded'})`;
});
btn('6in battery salvo 300 m', () => [0, 0.35, 0.8, 1.1].forEach((t, i) => setTimeout(() => audio.gun(P(280 + i * 12, 0, -100), 6), t * 1000)));
btn('15in beside you (25 m)', () => audio.gun(P(20, 0, -15), 15));
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
// WW2 (German side)
const ww2Move = (obj, vel, ms) => {
  live(ms, (t) => {
    obj.pos.addScaledVector(vel, 1 / 60);
    if (t * 1000 > ms - 100) obj.alive = false;
  });
};
for (const cal of [23.6, 31.5]) for (const d of [80, 1500, 9000]) btn(`gun ${cal}in ${d} m`, () => audio.gun(P(d, 0, -d / 3), cal));
for (const d of [200, 3000]) btn(`burst 31.5in ${d} m`, () => audio.burst(P(0, 0, -d), 31.5));
btn('V-2 impact 2 km', () => audio.burst(P(800, 0, -2000), 26, { fuze: 'v2' }));
btn('Nebelwerfer rocket 30 m', () => audio.rocket(P(20, 1, -25)));
btn('Nebelwerfer ripple 30 m', () => audio.rocket(P(20, 1, -25), { n: 6, gap: 1.6 }));
btn('Nebelwerfer ripple 3 km', () => audio.rocket(P(2000, 1, -2200), { n: 6 }));
btn('rocket flight passing', () => {
  const s = { pos: P(-1200, 300, -100), vel: P(330, 0, 0), alive: true, calibre: 6.24, kind: 'nbw41', own: true };
  shells.push(s);
  audio.shell(s);
  setTimeout(() => (s.alive = false), 7000);
  live(7000);
});
btn('V-1 launch 60 m', () => audio.v1Launch(P(40, 0, -45)));
btn('V-1 flies over, cuts out', () => {
  const s = { pos: P(-3000, 600, -200), vel: P(180, 0, 0), alive: true, calibre: 22, kind: 'v1', own: false };
  shells.push(s);
  audio.shell(s);
  live(26000, (t) => {
    if (t > 18 && !s.engineOff) (s.engineOff = true), s.vel.set(60, -110, 0);
    if (s.pos.y < 0 && s.alive) (s.alive = false), audio.burst(P(s.pos.x, 0, s.pos.z), 22);
  });
});
btn('V-2 pre-stage 300 m', () => audio.v2Launch(P(200, 0, -220), 0));
btn('V-2 main stage, follow', () => {
  const o = { pos: P(200, 0, -220), alive: true };
  audio.v2Launch(o.pos, 1, o);
  live(40000, (t) => o.pos.set(200, 4 * t * t * 1.5, -220 - 2 * t * t));
});
btn('V-2 main stage, no object', () => audio.v2Launch(P(200, 0, -220), 1));
btn('Typhoon low pass', () => {
  const o = { pos: P(-3000, 80, -150), alive: true };
  audio.aircraft(o);
  ww2Move(o, P(170, 0, 0), 30000);
});
btn('siren on', () => audio.siren(true));
btn('siren off', () => audio.siren(false));
for (const n of ['feldfernsprecher', 'funk']) btn(`ui ${n}`, () => audio.ui(n));
btn('drumfire 0.2', () => audio.setAmbience({ drumfire: 0.2 }));
btn('drumfire 1 + rain', () => audio.setAmbience({ drumfire: 1, rain: 0.7, wind: 0.6 }));
btn('ambience off', () => audio.setAmbience({ drumfire: 0, rain: 0, wind: 0 }));

(async () => {
  step('start', () => audio.start());
  await wait(300);
  for (let i = 0; i < 1200 && audio.pending.length; i++) await wait(100);
  report.britishBanksOnly = !audio.bank.rocket && !audio.bank.gun_colossal && !audio.bank.loop?.buzz;
  step('enableWW2', () => audio.enableWW2());
  for (let i = 0; i < 1200 && audio.pending.length; i++) await wait(100);
  await wait(1500); // recordings decode and are laid over the banks
  const want = ['gun_light', 'gun_field', 'gun_med', 'gun_heavy', 'gun_huge', 'burst_ground_light', 'burst_ground_field', 'burst_ground_med', 'burst_ground_heavy', 'burst_ground_huge', 'burst_air_light', 'burst_air_field', 'burst_air_med', 'burst_air_heavy', 'loop', 'load', 'flare', 'ui', 'slap', 'tremor', 'thud', 'cook', 'gun_colossal', 'burst_ground_colossal', 'rocket', 'v1', 'v2'];
  report.missingBanks = want.filter((g) => !audio.bank[g]);
  for (const k of ['moan', 'buzz', 'v2', 'sabre', 'siren']) if (!audio.bank.loop?.[k]) report.missingBanks.push('loop.' + k);
  for (const k of ['feld', 'funk']) if (!audio.bank.ui?.[k]) report.missingBanks.push('ui.' + k);
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

  // an own shell leaving a gun 200 m off: its flight voice waits for the muzzle's sound (200 / 343 = 0.58 s)
  const own = { pos: P(200, 3, 0), vel: P(0, 300, -400), alive: true, calibre: 9.2, own: true };
  shells = [own];
  step('own shell', () => audio.shell(own));
  const fired = audio.ctx.currentTime;
  let heardAt = null;
  await live(1500, () => {
    if (heardAt == null && audio.shellVoices.some((v) => v.sh === own)) heardAt = audio.ctx.currentTime - fired;
  });
  own.alive = false;
  tick(2);
  report.ownShellHeardAfter = heardAt == null ? null : +heardAt.toFixed(2);

  for (const st of ['trolley', 'crane', 'ram', 'breech', 'screw', 'clang', 'cartridge', 'case', 'ready', 'fire', 'whistle', 'bogus']) for (const k of [15, 'bl92', 'bl60', undefined]) step(`load ${st} ${k}`, () => audio.load(st, P(5, 1, -4), k));
  for (const k of ['very', 'star', 'rocket', undefined]) step(`flare ${k}`, () => audio.flare(P(30, 8, -40), k));
  for (const n of ['phone', 'wireless', 'click', 'paper', 'bell', 'whistle', 'bogus', 'feldfernsprecher', 'funk']) step(`ui ${n}`, () => audio.ui(n));
  tick(30);

  // WW2: colossal guns and bursts, the V-2's arrival, rockets, launches
  for (const cal of [23.6, 31.5]) for (const d of [40, 2000, 14000]) {
    step(`gun ${cal} ${d}`, () => audio.gun(P(d, 1, -d * 0.4), cal));
    step(`burst ${cal} ${d}`, () => audio.burst(P(-d * 0.3, 0, -d), cal, { fuze: 'delay' }));
  }
  step('burst v2', () => audio.burst(P(300, 0, -900), 26, { fuze: 'v2' }));
  step('burst v2 kind', () => audio.burst(P(3000, 0, -900), 26, { kind: 'v2' }));
  step('rocket', () => audio.rocket(P(15, 1, -20)));
  step('rocket ripple', () => audio.rocket(P(1500, 1, -2000), { n: 6, gap: 1.6 }));
  step('v1Launch', () => audio.v1Launch(P(50, 0, -40)));
  step('v2Launch pre', () => audio.v2Launch(P(300, 0, -200), 0));
  step('v2Launch main', () => audio.v2Launch(P(300, 0, -200), 1));
  const v2obj = { pos: P(300, 0, -200), alive: true };
  step('v2Launch follow', () => audio.v2Launch(v2obj.pos, 1, v2obj));
  const jabo = { pos: P(-600, 80, -100), alive: true };
  step('aircraft', () => audio.aircraft(jabo));
  step('aircraft twice', () => audio.aircraft(jabo));
  step('siren on', () => audio.siren(true));
  const v1 = { pos: P(-900, 500, -100), vel: P(180, 0, 0), alive: true, calibre: 22, kind: 'v1', own: false };
  const nbw = { pos: P(0, 50, -300), vel: P(40, 120, -300), alive: true, calibre: 6.24, kind: 'nbw41', own: true };
  const v2s = { pos: P(0, 9000, -2000), vel: P(0, -1500, 0), alive: true, calibre: 26, kind: 'v2', own: true };
  const gus = { pos: P(0, 800, -800), vel: P(100, 50, -450), alive: true, calibre: 31.5, kind: 'gustav', own: true };
  shells = [v1, nbw, v2s, gus];
  for (const s of shells) step('shell ' + s.kind, () => audio.shell(s));
  step('incoming v2', () => audio.incoming(v2s));
  report.v2Ignored = !audio.shells.has(v2s);
  const buzzGain = () => Math.max(0, ...audio.shellVoices.filter((v) => v.sh === v1).map((v) => v.parts.buzz?.g.gain.value ?? 0));
  let moverPeak = 0, buzzOn = 0;
  for (let i = 0; i < 150; i++) {
    jabo.pos.x += 170 / 60;
    v2obj.pos.y += 0.5 * i / 60;
    tick(1);
    moverPeak = Math.max(moverPeak, audio.movers.filter((m) => m.src).length);
    buzzOn = Math.max(buzzOn, buzzGain());
    await wait(16);
  }
  report.ww2 = { moverPeak, buzzOn: +buzzOn.toFixed(3), voicesWithMoan: audio.shellVoices.filter((v) => v.parts.moan).length };
  // the V-1's engine cuts: its buzz must stop once the silence has travelled to the listener (~3 s here)
  v1.engineOff = true;
  const dCut = Math.hypot(v1.pos.x, v1.pos.y - 3, v1.pos.z);
  for (let i = 0; i < Math.ceil((dCut / 343 + 0.6) * 60); i++) {
    tick(1);
    await wait(16);
  }
  report.ww2.buzzAfterCut = +buzzGain().toFixed(3);
  step('siren off', () => audio.siren(false));
  jabo.alive = false;
  v2obj.alive = false;
  for (const s of shells) s.alive = false;
  for (let i = 0; i < 240; i++) {
    tick(1);
    await wait(16);
  }
  report.ww2.moversAfter = audio.movers.length;
  report.ww2.shellsAfter = audio.shells.size;

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
  report.recordedGuns = [...audio.recorded];
  report.stepCount = report.steps.length;
  delete report.steps;
  report.ok = !report.errors.length && !report.missingBanks.length && report.deafAfterNear15 > 0.3 && report.deafLater < report.deafAfterNear15 && report.shellVoices > 0 && report.shellsTracked === 0 && report.pending === 0 &&
    report.britishBanksOnly && report.v2Ignored && report.ww2.moverPeak > 0 && report.ww2.buzzOn > 0.05 && report.ww2.buzzAfterCut < 0.01 && report.ww2.voicesWithMoan > 0 && report.ww2.moversAfter === 0 && report.ww2.shellsAfter === 0 &&
    report.ownShellHeardAfter > 0.45 && report.ownShellHeardAfter < 0.8 &&
    // with the guns' recordings decoded, every gun is built from them (the WW2 colossal one too)
    (!report.recordings?.includes('gun76') || ['light', 'field', 'med', 'heavy', 'huge', 'colossal'].every((c) => report.recordedGuns.includes('gun_' + c)));
  report.done = true;
  out.textContent = JSON.stringify(report, null, 1);
})();
