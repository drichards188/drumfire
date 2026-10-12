import * as THREE from 'three';
import { V, box, rbox, xTube, yTube, zTube, rod, sideProfile } from '../kit.js';
import { makeRig, finishRig, node, pivotAt, hb, addWheel, addHandwheel, trailBeam, addDialSight, breechSetter, trayShells, crew, L90, R90, ring } from './fieldkit.js';

// The German guns as rigs (same contract as the British guns, so a battery can recoil when it
// fires): the 15 cm schwere Feldhaubitze 13, the 7.7 cm Feldkanone 16 and the 21 cm Moerser 16.
// German camouflage ('tri': green with sand and black blotches) as painted from 1916 on.
// References: refs/german (21 cm Moerser 16 Stanley Park photo, Armentieres NARA photo, the
// Passchendaele IWM pictures of 15 cm howitzers in captured positions).

export const GERMAN_KINDS = ['fh15', 'm21', 'fk77'];

const SPEC = {
  // wheel radius/track, trunnion height and fore-aft position (root space), barrel ends relative to
  // the trunnion, the shield, the trail and how far the gun recoils in play
  fh15: {
    shell: 'fh15', WR: 0.72, WX: 0.9, tw: 0.11, spokes: 12, trY: 1.12, trZ: -0.1, muzzle: -1.55, breech: 0.6, chase: [0.085, 0.115], jacket: [0.15, -0.5, 0.45], ring: 0.19,
    shield: { w: 1.1, h: 0.78, y: 0.98, z: -0.62, flap: true }, trail: [0.6, 3.0], recoil: 0.7, loadEl: 0.12, recup: true,
  },
  fk77: {
    shell: 'fk77', WR: 0.66, WX: 0.78, tw: 0.1, spokes: 12, trY: 0.98, trZ: 0.05, muzzle: -1.9, breech: 0.8, chase: [0.052, 0.07], jacket: [0.085, -0.4, 0.5], ring: 0.1,
    shield: { w: 1.0, h: 0.85, y: 1.12, z: -0.55, flap: true }, trail: [0.45, 2.4], recoil: 0.55, loadEl: 0.04, recup: false,
  },
};

