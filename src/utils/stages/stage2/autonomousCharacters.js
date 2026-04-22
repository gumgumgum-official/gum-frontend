/**
 * Stage2 자율 이동 캐릭터 컨트롤러
 * 각 캐릭터가 자유의지로 랜덤 방향을 바꿔가며 걷고, 걸을 때만 애니메이션 재생.
 * 캐릭터마다 속도·방향·타이머가 달라서 각자 다르게 움직인다.
 * walkClip이 없으면(애니메이션 없는 GLB) 위치·회전만 갱신한다.
 */
import * as THREE from "three";
import {
  circleOverlapsAny,
  slideMoveXZAgainstAABBs,
} from "../stage3/islandStaticColliders.js";

/**
 * @param {{
 *   models: import("three").Object3D[],
 *   idleModels?: import("three").Object3D[] | null,
 *   walkClip?: import("three").AnimationClip | null,
 *   idleClip?: import("three").AnimationClip|null,
 *   runClip?: import("three").AnimationClip|null,
 *   bounds: { minX: number, maxX: number, minZ: number, maxZ: number },
 *   groundY?: number,
 *   isPositionValid?: ((x: number, z: number) => boolean) | null,
 *   staticColliderBoxes?: import("../stage3/islandStaticColliders.js").IslandColliderAabb[],
 *   options?: { moveSpeed?: number, boundsPadding?: number, collisionRadius?: number }
 * }} params
 * @returns {{ update: (delta: number) => void, cleanup: () => void }}
 */
