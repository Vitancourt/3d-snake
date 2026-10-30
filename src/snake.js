import * as THREE from 'three';
import { CFG, DIRS, N, inGrid, nodeX, nodeZ, yawFor } from './config.js';
import { getSnakeModel } from './models.js';

const RING_STEP = 0.35; // distance between rings of the body tube
const SIDES = 12;
const MAX_RINGS = 900;
const BODY_START = 1.0; // the tube begins this far behind the head origin, inside the head model
const BODY_BLEND = 4; // metres over which a jump lifts the body
const COLLIDE_START = 2.2; // tail points closer than this to the head can't bite it
const OVERSHOOT = CFG.streetW / 2 + 1.0; // how far past the last intersection the head can travel

function skinTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2f8f3d';
  g.fillRect(0, 0, 64, 128);
  // Darker diamonds along the back, lighter belly at the edges of the u range.
  g.fillStyle = '#1d6b2c';
  for (let y = 0; y < 128; y += 32) {
    for (const [cx, cy] of [[32, y + 16], [0, y + 32], [64, y + 32]]) {
      g.beginPath();
      g.moveTo(cx, cy - 15);
      g.lineTo(cx + 12, cy);
      g.lineTo(cx, cy + 15);
      g.lineTo(cx - 12, cy);
      g.closePath();
      g.fill();
    }
  }
  g.fillStyle = '#9bcf6a';
  g.fillRect(24, 0, 16, 128);
  g.globalAlpha = 0.18;
  g.fillStyle = '#000';
  for (let k = 0; k < 500; k++) g.fillRect(Math.random() * 64, Math.random() * 128, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fallbackHead() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x2cb84a, roughness: 0.45 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), skin);
  head.scale.set(1, 0.8, 1.3);
  head.position.y = 0.4;
  head.castShadow = true;
  g.add(head);
  return g;
}

