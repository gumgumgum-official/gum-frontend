import * as THREE from "three";
import {
  STAGE3_WALKABLE_NAME_PATTERNS,
  STAGE3_WALKABLE_MATERIAL_PATTERNS,
  STAGE3_EDGE_SAFETY_INSET,
} from "../../../../config/stages/stage3/stage3Island.js";

const _walkableRaycaster = new THREE.Raycaster();
const _walkableRayOrigin = new THREE.Vector3();
const _walkableRayDown = new THREE.Vector3(0, -1, 0);
const _walkableRayHits = [];

/**
 * walkable 메시 위 (x,z) 지면 Y. 히트 없으면 null.
 * @param {number} x
 * @param {number} z
 * @param {import("three").Mesh[]} meshes
 * @param {number} rayOriginY
 */
export function sampleStage3WalkableGroundY(x, z, meshes, rayOriginY) {
  if (!meshes?.length || !Number.isFinite(rayOriginY)) return null;
  _walkableRayOrigin.set(x, rayOriginY, z);
  _walkableRaycaster.set(_walkableRayOrigin, _walkableRayDown);
  _walkableRayHits.length = 0;
  _walkableRaycaster.intersectObjects(meshes, false, _walkableRayHits);
  return _walkableRayHits.length > 0 ? _walkableRayHits[0].point.y : null;
}

/**
 * @param {THREE.Box3} backgroundBounds
 * @param {{ x?: number, z?: number }} [spawnOffset]
 */
export function resolveStage3SpawnXZ(backgroundBounds, spawnOffset) {
  let spawnX = 0;
  let spawnZ = 0;
  if (!backgroundBounds.isEmpty()) {
    spawnX = (backgroundBounds.min.x + backgroundBounds.max.x) * 0.5;
    spawnZ = (backgroundBounds.min.z + backgroundBounds.max.z) * 0.5;
  }
  if (spawnOffset) {
    spawnX += spawnOffset.x ?? 0;
    spawnZ += spawnOffset.z ?? 0;
  }
  return { x: spawnX, z: spawnZ };
}

/**
 * Island bbox 기반 backgroundMaxY와 walkable 레이캐스트로 실제 발 위치 Y를 맞춘다.
 * @param {{
 *   backgroundMaxY: number,
 *   backgroundBounds: THREE.Box3,
 *   walkableMeshes: import("three").Mesh[],
 *   walkableBounds: THREE.Box3,
 *   hasWalkableBounds: boolean,
 *   spawnOffset?: { x?: number, z?: number },
 * }} params
 */
export function resolveStage3CharacterGroundY({
  backgroundMaxY,
  backgroundBounds,
  walkableMeshes,
  walkableBounds,
  hasWalkableBounds,
  spawnOffset,
}) {
  if (!walkableMeshes.length) return backgroundMaxY;

  const rayOriginY = hasWalkableBounds
    ? walkableBounds.max.y + 30
    : backgroundMaxY + 30;

  const { x: spawnX, z: spawnZ } = resolveStage3SpawnXZ(
    backgroundBounds,
    spawnOffset,
  );

  const sampled = sampleStage3WalkableGroundY(
    spawnX,
    spawnZ,
    walkableMeshes,
    rayOriginY,
  );
  if (sampled != null) return sampled;

  if (hasWalkableBounds) {
    const h = walkableBounds.max.y - walkableBounds.min.y;
    return walkableBounds.min.y + h * 0.12;
  }
  return backgroundMaxY;
}

/**
 * @param {import("three").Object3D} model
 * @param {RegExp[]} [namePatterns]
 * @param {RegExp[]} [materialPatterns]
 * @returns {{ meshes: import("three").Mesh[], bounds: THREE.Box3, hasBounds: boolean }}
 */
export function collectStage3WalkableFromModel(
  model,
  namePatterns = STAGE3_WALKABLE_NAME_PATTERNS,
  materialPatterns = STAGE3_WALKABLE_MATERIAL_PATTERNS,
) {
  /** @type {import("three").Mesh[]} */
  const meshes = [];
  const tmpWalkableBox = new THREE.Box3();
  const bounds = new THREE.Box3();
  let hasBounds = false;

  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    let p = /** @type {THREE.Object3D | null} */ (obj);
    let isWalkableByName = false;
    while (p) {
      const n = typeof p.name === "string" ? p.name.trim() : "";
      if (namePatterns.some((re) => re.test(n))) {
        isWalkableByName = true;
        break;
      }
      p = p.parent;
    }
    const materialNames = Array.isArray(obj.material)
      ? obj.material.map((m) => String(m?.name ?? ""))
      : [String(obj.material?.name ?? "")];
    const isWalkableByMaterial = materialNames.some((name) =>
      materialPatterns.some((re) => re.test(name)),
    );
    if (!isWalkableByName && !isWalkableByMaterial) return;
    obj.raycast = THREE.Mesh.prototype.raycast;
    meshes.push(obj);
    tmpWalkableBox.setFromObject(obj);
    if (!tmpWalkableBox.isEmpty()) {
      if (!hasBounds) {
        bounds.copy(tmpWalkableBox);
        hasBounds = true;
      } else {
        bounds.union(tmpWalkableBox);
      }
    }
  });

  return { meshes, bounds, hasBounds };
}

/**
 * @param {THREE.Box3} walkableBounds
 * @param {boolean} hasWalkableBounds
 * @param {number} [edgeSafetyInset]
 * @param {{ x: number, z: number }} [spawnXZ] - 스폰 지점이 inset 밖이면 bounds에 포함
 * @returns {THREE.Box3 | null}
 */
export function buildStage3AllowedBoundsXZ(
  walkableBounds,
  hasWalkableBounds,
  edgeSafetyInset = STAGE3_EDGE_SAFETY_INSET,
  spawnXZ = null,
) {
  if (!hasWalkableBounds) return null;
  const safeBounds = walkableBounds.clone();
  safeBounds.min.x += edgeSafetyInset;
  safeBounds.max.x -= edgeSafetyInset;
  safeBounds.min.z += edgeSafetyInset;
  safeBounds.max.z -= edgeSafetyInset;
  if (
    safeBounds.max.x <= safeBounds.min.x ||
    safeBounds.max.z <= safeBounds.min.z
  ) {
    safeBounds.copy(walkableBounds);
  }
  if (spawnXZ && Number.isFinite(spawnXZ.x) && Number.isFinite(spawnXZ.z)) {
    safeBounds.expandByPoint(
      new THREE.Vector3(spawnXZ.x, safeBounds.min.y, spawnXZ.z),
    );
  }
  return safeBounds;
}
