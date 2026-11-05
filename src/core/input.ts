/**
 * Unified input handling for desktop (keyboard + pointer lock mouse) and
 * mobile (virtual joystick + drag-to-look + on-screen buttons).
 */

export interface InputState {
  moveForward: number;
  moveRight: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  mine: boolean;
  place: boolean;
}

export class Input {
  readonly state: InputState = {
    moveForward: 0,
    moveRight: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    sprint: false,
    crouch: false,
    mine: false,
    place: false,
  };

  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private touchMove = { x: 0, y: 0 };
  private touchLook = { x: 0, y: 0 };
  private touchMine = false;
  private touchPlace = false;
  private touchJump = false;
  private touchSprint = false;
  private pointerLocked = false;
  private enabled = true;
  /** Elements that should swallow key events (e.g. open menus). */
  private blocked = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    if (blocked) {
      this.keys.clear();
      this.state.mine = false;
      this.state.place = false;
      this.state.jump = false;
      this.state.sprint = false;
      this.state.crouch = false;
      this.touchMove = { x: 0, y: 0 };
      this.touchLook = { x: 0, y: 0 };
      this.touchMine = false;
      this.touchPlace = false;
      this.touchJump = false;
      this.touchSprint = false;
    }
  }

  requestPointerLock(): void {
    if (!this.pointerLocked && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    if (
      [
        'Space',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Tab',
        'KeyE',
        'KeyC',
        'KeyU',
        'KeyM',
        'F5',
      ].includes(e.code)
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) {
      this.mouseLeft = false;
      this.mouseRight = false;
      this.state.mine = false;
      this.state.place = false;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked || !this.enabled) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private mouseLeft = false;
  private mouseRight = false;

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled || this.blocked) return;
    if (!this.pointerLocked) return;
    if (e.button === 0) this.mouseLeft = true;
    if (e.button === 2) this.mouseRight = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseLeft = false;
    if (e.button === 2) this.mouseRight = false;
  };

  /* --- touch API used by the mobile control layer --- */
  setTouchMove(x: number, y: number): void {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  addTouchLook(dx: number, dy: number): void {
    this.touchLook.x += dx;
    this.touchLook.y += dy;
  }

  setTouchMine(v: boolean): void {
    this.touchMine = v;
  }

  setTouchPlace(v: boolean): void {
    this.touchPlace = v;
  }

  setTouchJump(v: boolean): void {
    this.touchJump = v;
  }

  setTouchSprint(v: boolean): void {
    this.touchSprint = v;
  }

  pressKey(code: string): void {
    this.keys.add(code);
  }

  releaseKey(code: string): void {
    this.keys.delete(code);
  }

  hasKey(code: string): boolean {
    return this.keys.has(code);
  }

  /** Called once per frame: folds raw events into the movement state. */
  update(): void {
    const s = this.state;
    if (this.blocked) {
      s.moveForward = 0;
      s.moveRight = 0;
      s.lookX = 0;
      s.lookY = 0;
      s.jump = false;
      s.sprint = false;
      s.crouch = false;
      s.mine = false;
      s.place = false;
      return;
    }

    let forward = 0;
    let right = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;

    forward += -this.touchMove.y;
    right += this.touchMove.x;

    const len = Math.hypot(forward, right);
    if (len > 1) {
      forward /= len;
      right /= len;
    }
    s.moveForward = forward;
    s.moveRight = right;

    s.lookX = this.mouseDX + this.touchLook.x;
    s.lookY = this.mouseDY + this.touchLook.y;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touchLook.x = 0;
    this.touchLook.y = 0;

    s.jump = this.keys.has('Space') || this.touchJump;
    s.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint;
    s.crouch = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    s.mine = this.mouseLeft || this.touchMine;
    s.place = this.mouseRight || this.touchPlace;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
