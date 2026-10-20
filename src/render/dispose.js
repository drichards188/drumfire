// Frees what models taken out of the scene held on the GPU: their geometries, materials and textures, unless
// something still in the scene uses them (builders share materials and textures between models). three.js keeps
// a removed model's buffers (and, through its vertex array cache, the arrays behind them) until dispose is called.
//   disposeDetached(scene, [root, ...])    after scene.remove(root)
export function disposeDetached(scene, roots) {
  const geoms = new Set(), mats = new Set();
  for (const root of roots) root?.traverse((o) => {
    if (o.geometry) geoms.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) mats.add(m);
  });
  if (!geoms.size && !mats.size) return;
  const usedG = new Set(), usedM = new Set(), usedT = new Set();
  scene.traverse((o) => {
    if (o.geometry) usedG.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) usedM.add(m);
  });
  for (const m of usedM) for (const v of Object.values(m)) if (v?.isTexture) usedT.add(v);
  for (const g of geoms) if (!usedG.has(g)) g.dispose();
  for (const m of mats) {
    if (usedM.has(m)) continue;
    for (const v of Object.values(m)) if (v?.isTexture && !usedT.has(v)) v.dispose();
    m.dispose();
  }
}
