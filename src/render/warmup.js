import * as THREE from 'three';

// Uploads every geometry and texture in the scene now, behind the loading screen or a change of game, instead
// of in the frame that first sees them. compileAsync builds the shader programs but three.js uploads a mesh's
// buffers and textures only when it is first drawn, so the first look at a battery's scenery (tens of megabytes)
// or at a target built for the new game stalled that frame. One draw of everything (hidden, off-screen and
// detail-culled objects included) into a 4 x 4 target does it; the render target type matches the post chain's
// scene pass, so the programs it needs are the ones the game uses.
// What has nothing to draw yet (an InstancedMesh with count 0, an instanced geometry with instanceCount 0, a draw
// range of 0: the shells in flight of every kind, smoke, glow, debris, clods, flares, the infantry, the crater decals)
// is drawn with one instance or its whole range for this draw: three.js skips a draw of none, so their first real
// draw, the first shot of a new kind of shell, used to be the browser's first draw of them too (half a second on
// the K 38's first round, perf/ 2026-11-15).
//   warmUp(renderer, scene, camera)    -> milliseconds spent
export function warmUp(renderer, scene, camera) {
  const t0 = performance.now();
  const objs = [], vis = [], cull = [], masks = [];
  const empty = [], ranges = [], geos = new Set(); // [object or geometry, key] put back to 0 afterwards
  scene.traverse((o) => {
    // (only where there is room for one: a draw past the end of an instance buffer is a WebGL error)
    if (o.isInstancedMesh && o.count === 0 && o.instanceMatrix.count > 0) { empty.push([o, 'count']); o.count = 1; }
    const g = o.geometry;
    if (g && !geos.has(g)) {
      geos.add(g);
      const room = () => Object.values(g.attributes).every((a) => !a.isInstancedBufferAttribute || a.count > 0);
      if (g.isInstancedBufferGeometry && g.instanceCount === 0 && room()) { empty.push([g, 'instanceCount']); g.instanceCount = 1; }
      if (g.drawRange.count === 0) { ranges.push(g); g.drawRange.count = Infinity; }
    }
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
    // the shadow maps too: before their first pass the materials' shadow samplers have nothing proper to read, and
    // every draw failed (GL_INVALID_OPERATION, a texture format and sampler type mismatch); the game redraws them
    // each frame anyway
    renderer.shadowMap.needsUpdate = true;
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
    for (const [o, k] of empty) o[k] = 0;
    for (const g of ranges) g.drawRange.count = 0;
  }
  return performance.now() - t0;
}

// Resolves once the GPU has done everything asked of it so far (a fence), or after maxMs; the milliseconds waited.
// The browser does a warm-up's draws later, in its own GPU process (Chrome on Windows builds each program's D3D shaders
// at its first draw there), so the frames just after one stalled: 1.5 s on the battle's first frame, as the loading
// screen went (perf/ 2026-11-15). Main waits on this before taking the loading screen away.
//   await gpuSettled(renderer, maxMs = 8000)
export function gpuSettled(renderer, maxMs = 8000) {
  const gl = renderer.getContext();
  if (!gl.fenceSync) return Promise.resolve(0);
  const t0 = performance.now();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return Promise.resolve(0);
  gl.flush();
  return new Promise((resolve) => {
    // (the status is the browser's answer to a question asked earlier: it only changes between tasks, so poll)
    const poll = () => {
      const s = gl.clientWaitSync(sync, 0, 0);
      if (s === gl.TIMEOUT_EXPIRED && performance.now() - t0 < maxMs) { setTimeout(poll, 10); return; }
      gl.deleteSync(sync);
      resolve(performance.now() - t0);
    };
    setTimeout(poll, 0);
  });
}
