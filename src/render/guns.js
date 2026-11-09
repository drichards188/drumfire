import * as THREE from 'three';
import { UNITS, piecePlacements, headingFor } from '../sector.js';
import { GUNS, STEP } from '../sim/tables.js';
import { buildGun } from '../models/guns.js';
import { GunCrew } from './crews.js';
import { VCrew, VKINDS } from './crews_vweap.js';
import { smooth } from './anim.js';
import { CrewHD } from './crewhd.js';
import { heroShells } from './shells.js';
import { heroAmmoBuild } from './crews_ammo.js';
import { prebuildAmmoAsync, ammoTexScale, buildGr18 } from '../models/ammo_mrs18.js';

// Gun rigs posed from the sim every frame: traverse and elevation from piece.az and piece.el, the
// recoil from the time since the shot (a fast run back on the buffers, a pause, the slow run out on
// the recuperators), the breech from the loading step, a jolt through the platform at the shot, a
// wrecked pose for a destroyed piece, the railway gun's car (rolls back about 6 m along the rails after the
// shot and is winched forward before the round goes in), and the loading crew (crews.js). Rigs are the ones main built
// (`rigs`, keyed `${unitId}:${pieceIndex}`) or built here when main has none.
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const KICK = { bl15: 0.9, bl92: 0.6, bl6: 0.3, bl60: 0.3, rail: 0.4, lefh18: 0.25, sfh18: 0.3, k18: 0.5, mrs18: 0.5, nbw41: 0.05, gustav: 0.6, bertha: 0.8, karl: 0.9, v1: 0, v2: 0,
  sfh13: 0.3, m16: 0.5, k17: 0.3, max38: 0.6, gamma: 0.9, paris: 0.7,
  fk16: 0.2, k16: 0.4, m99: 0.6, rk92: 0.35, sfh93: 0.3, beta: 0.7, k38: 0.6, hm1: 0.8, bruno: 0.5, k5: 0.6, k12: 0.5, wespe: 0.3, hummel: 0.35, nbw42: 0.05, swg40: 0.05 };

// How far back along the rails the railway car stands `tf` s after the shot (0..1 of rig.carRoll): a fast run
// back against the brakes (decelerating over 1.9 s), a pause, then the slow winch-in that ends as the round
// is about to go in (the start of the 'shell' step), never later than the 'lay' step.
export function carPose(g, p, tf) {
  if (!(tf >= 0)) return 0;
  const i0 = g.load.findIndex((s) => s.step === 'shell');
  if (p.job && i0 >= 0 && p.job.i >= i0) return 0;
  let tEnd = 0;
  for (const st of g.load) { if (st.step === 'shell' || st.step === 'lay') break; tEnd += st.dur; }
  const t1 = 4.5, t2 = Math.max(tEnd, t1 + 6);
  if (tf < 1.9) { const k = tf / 1.9; return 1 - (1 - k) * (1 - k) * (1 - k); }
  if (tf < t1) return 1;
  if (tf < t2) return 1 - smooth(tf, t1, t2);
  return 0;
}

// The breech block and the loading tray from the loading step, in an order that keeps them apart: the
// block swings open first and the tray slides in behind it; at the close the tray goes clear first and then
// the block swings shut. Everything else (recoil, laying, idle) has the block shut and the tray out of the way.
export function loadPose(p, alpha = 0) {
  const j = p.job;
  if (!j) return { breech: p.breech, tray: p.breech > 0.99 ? 0 : 1 };
  const k = Math.min(1, Math.max(0, (j.t + alpha * STEP) / Math.max(0.01, j.dur)));
  switch (j.step) {
    case 'open': return { breech: smooth(k, 0, 0.7), tray: 1 - smooth(k, 0.7, 1) };
    case 'shell': case 'ram': case 'cartridge': return { breech: 1, tray: 0 };
    case 'close': return { breech: 1 - smooth(k, 0.4, 1), tray: smooth(k, 0, 0.4) };
    default: return { breech: p.breech, tray: 1 };
  }
}

// 0..1: how far the light gun's barrel is down at its loading elevation during the loading steps
function quickLoad(j, alpha) {
  const k = Math.min(1, Math.max(0, (j.t + alpha * STEP) / Math.max(0.01, j.dur)));
  switch (j.step) {
    case 'open': return smooth(k, 0, 1);
    case 'shell': case 'ram': case 'cartridge': case 'close': case 'prime': return 1;
    case 'lay': return 1 - smooth(k, 0, 1);
    default: return 0;
  }
}

