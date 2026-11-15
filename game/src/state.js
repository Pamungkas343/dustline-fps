// state.js — the single place all game state lives. Every module reads and writes
// this one object; nothing else keeps a copy of match state.
import { WEAPONS } from './weapons.js';

export const TEAMS = { VANGUARD: 'vanguard', JACKALS: 'jackals' };
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 12; // seconds of buy phase before each round
export const BOMB_TIME = 35; // seconds from plant to detonation
export const PLANT_TIME = 3; // seconds holding E to plant
export const DEFUSE_TIME = 5; // seconds holding E to defuse
export const START_MONEY = 800;
export const KILL_MONEY = 300;
export const WIN_MONEY = 3000;
export const LOSS_MONEY = 1500;
export const PLANT_MONEY = 300;

export function makeActor(id, team, name, isPlayer, x, z, yaw) {
  return {
    id, team, name, isPlayer,
    pos: { x, y: 0, z },
    yaw, pitch: 0,
    hp: 100, alive: true,
    weapon: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    grenades: 0, hasGrenade: false,
    crouch: false, moving: false, speed: 0,
    // combat
    lastShotT: -99, reloadT: -1, spreadBloom: 0, recoilPitch: 0,
    burstLeft: 0, burstT: 0,
    // bot-only fields (filled by bots.js)
    bot: null,
    // visual sync (filled by render.js)
    mesh: null,
  };
}

export function createState() {
  const state = {
    time: 0,
    phase: 'title', // title | buy | live | roundEnd | matchEnd
    phaseT: 0,
    paused: false,
    round: 1,
    score: { vanguard: 0, jackals: 0 },
    roundTimer: ROUND_TIME,
    buyTimer: BUY_TIME,
    money: START_MONEY,
    player: null,
    bots: [],
    bomb: {
      state: 'carried', // carried | dropped | planted | gone
      carrierId: 'player',
      pos: null, // {x,z} when dropped/planted
      site: null, // 'A' | 'B' when planted
      plantT: 0, // seconds of plant channel in progress
      planterId: null,
      explodeT: 0, // countdown once planted
      defuseT: 0,
      defuserId: null,
    },
    grenades: [], // live thrown grenades {pos, vel, t, ownerId}
    tracers: [], // {a:{x,y,z}, b:{x,y,z}, t, life} for render
    impacts: [], // {pos, t, life, kind}
    events: [], // killfeed {t, text, kind, head}
    noise: [], // gunshot positions bots can hear {x, z, t}
    owned: { pistol: true }, // player-owned weapons
    stats: { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, plants: 0, defuses: 0 },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    muted: false,
  };
  return state;
}

export function resetMatch(state) {
  state.time = 0;
  state.round = 1;
  state.score = { vanguard: 0, jackals: 0 };
  state.money = START_MONEY;
  state.stats = { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, plants: 0, defuses: 0 };
  state.matchWinner = null;
  state.events = [];
  state.grenades = [];
  state.tracers = [];
  state.impacts = [];
}

export function resetRound(state) {
  state.roundTimer = ROUND_TIME;
  state.buyTimer = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.grenades = [];
  state.tracers = [];
  state.impacts = [];
  state.bomb = {
    state: 'carried', carrierId: 'player', pos: null, site: null,
    plantT: 0, planterId: null, explodeT: 0, defuseT: 0, defuserId: null,
  };
  // revive everyone, restore health; weapons persist for survivors, reset for the dead
  const all = [state.player, ...state.bots];
  for (const a of all) {
    if (!a) continue;
    a.hp = 100; a.alive = true;
    a.lastShotT = -99; a.reloadT = -1; a.spreadBloom = 0; a.recoilPitch = 0;
    a.burstLeft = 0; a.burstT = 0;
    if (a.isPlayer) {
      // player keeps bought weapon only if they survived last round; handled by caller via state.playerSurvived
      if (!state.playerSurvived) { a.weapon = 'pistol'; a.grenades = 0; }
    }
    a.mag = WEAPONS[a.weapon].mag;
    a.reserve = WEAPONS[a.weapon].reserve;
    if (a.bot) a.bot.reset();
  }
  state.playerSurvived = true;
}

export function addEvent(state, text, kind, head) {
  state.events.push({ t: state.time, text, kind: kind || '', head: !!head });
  if (state.events.length > 6) state.events.shift();
}

export function aliveCount(state, team) {
  let n = 0;
  if (state.player && state.player.team === team && state.player.alive) n++;
  for (const b of state.bots) if (b.team === team && b.alive) n++;
  return n;
}

export function allActors(state) {
  return state.player ? [state.player, ...state.bots] : [...state.bots];
}
