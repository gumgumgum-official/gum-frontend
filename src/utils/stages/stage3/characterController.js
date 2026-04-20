/**
 * Stage3 캐릭터 컨트롤러
 * GLB 로드, AnimationMixer 설정, 이동/회전/바운드 클램핑, 카메라 추적을 담당합니다.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import gsap from "gsap";
import { inspectGLTF } from "../../common/modelInspector.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
import { slideMoveXZAgainstAABBs } from "./islandStaticColliders.js";

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getKeys: () => Record<string, boolean>,
 * }} params
 * @returns {{
 *   setup: (
 *     backgroundMaxY: number,
 *     backgroundBounds: import("three").Box3,
 *     staticColliderBoxes?: import("./islandStaticColliders.js").IslandColliderAabb[],
 *   ) => void,
 *   update: (
 *     delta: number,
 *     camera: import("three").Camera,
 *     options?: { skipCameraFollow?: boolean; cameraYawAssistRad?: number },
 *   ) => void,
 *   cleanup: () => void,
 *   getPosition: () => import("three").Vector3 | null,
 *   getYaw: () => number | null,
 *   getIsMoving: () => boolean,
 *   playHammerCue: () => void,
 * }}
 */
export function createCharacterController({
  scene,
  glbLoader,
  config,
  getKeys,
}) {
  void glbLoader;
  let characterModel = null;
  let characterYPosition = 0;
  let characterMixer = null;
  let characterWalkAction = null;
  let characterIdleAction = null;
  let isWalking = false;
  let isMoving = false;
  let backgroundBounds = null;
  /** @type {import("./islandStaticColliders.js").IslandColliderAabb[]} */
  let staticColliderBoxes = [];
  let collisionRadius = 0.55;
  /** @type {HTMLAudioElement | null} */
  let walkAudio = null;
  /** @type {import("gsap").core.Timeline | null} */
  let hammerTween = null;

  const WALK_SOUND_REL = "/static/sounds/character_walk.mp3";

  function getWalkSoundVolume() {
    const v = config.character?.walkSoundVolume;
    return THREE.MathUtils.clamp(typeof v === "number" ? v : 0.04, 0, 1);
  }

  function ensureWalkAudio() {
    if (walkAudio) return walkAudio;
    walkAudio = new window.Audio();
    walkAudio.preload = "auto";
    walkAudio.loop = true;
    walkAudio.volume = getWalkSoundVolume();
    walkAudio.src = resolvePublicAssetUrl(WALK_SOUND_REL);
    return walkAudio;
  }

  function syncWalkSound(moving) {
    if (!moving) {
      if (walkAudio && !walkAudio.paused) {
        walkAudio.pause();
        walkAudio.currentTime = 0;
      }
      return;
    }
    const a = ensureWalkAudio();
    a.volume = getWalkSoundVolume();
    if (a.paused) {
      a.play().catch(() => {});
    }
  }

  // 매 프레임 재사용할 Vector3 인스턴스 (GC 압박 방지)
  const _moveVector = new THREE.Vector3();
  const _direction = new THREE.Vector3();
  const _cameraOffset = new THREE.Vector3();
  const _targetPosition = new THREE.Vector3();
  const _lookAtPosition = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);
  const ANIMATION_CROSS_FADE_SEC = 0.16;

  function setAnimationMode(mode) {
    if (mode === "walk") {
      if (characterWalkAction && characterIdleAction) {
        characterWalkAction.enabled = true;
        characterWalkAction.paused = false;
        characterWalkAction.setEffectiveWeight(1);
        characterWalkAction.crossFadeFrom(
          characterIdleAction,
          ANIMATION_CROSS_FADE_SEC,
          false,
        );
        characterIdleAction.paused = false;
        return;
      }

      if (characterWalkAction) {
        characterWalkAction.enabled = true;
        characterWalkAction.paused = false;
        characterWalkAction.setEffectiveWeight(1);
      }
      if (characterIdleAction) {
        characterIdleAction.paused = true;
        characterIdleAction.enabled = false;
        characterIdleAction.setEffectiveWeight(0);
      }
      return;
    }

    if (mode === "idle") {
      if (characterWalkAction && characterIdleAction) {
        characterIdleAction.enabled = true;
        characterIdleAction.paused = false;
        characterIdleAction.setEffectiveWeight(1);
        characterIdleAction.crossFadeFrom(
          characterWalkAction,
          ANIMATION_CROSS_FADE_SEC,
          false,
        );
        characterWalkAction.paused = false;
        return;
      }

      if (characterWalkAction) {
        characterWalkAction.paused = true;
        characterWalkAction.enabled = false;
        characterWalkAction.setEffectiveWeight(0);
      }
      if (characterIdleAction) {
        characterIdleAction.enabled = true;
        characterIdleAction.paused = false;
        characterIdleAction.setEffectiveWeight(1);
      } else if (characterWalkAction) {
        // idle 클립이 없으면 walk의 시작 포즈를 idle 대용으로 사용
        characterWalkAction.enabled = true;
        characterWalkAction.time = 0;
        characterWalkAction.paused = true;
        characterWalkAction.setEffectiveWeight(1);
      }
    }
  }

  return {
    setup(backgroundMaxY, bounds, colliderBoxes = []) {
      backgroundBounds = bounds;
      staticColliderBoxes = colliderBoxes;

      const relChar =
        config.characterModelPath ?? "/models/common/user_walk_v2.glb";
      const relIdle =
        config.characterIdleModelPath ?? "/models/common/user_idle.glb";
      const characterUrl = resolvePublicAssetUrl(relChar);
      const idleUrl = resolvePublicAssetUrl(relIdle);
      Promise.all([
        loadGltfTemplateCached(characterUrl),
        loadGltfTemplateCached(idleUrl).catch(() => null),
      ]).then(
        ([gltf, idleGltf]) => {
          characterModel = SkeletonUtils.clone(gltf.scene);

          const scale = config.character?.scale ?? 1;
          const radiusCfg = config.character?.collisionRadius;
          characterModel.scale.setScalar(scale);
          collisionRadius =
            radiusCfg != null ? radiusCfg : Math.max(0.2, scale * 0.22);

          const characterBox = new THREE.Box3().setFromObject(characterModel);
          const characterMinY = characterBox.min.y;

          const groundOffset = config.character?.groundOffset ?? 0;
          characterYPosition = backgroundMaxY - characterMinY + groundOffset;

          let spawnX = 0;
          let spawnZ = 0;
          if (bounds && !bounds.isEmpty()) {
            spawnX = (bounds.min.x + bounds.max.x) * 0.5;
            spawnZ = (bounds.min.z + bounds.max.z) * 0.5;
          }
          const off = config.character?.spawnOffset;
          if (off) {
            spawnX += off.x ?? 0;
            spawnZ += off.z ?? 0;
          }
          characterModel.position.set(spawnX, characterYPosition, spawnZ);

          characterModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          if (gltf.animations && gltf.animations.length > 0) {
            characterMixer = new THREE.AnimationMixer(characterModel);
            const clips = gltf.animations;
            const idleClips = idleGltf?.animations ?? [];
            const findClipByName = (regex) =>
              clips.find((clip) => regex.test(String(clip?.name ?? ""))) ??
              null;
            const findIdleClipByName = (regex) =>
              idleClips.find((clip) => regex.test(String(clip?.name ?? ""))) ??
              null;
            const walkClip =
              findClipByName(/walk|run|move/i) ?? clips[0] ?? null;
            const idleClipFromIdleModel =
              findIdleClipByName(/idle|stand|wait|pose|breath|rest/i) ??
              idleClips[0] ??
              null;
            const idleClipFromWalkModel =
              findClipByName(/idle|stand|wait|pose|breath|rest/i) ??
              clips.find((clip) => clip !== walkClip) ??
              null;
            const idleClip = idleClipFromIdleModel ?? idleClipFromWalkModel;

            characterWalkAction = walkClip
              ? characterMixer.clipAction(walkClip)
              : null;
            characterIdleAction = idleClip
              ? characterMixer.clipAction(idleClip)
              : null;

            if (characterWalkAction) {
              characterWalkAction.loop = THREE.LoopRepeat;
              characterWalkAction.play();
              characterWalkAction.paused = true;
              characterWalkAction.enabled = true;
              characterWalkAction.setEffectiveWeight(1);
            }
            if (characterIdleAction) {
              characterIdleAction.loop = THREE.LoopRepeat;
              characterIdleAction.play();
              characterIdleAction.paused = false;
              characterIdleAction.enabled = true;
              characterIdleAction.setEffectiveWeight(1);
            }
            setAnimationMode("idle");
          } else {
            console.warn("⚠️ 캐릭터 모델에 애니메이션 클립이 없습니다.");
          }

          scene.add(characterModel);
          inspectGLTF(gltf, "캐릭터 모델");
        },
        (err) =>
          console.error(
            "❌ Stage3 캐릭터 로드 에러:",
            err instanceof Error ? err : new Error(String(err)),
          ),
      );
    },

    /**
     * @param {number} delta
     * @param {THREE.Camera} camera
     * @param {{ skipCameraFollow?: boolean; cameraYawAssistRad?: number }} [options] - skipCameraFollow: true면 카메라 추적 생략 (OrbitControls 사용 시). cameraYawAssistRad: 캐릭터 기준 Y축으로 cameraOffset 회전(rad)
     */
    update(delta, camera, options = {}) {
      if (!characterModel || !backgroundBounds) return;

      const {
        moveSpeed,
        boundsPadding,
        cameraOffset: camOffset,
        cameraLerpFactor,
        lookAtHeightOffset,
      } = config.character;

      const keys = getKeys();
      _moveVector.set(0, 0, 0);

      if (keys.ArrowUp) _moveVector.z -= 1;
      if (keys.ArrowDown) _moveVector.z += 1;
      if (keys.ArrowLeft) _moveVector.x -= 1;
      if (keys.ArrowRight) _moveVector.x += 1;

      const movingInput = _moveVector.length() > 0;
      let moved = false;

      if (movingInput) {
        _direction.copy(_moveVector).normalize();
        _moveVector.copy(_direction).multiplyScalar(moveSpeed * delta);

        const oldX = characterModel.position.x;
        const oldZ = characterModel.position.z;

        let newX = characterModel.position.x + _moveVector.x;
        let newZ = characterModel.position.z + _moveVector.z;

        // 패딩 때문에 low>high가 되면 Three clamp가 한 점으로 몰아 이동이 0이 된다.
        const minCx = Math.min(
          backgroundBounds.min.x + boundsPadding,
          backgroundBounds.max.x - boundsPadding,
        );
        const maxCx = Math.max(
          backgroundBounds.min.x + boundsPadding,
          backgroundBounds.max.x - boundsPadding,
        );
        const minCz = Math.min(
          backgroundBounds.min.z + boundsPadding,
          backgroundBounds.max.z - boundsPadding,
        );
        const maxCz = Math.max(
          backgroundBounds.min.z + boundsPadding,
          backgroundBounds.max.z - boundsPadding,
        );
        newX = THREE.MathUtils.clamp(newX, minCx, maxCx);
        newZ = THREE.MathUtils.clamp(newZ, minCz, maxCz);

        const slid = slideMoveXZAgainstAABBs(
          oldX,
          oldZ,
          newX,
          newZ,
          collisionRadius,
          staticColliderBoxes,
        );
        newX = slid.x;
        newZ = slid.z;

        characterModel.position.x = newX;
        characterModel.position.z = newZ;
        characterModel.position.y = characterYPosition;

        moved = Math.abs(newX - oldX) > 1e-6 || Math.abs(newZ - oldZ) > 1e-6;

        const angle = Math.atan2(_direction.x, _direction.z);
        characterModel.rotation.y = angle;
      }

      // 실제 이동 여부는 외부 상태(getIsMoving)와 사운드에 유지
      isMoving = moved;
      if (characterWalkAction) {
        // 요청사항: 키보드 입력이 없을 때는 idle 애니메이션 재생
        if (movingInput) {
          if (!isWalking) {
            setAnimationMode("walk");
            isWalking = true;
          }
        } else {
          if (isWalking) {
            setAnimationMode("idle");
            isWalking = false;
          }
        }
      }

      if (characterMixer) {
        characterMixer.update(delta);
      }

      syncWalkSound(moved);

      // 카메라 추적 (OrbitControls 사용 시에는 스킵)
      if (!options.skipCameraFollow) {
        _cameraOffset.set(camOffset.x, camOffset.y, camOffset.z);
        const yawAssist = Number(options.cameraYawAssistRad ?? 0);
        if (yawAssist !== 0) {
          _cameraOffset.applyAxisAngle(_worldUp, yawAssist);
        }
        _targetPosition.copy(characterModel.position).add(_cameraOffset);
        camera.position.lerp(_targetPosition, cameraLerpFactor);

        _lookAtPosition.copy(characterModel.position);
        _lookAtPosition.y += lookAtHeightOffset;
        camera.lookAt(_lookAtPosition);
      }
    },

    cleanup() {
      if (hammerTween) {
        hammerTween.kill();
        hammerTween = null;
      }
      if (walkAudio) {
        walkAudio.pause();
        walkAudio.src = "";
        walkAudio = null;
      }
      if (characterModel) {
        scene.remove(characterModel);
        characterModel.traverse((child) => {
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
        characterModel = null;
      }
      if (characterMixer) {
        characterMixer.stopAllAction();
        characterMixer = null;
      }
      characterWalkAction = null;
      characterIdleAction = null;
      isWalking = false;
      backgroundBounds = null;
      staticColliderBoxes = [];
    },

    getPosition() {
      return characterModel?.position ?? null;
    },
    /**
     * 바닥 플래너(y=0) 기준 유저가 바라보는 방향의 yaw(radian).
     * @returns {number|null}
     */
    getYaw() {
      return characterModel ? characterModel.rotation.y : null;
    },
    /**
     * 현재 프레임 입력 기준으로 이동 중인지 여부.
     * @returns {boolean}
     */
    getIsMoving() {
      return isMoving;
    },

    playHammerCue() {
      if (!characterModel) return;
      hammerTween?.kill();
      const m = characterModel;
      const baseX = m.rotation.x;
      hammerTween = gsap.timeline();
      hammerTween.to(m.rotation, {
        x: baseX - 0.52,
        duration: 0.12,
        ease: "power2.out",
      });
      hammerTween.to(m.rotation, {
        x: baseX,
        duration: 0.2,
        ease: "power2.inOut",
      });
    },
  };
}
