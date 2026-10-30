const $ = (id) => document.getElementById(id);

let best = 0;
try { best = Number(localStorage.getItem('snake3d-best')) || 0; } catch { /* storage unavailable */ }

export const ui = {
  get best() { return best; },

  setScore(score) {
    $('score').textContent = `Score ${score}`;
    $('best').textContent = `Best ${best}`;
  },

  showMenu() {
    $('title').textContent = '3D SNAKE';
    $('subtitle').textContent = 'Town Runner';
    $('prompt').innerHTML = '<b>Press Space or tap to start</b>';
    $('overlay').classList.remove('hidden');
  },

  showGameOver(score) {
    if (score > best) {
      best = score;
      try { localStorage.setItem('snake3d-best', String(best)); } catch { /* ignore */ }
    }
    $('title').textContent = 'GAME OVER';
    $('subtitle').textContent = `Score ${score} · Best ${best}`;
    $('prompt').innerHTML = '<b>Press Space or tap to retry</b>';
    $('overlay').classList.remove('hidden');
    this.setScore(score);
  },

  showPause() { $('pause').classList.add('show'); },
  hidePause() { $('pause').classList.remove('show'); },
  setFps(fps) { $('fps').textContent = `${fps} FPS`; },

  hideOverlay() { $('overlay').classList.add('hidden'); },

  flash() {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = '0.5';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .35s';
      el.style.opacity = '0';
    });
  },
};
