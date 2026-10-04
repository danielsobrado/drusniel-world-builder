const MOBILE_CONTROLS_ID = 'third-person-mobile-controls';
// The look surface sits above the canvas and below the existing HUD and
// Edit/Play switch, so those controls remain tappable during exploration.
const MOBILE_CONTROLS_Z = 2;

function applyCss(element, cssText) {
  element.style.cssText = cssText;
  return element;
}

export class MobileControls {
  constructor({ joystickRadius = 55, lookSensitivity = 0.015, onMove, onLook, onSprint, onRecenter, onAscend, onDescend, container = document.body }) {
    Object.assign(this, { container, onAscend, onDescend });
    this.joystickRadius = joystickRadius;
    this.lookSensitivity = lookSensitivity;
    this.onMove = onMove;
    this.onLook = onLook;
    this.onSprint = onSprint;
    this.onRecenter = onRecenter;
    this.moveTouchId = null;
    this.lookTouchId = null;
    this.moveCenterX = 0;
    this.moveCenterY = 0;
    this.lookLastX = 0;
    this.lookLastY = 0;
    this.#create();
  }

  #create() {
    document.getElementById(MOBILE_CONTROLS_ID)?.remove();

    this.root = applyCss(document.createElement('div'), `
      position: absolute;
      inset: 0;
      z-index: ${MOBILE_CONTROLS_Z};
      pointer-events: none;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `);
    this.root.id = MOBILE_CONTROLS_ID;

    this.moveBase = applyCss(document.createElement('div'), `
      position: absolute;
      left: 28px;
      bottom: 130px;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255,255,255,.12);
      border: 2px solid rgba(255,255,255,.28);
      box-sizing: border-box;
      pointer-events: auto;
      touch-action: none;
      backdrop-filter: blur(15px);
    `);
    this.moveStick = applyCss(document.createElement('div'), `
      position: absolute;
      left: 30px;
      top: 30px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(255,255,255,.28);
      border: 2px solid rgba(255,255,255,.45);
      box-sizing: border-box;
      pointer-events: none;
    `);
    this.moveBase.appendChild(this.moveStick);

    this.sprintButton = applyCss(document.createElement('button'), `
      position: absolute;
      right: 50px;
      bottom: 250px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,.25);
      background: rgba(255,255,255,.1);
      color: #B9E66F;
      font: 600 14px sans-serif;
      pointer-events: auto;
      touch-action: none;
      backdrop-filter: blur(15px);
    `);
    this.sprintButton.textContent = 'RUN';

    this.lookArea = applyCss(document.createElement('div'), `
      position: absolute;
      inset: 0;
      pointer-events: auto;
      touch-action: none;
      background: transparent;
    `);

