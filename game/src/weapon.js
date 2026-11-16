// Three hitscan weapons: a cheap pistol, a balanced rifle, a slow precision rifle.
// The numbers live here and nowhere else; main.js owns the ray and the damage, the
// weapon owns the magazine, the reload, the view model and the spread that punishes
// firing on the move. Spread also blooms while firing and recovers when still, so
// stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 24, headMult: 2,
    interval: 0.16, auto: false, mag: 12, reserve: 48, reloadTime: 1.3,
    spreadStill: 0.004, spreadMoving: 0.03, recoil: 0.006, kick: 0.03, barrel: 0.22,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 650, damage: 27, headMult: 2,
    interval: 0.105, auto: true, mag: 30, reserve: 90, reloadTime: 1.9,
    spreadStill: 0.003, spreadMoving: 0.026, recoil: 0.009, kick: 0.055, barrel: 0.4,
  },
  dmr: {
    id: 'dmr', name: 'Longshot DMR', price: 1500, damage: 88, headMult: 2,
    interval: 0.85, auto: false, mag: 5, reserve: 15, reloadTime: 2.6,
    spreadStill: 0.0012, spreadMoving: 0.02, recoil: 0.02, kick: 0.09, barrel: 0.55,
  },
};

const MUZZLE_TIME = 0.06;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), grip);
  sight.position.set(0, 0.075, -0.1);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let def = WEAPONS.rifle;
  const state = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0 };

  function applyDef() {
    barrel.scale.z = def.barrel / 0.4;
    barrel.position.z = -0.2 - def.barrel / 2 + 0.01;
    flash.position.z = -0.55 - def.barrel;
    flashLight.position.z = -0.6 - def.barrel * 0.5;
  }
  applyDef();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 1.1);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() {
      return def;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.interval;
      state.flash = MUZZLE_TIME;
      state.kick = def.kick;
      state.heat = Math.min(1, state.heat + 0.32);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      return def.spreadStill + moving * def.spreadMoving + state.heat * 0.02;
    },
    switchTo(id) {
      def = WEAPONS[id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
      applyDef();
    },
    refillReserve() {
      state.reserve = def.reserve;
    },
    // Round start: move reserve rounds into the magazine at once, free.
    topUp() {
      const need = def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
      state.reloadLeft = 0;
    },
  };
}
