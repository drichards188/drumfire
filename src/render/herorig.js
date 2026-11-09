// The max-quality battery's rig motion (shots/maxq/PLAN.md 3.2; owned by the motion track). render/guns.js calls
// poseHeroRig(rig, p, tf, dt) for every view of a hero unit each frame, after traverse and elevation are set: it turns
// the handwheels, the sight head and the elevation dial from the piece's laying (rig.gear, built by
// models/v/de/k18_hd.js) and poses the recoil, the counter-recoil and the gun's shudder (on rig.body) for tf seconds
// since the shot (Infinity when there was none). Returns true when it posed the recoil, so guns.js then skips
// rig.setRecoil and the root kick. Allocates nothing. The breech's operating crank and the firing lever are posed by
// the crew (render/crews_hero.js), who work them.
//
// The Mörserlafette's dual recoil (TM-E 30-451; shots/maxq/research/mrs18-drill-sound-fx.md): the barrel runs back in
// the cradle on its brake, the top carriage with cradle and barrel runs back on the lower carriage's rails behind it, so
// the carriage barely moves on the ground. Game timings, chosen so the two motions read apart (no source gives them):
// the barrel out in 0.13 s, the top carriage over 0.42 s from 15 ms later; the recuperators bring the barrel home by
// 2.0 s and the top carriage by 3.35 s, each eased into its counter-recoil buffer over the last part (herocues runOutHome,
// carriageHome); both are home well before the sim's recoil state ends (0.18 + runout = 4.18 s). The shot drives the
// 16.7 t gun down into its platform and rocks it nose up about its float (rig.body: the men on the ground, children of
// the root, stand still; the men on its walkways ride it, crews.js put), and the barrel shivers in its trunnions.

// handwheel turns per degree of elevation and of traverse (game values; refs/k18_mrs18/README.md has no gear ratios):
// at the sim's 2.4 deg/s and 1.1 deg/s the layer's wheel turns 1.2 times a second, the traverser's 1.1
const TURNS_EL = 0.5, TURNS_AZ = 1.0, DEG = Math.PI / 180, TAU = Math.PI * 2;
// the sight head's bearing to its aiming point, from the gun's zero line (left and behind, where the aiming posts stand)
const SIGHT0 = 2.3;
// the shudder: the body down and nose up first, 6.5 Hz, gone by 0.9 s; the barrel's shiver 18 Hz over a quarter second
const SHUDDER = { f: 6.5, tau: 0.11, dy: 0.03, rx: 0.004, end: 0.9 }, KICK = 0.5;

const back = (u) => (u >= 1 ? 1 : u <= 0 ? 0 : 1 - (1 - u) ** 3 * (1 + 3 * u)); // smooth at both ends, fastest a third in
// 0..1 of the barrel's and of the top carriage's full stroke at tf seconds after the shot
export function recoilCurves(tf, out) {
  if (!(tf >= 0)) { out.b = 0; out.c = 0; return out; }
  const TB = 0.13, RB = 1.8, TC = 0.42, RC = 2.8, t2 = tf - 0.015;
  out.b = tf < TB ? 1 - (1 - tf / TB) ** 1.7 : tf < TB + 0.05 ? 1 : 1 - back((tf - TB - 0.05) / RB);
  out.c = t2 <= 0 ? 0 : t2 < TC ? 1 - (1 - t2 / TC) ** 2 : t2 < TC + 0.1 ? 1 : 1 - back((t2 - TC - 0.1) / RC);
  return out;
}
const RC = { b: 0, c: 0 };

export function poseHeroRig(rig, p, tf, dt) {
  if (!rig || !p) return false;
  const P = rig.pivots, G = rig.gear;
  // ---- the laying gear
  if (G) {
    if (G.wheelL) G.wheelL.rotation.x = -p.el / DEG * TURNS_EL * TAU; // (the layer's wheel: elevation)
    if (G.wheelR) G.wheelR.rotation.x = p.az / DEG * TURNS_AZ * TAU; // (the traverser's: the line)
    if (G.elDial) G.elDial.rotation.x = p.el * 4;
    if (G.sightHead) {
      // set to the ordered line: laid, it looks at the aiming point; turned to a new deflection at a hand's pace
      const want = SIGHT0 - (p.cmd?.az ?? p.az), S = rig.heroSight ??= { a: want, t: -1 };
      const step = dt > 0 && dt < 0.5 ? 2.5 * dt : Infinity;
      S.a += Math.max(-step, Math.min(step, want - S.a));
      G.sightHead.rotation.y = S.a;
    }
  }
  // ---- the dual recoil and the counter-recoil
  recoilCurves(tf, RC);
  if (rig.setRecoil) {
    rig.setRecoil(Math.pow(RC.b, 4 / 3)); // (setRecoil draws the barrel k^0.75 of its faded stroke: this is RC.b of it)
    if (P.carriage) P.carriage.position.z = RC.c * (rig.carriageRecoil ?? 0.6);
  }
  // ---- the shudder and the shiver
  const body = rig.body, e = p.el ?? 0;
  if (body) {
    let y = 0, rx = 0;
    if (tf >= 0 && tf < SHUDDER.end) {
      const imp = Math.exp(-tf / SHUDDER.tau) * Math.sin(TAU * SHUDDER.f * tf) * (1 - tf / SHUDDER.end);
      y = -imp * SHUDDER.dy * KICK * (0.35 + Math.sin(e));
      rx = imp * SHUDDER.rx * KICK * Math.cos(e);
    }
    body.position.y = y;
    body.rotation.x = rx;
  }
  if (tf >= 0 && tf < 0.3 && rig.setElevation) rig.setElevation(e + 0.0015 * Math.exp(-tf / 0.08) * Math.sin(TAU * 18 * tf));
  return true;
}