    this.recenterButton = applyCss(document.createElement('button'), `
      position: absolute;
      right: 50px;
      bottom: 320px;
      min-width: 58px;
      min-height: 44px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.25);
      background: rgba(0,0,0,.3);
      color: white;
      font: 600 12px sans-serif;
      pointer-events: auto;
      touch-action: manipulation;
    `);
    this.recenterButton.textContent = 'CENTER';
    this.recenterButton.setAttribute('aria-label', 'Recenter camera behind player');
    this.recenterButton.addEventListener('click', () => this.onRecenter?.());
    this.root.append(this.lookArea, this.moveBase, this.sprintButton, this.recenterButton);
    this.container.appendChild(this.root);
    this.#verticalButton('JUMP / UP', 180, this.onAscend);
    this.#verticalButton('DIVE', 115, this.onDescend);
    this.#bind();
  }

  #verticalButton(label, bottom, callback) {
    const button = applyCss(document.createElement('button'), `position:absolute;right:50px;bottom:${bottom}px;
      min-width:58px;min-height:44px;border-radius:12px;pointer-events:auto;touch-action:none;
      background:rgba(0,0,0,.4);color:white;border:1px solid #ffffff66;`);
    button.textContent = label; button.setAttribute('aria-label', label);
    button.addEventListener('touchstart', event => { event.preventDefault(); callback?.(true); }, { passive:false });
    for (const type of ['touchend', 'touchcancel']) button.addEventListener(type, event => { event.preventDefault(); callback?.(false); }, { passive:false });
    this.root.append(button);
  }
  setVisible(visible) {
    if (this.root.hidden === !visible) return;
    this.root.hidden = !visible;
    if (!visible) {
      this.moveTouchId = null; this.lookTouchId = null; this.moveStick.style.transform = '';
      this.onMove?.(0, 0); this.onSprint?.(false); this.onAscend?.(false); this.onDescend?.(false);
    }
  }

  #bind() {
    this.moveBase.addEventListener('touchstart', (event) => this.#onMoveStart(event), { passive: false });
    this.moveBase.addEventListener('touchmove', (event) => this.#onMoveTouch(event), { passive: false });
    this.moveBase.addEventListener('touchend', (event) => this.#onMoveEnd(event), { passive: false });
    this.moveBase.addEventListener('touchcancel', (event) => this.#onMoveEnd(event), { passive: false });

    this.lookArea.addEventListener('touchstart', (event) => this.#onLookStart(event), { passive: false });
    this.lookArea.addEventListener('touchmove', (event) => this.#onLookMove(event), { passive: false });
    this.lookArea.addEventListener('touchend', (event) => this.#onLookEnd(event), { passive: false });
    this.lookArea.addEventListener('touchcancel', (event) => this.#onLookEnd(event), { passive: false });

    this.sprintButton.addEventListener('touchstart', (event) => {
      event.preventDefault();
      this.onSprint?.(true);
    }, { passive: false });
    this.sprintButton.addEventListener('touchend', (event) => {
      event.preventDefault();
      this.onSprint?.(false);
    }, { passive: false });
    this.sprintButton.addEventListener('touchcancel', (event) => {
      event.preventDefault();
      this.onSprint?.(false);
    }, { passive: false });
  }

  #getTouch(touches, id) {
    for (const touch of touches) {
      if (touch.identifier === id) return touch;
    }
    return null;
  }

  #onMoveStart(event) {
    event.preventDefault();
    if (this.moveTouchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const rect = this.moveBase.getBoundingClientRect();
    this.moveTouchId = touch.identifier;
    this.moveCenterX = rect.left + rect.width * 0.5;
    this.moveCenterY = rect.top + rect.height * 0.5;
    this.#updateMove(touch.clientX, touch.clientY);
  }

  #onMoveTouch(event) {
    event.preventDefault();
    if (this.moveTouchId === null) return;
    const touch = this.#getTouch(event.touches, this.moveTouchId);
    if (touch) this.#updateMove(touch.clientX, touch.clientY);
  }

  #onMoveEnd(event) {
    event.preventDefault();
    if (this.moveTouchId === null) return;
    const ended = this.#getTouch(event.changedTouches, this.moveTouchId);
    if (!ended) return;
    this.moveTouchId = null;
    this.moveStick.style.transform = 'translate(0px, 0px)';
    this.onMove?.(0, 0);
  }

  #updateMove(clientX, clientY) {
    const dx = clientX - this.moveCenterX;
    const dy = clientY - this.moveCenterY;
    const length = Math.hypot(dx, dy);
    const scale = length > this.joystickRadius ? this.joystickRadius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.moveStick.style.transform = `translate(${x}px, ${y}px)`;
    this.onMove?.(x / this.joystickRadius, y / this.joystickRadius);
  }

  #onLookStart(event) {
    event.preventDefault();
    if (this.lookTouchId !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    this.lookTouchId = touch.identifier;
    this.lookLastX = touch.clientX;
    this.lookLastY = touch.clientY;
  }

  #onLookMove(event) {
    event.preventDefault();
    if (this.lookTouchId === null) return;
    const touch = this.#getTouch(event.touches, this.lookTouchId);
    if (!touch) return;
    const dx = touch.clientX - this.lookLastX;
    const dy = touch.clientY - this.lookLastY;
    this.lookLastX = touch.clientX;
    this.lookLastY = touch.clientY;
    this.onLook?.(dx * this.lookSensitivity, dy * this.lookSensitivity);
  }

  #onLookEnd(event) {
    event.preventDefault();
    if (this.lookTouchId === null) return;
    const ended = this.#getTouch(event.changedTouches, this.lookTouchId);
    if (ended) this.lookTouchId = null;
  }

  destroy() {
    this.onMove?.(0, 0);
    this.onSprint?.(false);
    this.onAscend?.(false); this.onDescend?.(false);
    this.root?.remove();
  }
}
