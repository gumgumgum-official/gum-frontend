/**
 * Stage6 배경: docs/loading-transition-prototype.html 의 START/로딩 화면과 동일한 밤하늘
 * — 별: createStars + @keyframes twinkle
 * — 세로 streak: .streak + @keyframes streakMove (로딩 화면 5개와 동일한 위치·딜레이·주기)
 */

import * as THREE from "three";

/** loading-screen 의 streak 인라인 스타일과 동일 */
const LOADING_STREAKS = [
  { leftPercent: 12, delaySec: 0, durationSec: 5.5 },
  { leftPercent: 28, delaySec: 1.4, durationSec: 4.2 },
  { leftPercent: 51, delaySec: 0.7, durationSec: 6.1 },
  { leftPercent: 73, delaySec: 2.1, durationSec: 4.8 },
  { leftPercent: 88, delaySec: 0.3, durationSec: 5.2 },
];

/**
 * @typedef {Object} Stage6NightSkyOptions
 * @property {number} [baseColor=0x080810] - body / #start-screen 과 동일 #080810
 * @property {number} [starCount=140] - createStars(count)
 * @property {number} [canvasWidth=1024]
 * @property {number} [canvasHeight=512]
 * @property {boolean} [streaksEnabled=true] - 프로토타입 로딩 화면 streak 5개
 */

/**
 * @param {Stage6NightSkyOptions} [options]
 * @returns {{
 *   texture: THREE.CanvasTexture,
 *   update: (deltaSec: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createStage6NightSkyBackground(options = {}) {
  const baseColor = options.baseColor ?? 0x080810;
  const starCount = Math.min(400, Math.max(32, options.starCount ?? 140));
  const streaksEnabled = options.streaksEnabled !== false;
  const W = options.canvasWidth ?? 1024;
  const H = options.canvasHeight ?? 512;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("[stage6NightSkyBackground] 2D context unavailable");
  }

  const br = (baseColor >> 16) & 255;
  const bg = (baseColor >> 8) & 255;
  const bb = baseColor & 255;

  /** CSS px 기준을 캔버스에 맞춤 (가로 ~1000px 가정과 동일 비율) */
  const px = W / 1000;

  /**
   * 프로토타입 createStars: size, position, delay 0~3s, duration 2~5s
   * twinkle: 0%,100% opacity 0.15 — 50% opacity 1 (ease, sin 근사)
   */
  /** @type {{ nx: number, ny: number, r: number, delaySec: number, periodSec: number, phase: number, baseOpacity: number }[]} */
  const stars = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      nx: Math.random(),
      ny: Math.random(),
      r: (Math.random() * 2.2 + 0.4) * px,
      delaySec: Math.random() * 3,
      periodSec: 2 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      baseOpacity: 0.1 + Math.random() * 0.5,
    });
  }

  let elapsed = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  /**
   * streakMove linear: 0% op0 tx-40px → 15~85% op1 → 100% op0 tx60px
   * @param {number} e
   * @param {number} delaySec
   * @param {number} durationSec
   */
  function streakState(e, delaySec, durationSec) {
    if (e < delaySec) {
      return { opacity: 0, txPx: -40 };
    }
    const u = e - delaySec;
    const cycleTime = ((u % durationSec) + durationSec) % durationSec;
    const t = cycleTime / durationSec;
    const opacity = t < 0.15 ? t / 0.15 : t <= 0.85 ? 1 : (1 - t) / 0.15;
    const txPx = -40 + 100 * t;
    return { opacity, txPx };
  }

  function redraw() {
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      let opacity;
      if (elapsed < s.delaySec) {
        opacity = s.baseOpacity;
      } else {
        const tStar = elapsed - s.delaySec;
        const wave =
          0.5 + 0.5 * Math.sin((tStar * (Math.PI * 2)) / s.periodSec + s.phase);
        opacity = 0.15 + 0.85 * wave;
      }
      const x = s.nx * W;
      const y = s.ny * H;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${opacity})`;
      ctx.fill();
    }

    if (streaksEnabled) {
      const streakW = Math.max(1, px);
      for (const st of LOADING_STREAKS) {
        const { opacity, txPx } = streakState(
          elapsed,
          st.delaySec,
          st.durationSec,
        );
        if (opacity <= 0) continue;

        const baseX = (st.leftPercent / 100) * W + txPx * px;
        const g = ctx.createLinearGradient(baseX, 0, baseX, H);
        g.addColorStop(0, "rgba(140,180,255,0)");
        g.addColorStop(0.5, `rgba(140,180,255,${0.12 * opacity})`);
        g.addColorStop(1, "rgba(140,180,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(baseX, 0, streakW, H);
      }
    }
  }

  redraw();

  function update(deltaSec) {
    elapsed += deltaSec;
    redraw();
    texture.needsUpdate = true;
  }

  function dispose() {
    texture.dispose();
  }

  return { texture, update, dispose };
}
