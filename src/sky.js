import * as THREE from 'three';

// Soft sprite clouds drifting high above the town.
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RANGE = 360;
const rand = (a, b) => a + Math.random() * (b - a);

export function createClouds(scene, count = 22) {
  const tex = puffTexture();
  const clouds = [];
  for (let n = 0; n < count; n++) {
    const group = new THREE.Group();
    const size = rand(30, 55);
    const puffs = 6 + Math.floor(Math.random() * 5);
    for (let p = 0; p < puffs; p++) {
      const lower = Math.random();
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, fog: false,
        opacity: rand(0.7, 0.95), color: new THREE.Color().setHSL(0.6, 0.15, 0.78 + lower * 0.2),
      });
      const s = new THREE.Sprite(mat);
      s.scale.set(size * rand(0.7, 1.2), size * rand(0.45, 0.7), 1);
      s.position.set(rand(-1.1, 1.1) * size, (1 - lower) * size * 0.25, rand(-0.5, 0.5) * size);
      group.add(s);
    }
    group.position.set(rand(-RANGE, RANGE), rand(85, 130), rand(-RANGE, RANGE));
    group.userData.speed = rand(1.5, 4);
    scene.add(group);
    clouds.push(group);
  }
  return {
    update(dt) {
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > RANGE) c.position.x = -RANGE;
      }
    },
  };
}
