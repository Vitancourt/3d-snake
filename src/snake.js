import * as THREE from 'three';
import { CFG } from './config.js';

const BODY_COLORS = [0x2fb344, 0x249e3a];
const segGeo = new THREE.SphereGeometry(0.46, 14, 10);
const segMats = BODY_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));

function buildHead() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x39d353 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), skin);
  g.add(body);
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), white);
    eye.position.set(0.28 * s, 0.3, -0.35);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
    pupil.position.set(0.28 * s, 0.32, -0.5);
    g.add(eye, pupil);
  }
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.04, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xe5383b }),
  );
  tongue.position.set(0, -0.1, -0.75);
  g.add(tongue);
  return g;
}

export class Snake {
  constructor(scene) {
    this.scene = scene;
    this.head = buildHead();
    scene.add(this.head);
    this.segments = [];
    this.reset();
  }

  reset() {
    for (const s of this.segments) this.scene.remove(s);
    this.segments = [];
    this.slot = 0;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.dist = 0;
    this.jumpT = -1;
    this.pop = 0;
    // Pre-fill the trail so the starting segments have a path to sit on.
    this.trail = [];
    for (let k = 40; k >= 0; k--) this.trail.push({ x: 0, y: 0, z: k * 0.5, d: -k * 0.5 });
    for (let i = 0; i < CFG.startSegments; i++) this.grow();
    this.place();
  }

  get length() { return this.segments.length; }

  moveSlot(dir, isOpen) {
    const target = this.slot + dir;
    if (isOpen(target)) this.slot = target;
  }

  jump() {
    if (this.jumpT < 0) this.jumpT = 0;
  }

  grow() {
    const mesh = new THREE.Mesh(segGeo, segMats[this.segments.length % 2]);
    this.segments.push(mesh);
    this.scene.add(mesh);
    this.pop = 1;
  }

  // Drop segment `index` and everything behind it.
  truncate(index) {
    for (const s of this.segments.splice(index)) this.scene.remove(s);
  }

  update(dt, speed) {
    const px = this.x;
    const step = CFG.laneSwitchSpeed * dt;
    const goal = this.slot * CFG.laneW;
    this.x += Math.max(-step, Math.min(step, goal - this.x));
    this.z -= speed * dt;

    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const u = this.jumpT / CFG.jumpDur;
      if (u >= 1) { this.jumpT = -1; this.y = 0; }
      else this.y = CFG.jumpH * 4 * u * (1 - u);
    }

    this.dist += Math.hypot(speed * dt, this.x - px);
    this.trail.push({ x: this.x, y: this.y, z: this.z, d: this.dist });
    const keep = this.dist - (this.segments.length + 2) * CFG.segSpacing - 2;
    let drop = 0;
    while (drop < this.trail.length - 2 && this.trail[drop + 1].d < keep) drop++;
    if (drop > 32) this.trail.splice(0, drop);

    this.head.rotation.y = -((this.x - px) / Math.max(dt, 1e-4)) * 0.015;
    this.pop = Math.max(0, this.pop - dt * 4);
    this.place();
  }

  place() {
    this.head.position.set(this.x, this.y + 0.45, this.z);
    this.head.scale.setScalar(1 + this.pop * 0.25);

    let j = this.trail.length - 1;
    for (let i = 0; i < this.segments.length; i++) {
      const d = this.dist - (i + 1) * CFG.segSpacing;
      while (j > 0 && this.trail[j].d > d) j--;
      const a = this.trail[j];
      const b = this.trail[Math.min(j + 1, this.trail.length - 1)];
      const span = b.d - a.d;
      const t = span > 1e-6 ? Math.min(1, Math.max(0, (d - a.d) / span)) : 0;
      const seg = this.segments[i];
      seg.position.set(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t + 0.45,
        a.z + (b.z - a.z) * t,
      );
    }
  }

  headBox() {
    return { x: this.x, z: this.z, hw: 0.42, hd: 0.5, y0: this.y + 0.05, y1: this.y + 0.85 };
  }

  segBox(i) {
    const p = this.segments[i].position;
    return { x: p.x, z: p.z, hw: 0.38, hd: 0.38, y0: p.y - 0.4, y1: p.y + 0.4 };
  }
}
