import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import { applyExtendedAudioVolume } from "./audioGain.js";

const UI_CLICK_PATH = "/static/sounds/click.mp3";

/** Stage3 모달 등 UI 닫기/확인용 클릭 효과음 */
export function playUiClickSound() {
  try {
    const audio = new window.Audio();
    audio.preload = "auto";
    audio.src = resolvePublicAssetUrl(UI_CLICK_PATH);
    applyExtendedAudioVolume(audio, 1);
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}
