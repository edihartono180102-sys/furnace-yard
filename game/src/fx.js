// Pooled visual effects: tracers, impact sparks and the grenade explosion. Everything
// is allocated once at boot and reused; no mesh, geometry or material is created in a
// hot loop, so firing a burst never stutters the frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const TRACER_LIFE = 0.09;
const SPARK_COUNT = 6;
const SPARK_POINTS = 14;
const SPARK_LIFE = 0.28;

export function createFx(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const material = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0 });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    sparks.push({ points, velocities: new Float32Array(SPARK_POINTS * 3), life: 0, origin: new THREE.Vector3() });
  }

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 16);
  scene.add(blastLight);
  let blastLife = 0;
  const blastOrigin = new THREE.Vector3();

  const tmpColor = new THREE.Color();

  return {
    tracer(from, to, color = PALETTE.accent) {
      const slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
      const positions = slot.line.geometry.attributes.position.array;
      positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
      positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.material.color.set(color);
      slot.line.visible = true;
      slot.life = TRACER_LIFE;
    },
    spark(at, color = PALETTE.accent) {
      const slot = sparks.find((s) => s.life <= 0) ?? sparks[0];
      const positions = slot.points.geometry.attributes.position.array;
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        positions[i * 3] = at.x;
        positions[i * 3 + 1] = at.y;
        positions[i * 3 + 2] = at.z;
        const a = Math.random() * Math.PI * 2;
        const b = Math.random() * Math.PI - Math.PI / 2;
        const speed = 2 + Math.random() * 4;
        slot.velocities[i * 3] = Math.cos(a) * Math.cos(b) * speed;
        slot.velocities[i * 3 + 1] = Math.sin(b) * speed + 2;
        slot.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(b) * speed;
      }
      slot.points.geometry.attributes.position.needsUpdate = true;
      slot.points.material.color.set(color);
      slot.points.visible = true;
      slot.life = SPARK_LIFE;
      slot.origin.copy(at);
    },
    explosion(at) {
      blastOrigin.copy(at);
      blast.position.copy(at);
      blast.visible = true;
      blastLife = 0.4;
      blastLight.position.copy(at);
      blastLight.intensity = 60;
    },
    step(dt) {
      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.9;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
      for (const spark of sparks) {
        if (spark.life <= 0) continue;
        spark.life -= dt;
        const positions = spark.points.geometry.attributes.position.array;
        for (let i = 0; i < SPARK_POINTS; i += 1) {
          positions[i * 3] += spark.velocities[i * 3] * dt;
          positions[i * 3 + 1] += spark.velocities[i * 3 + 1] * dt;
          positions[i * 3 + 2] += spark.velocities[i * 3 + 2] * dt;
          spark.velocities[i * 3 + 1] -= 9 * dt;
        }
        spark.points.geometry.attributes.position.needsUpdate = true;
        spark.points.material.opacity = Math.max(0, spark.life / SPARK_LIFE);
        if (spark.life <= 0) spark.points.visible = false;
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const t = 1 - Math.max(0, blastLife) / 0.4;
        const scale = 0.5 + t * 4.2;
        blast.scale.set(scale, scale, scale);
        blast.material.opacity = Math.max(0, 0.55 * (1 - t));
        blastLight.intensity = Math.max(0, 60 * (1 - t));
        if (blastLife <= 0) {
          blast.visible = false;
          blastLight.intensity = 0;
        }
      }
    },
  };
}
