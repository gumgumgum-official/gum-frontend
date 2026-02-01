/**
 * Stage5: 난 너의 편 (따뜻한 햇살 광장, 포옹)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { STAGE5_CONFIG } from "../config/stages/stage5.js";

export function Stage5() {
  const objects = [];
  const config = STAGE5_CONFIG;

  return {
    camera: null,

    setup(scene) {
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
      this.camera.lookAt(
        config.camera.lookAt.x,
        config.camera.lookAt.y,
        config.camera.lookAt.z,
      );

      scene.background = new THREE.Color(config.background.color);

      console.log("✅ Stage5 생성 완료");
    },

    update(_delta) {
      // TODO: Raycasting 포옹, 폴라로이드 렌더링
    },

    cleanup(scene) {
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
      scene.background = null;
      console.log("🧹 Stage5 정리 완료");
    },
  };
}
