/**
 * Stage3 카메라 타격/부서짐 흔들림
 */

const SHAKE_DECAY_SEC = 0.5;
const SHAKE_AMPLITUDE = 0.14;

/**
 * @param {import("three").PerspectiveCamera} camera
 * @param {number} shakeEndTimeSec performance.now()/1000 기준 종료 시각
 * @param {number} [nowSec] 기본값: performance.now()/1000
 */
export function applyStage3CameraShake(camera, shakeEndTimeSec, nowSec) {
  const t = nowSec ?? globalThis.performance.now() / 1000;
  if (t >= shakeEndTimeSec) return;
  const w = (shakeEndTimeSec - t) / SHAKE_DECAY_SEC;
  const a = SHAKE_AMPLITUDE * w;
  camera.position.x += (Math.random() - 0.5) * a;
  camera.position.y += (Math.random() - 0.5) * a * 0.55;
  camera.position.z += (Math.random() - 0.5) * a;
}

/**
 * @param {number} currentEndSec
 * @param {number} durationSec
 * @param {number} [nowSec]
 */
export function extendStage3CameraShakeEnd(currentEndSec, durationSec, nowSec) {
  const t = nowSec ?? globalThis.performance.now() / 1000;
  return Math.max(currentEndSec, t + durationSec);
}
