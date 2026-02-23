/**
 * Stage2 자율 이동 캐릭터 컨트롤러
 * 각 캐릭터가 자유의지로 랜덤 방향을 바꿔가며 걷고, 걸을 때만 애니메이션 재생.
 * 캐릭터마다 속도·방향·타이머가 달라서 각자 다르게 움직인다.
 */
import * as THREE from "three";

/**
 * @param {{
 *   models: import("three").Object3D[],
 *   walkClip: import("three").AnimationClip,
 *   bounds: { minX: number, maxX: number, minZ: number, maxZ: number },
 *   groundY?: number,
 *   options?: { moveSpeed?: number, boundsPadding?: number }
 * }} params
 * @returns {{ update: (delta: number) => void, cleanup: () => void }}
 */
export function createAutonomousCharacters({
  models,
  walkClip,
  bounds,
  groundY = 0.7,
  options = {},
}) {
  const { moveSpeed = 0.8, boundsPadding = 0.5 } = options;

  const agents = models.map((model) => {
    const mixer = new THREE.AnimationMixer(model);
    const walkAction = mixer.clipAction(walkClip);
    walkAction.loop = THREE.LoopRepeat;
    walkAction.play();
    walkAction.paused = true;

    const minX = bounds.minX + boundsPadding;
    const maxX = bounds.maxX - boundsPadding;
    const minZ = bounds.minZ + boundsPadding;
    const maxZ = bounds.maxZ - boundsPadding;

    // 캐릭터마다 다른 속도·방향·타이머로 각자 다르게 움직임
    const speed = moveSpeed * (0.6 + Math.random() * 0.8);
    let direction = Math.random() * Math.PI * 2;
    let changeDirTimer = 2 + Math.random() * 4;
    let isWalking = Math.random() > 0.3;

    return {
      model,
      mixer,
      walkAction,
      speed,
      direction,
      changeDirTimer,
      isWalking,
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
        // 주기적으로 방향/걷기 여부 랜덤 변경 (자유의지)
        agent.changeDirTimer -= delta;
        if (agent.changeDirTimer <= 0) {
          agent.changeDirTimer = 1.5 + Math.random() * 4;
          agent.isWalking = Math.random() > 0.25;
          if (agent.isWalking) {
            agent.direction = Math.random() * Math.PI * 2;
          }
        }

        if (agent.isWalking) {
          agent.walkAction.paused = false;
          _move.set(
            Math.sin(agent.direction) * agent.speed * delta,
            0,
            Math.cos(agent.direction) * agent.speed * delta,
          );
          agent.model.position.add(_move);
          agent.model.position.x = THREE.MathUtils.clamp(
            agent.model.position.x,
            agent.minX,
            agent.maxX,
          );
          agent.model.position.z = THREE.MathUtils.clamp(
            agent.model.position.z,
            agent.minZ,
            agent.maxZ,
          );
          agent.model.position.y = groundY;
          agent.model.rotation.y = agent.direction;
        } else {
          agent.walkAction.paused = true;
        }

        agent.mixer.update(delta);
      });
    },

    cleanup() {
      agents.forEach((agent) => {
        agent.mixer.stopAllAction();
      });
    },
  };
}
