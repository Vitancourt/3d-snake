import * as THREE from 'three';
import { CFG, N, HALF, nodeX, nodeZ } from './config.js';
import { cloneBuilding, cloneLamp } from './models.js';

const lam = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function asphalt(g, w, h) {
  g.fillStyle = '#3b3e44';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < (w * h) / 22; k++) {
    const v = 40 + Math.floor(Math.random() * 50);
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// One dash period (8 m along the street): dashed centre line and thin edge lines.
const roadTex = canvasTexture(128, 128, (g, w, h) => {
  asphalt(g, w, h);
  g.fillStyle = '#e9e9e4';
  g.fillRect(0, h / 2 - 2, w / 2, 4);
  g.fillStyle = '#d9b84a';
  g.fillRect(0, 5, w, 3);
  g.fillRect(0, h - 8, w, 3);
});

// Intersection: asphalt with a zebra crossing on each of the four sides.
const crossTex = canvasTexture(256, 256, (g, w, h) => {
  asphalt(g, w, h);
  const band = (w / CFG.streetW) * 1.0;
  const stripe = (w / CFG.streetW) * 0.45;
  const period = (w / CFG.streetW) * 0.9;
  g.fillStyle = '#ecece6';
  for (let p = period / 2; p < w - stripe; p += period) {
    g.fillRect(p, 2, stripe, band);
    g.fillRect(p, h - band - 2, stripe, band);
    g.fillRect(2, p, band, stripe);
    g.fillRect(w - band - 2, p, band, stripe);
  }
});

const pavementTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#a9aab0';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 600; k++) {
    const v = 140 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = '#85868c';
  g.fillRect(0, 0, w, 3);
  g.fillRect(0, 0, 3, h);
});

const grassTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#4f8a3f';
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 1400; k++) {
    const v = Math.floor(Math.random() * 60);
    g.fillStyle = `rgba(${50 + v},${110 + v},${40 + v / 2},0.55)`;
    g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 2);
  }
});

const M = {
  road: lam(0xffffff, { map: roadTex, roughness: 0.92 }),
  cross: lam(0xffffff, { map: crossTex, roughness: 0.92 }),
  pavement: lam(0xffffff, { map: pavementTex }),
  grass: lam(0xffffff, { map: grassTex, roughness: 1 }),
  slab: lam(0xb9bac0),
  ground: lam(0x7b8089, { roughness: 1 }),
  wall: lam(0xc9c6bd, { roughness: 0.9 }),
  stripe: lam(0xd62828),
  trunk: lam(0x6b4423),
  leaf: lam(0x3a9d4f, { roughness: 0.9 }),
  pole: lam(0x45484f, { metalness: 0.4, roughness: 0.5 }),
  fallbackBuilding: lam(0xcdb4db),
};

const plane = (w, d, tile, mat) => {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (tile) {
    const uv = g.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * w) / tile, (uv.getY(v) * d) / tile);
  }
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
};
const box = (w, h, d, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};

const treeGeo = new THREE.IcosahedronGeometry(1.2, 1);
const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 8);
const rand = (a, b) => a + Math.random() * (b - a);
const BLOCK = CFG.spacing - CFG.streetW;
const LOT = BLOCK - CFG.sidewalk * 2;

function addTree(group, x, z) {
  const trunk = new THREE.Mesh(trunkGeo, M.trunk);
  trunk.position.set(x, 0.2 + 0.8, z);
  trunk.castShadow = true;
  const crown = new THREE.Mesh(treeGeo, M.leaf);
  crown.position.set(x, 2.6, z);
  crown.scale.set(rand(0.9, 1.3), rand(1, 1.4), rand(0.9, 1.3));
  crown.rotation.y = Math.random() * 3;
  crown.castShadow = true;
  group.add(trunk, crown);
}

