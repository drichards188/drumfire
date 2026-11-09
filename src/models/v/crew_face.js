// The max tier's head (crew_hd.js PROFILE.max): face and neck as one signed distance field meshed by surface nets at
// 2.5 mm, five face shapes, eyes with a corneal bulge under lids with a margin, lash line and tear line, the caruncle,
// and (bare-headed or capped men only: a helmet hides them) ears of their own finer field. Coordinates are the head's:
// metres from HC (bind space (0, 1.672, 0.008)), the face looking down -Z, +X the man's right. Worker-safe, no DOM.
import { clamp, lerp, sstep, bump, smin, smax, sdEll, sdCap, sdChain, meshSDF } from './crew_sdf.js';

export const HC = [0, 1.672, 0.008];
export const ER = 0.012; // eyeball radius

// Five faces (a man's role picks one): small changes of the skull and features, a few millimetres each, enough that
// no two men side by side are the same man. Keys: eye spacing and height, brow, nose (length, projection, width,
// bridge hump), cheekbones, jaw (width, angle height), chin (projection, width), lips (fullness, width), face length.
export const FACES = [
  { eyeX: 0.0315, eyeY: 0.0, brow: 0.0, noseL: 0.0, noseP: 0.0, noseW: 0.0, hump: 0.0, cheek: 0.0, jawW: 0.0, jawY: 0.0, chin: 0.0, chinW: 0.0, lipU: 0.0, lipL: 0.0, mouthW: 0.0, len: 1.0, ear: 1.0 },
  { eyeX: 0.0325, eyeY: 0.001, brow: 0.0015, noseL: 0.003, noseP: 0.002, noseW: 0.001, hump: 0.0012, cheek: 0.002, jawW: 0.004, jawY: -0.002, chin: 0.001, chinW: 0.003, lipU: -0.0006, lipL: 0.0, mouthW: 0.001, len: 1.03, ear: 1.04 },
  { eyeX: 0.031, eyeY: -0.001, brow: -0.001, noseL: -0.002, noseP: -0.002, noseW: 0.0015, hump: 0.0, cheek: 0.003, jawW: 0.002, jawY: 0.002, chin: -0.002, chinW: 0.0, lipU: 0.0008, lipL: 0.001, mouthW: 0.002, len: 0.97, ear: 0.97 },
  { eyeX: 0.0322, eyeY: 0.0005, brow: 0.001, noseL: 0.001, noseP: 0.003, noseW: -0.001, hump: 0.0022, cheek: -0.002, jawW: -0.003, jawY: 0.0, chin: 0.0015, chinW: -0.002, lipU: -0.0004, lipL: -0.0006, mouthW: -0.001, len: 1.02, ear: 1.02 },
  { eyeX: 0.0308, eyeY: -0.0005, brow: 0.0005, noseL: -0.001, noseP: 0.0, noseW: 0.0005, hump: 0.0006, cheek: 0.001, jawW: 0.005, jawY: 0.001, chin: 0.0, chinW: 0.004, lipU: 0.0004, lipL: 0.0008, mouthW: 0.0015, len: 0.99, ear: 1.0 },
];

