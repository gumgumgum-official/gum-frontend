import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "../pages/Page.module.css";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";
import { markStage6AudioUnlocked } from "../utils/stages/stage6/stage6AudioUnlock.js";

const LOADING_VIDEO_SRC = "/assets/loading_animation.mp4";
const LOADING_SOUND_SRC = resolvePublicAssetUrl(
  "/static/sounds/loading/airport_loading_sound.m4a",
);

/**
 * /start → /kiosk 진입 전 로딩 영상 (검정 배경, 중앙 재생)
 *
 * `active`가 false이면 포털·비디오를 렌더하지 않고 재생 effect도 돌지 않는다.
 * 부모는 (1) `{flag && <Overlay active />}`처럼 조건부 마운트하거나,
 * (2) 항상 마운트한 뒤 `active={flag}`로 재생만 켜는 방식을 쓸 수 있다.
 * StartPage는 (2)를 사용한다.
 *
 * @param {{ active: boolean, onEnded: () => void }} props
 */
export function KioskEnterLoadingOverlay({ active, onEnded }) {
  const videoRef = useRef(null);
  /** @type {React.MutableRefObject<HTMLAudioElement | null>} */
  const audioRef = useRef(null);
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
    const handleError = (e) => {
      console.warn(
        "[KioskEnterLoadingOverlay] 비디오 재생 오류:",
        e,
        video.error,
        LOADING_VIDEO_SRC,
      );
      notifyEnd();
    };

    const stopLoadingSound = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    };

    const startPlayback = () => {
      if (cancelled) return;
      video.currentTime = 0;
      if (!audioRef.current) {
        const audio = new window.Audio(LOADING_SOUND_SRC);
        audio.preload = "auto";
        audioRef.current = audio;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.onplay = () => markStage6AudioUnlocked();
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => markStage6AudioUnlocked()).catch(() => {});
        }
      }
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
      stopLoadingSound();
    };
  }, [active, fireEnded]);

  if (!active) return null;

  return createPortal(
    <div className={styles.kioskEnterLoading} aria-hidden="true">
      <video
        ref={videoRef}
        className={styles.kioskEnterLoadingVideo}
        playsInline
        muted
        preload="auto"
      >
        <source src={LOADING_VIDEO_SRC} type="video/mp4" />
      </video>
    </div>,
    document.body,
  );
}
