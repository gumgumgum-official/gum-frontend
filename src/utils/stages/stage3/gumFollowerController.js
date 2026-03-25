/**
 * Stage3 껌딱지(사이드 캐릭터) 컨트롤러
 * - 유저 좌/우 후방(약 45도 사선) 목표 위치를 계산해 lerp 추종
 * - 유저 이동 중이면 'walk' 애니메이션 재생, 정지면 paused로 전환
 * - 유저를 바라보도록 yaw만 회전 제어
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getUserState: () => { position: import("three").Vector3|null, yaw: number|null, moving: boolean },
 * }} params
 */
export function createGumFollowersController({
  scene,
  glbLoader,
  config,
  getUserState,
}) {
  const gumCfg = config.character?.gumFollowers ?? null;
  const gumModelCfg = gumCfg?.models ?? gumCfg;
  const gumBehaviorCfg = gumCfg?.behavior ?? gumCfg;

  const modelPath = gumModelCfg?.modelPath ?? "/models/common/walk__gum.glb";
  const distance = gumBehaviorCfg?.distance ?? 2.2;
  const angleDeg = gumBehaviorCfg?.angleDeg ?? 45;
  const followLerpFactor = gumBehaviorCfg?.followLerpFactor ?? 8;
  const turnLerpFactor = gumBehaviorCfg?.turnLerpFactor ?? 10;
  const facingLerpFactor = gumBehaviorCfg?.facingLerpFactor ?? 6;
  const lookAtHeightOffset = gumBehaviorCfg?.lookAtHeightOffset ?? 0.9;
  const modelScale = gumModelCfg?.scale ?? 1;

  // 캐릭터가 작아지면(스케일 다운) 발걸음이 상대적으로 더 빨라 보이도록 애니메이션 속도를 보정
  const animationSpeed =
    gumBehaviorCfg?.animationSpeed ?? (modelScale !== 0 ? 1 / modelScale : 1);

  const groundOffsetOverride = gumBehaviorCfg?.groundOffset ?? null;
  const breakOffCfg = gumBehaviorCfg?.breakOff ?? null;
  const breakOffEnabled = breakOffCfg?.enabled ?? false;
  const breakOffYawThresholdDeg = breakOffCfg?.yawThresholdDeg ?? 120;
  const breakOffDurationSec = breakOffCfg?.durationSec ?? 0.55;
  const breakOffDistanceMultiplier = breakOffCfg?.distanceMultiplier ?? 1.35;
  const breakOffFollowLerpMultiplier =
    breakOffCfg?.followLerpMultiplier ?? 0.35;
  const breakOffDriftAmplitude = breakOffCfg?.driftAmplitude ?? 0.55;

  const groundOffset =
    groundOffsetOverride ?? config.character?.groundOffset ?? 0;

  /**
   * @type {{ id: "A"|"B", side: -1|1, model: THREE.Group, mixer: THREE.AnimationMixer, walkAction: THREE.AnimationAction|null, offsetYaw: number|null, breakDriftScalar: number }[]}
   */
  const followers = [];

  let followerYPosition = 0;
  // user.y 변화에 대응하기 위한 상대 오프셋 (첫 업데이트에서 확정)
  let followerYOffsetFromUserY = null;
  let isReady = false;

  // 매 프레임 재사용 (GC 방지)
  const _target = new THREE.Vector3();
  const _userPos = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _look = new THREE.Vector3();

  let isMovingPrev = false;
  let stopOnNextLoop = false;
  let elapsedSec = 0;
  let breakOffUntil = 0;
  let prevUserYaw = null;

  function lerpAngle(from, to, t) {
    // 각도 차이를 [-PI, PI]로 정규화한 뒤 t만큼 이동
    const diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
    return from + diff * t;
  }

  function angleDiff(from, to) {
    // from→to 각도 차이를 [-PI, PI] 범위로 정규화
    return ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  async function init({ backgroundMaxY } = {}) {
    if (isReady) return;
    if (backgroundMaxY == null) {
      throw new Error("[GumFollowers] init requires backgroundMaxY");
    }

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const fullPath = base + modelPath;
    const gltf = await glbLoader.loadAsync(fullPath);
    const baseModel = gltf.scene;

    // 원하는 크기로 먼저 스케일을 적용해야, minY 기반 y 보정도 맞게 계산됩니다.
    if (modelScale !== 1) {
      baseModel.scale.setScalar(modelScale);
    }

    // y position 보정: 모델 바운딩(minY) 기준
    const box = new THREE.Box3().setFromObject(baseModel);
    const minY = box.min.y;
    followerYPosition = backgroundMaxY - minY + groundOffset;

    const clones = [
      // A: 좌측 후방(뒤쪽 기준 -45도)
      { id: "A", side: -1 },
      // B: 우측 후방(뒤쪽 기준 +45도)
      { id: "B", side: 1 },
    ];

    // walk 클립: gltf.animations[0]를 그대로 사용(기존 Stage3 characterController 패턴)
    const walkClip = gltf.animations?.[0] ?? null;

    clones.forEach(({ id, side }) => {
      const model = SkeletonUtils.clone(baseModel);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const mixer = new THREE.AnimationMixer(model);
      const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
      if (walkAction) {
        walkAction.loop = THREE.LoopRepeat;
        walkAction.timeScale = animationSpeed;
        walkAction.play();
        walkAction.paused = true;
      }

      // loop 이벤트는 한 번만 바인딩해두고, stopOnNextLoop 플래그로 제어
      mixer.addEventListener("loop", () => {
        if (!stopOnNextLoop) return;
        if (walkAction) walkAction.paused = true;
      });

      followers.push({
        id,
        side,
        model,
        mixer,
        walkAction,
        offsetYaw: null,
        breakDriftScalar: side * breakOffDriftAmplitude,
      });

      scene.add(model);
      model.position.y = followerYPosition;
    });

    isReady = true;
  }

  function computeOffsetYaw(userYaw, side) {
    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    // "후방"은 userYaw + 180deg. 그 후 좌/우로 +/- angleDeg 만큼 벌림
    return userYaw + Math.PI + side * angleRad;
  }

  function updateFollowerFacing(userPos, follower, delta) {
    _look.copy(userPos).sub(follower.model.position);
    _look.y = 0;
    if (_look.lengthSq() < 1e-6) return;
    const yaw = Math.atan2(_look.x, _look.z);
    const tFace = Math.min(1, facingLerpFactor * delta);
    follower.model.rotation.y = lerpAngle(
      follower.model.rotation.y,
      yaw,
      tFace,
    );
  }

  function updateFollowerFacingToTarget(targetPos, follower, delta) {
    _look.copy(targetPos).sub(follower.model.position);
    _look.y = 0;
    if (_look.lengthSq() < 1e-6) return;
    const yaw = Math.atan2(_look.x, _look.z);
    const tFace = Math.min(1, facingLerpFactor * delta);
    follower.model.rotation.y = lerpAngle(
      follower.model.rotation.y,
      yaw,
      tFace,
    );
  }

  return {
    init,
    update(delta) {
      if (!isReady) return;

      const userState = getUserState();
      const userPos = userState.position;
      const userYaw = userState.yaw;
      const moving = userState.moving;

      if (!userPos || userYaw == null) return;

      elapsedSec += delta;
      if (breakOffEnabled) {
        if (prevUserYaw != null) {
          const dyaw = Math.abs(angleDiff(prevUserYaw, userYaw));
          const thr = THREE.MathUtils.degToRad(breakOffYawThresholdDeg);
          if (dyaw > thr) {
            breakOffUntil = elapsedSec + breakOffDurationSec;
          }
        }
        prevUserYaw = userYaw;
      }

      if (followerYOffsetFromUserY == null) {
        // "현재 user y가 곧 바닥 기준에 서 있다는 가정" 하에,
        // follower가 계산된 ground 맞춤 y(followerYPosition)를 user 기준으로 환산
        followerYOffsetFromUserY = followerYPosition - userPos.y;
      }

      // 이동 여부가 바뀌는 프레임에서만 애니메이션 paused 처리를 함
      if (moving !== isMovingPrev) {
        if (moving) {
          stopOnNextLoop = false;
          followers.forEach((f) => {
            if (!f.walkAction) return;
            f.walkAction.paused = false;
          });
        } else {
          stopOnNextLoop = true;
          // loop 끝나면 mixer loop 이벤트에서 paused=true로 전환됨
        }
        isMovingPrev = moving;
      }

      _userPos.copy(userPos);
      const tY = Math.min(1, followLerpFactor * delta);

      followers.forEach((f) => {
        const breaking = breakOffEnabled && elapsedSec < breakOffUntil;

        const desiredOffsetYaw = computeOffsetYaw(userYaw, f.side);
        if (f.offsetYaw == null) f.offsetYaw = desiredOffsetYaw;
        const ty = Math.min(1, turnLerpFactor * delta);
        f.offsetYaw = lerpAngle(f.offsetYaw, desiredOffsetYaw, ty);

        _dir.set(Math.sin(f.offsetYaw), 0, Math.cos(f.offsetYaw));
        const dynDistance = breaking
          ? distance * breakOffDistanceMultiplier
          : distance;
        _target.copy(_userPos).addScaledVector(_dir, dynDistance);

        if (breaking) {
          // dir 기준으로 90deg 회전한 "옆" 방향으로 벌어짐
          const perpX = _dir.z;
          const perpZ = -_dir.x;
          _target.x += perpX * f.breakDriftScalar;
          _target.z += perpZ * f.breakDriftScalar;
        }

        // y는 유저 y 변화에 상대 오프셋을 더해 자연스럽게 lerp
        const userY = userPos.y ?? 0;
        const targetY = userY + followerYOffsetFromUserY;
        f.model.position.y = THREE.MathUtils.lerp(
          f.model.position.y,
          targetY,
          tY,
        );

        // xz만 자연스럽게 따라오게 처리 (GC 방지: Vector3 생성 최소화)
        const dynFollow = breaking
          ? followLerpFactor * breakOffFollowLerpMultiplier
          : followLerpFactor;
        const txz = Math.min(1, dynFollow * delta);
        f.model.position.x = THREE.MathUtils.lerp(
          f.model.position.x,
          _target.x,
          txz,
        );
        f.model.position.z = THREE.MathUtils.lerp(
          f.model.position.z,
          _target.z,
          txz,
        );

        // 걷는 동안은 "이동 앞"을 보고, 멈추면 유저를 바라보도록 전환
        if (moving) {
          updateFollowerFacingToTarget(_target, f, delta);
        } else {
          updateFollowerFacing(userPos, f, delta);
        }

        f.mixer.update(delta);
      });
    },
    cleanup() {
      followers.forEach((f) => {
        scene.remove(f.model);
        f.mixer.stopAllAction();
        f.model.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      });
      followers.length = 0;
      followerYOffsetFromUserY = null;
      isReady = false;
      elapsedSec = 0;
      breakOffUntil = 0;
      prevUserYaw = null;
    },
  };
}
