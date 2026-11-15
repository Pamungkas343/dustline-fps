// map.js — DUSTLINE YARD, the one original map. Desert industrial yard:
// Vanguard spawns west, Jackals defend east, bomb sites A (north warehouse) and
// B (south container yard), three lanes (A-long, mid corridor, B-containers).
// All collision is axis-aligned boxes; all movement is circle-vs-box in XZ.

export const BOUNDS = { minX: -30, maxX: 30, minZ: -22, maxZ: 22 };

// Boxes: {x, z, w, d, h, c} — center x/z, width (x), depth (z), height, color key.
// Height >= 1.1 blocks movement; bullets fired at eye height (~1.55) pass over 1.2 crates.
export const BOXES = [
  // perimeter (h=4)
  { x: 0, z: -22, w: 62, d: 1, h: 4, c: 'concrete' },
  { x: 0, z: 22, w: 62, d: 1, h: 4, c: 'concrete' },
  { x: -30, z: 0, w: 1, d: 45, h: 4, c: 'concrete' },
  { x: 30, z: 0, w: 1, d: 45, h: 4, c: 'concrete' },
  // site A warehouse shell (north-east)
  { x: 18, z: -18, w: 14, d: 1, h: 3.5, c: 'steel' },
  { x: 24, z: -14, w: 1, d: 9, h: 3.5, c: 'steel' },
  { x: 14, z: -10, w: 6, d: 1, h: 3.5, c: 'steel' },
  { x: 13, z: -14, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: 20, z: -12, w: 2, d: 2, h: 2.4, c: 'rust' },
  { x: 17.5, z: -16, w: 2, d: 2, h: 1.2, c: 'crate' },
  // site B container yard (south-east)
  { x: 13, z: 17, w: 6, d: 2.6, h: 2.6, c: 'rust' },
  { x: 20, z: 17, w: 2.6, d: 6, h: 2.6, c: 'steel' },
  { x: 14, z: 18, w: 3, d: 2, h: 1.2, c: 'crate' },
  { x: 18, z: 19.5, w: 10, d: 1, h: 3, c: 'steel' },
  // mid building: two slabs leave a corridor at z in [-1, 1]
  { x: 0, z: -3, w: 8, d: 2, h: 3.5, c: 'concrete' },
  { x: 0, z: 3, w: 8, d: 2, h: 3.5, c: 'concrete' },
  { x: -8, z: -4, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: 8, z: 4, w: 2, d: 2, h: 1.2, c: 'crate' },
  // A-long lane guides (north)
  { x: -8, z: -16, w: 10, d: 1, h: 3, c: 'concrete' },
  { x: 4, z: -16, w: 6, d: 1, h: 3, c: 'concrete' },
  { x: -14, z: -14, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: -2, z: -13, w: 1.5, d: 1.5, h: 2.4, c: 'rust' },
  // B lane guides (south)
  { x: -8, z: 16, w: 10, d: 1, h: 3, c: 'concrete' },
  { x: 4, z: 16, w: 6, d: 1, h: 3, c: 'concrete' },
  { x: -14, z: 14, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: 0, z: 13, w: 2, d: 2, h: 2.4, c: 'rust' },
  // spawn cover (kept off the lane exits so bots can leave spawn)
  { x: -26, z: -9, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: -26, z: 9, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: -17, z: -6, w: 3, d: 1, h: 2.4, c: 'steel' },
  { x: 24, z: -8, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: 24, z: 8, w: 2, d: 2, h: 1.2, c: 'crate' },
  // (east spawn has no steel wall: any wall at x~20 blocks the site-A entry
  // corridor; the two crates above are the spawn cover)
  // mid-field cover + silos (skyline)
  { x: -16, z: -8, w: 2, d: 2, h: 2.4, c: 'rust' },
  { x: -16, z: 8, w: 2, d: 2, h: 2.4, c: 'rust' },
  { x: 10, z: -6, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: 10, z: 6, w: 2, d: 2, h: 1.2, c: 'crate' },
  { x: -6, z: -9, w: 3, d: 3, h: 7, c: 'dark' },
  { x: 8, z: 9, w: 3, d: 3, h: 7, c: 'dark' },
];

export const SITES = {
  A: { x0: 13, x1: 23, z0: -18, z1: -10, cx: 18, cz: -14, color: '#2ec4b6' },
  B: { x0: 13, x1: 23, z0: 10, z1: 18, cx: 18, cz: 14, color: '#e36414' },
};

export const SPAWNS = {
  vanguard: [
    { x: -26, z: -4, yaw: -Math.PI / 2 },
    { x: -26, z: 0, yaw: -Math.PI / 2 },
    { x: -26, z: 4, yaw: -Math.PI / 2 },
    { x: -24, z: -6, yaw: -Math.PI / 2 },
  ],
  jackals: [
    { x: 26, z: -4, yaw: Math.PI / 2 },
    { x: 26, z: 0, yaw: Math.PI / 2 },
    { x: 26, z: 4, yaw: Math.PI / 2 },
    { x: 24, z: 6, yaw: Math.PI / 2 },
  ],
};

