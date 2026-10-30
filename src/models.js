import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Downloaded models (see public/models/CREDITS.md). Every getter returns null when a model
// failed to load, so callers fall back to the procedural versions.
const BASE = import.meta.env?.BASE_URL ?? './';
const CAR_COLORS = [0xb3121a, 0x1d4e9e, 0xf2f2f2, 0x111111, 0xe8a317, 0x2f7d4f, 0x6c6f78, 0xff5a1f];

const state = { ferrari: null, paints: [], lamp: null, barrier: null };

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