// The field: negative inside. F is a face of FACES. The lower face scales by F.len about the eyes.
export function faceField(F) {
  const ex = F.eyeX, ey = F.eyeY, b = F.brow, nL = F.noseL, nP = F.noseP, nW = F.noseW, hu = F.hump;
  const ck = F.cheek, jw = F.jawW, jy = F.jawY, ch = F.chin, cw = F.chinW, lu = F.lipU, ll = F.lipL, mw = F.mouthW, L = F.len;
  const gx = 0.0435 + jw, gy = -0.08 + jy, tz = -0.124 - nP, ty = -0.036 - nL, my = -0.0695, cx2 = 0.0245 + mw;
  // (the chains made once: the field is called a million times a face)
  const RIM = [[0.017, -0.013 + ey, -0.092, 0.003], [ex + 0.001, -0.0175 + ey, -0.0895, 0.0034], [0.05, -0.01 + ey, -0.079, 0.0032]];
  const JAW = [[gx, gy, 0.004, 0.0088], [0.037 + jw * 0.6, -0.103, -0.05, 0.0094], [0.007 + cw * 0.5, -0.1115, -0.086 - ch, 0.0092]];
  const LIPU = [[0, -0.0638, -0.1062 - lu, 0.0029 + lu * 0.4], [0.0035, -0.0632, -0.1062 - lu, 0.003 + lu * 0.4], [0.011, -0.0645, -0.1045 - lu, 0.0028 + lu * 0.3], [0.019, -0.0668, -0.1005, 0.0021], [cx2 - 0.001, my + 0.0004, -0.0965, 0.0013]];
  const LIPL = [[0, -0.0752, -0.1032 - ll, 0.0042 + ll * 0.5], [0.009, -0.0748, -0.1022 - ll, 0.0039 + ll * 0.4], [0.017, -0.0728, -0.099, 0.0026], [cx2 - 0.0015, my - 0.0004, -0.0962, 0.0013]];
  // how far point (px, py, pz) is outside a sphere: a feature whose bounding sphere lies beyond its blend cannot change d
  const out = (px, py, pz, cx, cy, cz, R) => Math.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2) - R;
  return (x, y0, z) => {
    const ax = Math.abs(x);
    const y = y0 < ey ? ey + (y0 - ey) / L : y0; // (a longer face: the lower face's features further down)
    // skull: the cranium, the forehead brought forward and upright, the occiput
    let d = sdEll(x, y, z, 0, 0.022, 0.012, 0.0765, 0.097, 0.099);
    d = smin(d, sdEll(x, y, z, 0, 0.034, -0.042, 0.064, 0.064, 0.056), 0.03);
    // temples: a slight hollow behind the outer ends of the brows
    if (out(ax, y, z, 0.079, 0.026, -0.038, 0.026) < 0.024 - d) d = smax(d, -sdEll(ax, y, z, 0.079, 0.026, -0.038, 0.008, 0.026, 0.02), 0.024);
    // the brow ridges and the glabella between them
    if (out(ax, y, z, 0.027, 0.019 + ey, -0.09 - b, 0.025) < d + 0.014) d = smin(d, sdEll(ax, y, z, 0.027, 0.019 + ey, -0.09 - b, 0.025, 0.0085, 0.012), 0.014);
    if (out(x, y, z, 0, 0.015 + ey, -0.096 - b, 0.012) < d + 0.012) d = smin(d, sdEll(x, y, z, 0, 0.015 + ey, -0.096 - b, 0.012, 0.009, 0.008), 0.012);
    // the eye sockets: room for the eyeballs and lids under the brow
    if (out(ax, y, z, ex, ey + 0.002, -0.094, 0.02) < 0.009 - d) d = smax(d, -sdEll(ax, y, z, ex, ey + 0.002, -0.094, 0.02, 0.0145, 0.016), 0.009);
    // midface: the maxilla under the eyes, the cheekbones and their arches back to the ears
    d = smin(d, sdEll(x, y, z, 0, -0.04, -0.06, 0.05, 0.046, 0.045), 0.024);
    if (out(ax, y, z, 0.047 + ck * 0.5, -0.019, -0.066, 0.017 + ck) < d + 0.02) d = smin(d, sdEll(ax, y, z, 0.047 + ck * 0.5, -0.019, -0.066, 0.017 + ck, 0.012, 0.017), 0.02);
    if (out(ax, y, z, 0.06, -0.017, -0.032, 0.027) < d + 0.016) d = smin(d, sdCap(ax, y, z, 0.055 + ck * 0.5, -0.018, -0.054, 0.064, -0.016, -0.01, 0.0042, 0.0036), 0.016);
    // the lower rim of the socket, a soft tear trough inside it
    if (out(ax, y, z, 0.033, -0.013 + ey, -0.086, 0.022) < d + 0.007) d = smin(d, sdChain(ax, y, z, RIM), 0.007);
    if (out(ax, y, z, 0.022, -0.016 + ey, -0.099, 0.012) < 0.004 - d) d = smax(d, -sdCap(ax, y, z, 0.016, -0.0125 + ey, -0.1002, 0.028, -0.02 + ey, -0.0985, 0.0042, 0.0038), 0.004);
    // the cheeks' fat pads, the fold between them and the upper lip (shallow: young men)
    if (out(ax, y, z, 0.034, -0.043, -0.082, 0.022) < d + 0.018) d = smin(d, sdEll(ax, y, z, 0.034, -0.043, -0.082, 0.018, 0.022, 0.013), 0.018);
    if (out(ax, y, z, 0.026, -0.059, -0.099, 0.022) < 0.005 - d) d = smax(d, -sdCap(ax, y, z, 0.0205 + nW, -0.043 - nL * 0.4, -0.1035, 0.032 + mw, -0.075, -0.0935, 0.0038, 0.0034), 0.005);
    // the lower face's mass: full cheeks over the jaw (no hollow between the cheekbone and the jawline)
    d = smin(d, sdEll(x, y, z, 0, -0.064, -0.03, 0.041 + jw * 0.6, 0.042, 0.05), 0.026);
    // jaw: the ramus up to the ear, the body of the mandible to the chin
    if (out(ax, y, z, 0.05, -0.054, 0.008, 0.036) < d + 0.022) d = smin(d, sdCap(ax, y, z, gx, gy, 0.004, 0.057, -0.028, 0.012, 0.0088, 0.0085), 0.022);
    if (out(ax, y, z, 0.03, -0.1, -0.045, 0.06) < d + 0.022) d = smin(d, sdChain(ax, y, z, JAW), 0.022);
    // chin pad and the groove over it
    if (out(x, y, z, 0, -0.103, -0.087 - ch, 0.02 + cw) < d + 0.014) d = smin(d, sdEll(x, y, z, 0, -0.103, -0.087 - ch, 0.017 + cw, 0.012, 0.011), 0.014);
    if (out(x, y, z, 0, -0.0885, -0.102 - ch * 0.5, 0.016) < 0.005 - d) d = smax(d, -sdCap(x, y, z, -0.012, -0.0885, -0.102 - ch * 0.5, 0.012, -0.0885, -0.102 - ch * 0.5, 0.0022, 0.0022), 0.005);
    // under the chin to the neck
    if (out(x, y, z, 0, -0.104, -0.056, 0.04) < d + 0.018) d = smin(d, sdEll(x, y, z, 0, -0.104, -0.056, 0.03 + jw * 0.5, 0.013, 0.036), 0.018);
    // nose: bridge, dorsum, tip, wings, columella, nostrils
    if (out(x, y, z, 0, -0.024, -0.106, 0.04) < d + 0.012) {
      d = smin(d, sdCap(x, y, z, 0, 0.006 + ey, -0.097, 0, -0.013 - nL * 0.4, -0.106 - nP * 0.4 - hu, 0.0058, 0.0066), 0.012);
      d = smin(d, sdCap(x, y, z, 0, -0.013 - nL * 0.4, -0.106 - nP * 0.4 - hu, 0, ty + 0.004, tz + 0.006, 0.0066, 0.0072), 0.006);
      d = smin(d, sdEll(x, y, z, 0, -0.022 - nL * 0.6, -0.098, 0.0125 + nW * 0.5, 0.022, 0.012), 0.01); // the side walls
      d = smin(d, sdEll(x, y, z, 0, ty, tz + 0.0032, 0.0104 + nW * 0.3, 0.0086, 0.0088), 0.0065);
      d = smin(d, sdEll(ax, y, z, 0.0122 + nW, ty - 0.0048, -0.1038 - nP * 0.4, 0.006, 0.0056, 0.0078), 0.0076);
      d = smin(d, sdCap(x, y, z, 0, ty - 0.006, tz + 0.006, 0, -0.0495 - nL * 0.8, -0.105, 0.0032, 0.0034), 0.004);
      d = smax(d, -sdEll(ax, y, z, 0.0062 + nW * 0.5, ty - 0.0128, -0.1095 - nP * 0.4, 0.0042, 0.0036, 0.0052), 0.0025);
    }
    // the mouth: the muzzle of the lips, the shallow philtrum, the lips, the parting, the corners
    if (out(x, y, z, 0, my, -0.095, 0.04) < d + 0.014) {
      d = smin(d, sdEll(x, y, z, 0, my, -0.088, 0.026 + mw, 0.018, 0.0135), 0.014);
      d = smax(d, -sdCap(x, y, z, 0, -0.052 - nL * 0.8, -0.1118, 0, -0.0602, -0.1128, 0.0042, 0.0036), 0.003);
      // the lips as rolled shapes: the upper with its bow (two peaks either side of the philtrum, a dip between), the
      // lower fuller in the middle; thin at the corners
      d = smin(d, sdChain(ax, y, z, LIPU), 0.003);
      d = smin(d, sdChain(ax, y, z, LIPL), 0.0034);
      d = smax(d, -sdEll(x, y, z, 0, my, -0.1118, 0.0245 + mw, 0.0022, 0.0062), 0.0022);
      d = smax(d, -sdEll(ax, y, z, 0.0248 + mw, my - 0.0004, -0.0985, 0.0042, 0.0036, 0.0045), 0.004);
    }
    // neck: the column (from under the jaw, so the jawline stays clean), the nape up to the skull, the two
    // sternocleidomastoids, the larynx (in the field, so it meets the jaw without a seam)
    if (y0 < 0.025) {
      d = smin(d, sdCap(x * 1.02, y0, z, 0, -0.112, 0.026, 0, -0.26, 0.014, 0.05, 0.057), 0.026);
      d = smin(d, sdCap(x * 0.9, y0, z, 0, -0.05, 0.05, 0, -0.17, 0.04, 0.036, 0.042), 0.03);
      if (y0 < -0.01) d = smin(d, sdCap(ax, y0, z, 0.055, -0.045, 0.026, 0.014, -0.235, -0.036, 0.0115, 0.009), 0.016);
      if (out(x, y0, z, 0, -0.158, -0.041, 0.012) < d + 0.012) d = smin(d, sdEll(x, y0, z, 0, -0.158, -0.041, 0.0085, 0.012, 0.0062), 0.012);
    }
    return d;
  };
}

