// input.js — keyboard + mouse + pointer lock. Accumulates mouse deltas per frame
// and exposes the pressed-key set; the sim consumes it at a fixed step.
export function createInput(canvas, hooks) {
  const keys = new Set();
  let mouseDX = 0, mouseDY = 0;
  let attackHeld = false;
  let locked = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (hooks.onKey) hooks.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (hooks.onKey) hooks.onKey(e.code, false);
  }
  function onMouseMove(e) {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) attackHeld = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) attackHeld = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (hooks.onLock) hooks.onLock(locked);
  }
  function onWheel(e) {
    if (hooks.onWheel) hooks.onWheel(e.deltaY > 0 ? 1 : -1);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('wheel', onWheel);

  return {
    keys,
    get locked() { return locked; },
    get attackHeld() { return attackHeld; },
    consumeMouse() {
      const d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    requestLock() {
      try { canvas.requestPointerLock(); } catch (e) { /* headless: no lock */ }
    },
    exitLock() {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* noop */ }
    },
    // Test/debug: inject a synthetic key press without a real keyboard.
    press(code) { keys.add(code); if (hooks.onKey) hooks.onKey(code, true); },
    release(code) { keys.delete(code); if (hooks.onKey) hooks.onKey(code, false); },
    setAttack(v) { attackHeld = v; },
  };
}
