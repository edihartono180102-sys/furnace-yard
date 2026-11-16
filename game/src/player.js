// The player: one physical body (see mover.js) plus health. The camera, the weapon and
// the HUD all read this one state; nothing else keeps a copy of where the player is.
import { createBody } from './mover.js';

export function createPlayer(colliders, spawn) {
  const body = createBody(colliders, { spawn: [spawn.x, 0, spawn.z], yaw: spawn.yaw });
  let health = 100;

  return {
    body,
    get health() {
      return health;
    },
    get alive() {
      return health > 0;
    },
    damage(amount) {
      if (health <= 0) return false;
      health = Math.max(0, health - amount);
      return health <= 0;
    },
    reset(spawnPoint) {
      const s = body.state;
      s.position.set(spawnPoint.x, 0, spawnPoint.z);
      s.velocity.set(0, 0, 0);
      s.yaw = spawnPoint.yaw;
      s.pitch = 0;
      s.eye = 1.6;
      s.crouching = false;
      s.height = 1.72;
      s.onGround = true;
      health = 100;
    },
  };
}
