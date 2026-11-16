// Foundry Yard: a small industrial yard, 30 x 30 m, built from boxes. Every box is a
// collider for bodies and a surface a bullet stops on. Three lanes run north-south
// (west, central, east) and three streets east-west, so the map reads at a glance;
// cover sits in the four blocks between the corridors, never on a lane, so the bot
// waypoint graph below always has a clear straight run between linked nodes.
// The objective is THE FURNACE, a 6 x 6 m zone at the crossroads in the middle.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';

function makeLabelTexture(text, color, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = color;
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, sub ? 48 : 64);
  if (sub) {
    ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233,230,223,0.75)';
    ctx.fillText(sub, 256, 96);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'teal' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material] ?? material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the outer walls (30 x 30 m, 4.6 m walls).
  box(30.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 30.4, -15.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 30.4, 15.2, 2.3, 0, 'surface');
  box(30.4, 4.6, 0.4, 0, 2.3, -15.2, 'surface');
  box(30.4, 4.6, 0.4, 0, 2.3, 15.2, 'surface');

  // Painted floor strips: a centre line down the middle lane and the two side lanes.
  function strip(width, depth, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, depth), materials[material]);
    mesh.position.set(x, 0.011, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  strip(0.25, 26, 0, 0, 'hairline');
  strip(0.25, 26, -10, 0, 'hairline');
  strip(0.25, 26, 10, 0, 'hairline');
  strip(26, 0.25, 0, 8, 'hairline');
  strip(26, 0.25, 0, -8, 'hairline');

  // Cover, in the four blocks between the corridors. Nothing sits on a lane.
  // North-west block: a container stack and a crate.
  box(2.4, 2.4, 2.4, -5, 1.2, -4, 'surface');
  box(1.2, 1.1, 1.2, -6.5, 0.55, -2, 'hairline');
  // North-east block: a pillar and a low wall.
  box(1.2, 3.2, 1.2, 5, 1.6, -4, 'hairline');
  box(2.4, 1.0, 0.4, 4, 0.5, -2, 'hairline');
  // South-west block: a low wall and a crate.
  box(2.4, 1.0, 0.4, -5, 0.5, 4, 'hairline');
  box(1.2, 1.1, 1.2, -3.5, 0.55, 2.5, 'hairline');
  // South-east block: a container stack and a crate.
  box(2.4, 2.4, 2.4, 5, 1.2, 4, 'surface');
  box(1.2, 1.1, 1.2, 6.5, 0.55, 2.5, 'hairline');
  // Crouch cover at the four corners of the zone.
  box(1.2, 1.1, 1.2, -2.6, 0.55, 2.6, 'hairline');
  box(1.2, 1.1, 1.2, 2.6, 0.55, 2.6, 'hairline');
  box(1.2, 1.1, 1.2, -2.6, 0.55, -2.6, 'hairline');
  box(1.2, 1.1, 1.2, 2.6, 0.55, -2.6, 'hairline');
  // Gantry over the middle lane north of the zone: two pillars and a beam.
  box(0.5, 3.5, 0.5, -1.8, 1.75, -6, 'surface');
  box(0.5, 3.5, 0.5, 1.8, 1.75, -6, 'surface');
  box(4.2, 0.4, 0.6, 0, 3.6, -6, 'hairline');

  // The objective: a glowing ring on the floor and a light beam above it.
  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(2.7, 3.05, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM.amber.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.set(0, 0.03, 0);
  group.add(zoneRing);
  const zoneBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.4, 7, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM.amber.color), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  zoneBeam.position.set(0, 3.5, 0);
  group.add(zoneBeam);

  // Painted labels: the zone name on the floor, team banners on the spawn walls.
  function label(text, sub, color, width, x, y, z, rotateX, rotateY) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture(text, color, sub), transparent: true, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    if (rotateX) mesh.rotation.x = rotateX;
    if (rotateY) mesh.rotation.y = rotateY;
    group.add(mesh);
    return mesh;
  }
  label('FURNACE', 'CAPTURE ZONE', TEAM.amber.css, 5.4, 0, 0.035, 0, -Math.PI / 2, 0);
  label('AMBER', 'YOUR TEAM', TEAM.amber.css, 6, 0, 2.6, 14.9, 0, Math.PI);
  label('TEAL', 'ENEMY TEAM', TEAM.teal.css, 6, 0, 2.6, -14.9, 0, 0);
  label('BAY 01', null, '#98a0a8', 3.4, -14.9, 2.4, 0, 0, Math.PI / 2);
  label('BAY 02', null, '#98a0a8', 3.4, 14.9, 2.4, 0, 0, -Math.PI / 2);

  // Distant silhouettes outside the walls, for depth in the fog. Visual only.
  const skyline = new THREE.Group();
  const silhouettes = [[-24, 6, -20, 8, 12], [24, 5, -18, 7, 10], [-26, 7, 14, 9, 14], [22, 6, 20, 8, 12], [0, 8, -26, 10, 16], [-14, 4, 24, 6, 8], [14, 5, 26, 7, 10]];
  for (const [x, h, z, w, d] of silhouettes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.canvas);
    mesh.position.set(x, h / 2 - 0.5, z);
    skyline.add(mesh);
  }
  scene.add(skyline);

  // Light: a warm key from the front right, a cool fill from behind, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.4);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.2);
  key.position.set(9, 14, 7);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.far = 48;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.75);
  fill.position.set(-8, 9, 10);
  scene.add(fill);

  const zoneLight = new THREE.PointLight(new THREE.Color(TEAM.amber.color), 14, 14);
  zoneLight.position.set(0, 3.2, 0);
  scene.add(zoneLight);

  // Waypoint graph for the bots. Nodes sit on corridors; every edge is a straight run
  // that never crosses a cover box (cover lives in the blocks between corridors).
  const nodes = {
    AS1: [-2, 12], AS2: [2, 12], TS1: [-2, -12], TS2: [2, -12],
    S1: [-10, 8], S2: [0, 8], S3: [10, 8],
    M1: [-10, 0], M2: [0, 0], M3: [10, 0],
    N1: [-10, -8], N2: [0, -8], N3: [10, -8],
    H1: [-8, 5], H2: [8, 5], H3: [-8, -5], H4: [8, -5],
  };
  const edges = [
    ['AS1', 'S1'], ['AS1', 'S2'], ['AS2', 'S2'], ['AS2', 'S3'],
    ['S1', 'S2'], ['S2', 'S3'], ['S1', 'M1'], ['S2', 'M2'], ['S3', 'M3'],
    ['M1', 'M2'], ['M2', 'M3'], ['M1', 'N1'], ['M2', 'N2'], ['M3', 'N3'],
    ['N1', 'N2'], ['N2', 'N3'], ['N1', 'TS1'], ['N2', 'TS1'], ['N2', 'TS2'], ['N3', 'TS2'], ['TS1', 'TS2'],
    ['H1', 'S1'], ['H1', 'M1'], ['H2', 'S3'], ['H2', 'M3'],
    ['H3', 'N1'], ['H3', 'M1'], ['H4', 'N3'], ['H4', 'M3'],
  ];
  const waypoints = {};
  for (const [id, [x, z]] of Object.entries(nodes)) waypoints[id] = { id, x, z, links: [] };
  for (const [a, b] of edges) {
    waypoints[a].links.push(b);
    waypoints[b].links.push(a);
  }

  const zone = { x: 0, z: 0, half: 3 };

  return {
    colliders,
    shootables,
    group,
    waypoints,
    zone,
    spawns: {
      amber: [{ x: -2, z: 12, yaw: 0 }, { x: 0, z: 12.6, yaw: 0 }, { x: 2, z: 12, yaw: 0 }],
      teal: [{ x: -2, z: -12, yaw: Math.PI }, { x: 0, z: -12.6, yaw: Math.PI }, { x: 2, z: -12, yaw: Math.PI }],
    },
    // Pulse the zone ring and beam; side is 'amber' | 'teal' | 'none' | 'contested'.
    step(time, side) {
      const pulse = 0.75 + Math.sin(time * 2.4) * 0.25;
      zoneRing.material.opacity = 0.55 + pulse * 0.3;
      zoneBeam.material.opacity = 0.07 + pulse * 0.05;
      const color = side === 'teal' ? TEAM.teal.color : TEAM.amber.color;
      zoneRing.material.color.set(color);
      zoneBeam.material.color.set(color);
      zoneLight.color.set(color);
      zoneLight.intensity = 10 + pulse * 6;
    },
  };
}
