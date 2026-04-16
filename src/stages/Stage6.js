/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../utils/common/gltfTemplateCache.js";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";
import {
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES,
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC,
} from "../config/stages/stage6AirportAnnouncement.js";

const AIRPORT_SUBTITLE_SHOW_EVENT = "gum:airportAnnouncementSubtitle:show";
const AIRPORT_SUBTITLE_UPDATE_EVENT = "gum:airportAnnouncementSubtitle:update";
const AIRPORT_SUBTITLE_HIDE_EVENT = "gum:airportAnnouncementSubtitle:hide";
const AIRPORT_CHIME_SHOW_EVENT = "gum:airportAnnouncementChime:show";
const AIRPORT_CHIME_HIDE_EVENT = "gum:airportAnnouncementChime:hide";
const STAGE6_FINISH_EVENT = "gum:kiosk-finish";
const STAGE6_INT_CLICK_EVENT = "gum:stage6-int-click";
const STAGE6_POSTER_MODAL_SHOW_EVENT = "gum:stage6PosterModal:show";
const STAGE6_POSTER_MODAL_HIDE_EVENT = "gum:stage6PosterModal:hide";
const STAGE6_SUBTITLE_SEQUENCE_EVENT = "gum:stage6-subtitle:sequence";
const STAGE6_NAME_MODAL_SHOW_EVENT = "gum:stage6-name-modal:show";
const STAGE6_BOARDING_RESET_EVENT = "gum:stage6-boarding:reset";
const INT_PREFIX = "INT_";
const EXTRA_CLICKABLE_OBJECT_NAMES = new Set(["OBJ_ATM"]);
const ATM_OBJECT_NAME = "OBJ_ATM";
const ATM_INTERACTION_REQUIRED_COUNT = 2;
const ATM_EMISSIVE_DARK_STRENGTH = 0.06;
const ATM_EMISSIVE_BRIGHT_STRENGTH = 1.25;
const ATM_EMISSIVE_TWEEN_SPEED = 3.5;