// bone weights of a head and neck vertex: [head weight] (the rest the neck's): the face and skull on the head, the
// throat and the neck's back on the neck, blended between (so a turn of the head bends the skin, not a seam)
export function headWeight(x, y, z) {
  return sstep(-0.165, -0.085, y + 0.55 * Math.max(0, -z - 0.035) + 0.25 * Math.max(0, z - 0.04));
}

// where the max head's mesh is kept: under a helmet only what shows below its rim (with a margin up into it), under a
// cap below its band, bare-headed all; and the neck down inside the collar
export function headKeep(kind) {
  const neckEnd = (y) => y > -0.205;
  if (kind === 'helmet35' || kind === 'helmet16') {
    const m35 = kind === 'helmet35';
    return (x, y, z) => {
      if (!neckEnd(y)) return false;
      const a = Math.atan2(x, -(z - 0.004)), F = Math.max(0, Math.cos(a)), Bk = Math.max(0, -Math.cos(a));
      const rim = m35 ? 1.618 + 0.082 * F ** 2 - 0.026 * Bk ** 1.3 : 1.6 + 0.104 * F ** 2 - 0.034 * Bk ** 1.3;
      return y < rim - HC[1] + 0.028 + 0.022 * (1 - F) * (1 - Bk);
    };
  }
  if (kind === 'cap') return (x, y) => neckEnd(y) && y < 0.018;
  return (x, y) => neckEnd(y);
}

