import * as THREE from 'three';
import { Mesher, disposeGroup } from './mesher.js';
import { worldMats } from './mats.js';
import trench from './trenches.js';
import wire from './wire.js';
import battery from './battery.js';
import rails from './rails.js';
import roads from './roads.js';
import ruins from './ruins.js';
import scars from './scars.js';

// The world dressing: everything built on the ground that is not a gun, a target or a person.
//   const world = buildWorld(scene, terrain);  world.update(dt, camera);
// Detail is built in 256 m tiles around the camera, one (tile, module) job at a time inside a time budget,
// and dropped again when the camera leaves; each module may also give a persistent coarse "far" group.
// Modules: { name, range: [lod0 distance, lod1 distance], init(ctx), items(i, j), build(mesher, items, i, j, lod, ctx), far?(ctx), onTile?(i, j, lod) }.

export { CUTAWAY } from './mats.js';
export const TILE = 256;
const MODULES = [trench, wire, battery, rails, roads, ruins];

export function buildWorld(scene, terrain, { ww2 = false } = {}) {
  const modules = ww2 ? MODULES : [...MODULES, scars];
  const ctx = { h: (x, z) => terrain.heightAt(x, z), mats: worldMats(), terrain, scene };
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const groups = { far: new THREE.Group(), tiles: new THREE.Group() };
  groups.far.name = 'world-far';
  groups.tiles.name = 'world-tiles';
  root.add(groups.far, groups.tiles);
  for (const m of modules) {
    m.init(ctx);
    const f = m.far?.(ctx);
    if (f) groups.far.add(f);
  }

  const tiles = new Map(); // 'i,j' -> { i, j, parts: Map(module name -> { group, lod }) }
  let queue = [], planT = 0, built = 0, tris = 0, first = true;
  const budget = 7; // ms per frame for building

  const lodFor = (m, d, cur) => {
    const [r0, r1] = m.range;
    if (cur === 0 && d < r0 * 1.15) return 0;
    if (d < r0) return 0;
    if (cur === 1 && d < r1 * 1.15) return 1;
    return d < r1 ? 1 : -1;
  };

  function plan(camera) {
    const cx = camera.position.x, cz = camera.position.z, cy = Math.max(0, camera.position.y - terrain.heightAt(cx, cz));
    const R = Math.max(...modules.map((m) => m.range[1])) * 1.2;
    const i0 = Math.floor((cx - R) / TILE), i1 = Math.floor((cx + R) / TILE), j0 = Math.floor((cz - R) / TILE), j1 = Math.floor((cz + R) / TILE);
    const q = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const bx = Math.max(i * TILE - cx, 0, cx - (i + 1) * TILE), bz = Math.max(j * TILE - cz, 0, cz - (j + 1) * TILE);
      const d = Math.hypot(bx, bz, cy * 0.8);
      const k = i + ',' + j;
      let t = tiles.get(k);
      for (const m of modules) {
        const items = m.items(i, j);
        if (!items) continue;
        const cur = t?.parts.get(m.name)?.lod ?? -1;
        const want = lodFor(m, d, cur);
        if (want !== cur) q.push({ i, j, m, lod: want, d, items });
      }
    }
    // tiles that drifted out of the planning window go too
    for (const [k, t] of tiles) {
      if (t.i >= i0 && t.i <= i1 && t.j >= j0 && t.j <= j1) continue;
      for (const [name, p] of t.parts) { disposeGroup(p.group); modules.find((m) => m.name === name).onTile?.(t.i, t.j, -1); tris -= p.tris; }
      tiles.delete(k);
    }
    q.sort((a, b) => a.d - b.d);
    queue = q;
  }

  function work(job) {
    const k = job.i + ',' + job.j;
    let t = tiles.get(k);
    if (!t) { t = { i: job.i, j: job.j, parts: new Map() }; tiles.set(k, t); }
    const old = t.parts.get(job.m.name);
    if (old) { disposeGroup(old.group); tris -= old.tris; t.parts.delete(job.m.name); built--; }
    if (job.lod >= 0) {
      const g = new THREE.Group();
      g.name = `${job.m.name}-${job.i},${job.j}`;
      const m = new Mesher();
      job.m.build(m, job.items, job.i, job.j, job.lod, ctx);
      const tr = m.tris;
      m.build(g, ctx.mats);
      groups.tiles.add(g);
      t.parts.set(job.m.name, { group: g, lod: job.lod, tris: tr });
      tris += tr; built++;
    }
    job.m.onTile?.(job.i, job.j, job.lod);
    if (!t.parts.size) tiles.delete(k);
  }

  return {
    groups,
    ctx,
    update(dt, camera) {
      planT -= dt;
      if (planT <= 0) { plan(camera); planT = 0.25; }
      // normal frames get a few ms; the first call and the big steps a screenshot tool takes (dt >= 0.15) build what is near in one go
      const t0 = performance.now(), allow = first || dt >= 0.15 ? 2500 : budget;
      first = false;
      while (queue.length && performance.now() - t0 < allow) work(queue.shift());
    },
    idle: () => !queue.length,
    stats: () => `world tiles ${tiles.size} parts ${built} tris ${tris} queued ${queue.length}`,
    // drop everything built within r of a point (a crater changed the ground, a building fell)
    invalidate(x, z, r = 20) {
      for (const [k, t] of tiles) {
        if (x + r < t.i * TILE || x - r > (t.i + 1) * TILE || z + r < t.j * TILE || z - r > (t.j + 1) * TILE) continue;
        for (const [name, p] of t.parts) { disposeGroup(p.group); tris -= p.tris; modules.find((m) => m.name === name).onTile?.(t.i, t.j, -1); built--; }
        tiles.delete(k);
      }
      planT = 0;
    },
  };
}
