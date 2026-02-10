/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";

export function Stage3() {
  const objects = [];
  const config = STAGE3_CONFIG;
  const glbLoader = getGLBLoader();
  let debugControls = null;
  let backgroundModelMaxY = 0; // 배경 모델의 최대 y값 저장
  let backgroundBounds = null; // 배경 모델의 바운딩 박스 저장
  let ilbuniModel = null; // ilbuni 모델 참조
  let ilbuniYPosition = 0; // ilbuni의 y 위치 저장

  // 키보드 입력 상태
  const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  };

  // 키보드 이벤트 핸들러
  const handleKeyDown = (event) => {
    if (event.key in keys) {
      keys[event.key] = true;
      event.preventDefault();
    }
  };

  const handleKeyUp = (event) => {
    if (event.key in keys) {
      keys[event.key] = false;
      event.preventDefault();
    }
  };

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;
      this.camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far,
      );
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z,
      );
      if (config.camera.lookAt) {
        this.camera.lookAt(
          config.camera.lookAt.x,
          config.camera.lookAt.y,
          config.camera.lookAt.z,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }

      scene.background = new THREE.Color(config.background.color);

      // 키보드 이벤트 리스너 등록
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [], // Stage3에는 props 없음
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
        },
      });

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;

          // 먼저 위치 설정
          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );

          // 변환 행렬 업데이트
          model.updateMatrixWorld(true);

          // 위치 적용 후 바운딩 박스 재계산
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());

          // 배경 모델의 바운딩 박스 저장 (캐릭터 이동 범위 제한용)
          backgroundBounds = box.clone();

          // 배경 모델의 최대 y값 계산 (위치 적용 후)
          // 모든 메시를 순회하여 실제 최대 y값 찾기
          let actualMaxY = box.max.y;
          model.traverse((child) => {
            if (child.isMesh && child.geometry) {
              const meshBox = new THREE.Box3().setFromObject(child);
              if (meshBox.max.y > actualMaxY) {
                actualMaxY = meshBox.max.y;
              }
            }
          });

          backgroundModelMaxY = actualMaxY;

          console.log(
            `📐 배경 모델 바운딩 박스: min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}), max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}), actualMaxY=${actualMaxY.toFixed(2)}, center=${center.y.toFixed(2)}`,
          );

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
              child.raycast = () => {}; // 배경은 클릭 제외
            }
          });

          objects.push(model);
          scene.add(model);
          debugControls.setOrbitTarget(center);
          console.log("✅ Stage3 배경 모델 로드 완료");

          // 배경 모델 로드 완료 후 ilbuni 로드
          glbLoader.load("/models/stage3/ilbuni.glb", {
            onLoad: (gltf) => {
              ilbuniModel = gltf.scene;

              // ilbuni 모델의 바운딩 박스 계산
              const ilbuniBox = new THREE.Box3().setFromObject(ilbuniModel);
              const ilbuniMinY = ilbuniBox.min.y;

              // 배경 모델 위에 서도록 y 위치 설정
              // ilbuni의 최하단(발)이 배경 모델의 최상단에 닿도록
              const offset = 0.2; // 여유 공간
              ilbuniYPosition = backgroundModelMaxY - ilbuniMinY + offset;

              ilbuniModel.position.set(0, ilbuniYPosition, 0);

              ilbuniModel.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });

              objects.push(ilbuniModel);
              scene.add(ilbuniModel);
              console.log(
                `✅ Stage3 ilbuni 모델 로드 완료 (y: ${ilbuniYPosition.toFixed(2)})`,
              );
            },
            onProgress: (xhr) => {
              if (xhr.total > 0) {
                console.log(
                  `Stage3 ilbuni: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
                );
              }
            },
            onError: (err) => console.error("❌ Stage3 ilbuni 로드 에러:", err),
          });
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage3 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage3 배경 로드 에러:", err),
      });

      console.log("✅ Stage3 생성 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);

      // ilbuni 캐릭터 이동 처리
      if (ilbuniModel) {
        const moveSpeed = 5.0; // 이동 속도
        const moveVector = new THREE.Vector3();

        // 방향키 입력에 따른 이동 벡터 계산
        if (keys.ArrowUp) moveVector.z -= 1;
        if (keys.ArrowDown) moveVector.z += 1;
        if (keys.ArrowLeft) moveVector.x -= 1;
        if (keys.ArrowRight) moveVector.x += 1;

        // 정규화하여 대각선 이동 시 속도 일정하게 유지
        if (moveVector.length() > 0) {
          moveVector.normalize();
          moveVector.multiplyScalar(moveSpeed * delta);

          // y 위치는 유지하고 x, z만 이동
          let newX = ilbuniModel.position.x + moveVector.x;
          let newZ = ilbuniModel.position.z + moveVector.z;

          // 배경 모델의 바운딩 박스 범위 내로 제한
          if (backgroundBounds) {
            // 캐릭터의 크기를 고려한 여유 공간 (선택사항)
            const padding = 0.5; // 캐릭터가 가장자리에 닿지 않도록 여유 공간

            newX = THREE.MathUtils.clamp(
              newX,
              backgroundBounds.min.x + padding,
              backgroundBounds.max.x - padding,
            );
            newZ = THREE.MathUtils.clamp(
              newZ,
              backgroundBounds.min.z + padding,
              backgroundBounds.max.z - padding,
            );
          }

          ilbuniModel.position.x = newX;
          ilbuniModel.position.z = newZ;
          ilbuniModel.position.y = ilbuniYPosition; // y 위치 고정

          // 이동 방향에 따라 캐릭터 회전
          if (moveVector.length() > 0.01) {
            const angle = Math.atan2(moveVector.x, moveVector.z);
            ilbuniModel.rotation.y = angle;
          }
        }

        // 카메라가 캐릭터를 따라가도록 설정
        const cameraOffset = new THREE.Vector3(0, 3, 8); // 카메라 오프셋 (뒤에서 위로)
        const targetPosition = ilbuniModel.position.clone().add(cameraOffset);

        // 부드러운 카메라 이동 (lerp)
        const lerpFactor = 0.1;
        this.camera.position.lerp(targetPosition, lerpFactor);

        // 카메라가 캐릭터를 바라보도록 설정
        const lookAtPosition = ilbuniModel.position.clone();
        lookAtPosition.y += 1; // 캐릭터 머리 높이
        this.camera.lookAt(lookAtPosition);
      }
    },

    cleanup(scene) {
      // 키보드 이벤트 리스너 제거
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      objects.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
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
      });
      objects.length = 0;
      scene.background = null;
      ilbuniModel = null;
      console.log("🧹 Stage3 정리 완료");
    },
  };
}
