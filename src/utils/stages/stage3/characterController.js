/**
 * Stage3 캐릭터 컨트롤러
 * GLB 로드, AnimationMixer 설정, 이동/회전/바운드 클램핑, 카메라 추적을 담당합니다.
 */
import * as THREE from "three";
import { inspectGLTF } from "../../common/modelInspector.js";

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getKeys: () => Record<string, boolean>,
 * }} params
 * @returns {{
 *   setup: (backgroundMaxY: number, backgroundBounds: import("three").Box3) => void,
 *   update: (delta: number, camera: import("three").Camera) => void,
 *   cleanup: () => void,
 * }}
 */
export function createCharacterController({
  scene,
  glbLoader,
  config,
  getKeys,
}) {
  let characterModel = null;
  let characterYPosition = 0;
  let characterMixer = null;
  let characterWalkAction = null;
  let isWalking = false;
  let backgroundBounds = null;

  return {
    setup(backgroundMaxY, bounds) {
      backgroundBounds = bounds;

      glbLoader.load("/models/stage3/user_walking2.glb", {
        onLoad: (gltf) => {
          characterModel = gltf.scene;

          const characterBox = new THREE.Box3().setFromObject(characterModel);
          const characterMinY = characterBox.min.y;

          const { groundOffset } = config.character;
          characterYPosition = backgroundMaxY - characterMinY + groundOffset;
          characterModel.position.set(0, characterYPosition, 0);

          characterModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          if (gltf.animations && gltf.animations.length > 0) {
            characterMixer = new THREE.AnimationMixer(characterModel);
            characterWalkAction = characterMixer.clipAction(gltf.animations[0]);
            characterWalkAction.loop = THREE.LoopRepeat;
            characterWalkAction.play();
            characterWalkAction.paused = true;
            console.log(
              `🎬 애니메이션 클립 수: ${gltf.animations.length}, 첫 번째 클립: "${gltf.animations[0].name}"`,
            );
          } else {
            console.warn("⚠️ user_walking2.glb에 애니메이션 클립이 없습니다.");
          }

          scene.add(characterModel);
          console.log(
            `✅ Stage3 캐릭터 모델 로드 완료 (y: ${characterYPosition.toFixed(2)})`,
          );
          inspectGLTF(gltf, "캐릭터 모델");
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage3 캐릭터: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage3 캐릭터 로드 에러:", err),
      });
    },

    update(delta, camera) {
      if (!characterModel || !backgroundBounds) return;

      const {
        moveSpeed,
        boundsPadding,
        cameraOffset: camOffset,
        cameraLerpFactor,
        lookAtHeightOffset,
      } = config.character;

      const keys = getKeys();
      const moveVector = new THREE.Vector3();

      if (keys.ArrowUp) moveVector.z -= 1;
      if (keys.ArrowDown) moveVector.z += 1;
      if (keys.ArrowLeft) moveVector.x -= 1;
      if (keys.ArrowRight) moveVector.x += 1;

      const moving = moveVector.length() > 0;

      if (characterWalkAction) {
        if (moving && !isWalking) {
          characterWalkAction.paused = false;
          isWalking = true;
        } else if (!moving && isWalking) {
          characterWalkAction.paused = true;
          isWalking = false;
        }
      }

      if (moving) {
        moveVector.normalize();
        moveVector.multiplyScalar(moveSpeed * delta);

        let newX = characterModel.position.x + moveVector.x;
        let newZ = characterModel.position.z + moveVector.z;

        newX = THREE.MathUtils.clamp(
          newX,
          backgroundBounds.min.x + boundsPadding,
          backgroundBounds.max.x - boundsPadding,
        );
        newZ = THREE.MathUtils.clamp(
          newZ,
          backgroundBounds.min.z + boundsPadding,
          backgroundBounds.max.z - boundsPadding,
        );

        characterModel.position.x = newX;
        characterModel.position.z = newZ;
        characterModel.position.y = characterYPosition;

        if (moveVector.length() > 0.01) {
          const angle = Math.atan2(moveVector.x, moveVector.z);
          characterModel.rotation.y = angle;
        }
      }

      if (characterMixer) {
        characterMixer.update(delta);
      }

      // 카메라가 캐릭터를 따라가도록 설정
      const cameraOffset = new THREE.Vector3(
        camOffset.x,
        camOffset.y,
        camOffset.z,
      );
      const targetPosition = characterModel.position.clone().add(cameraOffset);
      camera.position.lerp(targetPosition, cameraLerpFactor);

      const lookAtPosition = characterModel.position.clone();
      lookAtPosition.y += lookAtHeightOffset;
      camera.lookAt(lookAtPosition);
    },

    cleanup() {
      if (characterModel) {
        scene.remove(characterModel);
        characterModel.traverse((child) => {
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
        characterModel = null;
      }
      if (characterMixer) {
        characterMixer.stopAllAction();
        characterMixer = null;
      }
      characterWalkAction = null;
      isWalking = false;
      backgroundBounds = null;
    },
  };
}
