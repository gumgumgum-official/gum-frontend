/**
 * Stage6 카메라 디버그 오버레이 (왼쪽 상단, DEV 전용)
 * OrbitControls 켜기/끄기 토글 + 현재 시점 config 복사
 */

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * @param {Object} params
 * @param {import("three").PerspectiveCamera} params.camera
 * @param {HTMLCanvasElement} params.domElement
 * @param {{ camera: { position: {x,y,z}, lookAt: {x,y,z} } }} params.config
 */
export function createStage6CameraDebugOverlay({ camera, domElement, config }) {
  const orbitControls = new OrbitControls(camera, domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;

  // 초기 target: config lookAt
  const lookAt = config?.camera?.lookAt;
  if (lookAt) {
    orbitControls.target.set(lookAt.x, lookAt.y, lookAt.z);
  }
  orbitControls.update();

  // 시작은 비활성 (고정 카메라 상태 유지)
  orbitControls.enabled = false;

  // ── DOM 오버레이 ──────────────────────────────────────────
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: monospace;
    font-size: 11px;
    pointer-events: auto;
    user-select: none;
  `;

  const btnBase = `
    padding: 5px 10px;
    border-radius: 4px;
    background: rgba(0,0,0,0.7);
    color: #fff;
    cursor: pointer;
    font-family: monospace;
    font-size: 11px;
    text-align: left;
    white-space: nowrap;
  `;

  const toggleBtn = document.createElement("button");
  toggleBtn.style.cssText =
    btnBase + "border: 1px solid rgba(255,255,255,0.4);";

  const copyBtn = document.createElement("button");
  copyBtn.style.cssText = btnBase + "border: 1px solid rgba(255,255,255,0.25);";
  copyBtn.textContent = "📋 config 복사";

  const infoEl = document.createElement("div");
  infoEl.style.cssText = `
    padding: 4px 8px;
    background: rgba(0,0,0,0.55);
    border-radius: 4px;
    color: #aef;
    line-height: 1.6;
  `;

  el.appendChild(toggleBtn);
  el.appendChild(copyBtn);
  el.appendChild(infoEl);
  document.body.appendChild(el);

  // ── 헬퍼 ─────────────────────────────────────────────────
  function formatConfig() {
    const pos = camera.position;
    const t = orbitControls.target;
    return (
      `camera: {\n` +
      `  fov: ${camera.fov.toFixed(3)},\n` +
      `  near: ${camera.near},\n` +
      `  far: ${camera.far.toFixed(0)},\n` +
      `  position: { x: ${pos.x.toFixed(4)}, y: ${pos.y.toFixed(4)}, z: ${pos.z.toFixed(4)} },\n` +
      `  lookAt: { x: ${t.x.toFixed(4)}, y: ${t.y.toFixed(4)}, z: ${t.z.toFixed(4)} },\n` +
      `},`
    );
  }

  function refreshToggleBtn() {
    const on = orbitControls.enabled;
    toggleBtn.textContent = on
      ? "🔓 시점 변경 중 (클릭해서 고정)"
      : "🔒 시점 고정됨 (클릭해서 변경)";
    toggleBtn.style.borderColor = on
      ? "rgba(100,220,100,0.7)"
      : "rgba(255,255,255,0.4)";
  }

  function refreshInfo() {
    const pos = camera.position;
    const t = orbitControls.target;
    infoEl.innerHTML =
      `pos&nbsp;&nbsp;x:${pos.x.toFixed(2)} y:${pos.y.toFixed(2)} z:${pos.z.toFixed(2)}<br>` +
      `look x:${t.x.toFixed(2)} y:${t.y.toFixed(2)} z:${t.z.toFixed(2)}`;
  }

  // ── 이벤트 ───────────────────────────────────────────────
  toggleBtn.addEventListener("click", () => {
    orbitControls.enabled = !orbitControls.enabled;
    if (!orbitControls.enabled) {
      console.log("📷 [Stage6] 시점 고정 — config:");
      console.log(formatConfig());
    }
    refreshToggleBtn();
  });

  copyBtn.addEventListener("click", () => {
    const text = formatConfig();
    console.log("📷 [Stage6] 현재 카메라 config:");
    console.log(text);
    window.navigator.clipboard?.writeText(text).then(() => {
      copyBtn.textContent = "✅ 복사됨!";
      setTimeout(() => {
        copyBtn.textContent = "📋 config 복사";
      }, 1500);
    });
  });

  refreshToggleBtn();
  refreshInfo();

  // ── 공개 API ─────────────────────────────────────────────
  return {
    update() {
      if (orbitControls.enabled) orbitControls.update();
      refreshInfo();
      refreshToggleBtn();
    },
    dispose() {
      orbitControls.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
