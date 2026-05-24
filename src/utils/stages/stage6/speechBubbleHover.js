import * as THREE from "three";
import { applyStage6AudioVolume } from "../../../config/stages/stage6/stage6Audio.js";

/**
 * Stage6 말풍선 호버 컴포넌트
 * 캐릭터 위에 마우스를 올리면 말풍선을 띄우고, 환호성 소리를 재생합니다.
 *
 * @param {{
 *   camera: import("three").Camera,
 *   renderer: import("three").WebGLRenderer,
 *   characterModels: Array<{ model: import("three").Object3D, message: string }>,
 *   options?: { cheerSoundPath?: string, bubbleOffsetY?: number }
 * }} params
 * @returns {{ cleanup: () => void }}
 */
export function createSpeechBubbleHover({
  camera,
  renderer,
  characterModels,
  options = {},
}) {
  const { cheerSoundPath, bubbleOffsetY = 0.7 } = options;

  let speechBubbleEl = null;
  let cheerAudio = null;
  let wasBubbleVisible = false;
  let onPointerMove = null;
  let onPointerLeave = null;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const _projected = new THREE.Vector3();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();

  if (cheerSoundPath) {
    cheerAudio = new window.Audio(cheerSoundPath);
    applyStage6AudioVolume(cheerAudio, 0.5);
  }

  speechBubbleEl = document.createElement("div");
  speechBubbleEl.className = "speech-bubble-stage2 speech-bubble-stage6-size";
  speechBubbleEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(speechBubbleEl);

  const canvas = renderer.domElement;

  onPointerMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    mouse.x = ((e.clientX - rect.left) / rw) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rh) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const targets = characterModels.map((c) => c.model);
    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      let entry = null;
      let current = hit;
      while (current) {
        entry = characterModels.find((c) => c.model === current);
        if (entry) break;
        current = current.parent;
      }
      if (entry) {
        _box.setFromObject(entry.model);
        _box.getCenter(_projected);
        _box.getSize(_size);
        _projected.y += _size.y * bubbleOffsetY;
        _projected.project(camera);
        const x = rect.left + (_projected.x * 0.5 + 0.5) * rw;
        const y = rect.top + (-_projected.y * 0.5 + 0.5) * rh;
        speechBubbleEl.textContent = entry.message;
        speechBubbleEl.style.left = `${x}px`;
        speechBubbleEl.style.top = `${y}px`;
        speechBubbleEl.classList.add("is-visible");
        if (!wasBubbleVisible && cheerAudio) {
          cheerAudio.currentTime = 0;
          cheerAudio.play().catch(() => {});
        }
        wasBubbleVisible = true;
      } else {
        speechBubbleEl.classList.remove("is-visible");
        wasBubbleVisible = false;
      }
    } else {
      speechBubbleEl.classList.remove("is-visible");
      wasBubbleVisible = false;
    }
  };

  onPointerLeave = () => {
    speechBubbleEl.classList.remove("is-visible");
    wasBubbleVisible = false;
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  return {
    cleanup() {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (speechBubbleEl?.parentNode) {
        speechBubbleEl.parentNode.removeChild(speechBubbleEl);
      }
      cheerAudio = null;
    },
  };
}