// the lattice box of the head and neck (head coordinates)
export const HEAD_BOX = [-0.094, -0.225, -0.142, 0.094, 0.125, 0.122];

// the head and neck of face F, cut for the headgear: { pos, nrm, idx } in head coordinates (a generator)
export function* meshFace(F, kind, H = 0.0025) {
  return yield* meshSDF(faceField(F), HEAD_BOX, H, { keep: headKeep(kind), relax: 2, coarse: 4 });
}

// ---------------------------------------------------------------- the eyes

// The eyeball's surface radius along a direction at angle t from its axis: the sclera's sphere and the cornea's,
// a sphere of 7.8 mm whose apex stands 2.4 mm proud of the sclera, blended over the limbus.
export function eyeRadius(t) {
  const c = ER + 0.0024 - 0.0078, ct = Math.cos(t);
  // the cornea's sphere seen from the eyeball's centre: r with r^2 - 2 r c cos t + c^2 = 0.0078^2
  const disc = (c * ct) ** 2 - (c * c - 0.0078 ** 2), rc = disc > 0 ? c * ct + Math.sqrt(disc) : 0;
  return smax(ER, rc, 0.0006);
}

// A grid of rows of points (each row the same length) as triangles: { pos, nrm (from the faces), idx }; flip reverses
// the winding. Normals are left for the caller (crew_hd.js computes and welds them).
export function gridArrays(rows, flip = false) {
  const n = rows.length, m = rows[0].length, pos = new Float32Array(n * m * 3), idx = [];
  rows.forEach((r, k) => r.forEach((p, i) => pos.set(p, (k * m + i) * 3)));
  for (let k = 0; k < n - 1; k++) for (let i = 0; i < m - 1; i++) {
    const a = k * m + i, b = a + m, c = a + 1, d = b + 1;
    if (flip) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
  }
  return { pos, idx: Uint32Array.from(idx) };
}

