/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";

export function Stage3() {
  const objects = [];
  const config = STAGE3_CONFIG;

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

      console.log("✅ Stage3 생성 완료");
    },

    update(_delta) {
      // TODO: Cannon-es 파편화, 꽃 연출
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
      console.log("🧹 Stage3 정리 완료");
    },
  };
}