// The max-quality battery's crew tiers (shots/maxq/PLAN.md 3.4): a man within 9 m of the camera on 'max' (back off at
// 11 m), within 45 m on 'hd' (55 m), beyond on the standard tier; at its gun in first person the whole crew on 'max'.
const HERO_TIER = { max: [9, 11], hd: [45, 55] };
// its rigs' detail (rig.setDetail): 2 (the close build and the micro detail) at the gun in person or within 15 m, 1 (the
// close build) within 40 m, 0 (the standard meshes) beyond; the second number is where a level is left again
const HERO_DETAIL = { 2: [15, 17], 1: [40, 45] };
const _m = new THREE.Vector3();

export class GunViews {
  constructor(scene, sim, terrain, rigs, fx, onlyRigs = false, detail = null, { hero = null } = {}) {
    this.onlyRigs = onlyRigs;
    // the max-quality battery (main's HERO, DESIGN.md "Max-quality battery"): its views are `v.hero`, their crews built
    // for the hero drill, never thinned, put on the close crew tiers by distance, the rigs' detail by distance, and the
    // rig's motion, materials, effects and foley through the hooks main hands over (setHero). Null on every other page.
    this.hero = hero?.units?.size ? hero : null;
    this.heroLow = false; // (main sets it at Low quality: the hd crew tier in place of max)
    this.poseHeroRig = null; this.herofx = null; this.foley = null;
    // its parts, each switched live from the gear menu for A/B (main's object, shared; all on by default)
    this.heroOn = { detail: true, tiers: true, materials: true, motion: true, effects: true, sound: true };
    this.detail = detail; // DetailCull: a far battery's small parts are not drawn
    this.scene = scene;
    this.terrain = terrain;
    this.rigs = rigs;
    this.fx = fx;
    this.views = [];
    this.byKey = new Map();
    this.muzzle = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, calibre: 6 };
    this.camera = null;
    this.selected = null;
    // pov: { unitId, pi } of the gun the player serves in person (main sets it while the first-person view is up), or
    // null; that gun's crew is drawn in the close tier (crewhd.js) and detail away from the battery thins out
    this.pov = null;
    this.povDetail = true; // (false: the first-person view without the close tier and the thinning, to compare)
    try { this.crewHD = this.hero ? new CrewHD(scene, { tiers: ['hd', 'max'] }) : new CrewHD(scene); } catch (e) { console.warn('crew HD tier:', e.message); this.crewHD = null; }
    if (this.hero) heroShells.units = this.hero.units; // (its rounds in flight: render/shells.js, made after this)
    this.build(sim);
    this.allViews = [...this.views];
  }

  // main hands over the max-quality battery's hooks once the audio engine and the post chain exist; each is optional (a
  // module that failed to load leaves its part out) and one that throws is switched off with a warning (heroOff)
  setHero({ audio = null, post = null, poseHeroRig = null, createHeroFx = null, createFoley = null, on = null } = {}) {
    if (!this.hero) return;
    if (on) this.heroOn = on;
    this.poseHeroRig = typeof poseHeroRig === 'function' ? poseHeroRig : null;
    try { this.herofx = createHeroFx?.(this.fx, post, { lean: this.hero.lean }) ?? null; } catch (e) { this.heroOff('herofx', e); }
    try { this.foley = createFoley?.({ audio, terrain: this.terrain }) ?? null; } catch (e) { this.heroOff('foley', e); }
  }

  heroOff(name, e) {
    console.warn(`max-quality battery: ${name} switched off:`, e?.message ?? e);
    this[name] = null;
  }

  // the hero crews' close tiers built behind the loading screen (render/crewhd.js prebuild); resolves when they are, or
  // after `ms`, whichever comes first, so a slow build never holds the page. Returns the milliseconds it waited.
  async prebuildHero(ms = 30000) {
    if (!this.hero) return 0;
    const figs = this.allViews.filter((v) => v.hero && v.crew).flatMap((v) => v.crew.men.map((m) => m.fig).filter(Boolean));
    const t0 = performance.now();
    let timer = null;
    // (and its ammunition, render/crews_ammo.js: the stencil atlases drawn in a worker, then the rounds, the cases and the
    // ready ammunition put round each gun and the rounds in flight, all before main's second patchSceneFog and the compile)
    const ammo = Promise.resolve().then(async () => {
      if (this.hero.lean) ammoTexScale(0.5);
      const r = await prebuildAmmoAsync();
      for (const v of this.allViews) if (v.hero && v.crew?.ammoPending) { v.crew.ammoPending = false; heroAmmoBuild(v.crew); }
      heroShells.view?.buildHero?.(buildGr18({ lod: 'flight', withHead: true }));
      this.heroAmmoLoad = r;
    }).catch((e) => console.warn('hero ammunition:', e?.message ?? e));
    await Promise.race([
      Promise.all([Promise.resolve().then(() => this.crewHD?.prebuild?.(figs)).catch((e) => console.warn('crew tier prebuild:', e?.message ?? e)), ammo]),
      new Promise((r) => { timer = setTimeout(r, ms); }),
    ]);
    clearTimeout(timer);
    return performance.now() - t0;
  }

  build(sim) {
    for (const v of this.views) v.crew?.setLevel(0);
    this.views.length = 0;
    this.byKey.clear();
    for (const u of sim.units) {
      for (const p of u.pieces) {
        const key = `${u.id}:${p.i}`;
        let rig = this.rigs.get(key);
        if (!rig && this.onlyRigs) continue;
        const hero = !!this.hero && this.hero.units.has(u.id) && this.hero.kinds.has(p.kind);
        if (!rig) {
          try { rig = hero ? buildGun(p.kind, { hd: true, lean: this.hero.lean }) : buildGun(p.kind); } catch (e) { console.warn('buildGun', p.kind, e.message); continue; }
          const pl = piecePlacements(u.def ?? UNITS.find((d) => d.id === u.id))[p.i];
          rig.root.position.set(pl.x, this.terrain.heightAt(pl.x, pl.z), pl.z);
          rig.root.rotation.y = headingFor(pl.bearing);
          this.scene.add(rig.root);
          this.rigs.set(key, rig);
        }
        rig.root.rotation.order = 'YXZ';
        let v = this.rigs._views?.get(key);
        v = { unit: u, piece: p, rig, key, crew: null, baseY: rig.root.position.y, wrecked: false, dist: 0, hero };
        if (hero) rig.hero = true;
        // the V-weapon sites have a launch crew of their own (crews_vweap.js), driven by the drill's state
        // (the max-quality battery's crews are built for the hero drill: its props and men come in the constructor)
        try { v.crew = VKINDS.has(p.kind) ? new VCrew(rig, p.kind) : hero ? new GunCrew(rig, p.kind, { hero: true, ammoLater: true }) : new GunCrew(rig, p.kind); } catch (e) { console.warn('crew', p.kind, e.message); }
        this.detail?.add(`gun:${key}`, rig.root);
        this.views.push(v);
        this.byKey.set(key, v);
      }
    }
  }

  reset(sim) {
    // Unavailable batteries, and the guns a battery has not yet earned (research.js: it starts with one), have neither
    // a simulation piece nor a visible gun or crew: their pits stand empty.
    const has = (v) => !!sim.unitById(v.unit.id)?.pieces[v.piece.i];
    for (const v of this.allViews) {
      const active = has(v);
      v.rig.root.visible = active;
      if (!active) v.crew?.setLevel(0);
    }
    this.views = this.allViews.filter(has);
    this.byKey = new Map(this.views.map(v => [v.key, v]));
    for (const v of this.views) {
      const u = sim.unitById(v.unit.id);
      v.unit = u;
      v.piece = u.pieces[v.piece.i];
      v.wrecked = false;
      v.rig.root.rotation.x = 0;
      v.rig.root.position.y = v.baseY;
    }
  }

  /** The muzzle's world position and bore direction (a shared record) with the rig posed as the sim has it. */
  fired(unit, piece) {
    const v = this.byKey.get(`${unit.id}:${piece.i}`);
    if (!v) return null;
    const rig = v.rig;
    rig.setTraverse(piece.az);
    rig.setElevation(piece.el);
    rig.setRecoil(0);
    rig.setCar?.(0);
    rig.root.updateMatrixWorld(true);
    const m = rig.anchors.muzzle;
    m.getWorldPosition(_v);
    _w.set(0, 0, -1).transformDirection(m.matrixWorld);
    const o = this.muzzle;
    o.x = _v.x; o.y = _v.y; o.z = _v.z; o.dx = _w.x; o.dy = _w.y; o.dz = _w.z;
    o.calibre = GUNS[piece.kind].calibre;
    // the max-quality battery: what stays at the gun after the shot (render/herofx.js), from the sim's time of the shot
    if (v.hero && this.herofx && this.heroOn.effects) try { this.herofx.fired(v, piece.firedAt ?? 0); } catch (e) { this.heroOff('herofx', e); }
    return o;
  }

  update(dt, rawDt, sim) {
    const alpha = sim.alpha ?? 0;
    const now = sim.time + alpha * STEP;
    const cam = this.camera;
    const pov = this.povDetail ? this.pov : null, at = pov ? this.byKey.get(`${pov.unitId}:${pov.pi}`) : null;
    // at a gun in person: meshes far from the battery need more than a pixel to be drawn (render/detail.js)
    this.detail?.setFocus?.(at ? at.rig.root.position : null);
    for (const v of this.views) {
      const p = v.piece, rig = v.rig, g = GUNS[p.kind];
      const dead = p.state === 'dead';
      // a self-propelled gun drives between its positions (src/ww1/special.js MoveCtl): the rig follows the piece over
      // the ground, its wheels turning at its speed
      if (p.mobile) {
        const r = rig.root.position, dx = p.pos.x - r.x, dz = p.pos.z - r.z;
        if (dx || dz) {
          const y = this.terrain.heightAt(p.pos.x, p.pos.z);
          r.x = p.pos.x; r.z = p.pos.z;
          v.baseY = y;
        }
        // (the tracks run the exact ground covered, whatever the time compression; driveBy when the rig has it)
        if (rig.driveBy) rig.driveBy(Math.hypot(dx, dz)); // (forward: the hull is turned along the road)
        else rig.setDrive?.(dt > 0 ? Math.hypot(dx, dz) / Math.max(dt, 1e-3) : 0);
      }
      rig.setTraverse(p.az);
      // the light guns have no depressing gear of their own in the sim: loaded at the laid elevation, which
      // at 40 degrees would run the round into the trail. The quick-loading gear (6-inch) and the loading
      // rest bring the barrel to its loading elevation for the steps and back for the laying.
      rig.setElevation(p.job && g.load[0].step !== 'depress' ? p.el + (rig.loadEl - p.el) * quickLoad(p.job, alpha) : p.el);
      // recoil: out in ~0.14 s, held a moment, then the run out
      const tf = now - p.firedAt;
      let r = 0;
      if (tf >= 0 && tf < g.runout + 1.2) {
        r = tf < 0.14 ? Math.sin((tf / 0.14) * Math.PI / 2) : tf < 0.45 ? 1 : 1 - smooth(tf, 0.45, 0.45 + g.runout);
      }
      // the max-quality battery's own rig motion (render/herorig.js): the handwheels, the sight head and the dial from the
      // laying, and its recoil, counter-recoil and shudder; when it posed the recoil, the plain recoil and kick stand aside
      let posed = false;
      if (v.hero && !dead && this.poseHeroRig && this.heroOn.motion) try { posed = !!this.poseHeroRig(rig, p, p.firedAt > -900 ? tf : Infinity, dt); } catch (e) { this.heroOff('poseHeroRig', e); }
      if (!posed) rig.setRecoil(dead ? 0 : r * (rig.recoilFade ? rig.recoilFade(p.el) : 1));
      if (rig.setCar) rig.setCar(dead ? 0 : carPose(g, p, tf) * rig.carRoll);
      const { breech: b, tray, deck } = loadPose(p, alpha);
      rig.setBreech(b);
      rig.setTray?.(tray, deck);
      // the platform kicks: a short shudder through the root, bigger for the big guns
      const kick = KICK[p.kind] ?? 0.5;
      const j = tf >= 0 && tf < 1.4 ? Math.exp(-tf * 4.5) * Math.sin(tf * 38) : 0;
      if (posed) {
        // (the hero rig's shudder is on rig.body, inside the root: the men on rig.root stand still)
        rig.root.position.y = v.baseY;
        rig.root.rotation.x = 0;
      } else if (!dead) {
        rig.root.position.y = v.baseY + j * 0.045 * kick;
        rig.root.rotation.x = -j * 0.006 * kick - (tf >= 0 && tf < 0.5 ? Math.sin(Math.min(1, tf / 0.12) * Math.PI) * 0.004 * kick : 0);
      } else if (!v.wrecked) {
        v.wrecked = true;
        rig.root.rotation.x = 0.08;
        rig.root.rotation.z = 0.1;
        rig.root.position.y = v.baseY - 0.35;
        rig.setElevation(p.el + 0.25);
      }
      rig.update?.(dt);
      // crew level of detail by distance to the camera
      if (v.crew) {
        let level = 2;
        if (cam) {
          const d = cam.position.distanceTo(rig.root.position);
          v.dist = d;
          const sel = this.selected != null && v.unit.id === this.selected;
          // (the max-quality battery's crews are never thinned: every man posed every frame)
          level = v.hero || d < 140 || (sel && d < 450) ? 2 : d < 420 ? 1 : 0;
          // at a gun in person the other batteries' crews are not drawn beyond 60 m; that gun's crew, and the
          // battery's other guns' within 25 m, get the close tier
          if (at && v.unit.id !== pov.unitId && d > 60) level = 0;
          if (v.hero) this.heroTiers(v, at, dead);
          else this.crewHD?.want(v.crew, !!at && !dead && v.unit.id === pov.unitId && (v === at || d < 25));
        }
        if (dead) level = 0;
        if (level !== v.lvl) {
          v.lvl = level;
          v.crew.setLevel(level);
        }
        if (level > 0) {
          if (level === 1 && (v.skip = (v.skip ?? 0) + 1) % 3) continue;
          v.crew.update(p, sim, rawDt * (level === 1 ? 3 : 1), level);
        }
      }
      // (after the drill has posed the men: the foley and the effects read this frame's crew)
      if (v.hero) this.heroFrame(v, p, dt, now, at, dead);
    }
    this.crewHD?.update();
  }

  // The max-quality battery's crew tiers, man by man (HERO_TIER, render/crewhd.js wantFig): wanted every frame they are
  // to keep one; ?maxq=2 or the gun served in person: every man on 'max'; Low quality: 'hd' in place of 'max'.
  heroTiers(v, at, dead) {
    const hd = this.crewHD, cam = this.camera;
    if (!hd || dead || !cam || !v.crew?.men || !this.heroOn.tiers) return;
    const all = this.hero.level >= 2 || v === at;
    if (!hd.wantFig) {
      // (a CrewHD without per-figure tiers: the whole crew on its close tier while it is near)
      v.heroNear = all || v.dist < HERO_TIER.hd[v.heroNear ? 1 : 0];
      hd.want(v.crew, v.heroNear);
      return;
    }
    const want = (this.heroWant ??= new Map());
    for (const m of v.crew.men) {
      const fig = m.fig;
      if (!fig?.root) continue;
      const d = _m.setFromMatrixPosition(fig.root.matrixWorld).distanceTo(cam.position), cur = want.get(fig) ?? null;
      let t = all ? 'max' : d < HERO_TIER.max[cur === 'max' ? 1 : 0] ? 'max' : d < HERO_TIER.hd[cur ? 1 : 0] ? 'hd' : null;
      if (t === 'max' && this.heroLow) t = 'hd';
      want.set(fig, t);
      if (t) hd.wantFig(fig, t);
    }
  }

  // The rest of a hero view's frame: the rig's detail by distance (HERO_DETAIL; ?maxq=2 keeps 2), its materials' wear
  // (models/maxq.js handle), the effects that stay at the gun (render/herofx.js) and the drill's foley (render/foley.js).
  heroFrame(v, p, dt, now, at, dead) {
    const rig = v.rig, cam = this.camera;
    // (the ready ammunition round the gun, render/crews_ammo.js: not drawn from afar, about 80k triangles a gun)
    const R = v.crew?.ammo?.ready;
    if (R) R.group.visible = v.dist < 70 || v === at;
    if (rig.setDetail && cam) {
      const d = cam.position.distanceTo(rig.root.position), cur = v.heroDetail ?? -1;
      const lvl = !this.heroOn.detail ? 0 : this.hero.level >= 2 || v === at || d < HERO_DETAIL[2][cur === 2 ? 1 : 0] ? 2 : d < HERO_DETAIL[1][cur >= 1 ? 1 : 0] ? 1 : 0;
      if (lvl !== cur) {
        v.heroDetail = lvl;
        try { rig.setDetail(lvl); } catch (e) { console.warn('rig.setDetail:', e.message); rig.setDetail = null; }
      }
    }
    const on = this.heroOn;
    if (rig.maxq?.update && on.materials) try { rig.maxq.update(dt, p, now); } catch (e) { console.warn('maxq update:', e.message); rig.maxq = null; }
    if (this.herofx && on.effects) try { this.herofx.update(v, dt, now); } catch (e) { this.heroOff('herofx', e); }
    if (this.foley && on.sound) try { this.foley.update(v, dt, now, cam); } catch (e) { this.heroOff('foley', e); }
  }
}