export function Stage6() {
  const objects = [];
  /** @type {import("../types.js").StageBasicConfig & { model: import("../types.js").Stage2ModelConfig, boardPosterImage?: string, bench?: import("../types.js").Stage3PropConfig, curtain?: { path: string, position?: { x?: number, y?: number, z?: number }, rotation?: { x?: number, y?: number, z?: number }, scale?: number, castShadow?: boolean, receiveShadow?: boolean } }} */
  const config = STAGE6_CONFIG;
  const airportSubtitleLeadSec =
    Number(STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC ?? 0.75) || 0;
  const airportAnnouncementSubtitleCues = Array.isArray(
    STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES,
  )
    ? STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES
    : [];
  const glbLoader = getGLBLoader();
  const fbxLoader = new FBXLoader();
  const userAgent =
    typeof window !== "undefined" && window.navigator
      ? window.navigator.userAgent
      : "";
  const isElectronLike = /Electron|Cursor/i.test(userAgent);
  const stage6ModelUrl = resolvePublicAssetUrl(config.model.path);
  // Stage6 진입 직전에 디코더/파서를 워밍업해서 첫 표시 지연을 줄인다.
  void loadGltfTemplateCached(stage6ModelUrl).catch(() => {});
  let isStage6Active = true;
  const intRaycastMeshes = [];
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let canvasRef = null;
  let cameraRef = null;
  let onPointerDown = null;
  let onPointerMove = null;
  let interactedCount = 0;
  const interactedTargets = new Set();
  let isAtmActivated = false;
  /** @type {THREE.Object3D | null} */
  let atmRootRef = null;
  /** @type {Array<THREE.Material & { emissive?: THREE.Color, emissiveIntensity?: number, userData?: Record<string, any> }>} */
  const atmEmissiveMaterials = [];
  let atmEmissiveProgress = 0;
  let atmEmissiveTarget = 0;
  let airplaneCallSignTimeoutId = 0;
  let airportAnnounceIntroTimeoutId = 0;
  /** @type {HTMLAudioElement | null} */
  let airplaneCallSignAudio = null;
  /** @type {HTMLAudioElement | null} */
  let airportAnnounceIntroAudio = null;
  let isAirportChimeVisible = false;

  const AIRPLANE_CALL_SIGN_DELAY_MS = 1500;
  const AIRPLANE_CALL_SIGN_VOLUME = 0.55;
  /** 칠 사인 오디오 재생 후 chime 아이콘을 표시하기 시작할 시간(초) */
  const CHIME_INDICATOR_TRIGGER_TIME_SEC = 0.58;
  const AIRPORT_ANNOUNCE_INTRO_DELAY_AFTER_CALL_SIGN_MS = 100;
  const AIRPORT_ANNOUNCE_INTRO_VOLUME = 0.55;
  let activeSubtitleCueIndex = -1;
  let isAirportSubtitleVisible = false;

  function dispatchAirportSubtitleTextByTime(currentSec) {
    const syncedSec = Math.max(0, currentSec + airportSubtitleLeadSec);
    const nextIdx = airportAnnouncementSubtitleCues.findIndex(
      (cue) => syncedSec >= cue.startSec && syncedSec < cue.endSec,
    );
    if (nextIdx < 0) {
      activeSubtitleCueIndex = -1;
      if (isAirportSubtitleVisible) {
        window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
        isAirportSubtitleVisible = false;
      }
      return;
    }

    if (nextIdx === activeSubtitleCueIndex && isAirportSubtitleVisible) return;
    activeSubtitleCueIndex = nextIdx;
    const text = airportAnnouncementSubtitleCues[nextIdx].text;
    if (!isAirportSubtitleVisible) {
      window.dispatchEvent(
        new CustomEvent(AIRPORT_SUBTITLE_SHOW_EVENT, { detail: { text } }),
      );
      isAirportSubtitleVisible = true;
      return;
    }
    window.dispatchEvent(
      new CustomEvent(AIRPORT_SUBTITLE_UPDATE_EVENT, { detail: { text } }),
    );
  }

  function cancelAirplaneCallSignScheduled() {
    if (airplaneCallSignTimeoutId) {
      window.clearTimeout(airplaneCallSignTimeoutId);
      airplaneCallSignTimeoutId = 0;
    }
    if (airportAnnounceIntroTimeoutId) {
      window.clearTimeout(airportAnnounceIntroTimeoutId);
      airportAnnounceIntroTimeoutId = 0;
    }
    if (airplaneCallSignAudio) {
      airplaneCallSignAudio.onplay = null;
      airplaneCallSignAudio.ontimeupdate = null;
      airplaneCallSignAudio.onended = null;
      airplaneCallSignAudio.pause();
      airplaneCallSignAudio.currentTime = 0;
      airplaneCallSignAudio.src = "";
      airplaneCallSignAudio = null;
    }
    if (isAirportChimeVisible) {
      window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
      isAirportChimeVisible = false;
    }
    if (airportAnnounceIntroAudio) {
      airportAnnounceIntroAudio.onplay = null;
      airportAnnounceIntroAudio.ontimeupdate = null;
      airportAnnounceIntroAudio.onended = null;
      airportAnnounceIntroAudio.pause();
      airportAnnounceIntroAudio.currentTime = 0;
      airportAnnounceIntroAudio.src = "";
      airportAnnounceIntroAudio = null;
    }
    activeSubtitleCueIndex = -1;
    isAirportSubtitleVisible = false;
    window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
  }

  function playAirportAnnounceIntro() {
    if (!airportAnnounceIntroAudio) {
      airportAnnounceIntroAudio = new window.Audio();
      airportAnnounceIntroAudio.preload = "auto";
      airportAnnounceIntroAudio.src = resolvePublicAssetUrl(
        "/static/sounds/airport/airport_announce_intro.mp3",
      );
    }
    airportAnnounceIntroAudio.volume = AIRPORT_ANNOUNCE_INTRO_VOLUME;
    airportAnnounceIntroAudio.currentTime = 0;
    airportAnnounceIntroAudio.onplay = () => {
      activeSubtitleCueIndex = -1;
      isAirportSubtitleVisible = false;
      dispatchAirportSubtitleTextByTime(0);
    };
    airportAnnounceIntroAudio.ontimeupdate = () => {
      dispatchAirportSubtitleTextByTime(
        Number(airportAnnounceIntroAudio?.currentTime ?? 0),
      );
    };
    airportAnnounceIntroAudio.onended = () => {
      activeSubtitleCueIndex = -1;
      isAirportSubtitleVisible = false;
      window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
    };
    airportAnnounceIntroAudio.play().catch(() => {});
  }

  function scheduleAirplaneCallSign() {
    cancelAirplaneCallSignScheduled();
    airplaneCallSignTimeoutId = window.setTimeout(() => {
      airplaneCallSignTimeoutId = 0;
      if (!airplaneCallSignAudio) {
        airplaneCallSignAudio = new window.Audio();
        airplaneCallSignAudio.preload = "auto";
        airplaneCallSignAudio.src = resolvePublicAssetUrl(
          "/static/sounds/airport/airplane_call_sign.mp3",
        );
      }
      airplaneCallSignAudio.volume = AIRPLANE_CALL_SIGN_VOLUME;
      airplaneCallSignAudio.currentTime = 0;
      isAirportChimeVisible = false;
      airplaneCallSignAudio.onplay = null;
      airplaneCallSignAudio.ontimeupdate = () => {
        if (isAirportChimeVisible) return;
        if (
          Number(airplaneCallSignAudio?.currentTime ?? 0) <
          CHIME_INDICATOR_TRIGGER_TIME_SEC
        ) {
          return;
        }
        window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_SHOW_EVENT));
        isAirportChimeVisible = true;
      };
      airplaneCallSignAudio.onended = () => {
        if (isAirportChimeVisible) {
          window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
          isAirportChimeVisible = false;
        }
        airportAnnounceIntroTimeoutId = window.setTimeout(() => {
          airportAnnounceIntroTimeoutId = 0;
          playAirportAnnounceIntro();
        }, AIRPORT_ANNOUNCE_INTRO_DELAY_AFTER_CALL_SIGN_MS);
      };
      airplaneCallSignAudio.play().catch(() => {});
    }, AIRPLANE_CALL_SIGN_DELAY_MS);
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(STAGE6_FINISH_EVENT));
    }
  };

  function normalizeIntNameToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isAtmHitTarget(hit) {
    return (
      hit?.intName === ATM_OBJECT_NAME ||
      normalizeIntNameToken(hit?.target) ===
        normalizeIntNameToken(ATM_OBJECT_NAME)
    );
  }

  function dispatchStage6SubtitleSequence(messages) {
    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
        detail: { messages },
      }),
    );
  }

  function collectAtmInteractiveRoot(rootModel) {
    atmRootRef = null;
    rootModel.traverse((obj) => {
      if (atmRootRef || obj?.name !== ATM_OBJECT_NAME) return;
      atmRootRef = obj;
    });
  }

  function registerAtmEmissiveMaterials() {
    atmEmissiveMaterials.length = 0;
    if (!atmRootRef) return;
    atmRootRef.traverse((child) => {
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (!mesh?.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((rawMaterial) => {
        const material = /** @type {typeof atmEmissiveMaterials[number]} */ (
          rawMaterial
        );
        if (!material?.emissive) return;
        const hasVisibleEmissive = material.emissive.getHex() !== 0x000000;
        material.userData = material.userData ?? {};
        if (!material.userData.stage6AtmBaseEmissive) {
          material.userData.stage6AtmBaseEmissive = hasVisibleEmissive
            ? material.emissive.clone()
            : new THREE.Color(0x7fd6ff);
        }
        atmEmissiveMaterials.push(material);
      });
    });
  }

  function applyAtmEmissive(progress) {
    const strength = THREE.MathUtils.lerp(
      ATM_EMISSIVE_DARK_STRENGTH,
      ATM_EMISSIVE_BRIGHT_STRENGTH,
      progress,
    );
    atmEmissiveMaterials.forEach((material) => {
      const baseColor = material.userData?.stage6AtmBaseEmissive;
      if (!baseColor || !material.emissive) return;
      material.emissive.copy(baseColor).multiplyScalar(strength);
      if (typeof material.emissiveIntensity === "number") {
        material.emissiveIntensity = 1;
      }
      material.needsUpdate = true;
    });
  }

  function activateAtmKiosk() {
    if (isAtmActivated) return;
    isAtmActivated = true;
    atmEmissiveTarget = 1;
    dispatchStage6SubtitleSequence([
      {
        text: "탑승 수속이 시작되었습니다.",
        holdMs: 2000,
      },
      {
        text: "키오스크에서 체크인을 완료해주세요.",
        holdMs: 2000,
      },
    ]);
  }

  function registerNonAtmInteraction(hit) {
    if (!hit || isAtmHitTarget(hit) || isAtmActivated) return;
    const interactionKey = hit.intName || hit.target;
    if (!interactionKey || interactedTargets.has(interactionKey)) return;
    interactedTargets.add(interactionKey);
    interactedCount = interactedTargets.size;
    if (interactedCount >= ATM_INTERACTION_REQUIRED_COUNT) {
      activateAtmKiosk();
    }
  }

  /**
   * 템플릿 씬과 분리된 인스턴스 (cleanup 시 dispose 안전)
   * @param {import("three").Object3D} source
   */
  function cloneStage6ModelInstance(source) {
    const root = source.clone(true);
    root.traverse((obj) => {
      const mesh = /** @type {any} */ (obj);
      if (!mesh.isMesh) return;
      if (mesh.geometry) mesh.geometry = mesh.geometry.clone();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mesh.material = mat.map((m) => (m?.clone ? m.clone() : m));
      } else if (mat?.clone) {
        mesh.material = mat.clone();
      }

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        // 외부 Chrome에서는 transmission 유리를 유지하고,
        // Cursor/Electron 웹뷰에서만 fallback glass로 치환한다.
        if (
          isElectronLike &&
          typeof material.transmission === "number" &&
          material.transmission > 0
        ) {
          const originalOpacity =
            typeof material.opacity === "number" ? material.opacity : 1;
          material.transmission = 0;
          material.transparent = true;
          material.opacity = Math.min(originalOpacity, 0.42);
          if (typeof material.roughness === "number") {
            material.roughness = Math.max(material.roughness, 0.08);
          }
          if (typeof material.metalness === "number") {
            material.metalness = Math.min(material.metalness, 0.05);
          }
          if (typeof material.envMapIntensity === "number") {
            material.envMapIntensity = Math.max(material.envMapIntensity, 1.15);
          }
          if ("depthWrite" in material) {
            material.depthWrite = false;
          }
          material.needsUpdate = true;
        }
      }
    });
    return root;
  }

  function registerIntInteractions(rootModel) {
    intRaycastMeshes.length = 0;
    collectAtmInteractiveRoot(rootModel);
    /** @type {Set<THREE.Mesh>} */
    const meshSet = new Set();
    rootModel.traverse((obj) => {
      if (typeof obj.name !== "string") return;
      if (
        !obj.name.startsWith(INT_PREFIX) &&
        !EXTRA_CLICKABLE_OBJECT_NAMES.has(obj.name)
      ) {
        return;
      }
      obj.traverse((child) => {
        if (child?.isMesh) meshSet.add(child);
      });
    });
    intRaycastMeshes.push(...meshSet);
    registerAtmEmissiveMaterials();
    applyAtmEmissive(atmEmissiveProgress);
    if (import.meta.env.DEV) {
      console.log(
        `[Stage6] INT_ clickable mesh count: ${intRaycastMeshes.length}`,
      );
    }
  }

  function getPointerHitTarget(event) {
    if (!canvasRef || !cameraRef || intRaycastMeshes.length === 0) return null;
    const rect = canvasRef.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, cameraRef);
    const hits = raycaster.intersectObjects(intRaycastMeshes, false);
    for (const hit of hits) {
      let p = hit.object;
      while (p) {
        if (
          typeof p.name === "string" &&
          (p.name.startsWith(INT_PREFIX) ||
            EXTRA_CLICKABLE_OBJECT_NAMES.has(p.name))
        ) {
          const suffix = p.name.startsWith(INT_PREFIX)
            ? p.name.slice(INT_PREFIX.length)
            : p.name;
          return {
            intName: p.name,
            target: normalizeIntNameToken(suffix),
          };
        }
        p = p.parent;
      }
    }
    return null;
  }

  return {
    camera: null,

    setup(scene, renderer) {
      isStage6Active = true;
      const canvas = renderer.domElement;
      canvasRef = canvas;
      this.camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far,
      );
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z,
      );
      if (config.camera.lookAt) {
        this.camera.lookAt(
          config.camera.lookAt.x,
          config.camera.lookAt.y,
          config.camera.lookAt.z,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }
      cameraRef = this.camera;

      scene.background = new THREE.Color(config.background.color);
      interactedCount = 0;
      interactedTargets.clear();
      isAtmActivated = false;
      atmEmissiveTarget = 0;
      atmEmissiveProgress = 0;
      atmRootRef = null;
      atmEmissiveMaterials.length = 0;
      window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_RESET_EVENT));
      window.addEventListener("keydown", handleKeyDown, { capture: true });
      onPointerDown = (event) => {
        if (event.button !== 0) return;
        const hit = getPointerHitTarget(event);
        if (!hit) return;
        console.log(`[Stage6] INT click: ${hit.intName}`);
        const isAtmHit = isAtmHitTarget(hit);
        if (isAtmHit) {
          if (!isAtmActivated) {
            dispatchStage6SubtitleSequence([
              {
                text: "아직 탑승 수속이 시작되지 않았어요. 잠시 둘러보세요 🙂",
                holdMs: 2200,
              },
            ]);
          } else {
            window.dispatchEvent(new CustomEvent(STAGE6_NAME_MODAL_SHOW_EVENT));
          }
        } else {
          registerNonAtmInteraction(hit);
        }
        if (hit.target === "boardpic" || hit.target === "poster") {
          window.dispatchEvent(
            new CustomEvent(STAGE6_POSTER_MODAL_SHOW_EVENT, {
              detail: {
                imageSrc:
                  config.boardPosterImage ?? "/assets/poster/stamp_poster.png",
                intName: hit.intName,
              },
            }),
          );
        }
        window.dispatchEvent(
          new CustomEvent(STAGE6_INT_CLICK_EVENT, {
            detail: hit,
          }),
        );
      };
      canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
      onPointerMove = (event) => {
        const hit = getPointerHitTarget(event);
        canvas.style.cursor = hit ? "pointer" : "default";
      };
      canvas.addEventListener("pointermove", onPointerMove);

      // 배경 GLB 로드: 템플릿 캐시 + 인스턴스 클론
      void loadGltfTemplateCached(stage6ModelUrl)
        .then((gltf) => {
          if (!isStage6Active) return;
          const model = cloneStage6ModelInstance(gltf.scene);
          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );
          model.updateMatrixWorld(true);

          model.traverse((child) => {
            const mesh = /** @type {any} */ (child);
            if (mesh.isMesh) {
              if (config.model.castShadow !== undefined) {
                mesh.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                mesh.receiveShadow = config.model.receiveShadow;
              }
            }
          });

          objects.push(model);
          scene.add(model);
          registerIntInteractions(model);
        })
        .catch((err) =>
          console.error(
            `❌ Stage6 배경 로드 에러 (${config.model.path}):`,
            err,
          ),
        );

      // 벤치 로드 (config.bench 있을 때)
      const benchConfig = config.bench;
      if (benchConfig) {
        glbLoader.load(benchConfig.path, {
          onLoad: (gltf) => {
            const model = gltf.scene;
            model.position.set(
              benchConfig.position?.x ?? 0,
              benchConfig.position?.y ?? 0,
              benchConfig.position?.z ?? 0,
            );
            model.rotation.set(
              ((benchConfig.rotation?.x ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.y ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.z ?? 0) * Math.PI) / 180,
            );
            model.scale.setScalar(benchConfig.scale ?? 1);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            scene.add(model);
          },
          onError: (err) =>
            console.warn("❌ Stage6 bench 로드 실패:", benchConfig.path, err),
        });
      }

      // 커튼 FBX 로드
      const curtainConfig = config.curtain;
      if (curtainConfig?.path) {
        fbxLoader.load(
          curtainConfig.path,
          (object) => {
            object.position.set(
              curtainConfig.position?.x ?? 0,
              curtainConfig.position?.y ?? 0,
              curtainConfig.position?.z ?? 0,
            );
            object.rotation.set(
              ((curtainConfig.rotation?.x ?? 0) * Math.PI) / 180,
              ((curtainConfig.rotation?.y ?? 0) * Math.PI) / 180,
              ((curtainConfig.rotation?.z ?? 0) * Math.PI) / 180,
            );
            object.scale.setScalar(curtainConfig.scale ?? 1);

            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (curtainConfig.castShadow !== undefined) {
                  child.castShadow = curtainConfig.castShadow;
                }
                if (curtainConfig.receiveShadow !== undefined) {
                  child.receiveShadow = curtainConfig.receiveShadow;
                }
              }
            });

            objects.push(object);
            scene.add(object);
          },
          undefined,
          (err) => {
            console.error("❌ Stage6 커튼 로드 에러:", err);
          },
        );
      }

      scheduleAirplaneCallSign();
    },

    update(delta) {
      atmEmissiveProgress = THREE.MathUtils.damp(
        atmEmissiveProgress,
        atmEmissiveTarget,
        ATM_EMISSIVE_TWEEN_SPEED,
        delta,
      );
      if (atmEmissiveMaterials.length > 0) {
        applyAtmEmissive(atmEmissiveProgress);
      }
    },

    cleanup(scene) {
      isStage6Active = false;
      cancelAirplaneCallSignScheduled();
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.dispatchEvent(new CustomEvent(STAGE6_POSTER_MODAL_HIDE_EVENT));
      window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_RESET_EVENT));
      if (canvasRef && onPointerDown) {
        canvasRef.removeEventListener("pointerdown", onPointerDown, {
          capture: true,
        });
      }
      if (canvasRef && onPointerMove) {
        canvasRef.removeEventListener("pointermove", onPointerMove);
        canvasRef.style.cursor = "default";
      }
      canvasRef = null;
      cameraRef = null;
      onPointerDown = null;
      onPointerMove = null;
      interactedCount = 0;
      interactedTargets.clear();
      isAtmActivated = false;
      atmRootRef = null;
      atmEmissiveMaterials.length = 0;
      atmEmissiveProgress = 0;
      atmEmissiveTarget = 0;
      intRaycastMeshes.length = 0;
      objects.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
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
      objects.length = 0;
      scene.background = null;
    },
  };
}
