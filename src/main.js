import * as THREE from "three";
import { createStageManager } from "./utils/StageManager";
import { Stage1 } from "./stages/Stage1";
import { Stage2 } from "./stages/Stage2";
import { APP_CONFIG } from "./config/appConfig.js";

// Canvas
const canvas = document.querySelector(APP_CONFIG.canvasSelector);

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: APP_CONFIG.renderer.antialias,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(APP_CONFIG.renderer.pixelRatio);

// 텍스처와 재질이 제대로 보이게 하는 핵심 설정
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Scene
const scene = new THREE.Scene();

// Lights (공통)
// 1. 하늘과 땅에서 오는 은은한 빛 (가장 중요!)
const hemiLight = new THREE.HemisphereLight(
  APP_CONFIG.lights.hemisphere.skyColor,
  APP_CONFIG.lights.hemisphere.groundColor,
  APP_CONFIG.lights.hemisphere.intensity,
);
scene.add(hemiLight);

// 2. 전체적인 기본 광량
const ambientLight = new THREE.AmbientLight(
  APP_CONFIG.lights.ambient.color,
  APP_CONFIG.lights.ambient.intensity,
);
scene.add(ambientLight);

// 3. 입체감을 주는 태양광
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

// Stage Manager 생성
const stageManager = createStageManager(renderer, scene);

// 단계 등록
stageManager.registerStage(1, Stage1());
stageManager.registerStage(2, Stage2());
// stageManager.registerStage(3, Stage3());
// ...

// 시작 단계
stageManager.switchToStage(APP_CONFIG.initialStage);

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  stageManager.update(delta);

  const camera = stageManager.getCurrentCamera();
  if (camera) {
    renderer.render(scene, camera);
  }
}

// Resize
window.addEventListener("resize", () => {
  const camera = stageManager.getCurrentCamera();
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 키보드로 단계 전환
window.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "6") {
    stageManager.switchToStage(parseInt(e.key));
  }
});

animate();
console.log("🎬 Gum World 시작!");
console.log("키보드 1~6: 단계 전환");
