// sim.js — the fixed-step simulation (60 Hz). Movement, shooting, grenades,
// bomb plant/defuse, round and match state machine. Rendering reads this state;
// nothing here touches the DOM or three.js.
import {
  createState, resetMatch, resetRound, addEvent, aliveCount, allActors,
  WIN_ROUNDS, MAX_ROUNDS, ROUND_TIME, BUY_TIME, BOMB_TIME, PLANT_TIME,
  DEFUSE_TIME, WIN_MONEY, LOSS_MONEY, PLANT_MONEY,
} from './state.js';
import { SPAWNS, collideMove, siteForPoint, eyeHeight } from './map.js';
import { WEAPONS, GRENADE, AMMO_PRICE } from './weapons.js';
import { shootHitscan, explodeGrenade, startReload, tickReload } from './combat.js';
import { updateBots, spawnBots } from './bots.js';

export const DT = 1 / 60;
const WALK_SPEED = 4.3;
const CROUCH_SPEED = 2.2;
const ACCEL = 14;
const MOUSE_SENS = 0.0023;

export function startMatch(state) {
  resetMatch(state);
  state.owned = { pistol: true };
  state.playerSurvived = true;
  spawnPlayer(state);
  spawnBots(state);
  state.phase = 'buy';
  state.phaseT = 0;
  state.buyTimer = BUY_TIME;
}

function spawnPlayer(state) {
  const s = SPAWNS.vanguard[0];
  if (!state.player) {
    state.player = {
      id: 'player', team: 'vanguard', name: 'YOU', isPlayer: true,
      pos: { x: s.x, y: 0, z: s.z }, yaw: s.yaw, pitch: 0,
      hp: 100, alive: true, weapon: 'pistol', mag: 12, reserve: 48,
      grenades: 0, hasGrenade: false, crouch: false, moving: false, speed: 0,
      lastShotT: -99, reloadT: -1, spreadBloom: 0, recoilPitch: 0,
      burstLeft: 0, burstT: 0, bot: null, mesh: null,
      vx: 0, vz: 0, stash: {},
    };
  }
  const p = state.player;
  p.pos.x = s.x; p.pos.z = s.z; p.yaw = s.yaw; p.pitch = 0;
  p.vx = 0; p.vz = 0;
}

function startRound(state) {
  state.playerSurvived = state.player ? state.player.alive : true;
  resetRound(state);
  // the team pushes ONE site together this round (splitting 3 ways loses every site fight)
  state.attackSite = Math.random() < 0.5 ? 'A' : 'B';
  // death loses bought weapons
  if (!state.playerSurvived) { state.owned = { pistol: true }; state.player.stash = {}; }
  // reposition everyone at spawns
  const p = state.player;
  spawnPlayer(state);
  p.weapon = p.weapon || 'pistol';
  // restore stashed ammo for the kept weapon
  const st = p.stash[p.weapon];
  if (st) { p.mag = st.mag; p.reserve = st.reserve; }
  const vSpawns = SPAWNS.vanguard, jSpawns = SPAWNS.jackals;
  state.bots.forEach((b, i) => {
    const s = b.team === 'vanguard' ? vSpawns[(i % 3) + 1] : jSpawns[i % 4];
    b.pos.x = s.x; b.pos.z = s.z; b.yaw = s.yaw; b.pitch = 0;
  });
  state.phase = 'live';
  state.phaseT = 0;
  state.roundTimer = ROUND_TIME;
  addEvent(state, `ROUND ${state.round} — PLANT THE CHARGE AT A OR B`, 'info');
}

export function endRound(state, winner, reason) {
  if (state.phase !== 'live') return;
  state.score[winner]++;
  state.roundWinner = winner;
  state.roundReason = reason;
  const playerWon = winner === state.player.team;
  state.money += playerWon ? WIN_MONEY : LOSS_MONEY;
  state.playerSurvived = state.player.alive;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.bomb.defuseT = 0; state.bomb.plantT = 0;
}

