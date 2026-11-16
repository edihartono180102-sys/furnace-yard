// The match: one state machine for the whole game. Menu, then a buy phase, then a
// round, then the next buy phase, until one team takes five rounds. Rounds end on
// elimination, on a completed capture of the Furnace, or on the timer. Money earned
// in a round buys weapons, a grenade and ammo in the next buy phase, and carries
// between rounds. All of the match's numbers live here and nowhere else.
import { WEAPONS } from './weapon.js';

export const ROUND_TIME = 90;
export const BUY_TIME = 20;
export const WIN_ROUNDS = 5;
export const CAPTURE_TIME = 8;
export const GRENADE_PRICE = 150;
export const AMMO_PRICE = 100;
export const KILL_REWARD = 300;
export const WIN_REWARD = 600;
export const LOSS_REWARD = 300;
export const CAPTURE_BONUS = 200;

export function createGame() {
  const state = {
    phase: 'menu',
    round: 0,
    score: { amber: 0, teal: 0 },
    cash: 800,
    ownedWeapon: 'pistol',
    grenadesOwned: 0,
    zoneProgress: 0,
    roundTimeLeft: ROUND_TIME,
    buyTimeLeft: BUY_TIME,
    roundEndLeft: 0,
    roundResult: null,
    matchWinner: null,
    kills: 0,
    deaths: 0,
    feed: [],
  };

  function feed(killerName, killerTeam, victimName, victimTeam) {
    state.feed.push({ killerName, killerTeam, victimName, victimTeam, at: state.roundTimeLeft });
    if (state.feed.length > 4) state.feed.shift();
  }

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 0;
      state.score.amber = 0;
      state.score.teal = 0;
      state.cash = 800;
      state.ownedWeapon = 'pistol';
      state.grenadesOwned = 0;
      state.zoneProgress = 0;
      state.kills = 0;
      state.deaths = 0;
      state.feed = [];
      state.matchWinner = null;
      state.roundResult = null;
      state.buyTimeLeft = BUY_TIME;
    },
    startRound() {
      state.round += 1;
      state.phase = 'round';
      state.zoneProgress = 0;
      state.roundTimeLeft = ROUND_TIME;
      state.roundResult = null;
    },
    // Returns 'amber' | 'teal' when a capture completes, else null.
    updateZone(dt, amberPresent, tealPresent) {
      if (amberPresent && !tealPresent) state.zoneProgress += dt / CAPTURE_TIME;
      else if (tealPresent && !amberPresent) state.zoneProgress -= dt / CAPTURE_TIME;
      else if (!amberPresent && !tealPresent) {
        state.zoneProgress += (0 - state.zoneProgress) * Math.min(1, dt * 0.1);
      }
      if (state.zoneProgress >= 1) {
        state.zoneProgress = 1;
        return 'amber';
      }
      if (state.zoneProgress <= -1) {
        state.zoneProgress = -1;
        return 'teal';
      }
      return null;
    },
    endRound(winner, reason) {
      if (state.phase !== 'round') return;
      state.score[winner] += 1;
      const playerWon = winner === 'amber';
      state.cash += playerWon ? WIN_REWARD : LOSS_REWARD;
      if (reason === 'capture' && playerWon) state.cash += CAPTURE_BONUS;
      state.phase = 'roundEnd';
      state.roundEndLeft = 4;
      state.roundResult = { winner, reason };
    },
    nextRound() {
      if (state.score.amber >= WIN_ROUNDS || state.score.teal >= WIN_ROUNDS) {
        state.phase = 'matchEnd';
        state.matchWinner = state.score.amber >= WIN_ROUNDS ? 'amber' : 'teal';
      } else {
        state.phase = 'buy';
        state.buyTimeLeft = BUY_TIME;
      }
    },
    addKill(killerName, killerTeam, victimName, victimTeam, byPlayer) {
      feed(killerName, killerTeam, victimName, victimTeam);
      if (byPlayer) {
        state.kills += 1;
        state.cash += KILL_REWARD;
      }
      if (victimTeam === 'amber' && victimName === 'You') state.deaths += 1;
    },
    buyWeapon(id) {
      if (id === state.ownedWeapon) return 'owned';
      const price = WEAPONS[id].price;
      if (state.cash < price) return 'poor';
      state.cash -= price;
      state.ownedWeapon = id;
      return 'ok';
    },
    buyGrenade() {
      if (state.grenadesOwned >= 1) return 'owned';
      if (state.cash < GRENADE_PRICE) return 'poor';
      state.cash -= GRENADE_PRICE;
      state.grenadesOwned = 1;
      return 'ok';
    },
    buyAmmo() {
      if (state.cash < AMMO_PRICE) return 'poor';
      state.cash -= AMMO_PRICE;
      return 'ok';
    },
    step(dt) {
      if (state.phase === 'buy') {
        state.buyTimeLeft = Math.max(0, state.buyTimeLeft - dt);
      } else if (state.phase === 'round') {
        state.roundTimeLeft = Math.max(0, state.roundTimeLeft - dt);
      } else if (state.phase === 'roundEnd') {
        state.roundEndLeft = Math.max(0, state.roundEndLeft - dt);
      }
    },
  };
}
