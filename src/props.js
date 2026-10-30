import * as THREE from 'three';
import { CFG } from './config.js';
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

export function buildCar() {
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

export function buildCone() {
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

export function buildBarrier() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    g.add(mesh(G.barrierBand, i % 2 ? MAT.white : MAT.red, (i - 1.5) * 0.65, 0.55, 0));
  }
  for (const dx of [-1.1, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), MAT.dark, dx, 0.18, 0));
  return g;
}

export function buildApple() {
  const g = new THREE.Group();
  g.add(mesh(G.apple, MAT.apple, 0, 0, 0));
  const leaf = mesh(G.leaf, MAT.leaf, 0.12, 0.42, 0);
  leaf.rotation.z = 0.5;
  g.add(leaf);
  return g;
}

export const STATIC_TYPES = {
  cone: { build: buildCone, hw: 0.9, hd: 0.5, h: 0.9 },
  barrier: { build: () => cloneBarrier() ?? buildBarrier(), hw: 1.15, hd: 0.35, h: 1.5 },
};

