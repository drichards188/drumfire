import * as THREE from 'three';

// Uploads every geometry and texture in the scene now, behind the loading screen or a change of game, instead
// of in the frame that first sees them. compileAsync builds the shader programs but three.js uploads a mesh's
// buffers and textures only when it is first drawn, so the first look at a battery's scenery (tens of megabytes)
// or at a target built for the new game stalled that frame. One draw of everything (hidden, off-screen and
// detail-culled objects included) into a 4 x 4 target does it; the render target type matches the post chain's
// scene pass, so the programs it needs are the ones the game uses.
//   warmUp(renderer, scene, camera)    -> milliseconds spent
export function warmUp(renderer, scene, camera) {
  const t0 = performance.now();
  const objs = [], vis = [], cull = [], masks = [];
  scene.traverse((o) => {
    if (o.visible && !o.frustumCulled && o.layers.mask !== 0) return;
    objs.push(o); vis.push(o.visible); cull.push(o.frustumCulled); masks.push(o.layers.mask);
    o.visible = true;
    o.frustumCulled = false;
    if (o.layers.mask === 0) o.layers.mask = 1;
  });
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
  } catch (e) {
    console.warn('warm-up draw failed:', e.message);
  } finally {
    renderer.setRenderTarget(prev);
    rt.dispose();
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      o.visible = vis[i]; o.frustumCulled = cull[i]; o.layers.mask = masks[i];
    }
  }
  return performance.now() - t0;
}