function angleDiff(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export class Snake {
  constructor(scene) {
    this.scene = scene;
    const model = getSnakeModel();
    this.headObject = model ? model.object : fallbackHead();
    this.headObject.rotation.order = 'YXZ'; // yaw first, then pitch along the heading
    this.mixer = model ? model.mixer : null;
    scene.add(this.headObject);

    // Body: a tube whose rings follow the path the head has travelled.
    const maxVerts = MAX_RINGS * (SIDES + 1);
    this.pos = new Float32Array(maxVerts * 3);
    this.nor = new Float32Array(maxVerts * 3);
    this.uv = new Float32Array(maxVerts * 2);
    const idx = [];
    for (let r = 0; r < MAX_RINGS - 1; r++) {
      for (let s = 0; s < SIDES; s++) {
        const a = r * (SIDES + 1) + s;
        const b = a + SIDES + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    geo.setIndex(idx);
    this.bodyGeo = geo;
    this.body = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: skinTexture(), roughness: 0.5, metalness: 0.05 }),
    );
    this.body.frustumCulled = false;
    this.body.castShadow = true;
    scene.add(this.body);

    this.reset();
  }

  reset() {
    this.i = N / 2;
    this.j = N / 2;
    this.dir = 0;
    this.t = 0;
    this.dist = 0;
    this.len = CFG.startLength;
    this.pending = 0;
    this.crashed = false;
    this.y = 0;
    this.jumpT = -1;
    this.vy = 0;
    this.pop = 0;
    this.yaw = yawFor(this.dir);
    this.updatePosition();
    // Pre-fill the trail so the starting body has a straight road behind it.
    this.trail = [];
    for (let k = 120; k >= 0; k--) {
      const d = DIRS[this.dir];
      this.trail.push({ x: this.x - d.dx * k * 0.5, z: this.z - d.dz * k * 0.5, y: 0, d: -k * 0.5 });
    }
    this.points = [];
    this.build();
  }

  updatePosition() {
    const d = DIRS[this.dir];
    this.x = nodeX(this.i) + d.dx * this.t;
    this.z = nodeZ(this.j) + d.dz * this.t;
  }

  // Queue a turn for the next intersection: -1 left, +1 right.
  turn(side) { this.pending = side; }

  jump() { if (this.jumpT < 0) this.jumpT = 0; }

  grow() {
    this.len = Math.min(this.len + CFG.growPerApple, MAX_RINGS * RING_STEP - 6);
    this.pop = 1;
  }

  advance(distance) {
    let s = distance;
    while (s > 0 && !this.crashed) {
      const d = DIRS[this.dir];
      const nextOk = inGrid(this.i + d.dx, this.j + d.dz);
      const limit = nextOk ? CFG.spacing : OVERSHOOT;
      const rem = limit - this.t;
      if (s < rem) {
        this.t += s;
        this.dist += s;
        break;
      }
      this.t = limit;
      this.dist += rem;
      s -= rem;
      if (!nextOk) { this.crashed = true; break; }
      // Arrived at an intersection: apply the queued turn if the street exists.
      this.i += d.dx;
      this.j += d.dz;
      this.t = 0;
      this.trail.push({ x: nodeX(this.i), z: nodeZ(this.j), y: this.y, d: this.dist });
      if (this.pending) {
        const cand = (this.dir + (this.pending > 0 ? 1 : 3)) % 4;
        if (inGrid(this.i + DIRS[cand].dx, this.j + DIRS[cand].dz)) {
          this.dir = cand;
          this.turned = true;
        }
        this.pending = 0;
      }
    }
    this.updatePosition();
  }

  update(dt, speed) {
    this.turned = false;
    this.advance(speed * dt);

    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const u = this.jumpT / CFG.jumpDur;
      if (u >= 1) { this.jumpT = -1; this.y = 0; this.vy = 0; }
      else {
        this.y = CFG.jumpH * 4 * u * (1 - u);
        this.vy = (CFG.jumpH * 4 * (1 - 2 * u)) / CFG.jumpDur;
      }
    }

    this.trail.push({ x: this.x, z: this.z, y: this.y, d: this.dist });
    const keep = this.dist - this.len - 30;
    let drop = 0;
    while (drop < this.trail.length - 2 && this.trail[drop + 1].d < keep) drop++;
    if (drop > 64) this.trail.splice(0, drop);

    this.yaw += angleDiff(this.yaw, yawFor(this.dir)) * Math.min(1, dt * 14);
    this.pop = Math.max(0, this.pop - dt * 4);
    if (this.mixer) this.mixer.update(dt * (0.4 + speed / 12));

    this.headObject.position.set(this.x, this.y, this.z);
    this.headObject.rotation.y = this.yaw;
    this.headObject.rotation.x = Math.atan2(this.vy, speed) * 0.8; // nose up while rising
    this.headObject.scale.setScalar(1 + this.pop * 0.2);
    this.build();
  }

  // Point on the travelled path `back` metres behind the head. Cursor makes repeated calls cheap.
  pointBack(back, out = {}) {
    const target = this.dist - back;
    const tr = this.trail;
    let j = this._cursor === undefined ? tr.length - 1 : Math.min(this._cursor, tr.length - 1);
    if (j < tr.length - 1 && tr[j + 1].d <= target) j = tr.length - 1;
    while (j > 0 && tr[j].d > target) j--;
    this._cursor = j;
    const a = tr[j];
    const b = tr[Math.min(j + 1, tr.length - 1)];
    const span = b.d - a.d;
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (target - a.d) / span)) : 0;
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.y = a.y + (b.y - a.y) * k;
    return out;
  }

  build() {
    const rings = Math.max(4, Math.min(MAX_RINGS, Math.ceil(this.len / RING_STEP) + 1));
    const px = new Float32Array(rings);
    const pz = new Float32Array(rings);
    const py = new Float32Array(rings);
    this._cursor = undefined;
    const tmp = {};
    for (let k = 0; k < rings; k++) {
      this.pointBack(BODY_START + k * RING_STEP, tmp);
      px[k] = tmp.x; pz[k] = tmp.z; py[k] = tmp.y;
    }
    // Keep the start of the body attached to the head while it is in the air: lift the first
    // few metres by the head's height and let that fade out down the body.
    const lift = this.y - py[0];
    for (let k = 0; k < rings; k++) {
      const w = Math.max(0, 1 - (k * RING_STEP) / BODY_BLEND);
      py[k] += lift * w * w * (3 - 2 * w);
    }
    // Round the 90 degree corners of the road a little.
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 1; k < rings - 1; k++) {
        px[k] = (px[k - 1] + px[k] * 2 + px[k + 1]) / 4;
        pz[k] = (pz[k - 1] + pz[k] * 2 + pz[k + 1]) / 4;
      }
    }

    const R0 = CFG.bodyRadius;
    for (let k = 0; k < rings; k++) {
      const u = rings > 1 ? k / (rings - 1) : 0;
      const taper = Math.min(1, 0.12 + ((1 - u) / 0.3) * 0.88);
      const r = R0 * taper;
      const a = Math.max(0, k - 1);
      const b = Math.min(rings - 1, k + 1);
      let tx = px[a] - px[b];
      let tz = pz[a] - pz[b];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const rx = -tz; // horizontal vector perpendicular to the path
      const rz = tx;
      for (let s = 0; s <= SIDES; s++) {
        const ang = (s / SIDES) * Math.PI * 2;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const v = (k * (SIDES + 1) + s) * 3;
        const nx = rx * c;
        const ny = sn;
        const nz = rz * c;
        this.pos[v] = px[k] + nx * r;
        this.pos[v + 1] = py[k] + R0 * 0.9 + ny * r - (R0 - r) * 0.9;
        this.pos[v + 2] = pz[k] + nz * r;
        this.nor[v] = nx; this.nor[v + 1] = ny; this.nor[v + 2] = nz;
        const t = (k * (SIDES + 1) + s) * 2;
        this.uv[t] = s / SIDES;
        this.uv[t + 1] = (k * RING_STEP) / (R0 * 3.4);
      }
    }
    this.bodyGeo.setDrawRange(0, (rings - 1) * SIDES * 6);
    this.bodyGeo.attributes.position.needsUpdate = true;
    this.bodyGeo.attributes.normal.needsUpdate = true;
    this.bodyGeo.attributes.uv.needsUpdate = true;

    // Collision points along the tail (and for the minimap).
    this._cursor = undefined;
    this.points.length = 0;
    for (let d = COLLIDE_START; d <= BODY_START + this.len; d += CFG.segSpacing) {
      this.points.push(this.pointBack(d, {}));
      this.points[this.points.length - 1].back = d;
    }
  }

  headBox() {
    return { x: this.x, z: this.z, hw: 0.4, hd: 0.4, y0: this.y + 0.05, y1: this.y + 0.75 };
  }

  // True when the head runs into its own tail (jumping over it is fine).
  bitTail() {
    if (this.y > 0.6) return false;
    for (const p of this.points) {
      if (Math.hypot(p.x - this.x, p.z - this.z) < 0.55) return true;
    }
    return false;
  }

}
