// Furnace Yard — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. Rounds, the buy phase, the zone and the economy live in game.js;
// this file wires the player, the bots, the weapon and the HUD together, resolves
// shots, and stages the deterministic frames for screenshots.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createFx } from './fx.js';
import { createBot } from './bot.js';
import { createGrenades } from './grenade.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 18, 46);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const fx = createFx(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const game = createGame();
const grenades = createGrenades(scene, world, fx);
const player = createPlayer(world.colliders, world.spawns.amber[0]);
player.team = 'amber';
player.name = 'You';
const input = createInput(renderer.domElement, onLockChange);

// Bots: two amber teammates (spawns 1 and 2) and three teal opponents.
const bots = [
  createBot(scene, world, 'amber', 1, random),
  createBot(scene, world, 'amber', 2, random),
  createBot(scene, world, 'teal', 0, random),
  createBot(scene, world, 'teal', 1, random),
  createBot(scene, world, 'teal', 2, random),
];
const amberBots = bots.filter((bot) => bot.team === 'amber');
const tealBots = bots.filter((bot) => bot.team === 'teal');

// The player's hitboxes: invisible boxes the bots' raycasts can hit. They move with
// the player every frame and shrink when the player crouches.
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
hitMaterial.colorWrite = false;
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), hitMaterial);
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), hitMaterial);
playerTorso.userData.combatant = player;
playerTorso.userData.part = 'torso';
playerHead.userData.combatant = player;
playerHead.userData.part = 'head';
scene.add(playerTorso, playerHead);
const allHitMeshes = [playerTorso, playerHead].concat(bots.flatMap((bot) => bot.hitMeshes));

const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const shootables = world.shootables.concat(allHitMeshes);
// The player's own shots must not hit the player's own hitboxes: the camera sits
// inside the head hitbox, so a raycast against it would shoot the player in the head.
const playerShootables = world.shootables.concat(bots.flatMap((bot) => bot.hitMeshes));
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const wish = new THREE.Vector3();
const shotPos = new THREE.Vector3();

let time = 0;
let playerLastShot = -100;
let prevFiring = false;
let prevKeys = new Set();
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
const markerHoldMs = shot ? 4000 : 90;

const botCtx = {
  player,
  bots,
  allHitMeshes,
  fx,
  random,
  get playerLastShot() {
    return playerLastShot;
  },
  get zoneProgress() {
    return game.state.zoneProgress;
  },
  damageCombatant,
  onShot(bot, muzzlePos, shotTime) {
    notifyShot(muzzlePos, bot.team, shotTime);
  },
};

function syncPlayerHitboxes() {
  const body = player.body.state;
  playerTorso.position.set(body.position.x, body.position.y + body.eye - 0.55, body.position.z);
  playerHead.position.set(body.position.x, body.position.y + body.eye + 0.02, body.position.z);
}

function notifyShot(pos, team, shotTime) {
  for (const bot of bots) {
    if (!bot.alive || bot.team === team) continue;
    const dx = bot.body.state.position.x - pos.x;
    const dz = bot.body.state.position.z - pos.z;
    if (dx * dx + dz * dz < 25 * 25) bot.hear(pos, shotTime);
  }
}

function damageCombatant(victim, amount, part, attacker, shotTime) {
  if (!victim.alive) return false;
  let died;
  if (victim === player) {
    died = player.damage(amount);
    hud.damageFlash();
  } else {
    died = victim.damage(amount, shotTime);
  }
  if (died) {
    const killerName = attacker ? attacker.name : 'Blast';
    const killerTeam = attacker ? attacker.team : victim.team === 'teal' ? 'amber' : 'teal';
    game.addKill(killerName, killerTeam, victim.name, victim.team, attacker === player);
  }
  checkRoundEnd();
  return died;
}

function aliveCount(team) {
  if (team === 'amber') return (player.alive ? 1 : 0) + amberBots.filter((bot) => bot.alive).length;
  return tealBots.filter((bot) => bot.alive).length;
}

