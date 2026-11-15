// combat.js — hitscan shooting, grenade damage and death handling.
// Shared by the player (sim.js) and the bots (bots.js): one code path, one truth.
// Pure geometry + state mutation; sounds are played by the caller from the result.
import { rayBoxes, losClear, chestHeight, headHeight, eyeHeight } from './map.js';
import { WEAPONS, pelletDamage, coneOffset } from './weapons.js';
import { addEvent, aliveCount } from './state.js';

// Reload: starts a timed reload; tickReload completes it when time is up.
export function startReload(state, actor) {
  const w = WEAPONS[actor.weapon];
  if (actor.reloadT > 0 || actor.mag >= w.mag || actor.reserve <= 0) return false;
  actor.reloadT = state.time + w.reload;
  return true;
}
export function tickReload(state, actor) {
  if (actor.reloadT < 0) return;
  if (state.time >= actor.reloadT) {
    const w = WEAPONS[actor.weapon];
    const need = w.mag - actor.mag;
    const take = Math.min(need, actor.reserve);
    actor.mag += take; actor.reserve -= take;
    actor.reloadT = -1;
  }
}

// Ray vs sphere. Returns t or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Ray vs vertical capsule (segment A->B, radius r). Returns t or Infinity.
// Solves the closest approach between the ray and the segment.
function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const ux = bx - ax, uy = by - ay, uz = bz - az; // segment dir
  const vx = ox - ax, vy = oy - ay, vz = oz - az; // ray origin - segment start
  const a = dx * dx + dy * dy + dz * dz; // 1 (normalized dir)
  const b = dx * ux + dy * uy + dz * uz;
  const c = ux * ux + uy * uy + uz * uz;
  const d = dx * vx + dy * vy + dz * vz;
  const e = ux * vx + uy * vy + uz * vz;
  const denom = a * c - b * b;
  let s, t;
  if (Math.abs(denom) < 1e-9) { s = 0; t = Math.max(0, -d / a); }
  else {
    s = (b * d - a * e) / denom;
    t = (b * s - d) / a;
    if (s < 0) { s = 0; t = Math.max(0, -d / a); }
    else if (s > 1) { s = 1; t = Math.max(0, (b - d) / a); }
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, e / c)); }
  }
  const px = ox + t * dx, py = oy + t * dy, pz = oz + t * dz;
  const qx = ax + s * ux, qy = ay + s * uy, qz = az + s * uz;
  const dist2 = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
  if (dist2 > r * r) return Infinity;
  // back off along the ray by the remaining radial depth
  const depth = Math.sqrt(Math.max(0, r * r - dist2));
  return Math.max(0, t - depth);
}

// Test one actor against a ray. Returns {t, head} or null.
function rayActor(ox, oy, oz, dx, dy, dz, actor) {
  const p = actor.pos;
  const headT = raySphere(ox, oy, oz, dx, dy, dz, p.x, headHeight(actor), p.z, 0.27);
  const bodyT = rayCapsule(ox, oy, oz, dx, dy, dz,
    p.x, 0.05, p.z, p.x, chestHeight(actor), p.z, 0.38);
  if (headT === Infinity && bodyT === Infinity) return null;
  if (headT <= bodyT) return { t: headT, head: true };
  return { t: bodyT, head: false };
}

export function applyDamage(state, target, dmg, attacker, head) {
  if (!target.alive) return null;
  target.hp -= dmg;
  const killed = target.hp <= 0;
  if (killed) {
    target.hp = 0;
    target.alive = false;
    if (attacker && attacker.isPlayer && target.team !== attacker.team) {
      state.money += 300;
      state.stats.kills++;
      if (head) state.stats.headshots++;
    }
    if (target.isPlayer) state.stats.deaths++;
    const an = attacker ? attacker.name : 'WORLD';
    const tn = target.name;
    addEvent(state, `${an} ✕ ${tn}${head ? '  HEADSHOT +300' : ''}`, head ? 'hs' : '', head);
    // bomb drops where its carrier died
    if (state.bomb.state === 'carried' && state.bomb.carrierId === target.id) {
      state.bomb.state = 'dropped';
      state.bomb.pos = { x: target.pos.x, z: target.pos.z };
      state.bomb.carrierId = null;
    }
  }
  return { killed, hp: target.hp };
}

// One hitscan shot from `shooter` at `origin`, aiming with base yaw/pitch.
// Spread perturbs yaw/pitch per pellet, then the direction is rebuilt.
// Returns {hits:[{target, head, dmg, t}], wallT, end:{x,y,z}}.
export function shootHitscan(state, shooter, origin, yaw, pitch, weapon) {
  const spread = weapon.spread + shooter.spreadBloom;
  const results = { hits: [], wallT: Infinity, end: null };
  let bestEndT = Infinity;
  for (let p = 0; p < weapon.pellets; p++) {
    const off = coneOffset(spread);
    const y2 = yaw + off.yaw, p2 = pitch + off.pitch;
    const cp = Math.cos(p2);
    const d = { x: -Math.sin(y2) * cp, y: Math.sin(p2), z: -Math.cos(y2) * cp };
    const wallT = rayBoxes(origin.x, origin.y, origin.z, d.x, d.y, d.z, weapon.range);
    // nearest actor hit
    let bestT = wallT, best = null;
    for (const a of [state.player, ...state.bots]) {
      if (!a || !a.alive || a.id === shooter.id || a.team === shooter.team) continue;
      const hit = rayActor(origin.x, origin.y, origin.z, d.x, d.y, d.z, a);
      if (hit && hit.t < bestT) { bestT = hit.t; best = { actor: a, head: hit.head }; }
    }
    if (best) {
      const dmg = pelletDamage(weapon, best.head);
      applyDamage(state, best.actor, dmg, shooter, best.head);
      results.hits.push({ target: best.actor, head: best.head, dmg, t: bestT });
      if (shooter.isPlayer) state.stats.hits++;
    }
    if (bestT < bestEndT) bestEndT = bestT;
    if (wallT < results.wallT) results.wallT = wallT;
  }
  if (shooter.isPlayer) state.stats.shots++;
  const endT = bestEndT === Infinity ? weapon.range : bestEndT;
  // end point along the base aim (for the tracer)
  const cp0 = Math.cos(pitch);
  const base = { x: -Math.sin(yaw) * cp0, y: Math.sin(pitch), z: -Math.cos(yaw) * cp0 };
  results.end = {
    x: origin.x + base.x * endT,
    y: origin.y + base.y * endT,
    z: origin.z + base.z * endT,
  };
  return results;
}

// Grenade explosion: radius damage with falloff, halved through walls.
export function explodeGrenade(state, pos, ownerId) {
  const R = 6.5;
  for (const a of [state.player, ...state.bots]) {
    if (!a || !a.alive) continue;
    const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z, (1.0 - pos.y));
    if (d > R) continue;
    const clear = losClear(pos.x, pos.y, pos.z, a.pos.x, chestHeight(a), a.pos.z);
    let dmg = 95 * (1 - d / R * 0.7);
    if (!clear) dmg *= 0.5;
    const owner = [state.player, ...state.bots].find(x => x && x.id === ownerId);
    applyDamage(state, a, Math.round(dmg), owner || null, false);
  }
  state.impacts.push({ pos: { ...pos }, t: state.time, life: 0.5, kind: 'boom' });
}

export function teamAlive(state, team) { return aliveCount(state, team); }
