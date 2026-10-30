import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, DIRS, N, inGrid, nodeX, nodeZ } from './config.js';
import { Snake } from './snake.js';
import { Traffic } from './traffic.js';
import { buildTown } from './town.js';
import { createClouds } from './sky.js';
import { createMinimap } from './minimap.js';
import { createInput } from './input.js';
import { ui } from './ui.js';
import { loadModels } from './models.js';

const HORIZON = 0xcfe3f2;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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

ui.setLoading();
await loadModels();

buildTown(scene);
const clouds = createClouds(scene);
const snake = new Snake(scene);
const traffic = new Traffic(scene);
const minimap = createMinimap(document.getElementById('minimap'));

let state = 'menu'; // menu | playing | paused | over
let score = 0;
let time = 0;
let overAt = 0;
const auto = new URLSearchParams(location.search).has('auto');
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

const speedNow = () => Math.min(CFG.maxSpeed, CFG.baseSpeed + CFG.speedPerApple * score);

function reset() {
  snake.reset();
  traffic.reset(snake);
  score = 0;
  ui.setScore(0);
  ui.setTurn(0);
  snapCamera();
}

const camBack = new THREE.Vector3();
function cameraTargets() {
  snake._cursor = undefined;
  const p = snake.pointBack(10);
  const d = DIRS[snake.dir];
  camBack.set(p.x, 5.6 + snake.y * 0.3, p.z);
  return {
    look: new THREE.Vector3(snake.x + d.dx * 6, 0.9, snake.z + d.dz * 6),
  };
}

function snapCamera() {
  const t = cameraTargets();
  camPos.copy(camBack);
  camLook.copy(t.look);
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

function die(reason) {
  state = 'over';
  overAt = performance.now();
  ui.flash();
  ui.showGameOver(score, reason);
  window.__result = { score, reason, length: snake.len };
}

createInput({
  left: () => state === 'playing' && queueTurn(-1),
  right: () => state === 'playing' && queueTurn(1),
  jump: () => state === 'playing' && snake.jump(),
  action: start,
  pause,
});
document.getElementById('overlay').addEventListener('pointerup', start);
document.getElementById('resume-btn').addEventListener('click', resume);
document.getElementById('restart-btn').addEventListener('click', restart);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && !auto) pause(); });

function queueTurn(side) {
  snake.turn(side);
  ui.setTurn(side);
}

// Debug autopilot (?auto): follows the guaranteed-clear lane and hops low obstacles.
let autoKey = '';
function autopilot() {
  // Decide once per street segment: head for the nearest apple, never into a dead end.
  const key = `${snake.i},${snake.j},${snake.dir}`;
  if (key !== autoKey && snake.t > CFG.spacing - 7) {
    autoKey = key;
    const d = DIRS[snake.dir];
    const ni = snake.i + d.dx;
    const nj = snake.j + d.dz;
    const apple = [...traffic.apples].sort(
      (a, b) => Math.hypot(a.x - snake.x, a.z - snake.z) - Math.hypot(b.x - snake.x, b.z - snake.z),
    )[0];
    const options = [0, -1, 1].map((turn) => {
      const nd = (snake.dir + (turn > 0 ? 1 : turn < 0 ? 3 : 0)) % 4;
      const fi = ni + DIRS[nd].dx * 2;
      const fj = nj + DIRS[nd].dz * 2;
      const ok = inGrid(ni + DIRS[nd].dx, nj + DIRS[nd].dz) && inGrid(ni, nj);
      const score = apple ? Math.hypot(nodeX(fi) - apple.x, nodeZ(fj) - apple.z) : Math.random();
      return { turn, ok, score: score + (turn ? 0 : -3) };
    }).filter((o) => o.ok).sort((a, b) => a.score - b.score);
    if (options.length) snake.turn(options[0].turn);
  }
  const d = DIRS[snake.dir];
  const v = speedNow();
  const blocked = [...traffic.cars, ...traffic.obstacles].some((h) => {
    const fx = (h.x - snake.x) * d.dx + (h.z - snake.z) * d.dz;
    const side = Math.abs((h.x - snake.x) * d.dz - (h.z - snake.z) * d.dx);
    const reach = h.isCar === undefined && !h.dir ? 0.2 * v + 1.4 : 2.3 + 0.2 * (v + CFG.carSpeed) + 0.5;
    return fx > 0 && fx < reach && side < 1.4 && h.y1 < 1.8;
  });
  if (blocked) snake.jump();
}

function step(dt) {
  const speed = speedNow();
  if (auto) autopilot();
  snake.update(dt, speed);
  traffic.update(dt, time, snake);
  if (snake.turned) ui.setTurn(0);

  const eaten = traffic.eat(snake.headBox(), snake);
  for (let k = 0; k < eaten; k++) { snake.grow(); score++; }
  if (eaten) ui.setScore(score);

  if (snake.crashed) die('You hit the wall');
  else if (traffic.hitHead(snake.headBox())) die('You crashed');
  else if (snake.bitTail()) die('You bit your own tail');
}

function updateCamera(dt) {
  const t = cameraTargets();
  const k = 1 - Math.exp(-7 * dt);
  camPos.lerp(camBack, k);
  camLook.lerp(t.look, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.position.set(snake.x, 0, snake.z).add(SUN_OFFSET);
  sun.target.position.set(snake.x, 0, snake.z);
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
  clouds.update(dt);
  updateCamera(dt);
  minimap.draw(snake, traffic);
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
  let steps = 0;
  for (; steps < ff * 60 && state === 'playing'; steps++) { time += 1 / 60; step(1 / 60); }
  snapCamera();
  document.title = JSON.stringify({ state, score, seconds: Math.round(steps / 60), len: snake.len, result: window.__result || null });
}
window.__game = { snake, traffic, renderer, get state() { return state; } };
requestAnimationFrame(frame);
