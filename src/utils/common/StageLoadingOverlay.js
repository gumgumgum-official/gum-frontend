/**
 * 스테이지 전환 시 풀스크린 로딩 비디오 오버레이
 * - show(): 오버레이 표시 후 비디오 재생, 재생 종료 시 자동 hide
 * - hide(): 오버레이 제거
 * 비디오 경로는 옵션으로 주며, appConfig 등 한 곳에서만 관리하면 유지보수 용이
 */

/**
 * @param {{ videoSrc: string }} options
 * @returns {{ show: () => void, hide: () => void }}
 */
export function createStageLoadingOverlay(options = {}) {
  const videoSrc = options.videoSrc ?? "/static/loading.mp4";

  let overlayEl = null;
  let videoEl = null;
  let endedListener = null;

  function hide() {
    if (!overlayEl) return;
    if (videoEl && endedListener) {
      videoEl.removeEventListener("ended", endedListener);
      endedListener = null;
    }
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
    }
    if (overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
    videoEl = null;
  }

  function show() {
    hide();

    overlayEl = document.createElement("div");
    overlayEl.setAttribute("aria-hidden", "true");
    overlayEl.setAttribute("data-stage-loading-overlay", "true");
    Object.assign(overlayEl.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9999",
      margin: "0",
      padding: "0",
      overflow: "hidden",
    });

    videoEl = document.createElement("video");
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("muted", "");
    videoEl.setAttribute("autoplay", "");
    videoEl.src = videoSrc;
    Object.assign(videoEl.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: "scale(1.1)",
      transformOrigin: "center center",
    });

    endedListener = () => hide();
    videoEl.addEventListener("ended", endedListener);
    videoEl.addEventListener("error", () => hide());

    overlayEl.appendChild(videoEl);
    document.body.appendChild(overlayEl);

    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => hide());
    }
  }

  return { show, hide };
}
