import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Downloaded models (see public/models/CREDITS.md). Every getter returns null when a model
// failed to load, so callers fall back to the procedural versions.
const BASE = import.meta.env?.BASE_URL ?? './';
const CAR_COLORS = [0xb3121a, 0x1d4e9e, 0xf2f2f2, 0x111111, 0xe8a317, 0x2f7d4f, 0x6c6f78, 0xff5a1f];

const state = { ferrari: null, paints: [], lamp: null, barrier: null, buildings: [], snake: null };

const BUILDINGS = [
  ...'abcdefghijklmn'.split('').map((c) => `building-${c}`),
  ...'abcde'.split('').map((c) => `building-skyscraper-${c}`),
];
const FAR_BUILDINGS = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-e',
  'low-detail-building-f', 'low-detail-building-h', 'low-detail-building-l', 'low-detail-building-m'];

const LAMP_SCALE = 1.6; // wall-bracket lantern, mounted on a procedural pole
const BARRIER_SCALE = 1.4;

function prepareFerrari(gltf) {
  const car = gltf.scene;
  car.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name;
    o.castShadow = n === 'body' || n === 'tire' || n === 'wheel';
    o.receiveShadow = n === 'body';
    if (o.material?.name === 'Body_Color') o.userData.isPaint = true;
  });
  // Origin at the middle of the car; wheels already sit on y = 0 and the front points to -z.
  const wrapper = new THREE.Group();
  car.position.z = -0.17;
  wrapper.add(car);
  state.ferrari = wrapper;
  const base = car.getObjectByName('body').material;
  state.paints = CAR_COLORS.map((c) => {
    const m = base.clone();
    m.color.setHex(c);
    return m;
  });
}

function prepareProp(gltf, scale, castShadow) {
  const g = gltf.scene;
  g.scale.setScalar(scale);
  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = true; }
  });
  const wrapper = new THREE.Group();
  wrapper.add(g);
  return wrapper;
}

// Kenney buildings: re-centred so the footprint is at the origin and the base sits on y = 0.
function prepareBuilding(name, gltf, far) {
  const g = gltf.scene;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !far; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  g.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const wrapper = new THREE.Group();
  wrapper.add(g);
  state.buildings.push({ name, far, size, object: wrapper });
}

// Quaternius snake (CC0): skinned head+body with a slither animation. Used as the head of our snake.
const SNAKE_LENGTH = 2.4;
function prepareSnake(gltf) {
  const model = gltf.scene;
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find((a) => /walk/i.test(a.name)) || gltf.animations[0];
  if (clip) mixer.clipAction(clip).play();
  mixer.update(0.05);
  model.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3().setFromObject(model, true);
  const len = Math.max(bodyBox.max.x - bodyBox.min.x, bodyBox.max.y - bodyBox.min.y, bodyBox.max.z - bodyBox.min.z);
  model.scale.setScalar(SNAKE_LENGTH / len);
  model.updateMatrixWorld(true);

  // Find where the face points (head bone towards the tongue tip) and turn that towards -z.
  const head = model.getObjectByName('Head');
  const nose = model.getObjectByName('Tongue3_end') || model.getObjectByName('Head_end');
  const hp = head.getWorldPosition(new THREE.Vector3());
  const np = nose.getWorldPosition(new THREE.Vector3());
  const phi = Math.atan2(np.x - hp.x, np.z - hp.z);
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.y = Math.PI - phi;
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper, true);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -0.55 - box.min.z);
  const SKIN = { DarkGreen: 0x1f8a38, LightGreen: 0x62b95a };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (SKIN[m.name]) { m.color.setHex(SKIN[m.name]); m.roughness = 0.5; }
  });
  state.snake = { object: wrapper, mixer, length: SNAKE_LENGTH };
}

export async function loadModels() {
  const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const load = (path) => loader.loadAsync(`${BASE}models/${path}`);
  const results = await Promise.allSettled([
    load('ferrari.glb'),
    load('street_lamp_02/street_lamp_02.gltf'),
    load('concrete_road_barrier_02/concrete_road_barrier_02.gltf'),
  ]);
  const [car, lamp, barrier] = results;
  const names = [...BUILDINGS, ...FAR_BUILDINGS];
  const city = await Promise.allSettled(names.map((n) => load(`city/${n}.glb`)));
  city.forEach((r, k) => { if (r.status === 'fulfilled') prepareBuilding(names[k], r.value, k >= BUILDINGS.length); });
  const snake = await load('snake/snake.glb').catch((e) => { console.warn('snake model failed', e); return null; });
  if (snake) prepareSnake(snake);
  if (car.status === 'fulfilled') prepareFerrari(car.value);
  if (lamp.status === 'fulfilled') state.lamp = prepareProp(lamp.value, LAMP_SCALE, false);
  if (barrier.status === 'fulfilled') state.barrier = prepareProp(barrier.value, BARRIER_SCALE, true);
  results.forEach((r) => { if (r.status === 'rejected') console.warn('model failed to load', r.reason); });
  draco.dispose();
}

export function cloneFerrari() {
  if (!state.ferrari) return null;
  const car = state.ferrari.clone(true);
  const paint = state.paints[Math.floor(Math.random() * state.paints.length)];
  car.traverse((o) => { if (o.userData.isPaint) o.material = paint; });
  car.userData.wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => car.getObjectByName(n));
  return car;
}

export const cloneLamp = () => state.lamp?.clone(true) ?? null;
export const cloneBarrier = () => state.barrier?.clone(true) ?? null;

export const getSnakeModel = () => state.snake;
export const hasBuildings = () => state.buildings.length > 0;

// Random near building (or a far/low-detail one). Returns { object, size } with a fresh clone.
export function cloneBuilding(far = false) {
  const pool = state.buildings.filter((b) => b.far === far);
  if (!pool.length) return null;
  const b = pool[Math.floor(Math.random() * pool.length)];
  return { object: b.object.clone(true), size: b.size };
}
