// Keyboard + touch input. Handlers: left, right, jump, action (start/restart).
export function createInput({ left, right, jump, action }) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': left(); break;
      case 'ArrowRight': case 'KeyD': right(); break;
      case 'ArrowUp': case 'KeyW': jump(); break;
      case 'Space': e.preventDefault(); action(); jump(); break;
      case 'Enter': action(); break;
      default: return;
    }
  });

  let start = null;
  window.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? left() : right();
    else if (dy < -30) jump();
    else { action(); jump(); }
  });
}
