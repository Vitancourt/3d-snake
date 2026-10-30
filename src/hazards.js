import * as THREE from 'three';
import { CFG } from './config.js';
import { overlap } from './collision.js';
import { cloneFerrari, cloneBarrier } from './models.js';

const lam = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
const MAT = {
  wheel: lam(0x151515, { roughness: 0.9 }),
  rim: lam(0xb8bcc4, { roughness: 0.3, metalness: 0.8 }),
  glass: lam(0x0f1a26, { roughness: 0.05, metalness: 0.9 }),
  bumper: lam(0x1d1f24, { roughness: 0.6 }),
  head: lam(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 2 }),
  tail: lam(0xff2d2d, { emissive: 0xaa0000 }),
  orange: lam(0xff7a1a),
  white: lam(0xf5f5f5),
  red: lam(0xd62828),
  green: lam(0x2d6a4f),
  dark: lam(0x2b2d42),
  apple: lam(0xe5383b, { emissive: 0x66090b }),
  leaf: lam(0x40c057),
};
const CAR_COLORS = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0x8d99ae, 0x9b5de5, 0xffffff];
const carMats = CAR_COLORS.map((c) => lam(c, { roughness: 0.25, metalness: 0.55 }));

function carShape(pts) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return sh;
}
// Profile coordinates: x is front(+)/rear(-), y is height. Extruded across the car's width,
// then turned so the front points to -z.
function carExtrude(pts, width, bevel) {
  const g = new THREE.ExtrudeGeometry(carShape(pts), {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

const G = {
  body: carExtrude([
    [-2.0, 0.28], [-2.0, 0.8], [-1.75, 0.92], [-1.45, 0.95], [-0.95, 1.42], [0.45, 1.42],
    [1.1, 0.95], [1.75, 0.88], [2.0, 0.72], [2.0, 0.28],
  ], 1.9, 0.06),
  sideGlass: carExtrude([[-1.2, 1.0], [-0.88, 1.36], [0.4, 1.36], [0.95, 1.0]], 2.0, 0),
  windshield: new THREE.BoxGeometry(1.5, 0.64, 0.02),
  rearGlass: new THREE.BoxGeometry(1.5, 0.55, 0.02),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16),
  rim: new THREE.CylinderGeometry(0.21, 0.21, 0.3, 12),
  lamp: new THREE.BoxGeometry(0.45, 0.14, 0.08),
  bumper: new THREE.BoxGeometry(1.95, 0.22, 0.12),
  cone: new THREE.ConeGeometry(0.38, 0.9, 12),
  coneBand: new THREE.CylinderGeometry(0.2, 0.26, 0.14, 12),
  coneBase: new THREE.BoxGeometry(0.8, 0.08, 0.8),
  barrierBand: new THREE.BoxGeometry(2.6 / 4, 0.45, 0.5),
  dumpster: new THREE.BoxGeometry(2.0, 2.6, 1.8),
  dumpLid: new THREE.BoxGeometry(2.1, 0.15, 1.9),
  block: new THREE.BoxGeometry(CFG.laneW - 0.1, 2.8, 1.2),
  blockBand: new THREE.BoxGeometry((CFG.laneW - 0.1) / 4, 1.0, 1.25),
  apple: new THREE.SphereGeometry(0.4, 16, 12),
  leaf: new THREE.BoxGeometry(0.28, 0.06, 0.16),
};
G.wheel.rotateZ(Math.PI / 2);
G.rim.rotateZ(Math.PI / 2);

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function buildCar() {
  const real = cloneFerrari();
  if (real) {
    real.rotation.y = Math.PI; // front faces the player
    return real;
  }
  const g = new THREE.Group();
  const paint = carMats[Math.floor(Math.random() * carMats.length)];
  g.add(mesh(G.body, paint, 0, 0, 0));
  g.add(mesh(G.sideGlass, MAT.glass, 0, 0, 0));
  const ws = mesh(G.windshield, MAT.glass, 0, 1.185 + 0.075 * 0.81, -0.775 - 0.075 * 0.59);
  ws.rotation.x = 0.944;
  const rg = mesh(G.rearGlass, MAT.glass, 0, 1.185 + 0.075 * 0.73, 1.2 + 0.075 * 0.68);
  rg.rotation.x = -0.816;
  g.add(ws, rg);
  for (const sx of [-1, 1]) {
    for (const sz of [-1.3, 1.3]) {
      g.add(mesh(G.wheel, MAT.wheel, 0.9 * sx, 0.36, sz));
      g.add(mesh(G.rim, MAT.rim, 0.92 * sx, 0.36, sz));
    }
    g.add(mesh(G.lamp, MAT.head, 0.6 * sx, 0.7, -2.04));
    g.add(mesh(G.lamp, MAT.tail, 0.62 * sx, 0.74, 2.04));
  }
  g.add(mesh(G.bumper, MAT.bumper, 0, 0.36, -2.0));
  g.add(mesh(G.bumper, MAT.bumper, 0, 0.36, 2.0));
  g.rotation.y = Math.PI; // front faces the player
  return g;
}

function buildCone() {
  const g = new THREE.Group();
  for (const dx of [-0.5, 0.5]) {
    const c = new THREE.Group();
    c.add(mesh(G.coneBase, MAT.dark, 0, 0.04, 0));
    c.add(mesh(G.cone, MAT.orange, 0, 0.53, 0));
    c.add(mesh(G.coneBand, MAT.white, 0, 0.55, 0));
    c.position.x = dx;
    g.add(c);
  }
  return g;
}

function buildBarrier() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    g.add(mesh(G.barrierBand, i % 2 ? MAT.white : MAT.red, (i - 1.5) * 0.65, 0.55, 0));
  }
  for (const dx of [-1.1, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), MAT.dark, dx, 0.18, 0));
  return g;
}

