// hud.js — DOM HUD, menus, killfeed, minimap. Reads state every frame;
// writes the DOM only when a value changed (cheap). No game logic here.
import { WEAPONS, GRENADE, BUY_LIST, AMMO_PRICE } from './weapons.js';
import { MAX_ROUNDS } from './state.js';
import { BOXES, SITES, BOUNDS, losClear, eyeHeight } from './map.js';

function $(id) { return document.getElementById(id); }

export function createHud(state, cb) {
  const el = {
    hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    healthNum: $('health-num'), healthFill: $('health-fill'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), reloadHint: $('reload-hint'),
    roundScore: $('round-score'), timer: $('timer'), roundLabel: $('round-label'),
    money: $('money'), killfeed: $('killfeed'), minimap: $('minimap'),
    bombStatus: $('bomb-status'), banner: $('banner'),
    plantbar: $('plantbar'), plantFill: document.querySelector('#plantbar .fill'),
    vignette: $('vignette'),
    menuTitle: $('menu-title'), menuBuy: $('menu-buy'), menuRoundEnd: $('menu-roundend'),
    menuMatchEnd: $('menu-matchend'), menuPause: $('menu-pause'),
    buyGrid: $('buy-grid'), buyMoney: $('buy-money'), buyRound: $('buy-round'),
    roundEndTitle: $('roundend-title'), roundEndSub: $('roundend-sub'),
    matchEndTitle: $('matchend-title'), matchEndScore: $('matchend-score'),
    matchEndStats: $('matchend-stats'),
  };
  const mm = el.minimap.getContext('2d');
  const cache = {};
  let lastHits = 0, lastHeadshots = 0, lastHp = 100, hitT = -9, bannerT = -9;

  function setText(node, key, text) {
    if (cache[key] !== text) { cache[key] = text; node.textContent = text; }
  }
  function setHtml(node, key, html) {
    if (cache[key] !== html) { cache[key] = html; node.innerHTML = html; }
  }
  function show(node, on) { node.classList.toggle('hidden', !on); }

  // ---- buy menu cards ----
  const cards = {};
  function buildBuy() {
    el.buyGrid.innerHTML = '';
    const defs = [
      { key: 'rifle', name: 'AR-77 VULTURE', desc: 'Auto rifle. 30 rounds. Accurate at range. The workhorse.', price: WEAPONS.rifle.price },
      { key: 'smg', name: 'SMG-9 JACKAL', desc: 'Fast auto SMG. 32 rounds. Close quarters, high spread.', price: WEAPONS.smg.price },
      { key: 'shotgun', name: 'SG-12 BREACHER', desc: '8-pellet pump. Devastating up close, useless far.', price: WEAPONS.shotgun.price },
      { key: 'grenade', name: 'FRAG-7', desc: 'Frag grenade. 95 damage in 6.5 m. Carry up to 2.', price: GRENADE.price },
      { key: 'ammo', name: 'AMMO RESUPPLY', desc: 'Refill reserve ammo for your current weapon.', price: AMMO_PRICE },
    ];
    for (const d of defs) {
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<div class="nm">${d.name}</div><div class="ds">${d.desc}</div><div class="pr">$${d.price}</div><div class="key">click to buy</div>`;
      c.addEventListener('click', () => cb.onBuy(d.key));
      el.buyGrid.appendChild(c);
      cards[d.key] = c;
    }
  }
  buildBuy();

  $('btn-deploy').addEventListener('click', () => cb.onDeploy());
  $('btn-deploy-round').addEventListener('click', () => cb.onDeployRound());
  $('btn-again').addEventListener('click', () => cb.onAgain());
  $('btn-resume').addEventListener('click', () => cb.onResume());

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawMinimap() {
    const W = 170, H = 150;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(194,168,120,0.25)';
    mm.fillRect(0, 0, W, H);
    const sx = W / (BOUNDS.maxX - BOUNDS.minX), sz = H / (BOUNDS.maxZ - BOUNDS.minZ);
    const X = x => (x - BOUNDS.minX) * sx, Z = z => (z - BOUNDS.minZ) * sz;
    // sites
    for (const k of ['A', 'B']) {
      const s = SITES[k];
      mm.fillStyle = k === 'A' ? 'rgba(46,196,182,0.35)' : 'rgba(227,100,20,0.35)';
      mm.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * sx, (s.z1 - s.z0) * sz);
      mm.fillStyle = '#fff';
      mm.font = 'bold 11px sans-serif';
      mm.fillText(k, X(s.cx) - 3, Z(s.cz) + 4);
    }
    // walls
    mm.fillStyle = 'rgba(20,20,24,0.85)';
    for (const b of BOXES) mm.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
    // bomb
    const bomb = state.bomb;
    if (bomb.state === 'planted' && bomb.pos) {
      mm.fillStyle = '#ffcf3f';
      mm.beginPath(); mm.arc(X(bomb.pos.x), Z(bomb.pos.z), 4, 0, 7); mm.fill();
    } else if (bomb.state === 'dropped' && bomb.pos) {
      mm.fillStyle = '#ffcf3f';
      mm.fillRect(X(bomb.pos.x) - 3, Z(bomb.pos.z) - 3, 6, 6);
    }
    // actors: player arrow, allies teal, enemies orange only when seen or loud
    const p = state.player;
    function dot(a, color, r) {
      mm.fillStyle = color;
      mm.beginPath(); mm.arc(X(a.pos.x), Z(a.pos.z), r, 0, 7); mm.fill();
    }
    for (const b of state.bots) {
      if (!b.alive) continue;
      if (b.team === 'vanguard') dot(b, '#2ec4b6', 3);
      else {
        const seen = p && p.alive && losClear(p.pos.x, eyeHeight(p), p.pos.z, b.pos.x, 1.3, b.pos.z);
        const loud = state.noise.some(n => state.time - n.t < 2 && Math.hypot(n.x - b.pos.x, n.z - b.pos.z) < 1.5);
        if (seen || loud) dot(b, '#e36414', 3);
      }
    }
    if (p && p.alive) {
      mm.fillStyle = '#fff';
      mm.beginPath();
      const px = X(p.pos.x), pz = Z(p.pos.z);
      const a = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)); // facing on map (x right, z down)
      mm.moveTo(px + Math.cos(a) * 7, pz + Math.sin(a) * 7);
      mm.moveTo(px + Math.cos(a + 2.5) * 5, pz + Math.sin(a + 2.5) * 5);
      mm.moveTo(px + Math.cos(a - 2.5) * 5, pz + Math.sin(a - 2.5) * 5);
      mm.closePath(); mm.fill();
    }
  }

  function showBanner(big, small, cls) {
    el.banner.querySelector('.big').textContent = big;
    el.banner.querySelector('.big').className = 'big ' + (cls || '');
    el.banner.querySelector('.small').textContent = small || '';
    el.banner.classList.remove('hidden');
    bannerT = state.time;
  }

  return {
    update() {
      const p = state.player;
      const phase = state.phase;
      show(el.menuTitle, phase === 'title');
      show(el.menuBuy, phase === 'buy');
      show(el.menuRoundEnd, phase === 'roundEnd');
      show(el.menuMatchEnd, phase === 'matchEnd');
      show(el.menuPause, !!state.paused && phase === 'live');
      show(el.hud, phase !== 'title');

      if (!p) return;
      // health
      setText(el.healthNum, 'hp', String(Math.ceil(p.hp)));
      const hPct = Math.max(0, p.hp);
      if (cache.hpct !== hPct) {
        cache.hpct = hPct;
        el.healthFill.style.width = hPct + '%';
        el.healthFill.classList.toggle('low', hPct <= 30);
      }
      // ammo / weapon
      const w = WEAPONS[p.weapon];
      setText(el.ammoMag, 'mag', String(p.mag));
      setText(el.ammoReserve, 'res', ' / ' + p.reserve);
      setText(el.weaponName, 'wn', w.name);
      show(el.reloadHint, p.reloadT > 0 || (p.mag === 0 && p.reserve > 0));
      // score / timer
      setHtml(el.roundScore, 'score',
        `<span class="vg">VANGUARD ${state.score.vanguard}</span> &mdash; <span class="jk">${state.score.jackals} JACKALS</span>`);
      const t = state.phase === 'buy' ? state.buyTimer : state.roundTimer;
      setText(el.timer, 'timer', fmtTime(t));
      el.timer.classList.toggle('low', t < 15 && state.phase === 'live');
      setText(el.roundLabel, 'rl', `ROUND ${state.round} / ${MAX_ROUNDS} · FIRST TO 5`);
      setText(el.money, 'money', '$' + state.money);
      // crosshair gap from spread + motion
      const gap = 8 + p.spreadBloom * 260 + (p.moving ? 4 : 0) - (p.crouch ? 2 : 0);
      el.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
      // hitmarker
      if (state.stats.hits !== lastHits) {
        const head = state.stats.headshots !== lastHeadshots;
        lastHits = state.stats.hits; lastHeadshots = state.stats.headshots;
        el.hitmarker.classList.toggle('head', head);
        el.hitmarker.style.opacity = '1';
        hitT = state.time;
      }
      if (state.time - hitT > 0.12) el.hitmarker.style.opacity = '0';
      // damage vignette
      if (p.hp < lastHp) {
        el.vignette.style.opacity = '0.9';
        setTimeout(() => { el.vignette.style.opacity = '0'; }, 120);
      }
      lastHp = p.hp;
      // killfeed
      setHtml(el.killfeed, 'kf', state.events.slice(-5).map(e =>
        `<div class="${e.head ? 'hs' : ''}">${e.text}</div>`).join(''));
      // bomb status
      const b = state.bomb;
      let bs = '';
      if (b.state === 'planted') bs = `CHARGE PLANTED — SITE ${b.site} — ${Math.ceil(b.explodeT)}s`;
      else if (b.state === 'dropped') bs = 'CHARGE DROPPED — RECOVER IT';
      else if (b.state === 'carried' && b.carrierId === 'player') bs = 'YOU CARRY THE CHARGE — PLANT AT A OR B (HOLD E)';
      setText(el.bombStatus, 'bs', bs);
      // plant/defuse bar
      const prog = b.planterId === 'player' ? b.plantT : (b.defuserId === 'player' ? b.defuseT : 0);
      show(el.plantbar, prog > 0);
      if (prog > 0) el.plantFill.style.width = Math.round(prog * 100) + '%';
      // banner auto-hide
      if (state.time - bannerT > 3.5) el.banner.classList.add('hidden');
      // buy menu state
      if (phase === 'buy') {
        setText(el.buyMoney, 'bm', '$' + state.money);
        setText(el.buyRound, 'br', String(state.round));
        for (const k of ['rifle', 'smg', 'shotgun', 'grenade', 'ammo']) {
          const c = cards[k];
          if (!c) continue;
          const owned = k === 'ammo' ? false : state.owned[k];
          const price = k === 'grenade' ? GRENADE.price : k === 'ammo' ? AMMO_PRICE : WEAPONS[k].price;
          const cant = (k === 'grenade' && p.grenades >= GRENADE.maxCarry) || state.money < price;
          c.classList.toggle('owned', !!owned);
          c.classList.toggle('cant', cant);
        }
      }
      // round end menu
      if (phase === 'roundEnd') {
        const won = state.roundWinner === 'vanguard';
        setText(el.roundEndTitle, 'ret', won ? 'ROUND WON' : 'ROUND LOST');
        el.roundEndTitle.style.color = won ? '#2ec4b6' : '#ff5a3c';
        setText(el.roundEndSub, 'res', `${state.roundReason}  ·  VANGUARD ${state.score.vanguard} — ${state.score.jackals} JACKALS`);
      }
      // match end menu
      if (phase === 'matchEnd') {
        const won = state.matchWinner === 'vanguard';
        setText(el.matchEndTitle, 'met', state.matchWinner === 'draw' ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT'));
        el.matchEndTitle.style.color = won ? '#2ec4b6' : '#ff5a3c';
        setText(el.matchEndScore, 'mes', `VANGUARD ${state.score.vanguard} — ${state.score.jackals} JACKALS`);
        const acc = state.stats.shots ? Math.round(state.stats.hits / state.stats.shots * 100) : 0;
        setText(el.matchEndStats, 'mest',
          `KILLS ${state.stats.kills} · DEATHS ${state.stats.deaths} · HEADSHOTS ${state.stats.headshots} · ACCURACY ${acc}% · PLANTS ${state.stats.plants}`);
      }
      drawMinimap();
    },
    showBanner,
  };
}
