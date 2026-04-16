import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";

/** @type {HTMLAudioElement | null} */
let noticePaperAudio = null;

/**
 * `paperSoundPaths` 중 하나를 골라 재생 (게시판·포스터 UI 공용).
 * 볼륨은 `STAGE3_OBJECTS_CONFIG.notice.paperSoundVolume`(0~1) 사용.
 * @param {string[] | undefined} paperSoundPaths
 */
export function playRandomNoticePaperSound(paperSoundPaths) {
  const paths = paperSoundPaths ?? [];
  if (paths.length === 0) return;
  const path = paths[Math.floor(Math.random() * paths.length)];
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const src = base + path;
  if (!noticePaperAudio) {
    noticePaperAudio = new window.Audio();
  }
  const v = Number(STAGE3_OBJECTS_CONFIG.notice?.paperSoundVolume ?? 0.78);
  noticePaperAudio.volume = Math.min(1, Math.max(0, v));
  noticePaperAudio.pause();
  noticePaperAudio.currentTime = 0;
  noticePaperAudio.src = src;
  noticePaperAudio.play().catch(() => {});
}

export function disposeNoticePaperAudio() {
  if (noticePaperAudio) {
    noticePaperAudio.pause();
    noticePaperAudio.src = "";
    noticePaperAudio = null;
  }
}
