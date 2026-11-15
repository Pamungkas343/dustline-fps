// weapons.js — weapon definitions (pure data) + small pure helpers.
// No rendering, no state: the sim applies these numbers.
export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'VK-9 SIDEARM', price: 0,
    damage: 26, headMul: 2, mag: 12, reserve: 48,
    rate: 0.26, auto: false, spread: 0.011, recoil: 0.35, reload: 1.1,
    range: 60, pellets: 1, tracer: '#ffd27d',
  },
  rifle: {
    key: 'rifle', name: 'AR-77 VULTURE', price: 2700,
    damage: 34, headMul: 2, mag: 30, reserve: 90,
    rate: 0.1, auto: true, spread: 0.009, recoil: 0.62, reload: 2.2,
    range: 80, pellets: 1, tracer: '#ffe9a8',
  },
  smg: {
    key: 'smg', name: 'SMG-9 JACKAL', price: 1500,
    damage: 22, headMul: 2, mag: 32, reserve: 96,
    rate: 0.07, auto: true, spread: 0.017, recoil: 0.34, reload: 1.8,
    range: 55, pellets: 1, tracer: '#a8e6ff',
  },
  shotgun: {
    key: 'shotgun', name: 'SG-12 BREACHER', price: 1200,
    damage: 12, headMul: 2, mag: 6, reserve: 24,
    rate: 0.8, auto: false, spread: 0.05, recoil: 1.7, reload: 2.6,
    range: 30, pellets: 8, tracer: '#ffb08a',
  },
};

export const GRENADE = {
  key: 'grenade', name: 'FRAG-7', price: 300,
  damage: 95, radius: 6.5, fuse: 1.6, maxCarry: 2,
};

export const BUY_LIST = ['rifle', 'smg', 'shotgun', 'grenade'];
export const AMMO_PRICE = 200;

// Effective angular spread (radians) for a shot, given the shooter's state.
// Stopping to aim pays: moving multiplies spread, airborne more, crouch helps.
export function spreadFor(weapon, actor) {
  let s = weapon.spread + actor.spreadBloom;
  if (actor.crouch) s *= 0.8;
  else if (actor.moving) s *= 2.1;
  return s;
}

// Damage of one pellet against a body part.
export function pelletDamage(weapon, head) {
  return weapon.damage * (head ? weapon.headMul : 1);
}

// Random cone offset (radians) for one pellet.
export function coneOffset(spread) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  return { yaw: Math.cos(a) * r, pitch: Math.sin(a) * r };
}
