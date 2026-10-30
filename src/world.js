import * as THREE from 'three';
import { CFG } from './config.js';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = {
  asphalt: lam(0x33363d),
  slab: lam(0xa7aab2),
  curb: lam(0xd0d2d8),
  white: lam(0xf2f2f2),
  yellow: lam(0xf4c430),
  trunk: lam(0x6b4423),
  leaf: lam(0x3a9d4f),
  pole: lam(0x45484f),
  lamp: lam(0xfff3b0, { emissive: 0xffe58a }),
};

const boxCache = new Map();
function getBox(w, h, d) {
  const key = `${w}|${h}|${d}`;
  let g = boxCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(key, g); }
  return g;
}
function addBox(group, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(getBox(w, h, d), mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

// Window texture shared by all buildings; geometry UVs are scaled per building size.
function makeWindowTexture(lit) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = lit ? '#ffd27a' : '#34425e';
  g.fillRect(14, 14, 36, 36);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(14, 14, 36, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const WALL_COLORS = [0xe76f51, 0xf4a261, 0xe9c46a, 0x8ecae6, 0xb8b8d1, 0xcdb4db, 0xa7c957, 0xf28482];
let buildingMats = null;
const buildingGeoCache = new Map();

function getBuildingMat() {
  if (!buildingMats) {
    const textures = [makeWindowTexture(false), makeWindowTexture(true)];
    buildingMats = WALL_COLORS.flatMap((c) => textures.map((map) => lam(c, { map })));
  }
  return buildingMats[Math.floor(Math.random() * buildingMats.length)];
}

function getBuildingGeo(cx, cz, floors) {
  const key = `${cx}|${cz}|${floors}`;
  let g = buildingGeoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(cx * 2.5, floors * 3, cz * 2.5);
  const uv = g.attributes.uv;
  // Box face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const scales = [[cz, floors], [cz, floors], null, null, [cx, floors], [cx, floors]];
  scales.forEach((s, face) => {
    for (let v = face * 4; v < face * 4 + 4; v++) {
      if (s) uv.setXY(v, uv.getX(v) * s[0], uv.getY(v) * s[1]);
      else uv.setXY(v, 0.02, 0.02); // plain wall colour on roof and underside
    }
  });
  buildingGeoCache.set(key, g);
  return g;
}

function pickSlots(i) {
  if (i < 2) return [-1, 0, 1];
  const r = Math.random();
  if (r < 0.4) return [-1, 0, 1];
  if (r < 0.75) return Math.random() < 0.5 ? [-1, 0] : [0, 1];
  return [0];
}

const rand = (a, b) => a + Math.random() * (b - a);
const BUILDING_EDGE = 1.5 * CFG.laneW + 4.5; // buildings start beyond the widest road + sidewalk

export class World {
  constructor(scene, traffic) {
    this.scene = scene;
    this.traffic = traffic;
    this.reset();
  }

  reset() {
    for (const c of this.chunks || []) this.scene.remove(c.group);
    this.chunks = [];
    this.sets = [];
    this.rows = []; // { z, slot }: the guaranteed-clear lane per hazard row
    this.lastSafe = 0;
    this.nextChunk = 0;
  }

  slotsFor(i) {
    while (this.sets.length <= i) this.sets.push(pickSlots(this.sets.length));
    return this.sets[i];
  }

  chunkIndexAt(z) { return Math.max(0, Math.floor(-z / CFG.chunkLen)); }
  slotsAt(z) { return this.slotsFor(this.chunkIndexAt(z)); }

  roadBounds(z) {
    const s = this.slotsAt(z);
    return { min: (Math.min(...s) - 0.5) * CFG.laneW, max: (Math.max(...s) + 0.5) * CFG.laneW };
  }

  update(snakeZ, speed) {
    while (-this.nextChunk * CFG.chunkLen > snakeZ - CFG.horizon) {
      this.buildChunk(this.nextChunk++, snakeZ, speed);
    }
    this.chunks = this.chunks.filter((c) => {
      if (c.endZ > snakeZ + 60) { this.scene.remove(c.group); return false; }
      return true;
    });
    this.rows = this.rows.filter((r) => r.z < snakeZ + 40);
  }

  buildChunk(i, snakeZ, speed) {
    const slots = this.slotsFor(i);
    const next = this.slotsFor(i + 1);
    const z0 = -i * CFG.chunkLen;
    if (i === 0) this.buildScenery(-1, slots); // street behind the start line
    this.buildScenery(i, slots);
    this.addRows(i, z0, slots, next, snakeZ, speed);
    for (const slot of slots) {
      if (!next.includes(slot)) this.traffic.addBlock(slot * CFG.laneW, z0 - CFG.chunkLen + 1.5);
    }
  }

  buildScenery(i, slots) {
    const L = CFG.chunkLen;
    const W = CFG.laneW;
    const z0 = -i * L;
    const z1 = z0 - L;
    const zc = z0 - L / 2;
    const group = new THREE.Group();
    const lo = (Math.min(...slots) - 0.5) * W;
    const hi = (Math.max(...slots) + 0.5) * W;
    const half = 40;

    // Ground: asphalt base, raised sidewalk slabs either side of the road.
    addBox(group, half * 2, 0.5, L, M.asphalt, 0, -0.25, zc);
    addBox(group, lo + half, 0.2, L, M.slab, (lo - half) / 2, 0.1, zc);
    addBox(group, half - hi, 0.2, L, M.slab, (hi + half) / 2, 0.1, zc);
    addBox(group, 0.3, 0.25, L, M.curb, lo - 0.15, 0.125, zc);
    addBox(group, 0.3, 0.25, L, M.curb, hi + 0.15, 0.125, zc);

    // Road markings.
    addBox(group, 0.18, 0.02, L, M.yellow, lo + 0.35, 0.01, zc);
    addBox(group, 0.18, 0.02, L, M.yellow, hi - 0.35, 0.01, zc);
    const sorted = [...slots].sort((a, b) => a - b);
    for (let k = 0; k < sorted.length - 1; k++) {
      const x = (sorted[k] + 0.5) * W;
      for (let dz = 3; dz < L; dz += 8) addBox(group, 0.15, 0.02, 3.5, M.white, x, 0.01, z0 - dz);
    }
    if (i > 0) {
      for (let s = lo + 0.8; s < hi - 0.5; s += 1.1) addBox(group, 0.6, 0.02, 3, M.white, s, 0.012, z0 - 2.5);
    }

    this.addTown(group, i, z0, z1, lo, hi);

    this.scene.add(group);
    this.chunks.push({ i, group, endZ: z1 });
  }

  addRows(i, z0, slots, next, snakeZ, speed) {
    if (i < CFG.graceChunks) return;
    const L = CFG.chunkLen;
    const spacing = CFG.rowSpacing[slots.length];
    const placed = [];
    for (let off = CFG.firstRowOffset; off <= L - CFG.lastRowMargin; off += spacing) {
      const isLast = off + spacing > L - CFG.lastRowMargin;
      let cands = [this.lastSafe - 1, this.lastSafe, this.lastSafe + 1].filter((s) => slots.includes(s));
      if (isLast) cands = cands.filter((s) => next.includes(s));
      if (!cands.length) cands = [0];
      const safe = Math.random() < 0.5 && cands.includes(this.lastSafe)
        ? this.lastSafe
        : cands[Math.floor(Math.random() * cands.length)];
      this.lastSafe = safe;
      const z = z0 - off;
      this.rows.push({ z, slot: safe });
      placed.push({ z, safe });
      this.traffic.spawnRow({ z, slots, safe, snakeZ, speed });
    }
    // Apples between rows, in one of the two neighbouring safe lanes.
    for (let k = 0; k < placed.length - 1; k++) {
      if (Math.random() > CFG.foodChance) continue;
      const lane = Math.random() < 0.5 ? placed[k].safe : placed[k + 1].safe;
      this.traffic.addFood(lane * CFG.laneW, (placed[k].z + placed[k + 1].z) / 2);
    }
  }

  addTown(group, i, z0, z1, lo, hi) {
    // Buildings on both sides.
    for (const side of [-1, 1]) {
      let z = z0;
      while (z > z1 + 5) {
        const cx = 2 + Math.floor(Math.random() * 3);
        const cz = 2 + Math.floor(Math.random() * 3);
        const floors = 2 + Math.floor(Math.random() * 6);
        const depth = cz * 2.5;
        if (z - depth < z1 - 2) break;
        const b = new THREE.Mesh(getBuildingGeo(cx, cz, floors), getBuildingMat());
        b.position.set(side * (BUILDING_EDGE + (cx * 2.5) / 2), (floors * 3) / 2, z - depth / 2);
        group.add(b);
        z -= depth + rand(0.5, 3);
      }

      // Street lamps and trees on the sidewalk strip.
      const edge = side < 0 ? lo : hi;
      for (let dz = 10; dz < CFG.chunkLen; dz += 20) {
        const x = edge + side * 1.2;
        addBox(group, 0.18, 5, 0.18, M.pole, x, 2.5, z0 - dz);
        addBox(group, 0.9, 0.12, 0.12, M.pole, x - side * 0.4, 5, z0 - dz);
        addBox(group, 0.5, 0.15, 0.35, M.lamp, x - side * 0.8, 4.92, z0 - dz);
      }
      const gapStart = Math.abs(edge) + 2.5;
      if (BUILDING_EDGE - gapStart > 3) {
        for (let dz = 6; dz < CFG.chunkLen; dz += 11) {
          const x = side * rand(gapStart, BUILDING_EDGE - 1.5);
          addBox(group, 0.35, 1.6, 0.35, M.trunk, x, 0.8, z0 - dz - rand(0, 4));
          const crown = addBox(group, 2, 2, 2, M.leaf, x, 2.6, group.children.at(-1).position.z);
          crown.rotation.y = Math.random() * 3;
        }
      }
    }
  }
}
