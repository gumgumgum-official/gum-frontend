/**
 * Stage3 GPU-ready gate + reveal gate.
 *
 * GPU-ready: resolves after renderer.compileAsync + hidden render finishes.
 *   StartPage waits on this before allowing navigation to /kiosk.
 *
 * Reveal: fires when /kiosk route becomes active (canvas becomes visible).
 *   Stage3 defers keyboard input, monitor calls, intro audio/camera to this event.
 */

let _gpuReady = false;
const _gpuReadyCallbacks = [];

let _revealed = false;
const _revealCallbacks = [];

export function notifyStage3GpuReady() {
  if (_gpuReady) return;
  _gpuReady = true;
  const cbs = _gpuReadyCallbacks.splice(0);
  cbs.forEach((cb) => cb());
}

export function waitForStage3GpuReady() {
  if (_gpuReady) return Promise.resolve();
  return new Promise((resolve) => {
    _gpuReadyCallbacks.push(resolve);
  });
}

export function isStage3Revealed() {
  return _revealed;
}

export function requestStage3Reveal() {
  if (_revealed) return;
  _revealed = true;
  const cbs = _revealCallbacks.splice(0);
  cbs.forEach((cb) => cb());
}

/**
 * @param {() => void} cb - called immediately if already revealed, else queued
 */
export function onceStage3Revealed(cb) {
  if (_revealed) {
    cb();
    return;
  }
  _revealCallbacks.push(cb);
}

export function resetStage3RevealGate() {
  _gpuReady = false;
  _gpuReadyCallbacks.length = 0;
  _revealed = false;
  _revealCallbacks.length = 0;
}

/** 소프트 리셋 후 `/kiosk` 재진입 시 reveal·begin 이 다시 동작하도록 (GPU ready 는 유지) */
export function resetStage3RevealForNextKioskEntry() {
  _revealed = false;
}
