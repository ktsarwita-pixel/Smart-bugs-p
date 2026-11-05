import type { Input } from '../core/input';
import type { Game } from '../game/game';

/**
 * Mobile controls: a floating movement stick on the left and action buttons on
 * the right. Everything is drawn with DOM so it scales on any screen.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private joystick: HTMLElement;
  private knob: HTMLElement;
  private stickPointer = -1;
  private stickOrigin = { x: 0, y: 0 };

  constructor(
    private readonly game: Game,
    private readonly input: Input,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch-layer hidden';
    this.root.innerHTML = `
      <div class="joystick">
        <div class="knob"></div>
      </div>
      <button class="touch-btn round btn-jump" data-btn="jump">▲</button>
      <button class="touch-btn round btn-mine" data-btn="mine">⛏</button>
      <button class="touch-btn small-round btn-place" data-btn="place">▣</button>
      <button class="touch-btn small-round btn-sprint" data-btn="sprint">»</button>
      <button class="touch-btn small-round btn-menu" data-btn="menu">☰</button>
      <button class="touch-btn small-round btn-look" data-btn="look">◉</button>
    `;

    this.joystick = this.root.querySelector('.joystick') as HTMLElement;
    this.knob = this.root.querySelector('.knob') as HTMLElement;

    this.setupJoystick();
    this.setupButtons();
  }

  setEnabled(enabled: boolean): void {
    this.root.classList.toggle('hidden', !enabled);
    if (!enabled) this.input.setTouchMove(0, 0);
  }

  private setupJoystick(): void {
    const onDown = (e: PointerEvent): void => {
      if (this.stickPointer !== -1) return;
      this.stickPointer = e.pointerId;
      const rect = this.joystick.getBoundingClientRect();
      this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      try {
        this.joystick.setPointerCapture(e.pointerId);
      } catch {
        /* not every browser implements pointer capture */
      }
      this.updateStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointer) return;
      this.updateStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = -1;
      this.input.setTouchMove(0, 0);
      this.knob.style.transform = '';
    };
    this.joystick.addEventListener('pointerdown', onDown);
    this.joystick.addEventListener('pointermove', onMove);
    this.joystick.addEventListener('pointerup', onUp);
    this.joystick.addEventListener('pointercancel', onUp);
  }

  private updateStick(clientX: number, clientY: number): void {
    const dx = clientX - this.stickOrigin.x;
    const dy = clientY - this.stickOrigin.y;
    const radius = 52;
    const len = Math.hypot(dx, dy);
    const clamped = len > radius ? (dx / len) * radius : dx;
    const clampedY = len > radius ? (dy / len) * radius : dy;
    this.knob.style.transform = `translate(${clamped}px, ${clampedY}px)`;
    this.input.setTouchMove(clamped / radius, clampedY / radius);
  }

  private setupButtons(): void {
    const config: Record<string, { onDown: () => void; onUp: () => void }> = {
      jump: {
        onDown: () => this.input.setTouchJump(true),
        onUp: () => this.input.setTouchJump(false),
      },
      mine: {
        onDown: () => this.input.setTouchMine(true),
        onUp: () => this.input.setTouchMine(false),
      },
      place: {
        onDown: () => this.input.setTouchPlace(true),
        onUp: () => this.input.setTouchPlace(false),
      },
      sprint: {
        onDown: () => this.input.setTouchSprint(true),
        onUp: () => this.input.setTouchSprint(false),
      },
      menu: {
        onDown: () => this.game.togglePause(),
        onUp: () => undefined,
      },
      look: {
        onDown: () => this.game.toggleViewMode(),
        onUp: () => undefined,
      },
    };

    this.root.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
      const name = el.dataset.btn ?? '';
      const cfg = config[name];
      if (!cfg) return;
      const down = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        cfg.onDown();
      };
      const up = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('pressed');
        cfg.onUp();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    });
  }
}
