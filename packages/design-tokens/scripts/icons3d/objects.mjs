/**
 * Object builders for the 3D set (docs/design/onboarding-v1.md section 6.4). Each takes a Local frame (so scenes can place and turn them) and draws
 * back to front. Units are arbitrary; the engine fits them into the 48 grid. The accent (A) is the one coloured material of an object.
 */
import { A, INK, N, ON, WHITE, capsule2, ngon2, proj, rect2 } from "./engine.mjs";

const FRONT = [1, 0, 0]; // plane axes for marks on a front face (plane y = const)
const UP = [0, 0, 1];
const SIDE = [0, 1, 0]; // plane axes for marks on a right face (plane x = const)

/** A mark on a front face: a rounded rectangle in plane y = y0. */
function frontRect(L, x, y0, z, w, h, cls, r = 0.6) {
  L.poly3([[x, y0, z], [x + w, y0, z], [x + w, y0, z + h], [x, y0, z + h]], cls, r);
}
const frontDot = (L, cx, y0, cz, R, cls) => L.circle3([cx, y0, cz], FRONT, UP, R, cls);
const topDot = (L, cx, cy, z, R, cls) => L.disc(cx, cy, z, R, cls);


const D = (m) => ({ lit: m, mid: m, shade: m }); // one flat tone
const R2 = (deg) => (deg * Math.PI) / 180;
/** Rotate [x, z] points about (cx, cz). */
const rotXZ = (pts, deg, cx = 0, cz = 0) => pts.map(([x, z]) => { const a = R2(deg), c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]; });
/** A stadium outline in the x-z plane. */
const stadiumXZ = (cx, cz, len, wid, seg = 8) => {
  const r = wid / 2, h = len / 2 - r, pts = [];
  for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (Math.PI * i) / seg; pts.push([cx + h + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  for (let i = 0; i <= seg; i++) { const a = Math.PI / 2 + (Math.PI * i) / seg; pts.push([cx - h + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return pts;
};
const circleXZ = (cx, cz, R, n = 24) => Array.from({ length: n }, (_, i) => [cx + Math.cos((2 * Math.PI * i) / n) * R, cz + Math.sin((2 * Math.PI * i) / n) * R]);
const at3 = (pts, y) => pts.map(([x, z]) => [x, y, z]);
/** A flat shape standing in the x-z plane, thickness t toward the back: copies in the dark tone, then the face. */
function extrudeXZ(L, pts, y, t, m, face = m.mid, holes = null) {
  const draw = (yy, cls) => (holes ? L.poly3h(at3(pts, yy), at3(holes, yy), cls) : L.poly3(at3(pts, yy), cls, 0));
  for (let o = t; o > 0.01; o -= 0.45) draw(y + o, m.shade);
  draw(y, face);
}

/** A thick polyline (miter joins) as a polygon in the x-z plane: ticks and arrows. */
function thickXZ(pts, w) {
  const h = w / 2, n = pts.length, left = [], right = [];
  const norm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [-dz / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const nA = i > 0 ? norm(pts[i - 1], pts[i]) : norm(pts[0], pts[1]);
    const nB = i < n - 1 ? norm(pts[i], pts[i + 1]) : nA;
    let m = [nA[0] + nB[0], nA[1] + nB[1]];
    const ml = Math.hypot(m[0], m[1]);
    m = [m[0] / ml, m[1] / ml];
    const k = h / Math.max(0.3, m[0] * nA[0] + m[1] * nA[1]);
    left.push([pts[i][0] + m[0] * k, pts[i][1] + m[1] * k]);
    right.push([pts[i][0] - m[0] * k, pts[i][1] - m[1] * k]);
  }
  return [...left, ...right.reverse()];
}
export const objects = {};

// ---- trade objects ---------------------------------------------------------------------------------------------------------------

objects.nails = (L) => {
  L.shadow(2, 0, 13, 4.2);
  const nail = [[-3.4, 1], [3.4, 1], [3.4, 9], [2.6, 11.6], [0, 12.6], [-2.6, 11.6], [-3.4, 9]];
  const polish = [[-3.4, 6.6], [3.4, 6.6], [3.4, 9], [2.6, 11.6], [0, 12.6], [-2.6, 11.6], [-3.4, 9]];
  L.cyl(-3, 3, 0, 6.4, 10, A);
  L.cyl(-3, 3, 10, 2.4, 1.8, N, { top: false });
  L.cyl(-3, 3, 11.8, 3.3, 7.4, N);
  frontRect(L, -7, -3.5, 3, 6.6, 3.4, ON, 0.6);
  extrudeXZ(L, nail.map(([x, z]) => [x + 8.4, z]), -6.6, 1.2, N, N.lit);
  extrudeXZ(L, polish.map(([x, z]) => [x + 8.4, z]), -6.7, 1.3, A, A.lit);
};


objects.brows_lashes = (L) => {
  L.shadow(0, 0, 11, 3.6);
  L.box(-9.5, -4, 0, 19, 8, 1.8, N, 1.6);
  extrudeXZ(L, [[-6.4, 1.8], [-5, 1.8], [-3.4, 16.5], [-4.6, 16.5]], -0.4, 0.8, N, N.mid);
  extrudeXZ(L, [[-3.4, 1.8], [-2, 1.8], [-1.6, 16.5], [-3, 16.5]], -0.8, 0.8, N, N.lit);
  L.cyl(4.2, 0, 1.8, 1.9, 11.4, A, { top: false });
  L.cyl(4.2, 0, 13.2, 1.5, 2.2, N, { top: false });
  L.cyl(4.2, 0, 15.4, 2, 4.6, D("ik"));
};objects.makeup = (L) => {
  L.shadow(0, 0, 12, 4.6);
  const lid = [1, 0, 0], lv = [0, 0.34, 0.94];
  const at = (t, d = 0) => [0, 9 + lv[1] * t + d, 1.8 + lv[2] * t];
  L.circle3(at(9.6, 0.9), lid, lv, 9.6, N.shade);
  L.circle3(at(9.6, 0), lid, lv, 9.6, N.mid);
  L.circle3(at(9.6, -0.1), lid, lv, 7.4, N.lit);
  L.cyl(0, 0, 0, 9.6, 3.6, N);
  L.disc(0, 0, 3.6, 7.2, N.mid);
  L.disc(0, 0, 3.7, 6.4, A.lit);
  L.disc(-1.4, -1.0, 3.8, 3.6, A.mid);
  L.disc(-1.9, -1.4, 3.9, 2.2, A.lit);
};
objects.barber = (L, o = {}) => {
  const guard = o.accent === false ? N : A;
  L.shadow(0, 0, 10, 3.8);
  L.box(-5, -3, 0, 10, 6, 15, N, 2.6);
  frontRect(L, -1.5, -3.05, 4.6, 3, 5.4, INK, 1.2);
  frontRect(L, -3.4, -3.05, 11.2, 6.8, 1, N.shade, 0.5);
  L.box(-5.8, -3.6, 15, 11.6, 7.2, 3.2, { lit: "n2", mid: "n3", shade: "n3" }, 1.2);
  L.box(-6.4, -4, 18.2, 12.8, 8, 2.6, guard, 1.1);
  for (let i = 0; i < 6; i++) L.box(-5.6 + i * 2, -4.6, 18.9, 1.2, 1.4, 1.5, D("n3"), 0.3);
};objects.salon = (L) => {
  L.shadow(0, 0, 11, 4);
  L.cyl(0, 0, 0, 10, 1.4, N);
  extrudeXZ(L, [[-8.6, 12.4], [8.6, 12.4], [8.6, 15.4], [-8.6, 15.4]], 2.2, 1.2, A, A.lit);
  for (let i = 0; i < 9; i++) extrudeXZ(L, [[-8.4 + i * 2.1, 3.2], [-7.4 + i * 2.1, 3.2], [-7.4 + i * 2.1, 12.4], [-8.4 + i * 2.1, 12.4]], 2.2, 1.2, A, A.lit);
  const blade = (deg, face, y) => extrudeXZ(L, rotXZ([[-1.1, 8], [1.1, 8], [0.5, 22], [-0.5, 22]], deg, 0, 8), y, 0.8, N, face);
  blade(12, N.mid, -1.4);
  blade(-12, N.lit, -2.3);
  extrudeXZ(L, circleXZ(-3.6, 5, 3.5), -2.3, 0.8, N, N.mid, circleXZ(-3.6, 5, 2));
  extrudeXZ(L, circleXZ(3.6, 5, 3.5), -2.3, 0.8, N, N.lit, circleXZ(3.6, 5, 2));
  L.circle3([0, -3.15, 8], FRONT, UP, 0.9, N.shade);
};
objects.groomer = (L) => {
  // A paddle brush lying flat, bristles up, and the accent bow standing in front of its handle: a grooming table, seen from above.
  L.shadow(1, 0, 13, 4.2);
  L.box(-11, -5.4, 0, 12, 10.8, 2.6, N, 3.4); // the pad
  L.box(-9.8, -4.2, 2.6, 9.6, 8.4, 0.7, { lit: "n2", mid: "n3", shade: "n3" }, 2.6); // the cushion
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) topDot(L, -8.4 + c * 2.3, -2.9 + r * 2.0, 3.35, 0.55, INK.lit); // the pins
  L.box(1, -1.5, 0.5, 11, 3, 2, N, 1.4); // the handle
  // the bow: two loops and a knot, upright in the x-z plane at the front
  extrudeXZ(L, [[4.6, 6], [-0.8, 9.6], [-0.8, 2.4]], -6.6, 1.2, A, A.lit);
  extrudeXZ(L, [[4.6, 6], [10, 9.6], [10, 2.4]], -6.6, 1.2, A, A.mid);
  extrudeXZ(L, circleXZ(4.6, 6, 1.7, 16), -6.9, 1.2, A, A.lit);
  extrudeXZ(L, [[3.6, 4.8], [5.6, 4.8], [7.2, 0.6], [5.6, 0.6]], -6.4, 0.8, A, A.mid); // a tail
};

objects.cafe = (L) => {
  L.shadow(0, 0, 12, 4.4);
  L.cyl(0, 0, 0, 11, 1.1, N);
  L.ring3([8.4, 0, 6.8], FRONT, UP, 4.6, 2.3, N.shade);
  L.cyl(0, 0, 1.1, 8.4, 11.4, N, { top: false });
  L.disc(0, 0, 12.5, 8.4, N.lit);
  L.disc(0, 0, 12.5, 7, A.shade);
  L.disc(0, 0, 12.6, 6.6, A.mid);
  L.disc(-0.8, -0.6, 12.7, 4.4, A.lit);
};


objects.bakery = (L) => {
  L.shadow(0, 0, 13, 4.4);
  L.cyl(0, 0, 0, 10.5, 4.8, N, { top: false });
  // glaze: a slightly smaller accent puck on top with a hole through the middle
  L.cyl(0, 0, 4.8, 9.4, 2, A, { top: false });
  L.ring3([0, 0, 6.8], [1, 0, 0], [0, 1, 0], 9.4, 3.6, A.lit);
  L.ring3([0, 0, 6.85], [1, 0, 0], [0, 1, 0], 3.6, 3.0, N.shade);
  L.disc(0, 0, 6.8, 3.0, N.shade);
  const sprinkles = [[-5.4, -2.6, 20], [-1.6, -6.6, -30], [4.6, -4.8, 60], [6.6, 1.2, 0], [-6, 3, -50], [2, 6.4, 25], [-2.4, 6, 80]];
  for (const [x, y, a] of sprinkles) { const r = (a * Math.PI) / 180; L.line3([[x - Math.cos(r) * 0.8, y - Math.sin(r) * 0.8, 6.9], [x + Math.cos(r) * 0.8, y + Math.sin(r) * 0.8, 6.9]], WHITE.lit, 0.9); }
};

objects.butcher = (L) => {
  // A cleaver in profile on a chopping board: the wide blade with its hole and a dark edge, the accent handle reaching out to the right.
  L.shadow(0, 0, 14, 4.4);
  L.box(-12, -6, 0, 24, 12, 2.6, N, 2); // the board
  const blade = [[-11, 2.6], [3.4, 2.6], [3.4, 15], [-10.2, 15], [-11, 14.2]];
  extrudeXZ(L, blade, -1, 1.1, N, N.lit, circleXZ(-7.8, 11.8, 1.3, 16));
  frontRect(L, -11, -1.05, 2.6, 14.4, 1.6, N.shade, 0.2); // the sharpened edge
  frontRect(L, -11, -1.05, 14.1, 14.4, 0.9, N.mid, 0.2); // the spine
  extrudeXZ(L, [[3.4, 11.2], [5.2, 11.2], [5.2, 14.4], [3.4, 14.4]], -1.2, 1.4, N, N.mid); // the bolster
  extrudeXZ(L, [[5.2, 11], [13.6, 11.4], [14.4, 12.8], [13.6, 14.2], [5.2, 14.6]], -1.4, 1.8, A, A.lit); // the handle
  frontDot(L, 8, -1.45, 12.8, 0.5, ON.lit);
  frontDot(L, 11.2, -1.45, 12.8, 0.5, ON.lit);
};

objects.pet_shop = (L) => {
  L.shadow(0, 0, 12, 4.4);
  L.cyl(0, 0, 0, 10, 6.4, A, { top: false });
  L.ring3([0, 0, 6.4], [1, 0, 0], [0, 1, 0], 10, 8.2, A.lit);
  L.disc(0, 0, 6.4, 8.2, A.shade);
  for (const [x, y, z] of [[-3.4, 1.6, 6.8], [0.8, 2.6, 7], [3.8, 0.6, 6.8], [-1, -1.4, 7.6], [2.2, -2.4, 7.4], [-4.6, -1, 6.9]]) L.sphere(x, y, z, 1.4, N);
  // the paw: a pad and four toes
  frontDot(L, 0, -9.95, 2.6, 1.9, ON.lit);
  for (const [x, z] of [[-3.2, 4.8], [-1.1, 5.9], [1.1, 5.9], [3.2, 4.8]]) frontDot(L, x, -9.95, z, 0.9, ON.lit);
};

objects.repair = (L) => {
  L.shadow(0, 0, 11, 4);
  L.cyl(0, 0, 0, 9.4, 1.6, N);
  // a spanner standing on the pad, leaning 22 degrees: an open jaw on top, an accent grip
  const lean = (pts) => rotXZ(pts, -22, 0, 1.6);
  const jaw = [];
  for (let i = 0; i <= 20; i++) { const a = R2(66.9 - (i * 313.8) / 20); jaw.push([Math.cos(a) * 5.6, 22 + Math.sin(a) * 5.6]); }
  jaw.push([-2.2, 22], [2.2, 22]);
  extrudeXZ(L, lean([[-1.9, 1.6], [1.9, 1.6], [1.9, 22], [-1.9, 22]]), -0.6, 1.4, N, N.mid);
  extrudeXZ(L, lean(jaw), -0.6, 1.4, N, N.lit);
  extrudeXZ(L, lean([[-2.3, 1.6], [2.3, 1.6], [2.3, 12], [-2.3, 12]]), -0.7, 1.6, A, A.lit);
};

objects.shops = (L) => {
  L.shadow(0, 0, 13, 4.4);
  L.box(-10, -5.5, 0, 20, 11, 11, N, 1.2);
  frontRect(L, -8.6, -5.55, 1.8, 5.4, 4.2, N.lit, 0.6); // windows
  frontRect(L, 3.4, -5.55, 1.8, 5.2, 4.2, N.lit, 0.6);
  frontRect(L, -2.2, -5.55, 0, 4.4, 6, INK, 0.8); // door
  L.box(-10.6, -6.1, 11, 21.2, 12.2, 1.1, N, 0.8);
  for (let i = 0; i < 5; i++) L.box(-10.6 + i * 4.24, -9.6, 7.4, 4.24, 4.2, 2.8, i % 2 ? WHITE : A, 0.5); // the awning
};
objects.services = (L) => {
  L.shadow(0, 0, 12, 4.4);
  L.ring3([0, -0.4, 13], FRONT, UP, 4.6, 3.2, N.shade);
  L.box(-10, -5.5, 0, 20, 11, 13, N, 2.6);
  frontRect(L, -9.6, -5.55, 6, 19.2, 1.2, N.shade, 0.3);
  frontRect(L, -1.8, -5.6, 4.9, 3.6, 3.2, A.lit, 0.9);
};
objects.eat = (L) => {
  L.shadow(0, 0, 12, 4.4);
  L.cyl(0, 0, 0, 9, 9, N, { top: false });
  L.ring3([0, 0, 9], [1, 0, 0], [0, 1, 0], 9, 7.7, N.lit);
  L.disc(0, 0, 9, 7.7, A.shade);
  L.disc(0, 0, 9.05, 7.1, A.mid);
  L.disc(-1.2, -1, 9.1, 4.6, A.lit);
  L.prism(capsule2(-5.4, -9.4, 6.4, 0, 1), 9.3, 1, D("n3"), 0.4);
  L.prism(capsule2(-3.8, -10, 8, -1, 1), 9.3, 1, D("n3"), 0.4);
};

objects.beauty = (L) => {
  L.shadow(0, 0, 8, 3);
  L.cyl(0, 0, 0, 4.4, 9, N);
  L.cyl(0, 0, 9, 3.9, 2.4, N.shade && { lit: "n2", mid: "n2", shade: "n3" });
  L.cyl(0, 0, 11.4, 3.2, 8.6, A, { top: false });
  L.circle3([0, 0, 20], [1, 0, 0], [0, 1, 0.55], 3.2, A.lit);
};

objects.top = (L) => {
  L.shadow(0, 0, 10, 3.8);
  L.box(-5.5, -3, 0, 11, 6, 1.2, N, 1);
  extrudeXZ(L, [[-7.4, 24.6], [-3.8, 24.6], [1.2, 14], [-2.4, 14]], 0.4, 0.8, N, N.mid);
  extrudeXZ(L, [[7.4, 24.6], [3.8, 24.6], [-1.2, 14], [2.4, 14]], 0.2, 0.8, N, N.lit);
  extrudeXZ(L, circleXZ(0, 10.2, 8.8, 36), -0.8, 2.2, A, A.lit);
  L.ring3([0, -0.85, 10.2], FRONT, UP, 6.8, 6, A.mid);
  const star = [];
  for (let i = 0; i < 10; i++) { const a = R2(-90 + i * 36), r = i % 2 ? 1.9 : 4.6; star.push([Math.cos(a) * r, -0.9, 10.2 - Math.sin(a) * r]); }
  L.poly3(star, ON.lit, 0.3);
};


// ---- step and concept objects ----------------------------------------------------------------------------------------------------

objects.link = (L) => {
  L.shadow(0, 0, 13, 3.6);
  L.box(-12, -3, 0, 24, 6, 1.4, N, 1.2);
  const tilt = (pts, d, cx, cz) => rotXZ(pts, d, cx, cz);
  const outer = (cx, cz) => tilt(stadiumXZ(cx, cz, 15, 8.4), 40, cx, cz);
  const inner = (cx, cz) => tilt(stadiumXZ(cx, cz, 11, 4.2), 40, cx, cz);
  extrudeXZ(L, outer(-3.6, 9.4), -0.6, 1.6, N, N.lit, inner(-3.6, 9.4));
  extrudeXZ(L, outer(4.2, 9.4).map(([x, z]) => [x, z]).map(([x, z]) => [x, z]), -0.6, 1.6, A, A.lit, inner(4.2, 9.4));
};

objects.price_tag = (L) => {
  L.shadow(0, 0, 10, 3.6);
  L.box(-7, -3, 0, 14, 6, 1.4, N, 1.2);
  const tag = rotXZ([[-5.4, 2], [5.4, 2], [5.4, 15], [0, 20], [-5.4, 15]], -14, 0, 10);
  const hole = rotXZ(circleXZ(0, 15.2, 1.5), -14, 0, 10);
  extrudeXZ(L, tag, -0.8, 1.5, A, A.lit, hole);
  frontRect(L, -3, -0.85, 7.2, 5.6, 0.9, ON, 0.3);
  frontRect(L, -3, -0.85, 4.6, 3.4, 0.9, ON, 0.3);
};

objects.calendar_week = (L) => {
  L.shadow(0, 0, 14, 3.8);
  L.box(-12, -1, 0, 24, 2, 17, N, 2);
  frontRect(L, -11.5, -1.05, 12.4, 23, 4.2, A.lit, 1);
  L.cyl(-6.6, -0.4, 15.6, 0.9, 3.2, D("n3"), { top: false });
  L.cyl(6.6, -0.4, 15.6, 0.9, 3.2, D("n3"), { top: false });
  for (let i = 0; i < 7; i++) {
    const x = -10.4 + i * 3;
    if (i === 3) L.box(x, -3.6, 4.4, 2.4, 2.6, 2.8, A, 0.6);
    else L.box(x, -1.9, 4.4, 2.4, 0.9, 2.8, N.lit && { lit: "n1", mid: "n1", shade: "n3" }, 0.5);
  }
  for (let i = 0; i < 7; i++) frontRect(L, -10.4 + i * 3, -1.05, 1.6, 2.4, 0.9, N.shade, 0.3);
};

objects.pin_area = (L) => {
  L.shadow(0, 0, 14, 4.8);
  L.cyl(0, 0, 0, 12.4, 1.4, N);
  L.disc(0, 0, 1.45, 8.8, N.mid);
  L.disc(0, 0, 1.5, 6.4, N.lit);
  L.disc(0, 0, 1.55, 1.8, N.shade);
  const cx = 0, cz = 10.6;
  L.poly3([[cx - 4.2, -0.2, cz - 1], [cx, -0.2, 2.2], [cx, -0.2, cz]], A.mid);
  L.poly3([[cx + 4.2, -0.2, cz - 1], [cx, -0.2, 2.2], [cx, -0.2, cz]], A.shade);
  L.sphere(cx, 0, cz + 1.6, 5.4, A);
  frontDot(L, cx - 0.4, -5.2, cz + 1.9, 1.9, ON.lit);
};

objects.megaphone = (L) => {
  L.shadow(0, 0, 12, 4.2);
  L.box(-4, -1.6, 0, 3.4, 3.2, 6.4, N, 1.2);
  const ring = (x, R, z0) => Array.from({ length: 22 }, (_, i) => [x, Math.cos((2 * Math.PI * i) / 22) * R, z0 + Math.sin((2 * Math.PI * i) / 22) * R]);
  const zc = 11;
  L.hull3([...ring(-8, 1.9, zc), ...ring(-5.2, 2.5, zc)], N.mid, 0.4);
  L.hull3([...ring(-5.2, 2.6, zc), ...ring(7, 7.4, zc)], A.mid, 0.5);
  L.circle3([7, 0, zc], SIDE, UP, 7.4, A.lit);
  L.circle3([7.05, 0, zc], SIDE, UP, 6, N.shade);
  L.circle3([7.1, -0.4, zc], SIDE, UP, 4.4, D("n3"));
};

objects.phone_message = (L) => {
  L.shadow(0, 0, 9, 3.2);
  L.box(-6, -1, 0, 12, 2, 21, N, 2.6);
  frontRect(L, -5, -1.05, 1.6, 10, 17.8, N.lit, 1.4);
  frontRect(L, -4.2, -1.1, 11.6, 6.4, 3.4, N.mid, 1.2);
  frontRect(L, -1.8, -1.1, 6.6, 6.2, 4.2, A.lit, 1.5);
  L.poly3([[1.2, -1.1, 6.8], [3.4, -1.1, 6.8], [4.8, -1.1, 5.2]], A.lit);
  for (const x of [-0.2, 1.8, 3.8]) frontDot(L, x, -1.15, 8.7, 0.55, ON.lit);
};

objects.qr_stand = (L) => {
  L.shadow(0, 0, 12, 4);
  L.box(-9, -4.5, 0, 18, 9, 1.6, A, 1.2);
  L.box(-7.6, -1, 1.6, 15.2, 1.6, 17, N, 1.8);
  frontRect(L, -6, -1.05, 3.2, 12, 12, N.lit, 0.8);
  const cell = 12 / 7, x0 = -6, z0 = 3.2;
  const finder = (cx, cz) => { frontRect(L, x0 + cx * cell, -1.1, z0 + cz * cell, cell * 3, cell * 3, INK, 0.3); frontRect(L, x0 + (cx + 1) * cell, -1.12, z0 + (cz + 1) * cell, cell, cell, N.lit, 0.1); };
  finder(0, 4); finder(4, 4); finder(0, 0);
  for (const [c, r] of [[4, 0], [5, 1], [6, 0], [4, 2], [6, 2], [3, 3], [3, 5], [3, 6], [5, 3]]) frontRect(L, x0 + c * cell, -1.1, z0 + r * cell, cell * 0.9, cell * 0.9, INK, 0.1);
};

objects.stamp_card = (L) => {
  L.shadow(0, 0, 14, 3.8);
  L.box(-9, -3.2, 0, 18, 6.4, 1.2, N, 1);
  L.box(-11, -1, 1.2, 22, 1.8, 14.4, N, 2);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = -6.2 + c * 6.2, z = 4.6 + r * 5.8, filled = r === 0 && c < 2;
    if (filled) { frontDot(L, x, -1.06, z, 2.3, A.lit); frontDot(L, x, -1.1, z, 0.9, ON.lit); }
    else L.ring3([x, -1.06, z], FRONT, UP, 2.3, 1.55, N.shade);
  }
  frontRect(L, -8.6, -1.06, 12.4, 6.4, 1.1, A.lit, 0.5);
};

objects.deposit = (L) => {
  L.shadow(0, 0, 11, 3.8);
  L.box(-8, -3.4, 0, 16, 6.8, 1.4, N, 1.2);
  extrudeXZ(L, circleXZ(0, 10.4, 9, 36), -0.8, 2.2, A, A.lit);
  L.ring3([0, -0.85, 10.4], FRONT, UP, 6.6, 5.7, ON.lit);
  frontDot(L, 0, -0.9, 10.4, 2.1, ON.lit);
  L.ring3([6.4, -4.6, 7.6], FRONT, UP, 2.4, 1.3, N.shade);
  L.box(3.2, -6, 1.4, 6.4, 2.8, 5.2, { lit: "n2", mid: "n3", shade: "n3" }, 1);
  frontDot(L, 6.4, -6.05, 4.2, 0.75, INK.lit);
};


objects.bell = (L) => {
  L.shadow(0, 0, 11, 3.8);
  L.cyl(0, 0, 0, 10, 1.8, N.shade && { lit: "n2", mid: "n2", shade: "n3" });
  L.cyl(0, 0, 1.8, 8, 6.4, A, { top: false });
  L.sphere(0, 0, 8.2, 8, A);
  L.sphere(0, 0, 17.6, 1.7, N);
  L.sphere(0, -2, 0.6, 2.2, N);
};

objects.pass = (L) => {
  L.shadow(0, 0, 11, 3.6);
  L.box(-7, -3, 0, 14, 6, 1.2, N, 1);
  L.box(-8, -1, 1.2, 16, 1.8, 21, N, 2.2);
  frontRect(L, -7.4, -1.05, 14.2, 14.8, 7, A.lit, 1.2);
  frontRect(L, -2, -1.1, 19.6, 4, 1.4, D("n3"), 0.7); // the notch
  frontDot(L, -4.4, -1.1, 17.4, 1.5, ON.lit);
  for (let i = 0; i < 9; i++) frontRect(L, -5.2 + i * 1.2, -1.06, 3, i % 3 === 1 ? 0.9 : 0.5, 7, INK, 0.1);
};

objects.site = (L) => {
  L.shadow(0, 0, 14, 3.8);
  L.box(-9, -3.2, 0, 18, 6.4, 1.2, N, 1);
  L.box(-12, -1, 1.2, 24, 1.8, 17, N, 2);
  frontRect(L, -11.4, -1.05, 15, 22.8, 2.6, N.lit, 0.8);
  for (let i = 0; i < 3; i++) frontDot(L, -9.6 + i * 1.9, -1.1, 16.3, 0.55, N.shade);
  frontRect(L, -11.4, -1.05, 2.4, 22.8, 11.8, N.lit, 0.6);
  frontRect(L, -10.2, -1.1, 8, 8.4, 4.4, A.mid, 0.8);
  frontRect(L, -10.2, -1.1, 4.2, 3.6, 1.7, A.lit, 0.8);
  frontRect(L, 0.2, -1.1, 11.4, 9, 0.9, N.shade, 0.3);
  frontRect(L, 0.2, -1.1, 9, 6.4, 0.9, N.shade, 0.3);
  frontRect(L, 0.2, -1.1, 6.6, 7.6, 0.9, N.shade, 0.3);
};

objects.domain = (L) => {
  L.shadow(0, 0, 14, 4.6);
  L.box(-11, -7, 0, 22, 14, 2, N, 1.8);
  const c = [0, 0, 9.6], R = 7.6;
  L.sphere(...c, R, N);
  L.arcOnSphere(c, R, [1, 0, 0], [0, 1, 0], A.lit, 0.9);
  L.arcOnSphere(c, R, [1, 0, 0], [0, 0, 1], A.lit, 0.9);
  L.arcOnSphere(c, R, [0, 1, 0], [0, 0, 1], A.lit, 0.9);
  L.arcOnSphere([0, 0, 9.6 + 4.2], R * 0.83, [1, 0, 0], [0, 1, 0], A.lit, 0.9);
  L.arcOnSphere([0, 0, 9.6 - 4.2], R * 0.83, [1, 0, 0], [0, 1, 0], A.lit, 0.9);
};

objects.inbox = (L, o = {}) => {
  L.shadow(0, 0, 12, 4.2);
  L.box(-9, -6, 0, 18, 12, 1.6, N, 1.4);
  L.box(-9, 4.2, 1.6, 18, 1.8, 4.4, N, 1);
  L.box(-9, -6, 1.6, 1.8, 12, 4.4, N, 1);
  if (!o.empty) {
    const env = (cx, deg, m, face) => {
      const pts = rotXZ([[cx - 5.4, 2.4], [cx + 5.4, 2.4], [cx + 5.4, 12.6], [cx - 5.4, 12.6]], deg, cx, 2.4);
      extrudeXZ(L, pts, 0.4, 0.9, m, face);
      const [a, b] = rotXZ([[cx - 5.4, 12.6], [cx + 5.4, 12.6]], deg, cx, 2.4);
      const tip = rotXZ([[cx, 8]], deg, cx, 2.4)[0];
      L.line3([[a[0], -0.05, a[1]], [tip[0], -0.05, tip[1]], [b[0], -0.05, b[1]]], face === A.lit ? "a3" : "n3", 0.5);
    };
    env(-2.4, 7, N, N.lit);
    env(2.6, -6, A, A.lit);
  }
  L.box(7.2, -6, 1.6, 1.8, 12, 4.4, N, 1);
  L.box(-9, -6, 1.6, 18, 1.8, 3, N, 1);
};
objects.instagram_mark = (L) => {
  L.shadow(0, 0, 11, 3.6);
  L.box(-6, -3, 0, 12, 6, 1.2, N, 1);
  L.box(-9.5, -1.2, 1.2, 19, 2.4, 19, N, 5);
  L.ring3([0, -1.25, 10.7], FRONT, UP, 6.2, 4.4, A.lit);
  L.circle3([0, -1.25, 10.7], FRONT, UP, 4.4, N.lit);
  frontDot(L, 5.6, -1.3, 16, 1.2, A.lit);
};

objects.team = (L) => {
  L.shadow(0, 0, 11, 4);
  L.cyl(-4.6, 1, 0, 4.8, 11, N, { top: false });
  L.sphere(-4.6, 1, 11, 4.8, N);
  L.cyl(5.4, -2.2, 0, 4.8, 6.4, A, { top: false });
  L.sphere(5.4, -2.2, 6.4, 4.8, A);
};

objects.pos = (L) => {
  L.shadow(0, 0, 9, 3.6);
  L.box(-6, -3.6, 0, 12, 7.2, 19, N, 3);
  frontRect(L, -4.6, -3.65, 11.4, 9.2, 6, D("n3"), 1.2);
  frontRect(L, -3.6, -3.7, 13.2, 6.4, 1.4, A.lit, 0.6);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) frontDot(L, -2.6 + c * 2.6, -3.7, 2.4 + r * 2.6, 0.8, N.shade);
  L.poly3([[-3.6, -2.4, 19], [3.6, -2.4, 19], [3.6, -1.2, 19], [-3.6, -1.2, 19]], INK.lit, 0.3);
};

objects.check_done = (L) => {
  L.shadow(0, 0, 11, 3.8);
  L.box(-5.5, -3, 0, 11, 6, 1.2, N, 1);
  extrudeXZ(L, circleXZ(0, 12.6, 11.4, 36), -1.2, 2.6, A, A.lit);
  L.poly3(at3(thickXZ([[-5.4, 12.6], [-2, 9.2], [5.8, 16.8]], 2.9), -1.3), ON.lit, 0.7);
};