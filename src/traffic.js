import * as THREE from 'three';
import { CFG, N, HALF, DIRS, nodeX, nodeZ } from './config.js';
import { overlap } from './collision.js';
import { buildCar, buildCone, buildBarrier, buildApple, STATIC_TYPES } from './props.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CAR_HALF_LEN = 2.3;
const CAR_HALF_WIDTH = 0.95;

function shadowed(root) {
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return root;
}

// Cars, obstacles and apples. Everything lives on the street grid: a "line" is one street,
// running along x (axis 'x', row j) or along z (axis 'z', column i).
export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.obstacles = [];
    this.apples = [];
    this.timer = 0;
  }

  clear() {
    for (const o of [...this.cars, ...this.obstacles, ...this.apples]) this.scene.remove(o.mesh);
    this.cars = [];
    this.obstacles = [];
    this.apples = [];
    this.timer = 0;
  }

  reset(snake) {
    this.clear();
    this.placeObstacles(snake);
    for (let k = 0; k < CFG.appleCount; k++) this.spawnApple(snake);
    for (let k = 0; k < 3; k++) this.spawnCar(snake);
  }

  // ---- obstacles -------------------------------------------------------------------------
  placeObstacles(snake) {
    let guard = 0;
    while (this.obstacles.length < CFG.obstacleCount && guard++ < 200) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = Math.floor(Math.random() * (N + 1));
      const seg = Math.floor(Math.random() * N);
      const along = (axis === 'x' ? nodeX(seg) : nodeZ(seg)) + rand(4, CFG.spacing - 4);
      const x = axis === 'x' ? along : nodeX(line);
      const z = axis === 'x' ? nodeZ(line) : along;
      if (Math.hypot(x - snake.x, z - snake.z) < 35) continue;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) continue;
      const type = pick(['cone', 'barrier', 'barrier']);
      const def = STATIC_TYPES[type];
      const mesh = shadowed(def.build());
      mesh.position.set(x, 0, z);
      mesh.rotation.y = axis === 'x' ? Math.PI / 2 : 0;
      this.scene.add(mesh);
      const hw = axis === 'x' ? def.hd : def.hw;
      const hd = axis === 'x' ? def.hw : def.hd;
      this.obstacles.push({ mesh, x, z, hw, hd, y0: 0, y1: def.h });
    }
  }

  // ---- apples ----------------------------------------------------------------------------
  spawnApple(snake) {
    for (let guard = 0; guard < 80; guard++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = Math.floor(Math.random() * (N + 1));
      const seg = Math.floor(Math.random() * N);
      const along = (axis === 'x' ? nodeX(seg) : nodeZ(seg)) + rand(3, CFG.spacing - 3);
      const x = axis === 'x' ? along : nodeX(line);
      const z = axis === 'x' ? nodeZ(line) : along;
      if (Math.hypot(x - snake.x, z - snake.z) < 12) continue;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
      if (this.apples.some((a) => Math.hypot(a.x - x, a.z - z) < 6)) continue;
      if (snake.points.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5)) continue;
      const mesh = shadowed(buildApple());
      mesh.position.set(x, 0.95, z);
      this.scene.add(mesh);
      this.apples.push({ mesh, x, z, hw: 0.6, hd: 0.6, y0: 0.2, y1: 1.7, phase: Math.random() * 6 });
      return;
    }
  }

  // ---- cars ------------------------------------------------------------------------------
  // Cars drive end to end along a street and always come toward the snake when they share its street.
  spawnCar(snake) {
    const sd = DIRS[snake.dir];
    const snakeAxis = sd.dx ? 'x' : 'z';
    const sign = sd.dx || sd.dz; // snake travel direction along its axis
    let axis, line, dir;
    if (Math.random() < 0.6) {
      axis = snakeAxis;
      line = snakeAxis === 'x' ? snake.j : snake.i;
      dir = -sign; // toward the snake
    } else {
      axis = Math.random() < 0.5 ? 'x' : 'z';
      line = Math.floor(Math.random() * (N + 1));
      dir = Math.random() < 0.5 ? -1 : 1;
      if (axis === snakeAxis && line === (snakeAxis === 'x' ? snake.j : snake.i) && dir === sign) dir = -sign;
    }
    const start = -dir * (HALF - 2); // enter at the end the car is driving away from
    const x = axis === 'x' ? start : nodeX(line);
    const z = axis === 'x' ? nodeZ(line) : start;
    if (Math.hypot(x - snake.x, z - snake.z) < 30) return;
    if (this.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) return;

    const holder = new THREE.Group();
    const car = shadowed(buildCar());
    holder.add(car);
    const vx = axis === 'x' ? dir : 0;
    const vz = axis === 'z' ? dir : 0;
    holder.rotation.y = Math.atan2(vx, vz);
    holder.position.set(x, 0, z);
    this.scene.add(holder);
    this.cars.push({
      mesh: holder, wheels: car.userData.wheels, axis, line, dir, x, z, spin: 0,
      hw: axis === 'x' ? CAR_HALF_LEN : CAR_HALF_WIDTH,
      hd: axis === 'x' ? CAR_HALF_WIDTH : CAR_HALF_LEN,
      y0: 0, y1: 1.15,
    });
  }

  // When the snake turns onto a street, cars ahead of it driving the same way would be rear-ended.
  clearAhead(snake) {
    const sd = DIRS[snake.dir];
    const axis = sd.dx ? 'x' : 'z';
    const sign = sd.dx || sd.dz;
    const line = axis === 'x' ? snake.j : snake.i;
    this.cars = this.cars.filter((c) => {
      const same = c.axis === axis && c.line === line && c.dir === sign;
      const ahead = (axis === 'x' ? c.x - snake.x : c.z - snake.z) * sign > -3;
      if (same && ahead) { this.scene.remove(c.mesh); return false; }
      return true;
    });
  }

  update(dt, time, snake) {
    if (snake.turned) this.clearAhead(snake);

    this.timer += dt;
    if (this.timer >= CFG.carSpawnEvery) {
      this.timer = 0;
      if (this.cars.length < CFG.maxCars) this.spawnCar(snake);
    }

    this.cars = this.cars.filter((c) => {
      const step = CFG.carSpeed * dt * c.dir;
      if (c.axis === 'x') c.x += step; else c.z += step;
      const along = c.axis === 'x' ? c.x : c.z;
      if (Math.abs(along) > HALF - 1.5 && along * c.dir > 0) {
        this.scene.remove(c.mesh);
        return false;
      }
      c.mesh.position.set(c.x, 0, c.z);
      if (c.wheels) {
        c.spin += (CFG.carSpeed * dt) / 0.36;
        for (const w of c.wheels) w.rotation.x = -Math.PI / 2 + c.spin;
      }
      return true;
    });

    for (const a of this.apples) {
      a.mesh.rotation.y += dt * 2.5;
      a.mesh.position.y = 0.95 + Math.sin(time * 3 + a.phase) * 0.12;
    }
  }

  hitHead(box) {
    return this.cars.find((c) => overlap(box, c)) || this.obstacles.find((o) => overlap(box, o)) || null;
  }

  // Returns the number of apples eaten (each is replaced elsewhere).
  eat(box, snake) {
    let n = 0;
    this.apples = this.apples.filter((a) => {
      if (overlap(box, a)) { this.scene.remove(a.mesh); n++; return false; }
      return true;
    });
    for (let k = 0; k < n; k++) this.spawnApple(snake);
    return n;
  }
}
