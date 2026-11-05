import './styles/main.css';
import { Game } from './game/game';

const container = document.getElementById('app') as HTMLElement;
const game = new Game(container);

void game.boot().catch((error) => {
  console.error(error);
  const status = document.getElementById('loading-status');
  if (status) {
    status.textContent = 'Failed to start — check the browser console.';
    status.style.color = '#e2584d';
  }
});

// Keep the orientation hint in sync on small screens.
const nudge = document.getElementById('orientation-nudge');
const checkOrientation = (): void => {
  if (!nudge) return;
  const small = window.innerWidth < 720 && window.innerHeight > window.innerWidth;
  nudge.hidden = !small;
};
window.addEventListener('resize', checkOrientation);
checkOrientation();

// Resume audio after the first interaction (browsers require a gesture).
const resumeAudio = (): void => {
  game.audio.start();
  game.audio.resume();
  window.removeEventListener('pointerdown', resumeAudio);
  window.removeEventListener('keydown', resumeAudio);
};
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);
