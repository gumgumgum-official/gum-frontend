import * as THREE from "three";
import { STAGE1_CONFIG } from "../config/stages/stage1.js";

export function Stage1() {
  let objects = [];
  const config = STAGE1_CONFIG;

  return {
    camera: null,

    setup(scene) {
      // 1단계 카메라
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

      // 배경색
      scene.background = new THREE.Color(config.background.color);

      // 예시: 큐브
      const geometry = new THREE.BoxGeometry(
        config.cube.size.width,
        config.cube.size.height,
        config.cube.size.depth,
      );
      const material = new THREE.MeshStandardMaterial({
        color: config.cube.color,
      });
      const cube = new THREE.Mesh(geometry, material);
      objects.push(cube);
      scene.add(cube);

      console.log("✅ Stage1 생성 완료");
    },

    update(delta) {
      // 큐브 회전
      if (objects[0]) {
        objects[0].rotation.y += delta;
      }
    },

    cleanup(scene) {
      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      objects = [];
      console.log("🧹 Stage1 정리 완료");
    },
  };
}
