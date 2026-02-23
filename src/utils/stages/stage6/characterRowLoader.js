/**
 * Stage6 캐릭터 행 로더
 * user_walking2.glb를 1회 로드 후 SkeletonUtils로 복제하여 가로로 일렬 배치합니다.
 * 배경보다 앞쪽(z+)에 배치하여 가려지지 않도록 합니다.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const CHARACTER_GLB_PATH = "/models/common/user_walking2.glb";

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   placement: {
 *     groundY: number,
 *     centerX: number,
 *     centerZ: number,
 *     count?: number,
 *     spacing?: number,
 *   },
 *   onReady?: (instances: import("three").Object3D[]) => void,
 * }} params
 * @returns {{ cleanup: () => void, update: (delta: number) => void }}
 */
export function loadStage6CharacterRow({
  scene,
  glbLoader,
  placement,
  onReady,
}) {
  const { groundY, centerX, centerZ, count = 5, spacing = 1.2 } = placement;
  const instances = [];

  glbLoader.load(
    CHARACTER_GLB_PATH,
    (gltf) => {
      const source = gltf.scene;
      const box = new THREE.Box3().setFromObject(source);
      const minY = box.min.y;
      const yOffset = groundY - minY;

      for (let i = 0; i < count; i++) {
        const model = i === 0 ? source : SkeletonUtils.clone(source);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.renderOrder = 1; // 배경보다 나중에 렌더링
          }
        });

        const x = centerX + (i - (count - 1) / 2) * spacing;
        model.position.set(x, yOffset, centerZ);
        instances.push(model);
        scene.add(model);
      }

      if (gltf.animations?.length > 0) {
        instances.forEach((inst) => {
          const mixer = new THREE.AnimationMixer(inst);
          const action = mixer.clipAction(gltf.animations[0]);
          action.loop = THREE.LoopRepeat;
          action.play();
          inst.userData.mixer = mixer;
        });
      }

      console.log(
        `✅ Stage6 캐릭터 ${count}명 배치 완료 (x: ${centerX}, y: ${yOffset.toFixed(2)}, z: ${centerZ})`,
      );
      onReady?.(instances);
    },
    (xhr) => {
      if (xhr.total > 0) {
        console.log(
          `Stage6 캐릭터: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
        );
      }
    },
    (err) => console.error("❌ Stage6 캐릭터 로드 에러:", err),
  );

  return {
    cleanup() {
      instances.forEach((inst) => {
        scene.remove(inst);
        if (inst.userData.mixer) {
          inst.userData.mixer.stopAllAction();
        }
      });
      // geometry/material은 source와 clone이 공유하므로, source(첫 번째)에서만 dispose
      if (instances.length > 0) {
        instances[0].traverse((child) => {
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
      instances.length = 0;
    },
    update(delta) {
      instances.forEach((inst) => {
        if (inst.userData.mixer) {
          inst.userData.mixer.update(delta);
        }
      });
    },
  };
}
