/**
 * Stage2: 배경 GLB + 오브제(GLB) 로드, 디버그 컨트롤로 카메라/오브제 조정
 * - 로드: assetLoaders (GLB)
 * - 입력/디버그: stageDebugControls (Orbit, Transform, Drag, C/G/S)
 */

import * as THREE from "three";
import { getGLBLoader } from "../utils/assetLoaders.js";
import { createStageDebugControls } from "../utils/stageDebugControls.js";
import { STAGE2_CONFIG } from "../config/stages/stage2.js";

export function Stage2() {
  const config = STAGE2_CONFIG;
  const glbLoader = getGLBLoader();

  const objects = [];
  const propRoots = [];
  let debugControls = null;

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;

      scene.fog = new THREE.Fog(
        config.fog.color,
        config.fog.near,
        config.fog.far,
      );
      scene.background = new THREE.Color(config.background.color);

      this.camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        10000,
      );
      this.camera.position.set(100, 50, 100);
      this.camera.lookAt(0, 0, 0);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => propRoots,
        getPropPath: (i) => config.props?.[i]?.path ?? "",
        options: {
          stageName: "stage2",
          getInitialCameraConfig: () => config.camera,
        },
      });

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          this.camera.position.set(
            center.x + maxDim * 1.5,
            center.y + maxDim * 0.8,
            center.z + maxDim * 1.5,
          );
          this.camera.far = Math.max(1000, maxDim * 10);
          this.camera.updateProjectionMatrix();
          debugControls.setOrbitTarget(center);

          model.traverse((child) => {
            if (child.isMesh) {
              if (child.material) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
              child.raycast = () => {}; // 배경은 클릭 제외
            }
          });

          objects.push(model);
          scene.add(model);

          // 오브제 로드
          if (config.props?.length) {
            loadPropsFromConfig(
              glbLoader,
              config.props,
              scene,
              objects,
              propRoots,
              () => {
                debugControls.setDraggableObjects(propRoots);
              },
            );
          }
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage2 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage2 배경 로드 에러:", err),
      });

      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);
      objects.push(axesHelper);

      console.log("✅ Stage2 setup 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
    },

    cleanup(scene) {
      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }
      propRoots.length = 0;

      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      objects.length = 0;
      scene.fog = null;
      scene.background = null;
      console.log("🧹 Stage2 정리 완료");
    },
  };
}

/**
 * config.props 배열 기준으로 GLB 로드 후 scene에 추가
 * @param {ReturnType<getGLBLoader>} loader
 * @param {Array<{ path: string, position?, rotation?, scale? }>} propsConfig
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} objects - dispose용
 * @param {THREE.Object3D[]} propRoots - 선택/드래그용
 * @param {() => void} onAllDone
 */
function loadPropsFromConfig(
  loader,
  propsConfig,
  scene,
  objects,
  propRoots,
  onAllDone,
) {
  let done = 0;
  const total = propsConfig.length;

  propsConfig.forEach((propConfig) => {
    loader.load(propConfig.path, {
      onLoad: (gltf) => {
        const root = gltf.scene;
        root.position.set(
          propConfig.position?.x ?? 0,
          propConfig.position?.y ?? 0,
          propConfig.position?.z ?? 0,
        );
        root.rotation.set(
          THREE.MathUtils.degToRad(propConfig.rotation?.x ?? 0),
          THREE.MathUtils.degToRad(propConfig.rotation?.y ?? 0),
          THREE.MathUtils.degToRad(propConfig.rotation?.z ?? 0),
        );
        root.scale.set(
          propConfig.scale?.x ?? 1,
          propConfig.scale?.y ?? 1,
          propConfig.scale?.z ?? 1,
        );
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(root);
        objects.push(root);
        propRoots.push(root);
        console.log(`✅ 오브제 로드: ${propConfig.path}`);
        done++;
        if (done === total) onAllDone();
      },
      onError: (err) => {
        console.error(`❌ 오브제 로드 실패: ${propConfig.path}`, err);
        done++;
        if (done === total) onAllDone();
      },
    });
  });
}
