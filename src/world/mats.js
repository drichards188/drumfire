import * as THREE from 'three';
import { patchMaterial } from '../shaderlib.js';
import { plainWorldMats } from './textures.js';

// Materials of the world dressing: the textures and the plain materials are textures.js; here they are patched for
// the battlefield's fog and lights, and the camouflage scrim for the cutaway round the unit the camera orbits.


// The cutaway: camouflage scrim between the camera and what it looks at (the selected gun) is not
// drawn, so the nets never hide the gun the player is working. main.js sets a (camera), b (focus) and
// r each frame; r = 0 turns it off. The hole widens toward the focus to clear a whole gun.
// `p` adds the selected unit's own nets: drawn back over each of its pieces (x, z, radius; radius 0 = unused),
// as a crew in action would, so a battery spread over 120 m shows every gun, not only the one at the focus.
export const CUTAWAY = {
  a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3() }, r: { value: 0 },
  p: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
};
const cutaway = (shader) => {
  shader.uniforms.uCutA = CUTAWAY.a;
  shader.uniforms.uCutB = CUTAWAY.b;
  shader.uniforms.uCutR = CUTAWAY.r;
  shader.uniforms.uCutP = CUTAWAY.p;
  shader.fragmentShader = 'uniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutR;\nuniform vec3 uCutP[4];\n' + shader.fragmentShader.replace(
    '#include <alphatest_fragment>',
    `#include <alphatest_fragment>
    #ifdef USE_FOG
    if (uCutR > 0.0) {
      vec3 ab = uCutB - uCutA;
      float h = clamp(dot(vFogWorldPos - uCutA, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
      if (length(vFogWorldPos - uCutA - ab * h) < uCutR * (0.35 + 0.9 * h)) discard;
    }
    for (int i = 0; i < 4; i++) if (uCutP[i].z > 0.0 && length(vFogWorldPos.xz - uCutP[i].xy) < uCutP[i].z) discard;
    #endif`
  );
};

// the rolled front edge of a net is hessian: it goes with the selected unit's nets when they are drawn back
// (only the per-piece discs, not the camera line, so screens and shelters elsewhere stay put)
const cutawayRoll = (shader) => {
  shader.uniforms.uCutP = CUTAWAY.p;
  shader.fragmentShader = 'uniform vec3 uCutP[4];\n' + shader.fragmentShader.replace(
    '#include <alphatest_fragment>',
    `#include <alphatest_fragment>
    #ifdef USE_FOG
    for (int i = 0; i < 4; i++) if (uCutP[i].z > 0.0 && length(vFogWorldPos.xz - uCutP[i].xy) < uCutP[i].z) discard;
    #endif`
  );
};

let MATS = null;
export function worldMats() {
  if (MATS) return MATS;
  const m = plainWorldMats();
  const patches = { scrim: ['scrim-cutaway', cutaway], hessian: ['hessian-cutaway', cutawayRoll] };
  for (const [k, v] of Object.entries(m)) patchMaterial(v, patches[k]?.[0] ?? 'fog', patches[k]?.[1]);
  MATS = m;
  return m;
}
