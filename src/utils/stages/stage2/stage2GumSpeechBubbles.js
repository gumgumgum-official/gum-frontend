import * as THREE from "three";

/**
 * Stage2 껌 캐릭터 머리 위 말풍선 (주기적으로 한 마리만, 살구색 스타일은 CSS)
 *
 * @param {{
 *   camera: import("three").Camera,
 *   renderer: import("three").WebGLRenderer,
 *   models: import("three").Object3D[],
 *   lines: readonly string[],
 *   options?: {
 *     minIntervalSec?: number,
 *     maxIntervalSec?: number,
 *     visibleSec?: number,
 *     bubbleOffsetY?: number,
 *   }
 * }} params
 * @returns {{ update: (delta: number) => void, cleanup: () => void }}
 */
export function createStage2GumSpeechBubbles({
  camera,
  renderer,
  models,
  lines,
  options = {},
}) {
  const {
    minIntervalSec = 5,
    maxIntervalSec = 6,
    visibleSec = 2.2,
    bubbleOffsetY = 0.85,
  } = options;

  const canvas = renderer.domElement;
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _projected = new THREE.Vector3();

  const bubbleEl = makeBubbleElement("stage2-gum-bubble-0");

  /** @type {{ model: import("three").Object3D, el: HTMLDivElement } | null} */
  let active = null;

  let untilNextSpawn =
    minIntervalSec +
    Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
  let hideRemaining = 0;

  function makeBubbleElement(id) {
    const el = document.createElement("div");
    el.className = "speech-bubble-stage2";
    el.id = id;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }

  function randomLine() {
    if (!lines.length) return "";
    return lines[Math.floor(Math.random() * lines.length)] ?? "";
  }

  /** 줄바꿈·연속 공백을 한 줄 공백으로 (말풍선은 CSS nowrap과 함께 사용) */
  function asSingleLine(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function hideBubble() {
    active = null;
    bubbleEl.classList.remove("is-visible");
    bubbleEl.textContent = "";
  }

  function projectModelToScreen(model, el) {
    _box.setFromObject(model);
    _box.getCenter(_projected);
    _box.getSize(_size);
    _projected.y += _size.y * bubbleOffsetY;
    _projected.project(camera);
    const rect = canvas.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    const x = rect.left + (_projected.x * 0.5 + 0.5) * rw;
    const y = rect.top + (-_projected.y * 0.5 + 0.5) * rh;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function spawn() {
    hideBubble();
    const m = models.filter(Boolean);
    if (m.length === 0 || lines.length === 0) return;

    const idx = Math.floor(Math.random() * m.length);
    const model = m[idx];
    active = { model, el: bubbleEl };
    bubbleEl.textContent = asSingleLine(randomLine());
    bubbleEl.classList.add("is-visible");
    hideRemaining = visibleSec;
  }

  return {
    update(delta) {
      if (!models.length || !lines.length) return;

      untilNextSpawn -= delta;
      if (untilNextSpawn <= 0) {
        spawn();
        untilNextSpawn =
          minIntervalSec +
          Math.random() * Math.max(0, maxIntervalSec - minIntervalSec);
      }

      if (hideRemaining > 0) {
        hideRemaining -= delta;
        if (hideRemaining <= 0) {
          hideBubble();
        }
      }

      if (active) {
        projectModelToScreen(active.model, active.el);
      }
    },

    cleanup() {
      hideBubble();
      if (bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl);
    },
  };
}
