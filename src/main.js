import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG } from './config.js';
import { Snake } from './snake.js';
import { Traffic } from './hazards.js';
import { World } from './world.js';
import { createInput } from './input.js';
import { ui } from './ui.js';

const HORIZON = 0xcfe3f2;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2;
skyCanvas.height = 256;
{
  const g = skyCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f7fd0');
  grad.addColorStop(0.55, '#8fbbe8');
  grad.addColorStop(1, '#cfe3f2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
}
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog(HORIZON, 80, 250);

// Image-based lighting gives cars and glass believable reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b6f78, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
const SUN_OFFSET = new THREE.Vector3(-35, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 180 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

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

let state = 'menu'; // menu | playing | paused | over
let score = 0;
let time = 0;
let overAt = 0;
const auto = new URLSearchParams(location.search).has('auto');
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
  if (state === 'playing' || state === 'paused') return;
  if (state === 'over' && performance.now() - overAt < 500) return;
  if (state === 'over') reset();
  state = 'playing';
  ui.hideOverlay();
}

function pause() {
  if (state === 'playing') {
    state = 'paused';
    ui.showPause();
  } else if (state === 'paused') {
    resume();
  }
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  ui.hidePause();
}

function restart() {
  ui.hidePause();
  reset();
  state = 'playing';
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
  pause,
});
document.getElementById('overlay').addEventListener('pointerup', start);
document.getElementById('resume-btn').addEventListener('click', resume);
document.getElementById('restart-btn').addEventListener('click', restart);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && !auto) pause(); });

// Debug autopilot (?auto): follows the guaranteed-clear lane and hops low obstacles.
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
  sun.position.copy(snake.head.position).add(SUN_OFFSET);
  sun.target.position.copy(snake.head.position);
}

let fpsFrames = 0;
let fpsSince = performance.now();
function countFps(now) {
  fpsFrames++;
  if (now - fpsSince >= 500) {
    ui.setFps(Math.round((fpsFrames * 1000) / (now - fpsSince)));
    fpsFrames = 0;
    fpsSince = now;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (state === 'playing') step(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  countFps(now);
  requestAnimationFrame(frame);
}

reset();
ui.setScore(0);
ui.showMenu();
if (auto) {
  state = 'playing';
  ui.hideOverlay();
  // ?auto&ff=N fast-forwards N seconds, handy for screenshots.
  const ff = Number(new URLSearchParams(location.search).get('ff')) || 0;
  for (let k = 0; k < ff * 60 && state === 'playing'; k++) { time += 1 / 60; step(1 / 60); }
}
window.__game = { snake, world, traffic, renderer, get state() { return state; } };
requestAnimationFrame(frame);
