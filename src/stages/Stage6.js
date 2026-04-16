/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";
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
const INT_PREFIX = "INT_";

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
  const intRaycastMeshes = [];
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let canvasRef = null;
  let cameraRef = null;
  let onPointerDown = null;
  let onPointerMove = null;
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

  function registerIntInteractions(rootModel) {
    intRaycastMeshes.length = 0;
    /** @type {Set<THREE.Mesh>} */
    const meshSet = new Set();
    rootModel.traverse((obj) => {
      if (typeof obj.name !== "string" || !obj.name.startsWith(INT_PREFIX))
        return;
      obj.traverse((child) => {
        if (child?.isMesh) meshSet.add(child);
      });
    });
    intRaycastMeshes.push(...meshSet);
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
        if (typeof p.name === "string" && p.name.startsWith(INT_PREFIX)) {
          const suffix = p.name.slice(INT_PREFIX.length);
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
      window.addEventListener("keydown", handleKeyDown, { capture: true });
      onPointerDown = (event) => {
        if (event.button !== 0) return;
        const hit = getPointerHitTarget(event);
        if (!hit) return;
        console.log(`[Stage6] INT click: ${hit.intName}`);
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

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;

          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );
          model.updateMatrixWorld(true);

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
            }
          });

          objects.push(model);
          scene.add(model);
          registerIntInteractions(model);
        },
        onError: (err) => console.error("❌ Stage6 배경 로드 에러:", err),
      });

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

    update(_delta) {},

    cleanup(scene) {
      cancelAirplaneCallSignScheduled();
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.dispatchEvent(new CustomEvent(STAGE6_POSTER_MODAL_HIDE_EVENT));
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