// Waypoint lanes for attackers (ordered node lists, {x,z}).
// Every node sits in open ground and every segment is box-free (verified by
// /tmp/pathaudit.mjs — 0 collisions). Lanes run BESIDE the cover crates, not
// through them: A at z=-11, mid at z=0, B at z=+11.
export const LANES = {
  A: [
    { x: -20, z: -11 }, { x: -10, z: -11 }, { x: 2, z: -11 },
    { x: 10, z: -11 }, { x: 18, z: -13 },
  ],
  MID: [
    { x: -18, z: 0 }, { x: -8, z: 0 }, { x: 0, z: 0 },
    { x: 8, z: 0 }, { x: 16, z: 0 },
  ],
  B: [
    { x: -20, z: 11 }, { x: -10, z: 11 }, { x: 2, z: 11 },
    { x: 10, z: 11 }, { x: 18, z: 13 },
  ],
};
// Mid-lane branches to each site.
export const MID_BRANCH = {
  A: [{ x: 19, z: -8 }, { x: 18, z: -13 }],
  B: [{ x: 17, z: 13 }],
};
// Defender hold angles: {x, z, yaw, via} — position + facing covering an
// approach, reached through the via waypoints (never a straight line through
// a container). yaw 0 faces -Z (north); PI faces +Z (south); -PI/2 faces +X
// (east); +PI/2 faces -X (west). Holds face the site entrances.
export const HOLDS = {
  A: [
    { x: 22, z: -9, yaw: Math.PI, via: [{ x: 22, z: -6 }] },
    { x: 15, z: -16, yaw: Math.PI / 2, via: [{ x: 22, z: -6 }, { x: 18.5, z: -9 }] },
    { x: 22, z: -16, yaw: Math.PI / 2, via: [{ x: 22, z: -6 }] },
    { x: 16, z: -12, yaw: Math.PI, via: [{ x: 22, z: -6 }, { x: 18, z: -11 }] },
  ],
  B: [
    { x: 20, z: 11, yaw: 0, via: [{ x: 22, z: 6 }] },
    { x: 14, z: 14.5, yaw: Math.PI / 2, via: [{ x: 12, z: 8 }, { x: 12, z: 14 }] },
    { x: 22, z: 13, yaw: Math.PI / 2, via: [{ x: 22, z: 6 }] },
    { x: 17, z: 14, yaw: Math.PI, via: [{ x: 12, z: 8 }, { x: 12, z: 14 }] },
  ],
  MID: [
    { x: 16, z: -2, yaw: Math.PI / 2, via: [] },
    { x: 16, z: 2, yaw: Math.PI / 2, via: [] },
  ],
};

// ---- collision: circle (x,z,r) vs boxes, axis-separated for wall sliding ----
export function collideMove(pos, r, dx, dz) {
  // X axis
  let nx = pos.x + dx;
  for (const b of BOXES) {
    const bx0 = b.x - b.w / 2 - r, bx1 = b.x + b.w / 2 + r;
    const bz0 = b.z - b.d / 2 - r, bz1 = b.z + b.d / 2 + r;
    if (pos.z > bz0 && pos.z < bz1 && nx > bx0 && nx < bx1) {
      nx = dx > 0 ? bx0 : bx1;
    }
  }
  nx = Math.max(BOUNDS.minX + r, Math.min(BOUNDS.maxX - r, nx));
  // Z axis (uses the corrected x)
  let nz = pos.z + dz;
  for (const b of BOXES) {
    const bx0 = b.x - b.w / 2 - r, bx1 = b.x + b.w / 2 + r;
    const bz0 = b.z - b.d / 2 - r, bz1 = b.z + b.d / 2 + r;
    if (nx > bx0 && nx < bx1 && nz > bz0 && nz < bz1) {
      nz = dz > 0 ? bz0 : bz1;
    }
  }
  nz = Math.max(BOUNDS.minZ + r, Math.min(BOUNDS.maxZ - r, nz));
  pos.x = nx; pos.z = nz;
}

export function pointInBox(x, z, r, b) {
  return x > b.x - b.w / 2 - r && x < b.x + b.w / 2 + r &&
    z > b.z - b.d / 2 - r && z < b.z + b.d / 2 + r;
}

export function siteForPoint(x, z) {
  for (const k of ['A', 'B']) {
    const s = SITES[k];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return k;
  }
  return null;
}

// ---- ray vs boxes (slab test), returns nearest hit distance or Infinity ----
export function rayBoxes(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const b of BOXES) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
    const y0 = 0, y1 = b.h;
    const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    let tmin = 0, tmax = maxDist;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) continue; }
    else {
      let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) continue; }
    else {
      let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) continue; }
    else {
      let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

// Line of sight between two eye points (3D segment vs boxes).
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const t = rayBoxes(ax, ay, az, dx / len, dy / len, dz / len, len);
  return t === Infinity;
}

export function eyeHeight(actor) { return actor.crouch ? 1.15 : 1.55; }
export function chestHeight(actor) { return actor.crouch ? 0.85 : 1.3; }
export function headHeight(actor) { return actor.crouch ? 1.05 : 1.62; }
