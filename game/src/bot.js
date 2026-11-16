// Bots: a tiny state machine (advance, hold, engage, investigate) on the world's
// waypoint graph. A bot sees through a raycast (no shooting through cover), hears
// enemy shots and investigates them, reacts after a delay, and fires in bursts with
// aim error that grows with range and target speed. Two amber bots back the player;
// three teal bots oppose them. One teal bot carries the precision rifle.
// All times are game seconds, passed in by the caller; nothing here reads the clock.
import * as THREE from 'three';
import { createBody } from './mover.js';
import { TEAM, PALETTE } from './palette.js';
import { WEAPONS } from './weapon.js';

const BOT_SPEED = 4.2;
const EYE_HEIGHT = 1.55;
const VIEW_RANGE = 20;
const VIEW_HALF_ANGLE = 1.05;
const HEAR_RANGE = 25;

function makeNameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.15, 0.29, 1);
  return sprite;
}

function nearestWaypoint(waypoints, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const node of Object.values(waypoints)) {
    const d = (node.x - x) * (node.x - x) + (node.z - z) * (node.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function findPath(waypoints, fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of waypoints[current].links) {
      if (prev[next] !== undefined) continue;
      prev[next] = current;
      if (next === toId) {
        const path = [toId];
        let node = current;
        while (node !== null) {
          path.unshift(node);
          node = prev[node];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toId];
}

export function createBot(scene, world, team, index, random) {
  const names = team === 'amber' ? ['Vex', 'Juno'] : ['Rook', 'Mira', 'Ash'];
  const name = names[index % names.length];
  const teamColor = team === 'amber' ? TEAM.amber.color : TEAM.teal.color;
  const weaponId = team === 'teal' && index === 1 ? 'dmr' : 'rifle';
  const def = WEAPONS[weaponId];
  const spawn = world.spawns[team][index % world.spawns[team].length];
  const body = createBody(world.colliders, { spawn: [spawn.x, 0, spawn.z], yaw: spawn.yaw, walkSpeed: BOT_SPEED });

  const group = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05, emissive: new THREE.Color(teamColor), emissiveIntensity: 0.18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.55, metalness: 0.05 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.3), darkMat);
  legs.position.y = 0.375;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.7, 0.32), teamMat);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skinMat);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), teamMat);
  visor.position.set(0, 1.64, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.2, 1.25, -0.3);
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor), transparent: true, opacity: 0.4, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const tag = makeNameSprite(name, teamColor);
  tag.position.y = 2.05;
  group.add(legs, torso, head, visor, gun, ring, tag);
  group.traverse((mesh) => {
    if (mesh.isMesh) mesh.castShadow = true;
  });
  scene.add(group);

  legs.userData.part = 'legs';
  torso.userData.part = 'torso';
  head.userData.part = 'head';

  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const facing = new THREE.Vector3();

  const bot = {
    body,
    team,
    name,
    weaponId,
    group,
    hitMeshes: [legs, torso, head],
    health: 100,
    alive: true,
    state: 'advance',
    lastShotAt: -100,
  };
  legs.userData.combatant = bot;
  torso.userData.combatant = bot;
  head.userData.combatant = bot;

  let path = [];
  let pathIndex = 0;
  let target = null;
  let reactionAt = 0;
  let burstLeft = 0;
  let burstAt = 0;
  let decideAt = 0;
  let scanUntil = 0;
  let scanBase = 0;
  let heardAt = -100;
  const heardPos = new THREE.Vector3();
  let flashUntil = 0;
  let fall = 0;

  function eye() {
    eyePos.set(body.state.position.x, body.state.position.y + EYE_HEIGHT, body.state.position.z);
    return eyePos;
  }

  function hasLineOfSight(to, maxDist) {
    aimDir.copy(to).sub(eye()).normalize();
    raycaster.set(eye(), aimDir);
    raycaster.far = maxDist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > maxDist - 0.05;
  }

  function visibleEnemy(time, ctx) {
    let best = null;
    let bestScore = Infinity;
    const candidates = [];
    if (ctx.player.alive) {
      candidates.push({ kind: 'player', combatant: ctx.player, pos: ctx.player.body.state.position, eye: ctx.player.body.state.eye, speed: ctx.player.body.groundSpeed(), lastShot: ctx.playerLastShot });
    }
    for (const other of ctx.bots) {
      if (other === bot || other.team === team || !other.alive) continue;
      candidates.push({ kind: 'bot', combatant: other, pos: other.body.state.position, eye: EYE_HEIGHT, speed: other.body.groundSpeed(), lastShot: other.lastShotAt });
    }
    for (const cand of candidates) {
      toTarget.set(cand.pos.x - body.state.position.x, 0, cand.pos.z - body.state.position.z);
      const dist = toTarget.length();
      if (dist > VIEW_RANGE) continue;
      facing.set(-Math.sin(body.state.yaw), 0, -Math.cos(body.state.yaw));
      const angle = facing.angleTo(toTarget.normalize());
      const heardRecently = time - cand.lastShot < 1.5 && dist < HEAR_RANGE;
      if (angle > VIEW_HALF_ANGLE && !heardRecently) continue;
      targetPos.set(cand.pos.x, cand.pos.y + cand.eye - 0.25, cand.pos.z);
      if (!hasLineOfSight(targetPos, dist)) continue;
      const score = dist + (cand.kind === 'player' ? 0 : 2);
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    return best;
  }

  function goTo(nodeId) {
    const from = nearestWaypoint(world.waypoints, body.state.position.x, body.state.position.z);
    path = findPath(world.waypoints, from.id, nodeId);
    pathIndex = 0;
  }

  function fireBurst(time, ctx) {
    if (burstLeft <= 0 || time < burstAt) return;
    burstAt = time + def.interval;
    burstLeft -= 1;
    if (burstLeft === 0) burstAt = time + (weaponId === 'dmr' ? 1.5 + random() * 0.6 : 1.2 + random() * 0.6);
    bot.lastShotAt = time;
    if (!target) return;
    // target is a combatant (the player object or a bot), not a sight candidate:
    // read its position and eye height from its body.
    const cand = target;
    const tp = cand.body.state.position;
    const eyeH = cand.body.state.eye || EYE_HEIGHT;
    const muzzle = eye();
    muzzle.y -= 0.12;
    targetPos.set(tp.x, tp.y + eyeH - 0.25, tp.z);
    const dist = muzzle.distanceTo(targetPos);
    const speed = cand.body.groundSpeed();
    // Bots are deliberately less accurate than the player and deal reduced damage:
    // three bots focusing the player must not melt them in a second of exposure.
    const error = (weaponId === 'dmr' ? 0.022 : 0.035) + dist * 0.001 + speed * 0.003;
    aimDir.copy(targetPos).sub(muzzle).normalize();
    aimDir.x += (random() * 2 - 1) * error;
    aimDir.y += (random() * 2 - 1) * error;
    aimDir.z += (random() * 2 - 1) * error;
    aimDir.normalize();
    raycaster.set(muzzle, aimDir);
    raycaster.far = 80;
    const meshes = world.shootables.concat(ctx.allHitMeshes);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const end = hit ? hit.point : muzzle.clone().add(aimDir.clone().multiplyScalar(60));
    ctx.fx.tracer(muzzle, end, teamColor);
    if (ctx.onShot) ctx.onShot(bot, muzzle, time);
    if (!hit) return;
    if (hit.object.userData.combatant) {
      const victim = hit.object.userData.combatant;
      const part = hit.object.userData.part;
      const mult = part === 'head' ? def.headMult : part === 'legs' ? 0.7 : 1;
      ctx.damageCombatant(victim, def.damage * mult * 0.65, part, bot, time);
    } else {
      ctx.fx.spark(hit.point, PALETTE.accent);
    }
  }

  bot.step = function step(dt, time, ctx) {
    if (!bot.alive) {
      if (fall < 1) {
        fall = Math.min(1, fall + dt / 0.35);
        group.rotation.x = -fall * 1.45;
        group.position.y = -fall * 0.08;
      }
      return;
    }
    if (time >= flashUntil) {
      teamMat.emissive.set(teamColor);
      teamMat.emissiveIntensity = 0.18;
    }

    if (time >= decideAt) {
      decideAt = time + 0.4;
      const seen = visibleEnemy(time, ctx);
      if (seen) {
        if (target !== seen.combatant) {
          target = seen.combatant;
          reactionAt = time + 0.5 + random() * 0.4;
          burstLeft = 0;
        }
        bot.state = 'engage';
      } else {
        target = null;
        if (time - heardAt < 4 && bot.state !== 'investigate') {
          bot.state = 'investigate';
          goTo(nearestWaypoint(world.waypoints, heardPos.x, heardPos.z).id);
        } else if (bot.state === 'investigate') {
          const dx = body.state.position.x - heardPos.x;
          const dz = body.state.position.z - heardPos.z;
          if (dx * dx + dz * dz < 1.5) {
            bot.state = 'hold';
            scanUntil = time + 3;
            scanBase = body.state.yaw;
          }
        } else if (bot.state !== 'hold' || time >= scanUntil) {
          const zoneDx = body.state.position.x - world.zone.x;
          const zoneDz = body.state.position.z - world.zone.z;
          const zoneDist = Math.hypot(zoneDx, zoneDz);
          const enemyCapturing = (team === 'amber' && ctx.zoneProgress < -0.05) || (team === 'teal' && ctx.zoneProgress > 0.05);
          if (zoneDist > 7 || enemyCapturing) {
            bot.state = 'advance';
            goTo('M2');
          } else {
            bot.state = 'hold';
            const holdId = team === 'amber' ? (body.state.position.x < 0 ? 'H1' : 'H2') : (body.state.position.x < 0 ? 'H3' : 'H4');
            if (!path.length || path[path.length - 1] !== holdId) goTo(holdId);
            scanUntil = time + 4;
            scanBase = body.state.yaw;
          }
        }
      }
    }

    wish.set(0, 0, 0);
    if (bot.state === 'engage' && target) {
      const tp = target.body.state.position;
      const ty = tp.y + (target.body.state.eye || EYE_HEIGHT) - 0.25;
      toTarget.set(tp.x - body.state.position.x, 0, tp.z - body.state.position.z);
      const targetYaw = Math.atan2(-toTarget.x, -toTarget.z);
      let dyaw = targetYaw - body.state.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      body.state.yaw += dyaw * Math.min(1, dt * 10);
      body.state.pitch += ((ty - (body.state.position.y + EYE_HEIGHT)) / Math.max(1, toTarget.length()) - body.state.pitch) * Math.min(1, dt * 8);
      if (time >= reactionAt) {
        if (burstLeft <= 0 && time >= burstAt) burstLeft = weaponId === 'dmr' ? 1 : 3 + Math.floor(random() * 3);
        fireBurst(time, ctx);
      }
    } else if (bot.state === 'hold') {
      body.state.yaw = scanBase + Math.sin(time * 0.7) * 0.9;
    } else if (path.length && pathIndex < path.length) {
      const node = world.waypoints[path[pathIndex]];
      const dx = node.x - body.state.position.x;
      const dz = node.z - body.state.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        pathIndex += 1;
      } else {
        wish.set(dx / dist, 0, dz / dist);
        const moveYaw = Math.atan2(-dx, -dz);
        let dyaw = moveYaw - body.state.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        body.state.yaw += dyaw * Math.min(1, dt * 8);
      }
    }
    body.step(dt, wish, {});
    group.position.copy(body.state.position);
    group.rotation.y = body.state.yaw;
  };

  bot.damage = function damage(amount, time) {
    if (!bot.alive) return false;
    bot.health = Math.max(0, bot.health - amount);
    flashUntil = time + 0.12;
    teamMat.emissive.set(PALETTE.danger);
    teamMat.emissiveIntensity = 1;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.state = 'dead';
      return true;
    }
    return false;
  };

  bot.hear = function hear(pos, time) {
    heardAt = time;
    heardPos.copy(pos);
  };

  bot.reset = function reset(spawnPoint) {
    const s = body.state;
    s.position.set(spawnPoint.x, 0, spawnPoint.z);
    s.velocity.set(0, 0, 0);
    s.yaw = spawnPoint.yaw;
    s.pitch = 0;
    s.eye = EYE_HEIGHT;
    s.crouching = false;
    s.height = 1.72;
    s.onGround = true;
    bot.health = 100;
    bot.alive = true;
    bot.state = 'advance';
    bot.lastShotAt = -100;
    target = null;
    path = [];
    pathIndex = 0;
    fall = 0;
    group.rotation.set(0, s.yaw, 0);
    group.position.copy(s.position);
    teamMat.emissive.set(teamColor);
    teamMat.emissiveIntensity = 0.18;
  };

  return bot;
}