function endMatch(state) {
  const v = state.score.vanguard, j = state.score.jackals;
  state.matchWinner = v > j ? 'vanguard' : (j > v ? 'jackals' : 'draw');
  state.phase = 'matchEnd';
  state.phaseT = 0;
}

// ---- buying ----
export function buyWeapon(state, key, audio) {
  if (state.phase !== 'buy') return false;
  const p = state.player;
  if (key === 'grenade') {
    if (p.grenades >= GRENADE.maxCarry || state.money < GRENADE.price) return false;
    state.money -= GRENADE.price; p.grenades++; p.hasGrenade = true;
    if (audio) audio.buy();
    return true;
  }
  if (key === 'ammo') {
    const w = WEAPONS[p.weapon];
    if (state.money < AMMO_PRICE || p.reserve >= w.reserve) return false;
    state.money -= AMMO_PRICE; p.reserve = w.reserve;
    if (audio) audio.buy();
    return true;
  }
  const w = WEAPONS[key];
  if (!w || state.money < w.price) return false;
  if (!state.owned[key]) {
    state.money -= w.price;
    state.owned[key] = true;
  }
  switchWeapon(state, key);
  if (audio) audio.buy();
  return true;
}

export function switchWeapon(state, key) {
  const p = state.player;
  if (!state.owned[key] || p.weapon === key) return false;
  p.stash[p.weapon] = { mag: p.mag, reserve: p.reserve };
  p.weapon = key;
  const st = p.stash[key];
  const w = WEAPONS[key];
  if (st) { p.mag = st.mag; p.reserve = st.reserve; }
  else { p.mag = w.mag; p.reserve = w.reserve; }
  p.reloadT = -1;
  return true;
}