// The lids of eye s (-1 the man's left, +1 his right) of face F, as rows of points from the margin outward:
// { upper, lower, lashLine, lashes, tearLine, canthi }. The margin rests on the eyeball (eyeRadius) and has a
// thickness; the upper lid has its crease and the fold of skin over it; the outer rows sink under the face (the caller
// projects them onto the field) so lid and face meet without a seam. Parametrised by u across the eye (0 at the inner
// corner, 1 at the outer) and the elevation angle about the eye's centre.
export function lidRows(F, s, NA = 34) {
  const C = [s * F.eyeX, F.eyeY, -0.080], A0 = -1.0, A1 = 1.18; // horizontal angle from the nose side to the ear side
  const pt = (al, el, r) => [C[0] + s * Math.sin(al) * Math.cos(el) * r, C[1] + Math.sin(el) * r, C[2] - Math.cos(al) * Math.cos(el) * r];
  const rEye = (al, el) => eyeRadius(Math.acos(clamp(Math.cos(al) * Math.cos(el), -1, 1)));
  const corner = (u) => lerp(-0.035, 0.055, u); // the outer corner higher than the inner (canthal tilt)
  const up = (u) => corner(u) + 0.415 * Math.sin(Math.PI * u) ** 0.85 * (1 + 0.18 * (0.42 - u));
  const lo = (u) => corner(u) - 0.395 * Math.sin(Math.PI * u) ** 0.95 * (1 + 0.12 * (u - 0.58));
  const T = 0.0019; // the lid's thickness at its margin
  const upper = [], lower = [], lashLine = [], lashes = [[], []], tearLine = [];
  // rows of the upper lid: [elevation above the margin, radius over the eyeball's]: the margin's inner and outer edge,
  // the tarsal plate, the crease, the fold over it, then up under the brow
  const UR = [[0, 0.0001], [0.012, T], [0.06, T + 0.0003], [0.16, T + 0.0006], [0.26, T + 0.0007], [0.34, T + 0.0004], [0.4, T + 0.0011], [0.47, T + 0.0024], [0.56, T + 0.003], [0.68, T + 0.0033], [0.82, T + 0.0033], [0.98, T + 0.003]];
  const LR = [[0, 0.0001], [-0.012, T * 0.85], [-0.07, T * 0.85 + 0.0005], [-0.15, T * 0.85 + 0.0011], [-0.24, T * 0.85 + 0.0013], [-0.34, T * 0.85 + 0.001], [-0.46, T * 0.85 + 0.0012], [-0.6, T * 0.85 + 0.0018]];
  const row = (edge, R, k) => {
    const out = [];
    for (let i = 0; i <= NA; i++) {
      const u = i / NA, al = lerp(A0, A1, u), e = edge(u), w = Math.sin(Math.PI * u) ** 0.5; // (the rows close up at the corners)
      const el = e + R[k][0] * w, r = rEye(al, el) + R[k][1] * (0.35 + 0.65 * w);
      out.push(pt(al, el, r));
    }
    return out;
  };
  for (let k = 0; k < UR.length; k++) upper.push(row(up, UR, k));
  for (let k = 0; k < LR.length; k++) lower.push(row(lo, LR, k));
  // the lash line along the upper margin's outer edge, the lashes as a strip curling up and out from it, the wet line
  // where the lower lid meets the eyeball
  for (let i = 0; i <= NA; i++) {
    const u = i / NA, al = lerp(A0, A1, u), w = Math.sin(Math.PI * u) ** 0.5, e = up(u), el = e + 0.012 * w, r = rEye(al, el) + T * (0.35 + 0.65 * w);
    lashLine.push(pt(al, el, r + 0.0001));
    const len = (0.0012 + 0.0016 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7) * (0.85 + 0.3 * ((i * 7) % 5) / 4);
    lashes[0].push(pt(al, el + 0.004, r + 0.0002));
    lashes[1].push(pt(al, el + 0.07 + len * 14, r + len * 0.9));
    const le = lo(u) - 0.004 * w;
    tearLine.push(pt(al, le, rEye(al, le) + 0.00025));
  }
  return { upper, lower, lashLine, lashes, tearLine, C, at: pt, inner: pt(A0, corner(0) - 0.01, rEye(A0, 0) + 0.0012), outer: pt(A1, corner(1), rEye(A1, 0) + 0.0008) };
}