function addBuilding(group, cx, cz, baseY, far, lot, scaleY = 1) {
  const b = cloneBuilding(far);
  if (!b) {
    const h = rand(8, 24);
    const m = box(lot, h, lot, M.fallbackBuilding);
    m.position.set(cx, 0.2 + h / 2, cz);
    group.add(m);
    return;
  }
  const s = (lot * 0.98) / Math.max(b.size.x, b.size.z);
  // Cap most towers so the streets don't feel like a canyon; a few skyscrapers stay tall.
  const maxH = far ? Infinity : Math.random() < 0.2 ? 32 : rand(9, 17);
  const sy = Math.min(1, maxH / (b.size.y * s)) * scaleY;
  b.object.scale.set(s, s * sy, s);
  b.object.rotation.y = (Math.PI / 2) * Math.floor(Math.random() * 4);
  b.object.position.set(cx, baseY, cz);
  group.add(b.object);
}

export function buildTown(scene) {
  const group = new THREE.Group();

  const ground = plane(900, 900, 0, M.ground);
  ground.position.y = -0.03;
  group.add(ground);

  // Streets: one long strip per grid line plus an intersection patch where they cross.
  const len = 2 * HALF + CFG.streetW;
  for (let k = 0; k <= N; k++) {
    const h = plane(len, CFG.streetW, 8, M.road);
    h.position.set(0, 0.01, nodeZ(k));
    const v = plane(len, CFG.streetW, 8, M.road);
    v.rotation.y = Math.PI / 2;
    v.position.set(nodeX(k), 0.01, 0);
    group.add(h, v);
  }
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = plane(CFG.streetW, CFG.streetW, 0, M.cross);
      p.position.set(nodeX(i), 0.02, nodeZ(j));
      group.add(p);
    }
  }

  // Blocks: raised sidewalk slab with a building, or a small park on top.
  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const cx = (nodeX(bi) + nodeX(bi + 1)) / 2;
      const cz = (nodeZ(bj) + nodeZ(bj + 1)) / 2;
      const slab = box(BLOCK, 0.2, BLOCK, M.slab);
      slab.castShadow = false;
      slab.position.set(cx, 0.1, cz);
      const top = plane(BLOCK, BLOCK, 2, M.pavement);
      top.position.set(cx, 0.202, cz);
      group.add(slab, top);

      if (Math.random() < 0.14) {
        const lawn = plane(LOT, LOT, 3, M.grass);
        lawn.position.set(cx, 0.21, cz);
        group.add(lawn);
        for (let t = 0; t < 4; t++) addTree(group, cx + rand(-LOT / 2 + 1, LOT / 2 - 1), cz + rand(-LOT / 2 + 1, LOT / 2 - 1));
      } else {
        addBuilding(group, cx, cz, 0.2, false, LOT);
      }

      // Street lamps on a checkerboard of block corners.
      if ((bi + bj) % 2 === 0) {
        const sx = Math.random() < 0.5 ? -1 : 1;
        const sz = Math.random() < 0.5 ? -1 : 1;
        const lx = cx + sx * (BLOCK / 2 - 0.5);
        const lz = cz + sz * (BLOCK / 2 - 0.5);
        const pole = box(0.2, 5.4, 0.2, M.pole);
        pole.position.set(lx, 0.2 + 2.7, lz);
        group.add(pole);
        const lamp = cloneLamp();
        if (lamp) {
          lamp.position.set(lx, 4.9, lz);
          lamp.rotation.y = sz > 0 ? 0 : Math.PI;
          group.add(lamp);
        }
      }
    }
  }

  // Perimeter wall around the playable town, with a skyline of taller buildings behind it.
  const edge = HALF + CFG.streetW / 2 + 1.3;
  const wl = 2 * edge + 2;
  for (const [x, z, w, d] of [[0, -edge, wl, 1.2], [0, edge, wl, 1.2], [-edge, 0, 1.2, wl], [edge, 0, 1.2, wl]]) {
    const wall = box(w, 2.2, d, M.wall);
    wall.position.set(x, 1.1, z);
    group.add(wall);
    const band = box(w + 0.02, 0.35, d + 0.02, M.stripe);
    band.position.set(x, 1.7, z);
    band.castShadow = false;
    group.add(band);
  }
  const ring = edge + 7;
  for (let k = -9; k <= 9; k++) {
    const t = k * 8.4;
    for (const [x, z] of [[t, -ring], [t, ring], [-ring, t], [ring, t]]) {
      addBuilding(group, x, z, 0, Math.random() < 0.3, 7.2, rand(1.2, 2.2));
    }
  }

  group.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = true; });
  scene.add(group);
  return group;
}
