/**
 * Stage2 전용: 섬 위를 돌아다니는 캐릭터 (ilbuni)
 * - animations[1] 재생
 * - 배경 섬 bounds 내에서 자유 이동
 */

import * as THREE from "three";

const DEFAULT_MODEL_PATH = "/models/stage2/ilbuni.glb";
const DEFAULT_ANIMATION_INDEX = 1;

/**
 * @param {Object} options
 * @param {string} [options.modelPath] - GLB 경로
 * @param {number} [options.animationIndex=1] - 재생할 애니메이션 인덱스
 * @param {number} [options.speed=30] - 이동 속도
 * @param {number} [options.changeTargetInterval=3] - 새 목표까지 이동 후 대기(초)
 * @param {number} [options.boundsPadding=0.8] - bounds 축소 비율 (0~1, 섬 가장자리 회피)
 * @param {number} [options.modelScale] - 모델 스케일 (미지정 시 섬 크기 기준 자동 계산)
 * @param {number} [options.groundLevel=0.85] - Y 위치 (0=바닥, 1=꼭대기, 섬 높이 비율)
 * @returns {{
 *   load: (loader: object, scene: THREE.Scene, bounds: THREE.Box3) => Promise<void>,
 *   update: (delta: number) => void,
 *   cleanup: (scene: THREE.Scene) => void
 * }}
 */
export function createRoamingCharacter(options = {}) {
  const {
    modelPath = DEFAULT_MODEL_PATH,
    animationIndex = DEFAULT_ANIMATION_INDEX,
    speed = 30,
    changeTargetInterval = 3,
    boundsPadding = 0.8,
    modelScale,
    groundLevel = 0.85,
  } = options;

  let sceneRef = null;
  let model = null;
  let mixer = null;
  let bounds = null;
  let target = new THREE.Vector3();
  let timeToNextTarget = 0;
  let isLoaded = false;

  function pickRandomTarget() {
    if (!bounds || !model) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const padX = (size.x * (1 - boundsPadding)) / 2;
    const padZ = (size.z * (1 - boundsPadding)) / 2;

    target.x = center.x + (Math.random() - 0.5) * 2 * padX;
    target.z = center.z + (Math.random() - 0.5) * 2 * padZ;
    target.y = model.position.y;
  }

  function load(loader, scene, islandBounds) {
    if (!islandBounds) {
      console.warn("[roamingCharacter] islandBounds가 없습니다.");
      return Promise.resolve();
    }

    bounds = islandBounds.clone();
    sceneRef = scene;

    return new Promise((resolve, reject) => {
      loader.load(
        modelPath,
        (gltf) => {
          if (!gltf.animations || gltf.animations.length <= animationIndex) {
            console.warn(
              `[roamingCharacter] animations[${animationIndex}] 없음. 사용 가능:`,
              gltf.animations?.length ?? 0,
            );
          }

          model = gltf.scene;
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const minDim = Math.min(size.x, size.y, size.z);

          const scale = modelScale ?? Math.max(minDim * 0.08, 80);
          model.scale.setScalar(scale);

          model.position.set(
            center.x,
            bounds.min.y + size.y * groundLevel,
            center.z,
          );
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          mixer = new THREE.AnimationMixer(model);
          const clip = gltf.animations[animationIndex];
          if (clip) {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }

          scene.add(model);
          pickRandomTarget();
          timeToNextTarget = changeTargetInterval;
          isLoaded = true;
          console.log(`✅ [roamingCharacter] 로드 완료: ${modelPath}`);
          resolve();
        },
        undefined,
        (err) => {
          console.error(`❌ [roamingCharacter] 로드 실패:`, err);
          reject(err);
        },
      );
    });
  }

  function update(delta) {
    if (!model || !bounds || !isLoaded) return;
    if (mixer) mixer.update(delta);

    timeToNextTarget -= delta;
    if (timeToNextTarget <= 0) {
      pickRandomTarget();
      timeToNextTarget = changeTargetInterval;
    }

    const dist = model.position.distanceTo(
      new THREE.Vector3(target.x, model.position.y, target.z),
    );

    const moveThreshold = (model?.scale?.x ?? 1) * 2;
    if (dist > moveThreshold) {
      const dir = new THREE.Vector3()
        .subVectors(target, model.position)
        .setY(0);
      if (dir.lengthSq() > 0.0001) {
        dir.normalize();
        const moveSpeed = speed * (model?.scale?.x ?? 1) * 0.5;
        model.position.x += dir.x * moveSpeed * delta;
        model.position.z += dir.z * moveSpeed * delta;
        const angle = Math.atan2(dir.x, dir.z);
        model.rotation.y = angle;
      }
    }

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const padX = (size.x * (1 - boundsPadding)) / 2;
    const padZ = (size.z * (1 - boundsPadding)) / 2;
    model.position.x = THREE.MathUtils.clamp(
      model.position.x,
      center.x - padX,
      center.x + padX,
    );
    model.position.z = THREE.MathUtils.clamp(
      model.position.z,
      center.z - padZ,
      center.z + padZ,
    );
  }

  function cleanup(scene) {
    if (model && scene) {
      scene.remove(model);
      model.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    model = null;
    mixer = null;
    bounds = null;
    sceneRef = null;
    isLoaded = false;
  }

  return { load, update, cleanup };
}