// ---------------------------------------------------------------- the face's colour and its masks

// Paint of a head vertex at head coordinates (x, y, z) for face F: out.c the colour (linear rgb, from the man's skin,
// hair, lip and stubble colours and his tints), out.r the roughness, out.m the masks the shader's skin detail reads
// [beard, brow, hair, lip]. Regional colour as on a real face: a yellower forehead, redder nose, cheeks and lips, the
// blue-grey of a shaved beard, brows and the cropped hair at the sides and the nape.
export function headPaint(x, y, z, F, P, out) {
  const ax = Math.abs(x), ey = F.eyeY;
  const y1 = y < ey ? ey + (y - ey) / F.len : y; // (the lower face scaled as in the field)
  // lips: the vermilion of each lip, soft at its border
  const lipU = clamp(1 - Math.max(0, sdEll(x, y1, z, 0, -0.0645, -0.1025, 0.0225 + F.mouthW, 0.0052, 0.0075)) / 0.0018, 0, 1);
  const lipL = clamp(1 - Math.max(0, sdEll(x, y1, z, 0, -0.0758, -0.1005, 0.0195 + F.mouthW, 0.0062, 0.0082)) / 0.0018, 0, 1);
  const lip = Math.max(lipU, lipL) * sstep(-0.1, -0.096, -z);
  // the beard's zone: jaw, chin, upper lip, the cheeks below a line from the ear to the mouth corner; not the lips
  const below = sstep(-0.05, -0.066, y1 + 0.28 * Math.max(0, ax - 0.024) - 0.25 * Math.max(0, z + 0.03)) * sstep(-0.01, 0.01, -z - 0.0);
  const upperLip = bump(-0.064, -0.047, y1) * (1 - sstep(0.016, 0.026, ax)) * sstep(0.095, 0.1, -z);
  const neckFront = sstep(-0.115, -0.13, y) * sstep(0.0, 0.03, -z) * (1 - sstep(-0.19, -0.165, -y - 0.0)) ;
  const beard = clamp(Math.max(below * (1 - sstep(0.06, 0.07, ax + Math.max(0, z) * 2)), upperLip, neckFront * 0.7) * (1 - lip), 0, 1) * sstep(-0.004, 0.006, -z + 0.06);
  // brows: a band along the brow ridge, thicker at the inner end, thinning out at the outer
  const bc = 0.0205 + ey + 0.55 * (ax - 0.027) ** 2 * 10 - 0.002 * sstep(0.02, 0.012, ax);
  const bw = lerp(0.0042, 0.0018, sstep(0.016, 0.05, ax));
  const brow = (1 - sstep(bw * 0.6, bw, Math.abs(y - bc))) * sstep(0.009, 0.015, ax) * (1 - sstep(0.048, 0.056, ax)) * sstep(0.07, 0.08, -z);
  // cropped hair: the back and sides of the head above the nape's line and the tops of the ears, short sideburns
  const nape = -0.062 + 0.05 * sstep(0.03, 0.07, ax) - 0.01 * sstep(0.02, -0.02, z);
  const hairBack = sstep(nape - 0.004, nape + 0.004, y) * sstep(-0.045, -0.025, z);
  const side = sstep(0.062, 0.07, ax) * sstep(-0.03, -0.022, y) * sstep(-0.034, -0.026, z) * (1 - sstep(0.0, 0.008, -z - 0.012) * (1 - sstep(-0.01, 0.0, y)));
  const top = sstep(0.045, 0.06, y + 0.4 * Math.max(0, -z - 0.04));
  const hair = clamp(Math.max(hairBack, side, top), 0, 1) * (1 - brow);
  // colour
  const c = out.c;
  c[0] = P.skin[0]; c[1] = P.skin[1]; c[2] = P.skin[2];
  const mix = (t, k) => { c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; };
  const fore = sstep(0.025, 0.05, y) * sstep(0.06, 0.08, -z);
  mix([P.skin[0] * 1.03, P.skin[1] * 1.0, P.skin[2] * 0.9], 0.6 * fore);
  const cheek = Math.max(0, 1 - Math.hypot(ax - 0.042, (y1 + 0.03) * 1.2, (z + 0.08) * 1.4) / 0.026);
  const nose = Math.max(0, 1 - Math.hypot(x / 1.3, (y1 + 0.036) * 1.1, (z + 0.12) * 1.2) / 0.016);
  const ear = sstep(0.068, 0.075, ax) * sstep(-0.02, 0.005, z);
  mix(P.flush, 0.16 * cheek * P.ruddy + 0.2 * nose * P.ruddy + 0.18 * ear);
  // around the eyes: the lids a little darker and the inner corners redder
  const sock = Math.max(0, 1 - Math.hypot((ax - F.eyeX) / 0.022, (y - ey - 0.004) / 0.018, (z + 0.09) / 0.03));
  c[0] *= 1 - 0.06 * sock; c[1] *= 1 - 0.08 * sock; c[2] *= 1 - 0.07 * sock;
  mix(P.stubble, P.beard * 0.14 * beard);
  mix(P.lip, 0.62 * lip);
  mix(P.brow, 0.75 * brow);
  mix(P.hair, 0.8 * hair);
  // (skin a little rough: a single lobe at 0.5 or less reads as plastic)
  out.r = lip ? lerp(0.58, 0.38, lip) : 0.58;
  out.r = lerp(out.r, 0.48, 0.7 * fore + 0.6 * nose);
  out.r = lerp(out.r, 0.66, beard * 0.6);
  out.r = lerp(out.r, 0.72, Math.max(hair, brow));
  out.m[0] = beard; out.m[1] = brow; out.m[2] = hair; out.m[3] = lip;
  return out;
}

