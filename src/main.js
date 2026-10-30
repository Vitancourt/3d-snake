import * as THREE from 'three';
import { CFG } from './config.js';
import { Snake } from './snake.js';
import { Traffic } from './hazards.js';
import { World } from './world.js';
import { createInput } from './input.js';
import { ui } from './ui.js';

const SKY = 0x9ec9ee;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 230);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
sun.position.set(-30, 60, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const snake = new Snake(scene);
const traffic = new Traffic(scene);
const world = new World(scene, traffic);

let state = 'menu'; // menu | playing | over
let score = 0;
let time = 0;
let overAt = 0;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

const speedNow = () => Math.min(CFG.maxSpeed, CFG.baseSpeed + CFG.speedPerFood * score);
const slotOpen = (slot) => world.slotsAt(snake.z).includes(slot);

function reset() {
  traffic.clear();
  world.reset();
  snake.reset();
  score = 0;
  ui.setScore(0);
  world.update(snake.z, speedNow());
  snapCamera();
}

function snapCamera() {
  camPos.set(snake.x * 0.6, 6.3, snake.z + 11);
  camLook.set(snake.x * 0.8, 0.8, snake.z - 10);
}

function start() {
  if (state === 'playing') return;
  if (state === 'over' && performance.now() - overAt < 500) return;
  if (state === 'over') reset();
  state = 'playing';
  ui.hideOverlay();
}

function die() {
  state = 'over';
  overAt = performance.now();
  ui.flash();
  ui.showGameOver(score);
}

createInput({
  left: () => state === 'playing' && snake.moveSlot(-1, slotOpen),
  right: () => state === 'playing' && snake.moveSlot(1, slotOpen),
  jump: () => state === 'playing' && snake.jump(),
  action: start,
});

// Debug autopilot (?auto): follows the guaranteed-clear lane and hops low obstacles.
const auto = new URLSearchParams(location.search).has('auto');
function autopilot() {
  const row = world.rows.filter((r) => r.z < snake.z + 8).sort((a, b) => b.z - a.z)[0];
  if (row && row.slot !== snake.slot && Math.abs(snake.x - snake.slot * CFG.laneW) < 0.2) {
    snake.moveSlot(Math.sign(row.slot - snake.slot), slotOpen);
  }
  const ahead = traffic.hazards.find(
    (h) => !h.vz && h.y1 < 1 && Math.abs(h.x - snake.x) < 1.2 && snake.z - h.z > 0 && snake.z - h.z < 0.18 * speedNow() + 1.5,
  );
  if (ahead) snake.jump();
}

function step(dt) {
  const speed = speedNow();
  if (auto) autopilot();
  snake.update(dt, speed);
  world.update(snake.z, speed);
  traffic.update(dt, time, snake.z, speed);

  const eaten = traffic.eat(snake.headBox());
  for (let k = 0; k < eaten; k++) { snake.grow(); score++; }
  if (eaten) ui.setScore(score);

  const hit = traffic.tailHit(snake);
  if (hit >= 0) { snake.truncate(hit); ui.flash(); }

  const b = world.roadBounds(snake.z);
  if (snake.x < b.min + 0.1 || snake.x > b.max - 0.1 || traffic.hitHead(snake.headBox())) die();
  traffic.cleanup(snake.z);
}

function updateCamera(dt) {
  const k = 1 - Math.exp(-6 * dt);
  camPos.x += (snake.x * 0.6 - camPos.x) * k;
  camPos.y = 6.3 + snake.y * 0.3;
  camPos.z = snake.z + 11;
  camLook.x += (snake.x * 0.8 - camLook.x) * k;
  camLook.z = snake.z - 10;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (state === 'playing') step(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

reset();
ui.setScore(0);
ui.showMenu();
if (auto) { state = 'playing'; ui.hideOverlay(); }
window.__game = { snake, world, traffic, renderer, get state() { return state; } };
requestAnimationFrame(frame);
