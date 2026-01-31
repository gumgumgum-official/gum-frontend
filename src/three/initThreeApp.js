/**
 * Three.js 앱 초기화 (기존 main.js 로직)
 * canvas element에 렌더러/씬/Stage를 연결
 */

import * as THREE from "three";
import { createStageManager } from "../utils/StageManager.js";
import { Stage1 } from "../stages/Stage1.js";
import { Stage2 } from "../stages/Stage2.js";
import { Stage3 } from "../stages/Stage3.js";
import { Stage4 } from "../stages/Stage4.js";
import { Stage5 } from "../stages/Stage5.js";
import { Stage6 } from "../stages/Stage6.js";
import { APP_CONFIG } from "../config/appConfig.js";

const STAGE_FACTORIES = {
  1: Stage1,
  2: Stage2,
  3: Stage3,
  4: Stage4,
  5: Stage5,
  6: Stage6,
};

/**
 * Three.js 앱을 canvas에 초기화합니다.
 * @param {HTMLCanvasElement} canvasElement
 * @param {Object} options
 * @param {number[]} options.allowedStages - 허용 Stage 목록 (예: [1], [2], [3,4,5,6])
 * @param {number} options.initialStage - 시작 Stage
 * @param {boolean} [options.enableKeyboardSwitch=false] - 키보드 1~6 전환 활성화
 * @returns {{ dispose: function }} dispose()로 리소스 정리
 */
export function initThreeApp(canvasElement, options = {}) {
  const { allowedStages, initialStage, enableKeyboardSwitch = false } = options;

  if (!canvasElement) {
    console.warn("[initThreeApp] canvas element가 없습니다.");
    return { dispose: () => {} };
  }

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: APP_CONFIG.renderer.antialias,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(APP_CONFIG.renderer.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  const scene = new THREE.Scene();

  // Lights (공통)
  const hemiLight = new THREE.HemisphereLight(
    APP_CONFIG.lights.hemisphere.skyColor,
    APP_CONFIG.lights.hemisphere.groundColor,
    APP_CONFIG.lights.hemisphere.intensity,
  );
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(
    APP_CONFIG.lights.ambient.color,
    APP_CONFIG.lights.ambient.intensity,
  );
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(
    APP_CONFIG.lights.sun.color,
    APP_CONFIG.lights.sun.intensity,
  );
  sunLight.position.set(
    APP_CONFIG.lights.sun.position.x,
    APP_CONFIG.lights.sun.position.y,
    APP_CONFIG.lights.sun.position.z,
  );
  scene.add(sunLight);

  // Stage Manager
  const stageManager = createStageManager(renderer, scene);

  allowedStages.forEach((stageNum) => {
    const factory = STAGE_FACTORIES[stageNum];
    if (factory) {
      stageManager.registerStage(stageNum, factory());
    }
  });

  stageManager.switchToStage(initialStage);

  // Animation Loop
  const clock = new THREE.Clock();
  let animationId = null;

  function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    stageManager.update(delta);
    const camera = stageManager.getCurrentCamera();
    if (camera) {
      renderer.render(scene, camera);
    }
  }
  animate();

  // Resize
  function handleResize() {
    const camera = stageManager.getCurrentCamera();
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", handleResize);

  // Keyboard (개발용)
  let keydownHandler = null;
  if (enableKeyboardSwitch) {
    keydownHandler = (e) => {
      if (e.key >= "1" && e.key <= "6") {
        const num = parseInt(e.key);
        if (allowedStages.includes(num)) {
          stageManager.switchToStage(num);
        }
      }
    };
    window.addEventListener("keydown", keydownHandler);
  }

  return {
    dispose() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener("resize", handleResize);
      if (keydownHandler) {
        window.removeEventListener("keydown", keydownHandler);
      }
      const currentStage = stageManager.getCurrentStage();
      if (currentStage?.cleanup) {
        currentStage.cleanup(scene);
      }
      renderer.dispose();
    },
  };
}
