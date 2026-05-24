import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";
import { applyExtendedAudioVolume } from "../../common/audioGain.js";

const UI_CLICK_PATH = "/static/sounds/click.mp3";
/** @type {HTMLAudioElement | null} */
let uiClickAudio = null;

/** Stage3 모달 등 UI 닫기/확인용 클릭 효과음 */
export function playUiClickSound(requestedVolume = 1) {
  try {
    if (!uiClickAudio) {
      uiClickAudio = new window.Audio();
      uiClickAudio.preload = "auto";
      uiClickAudio.src = resolvePublicAssetUrl(UI_CLICK_PATH);
    }
    uiClickAudio.currentTime = 0;
    applyExtendedAudioVolume(uiClickAudio, requestedVolume);
    uiClickAudio.play().catch(() => {});
  } catch {
    // ignore
  }
}
