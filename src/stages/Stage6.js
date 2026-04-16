/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";
import { createSpeechBubbleHover } from "../utils/stages/stage6/speechBubbleHover.js";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";
import {
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES,
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC,
} from "../config/stages/stage6AirportAnnouncement.js";

const DEFAULT_CHARACTER_PATH = "/models/common/user_walking2.glb";
const AIRPORT_SUBTITLE_SHOW_EVENT = "gum:airportAnnouncementSubtitle:show";
const AIRPORT_SUBTITLE_UPDATE_EVENT = "gum:airportAnnouncementSubtitle:update";
const AIRPORT_SUBTITLE_HIDE_EVENT = "gum:airportAnnouncementSubtitle:hide";
const AIRPORT_CHIME_SHOW_EVENT = "gum:airportAnnouncementChime:show";
const AIRPORT_CHIME_HIDE_EVENT = "gum:airportAnnouncementChime:hide";
const STAGE6_FINISH_EVENT = "gum:kiosk-finish";

export function Stage6() {
  const objects = [];
  const characterModels = [];
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
  let speechBubbleHover = null;
  let orbitControls = null;
  let airplaneCallSignTimeoutId = 0;
  let airportAnnounceIntroTimeoutId = 0;
  /** @type {HTMLAudioElement | null} */
  let airplaneCallSignAudio = null;
  /** @type {HTMLAudioElement | null} */
  let airportAnnounceIntroAudio = null;
  let isAirportChimeVisible = false;

  const AIRPLANE_CALL_SIGN_DELAY_MS = 1500;
  const AIRPLANE_CALL_SIGN_VOLUME = 0.55;
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
      airportAnnounceIntroAudio.volume = AIRPORT_ANNOUNCE_INTRO_VOLUME;
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
        airplaneCallSignAudio.volume = AIRPLANE_CALL_SIGN_VOLUME;
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
        if (Number(airplaneCallSignAudio?.currentTime ?? 0) < 0.58) return;
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

  return {
    camera: null,

    setup(scene, renderer) {
      const stage = this;
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

      orbitControls = new OrbitControls(this.camera, renderer.domElement);
      orbitControls.target.set(
        config.camera.lookAt?.x ?? 0,
        config.camera.lookAt?.y ?? 0,
        config.camera.lookAt?.z ?? 0,
      );

      scene.background = new THREE.Color(config.background.color);
      window.addEventListener("keydown", handleKeyDown, { capture: true });

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

          console.log("✅ Stage6 배경 로드 완료");
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage6 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage6 배경 로드 에러:", err),
      });

      // 캐릭터 5명 GLB 로드 (config.characters 위치 적용)
      const characterPositions = config.characters ?? [
        { position: { x: 0, y: 0, z: 0 } },
        { position: { x: 1.2, y: 0, z: 0 } },
        { position: { x: 2.4, y: 0, z: 0 } },
        { position: { x: 3.6, y: 0, z: 0 } },
        { position: { x: 4.8, y: 0, z: 0 } },
      ];
      const characterPath = config.characterModelPath ?? DEFAULT_CHARACTER_PATH;
      glbLoader.load(characterPath, {
        onLoad: (gltf) => {
          const source = gltf.scene;
          const scale = config.characterScale ?? 1;
          for (let i = 0; i < 5; i++) {
            const model = i === 0 ? source : SkeletonUtils.clone(source);
            model.scale.setScalar(scale);
            const pos = characterPositions[i]?.position ?? {};
            model.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            const messages = config.speechBubbleMessages ?? [];
            characterModels.push({
              model,
              message: messages[i % messages.length],
            });
            scene.add(model);
          }
          speechBubbleHover = createSpeechBubbleHover({
            camera: stage.camera,
            renderer,
            characterModels,
            options: {
              cheerSoundPath: config.cheerSoundPath,
              bubbleOffsetY: 0.7,
            },
          });
          console.log("✅ Stage6 캐릭터 5명 로드 완료");
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage6 캐릭터: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage6 캐릭터 로드 에러:", err),
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
            console.log("✅ Stage6 bench 로드 완료");
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
            console.log("✅ Stage6 커튼 FBX 로드 완료");
          },
          (xhr) => {
            if (xhr.total > 0) {
              console.log(
                `Stage6 커튼: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
              );
            }
          },
          (err) => {
            console.error("❌ Stage6 커튼 로드 에러:", err);
          },
        );
      }

      scheduleAirplaneCallSign();

      console.log("✅ Stage6 생성 완료");
    },

    update(delta) {
      if (orbitControls) orbitControls.update(delta);
    },

    cleanup(scene) {
      cancelAirplaneCallSignScheduled();
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      if (orbitControls) {
        orbitControls.dispose();
        orbitControls = null;
      }
      if (speechBubbleHover) {
        speechBubbleHover.cleanup();
        speechBubbleHover = null;
      }
      characterModels.length = 0;

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
      console.log("🧹 Stage6 정리 완료");
    },
  };
}
