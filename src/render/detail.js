import * as THREE from 'three';

// Detail by distance: a mesh whose bounding sphere would cover less than about a pixel is not drawn. A battery
// 7 km away is a hundred meshes of a few metres each, all under a pixel; each still costs a draw call (and one
// more in the shadow pass) whatever its size on screen. The big pieces (pits, earthworks, a dump's sheds) stay
// until they too shrink under the limit, so a far target keeps its shape and a shell camera closing in brings
// the small parts back in good time.
//
// A hidden mesh gets layers.mask = 0: no camera (main or shadow) draws it, and its own visible flag stays free
// for the code that poses and damages it (crew levels of detail, wrecks, mobile targets).
//
//   const detail = new DetailCull();
//   detail.add(key, root)        every mesh under root (now) takes part; add again to re-collect
//   detail.remove(key)           gives the meshes back their layers
//   detail.update(camera)        every frame: a third of the meshes per frame, everything after a camera cut
//   detail.enabled = false       draws everything again (for comparisons)

const REF = 720; // half the height in pixels of the view the limit is set for (1440 rows: generous on 1080p)
const _c = new THREE.Vector3();

export class DetailCull {
  constructor({ minPx = 0.8, slices = 3 } = {}) {
    this.minPx = minPx; // projected radius in pixels under which a mesh is hidden
    this.slices = slices;
    this.groups = new Map();
    this.items = [];
    this.hidden = 0;
    this.enabled = true;
    this._on = true;
    this._i = 0;
    this._all = true;
    this._last = new THREE.Vector3(Infinity, 0, 0);
  }

  add(key, root) {
    this.remove(key);
    root.updateMatrixWorld(true);
    const items = [];
    root.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry) return;
      let s;
      if (o.isInstancedMesh) {
        if (!o.boundingSphere) o.computeBoundingSphere();
        s = o.boundingSphere;
      } else {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        s = o.geometry.boundingSphere;
      }
      if (!s || !Number.isFinite(s.radius) || s.radius < 0) return;
      items.push({ o, s, mask: o.layers.mask, on: true });
    });
    this.groups.set(key, items);
    this._collect();
  }

  remove(key) {
    const items = this.groups.get(key);
    if (!items) return;
    for (const it of items) this._show(it);
    this.groups.delete(key);
    this._collect();
  }

  _collect() {
    this.items = [];
    for (const g of this.groups.values()) for (const it of g) this.items.push(it);
    this._i = 0;
    this._all = true;
  }

  _show(it) {
    if (it.on) return;
    it.on = true;
    it.o.layers.mask = it.mask;
    this.hidden--;
  }

  update(camera) {
    const items = this.items, n = items.length;
    if (!n || !camera) return;
    if (!this.enabled) {
      if (this._on) for (const it of items) this._show(it);
      this._on = false;
      return;
    }
    if (!this._on) this._all = true;
    this._on = true;
    const cam = camera.position;
    // the angle a sphere of minPx pixels' radius subtends, for this field of view
    const t = (this.minPx * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 50) / 2)) / REF;
    // a camera cut (a new unit, a shell to ride) is judged at once, otherwise a slice a frame
    if (this._last.distanceToSquared(cam) > 30 * 30) this._all = true;
    this._last.copy(cam);
    let from = 0, to = n;
    if (!this._all) {
      const per = Math.ceil(n / this.slices);
      from = this._i * per;
      to = Math.min(n, from + per);
      this._i = (this._i + 1) % this.slices;
    }
    this._all = false;
    for (let j = from; j < to; j++) {
      const it = items[j], m = it.o.matrixWorld, s = it.s;
      const r = s.radius * m.getMaxScaleOnAxis();
      _c.copy(s.center).applyMatrix4(m);
      const d = Math.max(0.01, _c.distanceTo(cam) - r);
      // what is shown stays until it is 15 % under the limit, so a mesh on the edge does not flicker
      const on = r > d * t * (it.on ? 0.85 : 1);
      if (on === it.on) continue;
      it.on = on;
      it.o.layers.mask = on ? it.mask : 0;
      this.hidden += on ? -1 : 1;
    }
  }
}