function fieldGun(kind) {
  const S = SPEC[kind], rig = makeRig('tri');
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const P = rig.part();
  for (const s of [-1, 1]) addWheel(P, s * S.WX, S.WR, { R: S.WR, tw: S.tw, spokes: S.spokes, side: s, nave: 0.12 });
  P.add('steel', xTube(-S.WX - 0.1, S.WX + 0.1, 0.045, 0.045, 10, S.WR, 0));
  const t0 = S.trail[0], t1 = S.trail[1], ty = S.trY;
  const cheek = [[-0.45, S.WR + 0.05], [-0.2, ty - 0.1], [-0.05, ty + 0.2], [0.35, ty + 0.2], [0.5, ty - 0.1], [0.7, S.WR - 0.1], [0.7, S.WR - 0.25], [-0.45, S.WR - 0.2]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(cheek, 0.03).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.27, 0, 0)));
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.25, s * 0.37, 0.06, 0.06, 12, S.trY, S.trZ));
  P.add('camo', box(0.54, 0.1, 1.0, 0, S.WR - 0.18, 0.1));
  trailBeam(P, 'camo', [{ z: t0, y: S.WR - 0.2, w: 0.52, h: 0.26 }, { z: (t0 + t1) / 2, y: 0.36, w: 0.42, h: 0.22 }, { z: t1, y: 0.2, w: 0.3, h: 0.18 }]);
  P.add('camo', box(0.4, 0.36, 0.04, 0, 0.12, t1 + 0.1, -0.2));
  P.add('steel', new THREE.TorusGeometry(0.06, 0.014, 6, 12).rotateX(Math.PI / 2).translate(0, 0.25, t1 + 0.22));
  // the shield: a thin plate, a lower flap folded up, a sighting slot
  const sh = S.shield;
  P.add('camo', box(sh.w, sh.h, 0.012, 0, sh.y + sh.h / 2 - 0.2, sh.z, -0.08));
  if (sh.flap) P.add('camo', box(sh.w * 0.96, 0.32, 0.012, 0, sh.y - 0.12, sh.z + 0.01, -0.5));
  for (const sx of [-1, 1]) P.add('steel', rod(V(sx * 0.3, 0.9, 0.0), V(sx * 0.46, sh.y + 0.1, sh.z + 0.03), 0.014, 5));
  addHandwheel(P, -0.34, S.WR + 0.2, 0.5, 0.11, -1);
  P.add('wood', box(0.26, 0.03, 0.22, -0.7, S.WR + 0.1, 0.3));
  P.add('steel', rod(V(-0.3, S.WR + 0.1, 0.35), V(-0.6, S.WR + 0.1, 0.3), 0.012, 5));
  P.build(trav, { dirt: 0.55 });

  const el = pivotAt(rig, trav, 'elevation', 0, S.trY, S.trZ);
  const E = rig.part();
  const cr = S.jacket[0] + 0.05;
  E.add('camo', zTube(S.muzzle * 0.45, S.breech * 0.7, cr, cr, 16));
  E.add('dark', zTube(S.muzzle * 0.45 - 0.04, S.muzzle * 0.45, cr + 0.015, cr + 0.015, 16));
  if (S.recup) { // the hydro-spring recuperator cylinder under the barrel
    E.add('camo', zTube(-0.7, 0.3, 0.07, 0.07, 12, 0, -0.2));
    E.add('steel', zTube(-0.76, -0.7, 0.045, 0.045, 8, 0, -0.2));
  } else {
    E.add('camo', zTube(-0.6, 0.25, 0.045, 0.045, 10, 0, -0.12));
  }
  const arcR = kind === 'fh15' ? 0.5 : 0.4, arc = [];
  for (let i = 0; i <= 8; i++) { const f = (14 + 40 * (i / 8)) * Math.PI / 180; arc.push([arcR * Math.sin(f), -arcR * Math.cos(f)]); }
  for (let i = 8; i >= 0; i--) { const f = (14 + 40 * (i / 8)) * Math.PI / 180; arc.push([(arcR - 0.1) * Math.sin(f), -(arcR - 0.1) * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.035).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.17, 0, 0)));
  E.add('steel', rod(V(-0.15, 0.05, 0.1), V(-0.3, 0.38, 0.1), 0.016, 6));
  addDialSight(E, -0.3, 0.38, 0.1);
  E.build(el, { dirt: 0.25, y0: S.trY });

  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  const [r0, r1] = S.chase, [jr, j0, j1] = S.jacket;
  B.add('dark', zTube(S.muzzle, j0, r0, r1, 18));
  B.add('steel', zTube(S.muzzle, S.muzzle + 0.03, r0 + 0.008, r0 + 0.008, 18));
  B.add('dark', zTube(j0, j1, jr, jr, 20));
  B.add('dark', zTube(j1 - 0.05, S.breech, S.ring, S.ring, 20));
  B.add('char', new THREE.CircleGeometry(S.ring * 0.4, 12).translate(0, 0, S.breech + 0.002));
  B.add('dark', box(0.04, 0.05, 0.08, S.ring, 0.1, S.breech - 0.1));
  B.build(rc, { dirt: 0.15, y0: S.trY });

  const br = pivotAt(rig, rc, 'breech', S.ring + 0.03, 0, S.breech);
  const K = rig.part();
  K.add('dark', zTube(0.0, 0.06, S.ring * 0.9, S.ring * 0.9, 16, -(S.ring + 0.03), 0));
  K.add('steel', box(0.04, S.ring * 1.6, 0.04, 0.0, 0, 0.03));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.8);

  rig.anchors.eye = node(trav, 'eye', 0, 1.7, 0.8);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, S.muzzle);
  rig.anchors.breech = node(el, 'breech', 0, 0, S.breech + 0.02);
  rig.anchors.tray = node(el, 'tray', 0, -0.12, S.breech);
  rig.anchors.shellStack = node(root, 'shellStack', 1.6, 0.1, 1.6);
  trayShells(rig, rig.anchors.tray, S.shell);
  rig.recoilLength = S.recoil;
  rig.loadEl = S.loadEl;
  crew(rig, 'layer', -1.0, 0.3, L90, 'lay');
  crew(rig, 'loader', 0.3, S.trail[0] + 1.3, 0, 'ram');
  crew(rig, 'shell', 1.0, S.trail[0] + 1.2, R90, 'carry');
  crew(rig, 'lanyard', 1.05, 0.5, R90, 'lanyard');
  hb(rig, -0.95, 0, S.muzzle, 0.95, 1.6, 0.9);
  hb(rig, -0.28, 0, 0.7, 0.28, 0.8, t1 + 0.3);
  return finishRig(rig, kind, S.shell);
}