// ---------------------------------------------------------------- the ears (men in caps or bare-headed)

// The ear of side s in its own frame: u up the ear, v back along it, w out of it. A shell 62 mm tall: the helix's
// rolled rim round the top and back to the lobe, the antihelix and its two crura inside it, the scapha between them,
// the concha's bowl, the tragus and antitragus, the lobe.
function earLocal(u, v, w) {
  let d = sdEll(u, v, w, 0.002, 0.006, 0.0, 0.03, 0.0165, 0.0042);
  d = smin(d, sdEll(u, v, w, -0.023, 0.007, 0.0005, 0.0095, 0.009, 0.0048), 0.006); // lobe
  // the helix: from its root over the concha, up over the top and down the back
  d = smin(d, sdChain(u, v, w, [[0.004, -0.004, 0.0035, 0.0018], [0.016, -0.007, 0.0045, 0.0026], [0.027, -0.002, 0.0048, 0.003], [0.031, 0.008, 0.0045, 0.003], [0.024, 0.019, 0.004, 0.003], [0.01, 0.0225, 0.0035, 0.0029], [-0.006, 0.0205, 0.0028, 0.0026], [-0.016, 0.0155, 0.0022, 0.0022]]), 0.0022);
  // the scapha: a groove inside the rim
  d = smax(d, -sdChain(u, v, w, [[0.024, 0.0, 0.0072, 0.0016], [0.026, 0.009, 0.007, 0.0019], [0.019, 0.0165, 0.0065, 0.002], [0.006, 0.018, 0.006, 0.0019], [-0.008, 0.0155, 0.0055, 0.0015]]), 0.0022);
  // the antihelix up from the antitragus, forking into its crura
  d = smin(d, sdChain(u, v, w, [[-0.012, 0.011, 0.0045, 0.0021], [0.0, 0.0135, 0.005, 0.0023], [0.011, 0.0115, 0.005, 0.002], [0.02, 0.0045, 0.0045, 0.0016]]), 0.0026);
  d = smin(d, sdCap(u, v, w, 0.011, 0.0115, 0.005, 0.014, -0.0005, 0.0045, 0.0018, 0.0014), 0.0024);
  // the concha: the bowl in front of the antihelix, down to the ear canal
  d = smax(d, -sdEll(u, v, w, -0.002, 0.0035, 0.0074, 0.0105, 0.0078, 0.0068), 0.0026);
  d = smax(d, -sdEll(u, v, w, -0.004, -0.002, 0.002, 0.0034, 0.0032, 0.006), 0.002);
  // tragus and antitragus
  d = smin(d, sdEll(u, v, w, -0.0135, 0.0065, 0.0045, 0.0032, 0.0034, 0.0028), 0.002);
  return d;
}
// the ear's frame in head coordinates: its centre, its axes (tilted back 15 degrees, standing out 22 at the back)
export function earFrame(F, s) {
  const k = F.ear, tb = 0.26, out = 0.38;
  const U = [0, Math.cos(tb), Math.sin(tb)], V0 = [0, -Math.sin(tb), Math.cos(tb)], W0 = [s, 0, 0];
  const V = V0.map((a, i) => a * Math.cos(out) + W0[i] * Math.sin(out)), W = W0.map((a, i) => a * Math.cos(out) - V0[i] * Math.sin(out));
  return { O: [s * 0.0705, -0.019, 0.007], U, V, W, k: k * 1.04 };
}
export function earField(F, s) {
  const { O, U, V, W, k } = earFrame(F, s);
  return (x, y, z) => {
    const px = x - O[0], py = y - O[1], pz = z - O[2];
    return earLocal((px * U[0] + py * U[1] + pz * U[2]) / k, (px * V[0] + py * V[1] + pz * V[2]) / k, (px * W[0] + py * W[1] + pz * W[2]) / k) * k;
  };
}
// the ear of side s meshed at H (1.1 mm), the part inside the head left out: { pos, nrm, idx } in head coordinates
export function* meshEar(F, s, H = 0.0015) {
  const f = earField(F, s), head = faceField(F), { O } = earFrame(F, s);
  const box = [O[0] - 0.03, O[1] - 0.04, O[2] - 0.034, O[0] + 0.03, O[1] + 0.04, O[2] + 0.034];
  return yield* meshSDF(f, box, H, { keep: (x, y, z) => head(x, y, z) > -0.0012, relax: 1, coarse: 4 });
}
