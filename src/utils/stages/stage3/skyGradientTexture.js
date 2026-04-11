import * as THREE from "three";

/**
 * @param {number} hex
 * @returns {string}
 */
function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

/**
 * @typedef {Object} Stage3SkyGradientStop
 * @property {number} t - 0(화면 위) ~ 1(화면 아래)
 * @property {number} color - 0xRRGGBB
 */

/**
 * @typedef {Object} Stage3SkyGradientConfig
 * @property {number} [top] - stops 없을 때만 사용
 * @property {number} [bottom]
 * @property {Stage3SkyGradientStop[]} [stops] - 있으면 top/bottom 대신 사용 (t 오름차순 권장)
 */

/**
 * 뷰포트 전체 배경용 수직 그라데이션 텍스처 (위 → 아래).
 * `stops`로 위쪽 하늘 띠에 주황 톤을 올리고, 아래로 핑크/라벤더를 깔 수 있다.
 *
 * @param {Stage3SkyGradientConfig} gradient
 * @returns {THREE.CanvasTexture}
 */
export function createSkyGradientTexture(gradient) {
  const canvas = document.createElement("canvas");
  const w = 2;
  const h = 256;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("createSkyGradientTexture: 2d context unavailable");
  }

  /** @type {Stage3SkyGradientStop[]} */
  let stops;
  if (gradient.stops?.length) {
    stops = [...gradient.stops].sort((a, b) => a.t - b.t);
  } else if (gradient.top != null && gradient.bottom != null) {
    stops = [
      { t: 0, color: gradient.top },
      { t: 1, color: gradient.bottom },
    ];
  } else {
    throw new Error(
      "createSkyGradientTexture: `stops` 또는 `top`+`bottom` 필요",
    );
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const s of stops) {
    grad.addColorStop(s.t, hexToCss(s.color));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
