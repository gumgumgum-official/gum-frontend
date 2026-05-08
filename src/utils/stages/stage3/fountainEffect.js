/**
 * Stage3 분수대 물 효과: 셰이프 키 애니메이션 무한반복 + UV 스크롤
 *
 * GLB는 backgroundLoader가 이미 로드·씬 추가하므로 여기서는 로드하지 않는다.
 * setupFountainFromModel → 매 프레임 updateFountain → 언마운트 시 disposeFountain
 */
import * as THREE from "three";

/**
 * @typedef {{
 *   mixer: import("three").AnimationMixer | null,
 *   flowingTextures: Array<{ tex: import("three").Texture, flowSpeed: number }>,
 *   running: boolean,
 * }} FountainState
 */

/**
 * 이미 씬에 추가된 모델에서 분수 효과를 초기화한다.
 * @param {import("three").Object3D} model - backgroundLoader에서 받은 씬 루트
 * @param {import("three").AnimationClip[]} animations - gltf.animations
 * @returns {FountainState}
 */
export function setupFountainFromModel(model, animations) {
  /** @type {FountainState} */
  const state = { mixer: null, flowingTextures: [], running: true };

  if (animations.length > 0) {
    console.log(
      "[Stage3] island_scene clips:",
      animations.map((c) => c.name),
    );
    state.mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => {
      const action = state.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    });
    // morph target 메시 frustum culling 비활성화 (불꽃 등 morph 애니메이션이 카메라 밖에서 멈추는 현상 방지)
    model.traverse((obj) => {
      const mesh = /** @type {any} */ (obj);
      if (mesh.isMesh && mesh.morphTargetInfluences?.length > 0) {
        mesh.frustumCulled = false;
      }
    });
  }

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    const isCascade = obj.name.includes("Cascade");
    const isTopSpray = obj.name.includes("TopSpray");
    if (!isCascade && !isTopSpray) return;

    obj.material.transparent = true;
    obj.material.depthWrite = false;

    const tex = obj.material.map ?? obj.material.alphaMap;
    if (!tex) return;

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    state.flowingTextures.push({ tex, flowSpeed: isCascade ? 1.2 : 0.4 });
  });

  return state;
}

/**
 * 매 프레임 호출: 셰이프 키 애니메이션 진행 + UV Y 스크롤
 * @param {FountainState} state
 * @param {number} delta
 */
export function updateFountain(state, delta) {
  if (!state.running) return;
  if (state.mixer) state.mixer.update(delta);
  state.flowingTextures.forEach(({ tex, flowSpeed }) => {
    tex.offset.y = (tex.offset.y - flowSpeed * delta) % 1;
  });
}

/**
 * stg3 언마운트 시 호출: 믹서 정지 + 상태 초기화
 * geometry/material dispose는 backgroundModel cleanup이 담당하므로 여기선 하지 않는다.
 * @param {FountainState} state
 */
export function disposeFountain(state) {
  state.running = false;
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer = null;
  }
  state.flowingTextures.length = 0;
}
