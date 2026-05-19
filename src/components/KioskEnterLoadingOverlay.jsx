import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "../pages/Page.module.css";

const LOADING_VIDEO_SRC = "/assets/loading_animation.mp4";

/**
 * /start → /kiosk 진입 전 로딩 영상 (검정 배경, 중앙 소형 재생)
 * @param {{ active: boolean, onEnded: () => void }} props
 */
export function KioskEnterLoadingOverlay({ active, onEnded }) {
  const videoRef = useRef(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const fireEnded = useCallback(() => {
    onEndedRef.current?.();
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;
    let didNotifyEnd = false;

    const notifyEnd = () => {
      if (cancelled || didNotifyEnd) return;
      didNotifyEnd = true;
      fireEnded();
    };

    const handleEnded = () => notifyEnd();
    const handleError = () => notifyEnd();

    const startPlayback = () => {
      if (cancelled) return;
      if (video.src !== LOADING_VIDEO_SRC) {
        video.src = LOADING_VIDEO_SRC;
      }
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          if (!cancelled) notifyEnd();
        });
      }
    };

    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    if (video.readyState >= 2) {
      startPlayback();
    } else {
      video.addEventListener("loadeddata", startPlayback, { once: true });
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", startPlayback);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      video.pause();
    };
  }, [active, fireEnded]);

  if (!active) return null;

  return createPortal(
    <div className={styles.kioskEnterLoading} aria-hidden="true">
      <video
        ref={videoRef}
        className={styles.kioskEnterLoadingVideo}
        src={LOADING_VIDEO_SRC}
        playsInline
        muted
        preload="auto"
      />
    </div>,
    document.body,
  );
}
