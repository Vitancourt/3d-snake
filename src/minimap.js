import { CFG, N, HALF, nodeX, nodeZ } from './config.js';

const SIZE = 150;
const PAD = 8;
const scale = (SIZE - PAD * 2) / (2 * HALF);
const mx = (x) => PAD + (x + HALF) * scale;
const mz = (z) => PAD + (z + HALF) * scale;

export function createMinimap(canvas) {
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  return {
    draw(snake, traffic) {
      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = 'rgba(15,25,40,0.55)';
      g.fillRect(0, 0, SIZE, SIZE);
      g.strokeStyle = 'rgba(200,210,225,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k <= N; k++) {
        g.moveTo(mx(nodeX(k)), mz(-HALF)); g.lineTo(mx(nodeX(k)), mz(HALF));
        g.moveTo(mx(-HALF), mz(nodeZ(k))); g.lineTo(mx(HALF), mz(nodeZ(k)));
      }
      g.stroke();

      g.fillStyle = '#ff9f1c';
      for (const o of traffic.obstacles) g.fillRect(mx(o.x) - 1.5, mz(o.z) - 1.5, 3, 3);
      g.fillStyle = '#ff3b30';
      for (const a of traffic.apples) { g.beginPath(); g.arc(mx(a.x), mz(a.z), 3, 0, 6.3); g.fill(); }
      g.fillStyle = '#ffd60a';
      for (const c of traffic.cars) g.fillRect(mx(c.x) - 2.5, mz(c.z) - 2.5, 5, 5);

      g.strokeStyle = '#4cd964';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(mx(snake.x), mz(snake.z));
      for (let k = 0; k < snake.points.length; k += 3) g.lineTo(mx(snake.points[k].x), mz(snake.points[k].z));
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(mx(snake.x), mz(snake.z), 3.5, 0, 6.3);
      g.fill();
    },
  };
}