function buildDumpster() {
  const g = new THREE.Group();
  g.add(mesh(G.dumpster, MAT.green, 0, 1.3, 0));
  g.add(mesh(G.dumpLid, MAT.dark, 0, 2.65, 0));
  return g;
}

function buildBlock() {
  const g = new THREE.Group();
  g.add(mesh(G.block, MAT.white, 0, 1.4, 0));
  const w = (CFG.laneW - 0.1) / 4;
  for (let i = 0; i < 4; i += 2) g.add(mesh(G.blockBand, MAT.orange, (i - 1.5) * w, 1.4, 0));
  for (let i = 1; i < 4; i += 2) g.add(mesh(G.blockBand, MAT.white, (i - 1.5) * w, 1.4, 0));
  return g;
}

function buildApple() {
  const g = new THREE.Group();
  g.add(mesh(G.apple, MAT.apple, 0, 0, 0));
  const leaf = mesh(G.leaf, MAT.leaf, 0.12, 0.42, 0);
  leaf.rotation.z = 0.5;
  g.add(leaf);
  return g;
}

const STATIC_TYPES = {
  cone: { build: buildCone, hw: 0.9, hd: 0.5, h: 0.9 },
  barrier: { build: () => cloneBarrier() ?? buildBarrier(), hw: 1.15, hd: 0.35, h: 1.5 },
  dumpster: { build: buildDumpster, hw: 1.0, hd: 0.9, h: 2.7 },
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.hazards = [];
    this.foods = [];
    this.pending = [];
  }

  clear() {
    this.pending = [];
    for (const h of this.hazards) this.scene.remove(h.mesh);
    for (const f of this.foods) this.scene.remove(f.mesh);
    this.hazards = [];
    this.foods = [];
  }

  addHazard(mesh, x, z, hw, hd, h, vz = 0, isCar = false) {
    mesh.position.set(x, 0, z);
    mesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.scene.add(mesh);
    this.hazards.push({ mesh, x, z, hw, hd, y0: 0, y1: h, vz, isCar });
  }

  addStatic(type, x, z) {
    const t = STATIC_TYPES[type];
    this.addHazard(t.build(), x, z, t.hw, t.hd, t.h);
  }

  // Full-lane block that closes a lane where the road narrows.
  addBlock(x, z) {
    this.addHazard(buildBlock(), x, z, CFG.laneW / 2, 0.6, 2.8);
  }

  // Cars are created once the snake is close, so the arrival timing uses the current speed.
  queueCar(x, zRow) {
    this.pending.push({ x, zRow });
  }

  // All traffic drives toward the player. Place the car so it reaches zRow just as the snake does.
  addCar(x, zRow, snakeZ, speed) {
    const vz = CFG.oncomingSpeed;
    const t = (snakeZ - zRow) / speed;
    this.addHazard(buildCar(), x, zRow - vz * t, 0.95, 2.3, 1.25, vz, true);
  }

  addFood(x, z) {
    const mesh = buildApple();
    mesh.position.set(x, 0.9, z);
    mesh.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(mesh);
    this.foods.push({ mesh, x, z, hw: 0.6, hd: 0.6, y0: 0.2, y1: 1.7, phase: Math.random() * 6 });
  }

  // One row of hazards. `safe` is the lane guaranteed to be clear at zRow.
  spawnRow({ z, slots, safe, snakeZ, speed }) {
    const W = CFG.laneW;
    if (slots.length === 1) {
      if (Math.random() < 0.85) this.addStatic(pick(['cone', 'barrier', 'barrier']), 0, z);
      return;
    }
    for (const slot of slots) {
      if (slot === safe || Math.random() > CFG.hazardChance) continue;
      const x = slot * W;
      if (Math.random() < 0.55) this.queueCar(x, z);
      else this.addStatic(pick(['cone', 'barrier', 'dumpster']), x, z);
    }
  }

  update(dt, time, snakeZ, speed) {
    this.pending = this.pending.filter((p) => {
      if (snakeZ - p.zRow > CFG.carSpawnDist) return true;
      this.addCar(p.x, p.zRow, snakeZ, speed);
      return false;
    });
    for (const h of this.hazards) {
      if (h.vz) {
        h.z += h.vz * dt;
        h.mesh.position.z = h.z;
        const wheels = h.mesh.userData.wheels;
        if (wheels) {
          h.spin = (h.spin || 0) + (h.vz * dt) / 0.36;
          for (const w of wheels) w.rotation.x = -Math.PI / 2 + h.spin;
        }
      }
    }
    for (const f of this.foods) {
      f.mesh.rotation.y += dt * 2.5;
      f.mesh.position.y = 0.95 + Math.sin(time * 3 + f.phase) * 0.12;
    }
  }

  cleanup(snakeZ) {
    const behind = snakeZ + CFG.cleanupBehind;
    this.hazards = this.hazards.filter((h) => {
      if (h.z > behind || h.z < snakeZ - 600) { this.scene.remove(h.mesh); return false; }
      return true;
    });
    this.foods = this.foods.filter((f) => {
      if (f.z > behind) { this.scene.remove(f.mesh); return false; }
      return true;
    });
  }

  hitHead(box) {
    return this.hazards.find((h) => overlap(box, h)) || null;
  }

  // Returns the number of apples eaten.
  eat(box) {
    let n = 0;
    this.foods = this.foods.filter((f) => {
      if (overlap(box, f)) { this.scene.remove(f.mesh); n++; return false; }
      return true;
    });
    return n;
  }

  // Index of the first tail segment run over by a car, or -1.
  tailHit(snake) {
    const cars = this.hazards.filter((h) => h.isCar && Math.abs(h.z - snake.z) < 70);
    if (!cars.length) return -1;
    for (let i = 0; i < snake.length; i++) {
      const b = snake.segBox(i);
      if (cars.some((c) => overlap(b, c))) return i;
    }
    return -1;
  }
}
