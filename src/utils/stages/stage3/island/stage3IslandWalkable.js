import * as THREE from "three";
import {
  STAGE3_WALKABLE_NAME_PATTERNS,
  STAGE3_WALKABLE_MATERIAL_PATTERNS,
  STAGE3_EDGE_SAFETY_INSET,
} from "../../../../config/stages/stage3/stage3Island.js";

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
 * @returns {THREE.Box3 | null}
 */
export function buildStage3AllowedBoundsXZ(
  walkableBounds,
  hasWalkableBounds,
  edgeSafetyInset = STAGE3_EDGE_SAFETY_INSET,
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
    return walkableBounds.clone();
  }
  return safeBounds;
}
