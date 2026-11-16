// One physical body in the world: acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders one axis at a time, so a wall never
// swallows the body. The player and every bot share this code; the caller only supplies
// a world-space wish direction each step, so movement, collision and facing stay in one
// place and cannot drift apart between the two.
import * as THREE from 'three';

const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createBody(colliders, options = {}) {
  const radius = options.radius ?? 0.34;
  const standHeight = options.standHeight ?? 1.72;
  const crouchHeight = options.crouchHeight ?? 1.12;
  const standEye = options.standEye ?? 1.6;
  const crouchEye = options.crouchEye ?? 1.02;
  const walkSpeed = options.walkSpeed ?? 5.2;
  const crouchSpeed = options.crouchSpeed ?? 2.4;
  const body = {
    position: new THREE.Vector3(...(options.spawn ?? [0, 0, 0])),
    velocity: new THREE.Vector3(),
    yaw: options.yaw ?? 0,
    pitch: 0,
    eye: standEye,
    onGround: true,
    crouching: false,
    height: standHeight,
  };
  const probe = new THREE.Box3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // wish is a world-space direction on the ground plane (already normalised, or zero);
  // flags is { crouch: boolean, jump: boolean }.
  function step(dt, wish, flags = {}) {
    const crouching = !!flags.crouch;
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = crouchHeight;
    } else if (!crouching && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standHeight, 0.02)) {
      body.crouching = false;
      body.height = standHeight;
    }
    const eyeTarget = body.crouching ? crouchEye : standEye;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const speed = body.crouching ? crouchSpeed : walkSpeed;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (flags.jump && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
