// bots.js — bot AI. Layered state machine over a waypoint graph.
// Attackers (Vanguard) push a lane and plant; defenders (Jackals) hold sites,
// rotate on sound, and defuse. Perception: sight cone + line of sight, hearing
// gunshots. Anti-stuck: wall slide (map.js), progress check, local recovery.
import { LANES, MID_BRANCH, HOLDS, collideMove, losClear, siteForPoint, eyeHeight, chestHeight } from './map.js';
import { WEAPONS } from './weapons.js';
import { shootHitscan, startReload } from './combat.js';
import { PLANT_TIME, DEFUSE_TIME } from './state.js';

const BOT_NAMES = {
  vanguard: ['REX', 'NOVA', 'DUST'],
  jackals: ['VIPER', 'HAVOC', 'GHOST', 'RAZOR'],
};
const FOV_COS = Math.cos(55 * Math.PI / 180); // ~110 deg cone
const VIEW_DIST = 48;
const HEAR_DIST = 30;
const TURN_RATE = 4.2; // rad/s
const BOT_SPEED = 3.6;

export function createBot(id, team, name, x, z, yaw, round) {
  const skill = Math.min(1, 0.55 + round * 0.06); // grows with rounds, capped
  const bot = {
    state: 'move', // move | hold | engage | investigate | plant | defuse | cover
    lane: 'A',
    path: [],
    nodeIdx: 0,
    hold: null,
    viaIdx: 0,
    holdT: 0,
    targetId: null,
    lastSeen: null, // {x, y, z, t}
    reactT: 0,
    alertT: 0,
    skill,
    reactBase: Math.max(0.25, 0.5 - round * 0.03),
    spreadBase: 0.028 - Math.min(0.008, round * 0.001),
    burstLeft: 0,
    burstPause: 0,
    stuckT: 0,
    lastX: x, lastZ: z, stuckCheckT: 0,
    rotateCd: 0,
    hpAtAction: 100,
    actionT: 0,
    investigatePos: null,
    reset() {
      this.state = team === 'jackals' ? 'hold' : 'move';
      this.path = []; this.nodeIdx = 0;
      this.targetId = null; this.lastSeen = null;
      this.reactT = 0; this.alertT = 0;
      this.burstLeft = 0; this.burstPause = 0;
      this.stuckT = 0; this.rotateCd = 0;
      this.actionT = 0; this.investigatePos = null;
      this.hold = null; this.viaIdx = 0; this.holdT = 0;
    },
  };
  return bot;
}

export function spawnBots(state) {
  state.bots = [];
  const vNames = BOT_NAMES.vanguard, jNames = BOT_NAMES.jackals;
  const vSpawns = [{ x: -26, z: -4 }, { x: -26, z: 4 }, { x: -24, z: -6 }];
  const jSpawns = [{ x: 26, z: -4 }, { x: 26, z: 4 }, { x: 24, z: 6 }, { x: 26, z: 0 }];
  vNames.forEach((n, i) => {
    const s = vSpawns[i];
    const a = {
      id: 'ally-' + i, team: 'vanguard', name: n, isPlayer: false,
      pos: { x: s.x, y: 0, z: s.z }, yaw: -Math.PI / 2, pitch: 0,
      hp: 100, alive: true, weapon: 'rifle', mag: 30, reserve: 90,
      grenades: 0, hasGrenade: false, crouch: false, moving: false, speed: 0,
      lastShotT: -99, reloadT: -1, spreadBloom: 0, recoilPitch: 0,
      burstLeft: 0, burstT: 0, bot: null, mesh: null,
    };
    a.bot = createBot(a.id, 'vanguard', n, s.x, s.z, a.yaw, state.round);
    state.bots.push(a);
  });
  jNames.forEach((n, i) => {
    const s = jSpawns[i];
    const a = {
      id: 'enemy-' + i, team: 'jackals', name: n, isPlayer: false,
      pos: { x: s.x, y: 0, z: s.z }, yaw: Math.PI / 2, pitch: 0,
      hp: 100, alive: true, weapon: 'rifle', mag: 30, reserve: 90,
      grenades: 0, hasGrenade: false, crouch: false, moving: false, speed: 0,
      lastShotT: -99, reloadT: -1, spreadBloom: 0, recoilPitch: 0,
      burstLeft: 0, burstT: 0, bot: null, mesh: null,
    };
    a.bot = createBot(a.id, 'jackals', n, s.x, s.z, a.yaw, state.round);
    state.bots.push(a);
  });
}

