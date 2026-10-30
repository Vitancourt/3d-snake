// Keyboard + on-screen touch controls (joystick for lanes, button for jump).
// Handlers: left, right, jump, action (start/restart), pause.
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function createInput({ left, right, jump, action, pause }) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': left(); break;
      case 'ArrowRight': case 'KeyD': right(); break;
      case 'ArrowUp': case 'KeyW': jump(); break;
      case 'Space': e.preventDefault(); action(); jump(); break;
      case 'Enter': action(); break;
      case 'Escape': case 'KeyP': pause(); break;
      default: return;
    }
  });

  if (!isTouch) return;
  document.body.classList.add('touch');
  setupJoystick(left, right);
  const jumpBtn = document.getElementById('jump-btn');
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
  document.getElementById('pause-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); pause(); });
}

// Horizontal joystick: pushing past the dead zone steps a lane, holding repeats.
function setupJoystick(left, right) {
  const base = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  const RADIUS = 55;
  const DEAD = 0.35;
  const REPEAT_MS = 260;
  let active = null;
  let dir = 0;
  let timer = null;

  const fire = () => (dir < 0 ? left() : right());
  const setDir = (d) => {
    if (d === dir) return;
    dir = d;
    clearInterval(timer);
    if (dir) { fire(); timer = setInterval(fire, REPEAT_MS); }
  };
  const move = (e) => {
    const r = base.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / RADIUS);
    knob.style.transform = `translate(${(dx / len) * k * RADIUS}px, ${(dy / len) * k * RADIUS}px)`;
    const nx = dx / RADIUS;
    setDir(nx < -DEAD ? -1 : nx > DEAD ? 1 : 0);
  };
  const end = (e) => {
    if (active !== e.pointerId) return;
    active = null;
    knob.style.transform = '';
    setDir(0);
  };
  base.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    active = e.pointerId;
    base.setPointerCapture(e.pointerId);
    move(e);
  });
  base.addEventListener('pointermove', (e) => { if (active === e.pointerId) move(e); });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}
