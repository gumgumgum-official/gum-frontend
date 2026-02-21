/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { createKeyboardInput } from "../utils/common/keyboardInput.js";
import { loadStage3Background } from "../utils/stages/stage3/backgroundLoader.js";
import { createCharacterController } from "../utils/stages/stage3/characterController.js";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";

export function Stage3() {
  /** @type {import("../types.js").Stage3Config} */
  const config = STAGE3_CONFIG;
  const glbLoader = getGLBLoader();
  let debugControls = null;
  let backgroundModel = null;

  const keyboard = createKeyboardInput([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);

  let character = null;

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;

      character = createCharacterController({
        scene,
        glbLoader,
        config,
        getKeys: () => keyboard.keys,
      });

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

      keyboard.mount();

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [],
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
        },
      });

      loadStage3Background({
        scene,
        glbLoader,
        config,
        onReady: ({ model, center, backgroundMaxY, backgroundBounds }) => {
          backgroundModel = model;
          debugControls.setOrbitTarget(center);
          character.setup(backgroundMaxY, backgroundBounds);
        },
      });

      console.log("✅ Stage3 생성 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      if (character) character.update(delta, this.camera);
    },

    cleanup(scene) {
      keyboard.unmount();

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      if (character) {
        character.cleanup();
        character = null;
      }

      if (backgroundModel) {
        scene.remove(backgroundModel);
        backgroundModel.traverse((child) => {
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
        backgroundModel = null;
      }

      scene.background = null;
      console.log("🧹 Stage3 정리 완료");
    },
  };
}
