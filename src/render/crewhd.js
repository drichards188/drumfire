import { buildCrewman, crewTier } from '../models/v/crew.js';
import { patchCrewHD } from '../models/v/crew_hd.js'; // (registers the 'hd' tier)
import { patchMaterial } from '../shaderlib.js';

// The close tier of the German crews (models/v/crew_hd.js) for the gun the player serves in person (the gunner,
// src/ww2/gunnerView.js): render/guns.js says each frame which crews want it (want(crew, on)); update() swaps their
// men onto the HD geometry as it gets built (a slice of the face mesher and at most one figure a frame, so entering
// the gun never stalls a frame for long) and back onto the standard geometry when they no longer want it. Same
// skeleton, so the drill, the poses and the player's hidden head carry on untouched.
//
//   const hd = new CrewHD(scene)   adds a hidden primer figure so the warm-up draw (render/warmup.js) compiles the
//                                  HD shader behind the loading screen
//   hd.want(crew, on)              every frame for every crew (GunCrew or VCrew: anything with men[].fig)
//   hd.update()                    once a frame after the wants
//   hd.count                       men on the HD tier now

const BUDGET = 6; // ms a frame for the face mesher

export class CrewHD {
  constructor(scene) {
    this.tier = crewTier('hd');
    this.wanted = new Set();
    this.on = new Set();
    this.count = 0;
    if (!this.tier) return;
    patchCrewHD(patchMaterial);
    // the primer: a standard figure with the HD material, never visible (warmUp draws hidden objects once)
    const fig = buildCrewman({ outfit: 'german44' });
    fig.mesh.material = this.tier.material();
    fig.root.visible = false;
    fig.root.name = 'crew-hd-primer';
    scene?.add(fig.root);
    this.primer = fig;
  }

  want(crew, on) {
    if (on && this.tier && crew?.men?.length) this.wanted.add(crew);
  }

  update() {
    if (!this.tier) return;
    // crews no longer wanted go back to the standard tier at once
    for (const crew of this.on) if (!this.wanted.has(crew)) {
      for (const m of crew.men) if (m.fig?.tier) m.fig.setTier(null);
      this.on.delete(crew);
    }
    let built = false, count = 0;
    for (const crew of this.wanted) {
      this.on.add(crew);
      for (const m of crew.men) {
        const fig = m.fig;
        if (!fig) continue;
        if (fig.tier === 'hd') { count++; continue; }
        if (!this.tier.covers(fig.outfit)) continue;
        if (this.tier.has(fig.outfit)) { fig.setTier('hd'); count++; continue; }
        if (built || this.failed?.has(fig.outfit.key)) continue; // one new figure a frame
        built = true;
        try {
          if (this.tier.step(fig.outfit, BUDGET)) { fig.setTier('hd'); count++; }
        } catch (e) { // a figure that cannot be built stays on the standard tier; the frame goes on
          (this.failed ??= new Set()).add(fig.outfit.key);
          console.warn('crew HD figure:', e.message);
        }
      }
    }
    this.count = count;
    this.wanted.clear();
  }
}