// 21 cm Moerser 16 as the Stanley Park photograph shows it: a short fat barrel on a heavy box carriage
// with two big spoked steel wheels, riding on a bed of two long ramps, camouflage blotches, a
// steeply elevated mortar (loaded near the horizontal).
function moerser() {
  const rig = makeRig('tri');
  const { root } = rig;
  const trav = pivotAt(rig, root, 'traverse', 0, 0, 0);
  const P = rig.part();
  // the bed: two long girders with ramps at the front, cross ties
  for (const s of [-1, 1]) {
    P.add('camo', box(0.3, 0.16, 5.0, s * 1.0, 0.08, 0.8));
    P.add('camo', box(0.3, 0.16, 1.1, s * 1.0, 0.0, -2.15, 0.2));
    P.add('dark', box(0.12, 0.05, 4.6, s * 1.0, 0.17, 0.8));
  }
  for (let i = 0; i < 5; i++) P.add('wood', box(2.5, 0.12, 0.28, 0, 0.06, -1.4 + i * 1.1));
  const WR = 0.62, WX = 0.95, WY = 0.17 + WR;
  for (const s of [-1, 1]) addWheel(P, s * WX, WY, { R: WR, tw: 0.2, spokes: 10, side: s, nave: 0.14, girdle: true });
  P.add('steel', xTube(-WX - 0.2, WX + 0.2, 0.07, 0.07, 10, WY, 0));
  const ty = 1.75;
  const cheek = [[-0.9, WY + 0.1], [-0.5, ty - 0.5], [-0.2, ty + 0.35], [0.5, ty + 0.35], [0.75, ty - 0.4], [1.1, 0.7], [1.1, 0.4], [-0.9, 0.4]];
  for (const s of [-1, 1]) P.add('camo', sideProfile(cheek, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(s * 0.5, 0, 0)));
  P.add('camo', box(1.0, 0.14, 1.9, 0, 0.5, 0.1));
  P.add('camo', box(1.0, 0.5, 0.1, 0, 0.85, 1.05));
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.46, s * 0.7, 0.1, 0.1, 14, ty, 0));
  // the elevating gear: a worm drive housing, a big handwheel on the left
  addHandwheel(P, -0.56, 1.25, 0.75, 0.2, -1);
  P.add('dark', rbox(0.2, 0.3, 0.4, 0.04, -0.6, 1.1, 0.7));
  P.build(trav, { dirt: 0.55 });

  const el = pivotAt(rig, trav, 'elevation', 0, ty, 0);
  const E = rig.part();
  E.add('camo', zTube(-1.0, 0.8, 0.32, 0.32, 20)); // the cradle jacket
  E.add('dark', zTube(-1.06, -1.0, 0.34, 0.34, 20));
  E.add('camo', zTube(-0.9, 0.7, 0.1, 0.1, 12, 0, 0.42)); // recoil cylinders over the cradle
  E.add('camo', zTube(-0.9, 0.7, 0.1, 0.1, 12, 0.3, 0.3));
  E.add('camo', zTube(-0.9, 0.7, 0.1, 0.1, 12, -0.3, 0.3));
  for (const z of [-0.6, 0.0, 0.5]) E.add('dark', box(0.8, 0.1, 0.06, 0, 0.38, z));
  const arc = [];
  for (let i = 0; i <= 10; i++) { const f = (110 + 60 * (i / 10)) * Math.PI / 180; arc.push([0.8 * Math.sin(f), -0.8 * Math.cos(f)]); }
  for (let i = 10; i >= 0; i--) { const f = (110 + 60 * (i / 10)) * Math.PI / 180; arc.push([0.62 * Math.sin(f), -0.62 * Math.cos(f)]); }
  E.add('camo', sideProfile(arc, 0.05).applyMatrix4(new THREE.Matrix4().makeTranslation(-0.4, 0, 0)));
  E.add('steel', rod(V(-0.3, 0.1, 0.2), V(-0.5, 0.55, 0.2), 0.02, 6));
  addDialSight(E, -0.5, 0.55, 0.2);
  E.build(el, { dirt: 0.2, y0: ty });

  const rc = pivotAt(rig, el, 'recoil', 0, 0, 0);
  const B = rig.part();
  B.add('dark', zTube(-1.7, -1.25, 0.2, 0.2, 20));
  B.add('steel', zTube(-1.72, -1.7, 0.205, 0.205, 20));
  B.add('dark', zTube(-1.25, -0.4, 0.21, 0.27, 20));
  B.add('dark', zTube(-0.4, 0.8, 0.27, 0.27, 20));
  B.add('dark', zTube(0.5, 0.95, 0.31, 0.31, 20));
  B.add('char', new THREE.CircleGeometry(0.13, 14).translate(0, 0, 0.952));
  B.build(rc, { dirt: 0.1, y0: ty });
  const br = pivotAt(rig, rc, 'breech', 0.33, 0, 0.95);
  const K = rig.part();
  K.add('dark', zTube(0.0, 0.1, 0.27, 0.27, 18, -0.33, 0));
  K.add('steel', box(0.06, 0.5, 0.06, 0, 0, 0.05));
  K.build(br, { dirt: 0 });
  breechSetter(rig, br, 1.8);

  rig.anchors.eye = node(trav, 'eye', 0, 2.4, 1.2);
  rig.anchors.muzzle = node(el, 'muzzle', 0, 0, -1.72);
  rig.anchors.breech = node(el, 'breech', 0, 0, 0.97);
  rig.anchors.tray = node(el, 'tray', 0, -0.25, 0.95);
  rig.anchors.shellStack = node(root, 'shellStack', 1.9, 0.1, 1.0);
  trayShells(rig, rig.anchors.tray, 'm21');
  rig.recoilLength = 0.8;
  rig.loadEl = 0.1;
  crew(rig, 'layer', -1.5, 0.6, L90, 'lay');
  crew(rig, 'loader', 0.3, 2.3, 0, 'ram');
  crew(rig, 'shell', 1.1, 2.0, R90, 'carry');
  crew(rig, 'lanyard', 1.6, 0.9, R90, 'lanyard');
  hb(rig, -1.3, 0, -1.6, 1.3, 2.9, 2.4);
  return finishRig(rig, 'm21', 'm21');
}

export function buildGermanGun(kind) {
  if (kind === 'm21') return moerser();
  if (SPEC[kind]) return fieldGun(kind);
  throw new Error('unknown German gun kind ' + kind);
}
