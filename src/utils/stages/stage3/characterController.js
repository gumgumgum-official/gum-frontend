/**
 * Stage3 캐릭터 컨트롤러
 * GLB 로드, AnimationMixer 설정, 이동/회전/바운드 클램핑, 카메라 추적을 담당합니다.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
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
 *   renderer?: import("three").WebGLRenderer | null,
 *   getCamera?: () => import("three").Camera | null,
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
 *   isPunching: () => boolean,
 * }}
 */
export function createCharacterController({
  scene,
  glbLoader,
  config,
  getKeys,
  renderer = null,
  getCamera = null,
}) {
  void glbLoader;
  let characterModel = null;
  let idleCharacterModel = null;
  let characterYPosition = 0;
  let characterMixer = null;
  let idleCharacterMixer = null;
  let characterWalkAction = null;
  let idleCharacterAction = null;
  let isWalking = false;
  let isMoving = false;
  let backgroundBounds = null;
  /** @type {import("./islandStaticColliders.js").IslandColliderAabb[]} */
  let staticColliderBoxes = [];
  let collisionRadius = 0.55;
  /** @type {HTMLAudioElement | null} */
  let walkAudio = null;
  /** @type {THREE.Object3D | null} */
  let punchCharacterModel = null;
  /** @type {THREE.AnimationMixer | null} */
  let punchMixer = null;
  /** @type {THREE.AnimationAction | null} */
  let punchAction = null;
  let isPunchPlaying = false;

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

  return {
    /**
     * @param {number} backgroundMaxY - 캐릭터 발이 놓일 바닥의 월드 Y (지형 상단)
     * @param {import("three").Box3} bounds
     * @param {import("./islandStaticColliders.js").IslandColliderAabb[]} [colliderBoxes]
     * @param {{ worldSpawnXZ?: { x: number, z: number } }} [setupOptions] - worldSpawnXZ가 있으면 XZ 기준은 이 값(bounds 중심 대신), spawnOffset은 여전히 가산
     */
    setup(backgroundMaxY, bounds, colliderBoxes = [], setupOptions = {}) {
      const { worldSpawnXZ } = setupOptions;
      backgroundBounds = bounds;
      staticColliderBoxes = colliderBoxes;

      const relChar =
        config.characterModelPath ?? "/models/common/user_walk_v2.glb";
      const relIdle =
        config.characterIdleModelPath ?? "/models/common/user_idle.glb";
      const relPunch =
        config.characterPunchModelPath ?? "/models/stage3/user_punch.glb";
      const characterUrl = resolvePublicAssetUrl(relChar);
      const idleUrl = resolvePublicAssetUrl(relIdle);
      const punchUrl = resolvePublicAssetUrl(relPunch);
      Promise.all([
        loadGltfTemplateCached(characterUrl),
        loadGltfTemplateCached(idleUrl).catch(() => null),
        loadGltfTemplateCached(punchUrl).catch(() => null),
      ]).then(
        ([gltf, idleGltf, punchGltf]) => {
          characterModel = SkeletonUtils.clone(gltf.scene);
          idleCharacterModel = idleGltf
            ? SkeletonUtils.clone(idleGltf.scene)
            : null;

          const scale = config.character?.scale ?? 1;
          const radiusCfg = config.character?.collisionRadius;
          characterModel.scale.setScalar(scale);
          if (idleCharacterModel) idleCharacterModel.scale.setScalar(scale);
          collisionRadius =
            radiusCfg != null ? radiusCfg : Math.max(0.2, scale * 0.22);

          const characterBox = new THREE.Box3().setFromObject(characterModel);
          const characterMinY = characterBox.min.y;

          const groundOffset = config.character?.groundOffset ?? 0;
          characterYPosition = backgroundMaxY - characterMinY + groundOffset;

          let spawnX = 0;
          let spawnZ = 0;
          if (
            worldSpawnXZ &&
            Number.isFinite(worldSpawnXZ.x) &&
            Number.isFinite(worldSpawnXZ.z)
          ) {
            spawnX = worldSpawnXZ.x;
            spawnZ = worldSpawnXZ.z;
          } else if (bounds && !bounds.isEmpty()) {
            spawnX = (bounds.min.x + bounds.max.x) * 0.5;
            spawnZ = (bounds.min.z + bounds.max.z) * 0.5;
          }
          const off = config.character?.spawnOffset;
          if (off) {
            spawnX += off.x ?? 0;
            spawnZ += off.z ?? 0;
          }
          characterModel.position.set(spawnX, characterYPosition, spawnZ);
          if (idleCharacterModel) {
            idleCharacterModel.position.set(spawnX, characterYPosition, spawnZ);
            idleCharacterModel.visible = false;
          }

          characterModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          if (idleCharacterModel) {
            idleCharacterModel.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
          }

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

            characterWalkAction = walkClip
              ? characterMixer.clipAction(walkClip)
              : null;
            if (idleCharacterModel && idleClipFromIdleModel) {
              idleCharacterMixer = new THREE.AnimationMixer(idleCharacterModel);
              idleCharacterAction = idleCharacterMixer.clipAction(
                idleClipFromIdleModel,
              );
            } else {
              const idleClipFromWalkModel =
                findClipByName(/idle|stand|wait|pose|breath|rest/i) ??
                clips.find((clip) => clip !== walkClip) ??
                null;
              idleCharacterAction = idleClipFromWalkModel
                ? characterMixer.clipAction(idleClipFromWalkModel)
                : null;
            }

            if (characterWalkAction) {
              characterWalkAction.loop = THREE.LoopRepeat;
              characterWalkAction.play();
              characterWalkAction.paused = true;
              characterWalkAction.enabled = true;
              characterWalkAction.setEffectiveWeight(1);
            }
            if (idleCharacterAction) {
              idleCharacterAction.loop = THREE.LoopRepeat;
              idleCharacterAction.play();
              idleCharacterAction.paused = false;
              idleCharacterAction.enabled = true;
              idleCharacterAction.setEffectiveWeight(1);
            }
            // 초기 상태는 정지(idle)로 시작.
            if (idleCharacterModel) {
              characterModel.visible = false;
              idleCharacterModel.visible = true;
            }
            if (characterWalkAction) characterWalkAction.paused = true;
            if (idleCharacterAction) idleCharacterAction.paused = false;
          } else {
            console.warn("⚠️ 캐릭터 모델에 애니메이션 클립이 없습니다.");
          }

          scene.add(characterModel);
          if (idleCharacterModel) scene.add(idleCharacterModel);

          // Punch 모델: walk/idle과 별도 GLB. 엔터키 타격 시 전체 스왑 재생.
          if (punchGltf) {
            punchCharacterModel = SkeletonUtils.clone(punchGltf.scene);
            punchCharacterModel.scale.setScalar(scale);
            punchCharacterModel.position.set(
              spawnX,
              characterYPosition,
              spawnZ,
            );
            punchCharacterModel.visible = false;
            punchCharacterModel.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            if (punchGltf.animations && punchGltf.animations.length > 0) {
              punchMixer = new THREE.AnimationMixer(punchCharacterModel);
              const punchClip = punchGltf.animations[0];
              punchAction = punchMixer.clipAction(punchClip);
              punchAction.loop = THREE.LoopOnce;
              punchAction.clampWhenFinished = true;
              punchMixer.addEventListener("finished", () => {
                isPunchPlaying = false;
                if (punchCharacterModel) punchCharacterModel.visible = false;
                // walk/idle 복귀 — 현재 isWalking 상태에 맞춰 둘 중 하나만 show
                if (isWalking) {
                  if (characterModel) characterModel.visible = true;
                  if (idleCharacterModel) idleCharacterModel.visible = false;
                } else if (idleCharacterModel) {
                  if (characterModel) characterModel.visible = false;
                  idleCharacterModel.visible = true;
                } else if (characterModel) {
                  characterModel.visible = true;
                }
              });
            }
            scene.add(punchCharacterModel);
          }

          const prewarmCamera = getCamera?.();
          if (renderer && prewarmCamera) {
            if (typeof renderer.compileAsync === "function") {
              void renderer.compileAsync(scene, prewarmCamera).catch(() => {});
            } else {
              renderer.compile(scene, prewarmCamera);
            }
          }
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

      // punch 애니메이션 중: 입력 무시하고 punchMixer만 업데이트. 카메라 추적은 유지.
      if (isPunchPlaying) {
        if (punchMixer) punchMixer.update(delta);
        syncWalkSound(false);
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
        return;
      }

      const keys = getKeys();
      _moveVector.set(0, 0, 0);

      if (keys.ArrowUp || keys.w || keys.W || keys.KeyW) _moveVector.z -= 1;
      if (keys.ArrowDown || keys.s || keys.S || keys.KeyS) _moveVector.z += 1;
      if (keys.ArrowLeft || keys.a || keys.A || keys.KeyA) _moveVector.x -= 1;
      if (keys.ArrowRight || keys.d || keys.D || keys.KeyD) _moveVector.x += 1;

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
        // 이동 상태가 바뀔 때만 walk/idle 토글을 수행한다.
        if (isWalking !== movingInput) {
          if (movingInput) {
            characterModel.visible = true;
            if (idleCharacterModel) idleCharacterModel.visible = false;
            characterWalkAction.paused = false;
            if (idleCharacterAction) idleCharacterAction.paused = true;
          } else {
            if (idleCharacterModel) {
              characterModel.visible = false;
              idleCharacterModel.visible = true;
            } else {
              characterModel.visible = true;
            }
            characterWalkAction.paused = true;
            if (idleCharacterAction) idleCharacterAction.paused = false;
          }
          isWalking = movingInput;
        }
      }
      if (!movingInput && idleCharacterModel && characterModel) {
        idleCharacterModel.position.copy(characterModel.position);
        idleCharacterModel.rotation.copy(characterModel.rotation);
      }

      if (characterMixer && (isWalking || !idleCharacterMixer)) {
        characterMixer.update(delta);
      }
      if (idleCharacterMixer && !isWalking) {
        idleCharacterMixer.update(delta);
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
      if (punchMixer) {
        punchMixer.stopAllAction();
        punchMixer = null;
      }
      if (punchCharacterModel) {
        scene.remove(punchCharacterModel);
        punchCharacterModel = null;
      }
      punchAction = null;
      isPunchPlaying = false;
      if (walkAudio) {
        walkAudio.pause();
        walkAudio.src = "";
        walkAudio = null;
      }
      if (characterModel) {
        scene.remove(characterModel);
        characterModel = null;
      }
      if (idleCharacterModel) {
        scene.remove(idleCharacterModel);
        idleCharacterModel = null;
      }
      if (characterMixer) {
        characterMixer.stopAllAction();
        characterMixer = null;
      }
      if (idleCharacterMixer) {
        idleCharacterMixer.stopAllAction();
        idleCharacterMixer = null;
      }
      characterWalkAction = null;
      idleCharacterAction = null;
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
      if (!punchCharacterModel || !punchAction || isPunchPlaying) return;
      // 현재 보이는 모델(walk 또는 idle)의 포즈를 punch에 복사
      const src = idleCharacterModel?.visible
        ? idleCharacterModel
        : characterModel;
      if (!src) return;
      punchCharacterModel.position.copy(src.position);
      punchCharacterModel.rotation.copy(src.rotation);
      // walk/idle 숨기고 punch만 보이게
      if (characterModel) characterModel.visible = false;
      if (idleCharacterModel) idleCharacterModel.visible = false;
      punchCharacterModel.visible = true;
      // 애니메이션 리셋 후 1회 재생
      punchAction.reset();
      punchAction.enabled = true;
      punchAction.paused = false;
      punchAction.play();
      isPunchPlaying = true;
    },

    isPunching() {
      return isPunchPlaying;
    },
  };
}
