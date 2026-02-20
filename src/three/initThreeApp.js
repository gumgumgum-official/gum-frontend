/**
 * Three.js 앱 초기화 (기존 main.js 로직)
 * canvas element에 렌더러/씬/Stage를 연결
 */

import * as THREE from "three";
import { createStageManager } from "../utils/common/StageManager.js";
import { createStageLoadingOverlay } from "../utils/common/StageLoadingOverlay.js";
import { Stage2 } from "../stages/Stage2.js";
import { Stage3 } from "../stages/Stage3.js";
import { Stage4 } from "../stages/Stage4.js";
import { Stage5 } from "../stages/Stage5.js";
import { Stage6 } from "../stages/Stage6.js";
import { APP_CONFIG } from "../config/appConfig.js";

/** Stage 1은 별도 프로젝트(태블릿)에서 구현 */
const STAGE_FACTORIES = {
  2: Stage2,
  3: Stage3,
  4: Stage4,
  5: Stage5,
  6: Stage6,
};

const noopDispose = () => {};

/**
 * Three.js 앱을 canvas에 초기화합니다.
 * @param {HTMLCanvasElement} canvasElement - Three.js가 렌더링할 canvas 요소
 * @param {import("../types.js").InitThreeAppOptions} [options]
 * @returns {import("../types.js").InitThreeAppReturn}
 */
export function initThreeApp(canvasElement, options = {}) {
  const {
    allowedStages = [],
    initialStage,
    enableKeyboardSwitch = false,
    onError,
  } = options;
  const safeAllowedStages = Array.isArray(allowedStages) ? allowedStages : [];

  const reportError = (userMessage, err) => {
    console.error(userMessage, err ?? "");
    onError?.(userMessage, err);
  };

  if (!canvasElement) {
    console.warn("[initThreeApp] canvas element가 없습니다.");
    return { dispose: noopDispose };
  }

  if (typeof canvasElement.getContext !== "function") {
    console.warn("[initThreeApp] 유효한 canvas element가 아닙니다.");
    return { dispose: noopDispose };
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: APP_CONFIG?.renderer?.antialias ?? true,
    });
  } catch (err) {
    reportError(
      "WebGL를 사용할 수 없습니다. 브라우저나 기기를 확인해 주세요.",
      err,
    );
    return { dispose: noopDispose };
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(APP_CONFIG?.renderer?.pixelRatio ?? 2);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  const scene = new THREE.Scene();

  // Lights (공통)
  const lights = APP_CONFIG?.lights ?? {};
  const hemi = lights.hemisphere ?? {};
  const amb = lights.ambient ?? {};
  const sun = lights.sun ?? {};

  const hemiLight = new THREE.HemisphereLight(
    hemi.skyColor ?? 0xffffff,
    hemi.groundColor ?? 0x888888,
    hemi.intensity ?? 1,
  );
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(
    amb.color ?? 0xffffff,
    amb.intensity ?? 0.4,
  );
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(
    sun.color ?? 0xffffff,
    sun.intensity ?? 1.2,
  );
  sunLight.position.set(
    sun.position?.x ?? 500,
    sun.position?.y ?? 1500,
    sun.position?.z ?? 500,
  );
  scene.add(sunLight);

  // Stage Manager
  const stageManager = createStageManager(renderer, scene);

  safeAllowedStages.forEach((stageNum) => {
    const factory = STAGE_FACTORIES[stageNum];
    if (factory) {
      try {
        stageManager.registerStage(stageNum, factory());
      } catch (err) {
        reportError(`Stage ${stageNum}을 불러오는 데 실패했습니다.`, err);
      }
    }
  });

  const safeInitialStage =
    safeAllowedStages.includes(initialStage) && typeof initialStage === "number"
      ? initialStage
      : safeAllowedStages[0];

  if (safeInitialStage != null) {
    try {
      stageManager.switchToStage(safeInitialStage);
    } catch (err) {
      reportError(
        `화면을 전환하는 데 실패했습니다. (Stage ${safeInitialStage})`,
        err,
      );
    }
  }

  // Animation Loop
  const clock = new THREE.Clock();
  let animationId = null;

  function animate() {
    animationId = requestAnimationFrame(animate);
    try {
      const delta = clock.getDelta();
      stageManager.update(delta);
      const camera = stageManager.getCurrentCamera();
      if (camera) {
        renderer.render(scene, camera);
      }
    } catch (err) {
      console.error("[initThreeApp] animate 오류:", err);
    }
  }
  animate();

  // Resize
  function handleResize() {
    try {
      const camera = stageManager.getCurrentCamera();
      if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }
      renderer.setSize(window.innerWidth, window.innerHeight);
    } catch (err) {
      console.error("[initThreeApp] resize 오류:", err);
    }
  }
  window.addEventListener("resize", handleResize);

  // Keyboard (개발용, Stage 2~6) — 전환 시 로딩 비디오 재생
  const loadingVideoSrc = APP_CONFIG?.stageTransition?.loadingVideoSrc;
  const stageLoadingOverlay =
    loadingVideoSrc != null
      ? createStageLoadingOverlay({ videoSrc: loadingVideoSrc })
      : null;

  let keydownHandler = null;
  if (enableKeyboardSwitch) {
    keydownHandler = (e) => {
      if (e.key >= "2" && e.key <= "6") {
        const num = parseInt(e.key);
        if (safeAllowedStages.includes(num)) {
          if (stageLoadingOverlay) stageLoadingOverlay.show();
          stageManager.switchToStage(num);
        }
      }
    };
    window.addEventListener("keydown", keydownHandler);
  }

  return {
    dispose() {
      try {
        stageLoadingOverlay?.hide();
      } catch (err) {
        console.error("[initThreeApp] loading overlay hide 오류:", err);
      }
      try {
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      } catch (err) {
        console.error("[initThreeApp] animation cancel 오류:", err);
      }
      try {
        window.removeEventListener("resize", handleResize);
      } catch (err) {
        console.error("[initThreeApp] resize listener 제거 오류:", err);
      }
      if (keydownHandler) {
        try {
          window.removeEventListener("keydown", keydownHandler);
        } catch (err) {
          console.error("[initThreeApp] keydown listener 제거 오류:", err);
        }
      }
      try {
        const currentStage = stageManager.getCurrentStage();
        if (currentStage?.cleanup) {
          currentStage.cleanup(scene);
        }
      } catch (err) {
        console.error("[initThreeApp] stage cleanup 오류:", err);
      }
      try {
        renderer?.dispose?.();
      } catch (err) {
        console.error("[initThreeApp] renderer dispose 오류:", err);
      }
    },
  };
}
