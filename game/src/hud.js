// The DOM HUD: crosshair, hit marker, health, ammo, cash, score, timer, zone bar,
// kill feed, banners, the buy menu and the one overlay panel. It never touches the
// simulation; main.js pushes numbers in and reads the button callbacks out. Every
// setter skips work when the value did not change, so the HUD costs nothing per frame.
import { WEAPONS } from './weapon.js';
import { GRENADE_PRICE, AMMO_PRICE } from './game.js';

const COPY = {
  start: {
    title: 'Furnace Yard',
    copy: 'A tactical round-based shooter: two teams, five rounds, one furnace to hold. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Furnace Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const damageFlash = document.getElementById('damage-flash');
  const healthNum = document.getElementById('health-num');
  const healthFill = document.getElementById('health-fill');
  const ammoEl = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const cashLine = document.getElementById('cash-line');
  const grenadeLine = document.getElementById('grenade-line');
  const scoreAmber = document.getElementById('score-amber');
  const scoreTeal = document.getElementById('score-teal');
  const timerEl = document.getElementById('timer');
  const roundLabel = document.getElementById('round-label');
  const zoneLabel = document.getElementById('zone-label');
  const zoneAmber = document.querySelector('#zone-bar .fill-amber');
  const zoneTeal = document.querySelector('#zone-bar .fill-teal');
  const killfeed = document.getElementById('killfeed');
  const bannerEl = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerCopy = document.getElementById('banner-copy');
  const buyMenu = document.getElementById('buy-menu');
  const buyRound = document.getElementById('buy-round');
  const buyCash = document.getElementById('buy-cash');
  const buyTimer = document.getElementById('buy-timer');
  const weaponCards = document.getElementById('weapon-cards');
  const extraCards = document.getElementById('extra-cards');
  const deploy = document.getElementById('deploy');

  let hitTimer = 0;
  let bannerTimer = 0;
  let flashTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastScore = '';
  let lastTimer = '';
  let lastFeedSig = '';
  let lastZone = '';

  // Build the buy menu once from the weapon table.
  const cardEls = {};
  for (const def of Object.values(WEAPONS)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.buy = `weapon:${def.id}`;
    card.innerHTML = `<h3>${def.name}</h3><div class="stats">DMG ${def.damage} · ${def.auto ? 'AUTO' : 'SEMI'} · ${def.mag} RD<br>RELOAD ${def.reloadTime.toFixed(1)}s</div><div class="price">${def.price === 0 ? 'FREE' : '$' + def.price}</div>`;
    weaponCards.appendChild(card);
    cardEls[def.id] = card;
  }
  const grenadeCard = document.createElement('button');
  grenadeCard.type = 'button';
  grenadeCard.className = 'card';
  grenadeCard.dataset.buy = 'grenade';
  grenadeCard.innerHTML = `<h3>Spark-9 Grenade</h3><div class="stats">THROW WITH G · BURST AFTER 1.6s<br>MAX 1 PER ROUND</div><div class="price">$${GRENADE_PRICE}</div>`;
  extraCards.appendChild(grenadeCard);
  const ammoCard = document.createElement('button');
  ammoCard.type = 'button';
  ammoCard.className = 'card';
  ammoCard.dataset.buy = 'ammo';
  ammoCard.innerHTML = `<h3>Reserve ammo</h3><div class="stats">REFILL THE RESERVE OF<br>YOUR CURRENT WEAPON</div><div class="price">$${AMMO_PRICE}</div>`;
  extraCards.appendChild(ammoCard);

  function refreshBuy(game) {
    buyRound.textContent = `ROUND ${game.round + 1}`;
    buyCash.textContent = `$${game.cash}`;
    buyTimer.textContent = formatTime(game.buyTimeLeft);
    for (const def of Object.values(WEAPONS)) {
      const card = cardEls[def.id];
      const owned = game.ownedWeapon === def.id;
      card.classList.toggle('owned', owned);
      card.disabled = owned || game.cash < def.price;
      const price = card.querySelector('.price');
      if (price) price.textContent = owned ? 'EQUIPPED' : def.price === 0 ? 'FREE' : `$${def.price}`;
    }
    grenadeCard.classList.toggle('owned', game.grenadesOwned >= 1);
    grenadeCard.disabled = game.grenadesOwned >= 1 || game.cash < GRENADE_PRICE;
    ammoCard.disabled = game.cash < AMMO_PRICE;
  }

  return {
    setHealth(hp) {
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthNum.textContent = String(hp);
      healthFill.style.width = `${hp}%`;
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoEl.classList.toggle('empty', mag === 0);
      weaponName.textContent = name;
    },
    setCash(cash) {
      cashLine.textContent = `$${cash}`;
    },
    setGrenades(n) {
      grenadeLine.textContent = `Grenade ×${n}`;
    },
    setScore(amber, teal, round) {
      const sig = `${amber}|${teal}|${round}`;
      if (sig === lastScore) return;
      lastScore = sig;
      scoreAmber.textContent = String(amber);
      scoreTeal.textContent = String(teal);
      roundLabel.textContent = `ROUND ${Math.max(1, round)} · FIRST TO 5`;
    },
    setTimer(seconds) {
      const text = formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('low', seconds <= 10 && seconds > 0);
    },
    setZone(progress, state) {
      const sig = `${progress.toFixed(2)}|${state}`;
      if (sig === lastZone) return;
      lastZone = sig;
      zoneAmber.style.width = `${Math.max(0, progress) * 50}%`;
      zoneTeal.style.width = `${Math.max(0, -progress) * 50}%`;
      zoneLabel.textContent =
        state === 'amber' ? 'FURNACE — AMBER CAPTURING'
        : state === 'teal' ? 'FURNACE — TEAL CAPTURING'
        : state === 'contested' ? 'FURNACE — CONTESTED'
        : 'FURNACE — HOLD THE ZONE';
    },
    setFeed(feed) {
      const sig = JSON.stringify(feed);
      if (sig === lastFeedSig) return;
      lastFeedSig = sig;
      killfeed.innerHTML = feed
        .map((entry) => `<div><span class="${entry.killerTeam}">${entry.killerName}</span> ▸ <span class="${entry.victimTeam}">${entry.victimName}</span></div>`)
        .join('');
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    banner(titleText, copyText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerCopy.textContent = copyText;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), holdMs);
    },
    setCrosshair(spread) {
      crosshair.style.setProperty('--gap', `${Math.round(3 + spread * 900)}px`);
    },
    showBuy(game) {
      refreshBuy(game);
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy,
    setBuyTimer(seconds) {
      buyTimer.textContent = formatTime(seconds);
    },
    showOverlay(mode, data = {}) {
      if (mode === 'roundEnd') {
        const won = data.winner === 'amber';
        title.innerHTML = won ? 'ROUND WON — <span class="amber">AMBER</span>' : 'ROUND LOST — <span class="teal">TEAL</span> TAKES IT';
        const reason =
          data.reason === 'capture' ? 'The Furnace was captured.'
          : data.reason === 'timer' ? 'Time expired — more fighters standing.'
          : 'The enemy team was eliminated.';
        copy.textContent = `${reason} You earned $${data.cash} this round. Score ${data.score.amber} — ${data.score.teal}.`;
        play.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        const won = data.winner === 'amber';
        title.innerHTML = won ? 'MATCH WON — <span class="amber">AMBER</span> TAKES THE YARD' : 'MATCH LOST — <span class="teal">TEAL</span> TAKES THE YARD';
        copy.textContent = `Final score ${data.score.amber} — ${data.score.teal}. You scored ${data.kills} eliminations and fell ${data.deaths} times.`;
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onDeploy(handler) {
      deploy.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const card = event.target.closest('[data-buy]');
        if (!card || card.disabled) return;
        const [kind, id] = card.dataset.buy.split(':');
        handler(kind, id);
      });
    },
  };
}
