import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";
import { applyStage6AudioVolume } from "../../../config/stages/stage6/stage6Audio.js";

const CAMERA_SOUND_PATH = "/static/sounds/airport/camera_sound.m4a";
const CAMERA_SOUND_VOLUME = 0.85;

/** @type {HTMLAudioElement | null} */
let cameraSoundAudio = null;

/** 포토부스 세컷 사진 reveal 타이밍용 셔터 효과음 */
export function playPhotoboothCameraSound() {
  try {
    if (!cameraSoundAudio) {
      cameraSoundAudio = new window.Audio();
      cameraSoundAudio.preload = "auto";
      cameraSoundAudio.src = resolvePublicAssetUrl(CAMERA_SOUND_PATH);
    }
    cameraSoundAudio.pause();
    cameraSoundAudio.currentTime = 0;
    applyStage6AudioVolume(cameraSoundAudio, CAMERA_SOUND_VOLUME);
    const p = cameraSoundAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // ignore
  }
}

export function disposePhotoboothCameraSound() {
  if (!cameraSoundAudio) return;
  cameraSoundAudio.pause();
  cameraSoundAudio.src = "";
  cameraSoundAudio = null;
}