function pathFor(bot, lane, site) {
  const p = LANES[lane].map(n => ({ ...n }));
  if (lane === 'MID' && site) p.push(...MID_BRANCH[site].map(n => ({ ...n })));
  return p;
}

function angleTo(ax, az, bx, bz) { return Math.atan2(-(bx - ax), -(bz - az)); }
function turnToward(actor, targetYaw, dt, rate) {
  let d = targetYaw - actor.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  actor.yaw += step;
  return Math.abs(d) < 0.05;
}

function nearestVisibleEnemy(state, bot) {
  const me = state.bots.find(b => b.bot === bot) || bot.owner;
  const eyeY = eyeHeight(me);
  let best = null, bestD = Infinity;
  const foes = [state.player, ...state.bots].filter(a =>
    a && a.alive && a.team !== me.team && a.id !== me.id);
  for (const f of foes) {
    const dx = f.pos.x - me.pos.x, dz = f.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > VIEW_DIST) continue;
    // facing check (skip for very close — peripheral awareness)
    if (d > 4) {
      const fy = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      const dot = (dx * fy + dz * fz) / (d || 1);
      if (dot < FOV_COS) continue;
    }
    if (!losClear(me.pos.x, eyeY, me.pos.z, f.pos.x, chestHeight(f), f.pos.z)) continue;
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

function hearShots(state, me) {
  // state.noise: [{x, z, t}] pushed by sim on every gunshot.
  if (!state.noise) return null;
  let best = null;
  for (const n of state.noise) {
    if (state.time - n.t > 2.5) continue;
    const d = Math.hypot(n.x - me.pos.x, n.z - me.pos.z);
    if (d < HEAR_DIST && (!best || d < best.d)) best = { x: n.x, z: n.z, d };
  }
  return best;
}

function moveToward(state, me, tx, tz, dt, speed) {
  const dx = tx - me.pos.x, dz = tz - me.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const vx = dx / d * speed * dt, vz = dz / d * speed * dt;
  collideMove(me.pos, 0.4, vx, vz);
  me.moving = true;
  me.speed = speed;
  turnToward(me, angleTo(me.pos.x, me.pos.z, tx, tz), dt, TURN_RATE);
  return d < 0.7;
}

function fireAt(state, me, target, dt) {
  const b = me.bot;
  const dx = target.pos.x - me.pos.x, dz = target.pos.z - me.pos.z;
  const dist = Math.hypot(dx, dz);
  const aimYaw = angleTo(me.pos.x, me.pos.z, target.pos.x, target.pos.z);
  const aimPitch = Math.atan2(chestHeight(target) - eyeHeight(me), dist);
  turnToward(me, aimYaw, dt, TURN_RATE * 1.5);
  me.pitch += (aimPitch - me.pitch) * Math.min(1, dt * 8);
  // reaction delay on first sight
  if (b.reactT > 0) { b.reactT -= dt; return; }
  if (b.burstPause > 0) { b.burstPause -= dt; return; }
  const w = WEAPONS[me.weapon];
  if (state.time - me.lastShotT < w.rate) return;
  if (me.reloadT > 0) return; // mid-reload
  if (me.mag <= 0) { startReload(state, me); return; }
  if (b.burstLeft <= 0) { b.burstLeft = 2 + Math.floor(Math.random() * 3); }
  // aim error grows with distance and target motion
  const tMoving = target.moving ? 1.5 : 1;
  me.spreadBloom = b.spreadBase * (1 + dist / 30) * tMoving;
  const origin = { x: me.pos.x, y: eyeHeight(me), z: me.pos.z };
  const res = shootHitscan(state, me, origin, me.yaw, me.pitch, w);
  me.lastShotT = state.time;
  me.mag--;
  me.spreadBloom = 0;
  b.burstLeft--;
  if (b.burstLeft <= 0) b.burstPause = 0.45 + Math.random() * 0.35;
  // muzzle + tracer for render
  state.tracers.push({ a: { ...origin }, b: { ...res.end }, t: state.time, life: 0.07, color: w.tracer });
  state.noise.push({ x: me.pos.x, z: me.pos.z, t: state.time });
}

function updateOne(state, me, dt) {
  const b = me.bot;
  if (!me.alive) return;
  b.rotateCd = Math.max(0, b.rotateCd - dt);
  if (b.alertT > 0) b.alertT -= dt;

  // --- perception ---
  const seen = nearestVisibleEnemy(state, b);
  if (seen) {
    b.lastSeen = { x: seen.enemy.pos.x, y: chestHeight(seen.enemy), z: seen.enemy.pos.z, t: state.time };
    if (b.targetId !== seen.enemy.id) {
      b.targetId = seen.enemy.id;
      b.reactT = b.reactBase * (b.alertT > 0 ? 0.6 : 1);
    }
    if (seen.dist <= 30) {
      // close enough to hit reliably: engage. Engaging interrupts a
      // plant/defuse channel.
      if (state.bomb.defuserId === me.id) { state.bomb.defuserId = null; state.bomb.defuseT = 0; }
      if (state.bomb.planterId === me.id) { state.bomb.planterId = null; state.bomb.plantT = 0; }
      b.state = 'engage';
    } else {
      // seen but too far to hit (>30m: spread makes hits near-impossible).
      // Standing still and trading shots across the map is a trap — close
      // the distance instead. (Bomb channels are NOT interrupted here: the
      // channel code below re-asserts plant/defuse when in site.)
      // EXCEPT the carrier: it never chases — it pushes to the site.
      if (state.bomb.state === 'carried' && state.bomb.carrierId === me.id) {
        b.state = 'move';
      } else {
        b.state = 'investigate';
        b.investigatePos = { x: seen.enemy.pos.x, z: seen.enemy.pos.z };
      }
    }
  } else if (b.state === 'engage') {
    b.targetId = null;
    // last known position is fresh -> investigate, else resume
    if (b.lastSeen && state.time - b.lastSeen.t < 3) {
      b.state = 'investigate';
      b.investigatePos = { x: b.lastSeen.x, z: b.lastSeen.z };
    } else {
      b.state = me.team === 'jackals' ? 'hold' : 'move';
    }
  }
  // hearing
  const heard = hearShots(state, me);
  if (heard && b.state !== 'engage') {
    b.alertT = 2;
    if (b.state === 'hold' || b.state === 'move') {
      turnToward(me, angleTo(me.pos.x, me.pos.z, heard.x, heard.z), dt, TURN_RATE);
    }
  }

  // --- bomb logic (overrides movement) ---
  // A carrier/defuser commits to the channel unless an enemy is RIGHT there
  // (<7m) or they take damage. A distant visible enemy must NOT block the
  // plant/defuse, or the objective can never happen (defenders hold the site).
  const bomb = state.bomb;
  const nearThreat = seen && seen.dist < 7;
  if (me.team === 'jackals' && bomb.state === 'planted') {
    const site = bomb.site;
    const dSite = Math.hypot(me.pos.x - bomb.pos.x, me.pos.z - bomb.pos.z);
    const defuser = bomb.defuserId === me.id;
    const othersDefusing = bomb.defuserId && bomb.defuserId !== me.id;
    if (dSite < 1.6 && !othersDefusing && !nearThreat) {
      // defuse channel
      if (b.state !== 'defuse') { b.state = 'defuse'; b.actionT = 0; b.hpAtAction = me.hp; }
      b.actionT += dt;
      bomb.defuseT = b.actionT / DEFUSE_TIME;
      bomb.defuserId = me.id;
      if (me.hp < b.hpAtAction) { // interrupted by damage
        b.state = 'cover'; bomb.defuseT = 0; bomb.defuserId = null;
      } else if (b.actionT >= DEFUSE_TIME) {
        // bomb defused — sim.js ends the round (bot defuse must NOT set the
        // round outcome directly: endRound() lives in sim.js, and setting
        // roundWinner here without ending the round left the round running
        // until the timer expired)
        bomb.state = 'gone';
      }
      return;
    }
    if (b.state === 'defuse') { b.state = 'move'; bomb.defuseT = 0; bomb.defuserId = null; }
    // move to the planted bomb (rotate)
    moveToward(state, me, bomb.pos.x, bomb.pos.z, dt, BOT_SPEED);
    return;
  }
  if (me.team === 'vanguard' && bomb.state === 'dropped' && (!seen || seen.dist > 12)) {
    // nearest alive attacker fetches the dropped charge — even if it was
    // engaging a distant enemy (>12m): the bomb matters more than a
    // long-range duel, and the carrier can fight after pickup
    const carriers = [state.player, ...state.bots].filter(a => a && a.alive && a.team === 'vanguard');
    let nearest = null, nd = Infinity;
    for (const a of carriers) {
      const d = Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z);
      if (d < nd) { nd = d; nearest = a; }
    }
    if (nearest === me) {
      if (nd < 1.2) {
        bomb.state = 'carried'; bomb.carrierId = me.id; bomb.pos = null;
      } else {
        moveToward(state, me, bomb.pos.x, bomb.pos.z, dt, BOT_SPEED);
        return;
      }
    }
  }
  if (me.team === 'vanguard' && bomb.state === 'carried' && bomb.carrierId === me.id) {
    const site = siteForPoint(me.pos.x, me.pos.z);
    if (site && !nearThreat) {
      // plant channel, interrupted only by damage (a far visible enemy must
      // not block it — the planter is defenceless while planting, that is
      // the risk; the channel is the reward for clearing the site)
      if (b.state !== 'plant') { b.state = 'plant'; b.actionT = 0; b.hpAtAction = me.hp; }
      if (me.hp < b.hpAtAction) {
        b.state = 'cover'; bomb.plantT = 0; bomb.planterId = null;
      } else {
        b.actionT += dt;
        bomb.plantT = b.actionT / PLANT_TIME;
        bomb.planterId = me.id;
        if (b.actionT >= PLANT_TIME) {
          bomb.state = 'planted'; bomb.site = site;
          bomb.pos = { x: me.pos.x, z: me.pos.z };
          bomb.explodeT = 35; bomb.plantT = 0; bomb.planterId = null;
          state.stats.plants += me.isPlayer ? 1 : 0;
          if (me.isPlayer) state.money += 300;
        }
      }
      return;
    }
  }

  if (me.team === 'vanguard' && bomb.state === 'planted' && b.state !== 'engage') {
    // guard the planted charge: stand off from it, FACING it, so a defuser
    // walking up to the bomb enters the guard's sight cone. Without this the
    // planter finishes the path, stands at the site edge facing its movement
    // direction, and watches a defuser work 4m away (traced 01:1x WIB).
    const guards = [state.player, ...state.bots].filter(a => a && a.alive && a.team === 'vanguard');
    const idx = Math.max(0, guards.indexOf(me));
    const spots = [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }];
    const s = spots[idx % spots.length];
    const gx = bomb.pos.x + s.x, gz = bomb.pos.z + s.z;
    const d = Math.hypot(me.pos.x - gx, me.pos.z - gz);
    if (d > 1) { moveToward(state, me, gx, gz, dt, BOT_SPEED); return; }
    turnToward(me, angleTo(me.pos.x, me.pos.z, bomb.pos.x, bomb.pos.z), dt, TURN_RATE);
    b.state = 'hold';
    return;
  }

  // --- state behavior ---
  switch (b.state) {
    case 'plant':
    case 'defuse':
      // channel over (bomb planted/gone or interrupted): resume normal play
      b.state = me.team === 'jackals' ? 'hold' : 'move';
      break;
    case 'engage': {
      const target = [state.player, ...state.bots].find(a => a && a.id === b.targetId && a.alive);
      if (!target) { b.state = me.team === 'jackals' ? 'hold' : 'move'; break; }
      // target drifted out of effective range: close the distance
      const tdist = Math.hypot(target.pos.x - me.pos.x, target.pos.z - me.pos.z);
      if (tdist > 32) {
        b.state = 'investigate';
        b.investigatePos = { x: target.pos.x, z: target.pos.z };
        break;
      }
      fireAt(state, me, target, dt);
      break;
    }
    case 'investigate': {
      // the carrier never chases a last-known position — it pushes the site
      if (bomb.state === 'carried' && bomb.carrierId === me.id) {
        b.state = 'move'; b.investigatePos = null; break;
      }
      if (!b.investigatePos) { b.state = 'move'; break; }
      const arrived = moveToward(state, me, b.investigatePos.x, b.investigatePos.z, dt, BOT_SPEED);
      if (arrived) { b.state = me.team === 'jackals' ? 'hold' : 'move'; b.investigatePos = null; }
      break;
    }
    case 'hold': {
      me.moving = false; me.speed = 0;
      if (!b.hold) { b.state = 'move'; break; } // no hold assigned yet: go pick one
      if (b.hold) {
        turnToward(me, b.hold.yaw, dt, TURN_RATE * 0.6);
        b.holdT += dt;
      }
      break;
    }
    case 'cover':
    case 'move':
    default: {
      // vanguard attackers: the team pushes ONE site together (state.attackSite)
      if (me.team === 'jackals') {
        if (!b.hold) {
          const idx = state.bots.filter(x => x.team === 'jackals').indexOf(me);
          const site = idx % 2 === 0 ? 'A' : 'B';
          const holds = HOLDS[site];
          b.hold = holds[idx % holds.length];
          b.viaIdx = 0;
          b.lane = site;
        }
        // walk the hold's via waypoints first (straight lines to a hold
        // cross containers — the audit-verified route goes via these nodes)
        const via = b.hold.via || [];
        const target = b.viaIdx < via.length ? via[b.viaIdx] : b.hold;
        const d = Math.hypot(me.pos.x - target.x, me.pos.z - target.z);
        if (d > 0.8) moveToward(state, me, target.x, target.z, dt, BOT_SPEED * 0.9);
        else if (b.viaIdx < via.length) b.viaIdx++;
        else b.state = 'hold';
        break;
      }
      // vanguard attackers: the team pushes ONE site together (state.attackSite).
      // ALL THREE take the site lane: the old split (2 site + 1 mid) lost
      // every site fight — the mid bot died alone in the corridor while the
      // pair fought 2v2+ at the site (traced 01:2x WIB). Mid stays a
      // player flanking route and a defender rotation route.
      if (b.path.length === 0) {
        const site = state.attackSite || 'A';
        b.lane = site;
        b.path = pathFor(b, site, site);
        // start at the NEAREST node, never walk back across the map to node 0:
        // a bot that fetches the bomb mid-push (or spent the round fighting)
        // used to walk all the way back to its lane start and die en route
        let best = 0, bd = Infinity;
        b.path.forEach((n, i) => {
          const d = Math.hypot(n.x - me.pos.x, n.z - me.pos.z);
          if (d < bd) { bd = d; best = i; }
        });
        b.nodeIdx = best;
      }
      if (b.nodeIdx >= b.path.length) { b.state = 'hold'; b.hold = { x: me.pos.x, z: me.pos.z, yaw: me.yaw }; break; }
      const node = b.path[b.nodeIdx];
      const arrived = moveToward(state, me, node.x, node.z, dt, BOT_SPEED);
      if (arrived) b.nodeIdx++;
      break;
    }
  }

  // --- anti-stuck: progress check + local recovery ---
  b.stuckCheckT += dt;
  if (b.stuckCheckT > 1.5) {
    const moved = Math.hypot(me.pos.x - b.lastX, me.pos.z - b.lastZ);
    if (me.moving && moved < 0.3 && (b.state === 'move' || b.state === 'investigate')) {
      b.stuckT++;
      // back up and sidestep, then skip to the next node
      const back = 1.2;
      collideMove(me.pos, 0.4, Math.sin(me.yaw) * back, Math.cos(me.yaw) * back);
      const side = (Math.random() < 0.5 ? 1 : -1) * 1.0;
      collideMove(me.pos, 0.4, Math.cos(me.yaw) * side, -Math.sin(me.yaw) * side);
      if (b.path.length) b.nodeIdx = Math.min(b.nodeIdx + 1, b.path.length - 1);
    }
    b.lastX = me.pos.x; b.lastZ = me.pos.z; b.stuckCheckT = 0;
  }
  me.moving = false;
}

export function updateBots(state, dt) {
  if (!state.noise) state.noise = [];
  // prune old noise
  state.noise = state.noise.filter(n => state.time - n.t < 2.5);
  for (const me of state.bots) {
    if (!me.bot) continue;
    if (!me.bot.owner) me.bot.owner = me;
    updateOne(state, me, dt);
  }
  // separation: keep bots from stacking
  const all = state.bots.filter(b => b.alive);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], c = all[j];
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.9) {
        const push = (0.9 - d) / 2;
        const nx = dx / d, nz = dz / d;
        collideMove(a.pos, 0.4, -nx * push, -nz * push);
        collideMove(c.pos, 0.4, nx * push, nz * push);
      }
    }
  }
}