function totalHealth(team) {
  if (team === 'amber') return (player.alive ? player.health : 0) + amberBots.reduce((sum, bot) => sum + (bot.alive ? bot.health : 0), 0);
  return tealBots.reduce((sum, bot) => sum + (bot.alive ? bot.health : 0), 0);
}

function checkRoundEnd() {
  if (game.state.phase !== 'round') return;
  const amberAlive = aliveCount('amber');
  const tealAlive = aliveCount('teal');
  if (amberAlive === 0) doEndRound('teal', 'elimination');
  else if (tealAlive === 0) doEndRound('amber', 'elimination');
}

function doEndRound(winner, reason) {
  if (game.state.phase !== 'round') return;
  const cashBefore = game.state.cash;
  game.endRound(winner, reason);
  const earned = game.state.cash - cashBefore;
  hud.hideBuy();
  hud.showOverlay('roundEnd', { winner, reason, cash: earned, score: game.state.score });
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetPositions() {
  player.reset(world.spawns.amber[0]);
  amberBots.forEach((bot, i) => bot.reset(world.spawns.amber[i + 1]));
  tealBots.forEach((bot, i) => bot.reset(world.spawns.teal[i]));
  grenades.reset();
  syncPlayerHitboxes();
  for (const bot of bots) bot.step(0, time, botCtx);
}

function deploy() {
  if (game.state.phase !== 'buy') return;
  hud.hideBuy();
  game.startRound();
  resetPositions();
  weapon.topUp();
  grenades.give(game.state.grenadesOwned);
  hud.banner(`ROUND ${game.state.round} — CAPTURE THE FURNACE`, 'Hold the zone or eliminate the enemy team.');
  input.requestLock();
}

function advance() {
  game.nextRound();
  hud.hideOverlay();
  if (game.state.phase === 'matchEnd') {
    hud.showOverlay('matchEnd', { winner: game.state.matchWinner, score: game.state.score, kills: game.state.kills, deaths: game.state.deaths });
  } else {
    hud.showBuy(game.state);
  }
}

function startMatch() {
  game.startMatch();
  weapon.switchTo('pistol');
  hud.hideOverlay();
  hud.showBuy(game.state);
}

hud.onPlay(() => {
  if (shot) return;
  const phase = game.state.phase;
  if (phase === 'menu' || phase === 'matchEnd') startMatch();
  else if (phase === 'paused' || phase === 'round') input.requestLock();
  else if (phase === 'roundEnd') advance();
});

hud.onDeploy(() => {
  if (shot) return;
  deploy();
});

hud.onBuy((kind, id) => {
  if (shot || game.state.phase !== 'buy') return;
  if (kind === 'weapon') {
    const result = game.buyWeapon(id);
    if (result === 'ok') weapon.switchTo(id);
  } else if (kind === 'grenade') {
    if (game.buyGrenade() === 'ok') grenades.give(1);
  } else if (kind === 'ammo') {
    if (game.buyAmmo() === 'ok') weapon.refillReserve();
  }
  hud.refreshBuy(game.state);
  hud.setCash(game.state.cash);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setGrenades(grenades.carried);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    if (game.state.phase === 'round') hud.hideOverlay();
  } else if (game.state.phase === 'round') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.body.state;
  const eye = player.alive ? body.eye : 0.5;
  camera.position.set(body.position.x, body.position.y + eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.body.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(playerShootables, false)[0];
  const end = hit ? hit.point : camera.position.clone().add(direction.clone().multiplyScalar(60));
  fx.tracer(muzzle, end, PALETTE.accent);
  if (hit) {
    if (hit.object.userData.combatant) {
      const victim = hit.object.userData.combatant;
      const part = hit.object.userData.part;
      const mult = part === 'head' ? weapon.def.headMult : part === 'legs' ? 0.7 : 1;
      const died = damageCombatant(victim, weapon.def.damage * mult, part, player, time);
      hud.setScore(game.state.score.amber, game.state.score.teal, game.state.phase === 'buy' ? game.state.round + 1 : game.state.round);
      hud.hitMarker(died, markerHoldMs);
    } else {
      fx.spark(hit.point, PALETTE.accent);
    }
  }
  weapon.pullTrigger();
  player.body.recoil(weapon.def.recoil + random() * 0.003, (random() * 2 - 1) * 0.003);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  playerLastShot = time;
  shotPos.copy(player.body.state.position);
  notifyShot(shotPos, 'amber', time);
  return true;
}

function inZone(pos) {
  return Math.abs(pos.x - world.zone.x) <= world.zone.half && Math.abs(pos.z - world.zone.z) <= world.zone.half;
}

function pressed(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function step(dt) {
  time += dt;
  game.step(dt);
  const phase = game.state.phase;

  if (phase === 'buy' && game.state.buyTimeLeft <= 0) deploy();

  if (phase === 'round') {
    // Zone presence and capture.
    const amberPresent = (player.alive && inZone(player.body.state.position)) || amberBots.some((bot) => bot.alive && inZone(bot.body.state.position));
    const tealPresent = tealBots.some((bot) => bot.alive && inZone(bot.body.state.position));
    const captured = game.updateZone(dt, amberPresent, tealPresent);
    if (captured) {
      doEndRound(captured, 'capture');
      return;
    }
    if (game.state.roundTimeLeft <= 0) {
      const amberAlive = aliveCount('amber');
      const tealAlive = aliveCount('teal');
      let winner = 'amber';
      if (tealAlive > amberAlive) winner = 'teal';
      else if (amberAlive === tealAlive) {
        if (game.state.zoneProgress < 0) winner = 'teal';
        else if (game.state.zoneProgress === 0 && totalHealth('teal') > totalHealth('amber')) winner = 'teal';
      }
      doEndRound(winner, 'timer');
      return;
    }
  }

  if (phase === 'roundEnd' && game.state.roundEndLeft <= 0) advance();

  // Player movement and actions, only while alive and the round is live.
  if (phase === 'round' && player.alive) {
    const keys = input.state.keys;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.body.state.yaw);
      const cos = Math.cos(player.body.state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    player.body.step(dt, wish, {
      crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
      jump: keys.has('Space'),
    });
    if (pressed('KeyG') && grenades.carried > 0) {
      camera.getWorldDirection(direction);
      muzzle.copy(camera.position).addScaledVector(direction, 0.7);
      grenades.throw(muzzle, direction, time, player);
      hud.setGrenades(grenades.carried);
    }
    if (keys.has('KeyR')) weapon.reload();
  }
  weapon.step(dt);
  grenades.step(dt, time, { player, bots, damageCombatant });
  if (phase === 'round') {
    for (const bot of bots) bot.step(dt, time, botCtx);
  }
  fx.step(dt);
  world.step(time, game.state.zoneProgress > 0.05 ? 'amber' : game.state.zoneProgress < -0.05 ? 'teal' : 'none');
  syncPlayerHitboxes();
}

function syncHud() {
  hud.setHealth(player.health);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setCash(game.state.cash);
  hud.setGrenades(grenades.carried);
  hud.setScore(game.state.score.amber, game.state.score.teal, game.state.phase === 'buy' ? game.state.round + 1 : game.state.round);
  hud.setTimer(game.state.phase === 'round' ? game.state.roundTimeLeft : game.state.phase === 'buy' ? game.state.buyTimeLeft : 0);
  const amberPresent = (player.alive && inZone(player.body.state.position)) || amberBots.some((bot) => bot.alive && inZone(bot.body.state.position));
  const tealPresent = tealBots.some((bot) => bot.alive && inZone(bot.body.state.position));
  hud.setZone(game.state.zoneProgress, amberPresent && tealPresent ? 'contested' : amberPresent ? 'amber' : tealPresent ? 'teal' : 'idle');
  hud.setFeed(game.state.feed);
  hud.setCrosshair(weapon.spread(player.body.groundSpeed()));
  if (game.state.phase === 'buy') hud.setBuyTimer(game.state.buyTimeLeft);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive) player.body.look(look.x, look.y);
    const wantFire = input.state.firing && (weapon.def.auto || !prevFiring);
    if (game.state.phase === 'round' && player.alive && wantFire && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.body.groundSpeed()));
    prevFiring = input.state.firing;
    if (pressed('Enter') && game.state.phase === 'buy') deploy();
    if (game.state.phase === 'buy') {
      if (pressed('Digit1')) document.querySelector('[data-buy="weapon:pistol"]')?.click();
      if (pressed('Digit2')) document.querySelector('[data-buy="weapon:rifle"]')?.click();
      if (pressed('Digit3')) document.querySelector('[data-buy="weapon:dmr"]')?.click();
      if (pressed('Digit4')) document.querySelector('[data-buy="grenade"]')?.click();
      if (pressed('Digit5')) document.querySelector('[data-buy="ammo"]')?.click();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    prevKeys = new Set(input.state.keys);
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  const g = game.state;
  if (name === 'start') {
    player.reset(world.spawns.amber[0]);
    player.body.state.position.set(0, 0, 11);
    player.body.state.yaw = 0;
    player.body.state.pitch = -0.02;
    tealBots[0].reset(world.spawns.teal[0]);
    tealBots[0].body.state.position.set(-3, 0, -8);
    tealBots[1].reset(world.spawns.teal[1]);
    tealBots[1].body.state.position.set(4, 0, -9);
    amberBots[0].reset(world.spawns.amber[1]);
    amberBots[0].body.state.position.set(-4, 0, 8);
    for (const bot of bots) bot.step(0, time, botCtx);
    settle(10);
    hud.showOverlay('start');
  } else if (name === 'play') {
    g.phase = 'round';
    g.round = 3;
    g.score.amber = 2;
    g.score.teal = 1;
    g.cash = 1150;
    g.roundTimeLeft = 72;
    g.zoneProgress = 0.45;
    weapon.switchTo('rifle');
    weapon.state.mag = 24;
    weapon.state.reserve = 60;
    player.reset(world.spawns.amber[0]);
    player.body.state.position.set(0, 0, 6);
    player.damage(13);
    tealBots[0].reset(world.spawns.teal[0]);
    tealBots[0].body.state.position.set(2, 0, -2);
    tealBots[1].reset(world.spawns.teal[1]);
    tealBots[1].body.state.position.set(-4, 0, -6);
    amberBots[0].reset(world.spawns.amber[1]);
    amberBots[0].body.state.position.set(-3, 0, 4);
    for (const bot of bots) bot.step(0, time, botCtx);
    settle(12);
    const target = tealBots[0].body.state.position;
    aimAt(new THREE.Vector3(target.x, target.y + 1.35, target.z));
    shoot(0);
    settle(1);
    hud.banner('ROUND 3 — CAPTURE THE FURNACE', 'Hold the zone or eliminate the enemy team.');
  } else if (name === 'buy') {
    g.phase = 'buy';
    g.round = 2;
    g.cash = 1150;
    g.buyTimeLeft = 14;
    g.ownedWeapon = 'rifle';
    weapon.switchTo('rifle');
    player.reset(world.spawns.amber[0]);
    player.body.state.position.set(0, 0, 11);
    player.body.state.yaw = 0;
    for (const bot of bots) bot.step(0, time, botCtx);
    settle(10);
    hud.showBuy(g);
  } else {
    g.phase = 'matchEnd';
    g.round = 5;
    g.score.amber = 5;
    g.score.teal = 3;
    g.kills = 14;
    g.deaths = 6;
    g.matchWinner = 'amber';
    player.reset(world.spawns.amber[0]);
    player.body.state.position.set(0, 0, 8);
    player.body.state.yaw = 0;
    for (const bot of bots) bot.step(0, time, botCtx);
    settle(10);
    hud.showOverlay('matchEnd', { winner: 'amber', score: g.score, kills: 14, deaths: 6 });
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('click', () => {
  if (!shot && game.state.phase === 'round' && !input.state.locked && player.alive) input.requestLock();
});

weapon.switchTo('pistol');
syncCamera();
syncHud();
// Debug handle for automated smoke tests (live round flow, bot movement, shooting).
window.__furnace = { game, player, bots, weapon, grenades, world };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
