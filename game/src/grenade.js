// One grenade a round, bought in the buy menu: an arcing throw that bounces once or
// twice, then bursts after a short fuse. Damage falls off with distance and is blocked
// by cover, so a grenade flushes a lane without ever killing through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 1.6;
const RADIUS = 4.5;
const MAX_DAMAGE = 90;
const MIN_DAMAGE = 15;
const THROW_SPEED = 14;
const UP_SPEED = 4.5;
const GRAVITY = 12;
const POOL = 2;

export function createGrenades(scene, world, fx) {
  const raycaster = new THREE.Raycaster();
  const chest = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const next = new THREE.Vector3();
  const point = new THREE.Vector3();
  const active = [];
  let carried = 0;

  const pool = [];
  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6, roughness: 0.5 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, velocity: new THREE.Vector3(), fuse: 0, live: false });
  }

  function pointInsideAny(p) {
    for (const box of world.colliders) {
      if (p.x > box.min.x - 0.08 && p.x < box.max.x + 0.08 && p.y > box.min.y - 0.08 && p.y < box.max.y + 0.08 && p.z > box.min.z - 0.08 && p.z < box.max.z + 0.08) return true;
    }
    return false;
  }

  function explode(slot, time, ctx) {
    const at = slot.mesh.position.clone();
    fx.explosion(at);
    const victims = [];
    if (ctx.player.alive) victims.push({ combatant: ctx.player, pos: ctx.player.body.state.position, eye: ctx.player.body.state.eye });
    for (const bot of ctx.bots) {
      if (bot.alive) victims.push({ combatant: bot, pos: bot.body.state.position, eye: 1.55 });
    }
    for (const victim of victims) {
      chest.set(victim.pos.x, victim.pos.y + victim.eye - 0.25, victim.pos.z);
      const dist = at.distanceTo(chest);
      if (dist > RADIUS) continue;
      dir.copy(chest).sub(at).normalize();
      raycaster.set(at, dir);
      raycaster.far = dist;
      if (raycaster.intersectObjects(world.shootables, false)[0]) continue;
      const amount = Math.max(MIN_DAMAGE, MAX_DAMAGE * (1 - dist / RADIUS));
      ctx.damageCombatant(victim.combatant, amount, 'blast', slot.thrower, time);
    }
    slot.live = false;
    slot.mesh.visible = false;
    const index = active.indexOf(slot);
    if (index !== -1) active.splice(index, 1);
  }

  return {
    get carried() {
      return carried;
    },
    give(count) {
      carried = count;
    },
    throw(from, forward, time, thrower) {
      if (carried <= 0) return false;
      const slot = pool.find((s) => !s.live);
      if (!slot) return false;
      carried -= 1;
      slot.live = true;
      slot.fuse = FUSE;
      slot.thrower = thrower || null;
      slot.mesh.visible = true;
      slot.mesh.position.copy(from);
      slot.velocity.copy(forward).multiplyScalar(THROW_SPEED);
      slot.velocity.y += UP_SPEED;
      active.push(slot);
      return true;
    },
    step(dt, time, ctx) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const slot = active[i];
        slot.fuse -= dt;
        slot.velocity.y -= GRAVITY * dt;
        const p = slot.mesh.position;
        // Move one axis at a time; a blocked axis bounces and loses speed.
        next.copy(p).addScaledVector(slot.velocity, dt);
        point.set(next.x, p.y, p.z);
        if (!pointInsideAny(point)) p.x = next.x;
        else slot.velocity.x *= -0.4;
        point.set(p.x, next.y, p.z);
        if (!pointInsideAny(point)) p.y = next.y;
        else slot.velocity.y *= -0.4;
        point.set(p.x, p.y, next.z);
        if (!pointInsideAny(point)) p.z = next.z;
        else slot.velocity.z *= -0.4;
        if (p.y < 0.09) {
          p.y = 0.09;
          slot.velocity.y = Math.abs(slot.velocity.y) * 0.4;
          slot.velocity.x *= 0.7;
          slot.velocity.z *= 0.7;
        }
        // A direct touch bursts it at once.
        let touched = false;
        if (ctx.player.alive && p.distanceTo(ctx.player.body.state.position) < 0.9) touched = true;
        for (const bot of ctx.bots) {
          if (bot.alive && p.distanceTo(bot.body.state.position) < 0.9) touched = true;
        }
        if (slot.fuse <= 0 || touched) explode(slot, time, ctx);
      }
    },
    reset() {
      for (const slot of pool) {
        slot.live = false;
        slot.mesh.visible = false;
      }
      active.length = 0;
    },
  };
}
