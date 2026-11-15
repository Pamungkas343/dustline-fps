// main.js — bootstrap: wires state + sim + input + audio + hud + renderer,
// runs the fixed-step loop, owns menus/pause, and exposes a small debug API
// (window.__dustline) that screenshot automation uses to stage real game states.
import { createState } from './state.js';
import { startMatch, stepSim, buyWeapon, endRound, DT } from './sim.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { SITES } from './map.js';

const app = document.getElementById('app');
const state = createState();
const audio = createAudio();
const renderer = createRenderer(state, app);
const hud = createHud(state, {
  onDeploy() {
    audio.unlock();
    audio.click();
    startMatch(state);
  },
  onDeployRound() {
    audio.click();
    state.buyTimer = 0.01;
    input.requestLock();
  },
  onAgain() {
    audio.click();
    startMatch(state);
  },
  onResume() {
    state.paused = false;
    input.requestLock();
  },
  onBuy(key) {
    if (buyWeapon(state, key, audio)) hud.update();
  },
});
const input = createInput(renderer.dom, {
  onKey(code, down) {
    if (!down) return;
    if (code === 'KeyM') {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
    }
    if (code === 'KeyB' && state.phase === 'buy') hud.update();
  },
  onLock(locked) {
    if (!locked && state.phase === 'live' && !state.paused) {
      state.paused = true;
    }
  },
  onWheel(dir) {
    if (state.phase !== 'live' || !state.player || !state.player.alive) return;
    const order = ['pistol', 'rifle', 'smg', 'shotgun'];
    const owned = order.filter(k => state.owned[k]);
    if (owned.length < 2) return;
    const cur = owned.indexOf(state.player.weapon);
    const next = owned[(cur + (dir > 0 ? 1 : -1) + owned.length) % owned.length];
    import('./sim.js').then(m => m.switchWeapon(state, next));
  },
});

window.addEventListener('resize', () => {
  renderer.resize(app.clientWidth, app.clientHeight);
});
window.addEventListener('error', (e) => {
  (window.__dustline.errors = window.__dustline.errors || []).push(String(e.message));
});

// ---- game loop: fixed-step sim, render every frame ----
let last = performance.now();
let acc = 0;
let prevPhase = state.phase;
let prevBombState = state.bomb.state;
let frames = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frames++;

  if (!state.paused && state.phase !== 'title') {
    acc += frameDt;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      stepSim(state, input, audio, DT);
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0;
  }

  // phase transitions
  if (state.phase !== prevPhase) {
    if (state.phase === 'live') {
      hud.showBanner(`ROUND ${state.round}`, 'PLANT THE CHARGE AT A OR B — OR ELIMINATE THE JACKALS', '');
      input.requestLock();
    }
    if (state.phase === 'buy' || state.phase === 'roundEnd' || state.phase === 'matchEnd') {
      input.exitLock();
    }
    if (state.phase === 'roundEnd') {
      const won = state.roundWinner === 'vanguard';
      if (audio) { if (won) audio.win(); else audio.lose(); }
    }
    prevPhase = state.phase;
  }
  if (state.bomb.state === 'planted' && prevBombState !== 'planted') {
    hud.showBanner('CHARGE PLANTED', `SITE ${state.bomb.site} — DEFEND IT FOR ${state.bomb.explodeT | 0}s`, '');
    prevBombState = 'planted';
  } else if (state.bomb.state !== 'planted') {
    prevBombState = state.bomb.state;
  }

  hud.update();
  renderer.render(state, frameDt);
  if (frames === 5) window.__dustline.ready = true;
}

// ---- debug API for screenshot staging (real code paths, real renders) ----
window.__dustline = {
  state, ready: false, errors: [],
  start() { audio.unlock(); startMatch(state); },
  deploy() { state.buyTimer = 0.01; },
  teleport(x, z, yaw, pitch) {
    const p = state.player;
    if (!p) return;
    p.pos.x = x; p.pos.z = z;
    if (yaw !== undefined) p.yaw = yaw;
    if (pitch !== undefined) p.pitch = pitch;
  },
  lookAt(x, y, z) {
    const p = state.player;
    if (!p) return;
    const dx = x - p.pos.x, dz = z - p.pos.z, dy = y - 1.55;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  },
  giveMoney(n) { state.money += n; },
  buy(key) { return buyWeapon(state, key, audio); },
  plant(site) {
    const s = SITES[site || 'A'];
    state.bomb.state = 'planted';
    state.bomb.site = site || 'A';
    state.bomb.pos = { x: s.cx, z: s.cz };
    state.bomb.explodeT = 35;
  },
  forceRoundEnd(winner, reason) { endRound(state, winner, reason || 'DEBUG'); },
  setBotsVisible() {
    // teleport nearest enemies in front of the player for an action shot
    const p = state.player;
    if (!p) return;
    const foes = state.bots.filter(b => b.team === 'jackals' && b.alive);
    foes.slice(0, 2).forEach((b, i) => {
      const yaw = p.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      b.pos.x = p.pos.x + fx * (10 + i * 4) + rx * (i === 0 ? -3 : 3);
      b.pos.z = p.pos.z + fz * (10 + i * 4) + rz * (i === 0 ? -3 : 3);
      b.yaw = yaw + Math.PI;
    });
  },
  stats() {
    return {
      phase: state.phase, round: state.round,
      score: { ...state.score }, money: state.money,
      aliveV: state.bots.filter(b => b.team === 'vanguard' && b.alive).length,
      aliveJ: state.bots.filter(b => b.team === 'jackals' && b.alive).length,
      playerAlive: state.player ? state.player.alive : false,
      playerHp: state.player ? state.player.hp : 0,
      bomb: state.bomb.state,
    };
  },
};

requestAnimationFrame(loop);
