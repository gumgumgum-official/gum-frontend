/**
 * Stage3 분수대 물 효과
 *
 * - v6 GLB (Cascade/TopSpray/Pool): 셰이프 키 + UV 스크롤
 * - island15 OBJ_Fountain: fountainProceduralFx 바깥 물커튼
 */
import * as THREE from "three";
import {
  FOUNTAIN_MESH_NAME_RE,
  createProceduralFountainFx,
  updateProceduralFountainFx,
  disposeProceduralFountainFx,
} from "./fountainProceduralFx.js";

/** 분수 셰이프 키·물 애니만 재생 (캐릭터 Animation 클립 제외) */
const FOUNTAIN_CLIP_NAME_RE =
  /fountain|pool|cascade|topspray|water|ripple|spray/i;

/**
 * @typedef {import("./fountainProceduralFx.js").ProceduralFountainFx} ProceduralFountainFx
 */

/**
 * @typedef {{
 *   mixer: import("three").AnimationMixer | null,
 *   flowingTextures: Array<{ tex: import("three").Texture, flowSpeed: number }>,
 *   procedural: ProceduralFountainFx | null,
 *   running: boolean,
 * }} FountainState
 */

/**
 * @param {import("three").Object3D} model
 * @returns {import("three").Mesh | null}
 */
function findFountainMesh(model) {
  /** @type {import("three").Mesh | null} */
  let found = null;
  model.traverse((obj) => {
    const mesh = /** @type {import("three").Mesh} */ (obj);
    if (found || !mesh.isMesh) return;
    const name = typeof mesh.name === "string" ? mesh.name.trim() : "";
    if (FOUNTAIN_MESH_NAME_RE.test(name)) found = mesh;
  });
  return found;
}

/**
 * @param {import("three").Object3D} model
 * @param {import("three").AnimationClip[]} animations
 * @returns {boolean}
 */
function setupLegacyFountainMeshes(model, animations, state) {
  let hasFlowMeshes = false;

  model.traverse((obj) => {
    const mesh = /** @type {import("three").Mesh} */ (obj);
    if (!mesh.isMesh || !mesh.material) return;

    const isCascade = mesh.name.includes("Cascade");
    const isTopSpray = mesh.name.includes("TopSpray");
    if (!isCascade && !isTopSpray) return;

    hasFlowMeshes = true;
    const rawMat = mesh.material;
    const mat = /** @type {import("three").MeshStandardMaterial} */ (
      Array.isArray(rawMat) ? rawMat[0] : rawMat
    );
    mat.transparent = true;
    mat.depthWrite = false;
    const tex = mat.map ?? mat.alphaMap;
    if (!tex) return;

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    state.flowingTextures.push({ tex, flowSpeed: isCascade ? 1.2 : 0.4 });
  });

  if (!hasFlowMeshes) return false;

  const fountainClips = animations.filter((c) =>
    FOUNTAIN_CLIP_NAME_RE.test(c.name),
  );
  const clipsToPlay = fountainClips.length > 0 ? fountainClips : animations;

  if (clipsToPlay.length > 0) {
    state.mixer = new THREE.AnimationMixer(model);
    clipsToPlay.forEach((clip) => {
      const action = state.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    });
    model.traverse((obj) => {
      const mesh = /** @type {any} */ (obj);
      if (mesh.isMesh && mesh.morphTargetInfluences?.length > 0) {
        mesh.frustumCulled = false;
      }
    });
  }

  return true;
}

/**
 * @param {import("three").Object3D} model
 * @param {import("three").AnimationClip[]} animations
 * @returns {FountainState}
 */
export function setupFountainFromModel(model, animations) {
  /** @type {FountainState} */
  const state = {
    mixer: null,
    flowingTextures: [],
    procedural: null,
    running: true,
  };

  const hasLegacy = setupLegacyFountainMeshes(model, animations, state);

  if (!hasLegacy) {
    const fountainMesh = findFountainMesh(model);
    if (fountainMesh) {
      state.procedural = createProceduralFountainFx(fountainMesh, model);
    } else if (import.meta.env.DEV) {
      console.warn("[Stage3] OBJ_Fountain 메시를 찾지 못했습니다.");
    }
  }

  return state;
}

/**
 * @param {FountainState} state
 * @param {number} delta
 */
export function updateFountain(state, delta) {
  if (!state.running) return;
  if (state.mixer) state.mixer.update(delta);
  if (state.procedural) {
    updateProceduralFountainFx(state.procedural, delta);
  } else {
    state.flowingTextures.forEach(({ tex, flowSpeed }) => {
      tex.offset.y = (tex.offset.y - flowSpeed * delta) % 1;
    });
  }
}

/**
 * @param {FountainState} state
 */
export function disposeFountain(state) {
  state.running = false;
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer = null;
  }
  if (state.procedural) {
    disposeProceduralFountainFx(state.procedural);
    state.procedural = null;
  }
  state.flowingTextures.length = 0;
}