export function createAutonomousCharacters({
  models,
  idleModels = null,
  walkClip = null,
  idleClip = null,
  runClip = null,
  bounds,
  groundY = 0.7,
  isPositionValid = null,
  staticColliderBoxes = [],
  options = {},
}) {
  const {
    moveSpeed = 0.8,
    boundsPadding = 0.5,
    collisionRadius = 0.5,
  } = options;
  const pickNextBehaviorSeconds = () => 0.9 + Math.random() * 2.6;
  const pickNextDirectionSeconds = () => 0.8 + Math.random() * 2.2;
  const pickBehavior = () => {
    const r = Math.random();
    if (r < 0.25) return "idle";
    if (r < 0.75) return "walk";
    return "run";
  };

  const agents = models.map((model, index) => {
    const idleModel = Array.isArray(idleModels)
      ? (idleModels[index] ?? null)
      : null;
    let mixer = null;
    let idleMixer = null;
    /** @type {import("three").AnimationAction | null} */
    let walkAction = null;
    /** @type {import("three").AnimationAction | null} */
    let idleAction = null;
    /** @type {import("three").AnimationAction | null} */
    let runAction = null;
    /** @type {import("three").AnimationAction | null} */
    let idleModelAction = null;

    if (walkClip) {
      mixer = new THREE.AnimationMixer(model);
      walkAction = mixer.clipAction(walkClip);
      walkAction.loop = THREE.LoopRepeat;
      walkAction.play();
      walkAction.paused = true;
      if (runClip) {
        runAction = mixer.clipAction(runClip);
        runAction.loop = THREE.LoopRepeat;
        runAction.play();
        runAction.paused = true;
      }
      if (idleClip && !idleModel) {
        idleAction = mixer.clipAction(idleClip);
        idleAction.loop = THREE.LoopRepeat;
        idleAction.play();
        idleAction.paused = false;
      }
    }
    if (idleModel && idleClip) {
      idleMixer = new THREE.AnimationMixer(idleModel);
      idleModelAction = idleMixer.clipAction(idleClip);
      idleModelAction.loop = THREE.LoopRepeat;
      idleModelAction.play();
      idleModelAction.paused = false;
    }

    let minX = bounds.minX + boundsPadding;
    let maxX = bounds.maxX - boundsPadding;
    let minZ = bounds.minZ + boundsPadding;
    let maxZ = bounds.maxZ - boundsPadding;
    if (minX > maxX) {
      const c = (bounds.minX + bounds.maxX) * 0.5;
      minX = c - 0.25;
      maxX = c + 0.25;
    }
    if (minZ > maxZ) {
      const c = (bounds.minZ + bounds.maxZ) * 0.5;
      minZ = c - 0.25;
      maxZ = c + 0.25;
    }

    const speed = moveSpeed * (0.6 + Math.random() * 0.8);
    let direction = Math.random() * Math.PI * 2;
    let changeDirTimer = pickNextDirectionSeconds();
    let behaviorTimer = pickNextBehaviorSeconds();
    let behavior = pickBehavior();
    let blockedTurnCooldown = 0;

    return {
      model,
      idleModel,
      mixer,
      idleMixer,
      walkAction,
      idleAction,
      runAction,
      idleModelAction,
      speed,
      direction,
      changeDirTimer,
      behaviorTimer,
      behavior,
      blockedTurnCooldown,
      minX,
      maxX,
      minZ,
      maxZ,
    };
  });

  const _move = new THREE.Vector3();

  return {
    update(delta) {
      agents.forEach((agent) => {
        agent.changeDirTimer -= delta;
        agent.behaviorTimer -= delta;
        agent.blockedTurnCooldown -= delta;
        if (agent.behaviorTimer <= 0) {
          agent.behaviorTimer = pickNextBehaviorSeconds();
          agent.behavior = pickBehavior();
          if (agent.behavior !== "idle") {
            agent.direction = Math.random() * Math.PI * 2;
          }
        }
        if (agent.changeDirTimer <= 0) {
          agent.changeDirTimer = pickNextDirectionSeconds();
          if (agent.behavior !== "idle") {
            agent.direction = Math.random() * Math.PI * 2;
          }
        }

        if (agent.behavior === "idle") {
          agent.model.visible = !agent.idleModel;
          if (agent.idleModel) agent.idleModel.visible = true;
          if (agent.walkAction) agent.walkAction.paused = true;
          if (agent.runAction) agent.runAction.paused = true;
          if (agent.idleAction) agent.idleAction.paused = false;
          if (agent.idleModelAction) agent.idleModelAction.paused = false;
        } else {
          agent.model.visible = true;
          if (agent.idleModel) agent.idleModel.visible = false;
          const speedMultiplier = agent.behavior === "run" ? 2.5 : 1;
          if (agent.walkAction) {
            agent.walkAction.paused =
              agent.behavior === "run" && !!agent.runAction;
            agent.walkAction.timeScale = agent.behavior === "run" ? 1.5 : 1;
          }
          if (agent.runAction) {
            agent.runAction.paused = agent.behavior !== "run";
            agent.runAction.timeScale = 1;
          }
          if (agent.idleAction) agent.idleAction.paused = true;
          _move.set(
            Math.sin(agent.direction) * agent.speed * speedMultiplier * delta,
            0,
            Math.cos(agent.direction) * agent.speed * speedMultiplier * delta,
          );
          const nextX = THREE.MathUtils.clamp(
            agent.model.position.x + _move.x,
            agent.minX,
            agent.maxX,
          );
          const nextZ = THREE.MathUtils.clamp(
            agent.model.position.z + _move.z,
            agent.minZ,
            agent.maxZ,
          );
          const canMove =
            typeof isPositionValid === "function"
              ? isPositionValid(nextX, nextZ)
              : true;
          let resolvedX = nextX;
          let resolvedZ = nextZ;
          if (canMove && staticColliderBoxes.length > 0) {
            const slid = slideMoveXZAgainstAABBs(
              agent.model.position.x,
              agent.model.position.z,
              nextX,
              nextZ,
              collisionRadius,
              staticColliderBoxes,
            );
            resolvedX = slid.x;
            resolvedZ = slid.z;
          }
          const blockedByObstacle =
            staticColliderBoxes.length > 0
              ? circleOverlapsAny(
                  resolvedX,
                  resolvedZ,
                  collisionRadius,
                  staticColliderBoxes,
                )
              : false;
          const canMoveAfterResolve =
            canMove &&
            !blockedByObstacle &&
            (typeof isPositionValid === "function"
              ? isPositionValid(resolvedX, resolvedZ)
              : true);
          if (canMoveAfterResolve) {
            agent.model.position.x = resolvedX;
            agent.model.position.z = resolvedZ;
          } else if (agent.blockedTurnCooldown <= 0) {
            agent.direction = Math.random() * Math.PI * 2;
            agent.changeDirTimer = 0.35 + Math.random() * 0.5;
            agent.blockedTurnCooldown = 0.15;
          }
          agent.model.position.y = groundY;
          agent.model.rotation.y = agent.direction;
          if (agent.idleModel) {
            agent.idleModel.position.copy(agent.model.position);
            agent.idleModel.rotation.copy(agent.model.rotation);
          }
          if (agent.idleModelAction) agent.idleModelAction.paused = true;
        }

        if (agent.mixer) agent.mixer.update(delta);
        if (agent.idleMixer) agent.idleMixer.update(delta);
      });
    },

    cleanup() {
      agents.forEach((agent) => {
        if (agent.mixer) agent.mixer.stopAllAction();
        if (agent.idleMixer) agent.idleMixer.stopAllAction();
      });
    },
  };
}
