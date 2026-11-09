import * as THREE from 'three';
import { buildCrewman, crewTier } from '../models/v/crew.js';
import { patchCrewHD, patchCrewMax, tierKey, adoptArrays, buildArrays } from '../models/v/crew_hd.js'; // (registers the 'hd' and 'max' tiers)
import { setMaxTextures } from '../models/v/crew_maxmat.js';
import { makeLayers } from '../models/v/crew_tex.js';
import { runAll } from '../models/v/crew_sdf.js';
import { patchMaterial } from '../shaderlib.js';

// The close tiers of the German crews (models/v/crew_hd.js). 'hd': the gun the player serves in person (the gunner,
// src/ww2/gunnerView.js); 'max': the lesson's battery (PLAN.md 3.4), only on pages that ask for it. render/guns.js says
// each frame which crews and figures want which tier; update() puts every figure on the best tier that is built and not
// above the one it wants, builds the rest a slice a frame (a slice of the face mesher and at most one figure a frame, so
// entering the gun never stalls a frame for long), and puts figures no longer wanted back on the standard geometry.
// Same skeleton, so the drill, the poses and the player's hidden head carry on untouched.
//
//   const hd = new CrewHD(scene, { tiers })   tiers: ['hd'] (default) or ['hd', 'max']; adds a hidden primer figure a
//                                             tier, so the warm-up draw (render/warmup.js) compiles its shader at load
//   hd.want(crew, on)              every frame for every crew (GunCrew or VCrew: anything with men[].fig): all its men hd
//   hd.wantFig(fig, tier)          every frame for a figure whose tier is decided by itself, not its crew: 'max' | 'hd' |
//                                  null (the standard tier)
//   hd.update()                    once a frame after the wants
//   hd.prebuild(figs) -> Promise   builds every tier figure these men can want (each man his own face, kit and tints:
//                                  assignMen) in module workers, behind the loading screen; adds a hidden holder mesh a
//                                  geometry so render/warmup.js uploads them; resolves when all are in the caches
//   hd.count                       men on a close tier now (hd.counts: per tier)

const BUDGET = 6; // ms a frame for the face mesher
const RANK = { hd: 1, max: 2 };

