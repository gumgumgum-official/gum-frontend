/**
 * GLB/GLTF 모델 구조 확인 유틸리티
 * - 모델의 자식 객체, 메시, 애니메이션 정보를 콘솔에 출력
 */

import * as THREE from "three";

/**
 * 모델 구조를 콘솔에 출력합니다.
 * @param {THREE.Object3D|THREE.Group} model - 확인할 모델 (gltf.scene 또는 THREE.Object3D)
 * @param {Object} gltf - GLTF 객체 (애니메이션 정보 확인용, 선택사항)
 * @param {string} [label="모델"] - 콘솔 출력 시 사용할 레이블
 */
export function inspectModel(model, gltf = null, label = "모델") {
  if (!model) {
    console.warn(`⚠️ ${label}: 모델이 없습니다.`);
    return;
  }

  // 기본 정보
  const info = {
    children: model.children.length,
    childrenNames: model.children.map((child) => child.name || "unnamed"),
    meshes: [],
  };

  // 애니메이션 정보 (gltf가 제공된 경우)
  if (gltf && gltf.animations) {
    info.animations = gltf.animations.length;
    info.animationNames = gltf.animations.map((anim) => anim.name);
  }

  console.log(`📦 ${label} 구조:`, info);

  // 모든 메시 정보 출력
  let meshCount = 0;
  model.traverse((child) => {
    const mesh = /** @type {THREE.Mesh} */ (child);
    if (mesh.isMesh) {
      meshCount++;
      const meshInfo = {
        name: mesh.name || "unnamed",
        geometry: mesh.geometry?.type || "none",
        material: Array.isArray(mesh.material)
          ? `Array[${mesh.material.length}]`
          : mesh.material?.type || "none",
        position: `(${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`,
      };

      console.log(`  - Mesh #${meshCount}:`, meshInfo);
    }
  });

  if (meshCount === 0) {
    console.log(`  - 메시가 없습니다.`);
  }

  // 바운딩 박스 정보
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  console.log(`📐 ${label} 바운딩 박스:`, {
    min: `(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)})`,
    max: `(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`,
    size: `(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`,
    center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
  });
}

/**
 * GLTF 객체에서 모델 구조를 확인합니다.
 * @param {Object} gltf - GLTF 로더가 반환한 객체
 * @param {string} [label="모델"] - 콘솔 출력 시 사용할 레이블
 */
export function inspectGLTF(gltf, label = "모델") {
  if (!gltf || !gltf.scene) {
    console.warn(`⚠️ ${label}: GLTF 객체가 유효하지 않습니다.`);
    return;
  }

  inspectModel(gltf.scene, gltf, label);
}