// ---- one fixed step ----
export function stepSim(state, input, audio, dt) {
  state.time += dt;
  state.phaseT += dt;
  const p = state.player;

  if (state.phase === 'buy') {
    state.buyTimer -= dt;
    if (state.buyTimer <= 0) startRound(state);
    return;
  }
  if (state.phase === 'roundEnd') {
    if (state.phaseT >= 4) {
      if (state.score.vanguard >= WIN_ROUNDS || state.score.jackals >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        endMatch(state);
      } else {
        state.round++;
        state.phase = 'buy';
        state.phaseT = 0;
        state.buyTimer = BUY_TIME;
      }
    }
    return;
  }
  if (state.phase !== 'live') return;

  // ----- player look -----
  const m = input.consumeMouse();
  if (p.alive) {
    p.yaw -= m.dx * MOUSE_SENS;
    p.pitch -= m.dy * MOUSE_SENS;
    p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch));
  }

  // ----- player movement -----
  p.crouch = input.keys.has('ControlLeft') || input.keys.has('ControlRight');
  let mx = 0, mz = 0;
  if (p.alive) {
    if (input.keys.has('KeyW')) mz -= 1;
    if (input.keys.has('KeyS')) mz += 1;
    if (input.keys.has('KeyA')) mx -= 1;
    if (input.keys.has('KeyD')) mx += 1;
  }
  const len = Math.hypot(mx, mz) || 1;
  mx /= len; mz /= len;
  const speed = p.crouch ? CROUCH_SPEED : WALK_SPEED;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // forward = (-sin yaw, -cos yaw); right = (cos yaw... ) right = (-cos yaw * -1?) compute: right = ( -cos(yaw) * -1 ) -> use forward x right
  const fx = -sy, fz = -cy;
  const rx = cy, rz = -sy; // right vector (yaw=0 -> +X)
  const tvx = (fx * -mz + rx * mx) * speed;
  const tvz = (fz * -mz + rz * mx) * speed;
  p.vx += (tvx - p.vx) * Math.min(1, ACCEL * dt);
  p.vz += (tvz - p.vz) * Math.min(1, ACCEL * dt);
  const moving = Math.hypot(p.vx, p.vz) > 0.4;
  p.moving = moving;
  p.speed = Math.hypot(p.vx, p.vz);
  if (p.alive) collideMove(p.pos, 0.4, p.vx * dt, p.vz * dt);

  // ----- reloads -----
  for (const a of allActors(state)) tickReload(state, a);
  if (p.alive && input.keys.has('KeyR')) startReload(state, p);

  // ----- weapon switch -----
  if (p.alive) {
    if (input.keys.has('Digit1')) switchWeapon(state, 'pistol');
    if (input.keys.has('Digit2')) switchWeapon(state, 'rifle');
    if (input.keys.has('Digit3')) switchWeapon(state, 'smg');
    if (input.keys.has('Digit4')) switchWeapon(state, 'shotgun');
  }

  // ----- player firing -----
  const w = WEAPONS[p.weapon];
  const attackEdge = input.attackHeld && !input._prevAttack;
  input._prevAttack = input.attackHeld;
  if (p.alive && p.reloadT < 0 && (w.auto ? input.attackHeld : attackEdge)) {
    if (state.time - p.lastShotT >= w.rate) {
      if (p.mag <= 0) { startReload(state, p); if (audio) audio.dry(); }
      else {
        p.lastShotT = state.time;
        p.mag--;
        p.spreadBloom = Math.min(0.05, p.spreadBloom + w.recoil * 0.004);
        p.pitch += w.recoil * 0.008;
        p.yaw += (Math.random() - 0.5) * w.recoil * 0.004;
        const origin = { x: p.pos.x, y: eyeHeight(p), z: p.pos.z };
        const res = shootHitscan(state, p, origin, p.yaw, p.pitch, w);
        state.tracers.push({ a: { ...origin }, b: { ...res.end }, t: state.time, life: 0.07, color: w.tracer });
        if (res.hits.length === 0 && res.wallT < Infinity) {
          state.impacts.push({ pos: { ...res.end }, t: state.time, life: 0.3, kind: 'spark' });
        }
        state.noise.push({ x: p.pos.x, z: p.pos.z, t: state.time });
        if (audio) {
          audio.shot(p.weapon);
          if (res.hits.length) audio.hit(res.hits[0].head);
        }
      }
    }
  }
  // bloom decay + recoil recovery
  p.spreadBloom = Math.max(0, p.spreadBloom - 0.06 * dt);

  // ----- grenade throw -----
  if (p.alive && input.keys.has('KeyG') && !input._prevG && p.grenades > 0) {
    const cp = Math.cos(p.pitch);
    const dir = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch) + 0.25, z: -Math.cos(p.yaw) * cp };
    state.grenades.push({
      pos: { x: p.pos.x, y: eyeHeight(p), z: p.pos.z },
      vel: { x: dir.x * 15, y: dir.y * 15, z: dir.z * 15 },
      t: 0, ownerId: p.id,
    });
    p.grenades--;
    if (p.grenades === 0) p.hasGrenade = false;
    if (audio) audio.click();
  }
  input._prevG = input.keys.has('KeyG');

  // ----- grenade physics -----
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.t += dt;
    g.vel.y -= 14 * dt;
    const nx = g.pos.x + g.vel.x * dt, ny = g.pos.y + g.vel.y * dt, nz = g.pos.z + g.vel.z * dt;
    if (ny < 0.12) { g.pos.y = 0.12; g.vel.y = Math.abs(g.vel.y) * 0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    else {
      // wall bounce: step back on the blocked axis
      const px = g.pos.x, pz = g.pos.z;
      collideMove(g.pos, 0.15, nx - px, 0);
      if (g.pos.x !== nx) g.vel.x *= -0.4;
      collideMove(g.pos, 0.15, 0, nz - pz);
      if (g.pos.z !== nz) g.vel.z *= -0.4;
      g.pos.y = ny;
    }
    if (g.t >= GRENADE.fuse) {
      explodeGrenade(state, g.pos, g.ownerId);
      state.impacts.push({ pos: { ...g.pos }, t: state.time, life: 0.5, kind: 'boom' });
      state.noise.push({ x: g.pos.x, z: g.pos.z, t: state.time });
      if (audio) audio.explode();
      state.grenades.splice(i, 1);
    }
  }

  // ----- player plant / defuse (hold E) -----
  const eHeld = input.keys.has('KeyE');
  const bomb = state.bomb;
  if (p.alive && eHeld) {
    if (bomb.state === 'carried' && bomb.carrierId === 'player') {
      const site = siteForPoint(p.pos.x, p.pos.z);
      if (site) {
        if (bomb.planterId !== 'player') { bomb.planterId = 'player'; bomb.plantT = 0; bomb.hpAtPlant = p.hp; }
        bomb.plantT += dt / PLANT_TIME;
        if (p.hp < bomb.hpAtPlant) { bomb.planterId = null; bomb.plantT = 0; }
        else if (bomb.plantT >= 1) {
          bomb.state = 'planted'; bomb.site = site;
          bomb.pos = { x: p.pos.x, z: p.pos.z };
          bomb.explodeT = BOMB_TIME; bomb.plantT = 0; bomb.planterId = null;
          state.money += PLANT_MONEY;
          state.stats.plants++;
          addEvent(state, 'CHARGE PLANTED AT SITE ' + site, 'info');
          if (audio) audio.plant();
        }
      } else { bomb.planterId = null; bomb.plantT = 0; }
    } else if (bomb.state === 'planted') {
      const d = Math.hypot(p.pos.x - bomb.pos.x, p.pos.z - bomb.pos.z);
      if (d < 1.8) {
        if (bomb.defuserId !== 'player') { bomb.defuserId = 'player'; bomb.defuseT = 0; bomb.hpAtDefuse = p.hp; }
        bomb.defuseT += dt / DEFUSE_TIME;
        if (p.hp < bomb.hpAtDefuse) { bomb.defuserId = null; bomb.defuseT = 0; }
        else if (bomb.defuseT >= 1) {
          bomb.state = 'gone'; bomb.defuseT = 0; bomb.defuserId = null;
          state.stats.defuses++;
          endRound(state, 'vanguard', 'CHARGE DEFUSED');
        }
      } else { if (bomb.defuserId === 'player') { bomb.defuserId = null; bomb.defuseT = 0; } }
    }
  } else {
    if (bomb.planterId === 'player') { bomb.planterId = null; bomb.plantT = 0; }
    if (bomb.defuserId === 'player') { bomb.defuserId = null; bomb.defuseT = 0; }
  }

  // ----- bots -----
  updateBots(state, dt);

  // ----- bot defuse completed: end the round (bots.js only flips the bomb
  // state; the round outcome lives here, next to the player-defuse path) -----
  if (bomb.state === 'gone' && state.phase === 'live') {
    endRound(state, 'jackals', 'CHARGE DEFUSED');
  }

  // ----- bomb explode timer -----
  if (bomb.state === 'planted') {
    bomb.explodeT -= dt;
    if (bomb.explodeT <= 0) {
      explodeGrenade(state, { x: bomb.pos.x, y: 1, z: bomb.pos.z }, bomb.planterId || 'player');
      endRound(state, 'vanguard', 'CHARGE DETONATED AT SITE ' + bomb.site);
    }
  }

  // ----- round timer -----
  state.roundTimer -= dt;
  if (state.roundTimer <= 0 && bomb.state !== 'planted' && state.phase === 'live') {
    endRound(state, 'jackals', 'TIME EXPIRED — SITE HELD');
  }

  // ----- elimination -----
  // Once the bomb is planted the round plays out: detonation or defuse
  // decides it (CS rules). Killing every attacker after the plant does NOT
  // end the round — the defenders still have to defuse, and the bomb still
  // explodes if they don't.
  if (state.phase === 'live' && bomb.state !== 'planted') {
    const v = aliveCount(state, 'vanguard');
    const j = aliveCount(state, 'jackals');
    if (v === 0) endRound(state, 'jackals', 'VANGUARD ELIMINATED');
    else if (j === 0) endRound(state, 'vanguard', 'JACKALS ELIMINATED');
  }

  // ----- prune transient fx -----
  state.tracers = state.tracers.filter(t => state.time - t.t < t.life + 0.05);
  state.impacts = state.impacts.filter(t => state.time - t.t < t.life + 0.05);
  if (state.noise) state.noise = state.noise.filter(n => state.time - n.t < 2.5);
}