// Each man of a crew his own: the order of a gun's men (crew spots) picks the face, the irises and the work gloves (the
// loaders, rammers and ammunition men of the Moerser 18's crew: the Norway photographs), a hash of gun and man his
// tints (skin a shade lighter or darker, more or less stubble, ruddier or paler, dirtier). The second gun's men share
// the first's shapes (one geometry a role) and differ in their tints and eyes. The same man looks the same every visit.
const FACE_OF = [3, 0, 2, 4, 1, 0, 2, 3, 1, 4];
const IRIS = [[0.235, 0.305, 0.36], [0.19, 0.105, 0.052], [0.26, 0.275, 0.18], [0.32, 0.2, 0.085], [0.1, 0.055, 0.032]];
const hash01 = (x) => { let h = Math.imul((x * 2654435761) | 0, 0x9e3779b1) ^ 0x85ebca6b; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
export function assignMen(figs) {
  let gun = -1, i = 0, parent;
  for (const fig of figs) {
    if (!fig) continue;
    const p = fig.root?.parent ?? null;
    if (gun < 0 || p !== parent) { gun++; i = 0; parent = p; }
    if (!fig.man) {
      const h = (k) => hash01(gun * 977 + i * 131 + k * 7919);
      fig.man = {
        id: `${gun}:${i}`, face: FACE_OF[i % 10], gloves: i % 10 >= 4,
        uMan: [0.93 + 0.13 * h(1), 0.55 + 0.9 * h(2), h(3), 0.04 + 0.14 * h(4)],
        uIris: [...IRIS[(i * 3 + gun * 2) % 5], 1],
      };
    }
    i++;
  }
  return figs;
}

export class CrewHD {
  constructor(scene, { tiers = ['hd'] } = {}) {
    this.scene = scene;
    this.pending = new Set(); // tier figures a worker is building (not to be built here as well)
    this.names = tiers.filter((t) => RANK[t] && crewTier(t));
    this.tier = crewTier('hd'); // (the hd tier, as before)
    this.T = Object.fromEntries(this.names.map((t) => [t, crewTier(t)]));
    this.wanted = new Set();
    this.figWant = new Map();
    this.on = new Set(); // figures on a close tier
    this.count = 0;
    this.counts = { hd: 0, max: 0 };
    this.primers = [];
    if (!this.tier) return;
    patchCrewHD(patchMaterial);
    if (this.T.max) patchCrewMax(patchMaterial);
    // the primers: a standard figure with each tier's material, never visible (warmUp draws hidden objects once)
    for (const t of this.names) {
      const fig = buildCrewman({ outfit: 'german44' });
      fig.mesh.material = this.T[t].material(null);
      fig.root.visible = false;
      fig.root.name = `crew-${t}-primer`;
      scene?.add(fig.root);
      this.primers.push(fig);
    }
    this.primer = this.primers[0];
  }

  want(crew, on) {
    if (on && this.tier && crew?.men?.length) this.wanted.add(crew);
  }

  wantFig(fig, tier) {
    if (fig && this.tier) this.figWant.set(fig, RANK[tier] && this.T[tier] ? tier : null);
  }

  // the tier figure `fig` should be on now: the wanted one if built, else the best built one below it
  pick(fig, want, budget) {
    for (let r = RANK[want]; r >= 1; r--) {
      const name = r === 2 ? 'max' : 'hd', T = this.T[name];
      if (!T || !T.covers(fig.outfit)) continue;
      if (fig.tier === name || T.has(fig.outfit, fig)) return name;
      if (this.pending.has(`${name}|${tierKey(name, fig.outfit, name === 'max' ? fig.man : null)}`)) continue; // (a worker has it)
      if (budget.built || this.failed?.has(`${name}|${fig.outfit.key}`)) continue; // one new figure a frame
      budget.built = true;
      try {
        if (T.step(fig.outfit, BUDGET, fig)) return name;
      } catch (e) { // a figure that cannot be built stays on what it has; the frame goes on
        (this.failed ??= new Set()).add(`${name}|${fig.outfit.key}`);
        console.warn(`crew ${name} figure:`, e.message);
      }
    }
    return null;
  }

  update() {
    if (!this.tier) return;
    const want = new Map();
    for (const crew of this.wanted) for (const m of crew.men) if (m.fig) want.set(m.fig, 'hd');
    for (const [fig, t] of this.figWant) { if (t) want.set(fig, t); else want.delete(fig); } // (the figure's own want wins)
    // figures no longer wanted go back to the standard tier at once
    for (const fig of this.on) if (!want.has(fig)) { if (fig.tier) fig.setTier(null); this.on.delete(fig); }
    const budget = { built: false };
    this.counts.hd = this.counts.max = 0;
    for (const [fig, t] of want) {
      const name = this.pick(fig, t, budget);
      if (name && fig.tier !== name && fig.setTier(name)) this.on.add(fig);
      else if (name) this.on.add(fig);
      if (fig.tier === 'hd' || fig.tier === 'max') this.counts[fig.tier]++;
    }
    this.count = this.counts.hd + this.counts.max;
    this.wanted.clear();
    this.figWant.clear();
  }

  // Every tier figure these men can want, built in module workers (crewWorker.js: the same code, so the same arrays)
  // while the loading screen is up; without workers on this thread, a figure at a time between frames.
  async prebuild(figs) {
    if (!this.tier) return 0;
    const t0 = performance.now();
    assignMen(figs);
    const jobs = new Map();
    for (const fig of figs) {
      if (!fig?.outfit) continue;
      for (const t of this.names) {
        const T = this.T[t], man = t === 'max' ? fig.man : null;
        if (!T.covers(fig.outfit) || T.has(fig.outfit, fig)) continue;
        const key = `${t}|${tierKey(t, fig.outfit, man)}`;
        if (!jobs.has(key)) jobs.set(key, { key, tier: t, o: fig.outfit, man });
      }
      if (this.T.max && fig.man) this.T.max.material(fig); // (each man's material: the base's program, his uniforms)
    }
    const list = [...jobs.values()];
    for (const j of list) this.pending.add(j.key);
    try {
      // the max tier's texture layers in a worker of their own (1024 a side; 512 for the headless tools)
      const tex = this.T.max && !this.texDone ? this.textures(globalThis.navigator?.webdriver ? 512 : 1024) : null;
      await Promise.all([this.runJobs(list), tex]);
    } finally {
      for (const j of list) this.pending.delete(j.key);
    }
    this.hold(figs);
    this.prebuildMs = performance.now() - t0;
    return this.prebuildMs;
  }

  async runJobs(list) {
    if (!list.length) return;
    // jobs sharing a face and a headgear go to the same worker (its meshed face is reused)
    const groups = new Map();
    for (const j of list) {
      const g = `${j.o.headgear}|${j.man?.face ?? j.o.skin}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(j);
    }
    const n = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1, groups.size));
    const lanes = Array.from({ length: n }, () => []);
    [...groups.values()].sort((a, b) => b.length - a.length).forEach((g) => lanes.reduce((a, b) => (a.length <= b.length ? a : b)).push(...g));
    await Promise.all(lanes.map((lane) => this.lane(lane)));
  }

  async lane(jobs) {
    let w = null;
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('../models/v/crewWorker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
    for (const j of jobs) {
      let data = null;
      if (w) {
        data = await new Promise((resolve) => {
          const done = (e) => { w.removeEventListener('message', done); w.removeEventListener('error', fail); resolve(e.data?.error ? null : e.data?.data ?? null); };
          const fail = () => { w.removeEventListener('message', done); w.removeEventListener('error', fail); resolve(null); };
          w.addEventListener('message', done);
          w.addEventListener('error', fail);
          w.postMessage({ id: j.key, tier: j.tier, o: j.o, man: j.man });
        });
        if (!data) { w.terminate(); w = null; } // (a worker that failed: the rest of its lane is built here)
      }
      if (!data) {
        await new Promise((r) => setTimeout(r, 0));
        try { data = buildArrays(j.tier, j.o, j.man); } catch (e) { console.warn(`crew ${j.tier} figure:`, e.message); }
      }
      if (data) adoptArrays(j.tier, data);
    }
    w?.terminate();
  }

  async textures(N) {
    this.texDone = true;
    let L = null;
    try {
      if (typeof Worker !== 'undefined') {
        const w = new Worker(new URL('../models/v/crewWorker.js', import.meta.url), { type: 'module' });
        L = await new Promise((resolve) => {
          w.onmessage = (e) => resolve(e.data?.tex ?? null);
          w.onerror = () => resolve(null);
          w.postMessage({ id: 'tex', tex: N });
        });
        w.terminate();
      }
      if (!L) { await new Promise((r) => setTimeout(r, 0)); L = runAll(makeLayers(N)); }
      setMaxTextures(L);
    } catch (e) { console.warn('crew max textures:', e.message); }
  }

  // a hidden mesh a built geometry (with its man's material), so render/warmup.js uploads it behind the loading screen
  hold(figs) {
    if (!this.scene || !this.primer) return;
    this.holders ??= new Map();
    for (const fig of figs) for (const t of this.names) {
      if (!fig?.outfit || !this.T[t].covers(fig.outfit)) continue;
      const k = `${t}|${tierKey(t, fig.outfit, t === 'max' ? fig.man : null)}|${t === 'max' ? fig.man?.id ?? '' : ''}`;
      if (this.holders.has(k) || !this.T[t].has(fig.outfit, fig)) continue;
      const m = new THREE.SkinnedMesh(this.T[t].geometry(fig.outfit, fig), this.T[t].material(fig));
      m.bind(this.primer.mesh.skeleton, this.primer.mesh.bindMatrix);
      m.visible = false;
      m.name = 'crew-tier-holder';
      this.primer.root.add(m);
      this.holders.set(k, m);
    }
  }

}
