/**
 * Stage4: 털어버리자 (콘서트장/파티장, Confetti)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { STAGE4_CONFIG } from "../config/stages/stage4.js";

export function Stage4() {
  const objects = [];
  const config = STAGE4_CONFIG;

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

      console.log("✅ Stage4 생성 완료");
    },

    update(_delta) {
      // TODO: Confetti 파티클, 캐릭터 댄스
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
      console.log("🧹 Stage4 정리 완료");
    },
  };
}
