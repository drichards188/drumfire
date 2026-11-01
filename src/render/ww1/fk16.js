import * as THREE from 'three';
import { smooth } from '../anim.js';

// The 7.7 cm FK 16's drill for render/crews.js (see render/crews_ww1.js for what this module may export).
// Six men, drilled as a light gun on the cycle clock: the Geschützführer off the left points, the layer works the
// sight and both handwheels on the left, the breech-worker (loader) steps up beside the block, swings the lever and
// slides the block open, the shell man brings the fixed round (the shell in its brass case, one piece) up the right
// and lines it up in the open breech, and the breech-worker pushes it home by hand in the ram (no staff: the round
// goes in in one movement), shuts the block and steps back; the lanyard man fires from the right, the second
// ammunition number sets the time fuzes at the baskets. The table's load has no cartridge step.
export const ROLES = { officer: 'cmd', layer: 'lay', loader: 'breech', shell: 'carry', ammo: 'idle', lanyard: 'lan' };
export const LIGHT = true;
export const TIMED = true;
export const STAFF = 1.2; // (no rammer: the staff is never drawn)

const _a = new THREE.Vector3();
let BRASS = null, CASE = null;
const brass = () => (BRASS ??= new THREE.MeshStandardMaterial({ color: 0xa8843e, roughness: 0.38, metalness: 0.8 }));
// the brass case (models/v/de/fk16.js caseGeometry; drawn again here so the crews do not load the gun's module): its
// base at z = 0, the mouth 0.23 m forward
const caseGeometry = () => (CASE ??= new THREE.LatheGeometry([[0.0001, -0.226], [0.038, -0.23], [0.039, -0.218], [0.042, -0.2], [0.0435, -0.012],
  [0.05, -0.01], [0.05, 0], [0.012, 0], [0.012, 0.004], [0.0001, 0.004]].map(([r, z]) => new THREE.Vector2(r, z)), 20).rotateX(Math.PI / 2));

// the carried shells (crews.js's shellA in hand and on the tray, shellB at the stack) become whole rounds: the shell
// moved forward in its case, the group's origin at the round's middle, so the ram's end (the shell's half length plus
// 0.12 m past the breech anchor) leaves the case's base flush in the chamber
function makeRounds(crew) {
  const len = crew.slen + 0.23 - 0.03; // models/v/de/fk16.js CASE: 0.23 m case, the shell seated 0.03 m in it
  for (const g of [crew.shellA, crew.shellB]) {
    for (const m of g.children) m.position.z = -len / 2 + crew.slen / 2;
    const c = new THREE.Mesh(caseGeometry(), brass());
    c.position.z = len / 2;
    c.castShadow = true;
    g.add(c);
  }
  crew.fk16Len = len;
}

export function state(crew) {
  if (crew.fk16Len == null) makeRounds(crew);
  return false;
}

export function act(crew, m, c, h) {
  if (m.role === 'ammo') {
    // crouched at the baskets with the fuze key, standing for the shot
    m.put(h.x, h.y, h.z, h.h, c.st === 'ready' ? 'stand' : 'crouch', crew.idleT + m.seed);
    return true;
  }
  if (m.role !== 'loader' || c.s !== 'ram' || crew.shellA_a == null) return false;
  // the breech-worker pushes the round home with both hands on the case's base, leaning in after it
  const k = c.k, push = smooth(k, 0.18, 0.72);
  if (!crew.loaderAt(m, c, h, 'push', push)) m.put(h.x, h.y, h.z, h.h, 'push', push);
  crew.trayAt(crew.shellA_a - crew.fk16Len / 2 - 0.02, _a);
  const g = smooth(k, 0, 0.14) * (1 - smooth(k, 0.74, 0.9));
  m.hand('R', _a.x + crew.rt.x * 0.03, _a.y, _a.z + crew.rt.z * 0.03, g);
  m.hand('L', _a.x - crew.rt.x * 0.03, _a.y - 0.02, _a.z - crew.rt.z * 0.03, g);
  return true;
}
