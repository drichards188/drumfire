// The WW1 German mode's map reference, used by the sim's reports (theatre.ref) and the console (ui/theatre.js TH.ref).
// Node-safe, no imports. Owned by the integration agent.
//
// A four-figure square of one kilometre (two figures east, two north), its quarter a b c d (NW, NE, SW, SE as on
// the British sheets) and a small square of 100 m numbered 1 to 25 across the quarter in rows from its north-west
// corner: "7037 b 13". The word Planquadrat (grid square) is period; the form of the reference is the game's own
// (docs/WW1.md 1.6: how a 1918 German reference was written is not documented), chosen because the console's board
// draws a kilometre grid in the metric modes and this reference names its squares.
//
// The net's origin sits so that the whole map has two-figure numbers: the British gun line is near 6040, our guns on
// the ridge in the 67 to 76 columns. Northing grows to the north (z falls); the squares' edges are the board's lines.
const E0 = 60000, N0 = 40000; // metres added to x and taken from z, so the squares count 0..99 across 100 km

const wrap = (n) => ((n % 100) + 100) % 100;
const two = (n) => String(wrap(n)).padStart(2, '0');

// Planquadrat, quarter and small square of a world point (metres): { sq: '7037', q: 'b', k: 13 }
export function ww1Square(x, z) {
  const e = E0 + x, n = N0 - z;
  const ce = Math.floor(e / 1000), cn = Math.floor(n / 1000);
  const fe = e - ce * 1000, fn = n - cn * 1000; // metres into the square from its south-west corner
  const east = fe >= 500, north = fn >= 500;
  const q = north ? (east ? 'b' : 'a') : (east ? 'd' : 'c');
  const qe = fe - (east ? 500 : 0), qn = fn - (north ? 500 : 0); // into the quarter
  const col = Math.min(4, Math.floor(qe / 100)), row = Math.min(4, Math.floor((500 - qn) / 100)); // rows from the north
  return { sq: `${two(ce)}${two(cn)}`, q, k: row * 5 + col + 1 };
}

// "7037 b 13": the reference as the observers write it on the message form
export function ww1Ref(x, z) {
  const s = ww1Square(x, z);
  return `${s.sq} ${s.q} ${s.k}`;
}

// the centre of a reference's small square (or of its quarter, or square, when the rest is left off): { x, z } or null
export function fromWW1Ref(ref) {
  const m = /^\s*(\d{2})(\d{2})(?:\s*([abcd])(?:\s*(\d{1,2}))?)?\s*$/i.exec(String(ref));
  if (!m) return null;
  let e = Number(m[1]) * 1000, n = Number(m[2]) * 1000;
  if (!m[3]) return { x: e + 500 - E0, z: N0 - (n + 500) };
  const q = m[3].toLowerCase();
  e += q === 'b' || q === 'd' ? 500 : 0;
  n += q === 'a' || q === 'b' ? 500 : 0;
  const k = Math.min(25, Math.max(1, Number(m[4] ?? 13))) - 1;
  if (!m[4]) return { x: e + 250 - E0, z: N0 - (n + 250) };
  return { x: e + (k % 5) * 100 + 50 - E0, z: N0 - (n + 500 - Math.floor(k / 5) * 100 - 50) };
}

export const WW1_REF_HINT = '7037 b 13 : Planquadrat (1 km), quarter, small square of 100 m';
